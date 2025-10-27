/**
 * Hand Lifecycle Manager
 *
 * Manages the lifecycle of poker hands:
 * - Starting new hands (dealing cards, posting blinds)
 * - Checking if betting rounds are complete
 * - Advancing between betting rounds
 * - Initiating showdown
 * - Checking if game is over
 */

import { getPokerGame, updateGameState } from '../poker-db';
import { createDeck, shuffleDeck, dealCards } from './cards';
import { storePokerEvent } from '../db';
import { completeHandWithPayout } from './payout';
import { getSmallBlindAmount, getBigBlindAmount } from '../x402-poker-config';
import { resetTurnForNewRound } from './turn-manager';
import type { Card, BettingRound, PlayerState } from '@/types/poker';

// ============================================================================
// START NEW HAND
// ============================================================================

/**
 * Starts a new hand in the game
 * - Rotates dealer position
 * - Creates and shuffles deck
 * - Deals 2 hole cards to each player
 * - Resets bets and community cards
 * - Broadcasts hand_started event with hole cards
 *
 * @param gameId - Game identifier
 * @returns Updated game state
 */
export async function startNewHand(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  console.log(`\n🎴 [Hand Manager] Starting new hand for game ${gameId}`);

  // Increment hand number
  const handNumber = game.handNumber + 1;

  // Rotate dealer position (alternates between 0 and 1 for 2 players)
  const dealerPosition = handNumber % 2;
  const smallBlindPosition = dealerPosition; // In heads-up, dealer is small blind
  const bigBlindPosition = (dealerPosition + 1) % 2;

  // Create and shuffle new deck
  const deck = shuffleDeck(createDeck());

  // Deal 2 cards to each player
  const player0Cards = dealCards(deck, 2);
  const player1Cards = dealCards(deck, 2);

  // Update player states
  const players = game.players.map((player: PlayerState, idx: number) => ({
    ...player,
    cards: idx === 0 ? (player0Cards as [Card, Card]) : (player1Cards as [Card, Card]),
    currentBet: 0,
    totalBetThisHand: 0,
    status: 'active' as const,
    isDealer: idx === dealerPosition,
    isSmallBlind: idx === smallBlindPosition,
    isBigBlind: idx === bigBlindPosition,
  }));

  // Update game state
  await updateGameState(gameId, {
    handNumber,
    deck,
    communityCards: [],
    pot: 0,
    currentBet: 0,
    bettingRound: 'preflop',
    dealerPosition,
    currentPlayerIndex: smallBlindPosition, // Small blind acts first pre-flop
    players,
    gameStatus: 'in_progress',
  });

  // Set initial turn order for preflop
  await resetTurnForNewRound(gameId);

  // Broadcast hand_started event with hole cards for spectator view
  await storePokerEvent(gameId, 'hand_started', {
    gameId,
    handNumber,
    dealerPosition,
    smallBlindPlayer: players[smallBlindPosition].agentId,
    bigBlindPlayer: players[bigBlindPosition].agentId,
    smallBlindAmount: getSmallBlindAmount(),
    bigBlindAmount: getBigBlindAmount(),
    players: players.map((p: PlayerState) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      chipStack: p.chipStack,
      position: p.position,
      holeCards: p.cards as [Card, Card],
    })),
  });

  console.log(`✅ [Hand Manager] Hand #${handNumber} started`);
  console.log(`   Dealer: ${players[dealerPosition].agentName}`);
  console.log(`   Small Blind: ${players[smallBlindPosition].agentName}`);
  console.log(`   Big Blind: ${players[bigBlindPosition].agentName}`);
}

// ============================================================================
// CHECK BETTING COMPLETE
// ============================================================================

/**
 * Checks if the current betting round is complete
 * A round is complete when:
 * - All active players have acted at least once
 * - All active players have matching bets (or are all-in)
 * - OR only one active player remains (others folded)
 *
 * @param gameId - Game identifier
 * @returns True if betting round is complete
 */
export async function checkBettingComplete(gameId: string): Promise<boolean> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const activePlayers = game.players.filter((p: PlayerState) => p.status === 'active');

  // If only one active player, betting is complete (others folded)
  if (activePlayers.length <= 1) {
    return true;
  }

  // Check if all active players have acted and have matching bets
  const currentBet = game.currentBet;
  const allPlayersMatched = activePlayers.every(
    (p: PlayerState) => p.currentBet === currentBet || p.status === 'all-in'
  );

  // For preflop, ensure big blind has had a chance to act
  if (game.bettingRound === 'preflop') {
    const bigBlindPlayer = game.players.find((p: PlayerState) => p.isBigBlind);
    if (bigBlindPlayer && bigBlindPlayer.currentBet === game.bigBlind && currentBet === game.bigBlind) {
      // Big blind hasn't been raised, need to give them option to check/raise
      // This is handled by action endpoint, here we just check if bets match
      return false;
    }
  }

  return allPlayersMatched;
}

// ============================================================================
// ADVANCE TO NEXT ROUND
// ============================================================================

/**
 * Advances the game to the next betting round
 * - Preflop → Flop (deal 3 cards)
 * - Flop → Turn (deal 1 card)
 * - Turn → River (deal 1 card)
 * - River → Showdown
 *
 * Resets current bets and broadcasts cards_dealt event
 *
 * @param gameId - Game identifier
 */
export async function advanceToNextRound(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  console.log(`\n🎲 [Hand Manager] Advancing from ${game.bettingRound}`);

  const roundOrder: BettingRound[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const currentIndex = roundOrder.indexOf(game.bettingRound);
  const nextRound = roundOrder[currentIndex + 1];

  if (!nextRound) {
    throw new Error(`Cannot advance beyond ${game.bettingRound}`);
  }

  let newCommunityCards = [...game.communityCards];
  const cardsToReveal: Card[] = [];

  // Deal community cards based on next round
  if (nextRound === 'flop') {
    // Deal 3 cards for the flop
    const flopCards = dealCards(game.deck, 3);
    newCommunityCards = flopCards;
    cardsToReveal.push(...flopCards);
  } else if (nextRound === 'turn') {
    // Deal 1 card for the turn
    const turnCard = dealCards(game.deck, 1);
    newCommunityCards.push(...turnCard);
    cardsToReveal.push(...turnCard);
  } else if (nextRound === 'river') {
    // Deal 1 card for the river
    const riverCard = dealCards(game.deck, 1);
    newCommunityCards.push(...riverCard);
    cardsToReveal.push(...riverCard);
  }

  // Reset player bets for new round
  const players = game.players.map((p: PlayerState) => ({
    ...p,
    currentBet: 0,
  }));

  // Update game state (including deck to persist dealt cards)
  await updateGameState(gameId, {
    bettingRound: nextRound,
    communityCards: newCommunityCards,
    currentBet: 0,
    players,
    deck: game.deck, // CRITICAL: Persist deck state after dealing cards
  });

  // Set turn order for new betting round
  await resetTurnForNewRound(gameId);

  // Broadcast cards dealt event
  if (cardsToReveal.length > 0) {
    await storePokerEvent(gameId, 'cards_dealt', {
      gameId,
      handNumber: game.handNumber,
      bettingRound: nextRound,
      cards: cardsToReveal,
      communityCards: newCommunityCards,
      pot: game.pot,
    });
  }

  // Broadcast betting round complete event
  await storePokerEvent(gameId, 'betting_round_complete', {
    gameId,
    handNumber: game.handNumber,
    completedRound: game.bettingRound,
    nextRound,
    pot: game.pot,
  });

  console.log(`✅ [Hand Manager] Advanced to ${nextRound}`);
  if (cardsToReveal.length > 0) {
    console.log(`   Cards dealt: ${cardsToReveal.length}`);
  }
}

// ============================================================================
// INITIATE SHOWDOWN
// ============================================================================

/**
 * Initiates showdown - compares hands and awards pot
 * Uses the payout system to determine winner and distribute chips
 *
 * @param gameId - Game identifier
 */
export async function initiateShowdown(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  console.log(`\n🃏 [Hand Manager] Initiating showdown for hand #${game.handNumber}`);

  // Get active players who made it to showdown
  const activePlayers = game.players.filter((p: PlayerState) => p.status === 'active');

  // Broadcast showdown event with all players' cards
  await storePokerEvent(gameId, 'showdown', {
    gameId,
    handNumber: game.handNumber,
    communityCards: game.communityCards,
    players: activePlayers.map((p: PlayerState) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      holeCards: p.cards as [Card, Card],
      handRank: { type: 0, name: 'Unknown', value: 0, description: 'To be evaluated' }, // Will be evaluated in payout
      chipStack: p.chipStack,
    })),
    pot: game.pot,
  });

  // Complete hand with payout (determines winner, pays out, broadcasts hand_complete)
  await completeHandWithPayout(gameId);

  console.log(`✅ [Hand Manager] Showdown complete`);
}

// ============================================================================
// CHECK GAME OVER
// ============================================================================

/**
 * Checks if the game is over
 * Game ends when one or more players have 0 chips
 *
 * @param gameId - Game identifier
 * @returns True if game is over
 */
export async function checkGameOver(gameId: string): Promise<boolean> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  // Check if any player has run out of chips
  const playersWithChips = game.players.filter((p: PlayerState) => p.chipStack > 0);

  if (playersWithChips.length <= 1) {
    console.log(`🏆 [Hand Manager] Game over! Only ${playersWithChips.length} player(s) with chips`);
    return true;
  }

  return false;
}
