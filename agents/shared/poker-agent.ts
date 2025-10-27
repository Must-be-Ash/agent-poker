/**
 * Poker Agent
 * Intelligent AI poker player using Claude + LlamaIndex
 */

import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { createWalletClient, http, publicActions, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { Hex } from 'viem';
import { Anthropic } from '@llamaindex/anthropic';
import { agent } from '@llamaindex/workflow';
import { createPokerTools, type PokerToolContext } from './poker-tools';
import {
  createPokerStrategyPrompt,
  type PokerAgentPersonality,
  POKER_PERSONALITIES
} from './poker-system-prompt';

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

export interface PokerAgentConfig {
  privateKey: Hex;
  agentName: string;
  gameId: string;
  serverUrl: string;
  anthropicApiKey: string;
  personality?: PokerAgentPersonality;
  pollingInterval?: number; // milliseconds between state checks (default 2000)
}

export class PokerAgent {
  private wallet;
  private axiosWithPayment;
  private agentName: string;
  private gameId: string;
  private serverUrl: string;
  private personality: PokerAgentPersonality;
  private isActive: boolean = true;
  private publicClient;
  private pollingInterval: number;
  private pollingTimer: NodeJS.Timeout | null = null;
  private llm;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LlamaIndex agent does not export proper TypeScript types
  private bot: any;
  private lastChipStack: number = 0;
  private isMyTurn: boolean = false;
  private isThinking: boolean = false;
  private pollingCounter: number = 0;

  constructor(config: PokerAgentConfig) {
    this.agentName = config.agentName;
    this.gameId = config.gameId;
    this.serverUrl = config.serverUrl;
    this.personality = config.personality || POKER_PERSONALITIES.TIGHT_AGGRESSIVE;
    this.pollingInterval = config.pollingInterval || 2000; // Default 2 seconds

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

    console.log(`🧠 ${this.agentName} initialized for poker`);
    console.log(`   Wallet: ${this.wallet.account.address}`);
    console.log(`   Game: ${this.gameId}`);
    console.log(`   Style: ${this.personality.playingStyle}`);
  }

  /**
   * Helper to emit events for frontend observability
   */
  private async emitEvent(gameId: string, eventType: string, data: Record<string, unknown>) {
    try {
      await axios.post(
        `${this.serverUrl}/api/poker/events/${gameId}`,
        {
          eventType,
          agentId: this.agentName,
          data: {
            ...data,
            agentId: this.agentName,
          },
        }
      );
    } catch (error: unknown) {
      // Non-critical, continue even if event emission fails
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`⚠️ [${this.agentName}] Failed to emit event ${eventType}:`, errorMessage);
    }
  }

  /**
   * Creates LlamaIndex agent with poker tools
   */
  private createAgent() {
    const context: PokerToolContext = {
      agentName: this.agentName,
      serverUrl: this.serverUrl,
      axiosWithPayment: this.axiosWithPayment,
      emitEvent: this.emitEvent.bind(this),
    };

    const tools = createPokerTools(context);

    return agent({
      llm: this.llm,
      tools,
    });
  }

  /**
   * Gets current USDC balance
   */
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

  /**
   * Fetches current game state
   */
  private async getGameState(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/poker/${this.gameId}/state`,
        {
          headers: {
            'X-Agent-ID': this.agentName,
          },
        }
      );

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 410) {
          // Game ended
          return null;
        }
      }
      throw error;
    }
  }

  /**
   * Main decision-making logic
   * Called when it's the agent's turn
   */
  private async makeDecision(gameState: any): Promise<void> {
    if (this.isThinking) {
      console.log(`⏳ [${this.agentName}] Already thinking, skipping...`);
      return;
    }

    this.isThinking = true;

    try {
      console.log(`\n🎲 [${this.agentName}] My turn! Making decision...`);

      // Emit thinking event
      await this.emitEvent(this.gameId, 'agent_thinking', {
        handNumber: gameState.handNumber,
        bettingRound: gameState.bettingRound,
        pot: gameState.pot,
        yourChips: gameState.yourChips,
      });

      // Create fresh agent instance for each decision
      console.log(`🔄 [${this.agentName}] Creating fresh agent instance...`);
      this.bot = this.createAgent();

      // Generate strategy prompt
      const systemPrompt = createPokerStrategyPrompt(this.personality, this.gameId);

      // Build context about current situation
      const chipStackChange = gameState.yourChips - this.lastChipStack;
      const chipContext = this.lastChipStack > 0 && chipStackChange !== 0
        ? `\n\nChip Stack Update: You ${chipStackChange > 0 ? 'won' : 'lost'} ${Math.abs(chipStackChange)} USDC since last hand.`
        : '';

      const situationPrompt = `${systemPrompt}

# 🎮 CURRENT SITUATION

**Game ID**: ${this.gameId}
**Hand Number**: ${gameState.handNumber}
**Betting Round**: ${gameState.bettingRound.toUpperCase()}

You are now in a live poker game. It is YOUR TURN to act.

${chipContext}

## CRITICAL INSTRUCTIONS

1. **IMMEDIATELY call get_game_state** with gameId="${this.gameId}" to see your cards and the current situation
2. **Analyze the game state** returned by the tool
3. **Make your decision** based on your strategy and the tool response
4. **Execute ONE action** from the tools: check, call, bet, raise, or fold
5. **Provide strategic reasoning** for your action

Remember: This is a REAL poker game with REAL money. You MUST execute tools - do not simulate responses.

GO! Call get_game_state now and make your decision.`;

      console.log(`\n🧠 [${this.agentName}] Starting AI reasoning...`);

      const response = await this.bot.run(situationPrompt);

      console.log(`\n✅ [${this.agentName}] AI decision complete`);
      console.log(response.data.result);

      // Emit decision complete event with detailed reasoning
      await this.emitEvent(this.gameId, 'agent_decision_complete', {
        reasoning: response.data.result,
      });

      // Generate and emit reflection on the action taken
      await this.generateReflection(gameState);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [${this.agentName}] Decision error:`, errorMessage);

      // Emit error event
      await this.emitEvent(this.gameId, 'agent_error', {
        error: errorMessage,
      });
    } finally {
      this.isThinking = false;
    }
  }

  /**
   * Generates reflection after taking an action
   * Analyzes the outcome and broadcasts reflection event
   */
  private async generateReflection(previousGameState: any): Promise<void> {
    try {
      // Wait a moment for action to complete and get updated game state
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const newGameState = await this.getGameState();
      if (!newGameState) {
        return; // Game ended
      }

      // Build reflection prompt
      const reflectionPrompt = `You just completed an action in the poker game.

## Previous State:
- Your chips: ${previousGameState.yourChips} USDC
- Pot: ${previousGameState.pot} USDC
- Betting round: ${previousGameState.bettingRound}

## Current State:
- Your chips: ${newGameState.yourChips} USDC
- Pot: ${newGameState.pot} USDC
- Betting round: ${newGameState.bettingRound}

Provide a BRIEF (1-2 sentences) reflection on:
1. What action you took and why
2. How you feel about the outcome
3. What you're thinking about for the next decision (if any)

Keep it concise and strategic. This will be shown to viewers watching the game.`;

      console.log(`\n🤔 [${this.agentName}] Generating reflection...`);

      // Use a simpler LLM call for reflection (don't need full agent with tools)
      const reflectionResponse = await this.llm.chat({
        messages: [
          {
            role: 'user',
            content: reflectionPrompt,
          },
        ],
      });

      // Extract text from Anthropic response (can be string or array of content blocks)
      const content = reflectionResponse.message.content;
      const reflection = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map(block => (block as any).type === 'text' ? (block as any).text : '').join('')
          : '';

      console.log(`📝 [${this.agentName}] Reflection: ${reflection}`);

      // Emit reflection event
      await this.emitEvent(this.gameId, 'agent_reflection', {
        reflection,
        handNumber: newGameState.handNumber,
        bettingRound: newGameState.bettingRound,
        chipChange: newGameState.yourChips - previousGameState.yourChips,
        potChange: newGameState.pot - previousGameState.pot,
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [${this.agentName}] Reflection error:`, errorMessage);
      // Non-critical, don't throw
    }
  }

  /**
   * Main polling loop
   * Checks game state periodically and acts when it's the agent's turn
   */
  private async pollGameState(): Promise<void> {
    try {
      const gameState = await this.getGameState();

      // Check if game ended
      if (!gameState) {
        console.log(`\n🏁 [${this.agentName}] Game has ended`);
        this.stop();
        return;
      }

      // Track chip stack changes
      if (gameState.yourChips !== this.lastChipStack) {
        const change = gameState.yourChips - this.lastChipStack;
        if (this.lastChipStack > 0) {
          console.log(`💰 [${this.agentName}] Chip stack: ${this.lastChipStack} → ${gameState.yourChips} (${change > 0 ? '+' : ''}${change})`);
        }
        this.lastChipStack = gameState.yourChips;
      }

      // Check if it's our turn
      if (gameState.isYourTurn && !this.isMyTurn && !this.isThinking) {
        this.isMyTurn = true;
        console.log(`\n🔔 [${this.agentName}] IT'S MY TURN!`);

        // Make decision
        await this.makeDecision(gameState);

        // Reset turn flag after decision
        this.isMyTurn = false;
      } else if (!gameState.isYourTurn) {
        this.isMyTurn = false;

        // Emit periodic "waiting" event every 5 polling cycles (10 seconds with 2s interval)
        this.pollingCounter++;
        if (this.pollingCounter % 5 === 0) {
          await this.emitEvent(this.gameId, 'agent_waiting', {
            handNumber: gameState.handNumber,
            bettingRound: gameState.bettingRound,
            pot: gameState.pot,
            yourChips: gameState.yourChips,
          });
        }
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [${this.agentName}] Polling error:`, errorMessage);
    }
  }

  /**
   * Starts the poker agent
   */
  async start(): Promise<void> {
    console.log(`\n🚀 [${this.agentName}] Starting poker agent for game ${this.gameId}`);

    const balance = await this.getUSDCBalance();
    console.log(`💵 [${this.agentName}] USDC balance: ${balance.toFixed(2)}`);

    // Emit balance check event
    await this.emitEvent(this.gameId, 'agent_balance_check', {
      balance,
    });

    // Get initial game state
    const gameState = await this.getGameState();
    if (gameState) {
      this.lastChipStack = gameState.yourChips;
      console.log(`🎰 [${this.agentName}] Starting chips: ${this.lastChipStack}`);
    }

    // Emit agent joined event
    await this.emitEvent(this.gameId, 'agent_joined', {
      balance,
      personality: this.personality,
    });

    // Start polling
    console.log(`👀 [${this.agentName}] Polling game state every ${this.pollingInterval}ms...`);

    // Poll immediately
    await this.pollGameState();

    // Then poll on interval
    this.pollingTimer = setInterval(() => {
      if (this.isActive) {
        this.pollGameState();
      }
    }, this.pollingInterval);
  }

  /**
   * Stops the poker agent
   */
  stop(): void {
    console.log(`🛑 [${this.agentName}] Stopping poker agent...`);
    this.isActive = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Emit agent left event
    this.emitEvent(this.gameId, 'agent_left', {
      finalChips: this.lastChipStack,
    });
  }
}
