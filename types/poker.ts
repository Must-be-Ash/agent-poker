/**
 * Poker Type Definitions
 * Core types for Texas Hold'em poker game
 */

// ============================================================================
// CARD TYPES
// ============================================================================

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

// ============================================================================
// HAND RANKING TYPES
// ============================================================================

export enum HandRankType {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

export interface HandRank {
  type: HandRankType;
  name: string;
  value: number; // Comparable numeric value for determining winner
  description: string; // e.g., "Pair of Kings" or "Ace-high flush"
}

// ============================================================================
// POKER ACTIONS
// ============================================================================

export type PokerActionType = 'check' | 'call' | 'bet' | 'raise' | 'fold';

export interface PokerAction {
  type: PokerActionType;
  amount?: number; // Required for bet/raise/call
  playerId: string;
  timestamp: Date;
}

// ============================================================================
// BETTING ROUNDS
// ============================================================================

export type BettingRound = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

// ============================================================================
// PLAYER STATE
// ============================================================================

export type PlayerStatus = 'active' | 'folded' | 'all-in' | 'out';

export interface Player {
  agentId: string;
  agentName: string;
  walletAddress: string;
  chipStack: number;
  currentBet: number; // Amount bet in current betting round
  cards: [Card, Card] | null; // Hole cards (null if folded or not dealt yet)
  status: PlayerStatus;
  position: number; // 0 = dealer/button, 1 = small blind, 2 = big blind (for 2-player)
}

export interface PlayerState extends Player {
  // Extended player state for internal game management
  totalBetThisHand: number; // Total amount bet across all rounds this hand
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

// ============================================================================
// POT MANAGEMENT
// ============================================================================

export interface SidePot {
  amount: number;
  eligiblePlayers: string[]; // agentIds of players eligible to win this pot
}

// ============================================================================
// GAME STATE
// ============================================================================

export type GameStatus = 'waiting' | 'in_progress' | 'ended';

export interface ActionEvent {
  handNumber: number;
  bettingRound: BettingRound;
  action: PokerAction;
  potAfterAction: number;
  timestamp: Date;
}

export interface GameState {
  gameId: string;
  players: PlayerState[];
  deck: Card[];
  communityCards: Card[];
  pot: number; // Main pot
  sidePots: SidePot[];
  currentBet: number; // Current bet to match in this betting round
  bettingRound: BettingRound;
  dealerPosition: number; // Index of dealer in players array
  currentPlayerIndex: number; // Whose turn it is
  actionHistory: ActionEvent[];
  handNumber: number;
  gameStatus: GameStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// POKER GAME RECORD (for MongoDB)
// ============================================================================

export interface PokerGameRecord {
  gameId: string;
  players: PlayerState[];
  deck: Card[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  bettingRound: BettingRound;
  dealerPosition: number;
  currentPlayerIndex: number;
  actionHistory: ActionEvent[];
  handNumber: number;
  gameStatus: GameStatus;

  // Configuration
  smallBlind: number;
  bigBlind: number;
  startingChips: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;

  // Winner info (populated when game ends)
  winnerId?: string;
  winnerName?: string;
  finalChipCounts?: Record<string, number>;
}

// ============================================================================
// HAND RESULT
// ============================================================================

export interface HandResult {
  handNumber: number;
  winnerId: string;
  winnerName: string;
  winningHand: HandRank;
  winningCards: Card[]; // Best 5-card hand
  potWon: number;
  showdownCards?: {
    [playerId: string]: {
      holeCards: [Card, Card];
      handRank: HandRank;
    };
  };
  timestamp: Date;
}

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

export interface PokerGameConfig {
  gameId: string;
  agentAId: string;
  agentBId: string;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
}

// ============================================================================
// AGENT POKER TOOLS INPUT/OUTPUT
// ============================================================================

export interface GetGameStateResponse {
  gameId: string;
  myAgentId: string;
  myCards: [Card, Card] | null;
  myChipStack: number;
  myCurrentBet: number;
  communityCards: Card[];
  pot: number;
  currentBet: number;
  bettingRound: BettingRound;
  isMyTurn: boolean;
  opponents: {
    agentId: string;
    chipStack: number;
    currentBet: number;
    status: PlayerStatus;
  }[];
  legalActions: PokerActionType[];
  handNumber: number;
}

export interface PokerActionResult {
  success: boolean;
  message: string;
  gameState?: GetGameStateResponse;
  error?: string;
}
