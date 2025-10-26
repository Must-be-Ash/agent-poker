/**
 * Pot Escrow System
 * Tracks and manages escrowed funds for poker pots
 * Server wallet holds all bets, but we track them separately per game
 */

import { getPokerGame, updateGameState } from './poker-db';
import { getServerWalletClient } from '../wallet';
import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { BASE_SEPOLIA_USDC } from '../x402-poker-config';

// ERC-20 ABI for transfer
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ============================================================================
// IN-MEMORY ESCROW TRACKING
// ============================================================================

/**
 * In-memory map of gameId -> escrowed amount (in USDC)
 * This tracks how much of the server wallet balance is allocated to each game
 */
const escrowedPots = new Map<string, number>();

/**
 * Lock for pot operations to prevent concurrent modifications
 */
const potLocks = new Map<string, Promise<unknown>>();

// ============================================================================
// ESCROW TRACKING
// ============================================================================

/**
 * Records a contribution to a game's pot escrow
 * @param gameId - Game identifier
 * @param amount - Amount in USDC to add to escrow
 */
export async function addToEscrow(gameId: string, amount: number): Promise<void> {
  if (amount <= 0) {
    throw new Error('Escrow amount must be positive');
  }

  const currentEscrow = escrowedPots.get(gameId) || 0;
  const newEscrow = currentEscrow + amount;

  escrowedPots.set(gameId, newEscrow);

  console.log(`💰 [Escrow] ${gameId}: ${currentEscrow} → ${newEscrow} USDC (+${amount})`);
}

/**
 * Gets the current escrowed amount for a game
 * @param gameId - Game identifier
 * @returns Escrowed amount in USDC
 */
export function getEscrowedAmount(gameId: string): number {
  return escrowedPots.get(gameId) || 0;
}

/**
 * Gets total escrowed amount across all games
 * @returns Total escrowed USDC
 */
export function getTotalEscrowed(): number {
  let total = 0;
  for (const amount of escrowedPots.values()) {
    total += amount;
  }
  return total;
}

/**
 * Releases escrow for a game (after payout)
 * @param gameId - Game identifier
 */
export function releaseEscrow(gameId: string): void {
  const amount = escrowedPots.get(gameId) || 0;
  escrowedPots.delete(gameId);

  console.log(`🔓 [Escrow] ${gameId}: Released ${amount} USDC`);
}

/**
 * Validates that server wallet has sufficient balance for escrow
 * @param gameId - Game identifier
 * @returns true if sufficient balance, false otherwise
 */
export async function validateEscrowBalance(gameId: string): Promise<boolean> {
  const escrowedAmount = getEscrowedAmount(gameId);

  // Get server wallet USDC balance
  const walletClient = await getServerWalletClient();
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: BASE_SEPOLIA_USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletClient.account.address],
  });

  const balanceUsdc = parseFloat(formatUnits(balance, 6));

  console.log(`💰 [Escrow] Wallet balance: ${balanceUsdc} USDC, Escrowed for ${gameId}: ${escrowedAmount} USDC`);

  return balanceUsdc >= escrowedAmount;
}

// ============================================================================
// POT MANAGEMENT
// ============================================================================

/**
 * Initializes escrow tracking for a new game
 * @param gameId - Game identifier
 */
export async function initializeGameEscrow(gameId: string): Promise<void> {
  if (escrowedPots.has(gameId)) {
    console.warn(`⚠️  [Escrow] Game ${gameId} already has escrow tracking`);
    return;
  }

  escrowedPots.set(gameId, 0);
  console.log(`✅ [Escrow] Initialized escrow for ${gameId}`);
}

/**
 * Records a bet contribution to the pot
 * This should be called when a payment is settled
 * @param gameId - Game identifier
 * @param playerId - Player making the contribution
 * @param amount - Amount in USDC
 */
export async function recordPotContribution(
  gameId: string,
  playerId: string,
  amount: number
): Promise<void> {
  // Wait for any pending operations on this pot
  if (potLocks.has(gameId)) {
    await potLocks.get(gameId);
  }

  const operationPromise = (async () => {
    try {
      // Add to escrow tracking
      await addToEscrow(gameId, amount);

      // Verify we have sufficient balance
      const hasBalance = await validateEscrowBalance(gameId);
      if (!hasBalance) {
        throw new Error(`Insufficient wallet balance for escrowed pot in ${gameId}`);
      }

      console.log(`✅ [Escrow] Recorded ${amount} USDC from ${playerId} in ${gameId}`);
    } finally {
      potLocks.delete(gameId);
    }
  })();

  potLocks.set(gameId, operationPromise);
  await operationPromise;
}

// ============================================================================
// PAYOUT OPERATIONS
// ============================================================================

/**
 * Pays out pot to winner(s)
 * @param gameId - Game identifier
 * @param payouts - Map of playerId -> amount to pay
 * @returns Transaction hashes for each payout
 */
export async function payoutPot(
  gameId: string,
  payouts: Map<string, number>
): Promise<Map<string, string>> {
  // Wait for any pending operations on this pot
  if (potLocks.has(gameId)) {
    await potLocks.get(gameId);
  }

  const operationPromise = (async () => {
    try {
      const txHashes = new Map<string, string>();

      // Get game to find wallet addresses
      const game = await getPokerGame(gameId);
      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      // Calculate total payout
      let totalPayout = 0;
      for (const amount of payouts.values()) {
        totalPayout += amount;
      }

      // Verify payout doesn't exceed escrowed amount
      const escrowedAmount = getEscrowedAmount(gameId);
      if (totalPayout > escrowedAmount + 0.01) {
        // Allow small floating point difference
        throw new Error(
          `Payout (${totalPayout}) exceeds escrowed amount (${escrowedAmount}) for ${gameId}`
        );
      }

      // Get server wallet
      const walletClient = await getServerWalletClient();

      // Process each payout
      for (const [playerId, amount] of payouts.entries()) {
        if (amount <= 0) continue;

        // Find player's wallet address
        const player = game.players.find((p) => p.agentId === playerId);
        if (!player) {
          console.warn(`⚠️  Player ${playerId} not found in game ${gameId}`);
          continue;
        }

        try {
          // Convert USDC amount to wei (6 decimals)
          const amountWei = parseUnits(amount.toString(), 6);

          // Transfer USDC to winner
          const hash = await walletClient.writeContract({
            address: BASE_SEPOLIA_USDC as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [player.walletAddress as `0x${string}`, amountWei],
          });

          txHashes.set(playerId, hash);

          console.log(`💸 [Payout] ${amount} USDC to ${player.agentName} (${playerId})`);
          console.log(`   TX: ${hash}`);
        } catch (error) {
          console.error(`❌ [Payout] Failed to pay ${player.agentName}:`, error);
          throw error;
        }
      }

      // Release escrow for this game
      releaseEscrow(gameId);

      console.log(`✅ [Payout] Completed all payouts for ${gameId}`);

      return txHashes;
    } finally {
      potLocks.delete(gameId);
    }
  })();

  potLocks.set(gameId, operationPromise);
  return await operationPromise;
}

/**
 * Pays out to a single winner
 * @param gameId - Game identifier
 * @param winnerId - Winner's player ID
 * @param amount - Amount to pay in USDC
 * @returns Transaction hash
 */
export async function payoutToWinner(
  gameId: string,
  winnerId: string,
  amount: number
): Promise<string> {
  const payouts = new Map([[winnerId, amount]]);
  const txHashes = await payoutPot(gameId, payouts);
  const hash = txHashes.get(winnerId);

  if (!hash) {
    throw new Error(`Failed to payout to winner ${winnerId}`);
  }

  return hash;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets escrow summary for all games
 * @returns Array of game escrow info
 */
export function getEscrowSummary(): Array<{ gameId: string; amount: number }> {
  const summary: Array<{ gameId: string; amount: number }> = [];

  for (const [gameId, amount] of escrowedPots.entries()) {
    summary.push({ gameId, amount });
  }

  return summary.sort((a, b) => b.amount - a.amount);
}

/**
 * Validates that total escrowed amount doesn't exceed wallet balance
 * @returns Object with validation result
 */
export async function validateTotalEscrow(): Promise<{
  valid: boolean;
  walletBalance: number;
  totalEscrowed: number;
  available: number;
}> {
  const walletClient = await getServerWalletClient();
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: BASE_SEPOLIA_USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletClient.account.address],
  });

  const walletBalance = parseFloat(formatUnits(balance, 6));
  const totalEscrowed = getTotalEscrowed();
  const available = walletBalance - totalEscrowed;

  return {
    valid: walletBalance >= totalEscrowed,
    walletBalance,
    totalEscrowed,
    available,
  };
}

/**
 * Emergency function to clear escrow tracking (use with caution)
 * Only use for testing or if escrow tracking gets out of sync
 */
export function clearAllEscrow(): void {
  console.warn('⚠️  CLEARING ALL ESCROW TRACKING');
  escrowedPots.clear();
}

/**
 * Gets escrow status for debugging
 */
export async function getEscrowStatus(): Promise<{
  games: Array<{ gameId: string; amount: number }>;
  totalEscrowed: number;
  walletBalance: number;
  available: number;
}> {
  const summary = getEscrowSummary();
  const validation = await validateTotalEscrow();

  return {
    games: summary,
    totalEscrowed: validation.totalEscrowed,
    walletBalance: validation.walletBalance,
    available: validation.available,
  };
}
