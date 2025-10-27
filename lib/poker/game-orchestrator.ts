/**
 * Game Orchestrator
 *
 * Automatic game progression logic:
 * - Monitors when betting rounds are complete
 * - Automatically advances to next round
 * - Triggers showdown when river betting is done
 * - Starts new hands after completion
 * - Ends game when one player has all chips
 */

import { getPokerGame } from '../poker-db';
import {
  startNewHand,
  checkBettingComplete,
  advanceToNextRound,
  initiateShowdown,
  checkGameOver,
} from './hand-manager';
import type { PlayerState } from '@/types/poker';

// ============================================================================
// AUTOMATIC GAME PROGRESSION
// ============================================================================

/**
 * Checks game state and automatically progresses if needed
 * Should be called after each player action
 *
 * This function will:
 * 1. Check if current betting round is complete
 * 2. If complete and not at river: advance to next round
 * 3. If complete and at river: initiate showdown
 * 4. After showdown: check if game is over
 * 5. If not over: start new hand
 *
 * @param gameId - Game identifier
 * @returns Object indicating what progression occurred
 */
export async function progressGameIfReady(gameId: string): Promise<{
  bettingRoundAdvanced: boolean;
  showdownInitiated: boolean;
  newHandStarted: boolean;
  gameEnded: boolean;
}> {
  const result = {
    bettingRoundAdvanced: false,
    showdownInitiated: false,
    newHandStarted: false,
    gameEnded: false,
  };

  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  // Don't progress if game is already ended
  if (game.gameStatus === 'ended') {
    result.gameEnded = true;
    return result;
  }

  // Check if only one active player (others folded)
  const activePlayers = game.players.filter((p: PlayerState) => p.status === 'active');
  if (activePlayers.length === 1) {
    console.log(`\n⚡ [Orchestrator] Only one active player, ending hand immediately`);

    // Hand ends immediately - award pot to remaining player
    await initiateShowdown(gameId);
    result.showdownInitiated = true;

    // Check if game is over
    const isGameOver = await checkGameOver(gameId);
    if (isGameOver) {
      console.log(`\n🏁 [Orchestrator] Game over!`);
      result.gameEnded = true;
      return result;
    }

    // Start new hand
    await startNewHand(gameId);
    result.newHandStarted = true;
    console.log(`\n🎴 [Orchestrator] New hand started automatically`);
    return result;
  }

  // Check if betting round is complete
  const isBettingComplete = await checkBettingComplete(gameId);
  if (!isBettingComplete) {
    // Betting still in progress, no action needed
    return result;
  }

  console.log(`\n⚡ [Orchestrator] Betting round complete: ${game.bettingRound}`);

  // Betting is complete, determine next action
  if (game.bettingRound === 'river') {
    // After river betting, go to showdown
    console.log(`   → Initiating showdown`);
    await initiateShowdown(gameId);
    result.showdownInitiated = true;

    // Check if game is over
    const isGameOver = await checkGameOver(gameId);
    if (isGameOver) {
      console.log(`\n🏁 [Orchestrator] Game over!`);
      result.gameEnded = true;
      return result;
    }

    // Start new hand
    await startNewHand(gameId);
    result.newHandStarted = true;
    console.log(`\n🎴 [Orchestrator] New hand started automatically`);
  } else if (game.bettingRound === 'showdown') {
    // Should not reach here normally, but handle it
    console.log(`   → Already at showdown`);
  } else {
    // Advance to next betting round (preflop → flop → turn → river)
    console.log(`   → Advancing to next round`);
    await advanceToNextRound(gameId);
    result.bettingRoundAdvanced = true;
  }

  return result;
}

// ============================================================================
// GAME INITIALIZATION
// ============================================================================

/**
 * Initializes a game by starting the first hand
 * Should be called after game is created in database
 *
 * @param gameId - Game identifier
 */
export async function initializeGame(gameId: string): Promise<void> {
  console.log(`\n🎮 [Orchestrator] Initializing game: ${gameId}`);

  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  // Check if already initialized
  if (game.handNumber > 0) {
    console.log(`   Game already initialized (hand #${game.handNumber})`);
    return;
  }

  // Start first hand
  await startNewHand(gameId);
  console.log(`✅ [Orchestrator] Game initialized with hand #1`);
}

// ============================================================================
// MANUAL PROGRESSION (for testing/debugging)
// ============================================================================

/**
 * Manually forces game to progress to next state
 * Useful for testing and debugging
 *
 * @param gameId - Game identifier
 * @returns Description of action taken
 */
export async function forceProgressGame(gameId: string): Promise<string> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  if (game.gameStatus === 'ended') {
    return 'Game has ended';
  }

  // Check if only one active player
  const activePlayers = game.players.filter((p: PlayerState) => p.status === 'active');
  if (activePlayers.length === 1) {
    await initiateShowdown(gameId);
    const isGameOver = await checkGameOver(gameId);
    if (isGameOver) {
      return 'Showdown completed - Game Over';
    }
    await startNewHand(gameId);
    return 'Showdown completed - New hand started';
  }

  // Force progression based on current state
  if (game.bettingRound === 'river') {
    await initiateShowdown(gameId);
    const isGameOver = await checkGameOver(gameId);
    if (isGameOver) {
      return 'Forced showdown - Game Over';
    }
    await startNewHand(gameId);
    return 'Forced showdown - New hand started';
  } else {
    await advanceToNextRound(gameId);
    return `Forced advance to ${game.bettingRound}`;
  }
}
