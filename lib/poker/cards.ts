/**
 * Card Utilities for Poker Game
 * Handles deck creation, shuffling, and dealing with cryptographic randomness
 */

import type { Card, Suit, Rank } from '@/types/poker';
import { webcrypto } from 'node:crypto';

// ============================================================================
// CONSTANTS
// ============================================================================

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// ============================================================================
// DECK CREATION
// ============================================================================

/**
 * Creates a standard 52-card deck
 * @returns Array of 52 cards in deterministic order
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}

// ============================================================================
// CRYPTOGRAPHIC SHUFFLING
// ============================================================================

/**
 * Generates a cryptographically secure random integer between min and max (inclusive)
 * Uses Web Crypto API for secure randomness
 */
function getSecureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = Math.pow(256, bytesNeeded);
  const randomBuffer = new Uint8Array(bytesNeeded);

  // Generate random bytes until we get a value in our range
  // This prevents modulo bias
  let randomValue: number;
  do {
    webcrypto.getRandomValues(randomBuffer);
    randomValue = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = (randomValue << 8) + randomBuffer[i];
    }
  } while (randomValue >= maxValue - (maxValue % range));

  return min + (randomValue % range);
}

/**
 * Shuffles a deck using Fisher-Yates algorithm with cryptographic randomness
 * This ensures unbiased, secure shuffling
 * @param deck - Array of cards to shuffle
 * @returns Shuffled copy of the deck (does not mutate original)
 */
export function shuffleDeck(deck: Card[]): Card[] {
  // Create a copy to avoid mutating the original
  const shuffled = [...deck];

  // Fisher-Yates shuffle with cryptographic randomness
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(0, i);

    // Swap elements
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

// ============================================================================
// DEALING CARDS
// ============================================================================

/**
 * Deals cards from a deck
 * @param deck - The deck to deal from (will be mutated - cards removed)
 * @param count - Number of cards to deal
 * @returns Array of dealt cards
 * @throws Error if not enough cards in deck
 */
export function dealCards(deck: Card[], count: number): Card[] {
  if (deck.length < count) {
    throw new Error(`Cannot deal ${count} cards from deck with only ${deck.length} cards remaining`);
  }

  // Remove and return cards from the end of the deck
  return deck.splice(-count, count);
}

/**
 * Deals a specific number of cards to each player
 * @param deck - The deck to deal from (will be mutated)
 * @param playerCount - Number of players
 * @param cardsPerPlayer - Number of cards each player receives
 * @returns Array of arrays, one for each player
 * @throws Error if not enough cards in deck
 */
export function dealToPlayers(deck: Card[], playerCount: number, cardsPerPlayer: number): Card[][] {
  const totalCardsNeeded = playerCount * cardsPerPlayer;

  if (deck.length < totalCardsNeeded) {
    throw new Error(
      `Cannot deal ${cardsPerPlayer} cards to ${playerCount} players. ` +
      `Need ${totalCardsNeeded} cards but deck has only ${deck.length}`
    );
  }

  const hands: Card[][] = [];

  // Deal cards in round-robin fashion (like real poker)
  for (let i = 0; i < cardsPerPlayer; i++) {
    for (let j = 0; j < playerCount; j++) {
      if (!hands[j]) {
        hands[j] = [];
      }
      hands[j].push(deck.pop()!);
    }
  }

  return hands;
}

// ============================================================================
// CARD UTILITIES
// ============================================================================

/**
 * Converts a card to a human-readable string
 * @param card - The card to format
 * @returns String like "A♠" or "10♥"
 */
export function cardToString(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };

  return `${card.rank}${suitSymbols[card.suit]}`;
}

/**
 * Converts an array of cards to a readable string
 * @param cards - Array of cards
 * @returns String like "A♠ K♥ Q♦"
 */
export function cardsToString(cards: Card[]): string {
  return cards.map(cardToString).join(' ');
}

/**
 * Creates a new shuffled deck ready for a new hand
 * Convenience function that combines createDeck() and shuffleDeck()
 * @returns Freshly shuffled 52-card deck
 */
export function createShuffledDeck(): Card[] {
  return shuffleDeck(createDeck());
}

/**
 * Gets the numeric value of a rank for comparison purposes
 * @param rank - Card rank
 * @returns Numeric value (2-14, where Ace=14)
 */
export function getRankValue(rank: Rank): number {
  const rankValues: Record<Rank, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14,
  };

  return rankValues[rank];
}

/**
 * Compares two cards by rank
 * @returns Positive if card1 > card2, negative if card1 < card2, 0 if equal
 */
export function compareCardRanks(card1: Card, card2: Card): number {
  return getRankValue(card1.rank) - getRankValue(card2.rank);
}
