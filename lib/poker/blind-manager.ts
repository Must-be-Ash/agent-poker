/**
 * Blind Payment Manager
 * Coordinates blind payments at the start of each hand
 */

import { getPokerGame, updateGameState } from './poker-db';
import { storeEvent } from '../events';
import { getSmallBlindAmount, getBigBlindAmount } from '../x402-poker-config';

// ============================================================================
// BLIND PAYMENT TRACKING
// ============================================================================

/**
 * Tracks which blinds have been paid for each hand
 */
interface BlindStatus {
  gameId: string;
  handNumber: number;
  smallBlindPaid: boolean;
  bigBlindPaid: boolean;
  smallBlindPlayerId?: string;
  bigBlindPlayerId?: string;
}

// In-memory tracking of blind status per game
const blindStatus = new Map<string, BlindStatus>();

/**
 * Initializes blind tracking for a new hand
 * @param gameId - Game identifier
 * @param handNumber - Hand number
 */
export function initializeBlindTracking(gameId: string, handNumber: number): void {
  blindStatus.set(gameId, {
    gameId,
    handNumber,
    smallBlindPaid: false,
    bigBlindPaid: false,
  });

  console.log(`🎲 [Blinds] Initialized tracking for hand #${handNumber}`);
}

/**
 * Records that a blind has been paid
 * @param gameId - Game identifier
 * @param playerId - Player who paid
 * @param blindType - 'small' or 'big'
 */
export function recordBlindPayment(
  gameId: string,
  playerId: string,
  blindType: 'small' | 'big'
): void {
  const status = blindStatus.get(gameId);
  if (!status) {
    throw new Error(`No blind tracking initialized for game ${gameId}`);
  }

  if (blindType === 'small') {
    status.smallBlindPaid = true;
    status.smallBlindPlayerId = playerId;
  } else {
    status.bigBlindPaid = true;
    status.bigBlindPlayerId = playerId;
  }

  blindStatus.set(gameId, status);

  console.log(`✅ [Blinds] ${blindType} blind paid by ${playerId}`);
}

/**
 * Checks if both blinds have been paid
 * @param gameId - Game identifier
 * @returns true if both blinds paid
 */
export function areBothBlindsPaid(gameId: string): boolean {
  const status = blindStatus.get(gameId);
  if (!status) {
    return false;
  }

  return status.smallBlindPaid && status.bigBlindPaid;
}

/**
 * Gets current blind status
 * @param gameId - Game identifier
 */
export function getBlindStatus(gameId: string): BlindStatus | null {
  return blindStatus.get(gameId) || null;
}

/**
 * Clears blind tracking for a game (when hand completes)
 * @param gameId - Game identifier
 */
export function clearBlindTracking(gameId: string): void {
  blindStatus.delete(gameId);
}

// ============================================================================
// BLIND WAITING & COORDINATION
// ============================================================================

/**
 * Waits for both blinds to be paid before starting the hand
 * This would be called by the game orchestrator
 * @param gameId - Game identifier
 * @param timeoutMs - Timeout in milliseconds (default 60s)
 * @returns Promise that resolves when both blinds are paid
 */
export async function waitForBlinds(
  gameId: string,
  timeoutMs: number = 60000
): Promise<boolean> {
  const startTime = Date.now();

  while (!areBothBlindsPaid(gameId)) {
    if (Date.now() - startTime > timeoutMs) {
      console.error(`❌ [Blinds] Timeout waiting for blinds in game ${gameId}`);
      return false;
    }

    // Wait 500ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`✅ [Blinds] Both blinds paid for game ${gameId}`);
  return true;
}

/**
 * Requests blind payments from players
 * Broadcasts events to notify agents they need to pay blinds
 * @param gameId - Game identifier
 */
export async function requestBlindPayments(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const smallBlindPlayer = game.players.find((p) => p.isSmallBlind);
  const bigBlindPlayer = game.players.find((p) => p.isBigBlind);

  if (!smallBlindPlayer || !bigBlindPlayer) {
    throw new Error('Could not find blind positions');
  }

  const smallBlindAmount = getSmallBlindAmount();
  const bigBlindAmount = getBigBlindAmount();

  // Initialize blind tracking
  initializeBlindTracking(gameId, game.handNumber);

  // Broadcast blind request events
  await storeEvent(gameId, 'blind_required', {
    handNumber: game.handNumber,
    smallBlind: {
      playerId: smallBlindPlayer.agentId,
      playerName: smallBlindPlayer.agentName,
      amount: smallBlindAmount,
    },
    bigBlind: {
      playerId: bigBlindPlayer.agentId,
      playerName: bigBlindPlayer.agentName,
      amount: bigBlindAmount,
    },
  });

  console.log(`📢 [Blinds] Requested blind payments for hand #${game.handNumber}`);
  console.log(`   Small blind: ${smallBlindPlayer.agentName} (${smallBlindAmount} USDC)`);
  console.log(`   Big blind: ${bigBlindPlayer.agentName} (${bigBlindAmount} USDC)`);
}

// ============================================================================
// BLIND VALIDATION
// ============================================================================

/**
 * Validates that a player is in the correct position to pay a blind
 * @param gameId - Game identifier
 * @param playerId - Player attempting to pay blind
 * @param blindType - 'small' or 'big'
 * @returns Object with validation result
 */
export async function validateBlindPayment(
  gameId: string,
  playerId: string,
  blindType: 'small' | 'big'
): Promise<{ valid: boolean; error?: string }> {
  const game = await getPokerGame(gameId);
  if (!game) {
    return { valid: false, error: 'Game not found' };
  }

  const player = game.players.find((p) => p.agentId === playerId);
  if (!player) {
    return { valid: false, error: 'Player not found' };
  }

  // Check position
  if (blindType === 'small' && !player.isSmallBlind) {
    return { valid: false, error: 'Player is not in small blind position' };
  }

  if (blindType === 'big' && !player.isBigBlind) {
    return { valid: false, error: 'Player is not in big blind position' };
  }

  // Check if already paid
  const status = getBlindStatus(gameId);
  if (status) {
    if (blindType === 'small' && status.smallBlindPaid) {
      return { valid: false, error: 'Small blind already paid' };
    }
    if (blindType === 'big' && status.bigBlindPaid) {
      return { valid: false, error: 'Big blind already paid' };
    }
  }

  // Check sufficient chips
  const blindAmount = blindType === 'small' ? getSmallBlindAmount() : getBigBlindAmount();
  if (player.chipStack < blindAmount) {
    return {
      valid: false,
      error: `Insufficient chips (need ${blindAmount}, have ${player.chipStack})`,
    };
  }

  return { valid: true };
}

// ============================================================================
// AUTOMATIC BLIND POSTING (OFFLINE TRACKING)
// ============================================================================

/**
 * Posts blinds without x402 (for offline tracking mode)
 * This deducts from chip stacks without blockchain transactions
 * Only use if you want to switch from on-chain to off-chain blinds
 * @param gameId - Game identifier
 */
export async function postBlindsOffline(gameId: string): Promise<void> {
  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const smallBlindPlayer = game.players.find((p) => p.isSmallBlind);
  const bigBlindPlayer = game.players.find((p) => p.isBigBlind);

  if (!smallBlindPlayer || !bigBlindPlayer) {
    throw new Error('Could not find blind positions');
  }

  const smallBlindAmount = getSmallBlindAmount();
  const bigBlindAmount = getBigBlindAmount();

  // Update player chip stacks
  const updatedPlayers = game.players.map((p) => {
    if (p.isSmallBlind) {
      return {
        ...p,
        chipStack: p.chipStack - smallBlindAmount,
        currentBet: smallBlindAmount,
        totalBetThisHand: smallBlindAmount,
        status: p.chipStack - smallBlindAmount === 0 ? ('all-in' as const) : p.status,
      };
    }
    if (p.isBigBlind) {
      return {
        ...p,
        chipStack: p.chipStack - bigBlindAmount,
        currentBet: bigBlindAmount,
        totalBetThisHand: bigBlindAmount,
        status: p.chipStack - bigBlindAmount === 0 ? ('all-in' as const) : p.status,
      };
    }
    return p;
  });

  await updateGameState(gameId, {
    players: updatedPlayers,
    pot: smallBlindAmount + bigBlindAmount,
    currentBet: bigBlindAmount,
  });

  console.log(`✅ [Blinds] Posted blinds offline for game ${gameId}`);
}
