/**
 * Hand Evaluator for Poker
 * Uses pokersolver library to evaluate poker hands
 * Wraps pokersolver to match our type system
 */

import { Hand } from 'pokersolver';
import type { Card, HandRank, HandRankType } from '@/types/poker';

// ============================================================================
// TYPE CONVERSION
// ============================================================================

/**
 * Converts our Card type to pokersolver's string format
 * pokersolver expects format like "Ah" (Ace of hearts), "Ts" (Ten of spades)
 * @param card - Our Card object
 * @returns String in pokersolver format
 */
function cardToPokersolverString(card: Card): string {
  // Map our rank to pokersolver format
  const rankMap: Record<string, string> = {
    '10': 'T', // Ten is represented as 'T' in pokersolver
    'J': 'J',
    'Q': 'Q',
    'K': 'K',
    'A': 'A',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
  };

  // Map our suit to pokersolver format (first letter lowercase)
  const suitMap: Record<string, string> = {
    'hearts': 'h',
    'diamonds': 'd',
    'clubs': 'c',
    'spades': 's',
  };

  return rankMap[card.rank] + suitMap[card.suit];
}

/**
 * Converts an array of our Cards to pokersolver format
 * @param cards - Array of our Card objects
 * @returns Array of strings in pokersolver format
 */
function cardsToPokersolverFormat(cards: Card[]): string[] {
  return cards.map(cardToPokersolverString);
}

// ============================================================================
// HAND RANK MAPPING
// ============================================================================

/**
 * Maps pokersolver hand rank names to our HandRankType enum
 */
function getHandRankType(pokersolverRankName: string): HandRankType {
  const rankMap: Record<string, HandRankType> = {
    'Royal Flush': 9,
    'Straight Flush': 8,
    'Four of a Kind': 7,
    'Full House': 6,
    'Flush': 5,
    'Straight': 4,
    'Three of a Kind': 3,
    'Two Pair': 2,
    'Pair': 1,
    'High Card': 0,
  };

  return rankMap[pokersolverRankName] ?? 0;
}

/**
 * Checks if a straight flush is actually a royal flush
 */
function isRoyalFlush(pokersolverHand: any): boolean {
  // Royal flush is A-K-Q-J-10 of the same suit
  // pokersolver calls it "Straight Flush" but we can detect it
  if (pokersolverHand.name === 'Straight Flush') {
    const cards = pokersolverHand.cards || [];
    // Check if it contains an Ace and starts with 10
    const hasAce = cards.some((c: any) => c.value === '14' || c.value === 'A');
    const hasTen = cards.some((c: any) => c.value === '10' || c.value === 'T');
    return hasAce && hasTen;
  }
  return false;
}

/**
 * Generates a unique comparable value for a hand
 * Higher value = better hand
 * Format: [HandRankType * 100000000] + [card values for tiebreaking]
 */
function calculateHandValue(pokersolverHand: any): number {
  let rankType = getHandRankType(pokersolverHand.name);

  // Check for royal flush (pokersolver doesn't distinguish it from straight flush)
  if (isRoyalFlush(pokersolverHand)) {
    rankType = 9; // Royal Flush
  }

  // pokersolver has a 'rank' that's a unique number for each possible hand
  // The higher the rank, the better the hand
  // We multiply rankType by a large number to ensure different types don't overlap
  // pokersolver's rank goes up to around 7462 for worst high card
  const baseValue = (rankType * 100000000);

  // Use pokersolver's rank directly - it's designed to be comparable within same hand type
  // Note: In pokersolver, LOWER rank number = BETTER hand (rank 1 = royal flush)
  // So we need to invert it: subtract from max rank value
  const invertedRank = 10000 - (pokersolverHand.rank || 0);

  return baseValue + invertedRank;
}

// ============================================================================
// HAND EVALUATION
// ============================================================================

/**
 * Evaluates a poker hand from a set of cards
 * @param cards - Array of 5-7 cards (can be hole cards + community cards)
 * @returns HandRank with type, name, value, and description
 * @throws Error if cards array is invalid (< 5 cards or > 7 cards)
 */
export function evaluateHand(cards: Card[]): HandRank {
  // Validate input
  if (cards.length < 5) {
    throw new Error(`Cannot evaluate hand with fewer than 5 cards (got ${cards.length})`);
  }

  if (cards.length > 7) {
    throw new Error(`Cannot evaluate hand with more than 7 cards (got ${cards.length})`);
  }

  // Convert to pokersolver format
  const pokersolverCards = cardsToPokersolverFormat(cards);

  // Use pokersolver to find best hand
  const hand = Hand.solve(pokersolverCards);

  // Check if it's a royal flush
  const isRoyal = isRoyalFlush(hand);

  // Convert back to our type system
  const handRank: HandRank = {
    type: isRoyal ? 9 : getHandRankType(hand.name),
    name: isRoyal ? 'Royal Flush' : hand.name,
    value: calculateHandValue(hand),
    description: isRoyal ? 'Royal Flush, A to 10' : hand.descr,
  };

  return handRank;
}

/**
 * Compares two hands to determine winner
 * Uses proper poker hand comparison including tiebreakers
 * @param hand1 - First hand to compare
 * @param hand2 - Second hand to compare
 * @returns Positive if hand1 wins, negative if hand2 wins, 0 if tie
 */
export function compareHands(hand1: HandRank, hand2: HandRank): number {
  // Compare by hand type first
  if (hand1.type !== hand2.type) {
    return hand1.type - hand2.type;
  }

  // For same type, use value which includes pokersolver's rank
  // Higher rank in pokersolver means better hand
  const diff = hand1.value - hand2.value;

  // Ensure we return the correct sign
  return diff;
}

/**
 * Evaluates multiple hands and determines the winner(s)
 * @param hands - Array of card arrays to evaluate
 * @returns Array of indices of winning hands (can be multiple in case of tie)
 */
export function determineWinners(hands: Card[][]): number[] {
  if (hands.length === 0) {
    return [];
  }

  // Convert to pokersolver format and solve
  const pokersolverHands = hands.map((cards) =>
    Hand.solve(cardsToPokersolverFormat(cards))
  );

  // Use pokersolver's built-in winners() method for accurate comparison
  const winningHands = Hand.winners(pokersolverHands);

  // Find indices of winning hands
  const winners: number[] = [];
  for (let i = 0; i < pokersolverHands.length; i++) {
    if (winningHands.includes(pokersolverHands[i])) {
      winners.push(i);
    }
  }

  return winners;
}

/**
 * Evaluates the best 5-card hand from hole cards and community cards
 * This is the main function agents will use during showdown
 * @param holeCards - Player's 2 hole cards
 * @param communityCards - 5 community cards (can be 3 for flop, 4 for turn, 5 for river)
 * @returns HandRank of the best possible 5-card hand
 */
export function evaluateBestHand(holeCards: [Card, Card], communityCards: Card[]): HandRank {
  // Combine hole cards and community cards
  const allCards = [...holeCards, ...communityCards];

  // pokersolver automatically finds the best 5-card combination
  return evaluateHand(allCards);
}

/**
 * Gets a human-readable hand strength description
 * @param handRank - The evaluated hand
 * @returns String like "Strong hand" or "Weak hand"
 */
export function getHandStrength(handRank: HandRank): string {
  if (handRank.type >= 8) return 'Very Strong'; // Straight Flush or Royal Flush
  if (handRank.type >= 6) return 'Strong'; // Four of a Kind or Full House
  if (handRank.type >= 4) return 'Good'; // Flush or Straight
  if (handRank.type >= 2) return 'Moderate'; // Three of a Kind or Two Pair
  if (handRank.type >= 1) return 'Weak'; // Pair
  return 'Very Weak'; // High Card
}

/**
 * Checks if a hand is a made hand (pair or better)
 * @param handRank - The evaluated hand
 * @returns true if pair or better, false if just high card
 */
export function isMadeHand(handRank: HandRank): boolean {
  return handRank.type >= 1;
}

/**
 * Quick utility to evaluate and compare two players' hands
 * Returns the winner's player index (0 or 1) or -1 for tie
 */
export function comparePlayerHands(
  player1HoleCards: [Card, Card],
  player2HoleCards: [Card, Card],
  communityCards: Card[]
): { winner: number; player1Hand: HandRank; player2Hand: HandRank } {
  const player1Hand = evaluateBestHand(player1HoleCards, communityCards);
  const player2Hand = evaluateBestHand(player2HoleCards, communityCards);

  const comparison = compareHands(player1Hand, player2Hand);

  return {
    winner: comparison > 0 ? 0 : comparison < 0 ? 1 : -1,
    player1Hand,
    player2Hand,
  };
}
