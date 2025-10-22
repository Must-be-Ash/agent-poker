import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { createWalletClient, http, publicActions, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { Hex } from 'viem';
import { Anthropic } from '@llamaindex/anthropic';
import { FunctionTool } from 'llamaindex';
import { agent } from '@llamaindex/workflow';
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

    console.log(`🧠 ${this.agentName} initialized with AI reasoning`);
    console.log(`   Wallet: ${this.wallet.account.address}`);
  }

  // Helper to emit events for frontend observability
  private async emitEvent(basename: string, eventType: string, data: any) {
    try {
      console.log(`📤 [${this.agentName}] Emitting event: ${eventType}`);
      const response = await axios.post(
        `${this.serverUrl}/api/events/${basename}/emit`,
        {
          eventType,
          agentId: this.agentName,
          data: {
            ...data,
            agentId: this.agentName,
          },
        }
      );
      console.log(`✅ [${this.agentName}] Event emitted successfully: ${eventType}`);
    } catch (error: any) {
      // Non-critical, continue even if event emission fails
      console.error(`⚠️ [${this.agentName}] Failed to emit event ${eventType}:`, error.message);
    }
  }

  private createAgent() {
    const getBalanceTool = FunctionTool.from(
      async () => {
        console.log(`\n💵 [${this.agentName}] Checking balance...`);
        const balance = await this.getUSDCBalance();
        const result = {
          success: true,
          data: {
            balance,
            maxBid: this.maxBid
          }
        };
        console.log(`✅ [${this.agentName}] Balance retrieved:`, JSON.stringify(result));

        // Emit tool call event (try to infer basename from context)
        try {
          const basename = process.env.BASENAME_TO_AUCTION;
          if (basename) {
            await this.emitEvent(basename, 'agent_tool_call', {
              tool: 'get_my_balance',
              result: { balance, maxBid: this.maxBid },
            });
          }
        } catch (e) { /* ignore */ }

        return JSON.stringify(result);
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
        console.log(`\n🔍 [${this.agentName}] Fetching auction state for ${input.basename}...`);

        // Emit tool call event
        await this.emitEvent(input.basename, 'agent_tool_call', {
          tool: 'get_auction_state',
          args: { basename: input.basename },
        });

        try {
          const response = await axios.get(
            `${this.serverUrl}/api/status?basename=${encodeURIComponent(input.basename)}`
          );

          const data = response.data;

          // Transform to expected format
          const result = {
            success: true,
            data: {
              winningBid: data.currentBid || 0,
              winningBidder: data.currentWinner?.agentId || null,
              timeRemaining: data.timeRemaining ? `${Math.floor(data.timeRemaining / 60)}:${(data.timeRemaining % 60).toString().padStart(2, '0')}` : null,
              bidHistory: data.bidHistory || [],
            }
          };
          console.log(`✅ [${this.agentName}] Auction state retrieved:`, JSON.stringify(result));

          // Emit tool response event
          await this.emitEvent(input.basename, 'agent_tool_response', {
            tool: 'get_auction_state',
            result: result.data,
          });

          return JSON.stringify(result);
        } catch (error: any) {
          console.error(`❌ [${this.agentName}] Failed to get auction state:`, error.message);
          return JSON.stringify({ success: false, error: error.message });
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

          // Emit 402 call initiated event
          await this.emitEvent(input.basename, '402_call_initiated', {
            proposedAmount: input.proposedAmount,
            reasoning: input.reasoning,
          });

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
          console.log(`📡 [${this.agentName}] Server response data:`, JSON.stringify(response.data));

          // Emit 402 response received event
          await this.emitEvent(input.basename, '402_response_received', {
            accepted: response.status === 200,
            proposedAmount: input.proposedAmount,
            message: response.data.message || 'Bid processed',
          });

          if (response.status === 200 && response.data.success) {
            const result = {
              success: true,
              data: {
                message: `Bid accepted at $${response.data.currentBid}`,
                currentBid: response.data.currentBid,
                auctionEndsIn: response.data.auctionEndsIn,
                transactionHash: response.data.transactionHash,
              }
            };
            console.log(`✅ [${this.agentName}] Returning success:`, JSON.stringify(result));
            return JSON.stringify(result);
          }

          return JSON.stringify({ success: false, message: 'Bid failed' });
        } catch (error: any) {
          console.error(`❌ [${this.agentName}] Bid request error:`, error.message);
          console.error(`   Status:`, error.response?.status);
          console.error(`   Data:`, error.response?.data);

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
        description: 'CRITICAL: This tool MUST be executed to actually place a bid. Do NOT simulate or guess the response. This makes a real HTTP request with payment to place your bid on the blockchain. Returns one of: 1) success=true if bid accepted, 2) proposalRejected=true if your amount is too low (you must propose higher), 3) needsNegotiation=true if payment is required. Always check the actual response and adjust your strategy accordingly.',
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

    const withdrawFromAuctionTool = FunctionTool.from(
      async (input: { basename: string; reasoning: string }) => {
        try {
          console.log(`\n🏳️ [${this.agentName}] Withdrawing from auction...`);
          console.log(`📝 [${this.agentName}] Reasoning: ${input.reasoning}`);

          // Emit withdrawal decision event
          await this.emitEvent(input.basename, 'withdrawal_decision', {
            reasoning: input.reasoning,
          });

          const response = await axios.post(
            `${this.serverUrl}/api/refund-request/${input.basename}`,
            {
              agentId: this.agentName,
              walletAddress: this.wallet.account.address,
              reasoning: input.reasoning,
            }
          );

          console.log(`✅ [${this.agentName}] Withdrawal processed:`, response.data.message);

          if (response.data.auctionEnded) {
            console.log(`🏁 [${this.agentName}] Auction has ended. Opponent won!`);
            this.isActive = false;
            this.stopRefundMonitoring();
          }

          return JSON.stringify({
            success: true,
            message: response.data.message,
            auctionEnded: response.data.auctionEnded,
          });
        } catch (error: any) {
          console.error(`❌ [${this.agentName}] Withdrawal failed:`, error.response?.data?.error || error.message);
          return JSON.stringify({
            success: false,
            error: error.response?.data?.error || error.message,
          });
        }
      },
      {
        name: 'withdraw_from_auction',
        description: 'CRITICAL: Call this tool to officially withdraw from the auction and forfeit your position. This will request a refund of your previous bid (if any) and remove you from the auction. Use this when you decide the current bid is too high for your budget or you no longer wish to compete. You MUST call this tool to withdraw - simply stating your intention is not sufficient.',
        parameters: {
          type: 'object',
          properties: {
            basename: {
              type: 'string',
              description: 'The basename auction to withdraw from',
            },
            reasoning: {
              type: 'string',
              description: 'Your reasoning for withdrawing from the auction',
            },
          },
          required: ['basename', 'reasoning'],
        },
      }
    );

    return agent({
      llm: this.llm,
      tools: [getBalanceTool, getAuctionStateTool, placeBidTool, withdrawFromAuctionTool],
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

      // Emit evaluation start event
      await this.emitEvent(basename, 'agent_evaluation_start', {
        trigger: this.lastRefundAmount ? 'refund_detected' : 'initial',
        balance,
        lastRefundAmount: this.lastRefundAmount,
      });

      // Create a fresh agent instance for each evaluation to ensure tools are actually executed
      // (prevents ReActAgent from reusing cached tool responses from conversation memory)
      console.log(`🔄 [${this.agentName}] Creating fresh agent instance for evaluation...`);
      const bot = this.createAgent();

      const prompt = `You are ${this.agentName}, an autonomous bidding agent competing for the basename "${basename}".

⚠️ CRITICAL REQUIREMENTS - READ CAREFULLY:
- This is NOT a simulation - you are making REAL blockchain transactions with REAL money
- You MUST actually execute the tools provided - DO NOT simulate, guess, or predict their responses
- You MUST take action by the end of this evaluation: either place a bid OR withdraw from the auction
- Simply providing analysis or recommendations is NOT sufficient - you must ACT

Your Goal: Win the basename while spending as little as possible. Be strategic and competitive.

Your Constraints:
- Maximum budget: $${this.maxBid.toFixed(2)}
- Current balance: $${balance.toFixed(2)}

REQUIRED EXECUTION STEPS (follow in order):

Step 1: CALL get_auction_state tool
- You MUST execute this tool to get current auction data
- DO NOT guess or assume what the response will be

Step 2: CALL get_my_balance tool
- You MUST execute this tool to confirm your available funds
- DO NOT skip this step

Step 3: Analyze the situation
- What's the current bid?
- Who's winning?
- What's the bidding pattern?
- How does this compare to your budget?

Step 4: MAKE YOUR DECISION (you MUST choose ONE):

Option A: Place a bid
- CALL the place_bid tool with your chosen amount and reasoning
- The tool will handle the actual blockchain transaction
- You can bid conservatively OR aggressively based on your strategy

Option B: Withdraw from auction
- If the current bid exceeds your budget or you decide not to compete
- CALL the withdraw_from_auction tool with your reasoning
- This will officially remove you from the auction and request a refund

${refundContext}

Strategic tips (be creative with your bidding):
- Conservative: Bid just above the minimum to save budget
- Aggressive: Jump high to intimidate competitors
- Tactical: Wait and observe patterns before committing

REMEMBER: You MUST actually execute the tools and take action. This is a real auction with real consequences!`;

      console.log(`\n🧠 [${this.agentName}] Starting AI reasoning...`);

      // Notify server that agent is actively thinking
      try {
        await axios.post(
          `${this.serverUrl}/api/agent-status/${basename}`,
          {
            agentId: this.agentName,
            status: 'thinking',
            timestamp: new Date().toISOString(),
          }
        );
      } catch (error) {
        // Non-critical, continue even if this fails
      }

      const response = await bot.run(prompt);

      console.log(`\n✅ [${this.agentName}] AI decision complete`);
      console.log(response.data.result);

      // Withdrawal is now handled by the withdraw_from_auction tool
      // No need for keyword parsing - agent explicitly calls the tool

      // Extract and send the reflection from the response
      const reflection = response.data.result;
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

      // Start monitoring for refunds after evaluation
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

        // Emit refund detected event
        await this.emitEvent(basename, 'refund_detected', {
          amount: refundAmount,
          previousBalance,
          currentBalance,
        });

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

