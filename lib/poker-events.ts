/**
 * Poker Event System
 *
 * Defines event types for real-time poker game broadcasts via SSE.
 * Events are emitted during game flow and streamed to frontend clients.
 */

import type { Card, BettingRound, PokerActionType, HandRank } from '@/types/poker';

// ============================================================================
// EVENT TYPE DEFINITIONS
// ============================================================================

/**
 * All possible poker event types
 */
export type PokerEventType =
  | 'hand_started'
  | 'cards_dealt'
  | 'agent_thinking'
  | 'action_taken'
  | 'betting_round_complete'
  | 'showdown'
  | 'hand_complete'
  | 'game_ended'
  | 'agent_reflection'
  | 'agent_decision_complete'
  | 'blind_posted'
  | 'blind_required'
  | 'payout'
  | 'split_pot'
  | 'refund'
  | 'agent_tool_call'
  | 'agent_tool_response'
  | 'poker_action_initiated'
  | 'poker_action_response'
  | 'agent_joined'
  | 'agent_error'
  | 'agent_balance_check'
  | 'agent_waiting'
  | 'poker_web_search_initiated'
  | 'poker_web_search_completed';

// ============================================================================
// INDIVIDUAL EVENT PAYLOADS
// ============================================================================

/**
 * Event: New hand started
 * Emitted when a new hand begins and cards are dealt to players
 */
export interface HandStartedEvent {
  gameId: string;
  handNumber: number;
  dealerPosition: number;
  smallBlindPlayer: string;
  bigBlindPlayer: string;
  smallBlindAmount: number;
  bigBlindAmount: number;
  players: {
    agentId: string;
    agentName: string;
    chipStack: number;
    position: number;
    holeCards: [Card, Card]; // Include hole cards for spectator view
  }[];
  timestamp: Date;
}

/**
 * Event: Community cards dealt
 * Emitted when flop/turn/river cards are revealed
 */
export interface CardsDealtEvent {
  gameId: string;
  handNumber: number;
  bettingRound: BettingRound;
  cards: Card[];
  communityCards: Card[]; // Full set of community cards shown so far
  pot: number;
  timestamp: Date;
}

/**
 * Event: Agent thinking
 * Emitted when an agent is analyzing the game state
 */
export interface AgentThinkingEvent {
  gameId: string;
  handNumber: number;
  bettingRound: BettingRound;
  agentId: string;
  agentName: string;
  chipStack: number;
  pot: number;
  currentBet: number;
  timestamp: Date;
}

/**
 * Event: Action taken by player
 * Emitted after a player performs an action (check/call/bet/raise/fold)
 */
export interface ActionTakenEvent {
  gameId: string;
  handNumber: number;
  bettingRound: BettingRound;
  agentId: string;
  agentName: string;
  action: PokerActionType;
  amount?: number;
  chipStackAfter: number;
  potAfter: number;
  currentBetAfter: number;
  transactionHash?: string; // On-chain transaction hash for payment actions
  timestamp: Date;
}

/**
 * Event: Betting round complete
 * Emitted when a betting round ends and game advances
 */
export interface BettingRoundCompleteEvent {
  gameId: string;
  handNumber: number;
  completedRound: BettingRound;
  nextRound: BettingRound;
  pot: number;
  timestamp: Date;
}

/**
 * Event: Showdown
 * Emitted when remaining players reveal their cards
 */
export interface ShowdownEvent {
  gameId: string;
  handNumber: number;
  communityCards: Card[];
  players: {
    agentId: string;
    agentName: string;
    holeCards: [Card, Card];
    handRank: HandRank;
    chipStack: number;
  }[];
  pot: number;
  timestamp: Date;
}

/**
 * Event: Hand complete
 * Emitted when a hand ends and winner is determined
 */
export interface HandCompleteEvent {
  gameId: string;
  handNumber: number;
  winnerId: string;
  winnerName: string;
  winningHand?: HandRank; // Optional - may not exist if everyone folded
  amountWon: number;
  reason: 'showdown' | 'all_folded';
  finalChipStacks: {
    [agentId: string]: number;
  };
  timestamp: Date;
}

/**
 * Event: Game ended
 * Emitted when one player runs out of chips or game is terminated
 */
export interface GameEndedEvent {
  gameId: string;
  winnerId: string;
  winnerName: string;
  winnerChips: number;
  loserId: string;
  loserName: string;
  handsPlayed: number;
  reason: 'knockout' | 'surrender';
  timestamp: Date;
}

/**
 * Event: Agent reflection
 * Emitted after an agent completes an action and reflects on outcome
 */
export interface AgentReflectionEvent {
  gameId: string;
  handNumber: number;
  bettingRound: BettingRound;
  agentId: string;
  agentName: string;
  reflection: string;
  chipChange: number;
  potChange: number;
  timestamp: Date;
}

/**
 * Event: Agent decision complete
 * Emitted when agent finishes thinking and makes a decision
 */
export interface AgentDecisionCompleteEvent {
  gameId: string;
  handNumber: number;
  bettingRound: BettingRound;
  agentId: string;
  agentName: string;
  reasoning: string;
  timestamp: Date;
}

/**
 * Event: Blind posted
 * Emitted when a player posts small blind or big blind
 */
export interface BlindPostedEvent {
  gameId: string;
  handNumber: number;
  agentId: string;
  agentName: string;
  blindType: 'small' | 'big';
  amount: number;
  chipStackAfter: number;
  transactionHash?: string; // On-chain transaction hash for blind payment
  timestamp: Date;
}

// ============================================================================
// UNIFIED EVENT STRUCTURE
// ============================================================================

/**
 * Union type of all event data payloads
 */
export type PokerEventData =
  | HandStartedEvent
  | CardsDealtEvent
  | AgentThinkingEvent
  | ActionTakenEvent
  | BettingRoundCompleteEvent
  | ShowdownEvent
  | HandCompleteEvent
  | GameEndedEvent
  | AgentReflectionEvent
  | AgentDecisionCompleteEvent
  | BlindPostedEvent;

/**
 * Unified event structure for SSE streaming
 */
export interface PokerEvent {
  type: PokerEventType;
  data: PokerEventData;
  timestamp: Date;
}

// ============================================================================
// EVENT CREATION HELPERS
// ============================================================================

/**
 * Creates a hand_started event
 */
export function createHandStartedEvent(data: Omit<HandStartedEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'hand_started',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates a cards_dealt event
 */
export function createCardsDealtEvent(data: Omit<CardsDealtEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'cards_dealt',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates an agent_thinking event
 */
export function createAgentThinkingEvent(data: Omit<AgentThinkingEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'agent_thinking',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates an action_taken event
 */
export function createActionTakenEvent(data: Omit<ActionTakenEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'action_taken',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates a betting_round_complete event
 */
export function createBettingRoundCompleteEvent(
  data: Omit<BettingRoundCompleteEvent, 'timestamp'>
): PokerEvent {
  return {
    type: 'betting_round_complete',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates a showdown event
 */
export function createShowdownEvent(data: Omit<ShowdownEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'showdown',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates a hand_complete event
 */
export function createHandCompleteEvent(data: Omit<HandCompleteEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'hand_complete',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates a game_ended event
 */
export function createGameEndedEvent(data: Omit<GameEndedEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'game_ended',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates an agent_reflection event
 */
export function createAgentReflectionEvent(
  data: Omit<AgentReflectionEvent, 'timestamp'>
): PokerEvent {
  return {
    type: 'agent_reflection',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates an agent_decision_complete event
 */
export function createAgentDecisionCompleteEvent(
  data: Omit<AgentDecisionCompleteEvent, 'timestamp'>
): PokerEvent {
  return {
    type: 'agent_decision_complete',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

/**
 * Creates a blind_posted event
 */
export function createBlindPostedEvent(data: Omit<BlindPostedEvent, 'timestamp'>): PokerEvent {
  return {
    type: 'blind_posted',
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
  };
}

// ============================================================================
// SSE FORMATTING
// ============================================================================

/**
 * Formats a poker event for SSE transmission
 * @param event - Poker event to format
 * @returns SSE-formatted string
 */
export function formatEventForSSE(event: PokerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Creates an SSE heartbeat/keep-alive message
 * Sent periodically to keep connection alive
 */
export function createSSEHeartbeat(): string {
  return ': heartbeat\n\n';
}

// ============================================================================
// EVENT VALIDATION
// ============================================================================

/**
 * Type guard to check if an event type is valid
 */
export function isValidPokerEventType(type: string): type is PokerEventType {
  const validTypes: PokerEventType[] = [
    'hand_started',
    'cards_dealt',
    'agent_thinking',
    'action_taken',
    'betting_round_complete',
    'showdown',
    'hand_complete',
    'game_ended',
    'agent_reflection',
    'agent_decision_complete',
    'blind_posted',
    'blind_required',
    'payout',
    'split_pot',
    'refund',
    'agent_tool_call',
    'agent_tool_response',
    'poker_action_initiated',
    'poker_action_response',
    'agent_joined',
    'agent_error',
    'agent_balance_check',
    'agent_waiting',
    'poker_web_search_initiated',
    'poker_web_search_completed',
  ];
  return validTypes.includes(type as PokerEventType);
}
