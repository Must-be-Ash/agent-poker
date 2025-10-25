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

- [ ] **1.1: Create poker types**
  - File: `types/poker.ts`
  - Define: `Card`, `HandRank`, `PokerAction`, `Player`, `GameState`
  - Include betting round states: `preflop`, `flop`, `turn`, `river`

- [ ] **1.2: Implement card utilities**
  - File: `lib/poker/cards.ts`
  - Functions: `createDeck()`, `shuffleDeck()`, `dealCards()`
  - Use cryptographically secure randomization

- [ ] **1.3: Implement hand evaluator**
  - File: `lib/poker/hand-evaluator.ts`
  - Function: `evaluateHand(cards: Card[]): HandRank`
  - Rankings: Royal Flush → High Card
  - Return comparable strength values
  - **Recommendation**: Use existing library like `pokersolver` or `phe` (Poker Hand Evaluator)

- [ ] **1.4: Create game state manager**
  - File: `lib/poker/game-state.ts`
  - Class: `PokerGame`
  - Methods:
    - `startNewHand()` - Deal cards, post blinds
    - `handleAction(playerId, action)` - Process check/call/bet/raise/fold
    - `advanceToNextRound()` - Move from preflop → flop → turn → river
    - `determineWinner()` - Compare hands at showdown
    - `distributeChips()` - Award pot to winner

- [ ] **1.5: Implement pot management**
  - File: `lib/poker/pot-manager.ts`
  - Handle main pot + side pots (for all-ins)
  - Track contributions per player
  - Calculate eligible winners for each pot

- [ ] **1.6: Write unit tests for poker engine**
  - File: `__tests__/poker-engine.test.ts`
  - Test hand evaluation accuracy
  - Test betting round transitions
  - Test pot calculations (including side pots)
  - Test winner determination

---

### Phase 2: Database Schema & State Management 💾

Adapt MongoDB to store poker game state instead of auction state.

#### Tasks

- [ ] **2.1: Design poker game schema**
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

- [ ] **2.2: Create poker database operations**
  - File: `lib/poker-db.ts`
  - Functions:
    - `createPokerGame(gameId, players)`
    - `getPokerGame(gameId)`
    - `updateGameState(gameId, updates)`
    - `addActionToHistory(gameId, action)`
    - `endGame(gameId, winnerId, finalState)`
    - `getGameHistory(gameId)` - All hands played

- [ ] **2.3: Create MongoDB indexes**
  - Index on `gameId` (primary lookup)
  - Index on `players.agentId` (agent game history)
  - Index on `gameStatus` (active games query)

- [ ] **2.4: Migration strategy**
  - Decide: New collection `pokerGames` or rename `bidRecords`?
  - Document migration approach in this file
  - Ensure backward compatibility if needed

---

### Phase 3: Payment Integration (x402 Poker Betting) 💰

Adapt x402 payments for poker actions: blinds, bets, calls, raises.

#### Tasks

- [ ] **3.1: Update x402 configuration**
  - File: `lib/x402-poker-config.ts`
  - Define payment schemes for:
    - Small blind (fixed amount)
    - Big blind (fixed amount)
    - Bet/Raise (variable amount)
    - Call (match current bet)

- [ ] **3.2: Create poker action endpoint**
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

- [ ] **3.3: Implement pot escrow**
  - File: `lib/poker/pot-escrow.ts`
  - Server wallet holds all bets during hand
  - Track pot balance separately from server operational funds
  - Ensure atomic payout to winner

- [ ] **3.4: Create payout mechanism**
  - File: `lib/poker/payout.ts`
  - Function: `payoutWinner(gameId, winnerId, amount)`
  - Transfer USDC from server wallet to winner's wallet
  - Handle split pots (multiple winners with same hand)
  - Broadcast payout event via SSE

- [ ] **3.5: Handle blinds as forced payments**
  - Approach A: Agents automatically pay blinds via x402 when hand starts
  - Approach B: Server deducts blinds from tracked chip stacks (no blockchain tx)
  - **Decision needed**: Which approach? (Recommend B for efficiency)

- [ ] **3.6: Settlement lock for concurrent actions**
  - Extend existing settlement lock pattern
  - Ensure only one action settles at a time per game
  - Prevent nonce conflicts

---

### Phase 4: Intelligent Poker Agents 🤖

Adapt the AI agents to play poker with strategic decision-making.

#### Tasks

- [ ] **4.1: Design agent tool interface**
  - File: `agents/shared/poker-tools.ts`
  - Tools:
    - `get-game-state`: Returns visible game info (own cards, community cards, pot, stacks, current bet)
    - `check`: Pass action (only valid if no bet to call)
    - `call`: Match current bet (requires x402 payment)
    - `bet`: Initiate bet (requires x402 payment)
    - `raise`: Increase current bet (requires x402 payment)
    - `fold`: Forfeit hand (no payment)
  - Each tool returns success/failure + updated game state

- [ ] **4.2: Implement `get-game-state` tool**
  - Fetch current game state from server
  - Filter to show only information agent should know:
    - Own hole cards (private)
    - Community cards (public)
    - Pot size (public)
    - Player stacks (public)
    - Current bet to call (public)
    - Betting history this round (public)
  - Hide opponent's hole cards

- [ ] **4.3: Implement betting action tools**
  - Tools: `check`, `call`, `bet`, `raise`, `fold`
  - Each tool:
    1. Validates action is legal
    2. If payment needed: Uses x402-axios to create payment
    3. Sends request to `/api/poker/[gameId]/action`
    4. Returns result + updated game state

- [ ] **4.4: Create poker strategy prompt**
  - File: `agents/shared/poker-system-prompt.ts`
  - System prompt for Claude:
    - Explain poker rules (Texas Hold'em)
    - Explain hand rankings
    - Explain pot odds and expected value
    - Encourage strategic thinking (position, stack sizes, opponent patterns)
    - Allow for bluffing and deception
    - Define agent's playing style (tight-aggressive, loose-passive, etc.)

- [ ] **4.5: Implement poker agent class**
  - File: `agents/shared/poker-agent.ts`
  - Class: `PokerAgent`
  - Based on `IntelligentBiddingAgent` structure
  - Main loop:
    1. Poll game state (every 2-3 seconds)
    2. If agent's turn: Invoke ReActAgent to decide action
    3. Execute action via tool
    4. Monitor chip stack changes
  - Handle game-over condition

- [ ] **4.6: Create agent instances**
  - File: `agents/pokerAgentA.ts`
  - File: `agents/pokerAgentB.ts`
  - Load config from environment:
    - Starting chip stack
    - Playing style personality
    - Risk tolerance
  - Start agent and connect to game

- [ ] **4.7: Add thinking/reflection broadcasts**
  - Before each action: Agent broadcasts "thinking" event (strategy reasoning)
  - After each action: Agent broadcasts "reflection" event (outcome analysis)
  - Integrate with SSE system for UI display

- [ ] **4.8: Update environment variables**
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

---

### Phase 5: Real-Time Event System 📡

Adapt SSE streaming for poker events (deal, bet, fold, showdown).

#### Tasks

- [ ] **5.1: Define poker event types**
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

- [ ] **5.2: Update event broadcaster**
  - File: `lib/events.ts` (extend existing)
  - Add poker-specific event emission
  - Namespace by `gameId` instead of `basename`

- [ ] **5.3: Create poker SSE endpoint**
  - File: `app/api/poker/stream/[gameId]/route.ts`
  - Similar to existing `/api/stream/[basename]/route.ts`
  - Subscribe to poker events for specific game
  - Send Server-Sent Events to connected clients

- [ ] **5.4: Integrate event broadcasts in game flow**
  - In poker action endpoint: Emit events after each action
  - In game engine: Emit events when advancing rounds
  - In payout logic: Emit winner/payout events

---

### Phase 6: Frontend Poker UI 🎨

Build a real-time poker table interface to visualize the game.

#### Tasks

- [ ] **6.1: Create poker game page**
  - File: `app/poker/[gameId]/page.tsx`
  - Route: `/poker/game-001`
  - Layout: Poker table view (visual representation)

- [ ] **6.2: Design poker table component**
  - File: `components/PokerTable.tsx`
  - Visual elements:
    - Two player positions (Agent A, Agent B)
    - Community cards (flop, turn, river)
    - Pot display
    - Current bet indicator
    - Dealer button position

- [ ] **6.3: Create player card component**
  - File: `components/PlayerCard.tsx`
  - Shows:
    - Agent name
    - Chip stack
    - Current bet this round
    - Status (active, folded, all-in)
    - Hole cards (revealed at showdown or for debugging)

- [ ] **6.4: Create action history feed**
  - File: `components/ActionHistory.tsx`
  - iMessage-style chat (similar to current auction UI)
  - Show:
    - Thinking bubbles (agent's reasoning)
    - Action announcements ("Agent A raises to 50")
    - Betting round transitions ("Flop dealt: 7♠ K♦ 2♣")
    - Hand results ("Agent B wins with pair of Kings")

- [ ] **6.5: Integrate SSE for live updates**
  - Connect to `/api/poker/stream/[gameId]`
  - Update UI components on each event
  - Animate card dealing, chip movements, action highlights

- [ ] **6.6: Add hand history viewer**
  - Component: `HandHistory.tsx`
  - Show past hands (from MongoDB)
  - Display: Starting stacks → actions → showdown → winner

- [ ] **6.7: Style poker table**
  - Use Tailwind CSS (existing in project)
  - Poker table aesthetic (green felt, card shadows)
  - Maintain grayscale theme if desired, or go full color

---

### Phase 7: Game Flow & Orchestration 🎮

Coordinate the complete poker game from start to finish.

#### Tasks

- [ ] **7.1: Create game initialization endpoint**
  - File: `app/api/poker/create/route.ts`
  - POST endpoint to start new game
  - Parameters: `agentAId`, `agentBId`, `startingChips`, `blinds`
  - Creates game in MongoDB
  - Returns `gameId`

- [ ] **7.2: Implement hand lifecycle manager**
  - File: `lib/poker/hand-manager.ts`
  - Functions:
    - `startNewHand(gameId)` - Reset for new hand (rotate dealer, post blinds, deal cards)
    - `checkBettingComplete(gameId)` - Determine if round is done
    - `advanceToNextRound(gameId)` - Deal flop/turn/river
    - `initiateShowdown(gameId)` - Compare hands
    - `checkGameOver(gameId)` - See if player is out of chips

- [ ] **7.3: Build automatic game progression**
  - Server-side logic that:
    - Monitors when all players have acted in a betting round
    - Automatically advances to next round (deal community cards)
    - Triggers showdown when betting is complete
    - Starts new hand after previous hand ends
    - Ends game when one player has all chips

- [ ] **7.4: Implement turn management**
  - Track whose turn it is
  - Enforce turn order (small blind → big blind → dealer)
  - Timeout handling: If agent doesn't act within 30s, auto-fold
  - Broadcast "action required" events to prompt agents

- [ ] **7.5: Create game monitoring dashboard**
  - File: `app/poker/admin/page.tsx`
  - Show all active games
  - Allow manual game control (pause, reset, end)
  - Useful for debugging

---

### Phase 8: Error Handling & Edge Cases 🛡️

Handle poker-specific edge cases and error scenarios.

#### Tasks

- [ ] **8.1: Implement all-in logic**
  - Allow player to bet all remaining chips
  - Create side pots for all-in situations
  - Handle multiple all-ins in same hand
  - Distribute side pots correctly at showdown

- [ ] **8.2: Handle disconnections**
  - If agent disconnects: Auto-fold after timeout
  - If agent reconnects: Resume from current state
  - Persist game state to survive server restarts

- [ ] **8.3: Payment failure handling**
  - If x402 payment fails:
    - Do not advance game state
    - Return error to agent
    - Allow retry
  - If agent runs out of USDC: Mark as out of game

- [ ] **8.4: Validate all actions**
  - Check player has sufficient chips for bet/raise
  - Check it's player's turn
  - Check action is valid for current bet (can't check if bet exists)
  - Return descriptive errors for invalid actions

- [ ] **8.5: Handle showdown ties**
  - If multiple players have same hand: Split pot evenly
  - Handle odd chip (goes to player closest to dealer)

- [ ] **8.6: Add comprehensive logging**
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
