/**
 * x402 Configuration for Poker Game
 * Payment schemes for poker actions (blinds, bets, calls, raises)
 */

import type { PokerActionType } from '@/types/poker';

// ============================================================================
// CONSTANTS
// ============================================================================

// Facilitator URL
export const facilitatorConfig = {
  url: process.env.FACILITATOR_URL || 'https://x402.org/facilitator',
};

// USDC token address on Base Sepolia
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Payment scheme for x402 (exact amounts in USDC)
export const PAYMENT_SCHEME = 'exact';

// ============================================================================
// PAYMENT AMOUNT CALCULATION
// ============================================================================

/**
 * Calculates the required payment amount for a poker action
 * @param actionType - Type of poker action
 * @param amount - Amount for bet/raise/call (optional)
 * @param currentBet - Current bet in the round (for call validation)
 * @param playerCurrentBet - Player's current bet this round (for call amount)
 * @returns Payment amount in USDC (as number)
 */
export function calculatePokerPayment(
  actionType: PokerActionType,
  amount?: number,
  currentBet?: number,
  playerCurrentBet?: number
): number {
  switch (actionType) {
    case 'check':
      // No payment required for check
      return 0;

    case 'fold':
      // No payment required for fold
      return 0;

    case 'call':
      // Payment = difference between current bet and player's current bet
      if (currentBet === undefined || playerCurrentBet === undefined) {
        throw new Error('currentBet and playerCurrentBet required for call action');
      }
      return currentBet - playerCurrentBet;

    case 'bet':
      // Payment = bet amount
      if (!amount || amount <= 0) {
        throw new Error('Positive amount required for bet action');
      }
      return amount;

    case 'raise':
      // Payment = raise amount minus what player has already bet this round
      if (!amount || amount <= 0) {
        throw new Error('Positive amount required for raise action');
      }
      if (playerCurrentBet === undefined) {
        throw new Error('playerCurrentBet required for raise action');
      }
      return amount - playerCurrentBet;

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

/**
 * Formats a USDC amount for x402 payment (with $ prefix)
 * @param amount - Amount in USDC
 * @returns Formatted price string (e.g., "$10.50")
 */
export function formatPaymentAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Parses a payment amount string to a number
 * @param priceString - Price string (e.g., "$10.50")
 * @returns Amount as number
 */
export function parsePaymentAmount(priceString: string): number {
  return parseFloat(priceString.replace('$', ''));
}

// ============================================================================
// BLIND PAYMENT CONFIGURATION
// ============================================================================

/**
 * Gets small blind amount from environment or default
 */
export function getSmallBlindAmount(): number {
  return parseFloat(process.env.SMALL_BLIND_USDC || '5');
}

/**
 * Gets big blind amount from environment or default
 */
export function getBigBlindAmount(): number {
  return parseFloat(process.env.BIG_BLIND_USDC || '10');
}

/**
 * Gets minimum required chip balance from environment or default
 * Players must have at least this amount in their wallet to join
 */
export function getMinimumChipsRequired(): number {
  return parseFloat(process.env.MIN_CHIPS_REQUIRED_USDC || '100');
}

/**
 * Checks if a wallet balance meets the minimum requirement
 * @param balance - Wallet balance in USDC
 * @returns true if balance is sufficient, false otherwise
 */
export function hasMinimumBalance(balance: number): boolean {
  return balance >= getMinimumChipsRequired();
}

/**
 * Calculates blind payment amount based on position
 * @param isSmallBlind - Whether this is small blind position
 * @param isBigBlind - Whether this is big blind position
 * @returns Blind amount in USDC
 */
export function calculateBlindPayment(isSmallBlind: boolean, isBigBlind: boolean): number {
  if (isSmallBlind) {
    return getSmallBlindAmount();
  }
  if (isBigBlind) {
    return getBigBlindAmount();
  }
  return 0;
}

// ============================================================================
// PAYMENT VALIDATION
// ============================================================================

/**
 * Validates that a payment action is legal
 * @param actionType - Type of poker action
 * @param amount - Payment amount
 * @param currentBet - Current bet to match
 * @param playerChips - Player's available chips
 * @returns Object with { valid: boolean, error?: string }
 */
export function validatePaymentAction(
  actionType: PokerActionType,
  amount: number | undefined,
  currentBet: number,
  playerChips: number
): { valid: boolean; error?: string } {
  // Check and fold never require payment validation
  if (actionType === 'check' || actionType === 'fold') {
    return { valid: true };
  }

  // Validate amount exists for payment actions
  if ((actionType === 'bet' || actionType === 'raise') && !amount) {
    return { valid: false, error: `${actionType} requires an amount` };
  }

  // Validate sufficient chips
  const requiredAmount = amount || 0;
  if (requiredAmount > playerChips) {
    return {
      valid: false,
      error: `Insufficient chips: need ${requiredAmount}, have ${playerChips}`,
    };
  }

  // Validate bet is positive
  if (actionType === 'bet' && amount! <= 0) {
    return { valid: false, error: 'Bet amount must be positive' };
  }

  // Validate raise is higher than current bet
  if (actionType === 'raise' && amount! <= currentBet) {
    return {
      valid: false,
      error: `Raise amount (${amount}) must be higher than current bet (${currentBet})`,
    };
  }

  return { valid: true };
}

/**
 * Checks if an action requires x402 payment
 * @param actionType - Type of poker action
 * @returns true if payment required, false otherwise
 */
export function requiresPayment(actionType: PokerActionType): boolean {
  return actionType === 'call' || actionType === 'bet' || actionType === 'raise';
}

/**
 * Checks if an action is a blind payment
 * @param actionType - Type of action
 * @returns true if this is a blind payment
 */
export function isBlindPayment(actionType: string): boolean {
  return actionType === 'small_blind' || actionType === 'big_blind';
}

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

/**
 * Gets poker game configuration from environment
 */
export function getPokerGameConfig() {
  return {
    smallBlind: getSmallBlindAmount(),
    bigBlind: getBigBlindAmount(),
    minChipsRequired: getMinimumChipsRequired(),
    facilitatorUrl: facilitatorConfig.url,
    usdcAddress: BASE_SEPOLIA_USDC,
    paymentScheme: PAYMENT_SCHEME,
  };
}

// ============================================================================
// MINIMUM BET/RAISE AMOUNTS
// ============================================================================

/**
 * Calculates minimum bet amount (typically 1 big blind)
 * @param bigBlind - Big blind amount
 * @returns Minimum bet amount
 */
export function getMinimumBet(bigBlind: number): number {
  return bigBlind;
}

/**
 * Calculates minimum raise amount
 * Must be at least the size of the previous bet/raise
 * @param currentBet - Current bet amount
 * @param previousRaiseSize - Size of previous raise (if any)
 * @returns Minimum raise amount
 */
export function getMinimumRaise(currentBet: number, previousRaiseSize?: number): number {
  if (previousRaiseSize !== undefined && previousRaiseSize > 0) {
    return currentBet + previousRaiseSize;
  }
  // If no previous raise, minimum raise is double the current bet
  return currentBet * 2;
}

/**
 * Creates payment requirements object for x402 response
 * @param amount - Payment amount in USDC
 * @param actionType - Type of poker action
 * @param description - Human-readable description
 * @returns Payment requirements object matching x402 PaymentRequirements type
 */
export function createPaymentRequirements(
  amount: number,
  actionType: PokerActionType,
  description?: string
) {
  // Convert USDC amount to atomic units (USDC has 6 decimals)
  const atomicUnits = Math.floor(amount * 1_000_000).toString();

  // Get server wallet address for payTo field
  const serverWalletAddress = process.env.SERVER_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';

  // Construct resource URL (will be the current request URL in practice)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const resource = `${baseUrl}/api/poker`;

  return {
    scheme: 'exact' as const,
    network: 'base-sepolia' as const,
    maxAmountRequired: atomicUnits,
    asset: BASE_SEPOLIA_USDC,
    payTo: serverWalletAddress,
    resource,
    description: description || `${actionType} ${formatPaymentAmount(amount)}`,
    mimeType: 'application/json',
    maxTimeoutSeconds: 300, // 5 minutes
    extra: {
      name: 'USDC',
      version: '2'
    },
  };
}
