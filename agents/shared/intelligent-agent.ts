import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { createWalletClient, http, publicActions, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';
import { Hex } from 'viem';
import { Anthropic } from '@llamaindex/anthropic';
import { FunctionTool } from 'llamaindex';
import { agent } from '@llamaindex/workflow';
import { wrapFetchWithPayment } from 'x402-fetch';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LlamaIndex ReActAgent does not export proper TypeScript types
  private bot: any;
  private bidHistory: BidContext['bidHistory'] = [];
  private lastRefundAmount?: number;

  constructor(config: {
    privateKey: Hex;
    agentName: string;
    maxBid?: number; // Optional - agents can set dynamically after research
    serverUrl: string;
    anthropicApiKey: string;
  }) {
    this.agentName = config.agentName;
    this.maxBid = config.maxBid || 0; // Initialize to 0 if not provided
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  /**
   * Set maximum bid budget (used when agents determine budget dynamically)
   */
  setMaxBid(amount: number) {
    console.log(`💰 [${this.agentName}] Setting maximum budget to $${amount.toFixed(2)}`);
    this.maxBid = amount;
  }

  // Helper to emit events for frontend observability
  private async emitEvent(basename: string, eventType: string, data: Record<string, unknown>) {
    try {
      console.log(`📤 [${this.agentName}] Emitting event: ${eventType}`);
      await axios.post(
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
    } catch (error: unknown) {
      // Non-critical, continue even if event emission fails
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`⚠️ [${this.agentName}] Failed to emit event ${eventType}:`, errorMessage);
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
        } catch { /* ignore */ }

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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ [${this.agentName}] Failed to get auction state:`, errorMessage);
          return JSON.stringify({ success: false, error: errorMessage });
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ [${this.agentName}] Bid request error:`, errorMessage);

          if (axios.isAxiosError(error)) {
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
          }

          return JSON.stringify({ success: false, message: errorMessage });
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
        } catch (error: unknown) {
          const errorMessage = axios.isAxiosError(error)
            ? (error.response?.data?.error || error.message)
            : (error instanceof Error ? error.message : 'Unknown error');
          console.error(`❌ [${this.agentName}] Withdrawal failed:`, errorMessage);
          return JSON.stringify({
            success: false,
            error: errorMessage,
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

    const searchWebTool = FunctionTool.from(
      async (input: { query: string; limit?: number }) => {
        try {
          console.log(`\n🔍 [${this.agentName}] Searching web for: "${input.query}"`);

          // Use this agent's own private key (from wallet.account) for Firecrawl payments
          const account = this.wallet.account;

          // Create wallet client for x402 payments (use Base mainnet for Firecrawl)
          const walletClient = createWalletClient({
            account,
            chain: base,
            transport: http()
          }).extend(publicActions);

          // Wrap fetch with x402 payment handling
          const fetchWithPayment = wrapFetchWithPayment(
            fetch,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            walletClient as any,
            BigInt(0.50 * 10 ** 6) // Allow up to $0.50 USDC for search
          );

          // Emit Firecrawl 402 call event
          const basename = process.env.BASENAME_TO_AUCTION;
          if (basename) {
            await this.emitEvent(basename, 'firecrawl_402_call', {
              query: input.query,
              cost: 0.01,
              endpoint: 'https://api.firecrawl.dev/v2/x402/search',
            });
          }

          // Call Firecrawl search API (v2 endpoint requires BOTH API key + x402 payment)
          const response = await fetchWithPayment('https://api.firecrawl.dev/v2/x402/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.BID_FIRECRAWL_API_KEY}`,
            },
            body: JSON.stringify({
              query: input.query,
              limit: Math.min(input.limit || 10, 10),
              sources: ['web']
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [${this.agentName}] Firecrawl API error:`, response.status, errorText);
            return JSON.stringify({
              success: false,
              error: `Firecrawl API error: ${response.status}`,
            });
          }

          const result = await response.json();
          const articles = result.data?.web || [];

          console.log(`✅ [${this.agentName}] Found ${articles.length} results`);

          // Return simplified results
          const searchResults = articles.slice(0, 5).map((article: { title?: string; description?: string; url?: string }) => ({
            title: article.title,
            description: article.description,
            url: article.url,
          }));

          // Emit search results event with actual data
          if (basename) {
            await this.emitEvent(basename, 'firecrawl_results', {
              query: input.query,
              results: searchResults,
              totalResults: articles.length,
            });
          }

          return JSON.stringify({
            success: true,
            query: input.query,
            results: searchResults,
            totalResults: articles.length,
          });

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ [${this.agentName}] Search failed:`, errorMessage);
          return JSON.stringify({
            success: false,
            error: errorMessage,
          });
        }
      },
      {
        name: 'search_web',
        description: 'Search the web for information using Firecrawl. Use this to research the value, popularity, or market data about basenames or topics. Returns web search results with titles, descriptions, and URLs. This helps you make informed decisions about how much to budget for the auction.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query (e.g., "x402agent.base.eth value", "basename sales history")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (1-10, default 10)',
            },
          },
          required: ['query'],
        },
      }
    );

    const setBudgetTool = FunctionTool.from(
      async (input: { amount: number; reasoning: string }) => {
        try {
          // Get current balance to validate budget
          const currentBalance = await this.getUSDCBalance();

          // Validate budget constraints
          if (input.amount < 0.01) {
            return JSON.stringify({
              success: false,
              error: 'Budget must be at least $0.01',
            });
          }

          if (input.amount > currentBalance) {
            return JSON.stringify({
              success: false,
              error: `Budget of $${input.amount.toFixed(2)} exceeds your available balance of $${currentBalance.toFixed(2)}`,
            });
          }

          console.log(`\n💰 [${this.agentName}] Setting budget to $${input.amount.toFixed(2)}`);
          console.log(`📝 [${this.agentName}] Reasoning: ${input.reasoning}`);
          console.log(`💵 [${this.agentName}] Available balance: $${currentBalance.toFixed(2)}`);

          this.setMaxBid(input.amount);

          // Emit budget set event
          const basename = process.env.BASENAME_TO_AUCTION;
          if (basename) {
            await this.emitEvent(basename, 'budget_determined', {
              amount: input.amount,
              reasoning: input.reasoning,
              availableBalance: currentBalance,
            });
          }

          return JSON.stringify({
            success: true,
            message: `Budget set to $${input.amount.toFixed(2)} (${((input.amount / currentBalance) * 100).toFixed(1)}% of your balance)`,
            maxBid: this.maxBid,
            availableBalance: currentBalance,
          });

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ [${this.agentName}] Failed to set budget:`, errorMessage);
          return JSON.stringify({
            success: false,
            error: errorMessage,
          });
        }
      },
      {
        name: 'set_budget',
        description: 'Set your maximum budget for the auction after researching the basename\'s value. You must call this tool after using search_web to determine how much you are willing to spend. Your budget can be anywhere from $0.01 up to your full available balance. Consider the basename\'s perceived value when setting your budget - highly valuable names like "coinbase.base.eth" or "1.base.eth" may justify allocating most or all of your balance, while less valuable names may warrant only a small portion.',
        parameters: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: 'The maximum amount you are willing to bid (minimum $0.01, up to your available balance). Base this on your research of the basename\'s value.',
            },
            reasoning: {
              type: 'string',
              description: 'Your reasoning for choosing this budget based on your research',
            },
          },
          required: ['amount', 'reasoning'],
        },
      }
    );

    return agent({
      llm: this.llm,
      tools: [getBalanceTool, getAuctionStateTool, placeBidTool, withdrawFromAuctionTool, searchWebTool, setBudgetTool],
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

      const budgetDetermined = this.maxBid > 0;

      const prompt = `You are ${this.agentName}, an autonomous bidding agent competing for the basename "${basename}".

⚠️ CRITICAL REQUIREMENTS - READ CAREFULLY:
- This is NOT a simulation - you are making REAL blockchain transactions with REAL money
- You MUST actually execute the tools provided - DO NOT simulate, guess, or predict their responses
- You MUST take action by the end of this evaluation: either place a bid OR withdraw from the auction
- Simply providing analysis or recommendations is NOT sufficient - you must ACT

Your Goal: Win the basename while spending as little as possible. Be strategic and competitive.

Your Constraints:
- ${budgetDetermined ? `Maximum budget: $${this.maxBid.toFixed(2)}` : 'Budget: Not yet determined - you will research and set your own budget'}
- Current balance: $${balance.toFixed(2)}

REQUIRED EXECUTION STEPS (follow in order):

${!budgetDetermined ? `Phase 1: RESEARCH & BUDGET DETERMINATION
- CALL search_web tool to research the basename's value, popularity, and market data
- Search for: "${basename} value", "basename sales", or similar queries
- Analyze the search results to understand what this basename is worth
- Consider: Is this a premium name (short, memorable, brandable) or a generic/random name?
- Based on your research, CALL set_budget tool to set your maximum budget (from $0.01 up to your full balance of $${balance.toFixed(2)})
- Your budget should reflect the basename's perceived value:
  * Premium names (e.g., "nike.base.eth", "1.base.eth") may justify 50-100% of your balance
  * Moderate names may justify 20-50% of your balance
  * Generic/random names may only warrant 1-10% of your balance
- You MUST set your budget before proceeding to bidding

` : ''}Step 1: CALL get_auction_state tool
- You MUST execute this tool to get current auction data
- DO NOT guess or assume what the response will be

Step 2: CALL get_my_balance tool
- You MUST execute this tool to confirm your available funds
- DO NOT skip this step

Step 3: Analyze the situation
- What's the current bid?
- Who's winning?
- What's the bidding pattern?
${budgetDetermined ? '- How does this compare to your budget?' : '- How does this compare to your researched budget?'}

Step 4: MAKE YOUR DECISION (you MUST choose ONE):

Option A: Place a bid
- CALL the place_bid tool with your chosen amount and reasoning
- The tool will handle the actual blockchain transaction
- You can bid conservatively OR aggressively based on your strategy
${!budgetDetermined ? '- Ensure your bid stays within your researched budget' : ''}

Option B: Withdraw from auction
- If the current bid exceeds your budget or you decide not to compete
- CALL the withdraw_from_auction tool with your reasoning
- This will officially remove you from the auction and request a refund

${refundContext}

Strategic tips (be creative with your bidding):
- Conservative: Bid just above the minimum to save budget
- Aggressive: Jump high to intimidate competitors
- Tactical: Wait and observe patterns before committing
${!budgetDetermined ? '- Research-driven: Use web search to make informed budget decisions' : ''}

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
      } catch {
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ [${this.agentName}] Failed to submit reflection:`, errorMessage);
        }
      }

      // Start monitoring for refunds after evaluation
      this.startRefundMonitoring(basename);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [${this.agentName}] AI reasoning error:`, errorMessage);

      // Fallback to simple bid if AI fails
      if (axios.isAxiosError(error) && error.response?.status === 410) {
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

