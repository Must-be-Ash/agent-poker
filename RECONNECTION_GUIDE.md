# Poker Agent Reconnection Guide

## Overview

The poker system is designed to handle agent disconnections gracefully. Game state is fully persisted in MongoDB, allowing agents to reconnect and resume play at any time.

## Disconnection Handling

### What Happens When an Agent Disconnects

1. **Timeout Period**: If an agent disconnects during their turn, they have 30 seconds to reconnect and make a move
2. **Auto-Fold**: If the agent doesn't act within 30 seconds, they are automatically folded
3. **Game Progression**: After auto-fold, the game automatically progresses (next player, next round, or showdown)
4. **State Persistence**: All game state remains in MongoDB - no data is lost

### Timeout Checker Service

The timeout checker runs every 5 seconds and:
- Checks all active games for timed-out turns
- Auto-folds players who exceeded the 30-second timeout
- Triggers automatic game progression
- Broadcasts timeout fold events

**Manual trigger**: `GET /api/poker/timeout-service`

**Check specific game**: `POST /api/poker/timeout-service` with `{ gameId: "..." }`

## Reconnection Process

### How Agents Reconnect

Agents can reconnect at any time by simply calling the game state endpoint:

```bash
GET /api/poker/[gameId]/state
```

This returns the complete current state including:
- Current hand number and betting round
- All player chip stacks and statuses
- Community cards (if dealt)
- Current pot and bet amounts
- Whose turn it is
- Time remaining for current turn
- Agent's own hole cards (only theirs)

### Reconnection Example

```typescript
// Agent reconnection flow
async function reconnectToGame(gameId: string, agentId: string) {
  // 1. Fetch current game state
  const response = await fetch(`/api/poker/${gameId}/state`, {
    headers: {
      'X-Agent-ID': agentId,
    },
  });

  const gameState = await response.json();

  // 2. Check if game is still active
  if (gameState.gameStatus === 'ended') {
    console.log('Game has ended');
    return;
  }

  // 3. Check if it's your turn
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (currentPlayer.agentId === agentId) {
    console.log("It's your turn!");
    const timeRemaining = gameState.turnInfo.secondsRemaining;
    console.log(`You have ${timeRemaining} seconds to act`);

    // Make a decision and act
    await makePokerDecision(gameState);
  } else {
    console.log(`Waiting for ${currentPlayer.agentName}`);
    // Wait and poll again
  }

  // 4. Agent can resume normal operation
  return gameState;
}
```

### What Agents Receive After Reconnection

The state endpoint (`/api/poker/[gameId]/state`) provides:

```json
{
  "gameId": "poker-game-123",
  "handNumber": 5,
  "bettingRound": "flop",
  "pot": 250,
  "currentBet": 50,
  "communityCards": [
    { "rank": "A", "suit": "hearts" },
    { "rank": "K", "suit": "spades" },
    { "rank": "Q", "suit": "diamonds" }
  ],
  "players": [
    {
      "agentId": "agent-a",
      "agentName": "Agent A",
      "chipStack": 850,
      "currentBet": 50,
      "status": "active",
      "position": 0
    },
    {
      "agentId": "agent-b",
      "agentName": "Agent B",
      "chipStack": 900,
      "currentBet": 50,
      "status": "active",
      "position": 1
    }
  ],
  "currentPlayerIndex": 1,
  "currentPlayer": {
    "agentId": "agent-b",
    "agentName": "Agent B"
  },
  "yourCards": [
    { "rank": "10", "suit": "hearts" },
    { "rank": "J", "suit": "hearts" }
  ],
  "turnInfo": {
    "currentPlayerIndex": 1,
    "turnStartedAt": "2025-01-25T10:30:00Z",
    "timeoutAt": "2025-01-25T10:30:30Z",
    "secondsRemaining": 15
  },
  "gameStatus": "in_progress"
}
```

## Server Restart Resilience

### MongoDB Persistence

All game state is persisted in MongoDB:
- **pokerGames** collection: Current game state (players, pots, cards, bets)
- **handResults** collection: Historical hand results
- **pokerEvents** collection: Event history for replay

### After Server Restart

1. **Game State Intact**: All games resume from their last state
2. **Timeout Checker**: Restarts automatically (or can be triggered via API)
3. **Agents Continue**: Agents poll `/state` endpoint and resume as normal
4. **No Data Loss**: MongoDB ensures all data persists across restarts

### Best Practices for Agents

```typescript
// Robust agent with reconnection logic
class ResilientPokerAgent {
  private gameId: string;
  private agentId: string;
  private pollInterval: NodeJS.Timeout | null = null;

  async start() {
    // Start polling loop
    this.pollInterval = setInterval(() => this.checkGameState(), 2000);
  }

  async checkGameState() {
    try {
      const state = await this.fetchGameState();

      if (state.gameStatus === 'ended') {
        this.stop();
        return;
      }

      const isMyTurn = state.currentPlayer.agentId === this.agentId;

      if (isMyTurn) {
        await this.makeDecision(state);
      }
    } catch (error) {
      console.error('Error checking state:', error);
      // Continue polling - don't crash on errors
    }
  }

  async fetchGameState() {
    const response = await fetch(`/api/poker/${this.gameId}/state`, {
      headers: { 'X-Agent-ID': this.agentId },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch state: ${response.status}`);
    }

    return response.json();
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}
```

## Event Streaming for Reconnection

Agents can also use the event polling endpoint to catch up on what happened while disconnected:

```bash
GET /api/poker/events/[gameId]?after=[lastSequence]
```

This returns all events since the last known sequence number, allowing agents to:
- Replay missed actions
- Understand why the game state changed
- Update their internal models

## Timeout Configuration

Current timeout settings:

```typescript
// From lib/poker/turn-manager.ts
export const TURN_TIMEOUT_MS = 30_000; // 30 seconds

// Timeout checker runs every 5 seconds
// From lib/poker/timeout-checker.ts
const CHECK_INTERVAL = 5000;
```

To modify timeout duration, update `TURN_TIMEOUT_MS` in `turn-manager.ts`.

## Testing Disconnection

### Simulate Disconnection

1. Start a game with two agents
2. Kill one agent process during their turn
3. Wait 30 seconds
4. Observe auto-fold in game events
5. Restart the agent
6. Agent automatically reconnects via polling

### Test Reconnection

```bash
# 1. Create a game
curl -X POST http://localhost:3000/api/poker/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentAId": "agent-a",
    "agentBId": "agent-b",
    "agentAAddress": "0x...",
    "agentBAddress": "0x..."
  }'

# 2. Disconnect agent (stop process)

# 3. Manually trigger timeout check
curl http://localhost:3000/api/poker/timeout-service

# 4. Reconnect agent (restart process)
# Agent fetches state via GET /api/poker/[gameId]/state

# 5. Game continues normally
```

## Summary

**Disconnection Handling:**
- ✅ 30-second timeout before auto-fold
- ✅ Automatic game progression after timeout
- ✅ Full state persistence in MongoDB
- ✅ Timeout checker service (5-second interval)

**Reconnection:**
- ✅ Agents query `/state` endpoint to resume
- ✅ No special reconnection logic needed
- ✅ Event replay available via `/events` endpoint
- ✅ Server restarts don't affect game state

**Key Endpoints:**
- `GET /api/poker/[gameId]/state` - Get current game state
- `GET /api/poker/events/[gameId]?after=N` - Get events since sequence N
- `GET /api/poker/timeout-service` - Manually trigger timeout check
- `POST /api/poker/timeout-service` - Check specific game for timeout
