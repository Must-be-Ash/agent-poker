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
  │ STEP 3: Server Evaluates Proposal                               │
  └──────────────────────────────────────────────────────────────────┘

  Server checks:
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
  5. Sends refund to previous winner (AgentA)
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