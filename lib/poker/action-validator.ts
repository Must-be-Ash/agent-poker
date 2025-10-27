/**
 * Action Validation for Poker
 *
 * Validates all poker actions before processing:
 * - Check if it's player's turn
 * - Check player has sufficient chips
 * - Check action is valid for current game state
 * - Return descriptive errors for invalid actions
 */

import type { PokerGameRecord, PlayerState } from '@/types/poker';
import type { PokerActionType } from '@/types/poker';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: string;
  hint?: string;
}

/**
 * Validates if a player can take a specific action
 * @param game - Current game state
 * @param agentId - Agent attempting the action
 * @param action - Action type
 * @param amount - Amount for bet/raise (optional)
 * @returns Validation result
 */
export function validateAction(
  game: PokerGameRecord,
  agentId: string,
  action: PokerActionType,
  amount?: number
): ValidationResult {
  // 1. Check game status
  if (game.gameStatus !== 'in_progress') {
    return {
      valid: false,
      error: 'Game is not in progress',
      details: `Game status is '${game.gameStatus}'. Actions can only be taken during active games.`,
    };
  }

  // 2. Find the player
  const player = game.players.find((p) => p.agentId === agentId);
  if (!player) {
    return {
      valid: false,
      error: 'Player not found',
      details: `Agent ${agentId} is not a player in this game.`,
    };
  }

  // 3. Check player status
  if (player.status === 'folded') {
    return {
      valid: false,
      error: 'Cannot act after folding',
      details: 'You have folded this hand and cannot take further actions.',
    };
  }

  if (player.status === 'out') {
    return {
      valid: false,
      error: 'Player is out of the game',
      details: 'You are out of the game and cannot take actions.',
    };
  }

  if (player.status === 'all-in') {
    return {
      valid: false,
      error: 'Cannot act when all-in',
      details: 'You are all-in and cannot take further actions this hand.',
    };
  }

  // 4. Check if it's the player's turn
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.agentId !== agentId) {
    return {
      valid: false,
      error: 'Not your turn',
      details: `It is currently ${currentPlayer.agentName}'s turn. Please wait.`,
      hint: `Current player: ${currentPlayer.agentName}`,
    };
  }

  // 5. Validate specific action
  switch (action) {
    case 'fold':
      return validateFold(game, player);
    case 'check':
      return validateCheck(game, player);
    case 'call':
      return validateCall(game, player);
    case 'bet':
      return validateBet(game, player, amount);
    case 'raise':
      return validateRaise(game, player, amount);
    default:
      return {
        valid: false,
        error: 'Invalid action type',
        details: `Action '${action}' is not recognized.`,
      };
  }
}

/**
 * Validate fold action
 */
function validateFold(game: PokerGameRecord, player: PlayerState): ValidationResult {
  // Fold is always valid (player can always give up)
  return { valid: true };
}

/**
 * Validate check action
 */
function validateCheck(game: PokerGameRecord, player: PlayerState): ValidationResult {
  const amountToCall = game.currentBet - player.currentBet;

  if (amountToCall > 0) {
    return {
      valid: false,
      error: 'Cannot check when facing a bet',
      details: `There is a bet of ${game.currentBet} USDC. You must call ${amountToCall} USDC, raise, or fold.`,
      hint: `Current bet: ${game.currentBet} USDC, Your bet: ${player.currentBet} USDC`,
    };
  }

  return { valid: true };
}

/**
 * Validate call action
 */
function validateCall(game: PokerGameRecord, player: PlayerState): ValidationResult {
  const amountToCall = game.currentBet - player.currentBet;

  if (amountToCall === 0) {
    return {
      valid: false,
      error: 'Cannot call when there is no bet',
      details: 'There is no bet to call. You can check or bet.',
      hint: 'Use "check" instead of "call" when there is no bet',
    };
  }

  if (player.chipStack === 0) {
    return {
      valid: false,
      error: 'Cannot call with no chips',
      details: 'You have 0 chips remaining.',
    };
  }

  // If player doesn't have enough to call, they can still go all-in
  // This is valid, we'll handle it as an all-in call
  if (player.chipStack < amountToCall) {
    // This is actually valid - it's an all-in call
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Validate bet action
 */
function validateBet(
  game: PokerGameRecord,
  player: PlayerState,
  amount?: number
): ValidationResult {
  // Check if there's already a bet this round
  if (game.currentBet > 0) {
    return {
      valid: false,
      error: 'Cannot bet when there is already a bet',
      details: `There is already a bet of ${game.currentBet} USDC. You must call, raise, or fold.`,
      hint: 'Use "raise" instead of "bet" when there is already a bet',
    };
  }

  // Check if amount is provided
  if (amount === undefined || amount === null) {
    return {
      valid: false,
      error: 'Bet amount required',
      details: 'You must specify an amount for a bet.',
      hint: 'Provide the amount in USDC',
    };
  }

  // Check if amount is valid
  if (amount <= 0) {
    return {
      valid: false,
      error: 'Bet amount must be positive',
      details: `Bet amount ${amount} is invalid. Must be greater than 0.`,
    };
  }

  // Check minimum bet (at least big blind)
  if (amount < game.bigBlind) {
    return {
      valid: false,
      error: 'Bet amount too small',
      details: `Minimum bet is ${game.bigBlind} USDC (big blind). You tried to bet ${amount} USDC.`,
      hint: `Minimum bet: ${game.bigBlind} USDC`,
    };
  }

  // Check if player has enough chips
  if (amount > player.chipStack) {
    return {
      valid: false,
      error: 'Insufficient chips for bet',
      details: `You have ${player.chipStack} USDC but tried to bet ${amount} USDC.`,
      hint: `Your chip stack: ${player.chipStack} USDC`,
    };
  }

  return { valid: true };
}

/**
 * Validate raise action
 */
function validateRaise(
  game: PokerGameRecord,
  player: PlayerState,
  amount?: number
): ValidationResult {
  // Check if there's a bet to raise
  if (game.currentBet === 0) {
    return {
      valid: false,
      error: 'Cannot raise when there is no bet',
      details: 'There is no bet to raise. You can bet or check.',
      hint: 'Use "bet" instead of "raise" when there is no current bet',
    };
  }

  // Check if amount is provided
  if (amount === undefined || amount === null) {
    return {
      valid: false,
      error: 'Raise amount required',
      details: 'You must specify the total amount you want to bet (not just the raise amount).',
      hint: 'Provide your total bet amount in USDC',
    };
  }

  // Check if amount is valid
  if (amount <= 0) {
    return {
      valid: false,
      error: 'Raise amount must be positive',
      details: `Raise amount ${amount} is invalid. Must be greater than 0.`,
    };
  }

  const amountToCall = game.currentBet - player.currentBet;
  const totalBetNeeded = amount - player.currentBet; // Total chips needed from player

  // Check if raise amount is at least a call
  if (amount <= game.currentBet) {
    return {
      valid: false,
      error: 'Raise amount too small',
      details: `Current bet is ${game.currentBet} USDC. Your raise to ${amount} USDC is not higher than the current bet.`,
      hint: `To raise, you must bet more than ${game.currentBet} USDC`,
    };
  }

  // Check minimum raise (at least 2x the current bet, or minimum of big blind increase)
  const minRaiseAmount = game.currentBet + game.bigBlind;
  if (amount < minRaiseAmount) {
    return {
      valid: false,
      error: 'Raise increment too small',
      details: `Minimum raise is ${minRaiseAmount} USDC (current bet + big blind). You tried to raise to ${amount} USDC.`,
      hint: `Minimum raise: ${minRaiseAmount} USDC`,
    };
  }

  // Check if player has enough chips for this raise
  if (totalBetNeeded > player.chipStack) {
    return {
      valid: false,
      error: 'Insufficient chips for raise',
      details: `You have ${player.chipStack} USDC but need ${totalBetNeeded} USDC to raise to ${amount} USDC.`,
      hint: `Your chip stack: ${player.chipStack} USDC, Amount needed: ${totalBetNeeded} USDC`,
    };
  }

  return { valid: true };
}

/**
 * Gets available actions for a player
 * @param game - Current game state
 * @param agentId - Agent ID
 * @returns List of valid actions
 */
export function getAvailableActions(
  game: PokerGameRecord,
  agentId: string
): PokerActionType[] {
  const actions: PokerActionType[] = [];

  // Always can fold (unless not your turn or already folded)
  const foldResult = validateAction(game, agentId, 'fold');
  if (foldResult.valid) {
    actions.push('fold');
  }

  // Check if can check
  const checkResult = validateAction(game, agentId, 'check');
  if (checkResult.valid) {
    actions.push('check');
  }

  // Check if can call
  const callResult = validateAction(game, agentId, 'call');
  if (callResult.valid) {
    actions.push('call');
  }

  // Check if can bet (use minimum bet as test amount)
  const betResult = validateAction(game, agentId, 'bet', game.bigBlind);
  if (betResult.valid) {
    actions.push('bet');
  }

  // Check if can raise (use minimum raise as test amount)
  const raiseResult = validateAction(game, agentId, 'raise', game.currentBet + game.bigBlind);
  if (raiseResult.valid) {
    actions.push('raise');
  }

  return actions;
}

/**
 * Gets betting constraints for a player
 * @param game - Current game state
 * @param player - Player state
 * @returns Betting constraints
 */
export function getBettingConstraints(
  game: PokerGameRecord,
  player: PlayerState
): {
  minBet: number;
  maxBet: number;
  minRaise: number;
  maxRaise: number;
  amountToCall: number;
} {
  const amountToCall = game.currentBet - player.currentBet;

  return {
    minBet: game.bigBlind,
    maxBet: player.chipStack,
    minRaise: game.currentBet + game.bigBlind,
    maxRaise: player.currentBet + player.chipStack,
    amountToCall,
  };
}
