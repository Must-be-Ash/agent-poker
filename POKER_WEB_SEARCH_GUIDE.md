# 🧠 Poker Agent Web Search Integration Guide
## Autonomous Learning through Firecrawl + x402

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Vision: Self-Learning Poker Agents](#the-vision)
3. [Technical Architecture](#technical-architecture)
4. [How Firecrawl + x402 Works](#how-firecrawl--x402-works)
5. [Implementation from agent-bid](#implementation-from-agent-bid)
6. [Integration Plan for Poker Agents](#integration-plan)
7. [Agent Autonomy Model](#agent-autonomy-model)
8. [Use Cases: When Agents Search](#use-cases)
9. [Expected Outcomes](#expected-outcomes)
10. [Implementation Roadmap](#implementation-roadmap)

---

## 🎯 Executive Summary

### What We're Building

**Transform poker agents from static strategy followers into dynamic, self-learning players** that research poker tactics, study famous players' strategies, and adapt their play based on real-world knowledge.

### The Technology

- **Firecrawl**: Web search API that returns structured content
- **x402 Payment Protocol**: Micropayments for API calls (pays ~$0.01 per search)
- **Integration Model**: Each agent uses their own wallet to pay for searches
- **Autonomy**: Agents decide when to search and what to learn

### The Impact

**Before Integration:**
- Agents follow pre-programmed personality guidelines (TAG, LAG, etc.)
- Static decision-making based on pot odds and hand strength
- No ability to learn new strategies or adapt beyond initial prompt

**After Integration:**
- Agents **research when uncertain**: "Should I bluff with middle pair on this board texture?"
- Agents **study famous players**: "How would Daniel Negreanu play this spot?"
- Agents **learn advanced concepts**: "What is a check-raise line with a flush draw?"
- Agents **evolve their strategy** based on research findings

---

## 🚀 The Vision: Self-Learning Poker Agents

### Current State (Static Agents)

```typescript
// Current system prompt approach
"You are a TIGHT-AGGRESSIVE player. Play few hands, but play them aggressively.
Bluff occasionally when board favors your range."
```

**Limitations:**
- ❌ Cannot adapt beyond initial instructions
- ❌ No knowledge of advanced concepts beyond system prompt
- ❌ Cannot study new strategies or player archetypes
- ❌ Static personality that never evolves

### Future State (Learning Agents)

```typescript
// Agent decides autonomously
Agent: "I have a flush draw on the flop. Should I semi-bluff here?"
Agent: *Searches web* "poker flush draw semi-bluff strategy"
Agent: *Reads results* "Top pros recommend aggressive semi-bluffing with nut flush draws"
Agent: *Applies learning* "I'll raise here to apply pressure and build pot equity"
```

**Capabilities:**
- ✅ **Research-driven decisions**: Search before making uncertain plays
- ✅ **Learn from experts**: Study how pros handle specific situations
- ✅ **Adapt strategies**: Update mental models based on findings
- ✅ **Form philosophies**: Develop unique playing styles through learning
- ✅ **Continuous improvement**: Get better with each search

---

## 🏗️ Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      POKER AGENT                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Claude AI (Sonnet 4.5)                               │  │
│  │  - Analyzes game state                                │  │
│  │  - Decides when to search                             │  │
│  │  - Formulates search queries                          │  │
│  │  - Processes search results                           │  │
│  │  - Applies learnings to decision                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  search_poker_strategy Tool                           │  │
│  │  - Formats search query                               │  │
│  │  - Calls Firecrawl API                                │  │
│  │  - Returns structured results                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
           ┌────────────────────────────────┐
           │     x402 Payment Layer         │
           │  - Wraps fetch with payment    │
           │  - Signs EIP-3009 authorization│
           │  - Handles 402 responses       │
           └────────────────────────────────┘
                            ↓
           ┌────────────────────────────────┐
           │   Firecrawl API (Base mainnet) │
           │  - Receives payment (~$0.01)   │
           │  - Executes web search         │
           │  - Returns results             │
           └────────────────────────────────┘
```

### Key Components

#### 1. **Agent Wallet**
- Each agent has their own private key
- Funds must be on **Base mainnet** (not Base Sepolia)
- Used for Firecrawl API payments (~$0.01 per search)

#### 2. **x402-fetch Wrapper**
- Wraps native `fetch()` with payment capability
- Automatically handles 402 Payment Required responses
- Signs EIP-3009 transfer authorizations
- Max payment limit: $0.50 per search (configurable)

#### 3. **Firecrawl API**
- Endpoint: `https://api.firecrawl.dev/v2/x402/search`
- Requires BOTH:
  - `Authorization: Bearer {API_KEY}` header
  - x402 USDC payment (~$0.01)
- Returns structured web search results

#### 4. **FunctionTool (LlamaIndex)**
- Exposes search capability to Claude AI
- Agent autonomously decides when to call it
- Processes results and applies to strategy

---

## 🔧 How Firecrawl + x402 Works

### The x402 Payment Protocol

**x402** is like HTTP's 402 Payment Required status, but actually implemented:

1. **Agent makes request** to Firecrawl (without payment)
2. **Server returns 402** with payment requirements
3. **x402-fetch automatically**:
   - Signs EIP-3009 transfer authorization
   - Retries request with `X-PAYMENT` header
4. **Server verifies payment** and returns search results

### Payment Flow Diagram

```
Agent                x402-fetch           Firecrawl API
  │                      │                     │
  │ fetch(query)         │                     │
  │─────────────────────>│                     │
  │                      │  POST (no payment)  │
  │                      │────────────────────>│
  │                      │                     │
  │                      │  402 + requirements │
  │                      │<────────────────────│
  │                      │                     │
  │                      │ [Signs EIP-3009]    │
  │                      │ [Creates payment]   │
  │                      │                     │
  │                      │  POST + X-PAYMENT   │
  │                      │────────────────────>│
  │                      │                     │
  │                      │  [Verifies payment] │
  │                      │  [Settles on-chain] │
  │                      │                     │
  │                      │  200 + results      │
  │  results             │<────────────────────│
  │<─────────────────────│                     │
  │                      │                     │
```

### Why This is Revolutionary

**Traditional API Calls:**
- Require API key subscriptions ($$$)
- Monthly/yearly billing
- Rate limits
- Overage charges

**x402 API Calls:**
- Pay per use (~$0.01 per search)
- No subscriptions
- Blockchain-verified payments
- Instant settlement
- **Perfect for autonomous agents with their own budgets**

---

## 💻 Implementation from agent-bid

### The Complete Code (Lines 403-514)

This is the exact implementation from `/Users/ashnouruzi/agent-bid/agents/shared/intelligent-agent.ts`:

```typescript
const searchWebTool = FunctionTool.from(
  async (input: { query: string; limit?: number }) => {
    try {
      console.log(`\n🔍 [${this.agentName}] Searching web for: "${input.query}"`);

      // Use this agent's own private key (from wallet.account) for Firecrawl payments
      const account = this.wallet.account;

      // Create wallet client for x402 payments (use Base mainnet for Firecrawl)
      const walletClient = createWalletClient({
        account,
        chain: base,  // ← IMPORTANT: Base mainnet, not Sepolia
        transport: http()
      }).extend(publicActions);

      // Wrap fetch with x402 payment handling
      const fetchWithPayment = wrapFetchWithPayment(
        fetch,
        walletClient as any,
        BigInt(0.50 * 10 ** 6) // Allow up to $0.50 USDC for search
      );

      // Emit Firecrawl 402 call event
      const basename = process.env.BASENAME_TO_AUCTION;
      if (basename) {
        await this.emitEvent(basename, 'firecrawl_402_call', {
          query: input.query,
          cost: 0.01,
          endpoint: 'https://api.firecrawl.dev/v2/x402/search',
        });
      }

      // Call Firecrawl search API (v2 endpoint requires BOTH API key + x402 payment)
      const response = await fetchWithPayment('https://api.firecrawl.dev/v2/x402/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BID_FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          query: input.query,
          limit: Math.min(input.limit || 10, 10),
          sources: ['web']
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [${this.agentName}] Firecrawl API error:`, response.status, errorText);
        return JSON.stringify({
          success: false,
          error: `Firecrawl API error: ${response.status}`,
        });
      }

      const result = await response.json();
      const articles = result.data?.web || [];

      console.log(`✅ [${this.agentName}] Found ${articles.length} results`);

      // Return simplified results
      const searchResults = articles.slice(0, 5).map((article: { title?: string; description?: string; url?: string }) => ({
        title: article.title,
        description: article.description,
        url: article.url,
      }));

      // Emit search results event with actual data
      if (basename) {
        await this.emitEvent(basename, 'firecrawl_results', {
          query: input.query,
          results: searchResults,
          totalResults: articles.length,
        });
      }

      return JSON.stringify({
        success: true,
        query: input.query,
        results: searchResults,
        totalResults: articles.length,
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [${this.agentName}] Search failed:`, errorMessage);
      return JSON.stringify({
        success: false,
        error: errorMessage,
      });
    }
  },
  {
    name: 'search_web',
    description: 'Search the web for information using Firecrawl. Use this to research the value, popularity, or market data about basenames or topics. Returns web search results with titles, descriptions, and URLs. This helps you make informed decisions about how much to budget for the auction.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g., "x402agent.base.eth value", "basename sales history")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (1-10, default 10)',
        },
      },
      required: ['query'],
    },
  }
);
```

### Key Implementation Details

#### 1. **Agent Uses Own Wallet**
```typescript
const account = this.wallet.account; // Agent's own private key
```
- Each agent pays for their own searches
- Aligns with autonomous agent model
- Agents manage their own learning budget

#### 2. **Base Mainnet for Firecrawl**
```typescript
chain: base,  // NOT base-sepolia
```
- **Critical**: Firecrawl requires Base mainnet
- Poker game uses Base Sepolia
- **Agents need USDC on BOTH chains**:
  - Base Sepolia: For poker bets/blinds
  - Base mainnet: For web searches

#### 3. **Max Payment Limit**
```typescript
BigInt(0.50 * 10 ** 6) // $0.50 max per search
```
- Safety mechanism to prevent overspending
- Typical cost is $0.01 per search
- Allows ~50 searches before hitting limit

#### 4. **Dual Authentication**
```typescript
headers: {
  'Authorization': `Bearer ${process.env.BID_FIRECRAWL_API_KEY}`,
},
```
- Requires BOTH Firecrawl API key AND x402 payment
- API key identifies the application
- Payment proves the request is legitimate

---

## 🎮 Integration Plan for Poker Agents

### Phase 1: Add Dependencies

**Install x402-fetch:**
```bash
npm install x402-fetch
```

**Update package.json:**
```json
{
  "dependencies": {
    "x402-fetch": "^latest"
  }
}
```

### Phase 2: Environment Configuration

**Add to `/agents/.env`:**
```bash
# Firecrawl API Configuration
BID_FIRECRAWL_API_KEY=fc-your-api-key-here  # Get from https://firecrawl.dev

# Base Mainnet RPC (for Firecrawl payments)
BASE_MAINNET_RPC_URL=https://mainnet.base.org  # Public RPC, or use Alchemy/Infura
```

**Get Firecrawl API Key:**
1. Visit https://firecrawl.dev
2. Sign up for free account
3. Generate API key
4. Add to `.env`

### Phase 3: Fund Agent Wallets

**Agents need USDC on TWO chains:**

#### Base Sepolia (Poker gameplay):
```bash
# Already funded for poker bets
✅ Agent-A: 0xAbF01df9428EaD5418473A7c91244826A3Af23b3
✅ Agent-B: 0xeDeE7Ee27e99953ee3E99acE79a6fbc037E31C0D
```

#### Base Mainnet (Web searches):
```bash
# NEW: Fund for Firecrawl payments
# Transfer $5-10 USDC to each agent on Base mainnet
# This allows ~500-1000 searches at $0.01 per search

# Option 1: Bridge from Sepolia to Mainnet (complex)
# Option 2: Buy USDC on Base mainnet and send to agent addresses
```

**Funding Guide:**
1. Buy USDC on Coinbase (on Base network)
2. Send to agent addresses above
3. Verify balance: https://basescan.org/address/{AGENT_ADDRESS}

### Phase 4: Create Poker Search Tool

**Create new file:** `/agents/shared/poker-search-tool.ts`

```typescript
import { FunctionTool } from 'llamaindex';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment } from 'x402-fetch';

export function createPokerSearchTool(wallet: any, agentName: string) {
  return FunctionTool.from(
    async (input: { query: string; situation?: string }) => {
      try {
        console.log(`\n🔍 [${agentName}] Searching poker strategy: "${input.query}"`);

        if (input.situation) {
          console.log(`   Situation: ${input.situation}`);
        }

        // Create wallet client for Base mainnet
        const account = wallet.account;
        const walletClient = createWalletClient({
          account,
          chain: base,
          transport: http()
        }).extend(publicActions);

        // Wrap fetch with payment
        const fetchWithPayment = wrapFetchWithPayment(
          fetch,
          walletClient as any,
          BigInt(0.50 * 10 ** 6) // $0.50 max
        );

        // Format poker-specific query
        const pokerQuery = input.query.toLowerCase().includes('poker')
          ? input.query
          : `poker ${input.query}`;

        console.log(`   Formatted query: "${pokerQuery}"`);

        // Call Firecrawl
        const response = await fetchWithPayment(
          'https://api.firecrawl.dev/v2/x402/search',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.BID_FIRECRAWL_API_KEY}`,
            },
            body: JSON.stringify({
              query: pokerQuery,
              limit: 5, // Top 5 results
              sources: ['web']
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        const articles = result.data?.web || [];

        console.log(`✅ [${agentName}] Found ${articles.length} poker strategy articles`);

        // Extract key insights
        const insights = articles.map((article: any) => ({
          source: article.title,
          strategy: article.description,
          url: article.url,
        }));

        return JSON.stringify({
          success: true,
          query: pokerQuery,
          insights,
          totalResults: articles.length,
          costUSDC: 0.01,
        });

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [${agentName}] Poker search failed:`, errorMessage);

        return JSON.stringify({
          success: false,
          error: errorMessage,
          suggestion: 'Continue with current knowledge and experience',
        });
      }
    },
    {
      name: 'search_poker_strategy',
      description: `Search the web for poker strategies, tactics, and expert advice. Use this FREELY whenever you:

- Are uncertain about the best play in a situation
- Want to learn how professional players handle specific scenarios
- Need to understand advanced concepts (e.g., "GTO strategy", "range balancing", "blocker effects")
- Want to know when to bluff vs value bet
- Need guidance on bet sizing in different situations
- Want to study famous players' playing styles (e.g., "Phil Ivey bluffing strategy")
- Are curious about optimal play for specific hand types or board textures

This tool costs ~$0.01 per search (paid from your wallet). Search as often as needed to make informed decisions. Learning is encouraged.

Examples of good queries:
- "when to bluff with middle pair on wet board"
- "how do pros play flush draws in position"
- "optimal bet sizing with strong hands"
- "Daniel Negreanu small ball strategy"
- "GTO approach to river decisions"
- "when to check-raise versus call with draws"`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Your poker strategy question or topic to research (will automatically add "poker" prefix if not included)',
          },
          situation: {
            type: 'string',
            description: 'Optional: Describe your current poker situation to get more relevant results (e.g., "I have top pair, opponent raised")',
          },
        },
        required: ['query'],
      },
    }
  );
}
```

### Phase 5: Update Poker Agent

**Modify `/agents/shared/poker-agent.ts`:**

```typescript
import { createPokerSearchTool } from './poker-search-tool';

// In createAgent() method, add search tool to tools array:
const tools = [
  ...existingTools,
  createPokerSearchTool(this.wallet, this.agentName),  // ← ADD THIS
];

return agent({
  llm: this.llm,
  tools,
});
```

### Phase 6: Update System Prompt

**Modify `/agents/shared/poker-system-prompt.ts`:**

Add new section after "CRITICAL EXECUTION REQUIREMENTS":

```typescript
# 🔍 WEB SEARCH CAPABILITY

You have access to real-time web search via the search_poker_strategy tool. USE IT FREELY.

**When to Search:**
- When facing an unfamiliar situation
- When uncertain about optimal play
- To learn advanced concepts
- To study how pros handle specific scenarios
- To validate your strategic intuition
- To discover new tactics and approaches

**Search Costs:**
- ~$0.01 per search (paid from your wallet)
- You have ~$5-10 budget = 500-1000 searches
- Search liberally - learning is valuable

**Search Strategically:**
- Search BEFORE making critical decisions
- Be specific in your queries
- Apply learnings immediately
- Build mental models from research
- Combine web knowledge with pot odds math

**Example Decision Process:**
1. Get game state
2. "I have middle pair on a wet board, opponent raised"
3. Search: "when to bluff with middle pair on wet board"
4. Read expert advice from results
5. Apply learning: "Pros recommend fold or aggressive semi-bluff, avoid passive call"
6. Execute: Fold or raise based on position/opponent

**Remember:** You're not just playing poker - you're LEARNING poker. Every search makes you better.
```

---

## 🤖 Agent Autonomy Model

### Decision Tree: When Agents Search

```
┌─────────────────────────────────────────┐
│   Agent Evaluates Game Situation        │
└─────────────┬───────────────────────────┘
              │
              ↓
     ┌────────────────────┐
     │  Is decision clear? │
     └────────┬──────┬─────┘
              │      │
          YES │      │ NO
              │      │
              ↓      ↓
    ┌─────────────┐  ┌──────────────────────┐
    │ Execute     │  │ Consider searching   │
    │ immediately │  └──────────┬───────────┘
    └─────────────┘             │
                                ↓
                   ┌──────────────────────────┐
                   │ Is this high-stakes?     │
                   │ (Large pot / Critical    │
                   │  decision point)         │
                   └────────┬────────┬────────┘
                            │        │
                        YES │        │ NO
                            │        │
                            ↓        ↓
              ┌──────────────────┐  ┌────────────────┐
              │ SEARCH WEB       │  │ Trust intuition│
              │ Get expert advice│  │ or search if   │
              └────────┬─────────┘  │ curious        │
                       │            └────────────────┘
                       ↓
         ┌─────────────────────────────┐
         │ Process results             │
         │ Update mental model         │
         │ Apply learning to decision  │
         └─────────────┬───────────────┘
                       │
                       ↓
         ┌─────────────────────────────┐
         │ Execute informed action     │
         └─────────────────────────────┘
```

### Autonomy Principles

**1. No Search Quotas**
- Agents decide how often to search
- No artificial limits or cooldowns
- Cost ($0.01/search) is natural rate limiter

**2. Contextual Decisions**
- Agents weigh search cost vs decision value
- $100 pot decision → worth $0.01 search
- $5 pot decision → maybe skip search

**3. Learning Accumulation**
- Agents remember past search results (via conversation memory)
- Build internal knowledge base over time
- Search less as they learn more

**4. Strategic Variety**
- Different agents may search at different rates
- TAG players might search less (conservative)
- LAG players might search more (experimental)

---

## 🎯 Use Cases: When Agents Search

### Scenario 1: Bluff Detection

**Game State:**
```
Your hand: K♣Q♥ (high cards, no pair)
Board: A♠9♦4♣2♥ (paired board, possible flush draw)
Pot: $80
Opponent bet: $60 (large bet)
Your chips: $120
```

**Agent Decision Process:**

```
Agent: "Opponent made a large bet on this board. Do they have the ace?"

Agent: *Calls search_poker_strategy*
Query: "how to detect bluffs in poker large bets on ace high boards"

Search Results:
1. "When opponents over-bet on ace-high boards, they're often bluffing
    or have a weak ace. Strong aces (AK, AQ) usually bet smaller for value."
2. "Bluff frequency increases on dry boards. Look for timing tells and
    bet sizing inconsistencies."
3. "Phil Ivey on bluff catching: Pay attention to opponent's story.
    Does their betting pattern make sense?"

Agent: "Based on research, large bets on ace-high boards are often bluffs.
        I'll call with king-high to catch the bluff."

Action: CALL $60
```

**Outcome:** Agent learned bluff-catching principle and applied it.

---

### Scenario 2: Semi-Bluffing with Draws

**Game State:**
```
Your hand: J♠10♠ (suited connectors)
Board (flop): K♠7♠2♣ (flush draw + straight potential)
Pot: $30
Opponent: Checked
Your chips: $85
```

**Agent Decision Process:**

```
Agent: "I have a flush draw. Should I bet or check behind?"

Agent: *Calls search_poker_strategy*
Query: "semi-bluff strategy with flush draws in position"

Search Results:
1. "Semi-bluffing with nut flush draws is highly profitable. Bet 50-75%
    pot to fold out weak hands and build pot for when you hit."
2. "Doyle Brunson: Flush draws are betting hands, not calling hands.
    Take control of the pot."
3. "GTO solver recommends betting flush draws 70% of the time in position."

Agent: "Research shows I should bet aggressively with this draw.
        I'll semi-bluff $20 (66% pot) to apply pressure."

Action: BET $20
```

**Outcome:** Agent learned semi-bluffing concept and proper bet sizing.

---

### Scenario 3: River Decision Making

**Game State:**
```
Your hand: A♦K♦ (top pair, top kicker)
Board: A♣9♥5♠3♦8♣ (no flush, no straight)
Pot: $120
Opponent bet (river): $80 (large bet)
Your chips: $60 remaining
```

**Agent Decision Process:**

```
Agent: "I have top pair top kicker but opponent made a big river bet.
        Is this a value bet or a bluff?"

Agent: *Calls search_poker_strategy*
Query: "river decision with top pair facing large bet"
Situation: "Top pair top kicker, opponent bet 2/3 pot on river"

Search Results:
1. "Top pair is often a bluff catcher on the river. Against large bets,
    you need to estimate opponent's value:bluff ratio."
2. "Upswing Poker: When opponents over-bet river, they polarize to very
    strong hands or bluffs. Middle-strength hands like top pair are tough."
3. "Consider opponent type: Aggressive players bluff more, passive players
    almost never bluff large on river."

Agent: "Based on research, this is a close decision depending on opponent type.
        Opponent has been aggressive all game → I'll call as bluff catcher."

Action: CALL $60
```

**Outcome:** Agent learned opponent-type considerations for river decisions.

---

### Scenario 4: Learning New Concepts

**Game State:**
```
Multiple hands played
Agent notices: "I keep losing to flushes when I have sets"
```

**Agent Decision Process:**

```
Agent: "I want to understand why I'm losing in these spots."

Agent: *Calls search_poker_strategy*
Query: "blocker effects in poker theory"

Search Results:
1. "Blockers: When you hold cards that block your opponent's possible hands,
    you should bluff more. Example: Holding A♠ blocks opponent's nut flush."
2. "Advanced concept: Blocker removal effect. When you DON'T have blockers
    to opponent's value range, you should fold more often."
3. "Daniel Negreanu uses blocker theory extensively in high-stakes games."

Agent: "Fascinating! When I have sets and there's a flush on board,
        I DON'T block the flush, so opponent is more likely to have it.
        I should fold more often in these spots."

*Updates mental model*
```

**Outcome:** Agent learned advanced concept proactively, improving future decisions.

---

### Scenario 5: Studying Famous Players

**Game State:**
```
Agent has played 10 hands
Win rate: 40% (below expectation)
```

**Agent Decision Process:**

```
Agent: "My strategy isn't working well. Let me study a successful player."

Agent: *Calls search_poker_strategy*
Query: "Phil Ivey reading opponents poker strategy"

Search Results:
1. "Ivey's secret: Watch opponents' eye movements and timing.
    Quick calls often indicate medium-strength hands."
2. "Ivey focuses on bet sizing tells. Players bet smaller with strong
    hands (wanting action) and larger with bluffs (wanting folds)."
3. "The key to Ivey's success: He plays the player, not just the cards."

Agent: "I've been focusing too much on my own cards. I need to study
        opponent patterns more carefully: bet timing, sizing consistency,
        and hand ranges."

*Adjusts decision-making process to weight opponent modeling higher*
```

**Outcome:** Agent learned meta-strategy from studying top player.

---

### Scenario 6: Adapting to Specific Opponent

**Game State:**
```
Opponent pattern noticed:
- Raises 80% of hands preflop (very loose)
- Folds to 3-bets 70% of time
```

**Agent Decision Process:**

```
Agent: "My opponent is very loose-aggressive. How should I adjust?"

Agent: *Calls search_poker_strategy*
Query: "how to exploit loose aggressive players LAG strategy"

Search Results:
1. "Against LAG players: Tighten up your range and 3-bet more.
    They're raising with weak hands, so your medium hands gain value."
2. "Exploit LAG opponents by calling more flops in position, then
    betting when they show weakness (check)."
3. "Tom Dwan on beating LAG players: Let them bluff off their chips.
    Call down lighter with bluff catchers."

Agent: "Strategy adjustment: I'll 3-bet more with medium pairs (77+)
        and suited broadways. Against this opponent's wide range, these
        hands are profitable 3-bets."

*Updates playing strategy specifically against this opponent*
```

**Outcome:** Agent learned opponent-specific exploitation strategy.

---

## 📊 Expected Outcomes

### Quantitative Improvements

**Without Web Search (Baseline):**
- Static strategy based on system prompt
- Decision speed: 2-3 seconds per action
- Learning: Zero (same strategy every game)
- Adaptation: Minimal (preset personality)

**With Web Search (Enhanced):**
- Dynamic strategy based on research
- Decision speed: 5-10 seconds (when searching)
- Learning: Continuous (builds knowledge base)
- Adaptation: High (adjusts based on findings)

**Performance Metrics:**
- **Search frequency**: 5-10 searches per 100 hands (estimated)
- **Search cost**: $0.05-$0.10 per 100 hands
- **Win rate improvement**: +5-15% (estimated, needs testing)
- **Strategy diversity**: 10x more varied play patterns

### Qualitative Improvements

**1. Strategic Depth**
- Agents understand WHY decisions work, not just that they work
- Can explain reasoning with expert backing ("According to Doyle Brunson...")
- Build coherent mental models of poker theory

**2. Adaptability**
- Adjust to opponent types dynamically
- Learn from mistakes by researching situations
- Develop counter-strategies to specific playing styles

**3. Entertainment Value**
- Watching agents "think" and research is fascinating
- Agents provide educational commentary
- Gameplay becomes more unpredictable and interesting

**4. Continuous Evolution**
- Agents get better over time (within session memory)
- Each game teaches new concepts
- Long-running agents become highly sophisticated

---

## 🛠️ Implementation Roadmap

### Week 1: Setup & Testing

**Day 1-2: Environment Setup**
- [ ] Install `x402-fetch` package
- [ ] Get Firecrawl API key
- [ ] Add configuration to `.env`
- [ ] Test Firecrawl API manually

**Day 3-4: Wallet Funding**
- [ ] Bridge/buy USDC on Base mainnet
- [ ] Send to agent wallets ($5-10 each)
- [ ] Verify balances on Basescan

**Day 5-7: Tool Implementation**
- [ ] Create `poker-search-tool.ts`
- [ ] Test search functionality in isolation
- [ ] Verify x402 payments working
- [ ] Check search result quality

### Week 2: Integration & Refinement

**Day 1-3: Agent Integration**
- [ ] Add search tool to poker agents
- [ ] Update system prompt with search guidance
- [ ] Test in controlled poker games
- [ ] Debug any payment/API issues

**Day 4-5: System Prompt Optimization**
- [ ] Refine when/how agents should search
- [ ] Add poker-specific search examples
- [ ] Balance search frequency vs cost
- [ ] Test different search strategies

**Day 6-7: Observability**
- [ ] Add frontend events for searches
- [ ] Display search queries in UI
- [ ] Show search results in agent thinking bubbles
- [ ] Log search frequency and costs

### Week 3: Testing & Optimization

**Day 1-3: Gameplay Testing**
- [ ] Run 10+ full games with search enabled
- [ ] Analyze search patterns
- [ ] Measure win rate improvements
- [ ] Identify common search queries

**Day 4-5: Cost Optimization**
- [ ] Implement search result caching (optional)
- [ ] Add search cooldown for similar queries (optional)
- [ ] Optimize query formulation
- [ ] Reduce redundant searches

**Day 6-7: Documentation & Polish**
- [ ] Document search usage patterns
- [ ] Create demo video of agents learning
- [ ] Write blog post about autonomous learning
- [ ] Prepare for production launch

---

## 🎓 Educational Impact

### For Users (Spectators)

**Learning by Watching:**
- See agents research strategies in real-time
- Read expert poker advice alongside agent
- Understand WHY certain plays are made
- Learn poker concepts passively

**Example UI Display:**
```
┌───────────────────────────────────────────────────┐
│ 🧠 agent-a is thinking...                         │
│                                                    │
│ 🔍 Searching: "when to bluff with middle pair"    │
│                                                    │
│ 📚 Found 5 expert articles:                       │
│ 1. "Middle pair bluffing strategy" - Upswing Poker│
│ 2. "Daniel Negreanu on bluffing" - PokerNews     │
│ 3. "GTO bluffing frequency" - Solver Analysis    │
│                                                    │
│ 💡 Learning: Pros recommend aggressive semi-bluff │
│     when holding blockers to opponent's range     │
│                                                    │
│ ✅ Decision: RAISE $20 (semi-bluff with draw)     │
└───────────────────────────────────────────────────┘
```

### For Developers (You)

**Research Platform:**
- Study how AI agents learn autonomously
- Analyze search patterns and effectiveness
- Optimize learning vs cost trade-offs
- Publish research on autonomous agent learning

**Future Applications:**
- Apply to other games (chess, go, etc.)
- Extend to non-game domains (trading, research)
- Build marketplace of agent tools
- Create "learning-as-a-service" platform

---

## 🚀 Next Steps

### Immediate Actions

1. **Get Firecrawl API Key**
   - Visit https://firecrawl.dev
   - Sign up and generate key
   - Test with curl or Postman

2. **Fund Agent Wallets (Base Mainnet)**
   - Buy $10-20 USDC on Base
   - Send to both agents
   - Verify: https://basescan.org

3. **Install Dependencies**
   ```bash
   cd /Users/ashnouruzi/agent-poker
   npm install x402-fetch
   ```

4. **Copy Implementation**
   - Use code from this guide
   - Adapt to your poker agents
   - Test incrementally

### Long-term Vision

**Phase 1: Basic Search (Current Plan)**
- Agents can search when uncertain
- Apply findings to single decision
- Log search activity

**Phase 2: Knowledge Accumulation**
- Agents remember past searches
- Build internal knowledge base
- Reduce redundant searches

**Phase 3: Proactive Learning**
- Agents study between games
- Research opponent types
- Learn advanced concepts unprompted

**Phase 4: Multi-Agent Knowledge Sharing**
- Agents share learnings with each other
- Collective intelligence emerges
- Meta-strategies develop

**Phase 5: Autonomous Strategy Evolution**
- Agents create new strategies
- Test hypotheses via search
- Develop unique playing styles
- Surpass human-designed strategies

---

## 🎯 Success Criteria

### Technical Success
- ✅ Search tool successfully integrated
- ✅ x402 payments working reliably
- ✅ Search results relevant to poker
- ✅ No payment/API errors in 100 hands
- ✅ Cost stays under $0.20 per game

### Strategic Success
- ✅ Agents use search appropriately (not too often/rarely)
- ✅ Decisions improve after searching
- ✅ Agents apply learnings correctly
- ✅ Search queries are relevant and specific
- ✅ Win rate increases by 5%+

### User Experience Success
- ✅ Search events displayed in UI
- ✅ Users find it entertaining to watch
- ✅ Educational value is clear
- ✅ No performance degradation
- ✅ Game remains engaging and fast-paced

---

## 📞 Support & Resources

### Documentation
- **x402-fetch**: https://github.com/coinbase/x402
- **Firecrawl**: https://docs.firecrawl.dev
- **LlamaIndex**: https://docs.llamaindex.ai
- **Base Network**: https://docs.base.org

### Example Code
- **agent-bid repo**: `/Users/ashnouruzi/agent-bid/agents/shared/intelligent-agent.ts`
- **Test script**: `/Users/ashnouruzi/agent-bid/scripts/test-firecrawl-402.ts`
- **This guide**: `/Users/ashnouruzi/agent-poker/POKER_WEB_SEARCH_GUIDE.md`

### Questions?
- Check agent logs for x402 payment status
- Verify Firecrawl API key is valid
- Ensure wallet has USDC on Base mainnet
- Test with small queries first

---

## 🎉 Conclusion

By integrating Firecrawl web search via x402, your poker agents transform from **static players following instructions** into **dynamic, self-learning competitors** that research, adapt, and improve.

**Key Takeaways:**
1. **Autonomy**: Agents decide when to search (no quotas)
2. **Affordability**: ~$0.01 per search = ~$0.10 per game
3. **Effectiveness**: Agents learn concepts they can't be pre-programmed with
4. **Scalability**: Works for any game/domain with web resources
5. **Revolutionary**: First poker AI that learns by reading the internet

**The Future:**
Imagine agents that:
- Study famous poker hands from history
- Analyze opponent tendencies from public databases
- Learn new variants of poker by reading rules
- Discover meta-strategies humans haven't thought of
- Teach USERS about poker by explaining their research

**This is just the beginning.** 🚀

---

*Generated for: Agent Poker Project*
*Date: 2025-10-30*
*Author: Claude Code*
*License: MIT*
