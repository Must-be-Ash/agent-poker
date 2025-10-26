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
 * Generates a unique comparable value for a hand
 * Higher value = better hand
 * Format: [HandRankType * 1000000] + [tiebreaker value]
 */
function calculateHandValue(pokersolverHand: any): number {
  const rankType = getHandRankType(pokersolverHand.name);

  // pokersolver already provides a comparable rank value
  // We combine it with our rank type for a unique comparable value
  // Multiply rank type by 1,000,000 to ensure different hand types don't overlap
  return (rankType * 1000000) + (pokersolverHand.rank || 0);
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

  // Convert back to our type system
  const handRank: HandRank = {
    type: getHandRankType(hand.name),
    name: hand.name,
    value: calculateHandValue(hand),
    description: hand.descr, // pokersolver provides detailed description
  };

  return handRank;
}

/**
 * Compares two hands to determine winner
 * @param hand1 - First hand to compare
 * @param hand2 - Second hand to compare
 * @returns Positive if hand1 wins, negative if hand2 wins, 0 if tie
 */
export function compareHands(hand1: HandRank, hand2: HandRank): number {
  return hand1.value - hand2.value;
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

  // Evaluate all hands
  const evaluatedHands = hands.map((cards) => evaluateHand(cards));

  // Find the best hand value
  const bestValue = Math.max(...evaluatedHands.map((h) => h.value));

  // Return indices of all hands that match the best value (handles ties)
  const winners: number[] = [];
  for (let i = 0; i < evaluatedHands.length; i++) {
    if (evaluatedHands[i].value === bestValue) {
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
