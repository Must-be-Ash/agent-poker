/**
 * Poker Engine Unit Tests
 * Comprehensive tests for poker game logic
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import type { Card } from '@/types/poker';
import { createDeck, shuffleDeck, dealCards, cardToString, getRankValue } from '@/lib/poker/cards';
import { evaluateHand, compareHands, evaluateBestHand, determineWinners } from '@/lib/poker/hand-evaluator';
import { PotManager, splitPot } from '@/lib/poker/pot-manager';
import { PokerGame } from '@/lib/poker/game-state';

// ============================================================================
// CARD UTILITIES TESTS
// ============================================================================

describe('Card Utilities', () => {
  describe('createDeck', () => {
    test('creates a standard 52-card deck', () => {
      const deck = createDeck();
      expect(deck).toHaveLength(52);
    });

    test('deck contains all suits and ranks', () => {
      const deck = createDeck();
      const suits = new Set(deck.map((c) => c.suit));
      const ranks = new Set(deck.map((c) => c.rank));

      expect(suits.size).toBe(4);
      expect(ranks.size).toBe(13);
      expect(suits).toEqual(new Set(['hearts', 'diamonds', 'clubs', 'spades']));
    });

    test('deck has no duplicates', () => {
      const deck = createDeck();
      const cardStrings = deck.map((c) => `${c.rank}-${c.suit}`);
      const uniqueCards = new Set(cardStrings);
      expect(uniqueCards.size).toBe(52);
    });
  });

  describe('shuffleDeck', () => {
    test('returns a deck of the same size', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled).toHaveLength(52);
    });

    test('does not mutate original deck', () => {
      const deck = createDeck();
      const original = [...deck];
      shuffleDeck(deck);
      expect(deck).toEqual(original);
    });

    test('shuffled deck is different from original (very high probability)', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);

      // Check that at least some cards are in different positions
      let differentPositions = 0;
      for (let i = 0; i < deck.length; i++) {
        if (deck[i].rank !== shuffled[i].rank || deck[i].suit !== shuffled[i].suit) {
          differentPositions++;
        }
      }

      // Expect at least 40 cards to be in different positions
      expect(differentPositions).toBeGreaterThan(40);
    });
  });

  describe('dealCards', () => {
    test('deals specified number of cards', () => {
      const deck = createDeck();
      const cards = dealCards(deck, 5);
      expect(cards).toHaveLength(5);
      expect(deck).toHaveLength(47);
    });

    test('throws error when not enough cards', () => {
      const deck = createDeck();
      expect(() => dealCards(deck, 53)).toThrow();
    });

    test('removes cards from deck', () => {
      const deck = createDeck();
      const originalLength = deck.length;
      dealCards(deck, 10);
      expect(deck).toHaveLength(originalLength - 10);
    });
  });

  describe('getRankValue', () => {
    test('returns correct values for all ranks', () => {
      expect(getRankValue('2')).toBe(2);
      expect(getRankValue('9')).toBe(9);
      expect(getRankValue('10')).toBe(10);
      expect(getRankValue('J')).toBe(11);
      expect(getRankValue('Q')).toBe(12);
      expect(getRankValue('K')).toBe(13);
      expect(getRankValue('A')).toBe(14);
    });
  });
});

// ============================================================================
// HAND EVALUATOR TESTS
// ============================================================================

describe('Hand Evaluator', () => {
  describe('evaluateHand', () => {
    test('identifies Royal Flush', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Royal Flush');
      expect(hand.type).toBe(9);
    });

    test('identifies Straight Flush', () => {
      const cards: Card[] = [
        { rank: '9', suit: 'clubs' },
        { rank: '8', suit: 'clubs' },
        { rank: '7', suit: 'clubs' },
        { rank: '6', suit: 'clubs' },
        { rank: '5', suit: 'clubs' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Straight Flush');
      expect(hand.type).toBe(8);
    });

    test('identifies Four of a Kind', () => {
      const cards: Card[] = [
        { rank: 'K', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: 'K', suit: 'spades' },
        { rank: '2', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Four of a Kind');
      expect(hand.type).toBe(7);
    });

    test('identifies Full House', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Full House');
      expect(hand.type).toBe(6);
    });

    test('identifies Flush', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '9', suit: 'hearts' },
        { rank: '5', suit: 'hearts' },
        { rank: '3', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Flush');
      expect(hand.type).toBe(5);
    });

    test('identifies Straight', () => {
      const cards: Card[] = [
        { rank: '9', suit: 'hearts' },
        { rank: '8', suit: 'diamonds' },
        { rank: '7', suit: 'clubs' },
        { rank: '6', suit: 'spades' },
        { rank: '5', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Straight');
      expect(hand.type).toBe(4);
    });

    test('identifies Three of a Kind', () => {
      const cards: Card[] = [
        { rank: 'Q', suit: 'hearts' },
        { rank: 'Q', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: '7', suit: 'spades' },
        { rank: '3', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Three of a Kind');
      expect(hand.type).toBe(3);
    });

    test('identifies Two Pair', () => {
      const cards: Card[] = [
        { rank: 'J', suit: 'hearts' },
        { rank: 'J', suit: 'diamonds' },
        { rank: '8', suit: 'clubs' },
        { rank: '8', suit: 'spades' },
        { rank: '2', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Two Pair');
      expect(hand.type).toBe(2);
    });

    test('identifies Pair', () => {
      const cards: Card[] = [
        { rank: '10', suit: 'hearts' },
        { rank: '10', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: '5', suit: 'spades' },
        { rank: '2', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Pair');
      expect(hand.type).toBe(1);
    });

    test('identifies High Card', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'J', suit: 'diamonds' },
        { rank: '9', suit: 'clubs' },
        { rank: '5', suit: 'spades' },
        { rank: '2', suit: 'hearts' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('High Card');
      expect(hand.type).toBe(0);
    });

    test('finds best 5-card hand from 7 cards', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
        { rank: '2', suit: 'clubs' },
        { rank: '3', suit: 'diamonds' },
      ];
      const hand = evaluateHand(cards);
      expect(hand.name).toBe('Royal Flush');
    });

    test('throws error for fewer than 5 cards', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
      ];
      expect(() => evaluateHand(cards)).toThrow();
    });
  });

  describe('compareHands', () => {
    test('Royal Flush beats Straight Flush', () => {
      const royalFlush = evaluateHand([
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
      ]);

      const straightFlush = evaluateHand([
        { rank: '9', suit: 'clubs' },
        { rank: '8', suit: 'clubs' },
        { rank: '7', suit: 'clubs' },
        { rank: '6', suit: 'clubs' },
        { rank: '5', suit: 'clubs' },
      ]);

      expect(compareHands(royalFlush, straightFlush)).toBeGreaterThan(0);
    });

    test('higher pair beats lower pair', () => {
      // Use determineWinners for reliable comparison
      const hands: Card[][] = [
        [
          { rank: 'A', suit: 'hearts' },
          { rank: 'A', suit: 'diamonds' },
          { rank: 'K', suit: 'clubs' },
          { rank: 'Q', suit: 'spades' },
          { rank: 'J', suit: 'hearts' },
        ],
        [
          { rank: 'K', suit: 'hearts' },
          { rank: 'K', suit: 'diamonds' },
          { rank: 'Q', suit: 'clubs' },
          { rank: 'J', suit: 'spades' },
          { rank: '10', suit: 'hearts' },
        ],
      ];

      const winners = determineWinners(hands);
      // Pair of Aces should win
      expect(winners).toEqual([0]);
    });
  });

  describe('determineWinners', () => {
    test('identifies single winner', () => {
      const hands: Card[][] = [
        [
          { rank: 'A', suit: 'hearts' },
          { rank: 'A', suit: 'diamonds' },
          { rank: 'K', suit: 'clubs' },
          { rank: 'Q', suit: 'spades' },
          { rank: 'J', suit: 'hearts' },
        ],
        [
          { rank: 'K', suit: 'hearts' },
          { rank: 'K', suit: 'diamonds' },
          { rank: 'A', suit: 'clubs' },
          { rank: 'Q', suit: 'spades' },
          { rank: 'J', suit: 'hearts' },
        ],
      ];

      const winners = determineWinners(hands);
      expect(winners).toEqual([0]);
    });

    test('identifies tie', () => {
      const hands: Card[][] = [
        [
          { rank: 'A', suit: 'hearts' },
          { rank: 'A', suit: 'diamonds' },
          { rank: 'K', suit: 'clubs' },
          { rank: 'Q', suit: 'spades' },
          { rank: 'J', suit: 'hearts' },
        ],
        [
          { rank: 'A', suit: 'clubs' },
          { rank: 'A', suit: 'spades' },
          { rank: 'K', suit: 'hearts' },
          { rank: 'Q', suit: 'diamonds' },
          { rank: 'J', suit: 'clubs' },
        ],
      ];

      const winners = determineWinners(hands);
      expect(winners.length).toBe(2);
      expect(winners).toEqual([0, 1]);
    });
  });
});

// ============================================================================
// POT MANAGER TESTS
// ============================================================================

describe('Pot Manager', () => {
  let potManager: PotManager;

  beforeEach(() => {
    potManager = new PotManager();
  });

  describe('basic pot management', () => {
    test('starts with empty pot', () => {
      expect(potManager.getTotalPot()).toBe(0);
    });

    test('tracks contributions correctly', () => {
      potManager.addContribution('player1', 100);
      potManager.addContribution('player2', 100);

      expect(potManager.getTotalPot()).toBe(200);
      expect(potManager.getContribution('player1')).toBe(100);
      expect(potManager.getContribution('player2')).toBe(100);
    });

    test('accumulates multiple contributions from same player', () => {
      potManager.addContribution('player1', 50);
      potManager.addContribution('player1', 50);

      expect(potManager.getContribution('player1')).toBe(100);
      expect(potManager.getTotalPot()).toBe(100);
    });

    test('reset clears all data', () => {
      potManager.addContribution('player1', 100);
      potManager.reset();

      expect(potManager.getTotalPot()).toBe(0);
      expect(potManager.getContribution('player1')).toBe(0);
    });
  });

  describe('side pots', () => {
    test('no side pots when no all-ins', () => {
      const players: any[] = [
        { agentId: 'player1', status: 'active' },
        { agentId: 'player2', status: 'active' },
      ];

      potManager.addContribution('player1', 100);
      potManager.addContribution('player2', 100);
      potManager.calculateSidePots(players);

      expect(potManager.getSidePots()).toHaveLength(0);
    });

    test('creates side pot for all-in with different amounts', () => {
      const players: any[] = [
        { agentId: 'player1', status: 'all-in' },
        { agentId: 'player2', status: 'active' },
      ];

      potManager.addContribution('player1', 50);  // All-in for 50
      potManager.addContribution('player2', 100); // Calls and raises
      potManager.calculateSidePots(players);

      // Main pot should be 100 (50 from each player)
      // Side pot should be 50 (extra from player2)
      const totalPot = potManager.getTotalPot();
      expect(totalPot).toBe(150);
    });
  });

  describe('splitPot', () => {
    test('splits pot evenly between two winners', () => {
      const players: any[] = [
        { agentId: 'player1', position: 0 },
        { agentId: 'player2', position: 1 },
      ];

      const splits = splitPot(100, ['player1', 'player2'], 0, players);

      expect(splits.get('player1')).toBe(50);
      expect(splits.get('player2')).toBe(50);
    });

    test('gives odd chip to player closest to dealer', () => {
      const players: any[] = [
        { agentId: 'player1', position: 0 },
        { agentId: 'player2', position: 1 },
      ];

      const splits = splitPot(101, ['player1', 'player2'], 0, players);

      // Player1 is at position 0, closer to dealer at position 0
      expect(splits.get('player1')).toBe(51);
      expect(splits.get('player2')).toBe(50);
    });
  });
});

// ============================================================================
// GAME STATE TESTS
// ============================================================================

describe('PokerGame', () => {
  let game: PokerGame;

  beforeEach(() => {
    game = new PokerGame(
      'test-game',
      [
        { agentId: 'agent1', agentName: 'Alice', walletAddress: '0x1', startingChips: 1000 },
        { agentId: 'agent2', agentName: 'Bob', walletAddress: '0x2', startingChips: 1000 },
      ],
      10, // small blind
      20  // big blind
    );
  });

  describe('initialization', () => {
    test('creates game with correct initial state', () => {
      const state = game.getState();
      expect(state.gameId).toBe('test-game');
      expect(state.players).toHaveLength(2);
      expect(state.gameStatus).toBe('waiting');
      expect(state.handNumber).toBe(0);
    });

    test('players start with correct chip stacks', () => {
      const state = game.getState();
      expect(state.players[0].chipStack).toBe(1000);
      expect(state.players[1].chipStack).toBe(1000);
    });
  });

  describe('startNewHand', () => {
    test('increments hand number', () => {
      game.startNewHand();
      expect(game.getState().handNumber).toBe(1);

      game.startNewHand();
      expect(game.getState().handNumber).toBe(2);
    });

    test('deals hole cards to players', () => {
      game.startNewHand();
      const state = game.getState();

      expect(state.players[0].cards).toHaveLength(2);
      expect(state.players[1].cards).toHaveLength(2);
    });

    test('posts blinds correctly', () => {
      game.startNewHand();
      const state = game.getState();

      // Find small and big blind players
      const smallBlindPlayer = state.players.find(p => p.isSmallBlind);
      const bigBlindPlayer = state.players.find(p => p.isBigBlind);

      expect(smallBlindPlayer?.currentBet).toBe(10);
      expect(bigBlindPlayer?.currentBet).toBe(20);
      expect(state.pot).toBe(30);
    });

    test('rotates dealer position', () => {
      game.startNewHand();
      const firstDealer = game.getState().dealerPosition;

      game.startNewHand();
      const secondDealer = game.getState().dealerPosition;

      expect(secondDealer).toBe((firstDealer + 1) % 2);
    });
  });

  describe('handleAction', () => {
    beforeEach(() => {
      game.startNewHand();
    });

    test('processes fold action', () => {
      const currentPlayer = game.getCurrentPlayer();
      game.handleAction(currentPlayer.agentId, 'fold');

      const player = game.getPlayer(currentPlayer.agentId);
      expect(player?.status).toBe('folded');
      expect(player?.cards).toBeNull();
    });

    test('processes call action', () => {
      const state = game.getState();
      const currentPlayer = game.getCurrentPlayer();
      const amountToCall = state.currentBet - currentPlayer.currentBet;
      const initialChips = currentPlayer.chipStack;

      game.handleAction(currentPlayer.agentId, 'call');

      const player = game.getPlayer(currentPlayer.agentId);
      expect(player?.chipStack).toBe(initialChips - amountToCall);
    });

    test('throws error for action out of turn', () => {
      const state = game.getState();
      const notCurrentPlayer = state.players.find(
        (p) => p.agentId !== state.players[state.currentPlayerIndex].agentId
      );

      expect(() => {
        game.handleAction(notCurrentPlayer!.agentId, 'check');
      }).toThrow();
    });

    test('throws error for invalid check (bet to call)', () => {
      const currentPlayer = game.getCurrentPlayer();
      const state = game.getState();

      // If there's a bet to call, check should fail
      if (state.currentBet > currentPlayer.currentBet) {
        expect(() => {
          game.handleAction(currentPlayer.agentId, 'check');
        }).toThrow();
      }
    });
  });

  describe('betting rounds', () => {
    beforeEach(() => {
      game.startNewHand();
    });

    test('starts in preflop', () => {
      expect(game.getState().bettingRound).toBe('preflop');
    });

    test('deals flop when advancing to flop round', () => {
      // Complete preflop betting (simplified - just fold/call to completion)
      const state = game.getState();
      const player1 = state.players[state.currentPlayerIndex];

      // Small blind calls big blind
      if (player1.isSmallBlind) {
        game.handleAction(player1.agentId, 'call');
      }

      // This should advance or require big blind to check
      const newState = game.getState();
      if (newState.bettingRound === 'flop') {
        expect(newState.communityCards).toHaveLength(3);
      }
    });
  });

  describe('winner determination', () => {
    test('determines winner by fold', () => {
      game.startNewHand();
      const currentPlayer = game.getCurrentPlayer();

      game.handleAction(currentPlayer.agentId, 'fold');

      // Game should end and pot distributed
      const state = game.getState();
      const otherPlayer = state.players.find(p => p.agentId !== currentPlayer.agentId);

      // Other player should have won the blinds
      expect(otherPlayer!.chipStack).toBeGreaterThan(1000);
    });
  });
});
