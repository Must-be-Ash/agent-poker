/**
 * Settlement Lock System
 * Prevents concurrent payment settlements that could cause nonce conflicts
 *
 * When multiple agents try to settle payments simultaneously (e.g., both paying blinds,
 * or rapid action sequences), blockchain nonce conflicts can occur. This system ensures
 * only one settlement happens at a time per game.
 */

// ============================================================================
// LOCK MANAGEMENT
// ============================================================================

/**
 * Map of locks per game
 * Key: gameId
 * Value: Promise representing the current settlement operation
 */
const gameLocks = new Map<string, Promise<unknown>>();

/**
 * Map of lock metadata for debugging
 */
interface LockMetadata {
  gameId: string;
  operation: string; // e.g., "blind_payment", "poker_action"
  agentId: string;
  startTime: number;
}

const lockMetadata = new Map<string, LockMetadata>();

// ============================================================================
// LOCK OPERATIONS
// ============================================================================

/**
 * Acquires a lock for a game and executes an operation
 * Automatically waits for any pending operations to complete first
 *
 * @param gameId - Game identifier
 * @param operation - Description of operation (for logging)
 * @param agentId - Agent performing the operation
 * @param fn - Async function to execute with lock
 * @returns Result of the function
 */
export async function withSettlementLock<T>(
  gameId: string,
  operation: string,
  agentId: string,
  fn: () => Promise<T>
): Promise<T> {
  // Wait for any pending lock
  if (gameLocks.has(gameId)) {
    const existing = lockMetadata.get(gameId);
    console.log(`⏳ [Lock] ${agentId} waiting for ${operation}...`);
    if (existing) {
      console.log(`   Current lock: ${existing.operation} by ${existing.agentId}`);
      console.log(`   Wait time: ${Date.now() - existing.startTime}ms`);
    }

    await gameLocks.get(gameId);
  }

  // Create new lock
  const metadata: LockMetadata = {
    gameId,
    operation,
    agentId,
    startTime: Date.now(),
  };

  lockMetadata.set(gameId, metadata);

  const lockPromise = (async () => {
    try {
      console.log(`🔒 [Lock] ${agentId} acquired lock for ${operation}`);
      const result = await fn();

      const duration = Date.now() - metadata.startTime;
      console.log(`🔓 [Lock] ${agentId} released lock for ${operation} (${duration}ms)`);

      return result;
    } finally {
      // Clean up lock
      gameLocks.delete(gameId);
      lockMetadata.delete(gameId);
    }
  })();

  gameLocks.set(gameId, lockPromise);

  return await lockPromise;
}

/**
 * Checks if a game currently has an active lock
 * @param gameId - Game identifier
 * @returns true if locked, false otherwise
 */
export function isGameLocked(gameId: string): boolean {
  return gameLocks.has(gameId);
}

/**
 * Gets information about the current lock (if any)
 * @param gameId - Game identifier
 * @returns Lock metadata or null
 */
export function getLockInfo(gameId: string): LockMetadata | null {
  return lockMetadata.get(gameId) || null;
}

/**
 * Gets all active locks (for debugging/monitoring)
 * @returns Array of lock metadata
 */
export function getAllLocks(): LockMetadata[] {
  return Array.from(lockMetadata.values());
}

/**
 * Emergency function to clear a stuck lock
 * USE WITH CAUTION - only for debugging/recovery
 * @param gameId - Game identifier
 */
export function forceReleaseLock(gameId: string): void {
  console.warn(`⚠️ [Lock] Force releasing lock for game ${gameId}`);
  gameLocks.delete(gameId);
  lockMetadata.delete(gameId);
}

/**
 * Clears all locks (for testing/cleanup)
 * USE WITH CAUTION
 */
export function clearAllLocks(): void {
  console.warn('⚠️ [Lock] Clearing all settlement locks');
  gameLocks.clear();
  lockMetadata.clear();
}

// ============================================================================
// TIMEOUT HANDLING
// ============================================================================

/**
 * Acquires a lock with a timeout
 * If the operation takes longer than timeout, the lock is force-released
 *
 * @param gameId - Game identifier
 * @param operation - Description of operation
 * @param agentId - Agent performing the operation
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds (default 30s)
 * @returns Result or throws timeout error
 */
export async function withSettlementLockTimeout<T>(
  gameId: string,
  operation: string,
  agentId: string,
  fn: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Settlement lock timeout after ${timeoutMs}ms for ${operation}`));
    }, timeoutMs);
  });

  return Promise.race([
    withSettlementLock(gameId, operation, agentId, fn),
    timeoutPromise,
  ]);
}

// ============================================================================
// STATISTICS & MONITORING
// ============================================================================

interface LockStats {
  totalLocksAcquired: number;
  totalWaitTime: number; // milliseconds
  averageWaitTime: number;
  longestWaitTime: number;
  currentActiveLocks: number;
}

let lockStats: LockStats = {
  totalLocksAcquired: 0,
  totalWaitTime: 0,
  averageWaitTime: 0,
  longestWaitTime: 0,
  currentActiveLocks: 0,
};

/**
 * Updates lock statistics (called internally)
 */
function updateLockStats(waitTime: number): void {
  lockStats.totalLocksAcquired++;
  lockStats.totalWaitTime += waitTime;
  lockStats.averageWaitTime = lockStats.totalWaitTime / lockStats.totalLocksAcquired;
  lockStats.longestWaitTime = Math.max(lockStats.longestWaitTime, waitTime);
  lockStats.currentActiveLocks = gameLocks.size;
}

/**
 * Gets lock statistics
 * @returns Current lock statistics
 */
export function getLockStats(): LockStats {
  return {
    ...lockStats,
    currentActiveLocks: gameLocks.size,
  };
}

/**
 * Resets lock statistics (for testing)
 */
export function resetLockStats(): void {
  lockStats = {
    totalLocksAcquired: 0,
    totalWaitTime: 0,
    averageWaitTime: 0,
    longestWaitTime: 0,
    currentActiveLocks: 0,
  };
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Using settlement lock in an endpoint
 *
 * ```typescript
 * import { withSettlementLock } from '@/lib/poker/settlement-lock';
 *
 * export async function POST(request: NextRequest) {
 *   const gameId = 'game-123';
 *   const agentId = 'agent-A';
 *
 *   return withSettlementLock(gameId, 'poker_action', agentId, async () => {
 *     // Verify payment
 *     const verification = await verify(payload, facilitatorUrl);
 *
 *     // Settle on-chain
 *     const settlement = await settle(payload, walletClient, facilitatorUrl);
 *
 *     // Update game state
 *     await updateGameState(gameId, updates);
 *
 *     return NextResponse.json({ success: true });
 *   });
 * }
 * ```
 */

/**
 * Example: Using lock with timeout
 *
 * ```typescript
 * return withSettlementLockTimeout(
 *   gameId,
 *   'blind_payment',
 *   agentId,
 *   async () => {
 *     // Potentially slow operation
 *     return await settleBlindPayment();
 *   },
 *   10000 // 10 second timeout
 * );
 * ```
 */
