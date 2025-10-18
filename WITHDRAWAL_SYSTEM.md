# 🏳️ Dynamic Auction Withdrawal System

## Overview

The auction now supports **dynamic ending** where agents can withdraw when they decide to stop bidding, rather than waiting for a timer. This creates a more realistic and engaging auction experience.

## How It Works

### 1. **Agent Decision to Withdraw**

When an agent's LLM decides not to bid (detects keywords like "not to place", "accept this loss", "withdrawing from"), the agent automatically:

1. Sends a withdrawal request to `/api/refund-request/[basename]`
2. Includes their reasoning for withdrawal
3. Requests refund of their last bid amount

### 2. **Server Validation**

The server validates the withdrawal request:

```typescript
✅ Checks if agent has bid history
✅ Verifies wallet address matches records
✅ Ensures agent is NOT currently winning
✅ Validates refund amount against database
```

### 3. **Refund Processing**

If valid:
- Server issues USDC refund to agent's wallet
- Marks agent as "withdrawn" in database
- Broadcasts withdrawal event to frontend
- Records transaction hash

### 4. **Auction Ending Logic**

After withdrawal, server checks:

```typescript
Total bidders - Withdrawn agents = Active agents

If active agents <= 1:
  → End auction
  → Broadcast auction_ended event
  → Declare winner
```

## API Endpoints

### **POST `/api/refund-request/[basename]`**

Request withdrawal and refund.

**Request:**
```json
{
  "agentId": "AgentA",
  "walletAddress": "0x...",
  "reasoning": "The risk-to-reward ratio is unfavorable..."
}
```

**Response:**
```json
{
  "success": true,
  "refunded": 9.43,
  "transactionHash": "0x...",
  "auctionEnded": true,
  "message": "Refund issued. Auction has ended - opponent won!"
}
```

**Error Cases:**
- `404` - No auction or no bids found
- `400` - Currently winning (can't withdraw while winning)
- `403` - Wallet address mismatch
- `500` - Refund processing failed

## Database Schema Updates

```typescript
interface BidRecord {
  // ... existing fields
  withdrawnAgents?: string[];        // List of withdrawn agent IDs
  auctionEnded?: boolean;            // True if ended early
  auctionEndReason?: 'withdrawal' | 'timeout'; // Why it ended
}
```

## Frontend Events

### **`withdrawal` Event**

Broadcast when agent withdraws:

```json
{
  "type": "withdrawal",
  "agentId": "AgentA",
  "amount": 9.43,
  "reasoning": "The risk-to-reward ratio is unfavorable...",
  "transactionHash": "0x...",
  "timestamp": "2025-10-18T..."
}
```

**UI Display:**
```
🏳️ AgentA withdrew from the auction
   "The risk-to-reward ratio is unfavorable. The current bid of $9.43..."
   Refunded: $9.43 [tx →]
```

### **`auction_ended` Event**

Broadcast when auction ends:

```json
{
  "type": "auction_ended",
  "winner": {
    "agentId": "AgentB",
    "walletAddress": "0x..."
  },
  "finalBid": 9.43,
  "reason": "All other bidders withdrew",
  "timestamp": "2025-10-18T..."
}
```

**UI Display:**
```
🏆 Auction Ended!
   All other bidders withdrew
   
   Winner: AgentB
   Final Bid: $9.43
```

## Agent Behavior

### **Withdrawal Detection**

Agent's LLM response is analyzed for withdrawal keywords:

```typescript
Keywords:
- "not to place"
- "decided not to bid"
- "not placing a bid"
- "withdrawing from"
- "accept this loss"
```

### **Agent Flow**

```
1. Agent analyzes auction state
   ↓
2. LLM decides: "I've decided NOT to place another bid..."
   ↓
3. Agent detects withdrawal keywords
   ↓
4. Agent sends withdrawal request
   ↓
5. Server validates & issues refund
   ↓
6. Agent stops monitoring (if auction ended)
```

### **Console Output**

```bash
🧠 [AgentA] Starting AI reasoning...
✅ [AgentA] AI decision complete
🏳️ [AgentA] Decided to withdraw from auction
✅ [AgentA] Withdrawal processed: Refund issued. Auction has ended - opponent won!
🏁 [AgentA] Auction has ended. Opponent won!
🛑 [AgentA] Stopping agent...
```

## Benefits

✅ **Dynamic endings** - No artificial time limits  
✅ **Strategic decisions** - Agents can concede intelligently  
✅ **Automatic refunds** - No manual intervention needed  
✅ **Fraud prevention** - Server validates all requests  
✅ **Clear winner** - Auction ends when only one bidder remains  
✅ **Transparent reasoning** - Withdrawal reasons displayed in UI  

## Example Scenario

```
1. AgentA bids $3.50
2. AgentB bids $5.00
3. AgentA refunded $3.50
4. AgentA bids $7.25
5. AgentB bids $9.43
6. AgentA refunded $7.25
7. AgentA analyzes: "Only $0.57 profit margin, too risky"
8. AgentA withdraws, requests refund
9. Server refunds AgentA
10. Auction ends - AgentB wins! 🏆
```

## Security Considerations

- ✅ Only non-winning agents can withdraw
- ✅ Wallet addresses verified against bid history
- ✅ Refund amounts validated against database
- ✅ Transaction hashes recorded for audit trail
- ✅ Withdrawal events broadcast for transparency

---

**The auction now ends naturally when agents make strategic decisions to withdraw!** 🎊

