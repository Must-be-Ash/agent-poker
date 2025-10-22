  1. The Complete Bidding Flow (Step-by-Step)

  ┌──────────────────────────────────────────────────────────────────┐
  │ STEP 1: Agent Decides on Bid Amount (AI Reasoning)              │
  └──────────────────────────────────────────────────────────────────┘

  Agent's LLM analyzes auction:
  - Calls get_auction_state → sees current bid is $5.50
  - Calls get_my_balance → has $15.32 USDC
  - Decides: "I'll bid $7.75 to pressure opponent"
                      ↓


  ┌──────────────────────────────────────────────────────────────────┐
  │ STEP 2: Agent Sends Proposal (NO PAYMENT YET)                   │
  └──────────────────────────────────────────────────────────────────┘

  POST /api/bid/x402agent.base.eth
  Headers:
    X-Agent-ID: "AgentB"
    X-Proposed-Bid: "7.75"  ← Agent's chosen amount
    X-Strategy-Reasoning: "Strategic aggressive bid..."
    (NO X-PAYMENT header yet!)

  Body:
    {
      "thinking": "Strategic aggressive bid...",
      "strategy": "intelligent"
    }
                      ↓


  ┌──────────────────────────────────────────────────────────────────┐
  │ STEP 3: Server Evaluates Proposal & Tracks Agent Interest       │
  └──────────────────────────────────────────────────────────────────┘

  Server actions:
    1. Records agent in participatingAgents array:
       {
         agentId: "AgentB",
         walletAddress: undefined,  // Will be filled after payment
         status: 'active',
         firstSeen: Date.now(),
         lastActivity: Date.now()
       }
       💡 Agent is now tracked BEFORE payment!

    2. Evaluates proposal:
       - Current bid: $5.50
       - Minimum required: $5.50 + $1 = $6.50
       - Proposed amount: $7.75
       - Is $7.75 >= $6.50? ✅ YES

  TWO POSSIBLE RESPONSES:

  Option A: Proposal TOO LOW
    → Returns 400 Bad Request
    → {
        "error": "Proposal rejected",
        "negotiation": {
          "yourProposal": 5.00,
          "currentBid": 5.50,
          "minimumToWin": 6.50,
          "message": "Your proposal is too low",
          "suggestion": 7.00
        }
      }
    → x402-axios does NOT intercept 400
    → Agent's LLM sees rejection, decides new amount, retries

  Option B: Proposal ACCEPTABLE (our case)
    → Returns 402 Payment Required
    → {
        "accepts": [{
          "scheme": "exact",
          "network": "base-sepolia",
          "token": "0x036CbD...",
          "price": { "min": 7.75, "max": 7.75 }  ← Exact amount
        }]
      }
                      ↓


  ┌──────────────────────────────────────────────────────────────────┐
  │ STEP 4: x402-axios Intercepts 402 (AUTOMATIC)                   │
  └──────────────────────────────────────────────────────────────────┘

  x402-axios interceptor:
  1. Catches the 402 response
  2. Reads PaymentRequirementsResponse
  3. Sees price: { min: 7.75, max: 7.75 }
  4. Signs EIP-3009 authorization for EXACTLY $7.75
  5. Automatically retries the SAME request with X-PAYMENT header
                      ↓


  ┌──────────────────────────────────────────────────────────────────┐
  │ STEP 5: Server Verifies & Settles Payment                       │
  └──────────────────────────────────────────────────────────────────┘

  POST /api/bid/x402agent.base.eth (retry)
  Headers:
    X-Agent-ID: "AgentB"
    X-Proposed-Bid: "7.75"
    X-PAYMENT: "eyJzY2hlbWUi..."  ← EIP-3009 signed authorization

  Server:
  1. Calls verify(paymentPayload) → ✅ Valid
  2. Calls settle(paymentPayload) → Transaction: 0xabc123...
  3. USDC transfers from AgentB → Server wallet
  4. Updates MongoDB: currentWinner = AgentB, currentBid = 7.75
  5. Updates participatingAgents: adds AgentB's walletAddress
  6. Checks if only 1 active participant remains:
     - If yes → 🏆 End auction immediately, declare winner!
     - If no → Continue auction
  7. Sends refund to previous winner (AgentA)
                      ↓


  ┌──────────────────────────────────────────────────────────────────┐
  │ STEP 6: Agent Receives Success Response                         │
  └──────────────────────────────────────────────────────────────────┘

  Server returns 200 OK:
  {
    "success": true,
    "message": "Bid placed: 7.75 USDC",
    "currentWinner": "AgentB",
    "currentBid": 7.75,
    "transactionHash": "0xabc123...",
    "auctionEndsIn": 114
  }

  Agent's tool returns this to LLM
  LLM generates reflection: "I have executed a strong strategic move..."

  ---
  Key Points About Agent Control

  The agent FULLY controls the bid amount!

  1. Agent queries auction state (get_auction_state) to see current bid
  2. Agent's LLM decides on strategic amount (e.g., "$7.75 will pressure opponent")
  3. Agent proposes amount via X-Proposed-Bid header
  4. Server validates proposal is >= minimum
  5. If valid: Server returns 402 with price: { min: 7.75, max: 7.75 } (exact amount)
  6. x402-axios pays exactly what agent proposed

  The agent is NOT forced to pay a fixed price - it proposes, server validates, then payment happens.

  ---

  2. Agent Withdrawal Flow

  ┌──────────────────────────────────────────────────────────────────┐
  │ SCENARIO A: Agent Withdraws After Placing Bids                  │
  └──────────────────────────────────────────────────────────────────┘

  Example: AgentA bid $5, got outbid by AgentB's $45, decides to withdraw

  1. Agent calls withdraw_from_auction tool:
     POST /api/refund-request/x402agent.base.eth
     Body: {
       "agentId": "AgentA",
       "walletAddress": "0xAbc...",
       "reasoning": "Current bid exceeds my budget"
     }

  2. Server checks:
     ✅ Agent has bids in history: [{ amount: 5, agentId: "AgentA" }]
     ✅ Agent is NOT current winner
     ✅ Valid to withdraw

  3. Server actions:
     - Marks agent as status: 'withdrawn' in participatingAgents
     - Sends USDC refund of $5 to AgentA's wallet
     - Emits withdrawal_decision event
     - Checks active participants count

  4. Auto-win check:
     activeParticipants = filter(status === 'active')
     if (activeParticipants.length === 1 && currentBid > 0):
       → 🏁 END AUCTION
       → Declare current high bidder as winner!
       → Emit auction_ended event


  ┌──────────────────────────────────────────────────────────────────┐
  │ SCENARIO B: Agent Withdraws Before Placing Any Bids             │
  └──────────────────────────────────────────────────────────────────┘

  Example: AgentA evaluates auction, decides $46 minimum exceeds $42 budget

  1. AgentA makes proposal:
     POST /api/bid/x402agent.base.eth
     Headers: X-Proposed-Bid: "15.00"

     Server responds 400 (proposal too low - current bid $45, min $46)
     👤 AgentA is recorded in participatingAgents

  2. Agent calls withdraw_from_auction tool:
     POST /api/refund-request/x402agent.base.eth
     Body: {
       "agentId": "AgentA",
       "walletAddress": "0xAbc...",
       "reasoning": "Minimum bid exceeds my budget"
     }

  3. Server checks:
     ❌ Agent has NO bids in history
     ✅ But agent exists in participatingAgents!
     ✅ Valid to withdraw (even without bids)

  4. Server actions:
     - Marks agent as status: 'withdrawn' in participatingAgents
     - ⚠️ NO refund issued (agent never paid)
     - Emits withdrawal_decision event (with amount: 0)
     - Checks active participants count

  5. Auto-win check:
     activeParticipants = filter(status === 'active')  // = [AgentB]
     if (activeParticipants.length === 1):
       if (currentBid > 0):  // AgentB already bid $45
         → 🏁 END AUCTION IMMEDIATELY
         → AgentB wins by default!
         → Message: "All other bidders withdrew"
       else:
         → ℹ️ Auction continues
         → Next bid from AgentB will auto-win


  ---

  3. Complete Auction End Conditions

  An auction can end in THREE ways:

  1️⃣ WITHDRAWAL WITH EXISTING BIDS
     - Agent withdraws
     - Only 1 active participant remains
     - Current bid > 0
     → END AUCTION: Declare high bidder winner

  2️⃣ WITHDRAWAL BEFORE ANY BIDS
     - Agent withdraws
     - Only 1 active participant remains
     - No bids yet (currentBid = 0)
     → PREPARE FOR AUTO-WIN: Next bid wins immediately

  3️⃣ AUTO-WIN AFTER BID
     - Agent places bid
     - Server checks: only 1 active participant?
     - Yes → END AUCTION immediately after payment settles
     → Winner gets special message: "🎉 You won! Opponent withdrew."