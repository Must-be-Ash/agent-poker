/**
 * Payout Mechanism for Poker
 * High-level payout coordination with game state updates and event broadcasting
 */

import { getPokerGame, updateGameState, storeHandResult, endGame } from './poker-db';
import { payoutPot, payoutToWinner as escrowPayoutToWinner } from './pot-escrow';
import { storeEvent } from '../events';
import { evaluateBestHand, compareHands } from './hand-evaluator';
import type { HandResult, PlayerState } from '@/types/poker';
import { withSettlementLock } from './settlement-lock';

// ============================================================================
// WINNER DETERMINATION
// ============================================================================

/**
 * Determines the winner(s) of a hand at showdown
 * @param gameId - Game identifier
 * @returns Object with winner info and hand results
 */
export async function determineHandWinner(gameId: string): Promise<{
  winners: string[]; // Array of winner IDs (can be multiple for split pot)
  handResult: HandResult;
}> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  // Get all players who haven't folded and have cards
  const activePlayers = game.players.filter(
    (p) => p.status !== 'folded' && p.status !== 'out' && p.cards !== null
  );

  if (activePlayers.length === 0) {
    throw new Error('No active players for showdown');
  }

  // If only one player remaining (others folded), they win
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    const handResult: HandResult = {
      handNumber: game.handNumber,
      winnerId: winner.agentId,
      winnerName: winner.agentName,
      winningHand: {
        type: 0,
        name: 'Win by Fold',
        value: 0,
        description: 'All opponents folded',
      },
      winningCards: [],
      potWon: game.pot,
      timestamp: new Date(),
    };

    return {
      winners: [winner.agentId],
      handResult,
    };
  }

  // Evaluate all hands at showdown
  const evaluatedHands: Array<{
    player: PlayerState;
    handRank: any;
  }> = [];

  const showdownCards: Record<string, any> = {};

  for (const player of activePlayers) {
    if (!player.cards) continue;

    const handRank = evaluateBestHand(player.cards, game.communityCards);
    evaluatedHands.push({ player, handRank });

    showdownCards[player.agentId] = {
      holeCards: player.cards,
      handRank,
    };
  }

  // Find best hand(s)
  let bestHands = [evaluatedHands[0]];

  for (let i = 1; i < evaluatedHands.length; i++) {
    const comparison = compareHands(evaluatedHands[i].handRank, bestHands[0].handRank);

    if (comparison > 0) {
      // New best hand
      bestHands = [evaluatedHands[i]];
    } else if (comparison === 0) {
      // Tie - add to winners
      bestHands.push(evaluatedHands[i]);
    }
  }

  // Create hand result
  const primaryWinner = bestHands[0];
  const handResult: HandResult = {
    handNumber: game.handNumber,
    winnerId: primaryWinner.player.agentId,
    winnerName: primaryWinner.player.agentName,
    winningHand: primaryWinner.handRank,
    winningCards: [...primaryWinner.player.cards!, ...game.communityCards],
    potWon: game.pot,
    showdownCards,
    timestamp: new Date(),
  };

  const winners = bestHands.map((h) => h.player.agentId);

  return { winners, handResult };
}

// ============================================================================
// PAYOUT OPERATIONS
// ============================================================================

/**
 * Pays out the pot to winner(s) and updates game state
 * @param gameId - Game identifier
 * @param winnerId - Winner's agent ID (for single winner)
 * @param amount - Amount to pay (should match pot)
 * @returns Transaction hash
 */
export async function payoutWinner(
  gameId: string,
  winnerId: string,
  amount: number
): Promise<string> {
  return await withSettlementLock(gameId, 'payout_winner', winnerId, async () => {
    const game = await getPokerGame(gameId);
    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }

    const winner = game.players.find((p) => p.agentId === winnerId);
    if (!winner) {
      throw new Error(`Winner ${winnerId} not found in game`);
    }

    console.log(`💰 [Payout] Paying ${amount} USDC to ${winner.agentName} in game ${gameId}`);

    // Execute payout via escrow system
    const txHash = await escrowPayoutToWinner(gameId, winnerId, amount);

    // Update winner's chip stack in game state
    const updatedPlayers = game.players.map((p) => {
      if (p.agentId === winnerId) {
        return {
          ...p,
          chipStack: p.chipStack + amount,
        };
      }
      return p;
    });

    await updateGameState(gameId, {
      players: updatedPlayers,
      pot: 0, // Pot is now empty
    });

    // Broadcast payout event
    await storeEvent(gameId, 'payout', {
      winnerId,
      winnerName: winner.agentName,
      amount,
      txHash,
      handNumber: game.handNumber,
    });

    console.log(`✅ [Payout] Completed payout to ${winner.agentName}`);
    console.log(`   TX: ${txHash}`);

    return txHash;
  });
}

/**
 * Handles split pot payout (multiple winners)
 * @param gameId - Game identifier
 * @param winners - Array of winner IDs
 * @param totalPot - Total pot amount
 * @returns Map of winnerId -> transaction hash
 */
export async function payoutSplitPot(
  gameId: string,
  winners: string[],
  totalPot: number
): Promise<Map<string, string>> {
  return await withSettlementLock(gameId, 'payout_split_pot', 'multi_winner', async () => {
    const game = await getPokerGame(gameId);
    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }

    if (winners.length === 0) {
      throw new Error('No winners provided for split pot');
    }

    // Calculate split amounts
    const splitAmount = totalPot / winners.length;
    const payouts = new Map<string, number>();

    for (const winnerId of winners) {
      payouts.set(winnerId, splitAmount);
    }

    console.log(`💰 [Payout] Split pot: ${totalPot} USDC divided among ${winners.length} winners`);

    // Execute payouts via escrow system
    const txHashes = await payoutPot(gameId, payouts);

    // Update all winners' chip stacks
    const updatedPlayers = game.players.map((p) => {
      const payout = payouts.get(p.agentId);
      if (payout) {
        return {
          ...p,
          chipStack: p.chipStack + payout,
        };
      }
      return p;
    });

    await updateGameState(gameId, {
      players: updatedPlayers,
      pot: 0,
    });

    // Broadcast split pot event
    await storeEvent(gameId, 'split_pot', {
      winners: winners.map((id) => {
        const player = game.players.find((p) => p.agentId === id);
        return {
          agentId: id,
          agentName: player?.agentName || 'Unknown',
          amount: splitAmount,
        };
      }),
      totalPot,
      handNumber: game.handNumber,
    });

    console.log(`✅ [Payout] Completed split pot payout`);

    return txHashes;
  });
}

/**
 * Completes a hand with winner determination and payout
 * @param gameId - Game identifier
 * @returns Hand result with payout info
 */
export async function completeHandWithPayout(gameId: string): Promise<HandResult> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  console.log(`🏁 [Payout] Completing hand #${game.handNumber} for game ${gameId}`);

  // Determine winner(s)
  const { winners, handResult } = await determineHandWinner(gameId);

  // Store hand result
  await storeHandResult(gameId, handResult);

  // Execute payout
  if (winners.length === 1) {
    // Single winner
    const txHash = await payoutWinner(gameId, winners[0], game.pot);
    handResult.potWon = game.pot;

    // Broadcast hand complete event
    await storeEvent(gameId, 'hand_complete', {
      handNumber: game.handNumber,
      winnerId: winners[0],
      winnerName: handResult.winnerName,
      winningHand: handResult.winningHand.name,
      potWon: game.pot,
      txHash,
    });
  } else {
    // Split pot
    const txHashes = await payoutSplitPot(gameId, winners, game.pot);

    // Broadcast hand complete event with split pot info
    await storeEvent(gameId, 'hand_complete', {
      handNumber: game.handNumber,
      winners: winners.map((id) => {
        const player = game.players.find((p) => p.agentId === id);
        return {
          agentId: id,
          agentName: player?.agentName || 'Unknown',
        };
      }),
      winningHand: handResult.winningHand.name,
      potWon: game.pot,
      splitPot: true,
      txHashes: Array.from(txHashes.values()),
    });
  }

  // Check if game is over (one player has all chips)
  const updatedGame = await getPokerGame(gameId);
  if (updatedGame) {
    const playersWithChips = updatedGame.players.filter((p) => p.chipStack > 0);

    if (playersWithChips.length === 1) {
      // Game over!
      const gameWinner = playersWithChips[0];

      await endGame(gameId, gameWinner.agentId, {
        gameStatus: 'ended',
      });

      await storeEvent(gameId, 'game_ended', {
        winnerId: gameWinner.agentId,
        winnerName: gameWinner.agentName,
        finalChipCount: gameWinner.chipStack,
        totalHands: updatedGame.handNumber,
      });

      console.log(`🏆 [Payout] Game ${gameId} ended. Winner: ${gameWinner.agentName}`);
    }
  }

  return handResult;
}

// ============================================================================
// REFUND OPERATIONS
// ============================================================================

/**
 * Refunds a player's bet (e.g., if they leave the game)
 * @param gameId - Game identifier
 * @param playerId - Player to refund
 * @param amount - Amount to refund
 * @returns Transaction hash
 */
export async function refundPlayer(
  gameId: string,
  playerId: string,
  amount: number
): Promise<string> {
  return await withSettlementLock(gameId, 'refund_player', playerId, async () => {
    const game = await getPokerGame(gameId);
    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }

    const player = game.players.find((p) => p.agentId === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found in game`);
    }

    console.log(`🔄 [Refund] Refunding ${amount} USDC to ${player.agentName}`);

    // Execute refund via escrow system
    const txHash = await escrowPayoutToWinner(gameId, playerId, amount);

    // Update game state
    const updatedPlayers = game.players.map((p) => {
      if (p.agentId === playerId) {
        return {
          ...p,
          chipStack: p.chipStack + amount,
        };
      }
      return p;
    });

    await updateGameState(gameId, {
      players: updatedPlayers,
      pot: Math.max(0, game.pot - amount),
    });

    // Broadcast refund event
    await storeEvent(gameId, 'refund', {
      agentId: playerId,
      agentName: player.agentName,
      amount,
      txHash,
    });

    console.log(`✅ [Refund] Completed refund to ${player.agentName}`);
    console.log(`   TX: ${txHash}`);

    return txHash;
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validates that payout amount matches pot
 * @param gameId - Game identifier
 * @param payoutAmount - Amount to be paid out
 * @returns true if valid, false otherwise
 */
export async function validatePayout(gameId: string, payoutAmount: number): Promise<boolean> {
  const game = await getPokerGame(gameId);
  if (!game) {
    return false;
  }

  // Allow small floating point difference
  return Math.abs(game.pot - payoutAmount) < 0.01;
}

/**
 * Gets payout summary for a completed hand
 * @param gameId - Game identifier
 * @param handNumber - Hand number
 * @returns Payout summary
 */
export async function getPayoutSummary(
  gameId: string,
  handNumber: number
): Promise<{
  handNumber: number;
  winners: Array<{ agentId: string; agentName: string; amount: number }>;
  totalPaid: number;
} | null> {
  // This would query the handResults collection
  // For now, return null as placeholder
  return null;
}
