/**
 * Pot Manager for Poker
 * Handles main pot and side pots for all-in situations
 */

import type { SidePot, PlayerState } from '@/types/poker';

// ============================================================================
// POT CONTRIBUTION TRACKING
// ============================================================================

interface PlayerContribution {
  agentId: string;
  amount: number;
  isAllIn: boolean;
}

/**
 * Pot Manager Class
 * Manages main pot and side pots for complex all-in scenarios
 */
export class PotManager {
  private contributions: Map<string, number>; // agentId -> total contribution this hand
  private mainPot: number;
  private sidePots: SidePot[];

  constructor() {
    this.contributions = new Map();
    this.mainPot = 0;
    this.sidePots = [];
  }

  /**
   * Resets pot manager for a new hand
   */
  reset(): void {
    this.contributions.clear();
    this.mainPot = 0;
    this.sidePots = [];
  }

  /**
   * Records a player's contribution to the pot
   */
  addContribution(agentId: string, amount: number): void {
    const current = this.contributions.get(agentId) || 0;
    this.contributions.set(agentId, current + amount);
    this.mainPot += amount;
  }

  /**
   * Gets a player's total contribution this hand
   */
  getContribution(agentId: string): number {
    return this.contributions.get(agentId) || 0;
  }

  /**
   * Gets the total pot (main pot + all side pots)
   */
  getTotalPot(): number {
    return this.mainPot + this.sidePots.reduce((sum, pot) => sum + pot.amount, 0);
  }

  /**
   * Gets the main pot amount
   */
  getMainPot(): number {
    return this.mainPot;
  }

  /**
   * Gets all side pots
   */
  getSidePots(): SidePot[] {
    return [...this.sidePots];
  }

  /**
   * Calculates side pots when players go all-in
   * This is called when a betting round completes and we need to split pots
   */
  calculateSidePots(players: PlayerState[]): void {
    // Get player contributions and all-in status
    const playerContribs: PlayerContribution[] = players.map((p) => ({
      agentId: p.agentId,
      amount: this.getContribution(p.agentId),
      isAllIn: p.status === 'all-in',
    }));

    // If no all-ins, everything goes to main pot (already tracked)
    const allInPlayers = playerContribs.filter((p) => p.isAllIn);
    if (allInPlayers.length === 0) {
      return;
    }

    // Sort contributions by amount (ascending)
    const sorted = [...playerContribs].sort((a, b) => a.amount - b.amount);

    // Reset side pots (we'll recalculate from scratch)
    this.sidePots = [];
    let remainingPlayers = [...sorted];

    // Process each contribution level
    while (remainingPlayers.length > 0) {
      const smallestContribution = remainingPlayers[0].amount;

      if (smallestContribution === 0) {
        // Player folded or contributed nothing
        remainingPlayers.shift();
        continue;
      }

      // Calculate pot for this level
      const potAmount = smallestContribution * remainingPlayers.length;
      const eligiblePlayers = remainingPlayers.map((p) => p.agentId);

      // Create side pot (or main pot if this is the first level)
      if (this.sidePots.length === 0 && remainingPlayers.length === players.length) {
        // This is the main pot
        this.mainPot = potAmount;
      } else {
        // This is a side pot
        this.sidePots.push({
          amount: potAmount,
          eligiblePlayers,
        });
      }

      // Reduce all remaining contributions by this level
      for (const player of remainingPlayers) {
        player.amount -= smallestContribution;
      }

      // Remove player(s) who contributed exactly this amount
      remainingPlayers = remainingPlayers.filter((p) => p.amount > 0);
    }

    console.log(`💰 Pots calculated:`);
    console.log(`   Main pot: ${this.mainPot}`);
    for (let i = 0; i < this.sidePots.length; i++) {
      console.log(`   Side pot ${i + 1}: ${this.sidePots[i].amount} (${this.sidePots[i].eligiblePlayers.join(', ')})`);
    }
  }

  /**
   * Distributes pots to winner(s)
   * Returns a map of agentId -> amount won
   */
  distributePots(winners: { agentId: string; handRank: any }[]): Map<string, number> {
    const payouts = new Map<string, number>();

    // Distribute main pot
    const mainPotWinners = winners.filter((w) =>
      this.contributions.has(w.agentId) && this.getContribution(w.agentId) > 0
    );

    if (mainPotWinners.length > 0) {
      const mainPotShare = this.mainPot / mainPotWinners.length;
      for (const winner of mainPotWinners) {
        const current = payouts.get(winner.agentId) || 0;
        payouts.set(winner.agentId, current + mainPotShare);
      }
    }

    // Distribute side pots
    for (const sidePot of this.sidePots) {
      // Find winners eligible for this side pot
      const eligibleWinners = winners.filter((w) =>
        sidePot.eligiblePlayers.includes(w.agentId)
      );

      if (eligibleWinners.length === 0) {
        console.warn(`⚠️ No eligible winners for side pot of ${sidePot.amount}`);
        continue;
      }

      // If multiple winners with same hand rank, split the side pot
      const sidePotShare = sidePot.amount / eligibleWinners.length;
      for (const winner of eligibleWinners) {
        const current = payouts.get(winner.agentId) || 0;
        payouts.set(winner.agentId, current + sidePotShare);
      }
    }

    return payouts;
  }

  /**
   * Gets a summary of current pot status for display
   */
  getPotSummary(): {
    totalPot: number;
    mainPot: number;
    sidePots: { amount: number; eligibleCount: number }[];
  } {
    return {
      totalPot: this.getTotalPot(),
      mainPot: this.mainPot,
      sidePots: this.sidePots.map((sp) => ({
        amount: sp.amount,
        eligibleCount: sp.eligiblePlayers.length,
      })),
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculates how to split a pot among multiple winners
 * Handles odd chips (extra chip goes to player closest to dealer)
 */
export function splitPot(
  potAmount: number,
  winnerIds: string[],
  dealerPosition: number,
  allPlayers: PlayerState[]
): Map<string, number> {
  const splits = new Map<string, number>();

  if (winnerIds.length === 0) {
    return splits;
  }

  const baseAmount = Math.floor(potAmount / winnerIds.length);
  const remainder = potAmount % winnerIds.length;

  // Award base amount to all winners
  for (const winnerId of winnerIds) {
    splits.set(winnerId, baseAmount);
  }

  // If there's a remainder, award extra chips to winner(s) closest to dealer
  if (remainder > 0) {
    // Find winner closest to dealer (next to act after dealer)
    const winnerPositions = winnerIds
      .map((id) => {
        const player = allPlayers.find((p) => p.agentId === id);
        return player ? { id, position: player.position } : null;
      })
      .filter((p): p is { id: string; position: number } => p !== null);

    // Sort by position relative to dealer
    winnerPositions.sort((a, b) => {
      const aDist = (a.position - dealerPosition + allPlayers.length) % allPlayers.length;
      const bDist = (b.position - dealerPosition + allPlayers.length) % allPlayers.length;
      return aDist - bDist;
    });

    // Award remainder chips to closest winner(s)
    for (let i = 0; i < remainder && i < winnerPositions.length; i++) {
      const winnerId = winnerPositions[i].id;
      const current = splits.get(winnerId) || 0;
      splits.set(winnerId, current + 1);
    }
  }

  return splits;
}

/**
 * Validates that pot distribution is correct
 * Returns true if total distributed equals total pot
 */
export function validatePotDistribution(
  totalPot: number,
  distribution: Map<string, number>
): boolean {
  const totalDistributed = Array.from(distribution.values()).reduce((sum, amount) => sum + amount, 0);
  return Math.abs(totalDistributed - totalPot) < 0.01; // Allow for floating point precision
}

/**
 * Formats pot amount for display (rounds to 2 decimals)
 */
export function formatPotAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Creates a simple pot manager instance for a new hand
 */
export function createPotManager(): PotManager {
  return new PotManager();
}
