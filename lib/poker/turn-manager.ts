/**
 * Turn Management
 *
 * Manages whose turn it is and enforces turn order:
 * - Tracks current player
 * - Advances to next player after actions
 * - Handles turn timeouts
 * - Broadcasts turn events
 */

import { getPokerGame, updateGameState } from '../poker-db';
import { storePokerEvent } from '../db';
import type { PlayerState } from '@/types/poker';

// Turn timeout in milliseconds (30 seconds)
export const TURN_TIMEOUT_MS = 30_000;

// ============================================================================
// TURN TRACKING
// ============================================================================

/**
 * Gets whose turn it is
 * @param gameId - Game identifier
 * @returns Object with current player info and timeout data
 */
export async function getCurrentTurn(gameId: string): Promise<{
  currentPlayerIndex: number;
  currentPlayer: {
    agentId: string;
    agentName: string;
  } | null;
  turnStartedAt: Date | null;
  timeoutAt: Date | null;
  secondsRemaining: number | null;
}> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const currentPlayer = game.players[game.currentPlayerIndex];

  // Get turn started time from last action or hand start
  // For now, we'll calculate based on last update
  const turnStartedAt = game.updatedAt;
  const timeoutAt = new Date(turnStartedAt.getTime() + TURN_TIMEOUT_MS);
  const now = new Date();
  const secondsRemaining = Math.max(0, Math.floor((timeoutAt.getTime() - now.getTime()) / 1000));

  return {
    currentPlayerIndex: game.currentPlayerIndex,
    currentPlayer: currentPlayer ? {
      agentId: currentPlayer.agentId,
      agentName: currentPlayer.agentName,
    } : null,
    turnStartedAt,
    timeoutAt,
    secondsRemaining,
  };
}

// ============================================================================
// TURN ADVANCEMENT
// ============================================================================

/**
 * Advances to the next player's turn
 * Handles turn order for heads-up poker:
 * - Preflop: Small blind acts first, then big blind
 * - Post-flop: Big blind acts first
 *
 * @param gameId - Game identifier
 */
export async function advanceToNextPlayer(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const activePlayers = game.players.filter((p: PlayerState) => p.status === 'active');
  if (activePlayers.length <= 1) {
    // No need to advance if only one active player
    return;
  }

  // In heads-up poker with 2 players, just toggle between them
  const nextPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;

  // Skip folded players (if any)
  let searchIndex = nextPlayerIndex;
  let attempts = 0;
  while (game.players[searchIndex].status !== 'active' && attempts < game.players.length) {
    searchIndex = (searchIndex + 1) % game.players.length;
    attempts++;
  }

  if (game.players[searchIndex].status !== 'active') {
    // No active players found (shouldn't happen)
    console.error(`[Turn Manager] No active players found in game ${gameId}`);
    return;
  }

  const nextPlayer = game.players[searchIndex];

  await updateGameState(gameId, {
    currentPlayerIndex: searchIndex,
    updatedAt: new Date(), // Reset turn timer
  });

  console.log(`🔄 [Turn Manager] Advanced to ${nextPlayer.agentName}'s turn`);
}

/**
 * Resets turn to first player for new betting round
 * In heads-up:
 * - Preflop: Small blind (dealer) acts first
 * - Post-flop: Big blind (non-dealer) acts first
 *
 * @param gameId - Game identifier
 */
export async function resetTurnForNewRound(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  let firstToAct: number;

  if (game.bettingRound === 'preflop') {
    // Preflop: Small blind (dealer in heads-up) acts first
    firstToAct = game.dealerPosition;
  } else {
    // Post-flop: Big blind (non-dealer) acts first
    firstToAct = (game.dealerPosition + 1) % 2;
  }

  // Make sure first player is active
  if (game.players[firstToAct].status !== 'active') {
    // If first player is not active, find next active player
    const activePlayers = game.players.filter((p: PlayerState) => p.status === 'active');
    if (activePlayers.length > 0) {
      firstToAct = game.players.indexOf(activePlayers[0]);
    }
  }

  await updateGameState(gameId, {
    currentPlayerIndex: firstToAct,
    updatedAt: new Date(),
  });

  console.log(`🔄 [Turn Manager] Reset turn to ${game.players[firstToAct].agentName} for ${game.bettingRound}`);
}

// ============================================================================
// TIMEOUT HANDLING
// ============================================================================

/**
 * Checks if current player's turn has timed out
 * @param gameId - Game identifier
 * @returns True if turn has timed out
 */
export async function hasCurrentTurnTimedOut(gameId: string): Promise<boolean> {
  const turnInfo = await getCurrentTurn(gameId);

  if (!turnInfo.secondsRemaining) {
    return false;
  }

  return turnInfo.secondsRemaining <= 0;
}

/**
 * Auto-folds the current player due to timeout
 * Called when a player fails to act within the timeout period
 *
 * @param gameId - Game identifier
 */
export async function autoFoldForTimeout(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const currentPlayer = game.players[game.currentPlayerIndex];

  console.log(`⏱️ [Turn Manager] Auto-folding ${currentPlayer.agentName} due to timeout`);

  // Update player status to folded
  const players = game.players.map((p: PlayerState, idx: number) =>
    idx === game.currentPlayerIndex
      ? { ...p, status: 'folded' as const }
      : p
  );

  await updateGameState(gameId, {
    players,
  });

  // Broadcast timeout fold event
  await storePokerEvent(gameId, 'action_taken', {
    gameId,
    handNumber: game.handNumber,
    bettingRound: game.bettingRound,
    agentId: currentPlayer.agentId,
    agentName: currentPlayer.agentName,
    action: 'fold',
    chipStackAfter: currentPlayer.chipStack,
    potAfter: game.pot,
    currentBetAfter: game.currentBet,
  });

  console.log(`✅ [Turn Manager] ${currentPlayer.agentName} auto-folded`);
}

// ============================================================================
// TURN NOTIFICATIONS
// ============================================================================

/**
 * Broadcasts an "action required" event to prompt the current player
 * This can be polled by agents to know when it's their turn
 *
 * @param gameId - Game identifier
 */
export async function notifyCurrentPlayer(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const currentPlayer = game.players[game.currentPlayerIndex];
  const turnInfo = await getCurrentTurn(gameId);

  // This could be used to send push notifications or other alerts
  console.log(`🔔 [Turn Manager] It's ${currentPlayer.agentName}'s turn (${turnInfo.secondsRemaining}s remaining)`);
}
