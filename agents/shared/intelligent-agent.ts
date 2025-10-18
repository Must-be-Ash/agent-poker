import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { createWalletClient, http, publicActions, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { Hex } from 'viem';
import { Anthropic } from '@llamaindex/anthropic';
import { FunctionTool, ReActAgent } from 'llamaindex';
import { z } from 'zod';

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// ERC-20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

interface BidContext {
  basename: string;
  currentBid: number | null;
  timeRemaining: number | null;
  bidHistory: Array<{
    agentId: string;
    amount: number;
    timestamp: string;
  }>;
  myBalance: number;
  lastRefundAmount?: number;
}

interface BidDecision {
  thinking: string;
  proposedAmount: number;
  strategy: string;
  reasoning: string;
  confidence: number;
}

export class IntelligentBiddingAgent {
  private wallet;
  private axiosWithPayment;
  private agentName: string;
  private maxBid: number;
  private serverUrl: string;
  private isActive: boolean = true;
  private publicClient;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private llm;
  private bot;
  private bidHistory: BidContext['bidHistory'] = [];
  private lastRefundAmount?: number;

  constructor(config: {
    privateKey: Hex;
    agentName: string;
    maxBid: number;
    serverUrl: string;
    anthropicApiKey: string;
  }) {
    this.agentName = config.agentName;
    this.maxBid = config.maxBid;
    this.serverUrl = config.serverUrl;

    // Create wallet client
    this.wallet = createWalletClient({
      chain: baseSepolia,
      transport: http(),
      account: privateKeyToAccount(config.privateKey),
    }).extend(publicActions);

    // Create public client for reading balances
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    // Create axios client with x402 payment interceptor
    this.axiosWithPayment = withPaymentInterceptor(
      axios.create({
        headers: { 'X-Agent-ID': this.agentName }
      }),
      this.wallet as any // Type assertion for viem version compatibility
    );

    // Initialize LLM
    this.llm = new Anthropic({
      apiKey: config.anthropicApiKey,
      model: 'claude-3-5-sonnet-20241022',
    });

    // Create agent with tools
    this.bot = this.createAgent();

    console.log(`🧠 ${this.agentName} initialized with AI reasoning`);
    console.log(`   Wallet: ${this.wallet.account.address}`);
  }

  private createAgent() {
    const getBalanceTool = FunctionTool.from(
      async () => {
        const balance = await this.getUSDCBalance();
        return JSON.stringify({ balance, maxBid: this.maxBid });
      },
      {
        name: 'get_my_balance',
        description: 'Returns your current USDC balance and maximum bid limit',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      }
    );

    const getAuctionStateTool = FunctionTool.from(
      async (input: { basename: string }) => {
        try {
          const response = await axios.get(
            `${this.serverUrl}/api/status?basename=${encodeURIComponent(input.basename)}`
          );
          return JSON.stringify(response.data);
        } catch (error: any) {
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'get_auction_state',
        description: 'Returns the current state of the auction including current bid, winner, time remaining, and bid history',
        parameters: {
          type: 'object',
          properties: {
            basename: {
              type: 'string',
              description: 'The basename being auctioned',
            },
          },
          required: ['basename'],
        },
      }
    );

    const placeBidTool = FunctionTool.from(
      async (input: { basename: string; proposedAmount: number; reasoning: string }) => {
        try {
          console.log(`\n💭 [${this.agentName}] Thinking: ${input.reasoning}`);
          console.log(`💰 [${this.agentName}] Proposing bid: $${input.proposedAmount.toFixed(2)}`);
          console.log(`🌐 [${this.agentName}] Sending to: ${this.serverUrl}/api/bid/${input.basename}`);

          // First request with proposed bid (no payment yet)
          const response = await this.axiosWithPayment.post(
            `${this.serverUrl}/api/bid/${input.basename}`,
            {
              thinking: input.reasoning,
              strategy: 'intelligent'
            },
            {
              headers: {
                'X-Proposed-Bid': input.proposedAmount.toString(),
                'X-Strategy-Reasoning': input.reasoning,
              }
            }
          );

          console.log(`📡 [${this.agentName}] Server response status: ${response.status}`);

          if (response.status === 200 && response.data.success) {
            return JSON.stringify({
              success: true,
              message: `Bid accepted at $${response.data.currentBid}`,
              currentBid: response.data.currentBid,
              auctionEndsIn: response.data.auctionEndsIn,
            });
          }

          return JSON.stringify({ success: false, message: 'Bid failed' });
        } catch (error: any) {
          // Handle 400 Bad Request (proposal rejected as too low)
          if (error.response?.status === 400) {
            const rejection = error.response.data;
            return JSON.stringify({
              success: false,
              proposalRejected: true,
              yourProposal: rejection.negotiation?.yourProposal || null,
              minimumRequired: rejection.negotiation?.minimumToWin || null,
              currentBid: rejection.negotiation?.currentBid || null,
              message: rejection.negotiation?.message || 'Proposal too low',
              suggestion: rejection.negotiation?.suggestion || null,
            });
          }

          // Handle 402 Payment Required (needs payment)
          if (error.response?.status === 402) {
            const paymentReq = error.response.data;
            return JSON.stringify({
              success: false,
              needsNegotiation: true,
              minimumRequired: paymentReq.negotiation?.minimumToWin || null,
              currentBid: paymentReq.negotiation?.currentBid || null,
              message: paymentReq.negotiation?.message || 'Negotiation required',
              suggestion: paymentReq.negotiation?.suggestion || null,
            });
          }

          return JSON.stringify({ success: false, message: error.message });
        }
      },
      {
        name: 'place_bid',
        description: 'Places a bid on the basename with your proposed amount and reasoning. Returns one of: 1) success=true if bid accepted, 2) proposalRejected=true if your amount is too low (you must propose higher), 3) needsNegotiation=true if payment is required. Always check the response and adjust your strategy accordingly.',
        parameters: {
          type: 'object',
          properties: {
            basename: {
              type: 'string',
              description: 'The basename to bid on',
            },
            proposedAmount: {
              type: 'number',
              description: 'The amount you want to bid in USDC',
            },
            reasoning: {
              type: 'string',
              description: 'Your strategic reasoning for this bid amount',
            },
          },
          required: ['basename', 'proposedAmount', 'reasoning'],
        },
      }
    );

    return new ReActAgent({
      llm: this.llm,
      tools: [getBalanceTool, getAuctionStateTool, placeBidTool],
      verbose: true,
    });
  }

  async getUSDCBalance(): Promise<number> {
    const balance = await this.publicClient.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.wallet.account.address],
    });

    // USDC has 6 decimals
    return Number(balance) / 1_000_000;
  }

  async decideBidStrategy(basename: string): Promise<void> {
    try {
      const balance = await this.getUSDCBalance();

      const refundContext = this.lastRefundAmount
        ? `\n\nIMPORTANT: You were just outbid! You received a refund of $${this.lastRefundAmount.toFixed(2)}. This means another agent bid higher than you. Analyze why you lost and adjust your strategy.`
        : '';

      const prompt = `You are ${this.agentName}, an autonomous bidding agent competing for the basename "${basename}".

Your Goal: Win the basename while spending as little as possible. Be strategic and competitive.

Your Constraints:
- Maximum budget: $${this.maxBid.toFixed(2)}
- Current balance: $${balance.toFixed(2)}

Instructions:
1. Use get-auction-state to see the current auction status
2. Use get-my-balance to confirm your funds
3. Analyze the situation:
   - What's the current bid?
   - Who's winning?
   - How much time is left?
   - What's the bidding pattern?
4. Decide on a strategic bid amount and reasoning
5. Use place-bid to submit your bid
6. Provide a final strategic analysis of your actions and the outcome

Be creative with your strategy! You can:
- Start conservative to test the waters
- Jump high to intimidate competitors
- Bid just above minimum to save money
- Wait for the right moment
- Bluff with aggressive early bids

${refundContext}

Think step by step and make your move!`;

      console.log(`\n🧠 [${this.agentName}] Starting AI reasoning...`);

      const response = await this.bot.chat({ message: prompt });

      console.log(`\n✅ [${this.agentName}] AI decision complete`);
      console.log(response.response);

      // Extract and send the reflection from the response
      const reflection = response.response;
      if (reflection && reflection.length > 50) {
        try {
          await axios.post(
            `${this.serverUrl}/api/bid/${basename}/reflection`,
            {
              agentId: this.agentName,
              reflection: reflection,
            }
          );
          console.log(`📝 [${this.agentName}] Reflection submitted to server`);
        } catch (error: any) {
          console.error(`❌ [${this.agentName}] Failed to submit reflection:`, error.message);
        }
      }

      // Start monitoring for refunds after successful bid
      this.startRefundMonitoring(basename);

    } catch (error: any) {
      console.error(`❌ [${this.agentName}] AI reasoning error:`, error.message);

      // Fallback to simple bid if AI fails
      if (error.response?.status === 410) {
        console.log(`🏁 [${this.agentName}] Auction ended`);
        this.isActive = false;
        this.stopRefundMonitoring();
      }
    }
  }

  startRefundMonitoring(basename: string) {
    if (this.monitoringInterval) {
      return;
    }

    console.log(`👀 [${this.agentName}] Monitoring for refunds...`);

    let previousBalance = 0;

    this.getUSDCBalance().then(balance => {
      previousBalance = balance;
    });

    this.monitoringInterval = setInterval(async () => {
      if (!this.isActive) {
        this.stopRefundMonitoring();
        return;
      }

      const currentBalance = await this.getUSDCBalance();

      if (currentBalance > previousBalance) {
        const refundAmount = currentBalance - previousBalance;
        this.lastRefundAmount = refundAmount;

        console.log(`\n🔔 [${this.agentName}] REFUND DETECTED: ${refundAmount.toFixed(2)} USDC`);
        console.log(`   I've been outbid! Time to reconsider my strategy... 🤔`);

        this.stopRefundMonitoring();

        // Wait random delay before AI re-evaluates
        const delay = Math.random() * (3000 - 1000) + 1000;
        console.log(`⏳ [${this.agentName}] Thinking for ${Math.floor(delay / 1000)}s...`);

        setTimeout(() => {
          if (this.isActive) {
            this.decideBidStrategy(basename);
          }
        }, delay);
      }

      previousBalance = currentBalance;
    }, 2000);
  }

  stopRefundMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log(`🛑 [${this.agentName}] Stopped refund monitoring`);
    }
  }

  async start(basename: string) {
    console.log(`\n🚀 [${this.agentName}] Starting intelligent bidding for ${basename}`);

    const balance = await this.getUSDCBalance();
    console.log(`💵 [${this.agentName}] Initial balance: ${balance.toFixed(2)} USDC`);

    await this.decideBidStrategy(basename);
  }

  stop() {
    console.log(`🛑 [${this.agentName}] Stopping agent...`);
    this.isActive = false;
    this.stopRefundMonitoring();
  }
}

