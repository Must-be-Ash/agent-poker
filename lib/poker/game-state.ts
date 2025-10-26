/**
 * Poker Game State Manager
 * Core game engine that orchestrates Texas Hold'em poker logic
 */

import type {
  Card,
  PlayerState,
  GameState,
  PokerActionType,
  PokerAction,
  BettingRound,
  GameStatus,
  HandResult,
} from '@/types/poker';
import { createShuffledDeck, dealCards } from './cards';
import { evaluateBestHand, compareHands } from './hand-evaluator';

// ============================================================================
// POKER GAME CLASS
// ============================================================================

export class PokerGame {
  private state: GameState;

  constructor(
    gameId: string,
    players: { agentId: string; agentName: string; walletAddress: string; startingChips: number }[],
    smallBlind: number,
    bigBlind: number
  ) {
    if (players.length !== 2) {
      throw new Error('PokerGame currently supports exactly 2 players');
    }

    // Initialize player states
    const playerStates: PlayerState[] = players.map((player, index) => ({
      agentId: player.agentId,
      agentName: player.agentName,
      walletAddress: player.walletAddress,
      chipStack: player.startingChips,
      currentBet: 0,
      cards: null,
      status: 'active',
      position: index,
      totalBetThisHand: 0,
      isDealer: index === 0, // Player 0 starts as dealer
      isSmallBlind: index === 0, // In heads-up, dealer is small blind
      isBigBlind: index === 1,
    }));

    // Initialize game state
    this.state = {
      gameId,
      players: playerStates,
      deck: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      currentBet: 0,
      bettingRound: 'preflop',
      dealerPosition: 0,
      currentPlayerIndex: 0, // Will be set properly in startNewHand
      actionHistory: [],
      handNumber: 0,
      gameStatus: 'waiting',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store blinds for future hands
    (this.state as any).smallBlind = smallBlind;
    (this.state as any).bigBlind = bigBlind;
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getState(): GameState {
    return { ...this.state };
  }

  getPlayer(agentId: string): PlayerState | undefined {
    return this.state.players.find((p) => p.agentId === agentId);
  }

  getCurrentPlayer(): PlayerState {
    return this.state.players[this.state.currentPlayerIndex];
  }

  getActivePlayers(): PlayerState[] {
    return this.state.players.filter((p) => p.status === 'active' || p.status === 'all-in');
  }

  // ============================================================================
  // HAND LIFECYCLE
  // ============================================================================

  /**
   * Starts a new hand
   * - Rotates dealer position
   * - Deals cards to players
   * - Posts blinds
   * - Sets first player to act
   */
  startNewHand(): void {
    this.state.handNumber++;
    this.state.gameStatus = 'in_progress';

    // Rotate dealer position
    this.state.dealerPosition = (this.state.dealerPosition + 1) % 2;

    // Reset player states for new hand
    for (let i = 0; i < this.state.players.length; i++) {
      const player = this.state.players[i];
      player.currentBet = 0;
      player.totalBetThisHand = 0;
      player.cards = null;
      player.status = player.chipStack > 0 ? 'active' : 'out';

      // Set positions (in heads-up, dealer is small blind)
      player.isDealer = i === this.state.dealerPosition;
      player.isSmallBlind = i === this.state.dealerPosition;
      player.isBigBlind = i !== this.state.dealerPosition;
    }

    // Reset game state
    this.state.deck = createShuffledDeck();
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = 0;
    this.state.bettingRound = 'preflop';

    // Deal hole cards to each player
    for (const player of this.state.players) {
      if (player.status === 'active') {
        const cards = dealCards(this.state.deck, 2);
        player.cards = [cards[0], cards[1]];
      }
    }

    // Post blinds (Note: User chose on-chain blind payments)
    // For now, we track blinds in state - actual payment happens via x402
    const smallBlind = (this.state as any).smallBlind;
    const bigBlind = (this.state as any).bigBlind;

    const smallBlindPlayer = this.state.players.find((p) => p.isSmallBlind);
    const bigBlindPlayer = this.state.players.find((p) => p.isBigBlind);

    if (smallBlindPlayer) {
      smallBlindPlayer.currentBet = smallBlind;
      smallBlindPlayer.totalBetThisHand = smallBlind;
      this.state.pot += smallBlind;
    }

    if (bigBlindPlayer) {
      bigBlindPlayer.currentBet = bigBlind;
      bigBlindPlayer.totalBetThisHand = bigBlind;
      this.state.pot += bigBlind;
      this.state.currentBet = bigBlind;
    }

    // In heads-up preflop, small blind (dealer) acts first
    this.state.currentPlayerIndex = this.state.dealerPosition;

    this.state.updatedAt = new Date();

    console.log(`🃏 Hand #${this.state.handNumber} started`);
    console.log(`   Dealer: ${this.state.players[this.state.dealerPosition].agentName}`);
    console.log(`   Blinds: ${smallBlind}/${bigBlind}`);
  }

  /**
   * Handles a player action (check, call, bet, raise, fold)
   */
  handleAction(agentId: string, actionType: PokerActionType, amount?: number): void {
    const player = this.getPlayer(agentId);
    if (!player) {
      throw new Error(`Player ${agentId} not found`);
    }

    // Validate it's this player's turn
    if (this.state.players[this.state.currentPlayerIndex].agentId !== agentId) {
      throw new Error(`Not ${agentId}'s turn to act`);
    }

    // Validate action is legal
    this.validateAction(player, actionType, amount);

    // Create action record
    const action: PokerAction = {
      type: actionType,
      amount,
      playerId: agentId,
      timestamp: new Date(),
    };

    // Process the action
    switch (actionType) {
      case 'fold':
        player.status = 'folded';
        player.cards = null;
        break;

      case 'check':
        // No chips added to pot
        break;

      case 'call':
        const callAmount = this.state.currentBet - player.currentBet;
        this.addChipsToPot(player, callAmount);
        break;

      case 'bet':
      case 'raise':
        if (!amount) {
          throw new Error(`${actionType} requires an amount`);
        }
        this.addChipsToPot(player, amount);
        this.state.currentBet = player.currentBet;
        break;
    }

    // Record action in history
    this.state.actionHistory.push({
      handNumber: this.state.handNumber,
      bettingRound: this.state.bettingRound,
      action,
      potAfterAction: this.state.pot,
      timestamp: new Date(),
    });

    this.state.updatedAt = new Date();

    console.log(`   ${player.agentName} ${actionType}${amount ? ` ${amount}` : ''}`);

    // Move to next player or advance betting round
    this.advanceAction();
  }

  /**
   * Advances to the next round (flop, turn, river, or showdown)
   */
  advanceToNextRound(): void {
    const roundOrder: BettingRound[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentIndex = roundOrder.indexOf(this.state.bettingRound);

    if (currentIndex === -1 || currentIndex === roundOrder.length - 1) {
      throw new Error('Cannot advance past showdown');
    }

    const nextRound = roundOrder[currentIndex + 1];
    this.state.bettingRound = nextRound;

    // Reset betting for new round
    this.state.currentBet = 0;
    for (const player of this.state.players) {
      player.currentBet = 0;
    }

    // Deal community cards
    switch (nextRound) {
      case 'flop':
        // Burn one card, deal 3
        dealCards(this.state.deck, 1); // Burn
        this.state.communityCards.push(...dealCards(this.state.deck, 3));
        console.log(`🃏 Flop: ${this.state.communityCards.map((c) => `${c.rank}${c.suit[0]}`).join(' ')}`);
        break;

      case 'turn':
        // Burn one card, deal 1
        dealCards(this.state.deck, 1); // Burn
        this.state.communityCards.push(...dealCards(this.state.deck, 1));
        console.log(`🃏 Turn: ${this.state.communityCards[3].rank}${this.state.communityCards[3].suit[0]}`);
        break;

      case 'river':
        // Burn one card, deal 1
        dealCards(this.state.deck, 1); // Burn
        this.state.communityCards.push(...dealCards(this.state.deck, 1));
        console.log(`🃏 River: ${this.state.communityCards[4].rank}${this.state.communityCards[4].suit[0]}`);
        break;

      case 'showdown':
        // No cards to deal
        break;
    }

    // Post-flop, big blind acts last (so non-dealer acts first)
    this.state.currentPlayerIndex = this.state.dealerPosition === 0 ? 1 : 0;

    this.state.updatedAt = new Date();
  }

  /**
   * Determines the winner at showdown
   */
  determineWinner(): HandResult {
    if (this.state.bettingRound !== 'showdown') {
      // Check if only one player remains (others folded)
      const activePlayers = this.state.players.filter((p) => p.status !== 'folded' && p.status !== 'out');

      if (activePlayers.length === 1) {
        // Winner by fold
        const winner = activePlayers[0];
        return {
          handNumber: this.state.handNumber,
          winnerId: winner.agentId,
          winnerName: winner.agentName,
          winningHand: {
            type: 0,
            name: 'Win by Fold',
            value: 0,
            description: 'Opponent folded',
          },
          winningCards: [],
          potWon: this.state.pot,
          timestamp: new Date(),
        };
      }

      throw new Error('Cannot determine winner before showdown with multiple active players');
    }

    // Evaluate hands
    const hands: { player: PlayerState; handRank: any }[] = [];

    for (const player of this.state.players) {
      if (player.status !== 'folded' && player.status !== 'out' && player.cards) {
        const handRank = evaluateBestHand(player.cards, this.state.communityCards);
        hands.push({ player, handRank });
      }
    }

    if (hands.length === 0) {
      throw new Error('No players to evaluate at showdown');
    }

    // Find best hand
    let bestHand = hands[0];
    for (let i = 1; i < hands.length; i++) {
      if (compareHands(hands[i].handRank, bestHand.handRank) > 0) {
        bestHand = hands[i];
      }
    }

    // Create showdown cards record
    const showdownCards: Record<string, any> = {};
    for (const { player, handRank } of hands) {
      showdownCards[player.agentId] = {
        holeCards: player.cards!,
        handRank,
      };
    }

    return {
      handNumber: this.state.handNumber,
      winnerId: bestHand.player.agentId,
      winnerName: bestHand.player.agentName,
      winningHand: bestHand.handRank,
      winningCards: [...bestHand.player.cards!, ...this.state.communityCards],
      potWon: this.state.pot,
      showdownCards,
      timestamp: new Date(),
    };
  }

  /**
   * Distributes chips to the winner
   */
  distributeChips(winnerId: string): void {
    const winner = this.getPlayer(winnerId);
    if (!winner) {
      throw new Error(`Winner ${winnerId} not found`);
    }

    winner.chipStack += this.state.pot;
    console.log(`💰 ${winner.agentName} wins ${this.state.pot} chips`);
    console.log(`   New stack: ${winner.chipStack}`);

    this.state.pot = 0;
    this.state.updatedAt = new Date();

    // Check if game is over
    const playersWithChips = this.state.players.filter((p) => p.chipStack > 0);
    if (playersWithChips.length === 1) {
      this.state.gameStatus = 'ended';
      console.log(`🏆 Game Over! ${playersWithChips[0].agentName} wins!`);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Validates if an action is legal
   */
  private validateAction(player: PlayerState, actionType: PokerActionType, amount?: number): void {
    // Can't act if folded or out
    if (player.status === 'folded' || player.status === 'out') {
      throw new Error(`Player ${player.agentId} cannot act (status: ${player.status})`);
    }

    const amountToCall = this.state.currentBet - player.currentBet;

    switch (actionType) {
      case 'check':
        if (amountToCall > 0) {
          throw new Error('Cannot check when there is a bet to call');
        }
        break;

      case 'call':
        if (amountToCall === 0) {
          throw new Error('Cannot call when no bet to match');
        }
        if (player.chipStack < amountToCall) {
          throw new Error(`Insufficient chips to call (need ${amountToCall}, have ${player.chipStack})`);
        }
        break;

      case 'bet':
        if (this.state.currentBet > 0) {
          throw new Error('Cannot bet when there is already a bet (use raise)');
        }
        if (!amount || amount <= 0) {
          throw new Error('Bet amount must be positive');
        }
        if (amount > player.chipStack) {
          throw new Error(`Insufficient chips to bet ${amount} (have ${player.chipStack})`);
        }
        break;

      case 'raise':
        if (this.state.currentBet === 0) {
          throw new Error('Cannot raise when there is no bet (use bet)');
        }
        if (!amount || amount <= this.state.currentBet) {
          throw new Error(`Raise must be greater than current bet of ${this.state.currentBet}`);
        }
        if (amount > player.chipStack + player.currentBet) {
          throw new Error(`Insufficient chips to raise to ${amount}`);
        }
        break;

      case 'fold':
        // Folding is always legal
        break;
    }
  }

  /**
   * Adds chips from a player to the pot
   */
  private addChipsToPot(player: PlayerState, amount: number): void {
    const actualAmount = Math.min(amount, player.chipStack);

    player.chipStack -= actualAmount;
    player.currentBet += actualAmount;
    player.totalBetThisHand += actualAmount;
    this.state.pot += actualAmount;

    // Mark as all-in if out of chips
    if (player.chipStack === 0) {
      player.status = 'all-in';
      console.log(`   ${player.agentName} is ALL-IN!`);
    }
  }

  /**
   * Advances action to next player or next round
   */
  private advanceAction(): void {
    const activePlayers = this.state.players.filter((p) => p.status === 'active' || p.status === 'all-in');

    // If only one player active (others folded), hand is over
    if (activePlayers.filter((p) => p.status === 'active').length <= 1) {
      const winner = this.determineWinner();
      this.distributeChips(winner.winnerId);
      return;
    }

    // Check if betting round is complete
    const bettingComplete = this.isBettingRoundComplete();

    if (bettingComplete) {
      // Move to next round
      if (this.state.bettingRound === 'river') {
        // Go to showdown
        this.state.bettingRound = 'showdown';
        const winner = this.determineWinner();
        this.distributeChips(winner.winnerId);
      } else {
        this.advanceToNextRound();
      }
    } else {
      // Move to next active player
      do {
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
      } while (
        this.state.players[this.state.currentPlayerIndex].status === 'folded' ||
        this.state.players[this.state.currentPlayerIndex].status === 'out'
      );
    }
  }

  /**
   * Checks if the current betting round is complete
   */
  private isBettingRoundComplete(): boolean {
    const activePlayers = this.state.players.filter(
      (p) => p.status === 'active' || p.status === 'all-in'
    );

    // Everyone except all-in players must have matched the current bet
    for (const player of activePlayers) {
      if (player.status === 'active' && player.currentBet < this.state.currentBet) {
        return false;
      }
    }

    // All active players have acted at least once this round
    // (This is a simplification - in production you'd track who has acted)
    return true;
  }
}
