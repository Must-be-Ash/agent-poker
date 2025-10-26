/**
 * Poker Agent Tools
 * LlamaIndex FunctionTool definitions for intelligent poker agents
 */

import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { FunctionTool } from 'llamaindex';
import type { WalletClient } from 'viem';

// ============================================================================
// TYPES
// ============================================================================

export interface PokerToolContext {
  agentName: string;
  serverUrl: string;
  axiosWithPayment: ReturnType<typeof withPaymentInterceptor>;
  emitEvent: (gameId: string, eventType: string, data: Record<string, unknown>) => Promise<void>;
}

export interface GameStateResponse {
  success: boolean;
  data?: {
    gameId: string;
    yourCards: Array<{ rank: string; suit: string }> | null;
    communityCards: Array<{ rank: string; suit: string }>;
    pot: number;
    yourChips: number;
    yourCurrentBet: number;
    currentBet: number;
    bettingRound: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
    isYourTurn: boolean;
    yourPosition: string;
    players: Array<{
      name: string;
      chips: number;
      status: string;
      currentBet: number;
      position: string;
    }>;
    legalActions: string[];
    minimumRaise?: number;
    potOdds?: number;
  };
  error?: string;
}

export interface ActionResponse {
  success: boolean;
  data?: {
    action: string;
    amount?: number;
    pot: number;
    yourChips: number;
    transactionHash?: string;
    gameState: {
      bettingRound: string;
      currentBet: number;
      isYourTurn: boolean;
    };
  };
  error?: string;
  details?: string;
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Creates all poker tools for an agent
 * @param context - Agent context with wallet, server URL, etc.
 * @returns Array of FunctionTools for LlamaIndex agent
 */
export function createPokerTools(context: PokerToolContext): FunctionTool[] {
  return [
    createGetGameStateTool(context),
    createCheckTool(context),
    createCallTool(context),
    createBetTool(context),
    createRaiseTool(context),
    createFoldTool(context),
  ];
}

// ============================================================================
// INDIVIDUAL TOOL CREATORS
// ============================================================================

/**
 * Get Game State Tool
 * Returns current visible game information for the agent
 */
function createGetGameStateTool(context: PokerToolContext): FunctionTool {
  return FunctionTool.from(
    async (input: { gameId: string }) => {
      console.log(`\n🎲 [${context.agentName}] Getting game state for ${input.gameId}...`);

      // Emit tool call event
      await context.emitEvent(input.gameId, 'agent_tool_call', {
        tool: 'get_game_state',
        args: { gameId: input.gameId },
      });

      try {
        const response = await axios.get(
          `${context.serverUrl}/api/poker/${input.gameId}/state`,
          {
            headers: {
              'X-Agent-ID': context.agentName,
            },
          }
        );

        const result: GameStateResponse = {
          success: true,
          data: response.data,
        };

        console.log(`✅ [${context.agentName}] Game state retrieved`);
        console.log(`   Your cards: ${result.data?.yourCards?.map(c => `${c.rank}${c.suit}`).join(', ') || 'Hidden'}`);
        console.log(`   Community: ${result.data?.communityCards?.map(c => `${c.rank}${c.suit}`).join(', ') || 'None'}`);
        console.log(`   Pot: ${result.data?.pot} USDC`);
        console.log(`   Your chips: ${result.data?.yourChips} USDC`);
        console.log(`   Your turn: ${result.data?.isYourTurn ? 'YES' : 'NO'}`);

        // Emit tool response event
        await context.emitEvent(input.gameId, 'agent_tool_response', {
          tool: 'get_game_state',
          result: result.data,
        });

        return JSON.stringify(result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [${context.agentName}] Failed to get game state:`, errorMessage);
        return JSON.stringify({ success: false, error: errorMessage });
      }
    },
    {
      name: 'get_game_state',
      description: 'Returns the current state of the poker game including your cards, community cards, pot size, chip stacks, current bet, and legal actions. CRITICAL: You MUST call this tool at the start of every decision to see the current game state. Do NOT assume or guess the game state.',
      parameters: {
        type: 'object',
        properties: {
          gameId: {
            type: 'string',
            description: 'The poker game identifier',
          },
        },
        required: ['gameId'],
      },
    }
  );
}

/**
 * Check Tool
 * Pass the action without betting (only valid when no bet to call)
 */
function createCheckTool(context: PokerToolContext): FunctionTool {
  return FunctionTool.from(
    async (input: { gameId: string; reasoning: string }) => {
      console.log(`\n✋ [${context.agentName}] Checking...`);
      console.log(`📝 [${context.agentName}] Reasoning: ${input.reasoning}`);

      // Emit action initiated event
      await context.emitEvent(input.gameId, 'poker_action_initiated', {
        action: 'check',
        reasoning: input.reasoning,
      });

      try {
        const response = await axios.post(
          `${context.serverUrl}/api/poker/${input.gameId}/action`,
          { action: 'check', reasoning: input.reasoning },
          {
            headers: {
              'X-Agent-ID': context.agentName,
              'X-ACTION': 'check',
            },
          }
        );

        const result: ActionResponse = {
          success: true,
          data: response.data,
        };

        console.log(`✅ [${context.agentName}] Check successful`);

        // Emit action response event
        await context.emitEvent(input.gameId, 'poker_action_response', {
          action: 'check',
          result: result.data,
        });

        return JSON.stringify(result);
      } catch (error: unknown) {
        const errorMessage = axios.isAxiosError(error)
          ? (error.response?.data?.error || error.message)
          : (error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ [${context.agentName}] Check failed:`, errorMessage);
        return JSON.stringify({ success: false, error: errorMessage });
      }
    },
    {
      name: 'check',
      description: 'Pass the action without betting. Only valid when there is no bet to call (currentBet equals your currentBet). This is a free action with no payment required. Use this when you want to see the next card without committing more chips.',
      parameters: {
        type: 'object',
        properties: {
          gameId: {
            type: 'string',
            description: 'The poker game identifier',
          },
          reasoning: {
            type: 'string',
            description: 'Your strategic reasoning for checking',
          },
        },
        required: ['gameId', 'reasoning'],
      },
    }
  );
}

/**
 * Call Tool
 * Match the current bet (requires x402 payment)
 */
function createCallTool(context: PokerToolContext): FunctionTool {
  return FunctionTool.from(
    async (input: { gameId: string; reasoning: string }) => {
      console.log(`\n📞 [${context.agentName}] Calling...`);
      console.log(`📝 [${context.agentName}] Reasoning: ${input.reasoning}`);

      // Emit action initiated event
      await context.emitEvent(input.gameId, 'poker_action_initiated', {
        action: 'call',
        reasoning: input.reasoning,
      });

      try {
        // Use x402-enabled axios for payment
        const response = await context.axiosWithPayment.post(
          `${context.serverUrl}/api/poker/${input.gameId}/action`,
          { action: 'call', reasoning: input.reasoning },
          {
            headers: {
              'X-Agent-ID': context.agentName,
              'X-ACTION': 'call',
            },
          }
        );

        const result: ActionResponse = {
          success: true,
          data: response.data,
        };

        console.log(`✅ [${context.agentName}] Call successful - Amount: ${result.data?.amount} USDC`);
        if (result.data?.transactionHash) {
          console.log(`   TX: ${result.data.transactionHash}`);
        }

        // Emit action response event
        await context.emitEvent(input.gameId, 'poker_action_response', {
          action: 'call',
          result: result.data,
        });

        return JSON.stringify(result);
      } catch (error: unknown) {
        const errorMessage = axios.isAxiosError(error)
          ? (error.response?.data?.error || error.message)
          : (error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ [${context.agentName}] Call failed:`, errorMessage);
        return JSON.stringify({ success: false, error: errorMessage });
      }
    },
    {
      name: 'call',
      description: 'Match the current bet. This requires an x402 payment equal to (currentBet - yourCurrentBet). Use this when you want to stay in the hand and see the next card. The server will automatically handle the blockchain payment via x402.',
      parameters: {
        type: 'object',
        properties: {
          gameId: {
            type: 'string',
            description: 'The poker game identifier',
          },
          reasoning: {
            type: 'string',
            description: 'Your strategic reasoning for calling',
          },
        },
        required: ['gameId', 'reasoning'],
      },
    }
  );
}

/**
 * Bet Tool
 * Initiate a bet (requires x402 payment)
 */
function createBetTool(context: PokerToolContext): FunctionTool {
  return FunctionTool.from(
    async (input: { gameId: string; amount: number; reasoning: string }) => {
      console.log(`\n💰 [${context.agentName}] Betting ${input.amount} USDC...`);
      console.log(`📝 [${context.agentName}] Reasoning: ${input.reasoning}`);

      // Emit action initiated event
      await context.emitEvent(input.gameId, 'poker_action_initiated', {
        action: 'bet',
        amount: input.amount,
        reasoning: input.reasoning,
      });

      try {
        // Use x402-enabled axios for payment
        const response = await context.axiosWithPayment.post(
          `${context.serverUrl}/api/poker/${input.gameId}/action`,
          { action: 'bet', amount: input.amount, reasoning: input.reasoning },
          {
            headers: {
              'X-Agent-ID': context.agentName,
              'X-ACTION': 'bet',
              'X-AMOUNT': input.amount.toString(),
            },
          }
        );

        const result: ActionResponse = {
          success: true,
          data: response.data,
        };

        console.log(`✅ [${context.agentName}] Bet successful - Amount: ${input.amount} USDC`);
        if (result.data?.transactionHash) {
          console.log(`   TX: ${result.data.transactionHash}`);
        }

        // Emit action response event
        await context.emitEvent(input.gameId, 'poker_action_response', {
          action: 'bet',
          result: result.data,
        });

        return JSON.stringify(result);
      } catch (error: unknown) {
        const errorMessage = axios.isAxiosError(error)
          ? (error.response?.data?.error || error.message)
          : (error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ [${context.agentName}] Bet failed:`, errorMessage);

        // Include server error details if available
        if (axios.isAxiosError(error) && error.response?.data) {
          return JSON.stringify({
            success: false,
            error: errorMessage,
            details: error.response.data.details,
          });
        }

        return JSON.stringify({ success: false, error: errorMessage });
      }
    },
    {
      name: 'bet',
      description: 'Initiate a bet when no one has bet yet this round. This requires an x402 payment. Amount must be at least the big blind and at most your total chips. Use this to take initiative and put pressure on opponents. The server will automatically handle the blockchain payment via x402.',
      parameters: {
        type: 'object',
        properties: {
          gameId: {
            type: 'string',
            description: 'The poker game identifier',
          },
          amount: {
            type: 'number',
            description: 'The amount to bet in USDC (must be >= big blind)',
          },
          reasoning: {
            type: 'string',
            description: 'Your strategic reasoning for betting this amount',
          },
        },
        required: ['gameId', 'amount', 'reasoning'],
      },
    }
  );
}

/**
 * Raise Tool
 * Increase the current bet (requires x402 payment)
 */
function createRaiseTool(context: PokerToolContext): FunctionTool {
  return FunctionTool.from(
    async (input: { gameId: string; amount: number; reasoning: string }) => {
      console.log(`\n📈 [${context.agentName}] Raising to ${input.amount} USDC...`);
      console.log(`📝 [${context.agentName}] Reasoning: ${input.reasoning}`);

      // Emit action initiated event
      await context.emitEvent(input.gameId, 'poker_action_initiated', {
        action: 'raise',
        amount: input.amount,
        reasoning: input.reasoning,
      });

      try {
        // Use x402-enabled axios for payment
        const response = await context.axiosWithPayment.post(
          `${context.serverUrl}/api/poker/${input.gameId}/action`,
          { action: 'raise', amount: input.amount, reasoning: input.reasoning },
          {
            headers: {
              'X-Agent-ID': context.agentName,
              'X-ACTION': 'raise',
              'X-AMOUNT': input.amount.toString(),
            },
          }
        );

        const result: ActionResponse = {
          success: true,
          data: response.data,
        };

        console.log(`✅ [${context.agentName}] Raise successful - New bet: ${input.amount} USDC`);
        if (result.data?.transactionHash) {
          console.log(`   TX: ${result.data.transactionHash}`);
        }

        // Emit action response event
        await context.emitEvent(input.gameId, 'poker_action_response', {
          action: 'raise',
          result: result.data,
        });

        return JSON.stringify(result);
      } catch (error: unknown) {
        const errorMessage = axios.isAxiosError(error)
          ? (error.response?.data?.error || error.message)
          : (error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ [${context.agentName}] Raise failed:`, errorMessage);

        // Include server error details if available
        if (axios.isAxiosError(error) && error.response?.data) {
          return JSON.stringify({
            success: false,
            error: errorMessage,
            details: error.response.data.details,
          });
        }

        return JSON.stringify({ success: false, error: errorMessage });
      }
    },
    {
      name: 'raise',
      description: 'Increase the current bet to a higher amount. This requires an x402 payment equal to (newAmount - yourCurrentBet). Amount must be at least currentBet + minimumRaise. Use this to apply pressure or protect a strong hand. The server will automatically handle the blockchain payment via x402.',
      parameters: {
        type: 'object',
        properties: {
          gameId: {
            type: 'string',
            description: 'The poker game identifier',
          },
          amount: {
            type: 'number',
            description: 'The new total bet amount in USDC (must be >= currentBet + minimumRaise)',
          },
          reasoning: {
            type: 'string',
            description: 'Your strategic reasoning for raising to this amount',
          },
        },
        required: ['gameId', 'amount', 'reasoning'],
      },
    }
  );
}

/**
 * Fold Tool
 * Forfeit the hand (no payment required)
 */
function createFoldTool(context: PokerToolContext): FunctionTool {
  return FunctionTool.from(
    async (input: { gameId: string; reasoning: string }) => {
      console.log(`\n🏳️ [${context.agentName}] Folding...`);
      console.log(`📝 [${context.agentName}] Reasoning: ${input.reasoning}`);

      // Emit action initiated event
      await context.emitEvent(input.gameId, 'poker_action_initiated', {
        action: 'fold',
        reasoning: input.reasoning,
      });

      try {
        const response = await axios.post(
          `${context.serverUrl}/api/poker/${input.gameId}/action`,
          { action: 'fold', reasoning: input.reasoning },
          {
            headers: {
              'X-Agent-ID': context.agentName,
              'X-ACTION': 'fold',
            },
          }
        );

        const result: ActionResponse = {
          success: true,
          data: response.data,
        };

        console.log(`✅ [${context.agentName}] Fold successful - Hand forfeited`);

        // Emit action response event
        await context.emitEvent(input.gameId, 'poker_action_response', {
          action: 'fold',
          result: result.data,
        });

        return JSON.stringify(result);
      } catch (error: unknown) {
        const errorMessage = axios.isAxiosError(error)
          ? (error.response?.data?.error || error.message)
          : (error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ [${context.agentName}] Fold failed:`, errorMessage);
        return JSON.stringify({ success: false, error: errorMessage });
      }
    },
    {
      name: 'fold',
      description: 'Forfeit your hand and exit the current round. This is a free action with no payment required. You will lose any chips you have already bet this hand. Use this when your hand is weak and the cost to continue is too high.',
      parameters: {
        type: 'object',
        properties: {
          gameId: {
            type: 'string',
            description: 'The poker game identifier',
          },
          reasoning: {
            type: 'string',
            description: 'Your strategic reasoning for folding',
          },
        },
        required: ['gameId', 'reasoning'],
      },
    }
  );
}
