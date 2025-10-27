/**
 * Timeout Checker for Poker Games
 *
 * Monitors active games and auto-folds players who don't act within timeout period:
 * - Runs periodically to check all active games
 * - Auto-folds players who exceed turn timeout (30 seconds)
 * - Progresses game after auto-fold
 * - Handles disconnections gracefully
 */

import { getAllPokerGames } from '../poker-db';
import { hasCurrentTurnTimedOut, autoFoldForTimeout } from './turn-manager';
import { progressGameIfReady } from './game-orchestrator';
import type { PokerGameRecord } from '@/types/poker';

// Track which games are being processed to avoid duplicate checks
const processingGames = new Set<string>();

/**
 * Checks a single game for timeout and auto-folds if needed
 * @param gameId - Game identifier
 * @returns True if a timeout was processed
 */
export async function checkGameTimeout(gameId: string): Promise<boolean> {
  // Skip if already processing this game
  if (processingGames.has(gameId)) {
    return false;
  }

  try {
    processingGames.add(gameId);

    // Check if current turn has timed out
    const hasTimedOut = await hasCurrentTurnTimedOut(gameId);

    if (hasTimedOut) {
      console.log(`⏱️ [Timeout Checker] Game ${gameId} - current player timed out`);

      // Auto-fold the player
      await autoFoldForTimeout(gameId);

      // Progress game if ready (might end hand, start new round, etc.)
      const progression = await progressGameIfReady(gameId);

      if (progression.bettingRoundAdvanced) {
        console.log(`   ⚡ Auto-progressed to next betting round after timeout fold`);
      }
      if (progression.showdownInitiated) {
        console.log(`   ⚡ Initiated showdown after timeout fold`);
      }
      if (progression.newHandStarted) {
        console.log(`   ⚡ Started new hand after timeout fold`);
      }
      if (progression.gameEnded) {
        console.log(`   ⚡ Game ended after timeout fold`);
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ [Timeout Checker] Error checking game ${gameId}:`, error);
    return false;
  } finally {
    processingGames.delete(gameId);
  }
}

/**
 * Checks all active games for timeouts
 * This function should be called periodically (e.g., every 5 seconds)
 * @returns Number of timeouts processed
 */
export async function checkAllGamesForTimeouts(): Promise<number> {
  try {
    // Get all games from database
    const allGames = await getAllPokerGames();

    // Filter to only active games (not ended)
    const activeGames = allGames.filter((game: PokerGameRecord) => game.gameStatus === 'in_progress');

    if (activeGames.length === 0) {
      return 0;
    }

    console.log(`🔍 [Timeout Checker] Checking ${activeGames.length} active games for timeouts`);

    // Check each game for timeouts
    let timeoutsProcessed = 0;

    for (const game of activeGames) {
      const hadTimeout = await checkGameTimeout(game.gameId);
      if (hadTimeout) {
        timeoutsProcessed++;
      }
    }

    if (timeoutsProcessed > 0) {
      console.log(`✅ [Timeout Checker] Processed ${timeoutsProcessed} timeouts`);
    }

    return timeoutsProcessed;
  } catch (error) {
    console.error(`❌ [Timeout Checker] Error checking games for timeouts:`, error);
    return 0;
  }
}

/**
 * Starts the timeout checker service
 * Runs every 5 seconds to check for timeouts
 * @returns Interval ID that can be used to stop the service
 */
export function startTimeoutCheckerService(): NodeJS.Timeout {
  console.log(`🚀 [Timeout Checker] Starting timeout checker service (5 second interval)`);

  const interval = setInterval(async () => {
    await checkAllGamesForTimeouts();
  }, 5000); // Check every 5 seconds

  // Also run immediately
  checkAllGamesForTimeouts();

  return interval;
}

/**
 * Stops the timeout checker service
 * @param intervalId - Interval ID returned by startTimeoutCheckerService
 */
export function stopTimeoutCheckerService(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  console.log(`🛑 [Timeout Checker] Stopped timeout checker service`);
}

/**
 * Gets status of timeout checker for a specific game
 * @param gameId - Game identifier
 * @returns Timeout status with seconds remaining
 */
export async function getTimeoutStatus(gameId: string): Promise<{
  hasTimedOut: boolean;
  isBeingProcessed: boolean;
}> {
  const hasTimedOut = await hasCurrentTurnTimedOut(gameId);
  const isBeingProcessed = processingGames.has(gameId);

  return {
    hasTimedOut,
    isBeingProcessed,
  };
}
