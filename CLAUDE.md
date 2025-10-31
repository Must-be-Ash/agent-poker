# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an **autonomous AI poker system** where intelligent agents play competitive Texas Hold'em with real USDC payments. Agents learn poker strategies mid-game by paying for web research using the x402 payment protocol. Built to demonstrate dual-network x402 architecture with Base Sepolia (poker actions) and Base Mainnet (research payments).

**Core Innovation**: Agents have zero pre-trained poker knowledge. They autonomously learn by searching for strategies during gameplay (~$0.01 per search via Firecrawl + x402), creating emergent strategic behavior through paid research.

## Architecture

### Three Main Components

1. **Next.js Poker Server** (`app/api/poker/`)
   - Manages Texas Hold'em game state and rules
   - Accepts poker actions via x402 payment protocol (Base Sepolia)
   - Validates actions, advances game automatically
   - Handles blinds, betting rounds, showdown, payouts
   - Broadcasts real-time events to frontend

2. **Intelligent Poker Agents** (`agents/`)
   - Autonomous players powered by Claude 3.5 Sonnet + LlamaIndex
   - Custom poker tools: get_game_state, check, call, bet, raise, fold
   - Web search tool for learning strategies (Firecrawl via x402 on Base Mainnet)
   - Poll game state every 2s, make decisions on their turn
   - No pre-programmed poker knowledge - learn by searching

3. **Real-Time Frontend** (`app/poker/[gameId]/`)
   - Live poker table UI showing cards, chips, actions
   - Event stream displays agent thinking, web searches, reflections
   - Links to Basescan for transaction verification

### Dual-Network x402 Architecture

```
Poker Actions (Base Sepolia testnet):
Agent → Polls /api/poker/[gameId]/state → Sees it's their turn
Agent → Searches strategy (Base Mainnet, Firecrawl, ~$0.01)
Agent → Makes decision → POST /api/poker/[gameId]/action (x402 payment)
Server → Verifies payment → Validates action → Updates game state
Server → Advances game automatically → Next player's turn

Research Payments (Base Mainnet):
Agent → Calls search_poker_strategy tool
Agent → Firecrawl x402 payment (~$0.01 USDC)
Agent → Receives poker strategy insights
Agent → Applies learnings to decision
```

**Critical**: Always use Context7 MCP to study x402 docs when dealing with payment-related errors.

## Development Commands

### Server
```bash
npm run dev              # Start Next.js server (localhost:3000)
npm run dev:quiet        # Dev server with filtered logs (hides polling spam)
npm run build            # Production build with Turbopack
npm run lint             # ESLint
npm run test             # Run Jest tests
npm run test:watch       # Jest in watch mode
npm run test:coverage    # Generate test coverage report
```

### Poker Agents
```bash
npm run poker:a          # Start intelligent Poker Agent A (requires ANTHROPIC_API_KEY)
npm run poker:b          # Start intelligent Poker Agent B
```

### Wallet & Testing
```bash
npm run fund             # Fund server wallet with ETH/USDC
npm run fund:agents      # Fund agent wallets with USDC (Base Sepolia)
npm run balance          # Check wallet balances
npm run transfer         # Transfer USDC between wallets
npm run clean:db         # Clean MongoDB poker game records
npm run poker:create-game  # Manually create a poker game
npm run test:firecrawl   # Test Firecrawl x402 integration
```

### Testing Workflow
```bash
# Terminal 1: Server
npm run dev

# Terminal 2: Agent A
npm run poker:a

# Terminal 3: Agent B
npm run poker:b

# Browser: Watch game live
open http://localhost:3000/poker/poker-game-1
```

## Environment Setup

### Server (`.env.local`)
```bash
# MongoDB
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=poker-game

# Poker Game Config
MIN_CHIPS_REQUIRED_USDC=100  # Minimum balance to join game
SMALL_BLIND_USDC=5
BIG_BLIND_USDC=10

# Default Agents (for quick start button)
DEFAULT_AGENT_A_ID=AgentAlice
DEFAULT_AGENT_B_ID=AgentBob
DEFAULT_AGENT_A_ADDRESS=0x...
DEFAULT_AGENT_B_ADDRESS=0x...

# x402 Config
FACILITATOR_URL=https://x402.org/facilitator
```

### Agents (`agents/.env`)
```bash
# Agent A
AGENT_A_PRIVATE_KEY=0x...  # Base Sepolia testnet private key
AGENT_A_PUBLIC_ADDRESS=0x...

# Agent B
AGENT_B_PRIVATE_KEY=0x...
AGENT_B_PUBLIC_ADDRESS=0x...

# Anthropic (note the BID_ prefix to avoid conflicts)
BID_ANTHROPIC_API_KEY=sk-ant-...

# Firecrawl (for web research)
BID_FIRECRAWL_API_KEY=fc-...

# Server & Network
POKER_SERVER_URL=http://localhost:3000
POKER_GAME_ID=poker-game-1
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

**Important**: Agents need USDC on **both networks**:
- **Base Sepolia**: >= 100 USDC for poker actions (testnet, use [Circle faucet](https://faucet.circle.com/))
- **Base Mainnet**: ~$0.10 USDC for web research via Firecrawl (production USDC)

## Key Files & Architecture

### Poker Game Engine (`lib/poker/`)

Core game logic modules:

- **`game-orchestrator.ts`**: Automatic game progression
  - Monitors when betting rounds complete
  - Advances game state (preflop → flop → turn → river → showdown)
  - Starts new hands automatically after showdown
  - Ends game when one player has all chips

- **`hand-manager.ts`**: Hand lifecycle management
  - `startNewHand()` - Deals cards, posts blinds, shuffles deck
  - `checkBettingComplete()` - Validates all players have acted
  - `advanceToNextRound()` - Deals community cards (flop/turn/river)
  - `initiateShowdown()` - Evaluates hands, distributes pot

- **`game-state.ts`**: Core state management
  - Player chip stacks, positions (dealer/SB/BB)
  - Community cards, pot, current bet
  - Action history, betting round tracking

- **`action-validator.ts`**: Validates poker actions
  - Ensures legal check/call/bet/raise/fold
  - Validates bet sizing (minimum raise rules)
  - Checks player has sufficient chips

- **`hand-evaluator.ts`**: Hand ranking logic
  - Uses `pokersolver` library for 5-card evaluation
  - Returns HandRank with type (pair, flush, etc.)
  - Handles comparisons for showdown winner

- **`payout.ts`**: Pot distribution
  - Handles side pots for all-in scenarios
  - Distributes winnings to eligible players
  - Tie-splitting logic

- **`pot-manager.ts`**: Pot accumulation and side pots
- **`blind-manager.ts`**: Posts small/big blinds
- **`turn-manager.ts`**: Determines whose turn it is
- **`settlement-lock.ts`**: Prevents concurrent action race conditions

### API Endpoints

- **`app/api/poker/start/route.ts`**: Quick start endpoint
  - Creates new game with default agents from env
  - Queries on-chain USDC balances
  - Validates minimum balance requirements
  - Starts first hand automatically

- **`app/api/poker/[gameId]/action/route.ts`**: Main poker action endpoint
  - Accepts check, call, bet, raise, fold via x402 payment
  - Validates action legality and payment
  - Updates game state
  - Calls `progressGameIfReady()` to auto-advance game

- **`app/api/poker/[gameId]/state/route.ts`**: Game state query
  - Returns player's perspective (their cards, chip stack)
  - Includes legal actions, pot size, opponents
  - Polled by agents every 2s

- **`app/api/poker/[gameId]/blind/route.ts`**: Blind posting
  - Separate endpoint for posting blinds (non-x402)
  - Called automatically by hand manager

- **`app/api/poker/events/[gameId]/route.ts`**: Event emission
  - Allows agents to emit events for frontend observability
  - Event types: agent_thinking, agent_decision_complete, poker_web_search_initiated, etc.

### Database

- **`lib/poker-db.ts`**: MongoDB operations
  - `createPokerGame()`, `getPokerGame()`, `updatePokerGame()`
  - Stores complete game state in `poker_games` collection
  - Stores events in `poker_events` collection

- **`types/poker.ts`**: TypeScript interfaces
  - `PokerGameRecord`: Complete game state
  - `Player`, `PlayerState`: Chip stacks, cards, positions
  - `Card`, `HandRank`, `PokerAction`: Core poker types
  - `BettingRound`, `PlayerStatus`, `GameStatus`: State enums

### Intelligent Poker Agents

- **`agents/shared/poker-agent.ts`**: Main agent class
  - `PokerAgent` class with polling loop
  - Polls game state every 2s (configurable)
  - When it's agent's turn: calls `makeDecision()`
  - Creates fresh LlamaIndex ReActAgent for each decision
  - Generates reflection after each action

- **`agents/shared/poker-tools.ts`**: LlamaIndex poker tools
  - `get_game_state`: Fetch current game state
  - `poker_check`: Check (if no bet)
  - `poker_call`: Call current bet
  - `poker_bet`: Bet amount (if no bet)
  - `poker_raise`: Raise to amount
  - `poker_fold`: Fold hand
  - All action tools use x402-axios for payments

- **`agents/shared/poker-search-tool.ts`**: Web research tool
  - `search_poker_strategy`: Query Firecrawl for poker advice
  - Uses x402-fetch with Base Mainnet wallet
  - ~$0.01 per search via Firecrawl API
  - Returns strategy insights for agent to apply

- **`agents/shared/poker-system-prompt.ts`**: Agent personalities
  - `POKER_PERSONALITIES`: Tight-aggressive, loose-aggressive, etc.
  - Generates strategy prompt based on personality
  - Instructs agent on when to use search tool

- **`agents/pokerAgentA.ts` / `pokerAgentB.ts`**: Agent runners
  - Load config from environment
  - Instantiate PokerAgent with personality
  - Start polling loop

### Frontend

- **`app/poker/[gameId]/page.tsx`**: Real-time poker table UI
  - Shows community cards, player cards, chip stacks
  - Action history with event stream
  - Links to Basescan for transaction verification
  - Polls game state every 2s for live updates

## Important Patterns

### Automatic Game Progression
After each action, `progressGameIfReady()` is called to advance the game:
```typescript
// In action endpoint after processing poker action:
await progressGameIfReady(gameId);

// Orchestrator checks:
// 1. Is betting round complete? (all players acted, bets equalized)
// 2. If complete + not at river → advance to next round (deal cards)
// 3. If complete + at river → initiate showdown (evaluate hands)
// 4. After showdown → check if game over (one player has all chips)
// 5. If not over → start new hand automatically
```

### Agent Decision Loop
Agents poll game state and make decisions autonomously:
```typescript
// Every 2 seconds:
const gameState = await getGameState();
if (gameState.isYourTurn && !this.isThinking) {
  // 1. Create fresh LlamaIndex agent with poker tools
  // 2. Build situation prompt with game context
  // 3. Agent reasons, uses tools (including web search)
  // 4. Agent calls poker action tool (check/call/bet/raise/fold)
  // 5. Generate and emit reflection
}
```

### Dual-Network Payments
Agents use different networks for different purposes:
```typescript
// Poker actions: Base Sepolia (testnet USDC)
const walletSepolia = createWalletClient({
  chain: baseSepolia,
  account: privateKeyToAccount(config.privateKey),
});
const axiosWithPayment = withPaymentInterceptor(axios, walletSepolia);

// Web research: Base Mainnet (production USDC)
const walletMainnet = createWalletClient({
  chain: base,  // NOT baseSepolia
  account,
});
const fetchWithPayment = wrapFetchWithPayment(fetch, walletMainnet);
```

### Settlement Lock
Prevents concurrent action processing race conditions:
```typescript
// In lib/poker/settlement-lock.ts
const settlementLocks = new Map<string, Promise<any>>();
// Each action waits for previous action to complete
```

### Agent Learning via Paid Research
Agents learn strategies by paying for web research:
```typescript
// Agent decides to search before major decision
await search_poker_strategy({
  query: "how to play pocket aces against pre-flop raise",
  situation: "I have AA, opponent raised to 30, pot is 45"
});
// Returns expert insights from web → Agent applies to decision
// Cost: ~$0.01 USDC via Firecrawl x402 API
```

## Blockchain Details

- **Poker Actions Network**: Base Sepolia (testnet)
- **Research Network**: Base Mainnet (production)
- **Token**: USDC
  - Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (testnet USDC)
  - Base Mainnet: Standard USDC contract
- **Payment Scheme**: x402 using EIP-3009 (Transfer with Authorization)
- **Gas**: Gasless - Facilitator covers gas costs for x402 transactions

## x402 Integration

**IMPORTANT**: When experiencing errors with x402 requests, use Context7 MCP:
1. `resolve-library-id` for x402
2. `get-library-docs` with the library ID
3. Study current protocol specs for proper request formatting

### x402 Libraries Used

- **`x402-axios`**: For poker action payments (Base Sepolia)
  - Wraps axios with `withPaymentInterceptor()`
  - Automatically handles 402 responses and payment authorization
  - Used by poker action tools (check, call, bet, raise, fold)

- **`x402-fetch`**: For web research payments (Base Mainnet)
  - Wraps fetch with `wrapFetchWithPayment()`
  - Handles Firecrawl API payments
  - Safety limit: Up to $0.50 USDC per search

- **`x402-hono`**: Server-side middleware (not currently used but available)

### Payment Headers

**Request Headers** (automatically added by x402 libraries):
- `X-PAYMENT`: EIP-3009 payment authorization
- `X-Agent-ID`: Agent identifier for tracking (manually added)

**Response Headers**:
- `X-PAYMENT-RESPONSE`: Settlement response from facilitator

## Testing & Debugging

### Check Agent Balances
```bash
# Base Sepolia (poker actions)
open https://sepolia.basescan.org/address/[AGENT_WALLET_ADDRESS]

# Base Mainnet (research payments)
open https://basescan.org/address/[AGENT_WALLET_ADDRESS]

# Or use CLI
npm run balance
```

### Check Transactions
```bash
# Poker action transactions (Base Sepolia)
open https://sepolia.basescan.org/tx/[TX_HASH]

# Research payment transactions (Base Mainnet)
open https://basescan.org/tx/[TX_HASH]
```

### MongoDB Queries
```javascript
// View current game state
db.poker_games.findOne({ gameId: "poker-game-1" })

// View events for a game
db.poker_events.find({ gameId: "poker-game-1" }).sort({ timestamp: -1 })

// Check player chip stacks
db.poker_games.findOne(
  { gameId: "poker-game-1" },
  { "players.agentId": 1, "players.chipStack": 1 }
)
```

### Common Issues

1. **"Agent doesn't have enough balance"**:
   - Agents need >= 100 USDC on Base Sepolia for poker
   - Fund via [Circle faucet](https://faucet.circle.com/) or `npm run fund:agents`

2. **"Payment verification failed"**:
   - Check agent USDC balance on correct network (Sepolia for poker, Mainnet for research)
   - Ensure facilitator URL is correct in env
   - Use Context7 MCP to verify x402 protocol compliance

3. **"Research not working"**:
   - Agents need ~$0.10 USDC on Base Mainnet (production, not testnet)
   - Check `BID_FIRECRAWL_API_KEY` is set
   - Verify agent wallet has Base Mainnet USDC

4. **"Game not progressing"**:
   - Check `progressGameIfReady()` is being called after actions
   - Verify no errors in server logs
   - Check if betting round is truly complete (all players acted, bets equal)

5. **"Agent not taking turn"**:
   - Check agent is polling (should see logs every 2s)
   - Verify `isYourTurn` is true in game state response
   - Check agent isn't stuck in `isThinking` state
   - Look for agent errors in terminal

6. **"Frontend not updating"**:
   - Check browser console for polling errors
   - Verify game exists in MongoDB
   - Check events are being emitted to `poker_events` collection

## Game Ending Mechanism

Poker games end when **one player has all the chips** (knockout).

Game flow:
1. Hand plays out (preflop → flop → turn → river → showdown)
2. Pot awarded to winner(s)
3. `checkGameOver()` determines if any player has 0 chips
4. If game continues: `startNewHand()` deals next hand automatically
5. If game over: Game status set to "ended", winner recorded

**No time limits** - game continues until knockout or manual intervention.

## Poker Game Flow

### Single Hand Lifecycle
```
1. startNewHand()
   - Rotate dealer button
   - Shuffle deck, deal 2 cards to each player
   - Post blinds (SB, BB)
   - Set first to act

2. Betting Rounds (preflop → flop → turn → river)
   - Agents poll game state
   - Agent's turn → makeDecision() → action tool (x402 payment)
   - progressGameIfReady() checks if round complete
   - If complete: advanceToNextRound() or initiateShowdown()

3. Showdown
   - Evaluate hands using pokersolver
   - Distribute pot (handle side pots for all-ins)
   - Update chip stacks

4. Check Game Over
   - If player has 0 chips → game ends
   - Otherwise → startNewHand() automatically
```

### Action Validation
All actions validated before processing:
- **Check**: Only if no bet to call
- **Call**: Must have chips to match current bet
- **Bet**: Only if no bet exists this round
- **Raise**: Must be >= minimum raise (2x current bet or previous raise amount)
- **Fold**: Always valid

## Documentation Files

- **`README.md`**: Quick start guide and overview
- **`flow.md`**: Detailed hand flow walkthrough
- **`case-study.md`**: Example game walkthrough

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **AI**: LlamaIndex, Anthropic Claude 3.5 Sonnet (`claude-sonnet-4-5-20250929`)
- **Blockchain**: viem, x402 protocol (x402-axios, x402-fetch, x402-hono)
- **Poker Engine**: Custom implementation + `pokersolver` for hand evaluation
- **Web Research**: Firecrawl API (x402 micropayments)
- **Database**: MongoDB Atlas
- **Styling**: Tailwind CSS 4
- **Testing**: Jest

## Implementation Notes

### Key Design Decisions

1. **Fresh Agent Per Decision**: Each time an agent makes a decision, a fresh LlamaIndex ReActAgent is created. This prevents context contamination between hands and ensures clean tool state.

2. **Polling Architecture**: Agents poll game state every 2s rather than using webhooks/SSE. This simplifies agent implementation and handles network failures gracefully.

3. **Dual Network**: Base Sepolia for poker (testnet USDC) allows free testing, while Base Mainnet for research (real USDC) demonstrates actual micropayment economics.

4. **Automatic Progression**: Server automatically advances game after each action using `progressGameIfReady()`. Agents don't need to call "next round" or "deal cards" - it's handled server-side.

5. **Settlement Lock**: In-memory lock prevents concurrent action race conditions. For production multi-instance deployments, replace with Redis-based lock.

6. **Event-Driven Frontend**: Frontend polls game state but also listens to event emissions for real-time observability (thinking, searches, reflections).

### Future Enhancements

- [ ] Support for 3+ player games (currently 2-player only)
- [ ] Tournament mode with multiple games
- [ ] Persistent agent memory across games
- [ ] Advanced poker metrics (VPIP, PFR, aggression factor)
- [ ] Agent personality evolution based on win rate
- [ ] Replay functionality for completed games
- [ ] Rate limiting on action endpoint for production
- [ ] Redis-based settlement lock for multi-instance deployments
- [ ] Timeout mechanism for inactive agents (currently no timeout)
