/**
 * Poker Game Logger
 *
 * Provides structured, consistent logging for poker games with:
 * - GameId prefixes for easy filtering
 * - Categorized log levels
 * - Detailed action logging
 * - Payment verification logging
 * - Pot calculation logging
 * - Winner determination logging
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogCategory =
  | 'game'
  | 'hand'
  | 'action'
  | 'payment'
  | 'pot'
  | 'showdown'
  | 'payout'
  | 'turn'
  | 'timeout'
  | 'validation';

/**
 * Format a timestamp for logging
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get emoji for log category
 */
function getCategoryEmoji(category: LogCategory): string {
  const emojis: Record<LogCategory, string> = {
    game: '🎮',
    hand: '🎴',
    action: '🎯',
    payment: '💳',
    pot: '💰',
    showdown: '🃏',
    payout: '💸',
    turn: '🔄',
    timeout: '⏱️',
    validation: '✅',
  };
  return emojis[category] || '📝';
}

/**
 * Get emoji for log level
 */
function getLevelEmoji(level: LogLevel): string {
  const emojis: Record<LogLevel, string> = {
    info: '📘',
    warn: '⚠️',
    error: '❌',
    debug: '🔍',
  };
  return emojis[level];
}

/**
 * Core logging function
 */
function log(
  gameId: string,
  category: LogCategory,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const timestamp = getTimestamp();
  const categoryEmoji = getCategoryEmoji(category);
  const levelEmoji = getLevelEmoji(level);

  // Format: [timestamp] 🎮 [game-id] Category: Message
  let logMessage = `[${timestamp}] ${categoryEmoji} ${levelEmoji} [${gameId}] ${category.toUpperCase()}: ${message}`;

  if (data && Object.keys(data).length > 0) {
    logMessage += '\n' + JSON.stringify(data, null, 2);
  }

  // Use appropriate console method
  switch (level) {
    case 'error':
      console.error(logMessage);
      break;
    case 'warn':
      console.warn(logMessage);
      break;
    case 'debug':
      console.debug(logMessage);
      break;
    default:
      console.log(logMessage);
  }
}

// ============================================================================
// GAME LIFECYCLE LOGGING
// ============================================================================

export function logGameCreated(
  gameId: string,
  players: Array<{ agentId: string; agentName: string; chipStack: number }>,
  blinds: { smallBlind: number; bigBlind: number }
): void {
  log(gameId, 'game', 'info', 'Game created', {
    players: players.map((p) => `${p.agentName} (${p.chipStack} USDC)`),
    smallBlind: blinds.smallBlind,
    bigBlind: blinds.bigBlind,
  });
}

export function logGameEnded(
  gameId: string,
  winner: { agentId: string; agentName: string; chipStack: number },
  handsPlayed: number,
  reason: string
): void {
  log(gameId, 'game', 'info', `Game ended - Winner: ${winner.agentName}`, {
    winnerId: winner.agentId,
    finalChips: winner.chipStack,
    handsPlayed,
    reason,
  });
}

// ============================================================================
// HAND LIFECYCLE LOGGING
// ============================================================================

export function logHandStarted(
  gameId: string,
  handNumber: number,
  dealer: string,
  blinds: { small: string; big: string; smallAmount: number; bigAmount: number }
): void {
  log(gameId, 'hand', 'info', `Hand #${handNumber} started`, {
    dealer,
    smallBlind: `${blinds.small} (${blinds.smallAmount} USDC)`,
    bigBlind: `${blinds.big} (${blinds.bigAmount} USDC)`,
  });
}

export function logBettingRoundStarted(
  gameId: string,
  handNumber: number,
  round: string,
  communityCards?: string[]
): void {
  log(gameId, 'hand', 'info', `Betting round: ${round}`, {
    handNumber,
    communityCards: communityCards || [],
  });
}

// ============================================================================
// ACTION LOGGING
// ============================================================================

export function logActionAttempt(
  gameId: string,
  agentId: string,
  agentName: string,
  action: string,
  amount?: number
): void {
  const msg = amount
    ? `${agentName} attempting ${action} ${amount} USDC`
    : `${agentName} attempting ${action}`;

  log(gameId, 'action', 'info', msg, { agentId, action, amount });
}

export function logActionValidated(
  gameId: string,
  agentId: string,
  agentName: string,
  action: string,
  amount?: number
): void {
  const msg = amount
    ? `${agentName} ${action} ${amount} USDC - VALIDATED`
    : `${agentName} ${action} - VALIDATED`;

  log(gameId, 'validation', 'info', msg, { agentId, action, amount });
}

export function logActionFailed(
  gameId: string,
  agentId: string,
  agentName: string,
  action: string,
  reason: string
): void {
  log(gameId, 'validation', 'error', `${agentName} ${action} - FAILED: ${reason}`, {
    agentId,
    action,
    reason,
  });
}

export function logActionCompleted(
  gameId: string,
  agentId: string,
  agentName: string,
  action: string,
  gameState: { pot: number; currentBet: number; playerChips: number }
): void {
  log(gameId, 'action', 'info', `${agentName} ${action} - COMPLETED`, {
    agentId,
    action,
    pot: gameState.pot,
    currentBet: gameState.currentBet,
    playerChipsAfter: gameState.playerChips,
  });
}

// ============================================================================
// PAYMENT LOGGING
// ============================================================================

export function logPaymentRequired(
  gameId: string,
  agentId: string,
  agentName: string,
  amount: number,
  action: string
): void {
  log(gameId, 'payment', 'info', `Payment required: ${agentName} - ${amount} USDC for ${action}`, {
    agentId,
    amount,
    action,
  });
}

export function logPaymentVerifying(
  gameId: string,
  agentId: string,
  agentName: string,
  amount: number
): void {
  log(gameId, 'payment', 'info', `Verifying payment: ${agentName} - ${amount} USDC`, {
    agentId,
    amount,
  });
}

export function logPaymentVerified(
  gameId: string,
  agentId: string,
  agentName: string,
  amount: number
): void {
  log(gameId, 'payment', 'info', `Payment verified: ${agentName} - ${amount} USDC`, {
    agentId,
    amount,
  });
}

export function logPaymentSettling(
  gameId: string,
  agentId: string,
  agentName: string,
  amount: number
): void {
  log(gameId, 'payment', 'info', `Settling payment: ${agentName} - ${amount} USDC`, {
    agentId,
    amount,
  });
}

export function logPaymentSettled(
  gameId: string,
  agentId: string,
  agentName: string,
  amount: number,
  txHash: string
): void {
  log(gameId, 'payment', 'info', `Payment settled: ${agentName} - ${amount} USDC`, {
    agentId,
    amount,
    txHash,
  });
}

export function logPaymentFailed(
  gameId: string,
  agentId: string,
  agentName: string,
  amount: number,
  reason: string
): void {
  log(gameId, 'payment', 'error', `Payment failed: ${agentName} - ${amount} USDC - ${reason}`, {
    agentId,
    amount,
    reason,
  });
}

// ============================================================================
// POT CALCULATION LOGGING
// ============================================================================

export function logPotUpdate(
  gameId: string,
  handNumber: number,
  contribution: number,
  contributor: string,
  newPot: number
): void {
  log(gameId, 'pot', 'info', `Pot updated: ${contributor} added ${contribution} USDC`, {
    handNumber,
    contribution,
    contributor,
    totalPot: newPot,
  });
}

export function logSidePotCreated(
  gameId: string,
  handNumber: number,
  pots: Array<{ potNumber: number; amount: number; eligible: number }>
): void {
  log(gameId, 'pot', 'info', `Side pots created (${pots.length} total)`, {
    handNumber,
    pots: pots.map(
      (p) => `Pot #${p.potNumber}: ${p.amount} USDC (${p.eligible} eligible players)`
    ),
  });
}

// ============================================================================
// SHOWDOWN LOGGING
// ============================================================================

export function logShowdownStarted(
  gameId: string,
  handNumber: number,
  activePlayers: number
): void {
  log(gameId, 'showdown', 'info', `Showdown started - ${activePlayers} players`, {
    handNumber,
    activePlayers,
  });
}

export function logHandEvaluation(
  gameId: string,
  agentId: string,
  agentName: string,
  hand: { name: string; description: string }
): void {
  log(gameId, 'showdown', 'info', `${agentName}: ${hand.name} - ${hand.description}`, {
    agentId,
    handName: hand.name,
    handDescription: hand.description,
  });
}

export function logWinnerDetermined(
  gameId: string,
  handNumber: number,
  winners: Array<{ agentId: string; agentName: string }>,
  potNumber: number
): void {
  const winnerNames = winners.map((w) => w.agentName).join(', ');
  const msg =
    winners.length > 1
      ? `Pot #${potNumber} tied: ${winnerNames}`
      : `Pot #${potNumber} winner: ${winnerNames}`;

  log(gameId, 'showdown', 'info', msg, {
    handNumber,
    potNumber,
    winners: winners.map((w) => w.agentId),
    isTie: winners.length > 1,
  });
}

// ============================================================================
// PAYOUT LOGGING
// ============================================================================

export function logPayoutStarted(
  gameId: string,
  handNumber: number,
  totalPot: number,
  recipients: number
): void {
  log(gameId, 'payout', 'info', `Payout started - ${totalPot} USDC to ${recipients} player(s)`, {
    handNumber,
    totalPot,
    recipients,
  });
}

export function logPayoutExecuted(
  gameId: string,
  agentId: string,
  agentName: string,
  amount: number,
  txHash: string
): void {
  log(gameId, 'payout', 'info', `Payout: ${agentName} received ${amount} USDC`, {
    agentId,
    amount,
    txHash,
  });
}

export function logPayoutCompleted(
  gameId: string,
  handNumber: number,
  totalPaid: number
): void {
  log(gameId, 'payout', 'info', `Payout completed - ${totalPaid} USDC distributed`, {
    handNumber,
    totalPaid,
  });
}

// ============================================================================
// TURN MANAGEMENT LOGGING
// ============================================================================

export function logTurnAdvanced(
  gameId: string,
  from: string,
  to: string,
  timeRemaining: number
): void {
  log(gameId, 'turn', 'info', `Turn advanced: ${from} → ${to}`, {
    from,
    to,
    timeRemaining: `${timeRemaining}s`,
  });
}

export function logTurnTimeout(
  gameId: string,
  agentId: string,
  agentName: string,
  secondsElapsed: number
): void {
  log(gameId, 'timeout', 'warn', `${agentName} timed out (${secondsElapsed}s elapsed)`, {
    agentId,
    secondsElapsed,
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Log arbitrary debug information
 */
export function logDebug(gameId: string, message: string, data?: Record<string, unknown>): void {
  log(gameId, 'game', 'debug', message, data);
}

/**
 * Log warnings
 */
export function logWarning(gameId: string, message: string, data?: Record<string, unknown>): void {
  log(gameId, 'game', 'warn', message, data);
}

/**
 * Log errors
 */
export function logError(
  gameId: string,
  message: string,
  error?: Error,
  data?: Record<string, unknown>
): void {
  log(gameId, 'game', 'error', message, {
    ...data,
    error: error?.message,
    stack: error?.stack,
  });
}
