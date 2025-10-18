# 🎥 Real-Time Streaming Auction System

## Overview

The auction system now features **real-time Server-Sent Events (SSE)** streaming, providing a live, responsive experience where users see agent activity as it happens.

## Architecture

### 1. **Event Broadcasting (`lib/events.ts`)**
Central event emitter that manages SSE connections and broadcasts events to all connected clients.

```typescript
broadcastEvent(basename, {
  type: 'thinking' | 'bid_placed' | 'reflection' | 'refund',
  agentId: string,
  // ... event-specific data
});
```

### 2. **SSE Endpoint (`/api/stream/[basename]`)**
Establishes persistent connections with clients to push real-time updates.

### 3. **Status API (`/api/status`)**
Provides initial auction state when clients first connect (historical data).

## Event Flow

```
Agent Thinks
    ↓
Server broadcasts 'thinking' event
    ↓
Frontend shows thinking bubble with shimmer
    ↓
Agent pays & settlement completes
    ↓
Server broadcasts 'bid_placed' event
    ↓
Frontend shows bid card with loading state
    ↓
Agent completes reflection
    ↓
Server broadcasts 'reflection' event
    ↓
Frontend updates bid card with reflection
    ↓
Previous bidder gets refunded
    ↓
Server broadcasts 'refund' event
    ↓
Frontend shows system notification
```

## Event Types

### `thinking`
Broadcast when agent proposes a bid (before payment).

```json
{
  "type": "thinking",
  "agentId": "AgentA",
  "thinking": "Strategic opening bid...",
  "strategy": "intelligent",
  "proposedAmount": 3.50,
  "timestamp": "2025-10-18T..."
}
```

### `bid_placed`
Broadcast when payment settles on-chain.

```json
{
  "type": "bid_placed",
  "agentId": "AgentA",
  "amount": 3.50,
  "transactionHash": "0x...",
  "timestamp": "2025-10-18T..."
}
```

### `reflection`
Broadcast when agent's post-bid analysis arrives.

```json
{
  "type": "reflection",
  "agentId": "AgentA",
  "reflection": "My opening bid of $3.50...",
  "timestamp": "2025-10-18T..."
}
```

### `refund`
Broadcast when a previous bidder is refunded.

```json
{
  "type": "refund",
  "agentId": "AgentA",
  "amount": 3.00,
  "transactionHash": "0x...",
  "timestamp": "2025-10-18T..."
}
```

## Frontend Experience

### Progressive Loading States

1. **Thinking Bubble** - Appears instantly with shimmer effect
2. **Bid Card** - Shows payment amount and transaction link
3. **Shimmer Loading** - Animated placeholder while waiting for reflection
4. **Reflection Card** - Appears below bid with strategic analysis
5. **Refund Notification** - System message in center

### UI Components

```tsx
// Thinking bubble (left/right aligned by agent)
<div className="thinking-bubble">
  💭 Thinking...
  "Strategic opening bid..."
  Strategy: intelligent
</div>

// Bid card with loading state
<div className="bid-card">
  Bid placed: $3.50 USDC
  [View on Basescan →]
  
  {isLoading ? (
    <shimmer-animation />
  ) : (
    <reflection-card />
  )}
</div>

// Refund notification (center)
<div className="refund-notification">
  💸 AgentA was outbid and refunded $3.00 [tx]
</div>
```

## Benefits

✅ **Real-time** - No polling, instant updates via SSE push  
✅ **Progressive** - See thinking → bid → reflection in sequence  
✅ **Loading states** - Shimmer animations show agents are processing  
✅ **Better UX** - Feels alive and responsive like a chat app  
✅ **Scalable** - SSE efficiently handles multiple concurrent viewers  
✅ **Reliable** - Automatic reconnection on connection loss  

## Testing

1. **Start the server:**
   ```bash
   cd /Users/ashnouruzi/x402-bids/agent-bid
   npm run dev
   ```

2. **Open auction page:**
   ```
   http://localhost:3000/auction/yourname.base.eth
   ```

3. **Run agents in separate terminals:**
   ```bash
   # Terminal 1
   npm run agent:ai:a
   
   # Terminal 2
   npm run agent:ai:b
   ```

4. **Watch the magic:**
   - See thinking bubbles appear instantly
   - Watch bid cards stream in
   - See shimmer loading while agents reflect
   - Watch reflections populate below bids
   - See refund notifications in real-time

## Debugging

Check SSE connection in browser DevTools:
- Network tab → Filter by "stream"
- Should see persistent connection with `text/event-stream`
- Events appear as they're broadcast

Check server logs:
```
📡 SSE connection registered for yourname.base.eth (1 total)
📡 Broadcasting thinking to 1 client(s)
📡 Broadcasting bid_placed to 1 client(s)
📡 Broadcasting reflection to 1 client(s)
```

## Technical Details

- **Transport:** Server-Sent Events (SSE)
- **Format:** JSON over `text/event-stream`
- **Reconnection:** Automatic via browser EventSource API
- **Concurrency:** Multiple clients per basename supported
- **Memory:** Connections cleaned up on disconnect
- **Latency:** ~50-100ms from server to client

---

**The auction now feels alive! 🎊**

