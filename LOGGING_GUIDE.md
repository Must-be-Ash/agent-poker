# Comprehensive Logging Guide

## Overview

The poker system implements structured, comprehensive logging to track all game activities, payments, and state changes. This logging is crucial for debugging, dispute resolution, and audit trails.

## Logger Module

All logging is handled through the `lib/poker/poker-logger.ts` module, which provides:
- Consistent formatting with timestamps
- GameId prefixes for easy filtering
- Categorized log levels (info, warn, error, debug)
- Emoji-based visual categorization
- Structured JSON data for complex information

## Log Format

```
[timestamp] 🎮 📘 [game-id] CATEGORY: Message
{
  "key": "value",
  "data": "structured"
}
```

**Example**:
```
[2025-01-25T10:30:15.234Z] 🎯 📘 [poker-game-123] ACTION: Agent A attempting bet 50 USDC
{
  "agentId": "agent-a",
  "action": "bet",
  "amount": 50
}
```

## Log Categories

### 🎮 Game Lifecycle
- Game creation
- Game ending
- Game state changes

### 🎴 Hand Lifecycle
- Hand started
- Betting round transitions
- Community card dealing

### 🎯 Actions
- Action attempts
- Action validation
- Action completion

### 💳 Payments
- Payment required (402 response)
- Payment verification
- Payment settlement
- Payment failures

### 💰 Pot Calculations
- Pot updates (contributions)
- Side pot creation
- Final pot distribution

### 🃏 Showdown
- Showdown initiated
- Hand evaluations
- Winner determination

### 💸 Payouts
- Payout started
- Individual payouts
- Payout completion

### 🔄 Turn Management
- Turn advances
- Current player tracking

### ⏱️ Timeouts
- Timeout warnings
- Auto-fold due to timeout

### ✅ Validation
- Action validation results
- Constraint checking

## Usage Examples

### Import the Logger

```typescript
import * as PokerLogger from '@/lib/poker/poker-logger';
```

### Log Action Attempt

```typescript
PokerLogger.logActionAttempt(gameId, agentId, agentName, 'bet', 50);
```

Output:
```
[2025-01-25T10:30:15.234Z] 🎯 📘 [poker-game-123] ACTION: Agent A attempting bet 50 USDC
```

### Log Payment Verification

```typescript
PokerLogger.logPaymentVerifying(gameId, agentId, agentName, 50);
PokerLogger.logPaymentVerified(gameId, agentId, agentName, 50);
```

Output:
```
[2025-01-25T10:30:16.456Z] 💳 📘 [poker-game-123] PAYMENT: Verifying payment: Agent A - 50 USDC
[2025-01-25T10:30:17.789Z] 💳 📘 [poker-game-123] PAYMENT: Payment verified: Agent A - 50 USDC
```

### Log Pot Update

```typescript
PokerLogger.logPotUpdate(gameId, handNumber, 50, 'Agent A', 150);
```

Output:
```
[2025-01-25T10:30:18.123Z] 💰 📘 [poker-game-123] POT: Pot updated: Agent A added 50 USDC
{
  "handNumber": 5,
  "contribution": 50,
  "contributor": "Agent A",
  "totalPot": 150
}
```

### Log Winner Determination

```typescript
PokerLogger.logWinnerDetermined(
  gameId,
  handNumber,
  [{ agentId: 'agent-a', agentName: 'Agent A' }],
  0
);
```

Output:
```
[2025-01-25T10:30:25.456Z] 🃏 📘 [poker-game-123] SHOWDOWN: Pot #0 winner: Agent A
{
  "handNumber": 5,
  "potNumber": 0,
  "winners": ["agent-a"],
  "isTie": false
}
```

## Complete Game Flow Logging

### 1. Game Creation
```typescript
PokerLogger.logGameCreated(
  gameId,
  [
    { agentId: 'agent-a', agentName: 'Agent A', chipStack: 1000 },
    { agentId: 'agent-b', agentName: 'Agent B', chipStack: 1000 }
  ],
  { smallBlind: 5, bigBlind: 10 }
);
```

### 2. Hand Started
```typescript
PokerLogger.logHandStarted(
  gameId,
  1,
  'Agent A',
  {
    small: 'Agent A',
    big: 'Agent B',
    smallAmount: 5,
    bigAmount: 10
  }
);
```

### 3. Betting Round
```typescript
PokerLogger.logBettingRoundStarted(gameId, 1, 'preflop');
```

### 4. Action Sequence
```typescript
// Agent attempts action
PokerLogger.logActionAttempt(gameId, agentId, agentName, 'raise', 30);

// Validation
PokerLogger.logActionValidated(gameId, agentId, agentName, 'raise', 30);

// Payment required
PokerLogger.logPaymentRequired(gameId, agentId, agentName, 30, 'raise');

// Payment flow
PokerLogger.logPaymentVerifying(gameId, agentId, agentName, 30);
PokerLogger.logPaymentVerified(gameId, agentId, agentName, 30);
PokerLogger.logPaymentSettling(gameId, agentId, agentName, 30);
PokerLogger.logPaymentSettled(gameId, agentId, agentName, 30, txHash);

// Action completed
PokerLogger.logActionCompleted(gameId, agentId, agentName, 'raise', {
  pot: 70,
  currentBet: 30,
  playerChips: 970
});

// Pot updated
PokerLogger.logPotUpdate(gameId, 1, 30, agentName, 70);
```

### 5. Showdown
```typescript
PokerLogger.logShowdownStarted(gameId, 1, 2);

PokerLogger.logHandEvaluation(gameId, 'agent-a', 'Agent A', {
  name: 'Pair',
  description: 'Pair of Kings'
});

PokerLogger.logWinnerDetermined(gameId, 1, [
  { agentId: 'agent-a', agentName: 'Agent A' }
], 0);
```

### 6. Payout
```typescript
PokerLogger.logPayoutStarted(gameId, 1, 70, 1);
PokerLogger.logPayoutExecuted(gameId, 'agent-a', 'Agent A', 70, txHash);
PokerLogger.logPayoutCompleted(gameId, 1, 70);
```

### 7. Game End
```typescript
PokerLogger.logGameEnded(
  gameId,
  { agentId: 'agent-a', agentName: 'Agent A', chipStack: 2000 },
  15,
  'knockout'
);
```

## Filtering Logs

### By Game ID
```bash
# View all logs for a specific game
grep "poker-game-123" server.log

# Or using jq if logs are JSON
cat server.log | jq 'select(.gameId == "poker-game-123")'
```

### By Category
```bash
# View only payment logs
grep "PAYMENT:" server.log

# View only action logs
grep "ACTION:" server.log
```

### By Agent
```bash
# View logs for a specific agent
grep "agent-a" server.log
```

### By Log Level
```bash
# View only errors
grep "❌" server.log

# View only warnings
grep "⚠️" server.log
```

## Debugging Scenarios

### Scenario 1: Payment Failure

Look for sequence:
1. `PAYMENT: Payment required`
2. `PAYMENT: Verifying payment`
3. `PAYMENT: Payment failed` ← Issue here

Check the error message and structured data for details.

### Scenario 2: Action Rejected

Look for:
1. `ACTION: attempting [action]`
2. `VALIDATION: [action] - FAILED` ← Issue here

Check validation error for reason (not your turn, insufficient chips, etc.)

### Scenario 3: Pot Calculation Dispute

Track pot changes:
```bash
grep "POT: Pot updated" server.log | grep "poker-game-123"
```

Verify each contribution matches expected amount.

### Scenario 4: Winner Dispute

Look for showdown sequence:
1. `SHOWDOWN: Showdown started`
2. `SHOWDOWN: [Agent]: [Hand description]` (for each player)
3. `SHOWDOWN: Pot #X winner: [Agent]`

Verify hand evaluation is correct.

### Scenario 5: Timeout Investigation

```bash
grep "TIMEOUT:" server.log | grep "poker-game-123"
```

Shows which player timed out and when.

## Production Logging Best Practices

### 1. Log Aggregation

Use a log aggregation service:
- **Datadog**: Structured logging with JSON
- **Loggly**: Centralized log management
- **Elasticsearch**: Search and analytics

### 2. Log Rotation

Configure log rotation to prevent disk space issues:
```javascript
// pm2 ecosystem.config.js
module.exports = {
  apps: [{
    name: 'poker-server',
    script: 'npm',
    args: 'start',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### 3. Structured Logging

All poker logger functions output structured data when provided:
```typescript
PokerLogger.logActionCompleted(gameId, agentId, agentName, 'bet', {
  pot: 100,
  currentBet: 50,
  playerChips: 950
});
```

This makes it easy to parse and query logs programmatically.

### 4. Alert on Errors

Set up alerts for critical errors:
- Payment verification failures
- Settlement failures
- Game state corruption

### 5. Audit Trails

Poker logs provide complete audit trails:
- Every action logged
- Every payment verified and logged
- Every pot calculation logged
- Every winner determination logged

This is essential for:
- Dispute resolution
- Regulatory compliance
- Debugging production issues

## Log Retention

Recommended retention periods:
- **Active games**: Keep all logs
- **Completed games**: Retain for 90 days
- **Disputed games**: Retain indefinitely until resolved

## Summary

✅ All game actions logged with timestamps and gameId
✅ Payment verification and settlement fully logged
✅ Pot calculations logged for audit trails
✅ Winner determinations logged with hand details
✅ Structured data for programmatic analysis
✅ Emoji categorization for visual scanning
✅ Complete game flow tracking from start to finish

The comprehensive logging system ensures that every significant event in the poker game is recorded, making debugging, dispute resolution, and auditing straightforward and reliable.
