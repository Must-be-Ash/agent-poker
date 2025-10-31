/**
 * All-In Logic and Side Pot Management
 *
 * Handles complex all-in scenarios:
 * - Side pot creation when players go all-in with different amounts
 * - Distributing multiple pots correctly at showdown
 * - Calculating who is eligible for each pot
 */

import type { PlayerState } from '@/types/poker';

/**
 * Represents a single pot (main or side pot)
 */
export interface Pot {
  amount: number;
  eligiblePlayers: string[]; // Agent IDs eligible to win this pot
  potType: 'main' | 'side';
  potNumber: number; // 0 = main, 1+ = side pots
}

/**
 * Result of side pot calculation
 */
export interface SidePotResult {
  pots: Pot[];
  totalAmount: number;
  description: string;
}

/**
 * Calculates all pots (main and side) based on player contributions
 *
 * Example scenario:
 * - Player A bets $100 (all-in with $100)
 * - Player B calls $200 (has more chips)
 * - Main pot: $200 ($100 from each, both eligible)
 * - Side pot: $100 (only Player B eligible, returned as refund)
 *
 * Complex example:
 * - Player A all-in for $50
 * - Player B all-in for $150
 * - Player C calls $150
 * - Pot 0 (main): $150 ($50 × 3, all eligible)
 * - Pot 1 (side): $200 ($100 × 2, B and C eligible)
 *
 * @param players - All players in the hand (active, folded, all-in)
 * @returns Side pot structure with eligible players for each pot
 */
export function calculateSidePots(players: PlayerState[]): SidePotResult {
  // Get players who contributed to the pot (includes folded players' contributions)
  const contributingPlayers = players.filter(
    (p) => p.totalBetThisHand > 0
  );

  if (contributingPlayers.length === 0) {
    return {
      pots: [],
      totalAmount: 0,
      description: 'No contributions',
    };
  }

  // Sort players by their total contribution (ascending)
  const sortedPlayers = [...contributingPlayers].sort(
    (a, b) => a.totalBetThisHand - b.totalBetThisHand
  );

  const pots: Pot[] = [];
  let previousLevel = 0;

  // Process each contribution level
  for (let i = 0; i < sortedPlayers.length; i++) {
    const currentPlayer = sortedPlayers[i];
    const currentLevel = currentPlayer.totalBetThisHand;

    // Skip if this player has the same contribution as previous
    if (currentLevel === previousLevel) continue;

    const contribution = currentLevel - previousLevel;
    const eligibleCount = sortedPlayers.length - i; // All players from this level onwards

    // Calculate pot amount: contribution × number of eligible players
    const potAmount = contribution * eligibleCount;

    // Players eligible for this pot are those who matched or exceeded this level
    const eligiblePlayers = sortedPlayers.slice(i).map((p) => p.agentId);

    pots.push({
      amount: potAmount,
      eligiblePlayers,
      potType: i === 0 ? 'main' : 'side',
      potNumber: i,
    });

    previousLevel = currentLevel;
  }

  const totalAmount = pots.reduce((sum, pot) => sum + pot.amount, 0);

  // Create description
  let description = '';
  if (pots.length === 1) {
    description = `Main pot: $${pots[0].amount} (${pots[0].eligiblePlayers.length} players)`;
  } else {
    description = `${pots.length} pots: `;
    description += pots
      .map(
        (pot, idx) =>
          `${pot.potType} ${idx > 0 ? `#${idx}` : ''}: $${pot.amount} (${pot.eligiblePlayers.length} eligible)`
      )
      .join(', ');
  }

  return {
    pots,
    totalAmount,
    description,
  };
}

/**
 * Determines if a player is all-in
 * @param player - Player to check
 * @returns True if player is all-in
 */
export function isPlayerAllIn(player: PlayerState): boolean {
  return player.status === 'all-in' || player.chipStack === 0;
}

/**
 * Calculates maximum bet a player can make (all remaining chips)
 * @param player - Player making the bet
 * @returns Maximum bet amount
 */
export function getMaxBetAmount(player: PlayerState): number {
  return player.chipStack;
}

/**
 * Validates if a bet amount would put player all-in
 * @param player - Player making the bet
 * @param betAmount - Amount player wants to bet
 * @returns Object with isAllIn flag and adjusted amount
 */
export function validateAllInBet(
  player: PlayerState,
  betAmount: number
): {
  isAllIn: boolean;
  adjustedAmount: number;
  canAfford: boolean;
} {
  const maxBet = getMaxBetAmount(player);

  if (betAmount > maxBet) {
    // Player can't afford this bet, adjust to all-in
    return {
      isAllIn: true,
      adjustedAmount: maxBet,
      canAfford: false,
    };
  }

  if (betAmount === maxBet) {
    // Exact all-in bet
    return {
      isAllIn: true,
      adjustedAmount: maxBet,
      canAfford: true,
    };
  }

  // Normal bet, player has chips left
  return {
    isAllIn: false,
    adjustedAmount: betAmount,
    canAfford: true,
  };
}

/**
 * Distributes pots to winner(s) at showdown
 * Handles both single winner and split pot scenarios for each pot
 *
 * @param pots - Array of pots (main and side)
 * @param winners - Map of pot number to winner ID(s)
 * @returns Map of player ID to total amount won
 */
export function distributePots(
  pots: Pot[],
  winners: Map<number, string[]>
): Map<string, number> {
  const payouts = new Map<string, number>();

  for (const pot of pots) {
    const potWinners = winners.get(pot.potNumber);
    if (!potWinners || potWinners.length === 0) {
      console.warn(`⚠️ No winners specified for pot #${pot.potNumber}`);
      continue;
    }

    // Split pot equally among winners
    const amountPerWinner = pot.amount / potWinners.length;

    for (const winnerId of potWinners) {
      const currentAmount = payouts.get(winnerId) || 0;
      payouts.set(winnerId, currentAmount + amountPerWinner);
    }
  }

  return payouts;
}

/**
 * Handles odd chip in split pot scenarios
 * In poker, when pot can't be divided evenly, odd chip goes to player
 * closest to dealer button (position-wise)
 *
 * @param potAmount - Total pot amount
 * @param winners - Array of winner IDs
 * @param dealerPosition - Current dealer position
 * @param players - All players (to determine positions)
 * @returns Map of winner ID to exact payout amount
 */
export function distributeWithOddChip(
  potAmount: number,
  winners: string[],
  dealerPosition: number,
  players: PlayerState[]
): Map<string, number> {
  const payouts = new Map<string, number>();

  // Calculate base split
  const baseAmount = Math.floor((potAmount * 100) / winners.length) / 100; // Round down to 2 decimals
  const totalBaseAmount = baseAmount * winners.length;
  const oddChips = Math.round((potAmount - totalBaseAmount) * 100) / 100; // Remaining cents

  // Give base amount to all winners
  for (const winnerId of winners) {
    payouts.set(winnerId, baseAmount);
  }

  // If there are odd chips, give to player closest to dealer
  if (oddChips > 0) {
    // Find winner closest to dealer (in clockwise order)
    const winnerPositions = winners.map((id) => {
      const player = players.find((p) => p.agentId === id);
      return { id, position: player?.position || 0 };
    });

    // Sort by position relative to dealer (clockwise)
    winnerPositions.sort((a, b) => {
      const distA = (a.position - dealerPosition + players.length) % players.length;
      const distB = (b.position - dealerPosition + players.length) % players.length;
      return distA - distB;
    });

    // Give odd chip to first player after dealer
    const oddChipRecipient = winnerPositions[0].id;
    const currentAmount = payouts.get(oddChipRecipient) || baseAmount;
    payouts.set(oddChipRecipient, currentAmount + oddChips);
  }

  return payouts;
}

/**
 * Formats pot information for display
 * @param potResult - Side pot calculation result
 * @returns Human-readable pot description
 */
export function formatPotInfo(potResult: SidePotResult): string {
  if (potResult.pots.length === 0) {
    return 'No pot';
  }

  if (potResult.pots.length === 1) {
    return `Main pot: $${potResult.pots[0].amount.toFixed(2)}`;
  }

  const lines: string[] = [];
  lines.push(`Total pot: $${potResult.totalAmount.toFixed(2)} in ${potResult.pots.length} pots:`);

  for (const pot of potResult.pots) {
    const potLabel = pot.potType === 'main' ? 'Main pot' : `Side pot #${pot.potNumber}`;
    lines.push(`  ${potLabel}: $${pot.amount.toFixed(2)} (${pot.eligiblePlayers.length} eligible)`);
  }

  return lines.join('\n');
}
