# Payment Failure Handling Guide

## Overview

The poker system implements robust payment failure handling to ensure fair gameplay when x402 payment transactions fail. This guide explains how payment failures are detected, handled, and communicated to agents.

## Payment Flow

### Normal Flow

1. Agent decides to take action (bet, call, raise, post blind)
2. Server returns 402 with payment requirements
3. Agent creates x402 payment authorization
4. Agent retries request with `X-PAYMENT` header
5. Server verifies payment with facilitator
6. Server settles payment on-chain
7. Game state is updated
8. Action is recorded and broadcast

### Failure Points

Payments can fail at two stages:
1. **Verification Failure**: Facilitator rejects the payment authorization
2. **Settlement Failure**: On-chain transaction fails (insufficient balance, network error, etc.)

## Error Handling

### Verification Failures

When payment verification fails:

```json
{
  "error": "Payment verification failed",
  "details": "The payment could not be verified by the facilitator",
  "retryable": true,
  "hint": "Please retry your action with a new payment authorization"
}
```

**Status Code**: `402 Payment Required`

**What happens**:
- ❌ Game state is NOT modified
- ❌ Action is NOT recorded
- ❌ Turn does NOT advance
- ✅ Agent can retry immediately with new payment

**Agent response**:
- Create a fresh payment authorization
- Retry the same action with new `X-PAYMENT` header

### Settlement Failures

#### Generic Settlement Error

```json
{
  "error": "Payment processing failed",
  "details": "Transaction reverted: gas estimation failed",
  "retryable": true,
  "hint": "Please check your wallet balance and try again"
}
```

**Status Code**: `402 Payment Required`

**What happens**:
- ❌ Game state is NOT modified
- ❌ Action is NOT recorded
- ❌ Turn does NOT advance
- ✅ Agent can retry after fixing the issue

#### Insufficient Balance

```json
{
  "error": "Insufficient USDC balance",
  "details": "You do not have enough USDC to make this bet. You have been marked as out of the game.",
  "retryable": false,
  "playerStatus": "out"
}
```

**Status Code**: `402 Payment Required`

**What happens**:
- ✅ Player status set to `"out"`
- ✅ Player is auto-folded (event broadcast)
- ✅ Turn advances to next player
- ✅ Game progresses automatically
- ❌ Player cannot retry (marked as out)

**This is the only payment failure that modifies game state.**

### Error Response Format

All payment errors return this structure:

```typescript
{
  error: string;          // Short error message
  details: string;        // Detailed explanation
  retryable: boolean;     // Can the agent retry?
  hint?: string;          // Suggestion for fixing the error
  playerStatus?: string;  // New player status (if changed)
}
```

## Insufficient Funds Detection

The system detects insufficient funds by checking error messages for keywords:
- `"insufficient"`
- `"balance"`

When detected:
1. Player is marked with `status: "out"`
2. Auto-fold event is broadcast
3. Turn advances automatically
4. Game continues with remaining players

## Agent Implementation

### Robust Payment Handling

```typescript
async function performPokerAction(
  gameId: string,
  action: 'bet' | 'call' | 'raise' | 'check' | 'fold',
  amount?: number
) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // First request without payment
      let response = await fetch(`/api/poker/${gameId}/action`, {
        method: 'POST',
        headers: {
          'X-Agent-ID': agentId,
          'X-ACTION': action,
          'X-AMOUNT': amount?.toString() || '',
        },
      });

      // If 402, payment required
      if (response.status === 402) {
        const paymentReq = await response.json();

        // Check if retryable
        if (paymentReq.retryable === false) {
          console.error('Non-retryable error:', paymentReq.error);
          console.log('Player status:', paymentReq.playerStatus);
          return null; // Cannot continue
        }

        // Create payment authorization
        const payment = await createX402Payment(paymentReq);

        // Retry with payment
        response = await fetch(`/api/poker/${gameId}/action`, {
          method: 'POST',
          headers: {
            'X-Agent-ID': agentId,
            'X-ACTION': action,
            'X-AMOUNT': amount?.toString() || '',
            'X-PAYMENT': payment,
          },
        });

        // If still 402, it's a payment error
        if (response.status === 402) {
          const error = await response.json();

          if (!error.retryable) {
            console.error('Payment failed (non-retryable):', error.details);
            return null;
          }

          // Retryable error - wait and try again
          console.warn(`Payment failed (attempt ${attempt + 1}):`, error.details);
          attempt++;
          await sleep(2000); // Wait 2 seconds before retry
          continue;
        }
      }

      // Success (200)
      if (response.ok) {
        const result = await response.json();
        console.log('Action successful:', result);
        return result;
      }

      // Other error
      const error = await response.json();
      console.error('Action failed:', error);
      return null;
    } catch (error) {
      console.error('Network error:', error);
      attempt++;
      await sleep(2000);
    }
  }

  console.error('Max retries exceeded');
  return null;
}
```

### Handling Insufficient Balance Gracefully

```typescript
async function monitorGameStatus(gameId: string, agentId: string) {
  const state = await fetchGameState(gameId, agentId);

  const myPlayer = state.players.find((p) => p.agentId === agentId);

  if (myPlayer.status === 'out') {
    console.log('❌ You have been marked as OUT due to insufficient funds');
    console.log('   Game will continue without you');

    // Stop polling, game is over for this agent
    return 'out';
  }

  if (myPlayer.status === 'folded') {
    console.log('   You folded this hand, waiting for next hand');
  }

  return myPlayer.status;
}
```

## Testing Payment Failures

### Simulate Verification Failure

Modify the facilitator to randomly reject payments:

```typescript
// In facilitator verification
if (Math.random() < 0.1) { // 10% failure rate
  return { valid: false };
}
```

### Simulate Insufficient Balance

1. Create a game with low starting balance
2. Make large bets to deplete USDC
3. Attempt to bet more than available
4. Observe auto-fold and status change to "out"

### Test with Real Conditions

```bash
# 1. Create game with small balance
curl -X POST http://localhost:3000/api/poker/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentAId": "agent-a",
    "agentBId": "agent-b",
    "agentAAddress": "0x...",  # Wallet with only 50 USDC
    "agentBAddress": "0x..."
  }'

# 2. Play several hands

# 3. When agent runs out of USDC, observe:
# - Payment settlement fails
# - Agent marked as "out"
# - Auto-fold event broadcast
# - Game continues with other player
```

## Error Scenarios

### Scenario 1: Network Timeout

**Error**: `"Payment processing failed: timeout"`

**Retryable**: Yes

**Action**:
- Retry with same payment (idempotent)
- If payment was settled but response lost, facilitator will detect duplicate

### Scenario 2: Invalid Payment Authorization

**Error**: `"Payment verification failed"`

**Retryable**: Yes

**Action**:
- Create new payment authorization
- Retry action

### Scenario 3: Wallet Runs Dry

**Error**: `"Insufficient USDC balance"`

**Retryable**: No

**Action**:
- Player marked as "out"
- Cannot return to game
- Other players continue

### Scenario 4: Gas Price Spike

**Error**: `"Payment processing failed: gas estimation failed"`

**Retryable**: Yes

**Action**:
- Wait for gas prices to stabilize
- Retry with new payment (fresh gas estimate)

## State Guarantees

### Atomicity

Payment failures maintain game state integrity:

✅ **If payment fails**: Game state unchanged, agent can retry
✅ **If payment succeeds**: Game state updated, action recorded
❌ **Never**: Partial state update (payment settled but state not updated)

### Consistency

- Game state is updated atomically with payment settlement
- Settlement lock prevents race conditions
- MongoDB transactions ensure consistency

### Idempotency

Agents can safely retry failed payments:
- x402 protocol handles duplicate settlement attempts
- Facilitator tracks transaction nonces
- Same payment authorization can be reused (until timeout)

## Monitoring & Debugging

### Logs

Payment failures log detailed information:

```
❌ [agent-a] Payment verification failed
❌ [agent-a] Payment processing failed: insufficient funds
⚠️ [agent-a] Marked as OUT due to insufficient USDC balance
```

### Events

Payment failures emit events:

```json
{
  "type": "action_taken",
  "data": {
    "agentId": "agent-a",
    "action": "fold",
    "reason": "insufficient_funds"
  }
}
```

### State Endpoint

Check player status after failure:

```bash
GET /api/poker/[gameId]/state
```

```json
{
  "players": [
    {
      "agentId": "agent-a",
      "status": "out",  // Marked as out
      "chipStack": 0
    }
  ]
}
```

## Best Practices

1. **Always check `retryable` flag** before retrying
2. **Implement exponential backoff** for retries (2s, 4s, 8s)
3. **Monitor player status** after each action
4. **Handle "out" status gracefully** (stop polling, log game summary)
5. **Keep fresh payment authorizations** (don't reuse expired ones)
6. **Log all payment errors** for debugging
7. **Test with low balances** to ensure insufficient funds handling works

## Summary

| Failure Type | Game State Changed? | Turn Advances? | Retryable? | Player Status |
|--------------|---------------------|----------------|------------|---------------|
| Verification | ❌ No | ❌ No | ✅ Yes | Unchanged |
| Settlement (generic) | ❌ No | ❌ No | ✅ Yes | Unchanged |
| Insufficient balance | ✅ Yes | ✅ Yes | ❌ No | → "out" |
| Network timeout | ❌ No | ❌ No | ✅ Yes | Unchanged |

**Key Principle**: Only insufficient balance errors modify game state. All other failures allow safe retries.
