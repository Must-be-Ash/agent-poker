# AI Poker Agent Implementation Plan

## 🎯 Goal

Transform the autonomous bidding system into a **Texas Hold'em poker game** where two intelligent AI agents compete against each other using the x402 payment protocol for betting. Agents make strategic poker decisions powered by Claude AI, with real cryptocurrency stakes (USDC) on Base Sepolia.

## 🏗️ Core Concept

**Current System**: Agents bid on Basenames in an auction format
- Single action: Bid (higher than current bid)
- Linear strategy: Determine max value, bid until reached
- Refunds trigger re-evaluation

**Poker System**: Agents play Texas Hold'em with x402-based betting
- Multiple actions: Check, Call, Bet, Raise, Fold
- Complex strategy: Hand evaluation, pot odds, position, bluffing
- Stack changes trigger strategic adjustments
- Multiple betting rounds per hand (Preflop, Flop, Turn, River)

## 📊 Architecture Overview

### What We Keep
- ✅ Next.js server infrastructure
- ✅ x402 payment protocol integration
- ✅ Intelligent agents (Claude + LlamaIndex)
- ✅ Real-time SSE streaming
- ✅ MongoDB state management
- ✅ CDP wallet for server payments
- ✅ Settlement lock pattern

### What We Build New
- 🆕 Poker game engine (hand evaluation, rules)
- 🆕 Card dealing & deck management
- 🆕 Pot management & side pot logic
- 🆕 Multi-round betting structure
- 🆕 Showdown & winner determination
- 🆕 Agent poker strategy tools
- 🆕 Poker-specific UI components

---

## 📋 Implementation Phases

### Phase 1: Core Poker Engine 🃏

Build the fundamental poker game logic independent of AI or payments.

#### Tasks

- [x] **1.1: Create poker types**
  - File: `types/poker.ts`
  - Define: `Card`, `HandRank`, `PokerAction`, `Player`, `GameState`
  - Include betting round states: `preflop`, `flop`, `turn`, `river`
  - ✅ Completed: Comprehensive type definitions including Card, HandRank, PokerAction, Player, GameState, and more

- [x] **1.2: Implement card utilities**
  - File: `lib/poker/cards.ts`
  - Functions: `createDeck()`, `shuffleDeck()`, `dealCards()`
  - Use cryptographically secure randomization
  - ✅ Completed: Full card utilities with Fisher-Yates shuffle, crypto.getRandomValues(), deal functions, and helper utilities

- [x] **1.3: Implement hand evaluator**
  - File: `lib/poker/hand-evaluator.ts`
  - Function: `evaluateHand(cards: Card[]): HandRank`
  - Rankings: Royal Flush → High Card
  - Return comparable strength values
  - **Recommendation**: Use existing library like `pokersolver` or `phe` (Poker Hand Evaluator)
  - ✅ Completed: Installed pokersolver, created wrapper with evaluateHand(), compareHands(), determineWinners(), and helper functions

- [x] **1.4: Create game state manager**
  - File: `lib/poker/game-state.ts`
  - Class: `PokerGame`
  - Methods:
    - `startNewHand()` - Deal cards, post blinds
    - `handleAction(playerId, action)` - Process check/call/bet/raise/fold
    - `advanceToNextRound()` - Move from preflop → flop → turn → river
    - `determineWinner()` - Compare hands at showdown
    - `distributeChips()` - Award pot to winner
  - ✅ Completed: Full PokerGame class with game state management, action validation, betting rounds, and chip distribution

- [x] **1.5: Implement pot management**
  - File: `lib/poker/pot-manager.ts`
  - Handle main pot + side pots (for all-ins)
  - Track contributions per player
  - Calculate eligible winners for each pot
  - ✅ Completed: Full PotManager class with contribution tracking, side pot calculation, pot distribution, and split pot handling

- [x] **1.6: Write unit tests for poker engine**
  - File: `__tests__/poker-engine.test.ts`
  - Test hand evaluation accuracy
  - Test betting round transitions
  - Test pot calculations (including side pots)
  - Test winner determination
  - ✅ Completed: Installed Jest, created 47 comprehensive tests covering all poker engine components - ALL TESTS PASSING

---

### Phase 2: Database Schema & State Management 💾

Adapt MongoDB to store poker game state instead of auction state.

#### Tasks

- [x] **2.1: Design poker game schema**
  - File: `types/poker.ts` (extend from Phase 1)
  - Schema:
    ```typescript
    interface PokerGameRecord {
      gameId: string;
      players: PlayerState[];
      deck: Card[];
      communityCards: Card[];
      pot: number;
      sidePots: SidePot[];
      currentBet: number;
      bettingRound: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
      dealerPosition: number;
      actionHistory: ActionEvent[];
      handNumber: number;
      gameStatus: 'waiting' | 'in_progress' | 'ended';
      createdAt: Date;
      updatedAt: Date;
    }

    interface PlayerState {
      agentId: string;
      agentName: string;
      walletAddress: string;
      chipStack: number;
      currentBet: number;
      cards: [Card, Card] | null; // null if folded
      status: 'active' | 'folded' | 'all-in' | 'out';
      position: number;
    }
    ```
  - ✅ Completed: Schema already defined in Phase 1 with all required fields plus additional configuration (smallBlind, bigBlind, startingChips) and winner tracking fields

- [x] **2.2: Create poker database operations**
  - File: `lib/poker-db.ts`
  - Functions:
    - `createPokerGame(gameId, players)`
    - `getPokerGame(gameId)`
    - `updateGameState(gameId, updates)`
    - `addActionToHistory(gameId, action)`
    - `endGame(gameId, winnerId, finalState)`
    - `getGameHistory(gameId)` - All hands played
  - ✅ Completed: Full poker database operations with CRUD, queries, hand result tracking, and utility functions

- [x] **2.3: Create MongoDB indexes**
  - Index on `gameId` (primary lookup)
  - Index on `players.agentId` (agent game history)
  - Index on `gameStatus` (active games query)
  - ✅ Completed: Created index management functions in poker-db.ts with unique gameId index, agent lookup, status queries, and compound indexes

- [x] **2.4: Migration strategy**
  - Decide: New collection `pokerGames` or rename `bidRecords`?
  - Document migration approach in this file
  - Ensure backward compatibility if needed
  - ✅ Completed: **Decision: Full Replacement with new collection**
    - Created new `pokerGames` collection (separate from bidding `bids` collection)
    - Created new `handResults` collection for hand history
    - Old bidding code will be removed as we build poker features
    - No backward compatibility needed (user chose full replacement)
    - Migration approach: Clean slate - start fresh with poker-specific schema

---

### Phase 3: Payment Integration (x402 Poker Betting) 💰

Adapt x402 payments for poker actions: blinds, bets, calls, raises.

#### Tasks

- [x] **3.1: Update x402 configuration**
  - File: `lib/x402-poker-config.ts`
  - Define payment schemes for:
    - Small blind (fixed amount)
    - Big blind (fixed amount)
    - Bet/Raise (variable amount)
    - Call (match current bet)
  - ✅ Completed: Comprehensive x402 poker config with payment calculation, validation, blind handling, minimum bet/raise logic, and payment requirements builder

- [x] **3.2: Create poker action endpoint**
  - File: `app/api/poker/[gameId]/action/route.ts`
  - Actions: `check`, `call`, `bet`, `raise`, `fold`
  - Payment required for: `call`, `bet`, `raise`
  - No payment for: `check`, `fold`
  - Headers:
    - `X-PAYMENT`: EIP-3009 authorization (for paid actions)
    - `X-AGENT-ID`: Player identifier
    - `X-ACTION`: Action type
    - `X-AMOUNT`: Bet/raise amount
  - Flow:
    1. Validate action is legal (player's turn, sufficient chips)
    2. If payment required: Verify x402 payment
    3. Update game state
    4. Settle payment to pot (escrow on server)
    5. Broadcast SSE event
    6. If betting round complete: Advance to next round
    7. If hand complete: Determine winner & payout
  - ✅ Completed: Full poker action endpoint with x402 integration, payment verification, settlement lock, game state updates, and event broadcasting

- [x] **3.3: Implement pot escrow**
  - File: `lib/poker/pot-escrow.ts`
  - Server wallet holds all bets during hand
  - Track pot balance separately from server operational funds
  - Ensure atomic payout to winner
  - ✅ Completed: Full escrow system with in-memory tracking, pot locks, contribution recording, payout operations, balance validation, and escrow summary utilities

- [x] **3.4: Create payout mechanism**
  - File: `lib/poker/payout.ts`
  - Function: `payoutWinner(gameId, winnerId, amount)`
  - Transfer USDC from server wallet to winner's wallet
  - Handle split pots (multiple winners with same hand)
  - Broadcast payout event via SSE
  - ✅ Completed: Comprehensive payout system with winner determination, single/split pot payouts, hand completion, refund operations, game-over detection, and event broadcasting

- [x] **3.5: Handle blinds as forced payments**
  - Approach A: Agents automatically pay blinds via x402 when hand starts
  - Approach B: Server deducts blinds from tracked chip stacks (no blockchain tx)
  - **Decision**: User chose Approach A (on-chain blind payments)
  - ✅ Completed: Created blind payment endpoint (/api/poker/[gameId]/blind), blind manager with tracking/coordination, supports both on-chain (via x402) and offline modes

- [x] **3.6: Settlement lock for concurrent actions**
  - Extend existing settlement lock pattern
  - Ensure only one action settles at a time per game
  - Prevent nonce conflicts
  - ✅ Completed: Created centralized settlement lock utility (lib/poker/settlement-lock.ts) with withSettlementLock(), lock metadata tracking, timeout handling, and statistics. Updated all payment endpoints (action, blind, payout) to use the shared utility.

---

### Phase 4: Intelligent Poker Agents 🤖

Adapt the AI agents to play poker with strategic decision-making.

#### Tasks

- [x] **4.1: Design agent tool interface**
  - File: `agents/shared/poker-tools.ts`
  - Tools:
    - `get-game-state`: Returns visible game info (own cards, community cards, pot, stacks, current bet)
    - `check`: Pass action (only valid if no bet to call)
    - `call`: Match current bet (requires x402 payment)
    - `bet`: Initiate bet (requires x402 payment)
    - `raise`: Increase current bet (requires x402 payment)
    - `fold`: Forfeit hand (no payment)
  - Each tool returns success/failure + updated game state
  - ✅ Completed: Created comprehensive poker tools with LlamaIndex FunctionTool definitions. Includes createPokerTools() factory function, proper TypeScript interfaces, x402 payment integration for paid actions, event emission for observability, and detailed tool descriptions for the AI agent.

- [x] **4.2: Implement `get-game-state` tool**
  - Fetch current game state from server
  - Filter to show only information agent should know:
    - Own hole cards (private)
    - Community cards (public)
    - Pot size (public)
    - Player stacks (public)
    - Current bet to call (public)
    - Betting history this round (public)
  - Hide opponent's hole cards
  - ✅ Completed: Created server endpoint at app/api/poker/[gameId]/state/route.ts that returns filtered game state. Includes player's hole cards, community cards, pot, chip stacks, current bets, legal actions, position info, pot odds calculation, and minimum raise. Opponent hole cards are hidden (set to null). Provides comprehensive game context for AI decision-making.

- [x] **4.3: Implement betting action tools**
  - Tools: `check`, `call`, `bet`, `raise`, `fold`
  - Each tool:
    1. Validates action is legal
    2. If payment needed: Uses x402-axios to create payment
    3. Sends request to `/api/poker/[gameId]/action`
    4. Returns result + updated game state
  - ✅ Completed: All betting action tools were implemented in Task 4.1 (agents/shared/poker-tools.ts). Tools correctly use regular axios for free actions (check, fold) and x402-enabled axios for paid actions (call, bet, raise). All send requests to the action endpoint created in Task 3.2. Server-side validation handles action legality. Tools return JSON stringified results with success/error states.

- [x] **4.4: Create poker strategy prompt**
  - File: `agents/shared/poker-system-prompt.ts`
  - System prompt for Claude:
    - Explain poker rules (Texas Hold'em)
    - Explain hand rankings
    - Explain pot odds and expected value
    - Encourage strategic thinking (position, stack sizes, opponent patterns)
    - Allow for bluffing and deception
    - Define agent's playing style (tight-aggressive, loose-passive, etc.)
  - ✅ Completed: Created comprehensive 296-line poker strategy prompt with 10 major sections including Texas Hold'em rules, hand rankings, mathematical concepts (pot odds, EV, outs), strategic thinking (position, hand selection, stack sizes, opponent patterns, bluffing), playing style personalities (tight-aggressive, loose-aggressive, tight-passive, loose-passive), critical execution requirements, decision-making process with 6 steps, and 4 example scenarios. Includes createPokerStrategyPrompt() function that personalizes prompt based on agent personality, and POKER_PERSONALITIES constants for different playing styles.

- [x] **4.5: Implement poker agent class**
  - File: `agents/shared/poker-agent.ts`
  - Class: `PokerAgent`
  - Based on `IntelligentBiddingAgent` structure
  - Main loop:
    1. Poll game state (every 2-3 seconds)
    2. If agent's turn: Invoke ReActAgent to decide action
    3. Execute action via tool
    4. Monitor chip stack changes
  - Handle game-over condition
  - ✅ Completed: Created PokerAgent class (368 lines) with complete poker agent implementation. Includes wallet client setup, x402 payment integration, LlamaIndex agent creation with poker tools, polling mechanism (default 2s interval, configurable), game state fetching, turn detection, AI decision-making with strategy prompt, chip stack monitoring, event emission for observability, and graceful game-over handling. Agent creates fresh LlamaIndex instance for each decision to avoid cached tool responses.

- [x] **4.6: Create agent instances**
  - File: `agents/pokerAgentA.ts`
  - File: `agents/pokerAgentB.ts`
  - Load config from environment:
    - Starting chip stack
    - Playing style personality
    - Risk tolerance
  - Start agent and connect to game
  - ✅ Completed: Created pokerAgentA.ts and pokerAgentB.ts (58 lines each) that load configuration from environment variables, instantiate PokerAgent class with personality settings, and start playing. Agent A defaults to TIGHT_AGGRESSIVE style, Agent B defaults to LOOSE_AGGRESSIVE style. Added npm scripts "poker:a" and "poker:b" to package.json. Updated agents/.env.example with poker configuration variables (private keys, names, playing styles, game ID, polling interval).

- [x] **4.7: Add thinking/reflection broadcasts**
  - Before each action: Agent broadcasts "thinking" event (strategy reasoning)
  - After each action: Agent broadcasts "reflection" event (outcome analysis)
  - Integrate with SSE system for UI display
  - ✅ Completed: Enhanced poker-agent.ts (now 437 lines) with thinking and reflection broadcasts. Agent now emits 'agent_thinking' before decisions, 'agent_decision_complete' with AI reasoning, and new 'agent_reflection' after actions with outcome analysis. Created generateReflection() method that uses LLM to generate brief (1-2 sentence) reflections on actions taken. Created event emit endpoint at app/api/events/[gameId]/emit/route.ts for poker agents to post events to the event system.

- [x] **4.8: Update environment variables**
  - File: `agents/.env.example`
  - Add poker-specific configs:
    ```bash
    POKER_GAME_ID=game-001
    AGENT_A_STARTING_CHIPS=1000
    AGENT_B_STARTING_CHIPS=1000
    SMALL_BLIND=5
    BIG_BLIND=10
    AGENT_A_STYLE=tight-aggressive
    AGENT_B_STYLE=loose-passive
    ```
  - ✅ Completed: Added poker configuration variables to all .env files. Updated agents/.env and agents/.env.example with POKER_GAME_ID, POKER_POLLING_INTERVAL, POKER_AGENT_A_STYLE, POKER_AGENT_B_STYLE. Added server-side poker configuration to .env.local and .env.example with STARTING_CHIPS_USDC=1000, SMALL_BLIND_USDC=5, BIG_BLIND_USDC=10 (matching what x402-poker-config.ts expects). All environment variables now properly configured for poker game initialization.

---

### Phase 5: Real-Time Event System 📡

Adapt SSE streaming for poker events (deal, bet, fold, showdown).

#### Tasks

- [x] **5.1: Define poker event types**
  - File: `lib/poker-events.ts`
  - Event types:
    - `hand_started`: New hand dealt
    - `cards_dealt`: Community cards revealed (flop, turn, river)
    - `thinking`: Agent analyzing situation
    - `action_taken`: Player check/call/bet/raise/fold
    - `betting_round_complete`: Move to next round
    - `showdown`: Players reveal cards
    - `hand_complete`: Winner determined, chips awarded
    - `game_ended`: One player out of chips
  - ✅ Completed: Created comprehensive poker-events.ts with 11 event types, TypeScript interfaces, helper functions, SSE formatting utilities, and validation

- [x] **5.2: Update event broadcaster**
  - File: `lib/events.ts` (extend existing)
  - Add poker-specific event emission
  - Namespace by `gameId` instead of `basename`
  - ✅ Completed: Added storePokerEvent, broadcastPokerEvent, emitPokerEvent to lib/events.ts. Created storePokerEvent, getPokerEventsSince, getAllPokerEvents, createPokerEventIndexes in lib/db.ts. Maintains backward compatibility with auction events.

- [x] **5.3: Create poker SSE endpoint**
  - File: `app/api/poker/events/[gameId]/route.ts` (changed from SSE to polling)
  - Similar to existing `/api/stream/[basename]/route.ts`
  - Subscribe to poker events for specific game
  - Send Server-Sent Events to connected clients
  - ✅ Completed: Created polling endpoint at app/api/poker/events/[gameId]/route.ts. Uses 1-second polling instead of SSE (simpler, adequate for game pace). Returns events since last sequence number.

- [x] **5.4: Integrate event broadcasts in game flow**
  - In poker action endpoint: Emit events after each action
  - In game engine: Emit events when advancing rounds
  - In payout logic: Emit winner/payout events
  - ✅ Completed: Updated app/api/poker/[gameId]/action/route.ts (action_taken events), lib/poker/payout.ts (hand_complete, game_ended events), app/api/poker/[gameId]/blind/route.ts (blind_posted events). Agents emit agent_thinking, agent_decision_complete, agent_reflection via app/api/events/[gameId]/emit/route.ts

---

### Phase 6: Frontend Poker UI 🎨

Build a real-time poker table interface to visualize the game.

#### Tasks

- [x] **6.1: Create poker game page**
  - File: `app/poker/[gameId]/page.tsx`
  - Route: `/poker/game-001`
  - Layout: Poker table view (visual representation)
  - ✅ Completed: Created comprehensive poker game page with event polling, game state management, header display, player status bar, community cards, and iMessage-style event feed

- [x] **6.2: Design poker table component**
  - File: `components/PokerTable.tsx` (integrated into page)
  - Visual elements:
    - Two player positions (Agent A, Agent B)
    - Community cards (flop, turn, river)
    - Pot display
    - Current bet indicator
    - Dealer button position
  - ✅ Completed: Poker table elements integrated into app/poker/[gameId]/page.tsx. Shows two players with color-coded avatars, community cards display, pot in header, current bets per player, and dealer position in hand_started events

- [x] **6.3: Create player card component**
  - File: `components/PlayerCard.tsx` (integrated into page)
  - Shows:
    - Agent name
    - Chip stack
    - Current bet this round
    - Status (active, folded, all-in)
    - Hole cards (revealed at showdown or for debugging)
  - ✅ Completed: Player information integrated into page status bar. Shows agent name, chip stack, current bet, status, and hole cards (TV poker style - always visible with suit symbols ♠♥♦♣)

- [x] **6.4: Create action history feed**
  - File: `components/ActionHistory.tsx` (integrated into page)
  - iMessage-style chat (similar to current auction UI)
  - Show:
    - Thinking bubbles (agent's reasoning)
    - Action announcements ("Agent A raises to 50")
    - Betting round transitions ("Flop dealt: 7♠ K♦ 2♣")
    - Hand results ("Agent B wins with pair of Kings")
  - ✅ Completed: Full iMessage-style event feed integrated into page. Renders all poker events including agent_thinking (thinking bubbles), action_taken (bet/raise/call/fold), cards_dealt (betting round transitions), hand_complete (winner announcements), game_ended, blind_posted, agent_reflection, and agent_decision_complete

- [x] **6.5: Integrate SSE for live updates**
  - Connect to `/api/poker/events/[gameId]` (polling, not SSE)
  - Update UI components on each event
  - Animate card dealing, chip movements, action highlights
  - ✅ Completed: Integrated 1-second polling to /api/poker/events/[gameId]. Updates game state from events (pot, chips, community cards, betting round). Auto-scrolls to latest events. Uses polling instead of SSE for simplicity.

- [ ] **6.6: Add hand history viewer**
  - Component: `HandHistory.tsx`
  - Show past hands (from MongoDB)
  - Display: Starting stacks → actions → showdown → winner
  - ⏸️ Not implemented: Separate feature to show historical hand data from MongoDB

- [x] **6.7: Style poker table**
  - Use Tailwind CSS (existing in project)
  - Poker table aesthetic (green felt, card shadows)
  - Maintain grayscale theme if desired, or go full color
  - ✅ Completed: Styled with Tailwind CSS using grayscale theme consistent with auction page. White playing cards with proper suit colors (red/black), card shadows, rounded corners, responsive layout

---

### Phase 7: Game Flow & Orchestration 🎮

Coordinate the complete poker game from start to finish.

#### Tasks

- [x] **7.1: Create game initialization endpoint**
  - File: `app/api/poker/create/route.ts`
  - POST endpoint to start new game
  - Parameters: `agentAId`, `agentBId`, `agentAAddress`, `agentBAddress`, optional `gameId`, `smallBlind`, `bigBlind`
  - Creates game in MongoDB
  - Returns `gameId`
  - ✅ Completed: Created POST endpoint that queries real USDC wallet balances, validates minimum requirements, creates game with actual balances as starting chips, returns gameId and player info with URL to game page

- [x] **7.2: Implement hand lifecycle manager**
  - File: `lib/poker/hand-manager.ts`
  - Functions:
    - `startNewHand(gameId)` - Reset for new hand (rotate dealer, post blinds, deal cards)
    - `checkBettingComplete(gameId)` - Determine if round is done
    - `advanceToNextRound(gameId)` - Deal flop/turn/river
    - `initiateShowdown(gameId)` - Compare hands
    - `checkGameOver(gameId)` - See if player is out of chips
  - ✅ Completed: Created comprehensive hand lifecycle manager (301 lines) with all 5 required functions. Handles dealer rotation, card dealing with hole cards broadcast, betting round completion detection, community card dealing (flop/turn/river), showdown initiation with payout integration, and game-over detection. Broadcasts all appropriate events (hand_started with hole cards, cards_dealt, betting_round_complete, showdown)

- [x] **7.3: Build automatic game progression**
  - Server-side logic that:
    - Monitors when all players have acted in a betting round
    - Automatically advances to next round (deal community cards)
    - Triggers showdown when betting is complete
    - Starts new hand after previous hand ends
    - Ends game when one player has all chips
  - ✅ Completed: Created game-orchestrator.ts (168 lines) with progressGameIfReady() function that automatically checks game state after each action and progresses accordingly. Integrated into action endpoint to auto-advance betting rounds, trigger showdown after river, start new hands after completion, and detect game over. Also created initializeGame() to start first hand when game is created. Handles all edge cases including all players folding.

- [x] **7.4: Implement turn management**
  - Track whose turn it is
  - Enforce turn order (small blind → big blind → dealer)
  - Timeout handling: If agent doesn't act within 30s, auto-fold
  - Broadcast "action required" events to prompt agents

- [x] **7.5: Create game monitoring dashboard**
  - File: `app/poker/admin/page.tsx`
  - Show all active games
  - Allow manual game control (pause, reset, end)
  - Useful for debugging

---

### Phase 8: Error Handling & Edge Cases 🛡️

Handle poker-specific edge cases and error scenarios.

#### Tasks

- [x] **8.1: Implement all-in logic** ✅
  - Allow player to bet all remaining chips
  - Create side pots for all-in situations
  - Handle multiple all-ins in same hand
  - Distribute side pots correctly at showdown

- [x] **8.2: Handle disconnections** ✅
  - If agent disconnects: Auto-fold after timeout
  - If agent reconnects: Resume from current state
  - Persist game state to survive server restarts

- [x] **8.3: Payment failure handling** ✅
  - If x402 payment fails:
    - Do not advance game state
    - Return error to agent
    - Allow retry
  - If agent runs out of USDC: Mark as out of game

- [x] **8.4: Validate all actions** ✅
  - Check player has sufficient chips for bet/raise
  - Check it's player's turn
  - Check action is valid for current bet (can't check if bet exists)
  - Return descriptive errors for invalid actions

- [x] **8.5: Handle showdown ties** ✅
  - If multiple players have same hand: Split pot evenly
  - Handle odd chip (goes to player closest to dealer)

- [x] **8.6: Add comprehensive logging** ✅
  - Log every action to console with gameId prefix
  - Log payment verifications
  - Log pot calculations
  - Log winner determinations
  - Useful for debugging disputes

---

### Phase 9: Testing & Validation ✅

Ensure the poker system works correctly end-to-end.

#### Tasks

- [ ] **9.1: Manual testing checklist**
  - Create game with two agents
  - Agents play full hand (preflop → showdown)
  - Verify pot calculations
  - Verify winner determination
  - Verify chip stack updates
  - Verify blockchain transactions (Basescan)
  - Test multiple consecutive hands

- [ ] **9.2: Test specific poker scenarios**
  - All-in situations
  - Side pot calculations
  - Multiple players folding
  - Showdown with multiple players
  - Split pots (ties)
  - Agent running out of chips (game over)

- [ ] **9.3: Test payment scenarios**
  - Agent successfully pays blind
  - Agent successfully calls bet
  - Agent successfully raises
  - Agent payment fails (insufficient USDC)
  - Server correctly escrows bets
  - Server correctly pays out winner

- [ ] **9.4: Test AI agent behavior**
  - Agent makes reasonable decisions (doesn't always fold)
  - Agent considers pot odds
  - Agent adjusts to opponent's playstyle
  - Agent thinking is insightful (not random)

- [ ] **9.5: Load testing**
  - Multiple simultaneous games
  - Rapid betting (settlement lock works)
  - Long-running games (memory leaks?)

- [ ] **9.6: Integration tests**
  - File: `__tests__/poker-integration.test.ts`
  - Test full hand flow programmatically
  - Mock x402 payments
  - Verify database state after each action

---

### Phase 10: Documentation & Polish ✨

Finalize documentation and prepare for demo/deployment.

#### Tasks

- [ ] **10.1: Update README**
  - Add poker game instructions
  - Update setup guide for poker mode
  - Add screenshots of poker UI
  - Link to new docs

- [ ] **10.2: Create poker-specific guide**
  - File: `POKER_GUIDE.md`
  - Explain how the poker game works
  - How to start a game
  - How agents make decisions
  - Game rules and betting structure

- [ ] **10.3: Update CLAUDE.md**
  - Add poker architecture section
  - Document new file structure
  - Update development commands
  - Add poker testing workflow

- [ ] **10.4: Create demo script**
  - File: `POKER_DEMO.md`
  - Step-by-step demo flow
  - Expected outcomes
  - How to explain the project

- [ ] **10.5: Add npm scripts**
  - Update `package.json`:
    ```json
    "scripts": {
      "poker:server": "npm run dev",
      "poker:agent:a": "tsx agents/pokerAgentA.ts",
      "poker:agent:b": "tsx agents/pokerAgentB.ts",
      "poker:create-game": "tsx scripts/create-poker-game.ts"
    }
    ```

- [ ] **10.6: Record demo video**
  - Screen recording of full poker game
  - Show UI, agents thinking, betting actions
  - Show blockchain transactions
  - Narrate the strategy decisions

- [ ] **10.7: Polish UI aesthetics**
  - Smooth animations (card dealing, chip movements)
  - Clear visual feedback for actions
  - Mobile-responsive layout
  - Accessibility (keyboard navigation, screen readers)

---

## 🧪 Testing Strategy

### Unit Tests
- Hand evaluator accuracy (all possible hands)
- Pot calculation logic (main pot + side pots)
- Game state transitions
- Action validation

### Integration Tests
- Full hand flow (start → showdown)
- Payment verification and settlement
- Database read/write operations
- SSE event broadcasting

### End-to-End Tests
- Two agents play complete game
- Winner receives payout
- New hand starts automatically
- Game ends when player busts

### Manual Testing
- Play test multiple games
- Verify UI updates in real-time
- Check Basescan for correct transactions
- Validate agent decision quality

---

## 🚀 Deployment Considerations

### Environment Variables
- [ ] Document all required env vars
- [ ] Create `.env.poker.example`
- [ ] Ensure CDP wallet has sufficient USDC for payouts

### Database
- [ ] Set up production MongoDB cluster
- [ ] Configure indexes
- [ ] Plan backup strategy

### Monitoring
- [ ] Add logging for poker-specific events
- [ ] Monitor pot escrow balance
- [ ] Alert on payment failures
- [ ] Track agent decision quality metrics

### Security
- [ ] Audit pot escrow logic (prevent theft)
- [ ] Rate limit poker action endpoint
- [ ] Validate all agent actions server-side
- [ ] Ensure private keys are never exposed

---

## 🎯 Success Criteria

The poker system is complete when:

✅ Two AI agents can play a full game of Texas Hold'em
✅ All bets and calls use x402 payments with USDC
✅ Hand evaluation and winner determination are accurate
✅ Pot is correctly calculated and paid out on-chain
✅ Real-time UI shows the game state and agent reasoning
✅ Agents make strategic decisions (not random)
✅ Game handles edge cases (all-ins, split pots, disconnections)
✅ Multiple consecutive hands work correctly
✅ Game ends when one player runs out of chips

---

## 📚 Reference Materials

### Poker Rules
- [Texas Hold'em Rules](https://www.pokernews.com/poker-rules/texas-holdem.htm)
- [Hand Rankings](https://www.cardschat.com/poker/strategy/poker-hands/)
- [Pot Odds Calculator](https://www.cardschat.com/poker/tools/odds-calculator/)

### Libraries to Consider
- **Hand Evaluation**: `pokersolver`, `phe` (Poker Hand Evaluator)
- **Shuffling**: Use `crypto.getRandomValues()` for cryptographic randomness
- **UI**: Existing Tailwind + custom poker table components

### x402 Integration
- Use Context7 MCP when debugging payment issues
- Reference existing bidding endpoints for x402 patterns

---

## 🔄 Migration from Bidding to Poker

### Option A: Parallel Systems (Recommended)
- Keep existing auction code
- Add poker as separate feature
- Allows switching between game modes

### Option B: Full Replacement
- Archive bidding code to git branch
- Replace with poker system
- Simpler codebase, but loses original functionality

**Recommendation**: Go with Option A initially, decide later if you want one or both long-term.

---

## 🤝 Collaboration

As you work through this plan:
- Mark tasks as done with `[x]` checkboxes
- Add notes/blockers in-line under tasks
- Update this document if scope changes
- Reference task numbers when asking for help (e.g., "Help with task 3.2")

**Example**:
```markdown
- [x] **3.2: Create poker action endpoint**
  - ✅ Completed on 2025-01-15
  - Note: Added extra validation for bet sizing
  - Blocker resolved: Settlement lock working correctly
```

---

## 🎉 Let's Build This!

This is an ambitious and exciting project. The combination of AI strategy, real economic stakes, and blockchain payments makes this a cutting-edge demonstration of autonomous agents.

**Estimated Timeline**: 2-3 weeks (depending on experience level)

**Next Steps**:
1. Review this plan
2. Set up project structure
3. Start with Phase 1 (Poker Engine)
4. Build iteratively, testing each phase

**Questions?** Feel free to ask for help on any specific task. I can generate code, explain concepts, or debug issues as you go.

Good luck! 🃏♠️♥️♣️♦️
