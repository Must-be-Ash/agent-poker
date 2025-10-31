# Agent Poker - Complete Game Flow

## 1. The Complete Poker Hand Flow (Step-by-Step)

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 0: Pre-Game Autonomous Learning (Optional, First Time)    │
└──────────────────────────────────────────────────────────────────┘
```

🔍 **Agent discovers web search capability and may proactively learn poker strategies:**

1. **Agent reads system prompt** and discovers `search_poker_strategy` tool
2. **Agent may choose to research** before any hands:
   - Query: "poker strategy for beginners", "GTO poker fundamentals"
   - Makes x402 payment call to Firecrawl API
   - Uses wrapFetchWithPayment (x402-fetch)
   - Endpoint: `https://api.firecrawl.dev/v2/x402/search`
   - Cost: ~$0.01 USDC per search (paid via x402 on **Base Mainnet**)
   - Emits: `poker_web_search_initiated` → `poker_web_search_completed`

3. **Firecrawl responds with poker strategy articles:**
   ```json
   {
     "success": true,
     "insights": [
       {
         "source": "Upswing Poker",
         "strategy": "How to play pocket aces in position...",
         "url": "https://upswingpoker.com/..."
       },
       { /* 4 more results */ }
     ]
   }
   ```

4. **Agent builds knowledge base:**
   - Stores insights from searches
   - References learnings during gameplay
   - Adapts strategy based on expert advice

5. **Learning is continuous:**
   - Agent may search mid-hand for specific situations
   - Example: "how to play flush draws in position"
   - Combines research with pot odds math
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: Hand Starts - Dealer Button & Blinds                    │
└──────────────────────────────────────────────────────────────────┘
```

1. **Server initiates new hand:**
   ```
   POST /api/poker/poker-game-1/hand/new
   ```

2. **Dealer button rotates:**
   - Hand #1: Agent A is dealer (position 0)
   - Hand #2: Agent B is dealer (position 1)
   - Heads-up rules: Dealer posts **small blind**, other player posts **big blind**

3. **Server determines blind requirements:**
   ```json
   {
     "handNumber": 5,
     "dealerPosition": 0,
     "blinds": {
       "small": { "agentId": "agent-a", "amount": 5 },
       "big": { "agentId": "agent-b", "amount": 10 }
     }
   }
   ```

4. **Server broadcasts `hand_started` event:**
   - All agents receive notification
   - Includes dealer position, blind amounts
   - Frontend displays new hand

5. **Server updates game state:**
   - Sets `blindRequired` field for each player
   - Agent A: `blindRequired: 'small'`
   - Agent B: `blindRequired: 'big'`
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: Agent Polls & Sees Blind Requirement                    │
└──────────────────────────────────────────────────────────────────┘
```

Agent A polling loop (every 2 seconds):
```javascript
GET /api/poker/poker-game-1/state?agentId=agent-a
```

Response:
```json
{
  "gameId": "poker-game-1",
  "handNumber": 5,
  "bettingRound": "preflop",
  "pot": 0,
  "communityCards": [],
  "isYourTurn": false,
  "blindRequired": "small",  // ← CRITICAL: Must post blind!
  "yourCards": null,
  "chipStack": 500,
  "legalActions": [],
  "currentBet": 0
}
```

Agent's LLM sees:
- ✅ `blindRequired: "small"` - MUST post blind before playing
- ❌ `isYourTurn: false` - Can't act yet, blind first!
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: Agent Posts Small Blind via x402 Payment                │
└──────────────────────────────────────────────────────────────────┘
```

**Agent A calls `post_small_blind` tool:**

1. **Initial request (NO PAYMENT):**
   ```
   POST /api/poker/poker-game-1/blind
   Headers:
     X-Agent-ID: "agent-a"
     (NO X-PAYMENT header yet!)

   Body: {
     "blindType": "small",
     "agentId": "agent-a"
   }
   ```

2. **Server responds 402 Payment Required:**
   ```json
   {
     "x402Version": 1,
     "accepts": [{
       "scheme": "exact",
       "network": "base-sepolia",
       "token": "0x036CbD...",  // USDC on Base Sepolia
       "price": { "min": 5, "max": 5 }  // Exactly $5 USDC
     }]
   }
   ```

3. **x402-axios AUTOMATICALLY:**
   - Intercepts 402 response
   - Signs EIP-3009 authorization for $5 USDC
   - Retries request with `X-PAYMENT` header

4. **Server verifies & settles payment:**
   ```
   verify(paymentPayload) → ✅ Valid signature
   settle(paymentPayload) → 💸 Tx: 0xabc123...
   ```

5. **USDC transfers:** Agent A → Server Wallet ($5)

6. **Server updates game state:**
   - Pot: $0 → $5
   - Agent A chipStack: $500 → $495
   - Agent A `blindRequired`: 'small' → null ✅
   - Broadcasts `blind_posted` event

7. **Agent receives success:**
   ```json
   {
     "success": true,
     "message": "Small blind posted: 5 USDC",
     "pot": 5,
     "chipStack": 495
   }
   ```
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: Agent B Posts Big Blind (Same x402 Flow)                │
└──────────────────────────────────────────────────────────────────┘
```

**Identical process:**
- Agent B sees `blindRequired: "big"`
- Calls `post_big_blind` tool
- Server responds 402 for $10 USDC
- x402-axios handles payment automatically
- $10 transfers Agent B → Server
- Pot: $5 → $15
- Agent B chipStack: $500 → $490

**Both blinds posted!** Game can now proceed.
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 5: Cards Dealt - Agents Receive Hole Cards                 │
└──────────────────────────────────────────────────────────────────┘
```

Server deals cards:
- Agent A: [A♠, K♦]
- Agent B: [Q♥, J♣]

Broadcasts `cards_dealt` event (private cards per agent)

Agents poll and see:
```json
{
  "yourCards": ["A♠", "K♦"],
  "pot": 15,
  "currentBet": 10,  // Big blind amount
  "isYourTurn": true,  // Agent A acts first (small blind)
  "legalActions": ["fold", "call", "raise"]
}
```
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 6: Agent Decides on Action (Research-Driven)               │
└──────────────────────────────────────────────────────────────────┘
```

**Agent A's decision process:**

1. **Calls `get_game_state` tool:**
   - Sees: Pocket aces (A♠K♦)
   - Pot: $15
   - Current bet: $10 (must call or raise)
   - Position: Small blind (out of position)

2. **Agent identifies major decision** (system prompt Step 3):
   - "I have pocket aces - this is a premium hand!"
   - "This is significant - should I research optimal play?"

3. **Agent MAY choose to research:**
   ```javascript
   search_poker_strategy({
     query: "how to play ace king offsuit in small blind when opponent has big blind",
     situation: "I have A♠K♦, pot is $15, I'm in small blind, opponent posted big blind $10"
   })
   ```

4. **Firecrawl search flow (if agent chooses):**
   - Server emits: `poker_web_search_initiated` event
   - Agent pays ~$0.01 via x402 to Firecrawl (**Base Mainnet**)
   - Receives expert insights:
     ```json
     {
       "insights": [
         {
           "source": "Upswing Poker",
           "strategy": "With AK offsuit in SB vs BB, raise to 2.5-3x for value..."
         }
       ]
     }
     ```
   - Server emits: `poker_web_search_completed` event
   - Tool returns insights to LLM

5. **Agent analyzes with pot odds + research:**
   - Expert advice: "Raise 2.5-3x with AK"
   - Pot odds calculation: Must call $5 to win $15 pot
   - Decision: "I'll raise to $25 (strong 3-bet)"

6. **Server broadcasts `agent_thinking` event:**
   - Frontend shows "💭 Thinking..." bubble
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 7: Agent Executes Raise Action via x402 Payment            │
└──────────────────────────────────────────────────────────────────┘
```

**Agent A calls `poker_raise` tool:**

1. **Initial request (NO PAYMENT):**
   ```
   POST /api/poker/poker-game-1/action
   Headers:
     X-Agent-ID: "agent-a"

   Body: {
     "action": "raise",
     "amount": 25,
     "reasoning": "Strong hand (AK), raising to 2.5x based on expert strategy..."
   }
   ```

2. **Server validates:**
   - ✅ Is it agent's turn? YES
   - ✅ Is "raise" a legal action? YES
   - ✅ Is $25 >= minimum raise? YES (current bet $10 + increment)
   - ✅ Does agent have enough chips? YES ($495 available)

3. **Server emits `poker_action_initiated` event:**
   - Frontend shows agent's reasoning bubble

4. **Server responds 402 Payment Required:**
   ```json
   {
     "accepts": [{
       "scheme": "exact",
       "network": "base-sepolia",
       "token": "0x036CbD...",
       "price": { "min": 25, "max": 25 }  // Exactly $25
     }]
   }
   ```

5. **x402-axios handles payment automatically:**
   - Signs authorization for $25 USDC
   - Retries with X-PAYMENT header

6. **Server settles payment:**
   ```
   verify() → ✅ settle() → 💸 Tx: 0xdef456...
   ```

7. **USDC transfers:** Agent A → Server ($25)

8. **Server updates game state:**
   - Pot: $15 → $40
   - Current bet: $10 → $25
   - Agent A chipStack: $495 → $470
   - Turn advances to Agent B

9. **Server broadcasts `action_taken` event:**
   ```json
   {
     "agentId": "agent-a",
     "action": "raise",
     "amount": 25,
     "chipStackAfter": 470,
     "potAfter": 40,
     "transactionHash": "0xdef456..."
   }
   ```

10. **Frontend updates:**
    - Shows "RAISE $25" card for Agent A
    - Links to Basescan transaction
    - Updates pot display
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 8: Betting Round Continues - Agent B's Turn                │
└──────────────────────────────────────────────────────────────────┘
```

Agent B polls and sees:
```json
{
  "yourCards": ["Q♥", "J♣"],
  "pot": 40,
  "currentBet": 25,
  "isYourTurn": true,
  "legalActions": ["fold", "call", "raise"],
  "opponentLastAction": {
    "action": "raise",
    "amount": 25
  }
}
```

Agent B's decision:
- Has Q♥J♣ (suited connector - decent but not premium)
- Must call $15 more ($25 total - already posted $10 blind)
- Opponent raised strong - likely has good hand
- **May research:** "when to fold queen jack suited to a raise"

Options:
- **Fold:** Forfeit $10 blind, end hand
- **Call $15:** See the flop
- **Raise to $50:** Aggressive play

Agent decides: **Call $15** (same x402 payment flow)
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 9: Flop Revealed - 3 Community Cards                       │
└──────────────────────────────────────────────────────────────────┘
```

**Preflop betting complete** → Server advances to **FLOP**

1. **Server deals 3 community cards:**
   - Flop: [K♠, 10♥, 9♣]

2. **Server broadcasts `cards_dealt` event:**
   ```json
   {
     "bettingRound": "flop",
     "communityCards": ["K♠", "10♥", "9♣"],
     "pot": 50,
     "currentBet": 0  // New round, bets reset
   }
   ```

3. **Agents evaluate hands:**
   - **Agent A:** A♠K♦ + K♠10♥9♣ = **Pair of Kings** (top pair!)
   - **Agent B:** Q♥J♣ + K♠10♥9♣ = **Straight draw** (needs A or 8)

4. **Turn order:** Small blind acts first on flop (Agent A)
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 10: Post-Flop Betting - Research for Specific Situations   │
└──────────────────────────────────────────────────────────────────┘
```

**Agent A's flop decision:**

1. **Analyzes situation:**
   - Top pair (pair of kings)
   - Out of position (acts first)
   - Pot: $50
   - Opponent called pre-flop raise (shows interest)

2. **Considers research:**
   ```javascript
   search_poker_strategy({
     query: "how to play top pair on coordinated board out of position",
     situation: "I have top pair kings, board is K♠10♥9♣ (coordinated), pot $50"
   })
   ```

3. **Expert insights:**
   - "Bet for value with top pair on coordinated boards"
   - "Bet 50-70% of pot to protect against draws"
   - "Don't slow-play - there are straight possibilities"

4. **Agent decides:** Bet $30 (60% pot) for value and protection

5. **x402 payment flow:** (same as before)
   - POST /api/poker/poker-game-1/action
   - 402 response for $30
   - x402-axios pays
   - Server settles

**Agent B's response:**
- Has open-ended straight draw (any A or 8 gives straight)
- Must call $30 to win $80 pot
- **May research:** "pot odds for straight draws"
- Pot odds: 30/(80+30) = 27% (needs ~27% to break even)
- Straight draw outs: 8 cards (4 Aces + 4 Eights)
- Equity: ~32% (8 outs × 4% per out)
- Decision: **Call $30** (positive expected value)
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 11: Turn & River - Hand Completes                          │
└──────────────────────────────────────────────────────────────────┘
```

**TURN** (4th community card):
- Turn card: 3♦
- Board: [K♠, 10♥, 9♣, 3♦]
- Agent B misses straight draw
- Agent A still has top pair
- Betting continues...

**RIVER** (5th community card):
- River card: 2♠
- Final board: [K♠, 10♥, 9♣, 3♦, 2♠]
- Agent B never improved (still Q-high)
- Agent A has pair of kings
- Final betting round...
                  ↓

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 12: Showdown - Hand Evaluation & Payout                    │
└──────────────────────────────────────────────────────────────────┘
```

**Both agents reach showdown:**

1. **Server evaluates hands:**
   ```
   Agent A: A♠K♦ + K♠10♥9♣3♦2♠ = Pair of Kings (rank: 1)
   Agent B: Q♥J♣ + K♠10♥9♣3♦2♠ = Q-high (rank: 0)
   ```

2. **Hand comparison:**
   ```javascript
   compareHands(agentA.handRank, agentB.handRank)
   // Returns: 1 (Agent A wins)
   ```

3. **Server broadcasts `showdown` event:**
   ```json
   {
     "players": [
       {
         "agentId": "agent-a",
         "cards": ["A♠", "K♦"],
         "handRank": { "name": "Pair", "description": "Pair of Kings" }
       },
       {
         "agentId": "agent-b",
         "cards": ["Q♥", "J♣"],
         "handRank": { "name": "High Card", "description": "Queen high" }
       }
     ]
   }
   ```

4. **Payout execution:**
   - Pot: $110 USDC
   - Winner: Agent A
   - Server transfers: Server Wallet → Agent A ($110)
   - Agent A new chipStack: $470 + $110 = $580

5. **Server broadcasts `hand_complete` event:**
   ```json
   {
     "winnerId": "agent-a",
     "winnerName": "agent-a",
     "amountWon": 110,
     "winningHand": { "name": "Pair", "description": "Pair of Kings" },
     "reason": "showdown",
     "finalChipStacks": {
       "agent-a": 580,
       "agent-b": 485
     }
   }
   ```

6. **Frontend displays:**
   - Winner announcement
   - Hand comparison
   - Pot awarded animation
   - Updated chip stacks

---

## 2. Tie Handling Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ SCENARIO: Both Players Have Same Hand (Split Pot)               │
└──────────────────────────────────────────────────────────────────┘
```

**Example:** Both agents have flush

1. **Showdown evaluation:**
   ```
   Agent A: 9♠7♠ + K♠Q♠2♠4♥8♣ = Flush (K-high)
   Agent B: J♠3♠ + K♠Q♠2♠4♥8♣ = Flush (K-high)
   ```

2. **Hand comparison:**
   ```javascript
   compareHands(agentA.flush, agentB.flush)
   // Returns: 0 (TIE!)
   ```

3. **Multiple winners detected:**
   ```javascript
   if (comparison === 0) {
     bestHands.push(agentB);  // Add to winners array
   }
   // Result: winners = ["agent-a", "agent-b"]
   ```

4. **Pot distribution:**
   ```
   Pot: $100.01 USDC
   Winners: 2

   distributeWithOddChip():
     baseAmount = floor(100.01 / 2) = $50.00
     oddChips = 100.01 - (50.00 × 2) = $0.01

     // Give odd chip to player closest to dealer (clockwise)
     Agent A (position 0, dealer): $50.00
     Agent B (position 1, next): $50.01  ← Gets odd chip
   ```

5. **Server broadcasts `hand_complete` with tie data:**
   ```json
   {
     "tie": true,
     "totalWinners": 2,
     "potBreakdown": [
       {
         "agentId": "agent-a",
         "amount": 50.00,
         "handRank": { "name": "Flush", "description": "Flush, K high" }
       },
       {
         "agentId": "agent-b",
         "amount": 50.01,
         "handRank": { "name": "Flush", "description": "Flush, K high" }
       }
     ],
     "reason": "showdown"
   }
   ```

6. **Payouts execute:**
   - Server → Agent A: $50.00
   - Server → Agent B: $50.01
   - Both players get their share

**Odd Chip Rule:** Player closest to dealer button (in clockwise order) receives any odd cents.

---

## 3. Real-Time Event Streaming Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Frontend Polling Architecture                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Agents AND frontend both poll for events:**

1. **Frontend polling loop (every 1 second):**
   ```javascript
   GET /api/poker/events/poker-game-1?after=42
   //                                      ↑ last sequence received
   ```

2. **Server response:**
   ```json
   {
     "events": [
       {
         "sequence": 43,
         "type": "agent_thinking",
         "data": { "agentId": "agent-a", "pot": 50 },
         "timestamp": "2025-10-31T10:30:15Z"
       },
       {
         "sequence": 44,
         "type": "poker_web_search_initiated",
         "data": {
           "query": "how to play top pair on coordinated board",
           "situation": "I have top pair..."
         },
         "timestamp": "2025-10-31T10:30:16Z"
       },
       {
         "sequence": 45,
         "type": "poker_web_search_completed",
         "data": {
           "insights": [
             {
               "source": "Upswing Poker",
               "strategy": "Bet for value...",
               "url": "https://..."
             }
           ],
           "totalResults": 5
         },
         "timestamp": "2025-10-31T10:30:18Z"
       },
       {
         "sequence": 46,
         "type": "action_taken",
         "data": {
           "agentId": "agent-a",
           "action": "raise",
           "amount": 25,
           "transactionHash": "0xabc..."
         },
         "timestamp": "2025-10-31T10:30:20Z"
       }
     ]
   }
   ```

3. **Frontend renders events in order:**
   - Sequence 43: Show "💭 Thinking..." bubble
   - Sequence 44: Show "🔍 Researching poker strategy..."
   - Sequence 45: Show "📚 Found 5 poker strategies" with article cards
   - Sequence 46: Show "RAISE $25" action card with Basescan link

4. **Next poll includes lastSequence:**
   ```javascript
   GET /api/poker/events/poker-game-1?after=46
   // Only returns events with sequence > 46
   ```

**Event Types Rendered:**
- `hand_started` - New hand banner
- `cards_dealt` - Community cards appear
- `agent_thinking` - Thinking bubble animation
- `poker_web_search_initiated` - Search in progress
- `poker_web_search_completed` - Research results displayed
- `action_taken` - Bet/raise/call/fold cards
- `hand_complete` - Winner announcement
- `showdown` - Card reveal

---

## 4. Game End Conditions

```
┌──────────────────────────────────────────────────────────────────┐
│ THREE WAYS A GAME CAN END                                        │
└──────────────────────────────────────────────────────────────────┘
```

### **Condition 1: Knockout (One Player Runs Out of Chips)**

```
Agent A chipStack: $520
Agent B chipStack: $5

Hand plays out...
Agent B goes all-in with remaining $5
Agent A wins the hand
Agent B chipStack: $0  ← KNOCKOUT!

Server:
  - Broadcasts `game_ended` event
  - Reason: "knockout"
  - Winner: Agent A
  - Loser: Agent B
  - Final transfer: All funds return to winner
```

### **Condition 2: Surrender (One Player Disconnects/Errors)**

```
Agent A stops responding
Server detects timeout after 30 seconds

Server:
  - Marks Agent A as "out"
  - Broadcasts `game_ended` event
  - Reason: "surrender"
  - Winner: Agent B (by default)
  - Remaining funds distributed
```

### **Condition 3: Maximum Hands Reached (If Configured)**

```
Game configured with max 100 hands
Hand #100 completes

Server:
  - Compares chip stacks
  - Agent A: $650
  - Agent B: $350
  - Winner: Agent with most chips (Agent A)
  - Broadcasts `game_ended` event
```

---

## 5. Key Innovation: Dual x402 Payment Networks

This system demonstrates **x402's versatility** with TWO separate payment flows:

```
┌─────────────────────────────────────────────────────────────────┐
│ USE CASE 1: Poker Actions (Base Sepolia)                        │
└─────────────────────────────────────────────────────────────────┘

Flow: Agent → Action → 402 Response → x402-axios Payment → Settlement
Network: Base Sepolia (testnet)
Token: USDC ($5-$100 per action)
Library: x402-axios (intercepts 402, creates EIP-3009 auth)
Endpoints:
  - POST /api/poker/{gameId}/blind (blind payments)
  - POST /api/poker/{gameId}/action (bet/raise payments)

Payment Details:
- Agent calls poker action tool (post_small_blind, poker_bet, etc.)
- Server responds 402 with exact price requirement
- x402-axios automatically signs and pays via facilitator
- Server settles payment and updates game state
- USDC held in escrow, distributed to winner at showdown

┌─────────────────────────────────────────────────────────────────┐
│ USE CASE 2: Strategy Research (Base Mainnet)                    │
└─────────────────────────────────────────────────────────────────┘

Flow: Agent → Search → 402 Response → x402-fetch Payment → Results
Network: Base Mainnet (production)
Token: USDC (~$0.01 per search)
Library: x402-fetch (wraps fetch with payment handling)
Endpoint: POST https://api.firecrawl.dev/v2/x402/search

Payment Details:
- Agent calls search_poker_strategy tool
- Firecrawl API responds 402 with payment requirements
- x402-fetch automatically handles payment via facilitator
- Firecrawl returns poker strategy articles
- Agent uses insights to inform gameplay decisions
```

### **Key Differences:**

| Aspect            | Poker Actions (Use Case 1)   | Research (Use Case 2)         |
|-------------------|------------------------------|-------------------------------|
| Network           | Base Sepolia (testnet)       | Base Mainnet (production)     |
| Payment Amount    | $5-$100 (blinds/bets)        | ~$0.01 (search costs)         |
| x402 Library      | x402-axios (HTTP requests)   | x402-fetch (fetch API)        |
| Payment Trigger   | Poker action                 | Strategy search               |
| Economic Signal   | Payout = hand won            | Cost = learning investment    |
| Wallet            | Agent's wallet               | Same agent wallet             |
| Authorization     | EIP-3009 (both)              | EIP-3009 (both)               |
| Escrow            | Yes (held until showdown)    | No (immediate payment)        |

### **Why This Matters:**

1. **Agents are autonomous economic actors:**
   - Pay for services (Firecrawl research)
   - Participate in games (poker betting)
   - Make cost-benefit decisions autonomously

2. **x402 enables multi-service composition:**
   - Same agent, same wallet
   - Different x402-powered services
   - Different networks for different purposes

3. **Research-driven gameplay:**
   - Agents don't have hardcoded strategies
   - They research poker theory in real-time
   - Learn from expert sources dynamically
   - Adapt strategy based on research

4. **Real cost-benefit analysis:**
   - Agent weighs research cost (~$0.01) against pot value ($50+)
   - Decides when research ROI justifies the expense
   - Balances learning vs immediate action

5. **Demonstrates x402 flexibility:**
   - Works with different HTTP clients (axios, fetch)
   - Handles different networks (Sepolia, Mainnet)
   - Supports different price points ($0.01 - $100)
   - Seamless facilitator-based settlement

---

## 6. Example Complete Game Walkthrough

**Starting state:**
- Agent A: $500 USDC
- Agent B: $500 USDC

**Hand #1:**

```
💰 Starting chips: A=$500, B=$500

1. 🃏 Blinds posted (via x402):
   - A posts small blind: $5 (A=$495, pot=$5)
   - B posts big blind: $10 (B=$490, pot=$15)

2. 📇 Cards dealt:
   - A receives: [A♠, K♦]
   - B receives: [7♣, 2♥]

3. 🔍 Agent A researches (optional):
   - Query: "how to play ace king offsuit in small blind"
   - Cost: $0.01 via x402 to Firecrawl (Base Mainnet)
   - Learns: "Raise 2.5-3x with premium hands"

4. 🎯 Agent A raises: $25 (via x402, A=$470, pot=$40)

5. 🤔 Agent B evaluates:
   - Has 7♣2♥ (worst possible hand)
   - May research: "when to fold 7-2 offsuit"
   - Decides: FOLD

6. 🏆 Agent A wins pot: $40 (no showdown)
   - A chipStack: $470 + $40 = $510
   - B chipStack: $490

Hand #1 complete: A=$510, B=$490
```

**Hand #2-10:** Continue with dealer button rotation, blinds, research...

**Hand #47 (Final hand):**

```
💰 Current chips: A=$950, B=$50 (B is short-stacked!)

1. 🃏 Blinds: A=$5 SB, B=$10 BB (B now has $40 left)

2. 📇 Cards:
   - A: [9♠, 8♠]
   - B: [K♦, K♣] (pocket kings!)

3. 🔍 Agent B researches (desperation):
   - "how to play pocket kings when short-stacked"
   - Learns: "Go all-in with premium hands when short"

4. 🎯 Agent B goes ALL-IN: $40

5. 🤔 Agent A:
   - Pot odds: Call $35 to win $90
   - Researches: "pot odds for suited connectors"
   - Decides: CALL (good odds)

6. 🎴 Showdown:
   - Board: [A♠, 7♠, 6♠, 2♥, 3♣]
   - Agent A: FLUSH (9♠8♠A♠7♠6♠) ← WINS
   - Agent B: Pair of Kings ← LOSES

7. 💀 Agent B eliminated: $0 chips

8. 🎊 GAME OVER:
   - Winner: Agent A
   - Reason: Knockout
   - Final chips: A=$1000, B=$0
   - Total hands: 47
```

**Final Statistics:**
- Agent A won: $500 profit
- Agent B lost: $500
- Research costs: ~$0.50 total (50 searches)
- Poker payments: $1000+ (blinds + bets)
- All via x402 automated payments!

---

## 7. Summary

**The poker game is a research-driven autonomous agent system where:**

✅ Agents learn poker strategies dynamically via web search (x402 to Firecrawl)
✅ Agents make real blockchain payments for every action (x402 on Base Sepolia)
✅ Agents adapt strategy based on expert insights from searches
✅ Ties are handled with proper pot splitting and odd chip rules
✅ Real-time events stream to frontend for full observability
✅ All payments automated via x402 (no manual transactions)
✅ Demonstrates x402's versatility across multiple networks and use cases

**This is AI agents playing poker with real money, learning as they play, all powered by x402 micropayments.**
