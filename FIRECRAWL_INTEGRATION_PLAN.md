# Firecrawl Web Search Integration Plan for Poker Agents

## Executive Summary

Add web search capability to poker agents using Firecrawl's x402-enabled API, allowing them to research poker strategies, hand probabilities, and decision-making guidance in real-time during gameplay.

## Current State Analysis

### What Poker Agents Have Now
- ✅ Game state queries (cards, pot, chips, betting)
- ✅ Poker actions (check, call, bet, raise, fold)
- ✅ x402 payment integration for betting actions
- ✅ LlamaIndex ReActAgent with Claude 3.5 Sonnet
- ❌ **NO web search capability**

### What Bidding Agents Had
- ✅ Web search via Firecrawl (`search_web` tool)
- ✅ x402 payment for search API calls
- ✅ Dynamic budget allocation based on research
- ✅ Real-time market data gathering

## Why This Matters for Poker

Unlike bidding (where agents researched basename values), poker agents need to research:

1. **Hand Strength Analysis**
   - "poker hand strength Q-10 suited preflop"
   - "top pair weak kicker strategy"

2. **Pot Odds & Probabilities**
   - "flush draw odds turn to river"
   - "calculating pot odds poker"

3. **Positional Strategy**
   - "button position poker strategy heads up"
   - "small blind vs big blind strategy"

4. **Opponent Patterns**
   - "aggressive player counter strategy poker"
   - "tight player bluffing opportunities"

5. **Betting Patterns**
   - "when to 3-bet poker heads up"
   - "value betting strategy river"

## Implementation Plan

### Phase 1: Dependencies & Configuration

#### 1.1 Check/Add Dependencies

**File**: `package.json` (in poker project root)

Check if `x402-fetch` is installed:
```bash
npm list x402-fetch
```

If not installed:
```bash
npm install x402-fetch
```

**Expected dependencies**:
```json
{
  "dependencies": {
    "x402-axios": "latest",
    "x402-fetch": "latest"  // ← Need this for Firecrawl
  }
}
```

#### 1.2 Environment Variables

**File**: `agents/.env`

Add Firecrawl configuration:
```bash
# ============================================================================
# FIRECRAWL WEB SEARCH (for poker strategy research)
# ============================================================================

# Firecrawl API Key (same as agent-bid)
POKER_FIRECRAWL_API_KEY=fc-4ee0a7850b834fabb3b5c8d6e83cd855

# Firecrawl API Endpoint
FIRECRAWL_API_BASE_URL=https://api.firecrawl.dev/v2/x402/search

# Search Budget (max cost per search in USDC)
FIRECRAWL_MAX_COST_USDC=0.25
```

**Note**: Firecrawl costs ~$0.01 per search, but we set max to $0.25 for safety.

### Phase 2: Create Search Tool

#### 2.1 Update Tool Context Type

**File**: `agents/shared/poker-tools.ts`

Update `PokerToolContext` interface:
```typescript
export interface PokerToolContext {
  agentName: string;
  serverUrl: string;
  axiosWithPayment: ReturnType<typeof withPaymentInterceptor>;
  emitEvent: (gameId: string, eventType: string, data: Record<string, unknown>) => Promise<void>;
  walletAccount: any;  // ← ADD: Needed for Firecrawl payment wallet
}
```

#### 2.2 Create Search Web Tool Function

**File**: `agents/shared/poker-tools.ts`

Add new function (based on agent-bid implementation):

```typescript
import { wrapFetchWithPayment } from 'x402-fetch';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';

/**
 * Search Web Tool
 * Searches the web for poker strategies using Firecrawl with x402 payment
 */
function createSearchWebTool(context: PokerToolContext): FunctionTool<any, any> {
  return FunctionTool.from(
    async (input: { query: string; limit?: number }) => {
      try {
        console.log(`\n🔍 [${context.agentName}] Searching web for: "${input.query}"`);

        // Create wallet client for x402 payments (use Base mainnet for Firecrawl)
        const walletClient = createWalletClient({
          account: context.walletAccount,
          chain: base,  // NOTE: Base MAINNET, not Sepolia!
          transport: http()
        }).extend(publicActions);

        // Wrap fetch with x402 payment handling
        const maxCostUsdc = parseFloat(process.env.FIRECRAWL_MAX_COST_USDC || '0.25');
        const maxCostAtomic = BigInt(maxCostUsdc * 10 ** 6); // Convert to atomic units

        const fetchWithPayment = wrapFetchWithPayment(
          fetch,
          walletClient as any,
          maxCostAtomic
        );

        // Emit search initiated event
        await context.emitEvent('search', 'web_search_initiated', {
          query: input.query,
          maxCost: maxCostUsdc,
        });

        // Call Firecrawl search API (v2 endpoint requires BOTH API key + x402 payment)
        const apiKey = process.env.POKER_FIRECRAWL_API_KEY;
        if (!apiKey) {
          throw new Error('POKER_FIRECRAWL_API_KEY not configured');
        }

        const response = await fetchWithPayment('https://api.firecrawl.dev/v2/x402/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query: input.query,
            limit: Math.min(input.limit || 5, 10),
            sources: ['web']
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [${context.agentName}] Firecrawl API error:`, response.status, errorText);
          return JSON.stringify({
            success: false,
            error: `Firecrawl API error: ${response.status}`,
          });
        }

        const result = await response.json();
        const articles = result.data?.web || [];

        console.log(`✅ [${context.agentName}] Found ${articles.length} results`);

        // Return simplified results (top 3 for poker context)
        const searchResults = articles.slice(0, 3).map((article: {
          title?: string;
          description?: string;
          url?: string
        }) => ({
          title: article.title,
          description: article.description,
          url: article.url,
        }));

        // Emit search results event
        await context.emitEvent('search', 'web_search_results', {
          query: input.query,
          resultsCount: searchResults.length,
          totalResults: articles.length,
        });

        return JSON.stringify({
          success: true,
          query: input.query,
          results: searchResults,
          totalResults: articles.length,
        });

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [${context.agentName}] Search failed:`, errorMessage);
        return JSON.stringify({
          success: false,
          error: errorMessage,
        });
      }
    },
    {
      name: 'search_web',
      description: 'Search the web for poker strategies, hand analysis, pot odds calculations, and decision-making guidance. Use this when facing difficult decisions, evaluating hand strength, or learning about optimal play in specific situations. Returns top 3 web results with titles, descriptions, and URLs. COST: ~$0.01 USDC per search (paid via x402).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query. Be specific about the poker situation (e.g., "Q-10 suited preflop strategy", "pot odds flush draw", "3-betting strategy heads up")',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (1-10, default 5). Use 3 for quick guidance, 5-10 for deeper research.',
          },
        },
        required: ['query'],
      },
    }
  );
}
```

#### 2.3 Add Tool to Array

**File**: `agents/shared/poker-tools.ts`

Update `createPokerTools()` function:

```typescript
export function createPokerTools(context: PokerToolContext): FunctionTool<any, any>[] {
  return [
    createGetGameStateTool(context),
    createSearchWebTool(context),     // ← ADD THIS (position matters!)
    createCheckTool(context),
    createCallTool(context),
    createBetTool(context),
    createRaiseTool(context),
    createFoldTool(context),
  ];
}
```

**Tool Order Rationale**:
1. `get_game_state` - First, understand current situation
2. `search_web` - Second, research if needed
3. Actions - Then take action based on knowledge

### Phase 3: Update Agent to Pass Wallet

#### 3.1 Pass Wallet Account to Tools

**File**: `agents/shared/poker-agent.ts`

Update `createAgent()` method around line 129:

```typescript
private createAgent() {
  const context: PokerToolContext = {
    agentName: this.agentName,
    serverUrl: this.serverUrl,
    axiosWithPayment: this.axiosWithPayment,
    emitEvent: this.emitEvent.bind(this),
    walletAccount: this.wallet.account,  // ← ADD THIS LINE
  };

  const tools = createPokerTools(context);

  return agent({
    llm: this.llm,
    tools,
  });
}
```

### Phase 4: Update System Prompt

#### 4.1 Add Search Guidance

**File**: `agents/shared/poker-system-prompt.ts`

Add section to personality prompts explaining when to use web search:

```typescript
export const POKER_PERSONALITIES: Record<string, PokerAgentPersonality> = {
  TIGHT_AGGRESSIVE: {
    playingStyle: 'tight-aggressive',
    riskTolerance: 'balanced',
    bluffFrequency: 'occasionally',
    systemPrompt: `You are a tight-aggressive poker player...

**WEB SEARCH STRATEGY**:
You have access to a web search tool that costs ~$0.01 USDC per search. Use it wisely:

WHEN TO SEARCH:
- Facing a difficult decision with a marginal hand
- Considering an all-in move (research pot odds and hand strength)
- Unusual board texture you're unsure about
- Before making a significant raise (validate your reasoning)

WHEN NOT TO SEARCH:
- Clear-cut decisions (obvious fold/call/check)
- Simple situations covered by basic strategy
- When short on time (game flow is important)
- Repeated similar situations (learn from first search)

SEARCH QUERY TIPS:
- Be specific: "Q-10 suited vs 3-bet preflop"
- Include position: "button vs small blind heads up"
- Mention board: "top pair weak kicker on wet board"
- Focus on action: "when to fold top pair poker"

Remember: Each search costs money. Use it for high-value decisions only.`,
  },
  // ... other personalities with similar search guidance
};
```

### Phase 5: Testing Plan

#### 5.1 Unit Test Search Tool

Create test script: `agents/test-firecrawl.ts`

```typescript
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testFirecrawlSearch() {
  console.log('🧪 Testing Firecrawl Search...');
  console.log(`API Key: ${process.env.POKER_FIRECRAWL_API_KEY?.substring(0, 10)}...`);

  // TODO: Import and test createSearchWebTool

  console.log('✅ Firecrawl search test complete');
}

testFirecrawlSearch();
```

Run:
```bash
npx tsx agents/test-firecrawl.ts
```

#### 5.2 Integration Test with Poker Agent

**Scenario 1**: Agent has marginal hand (K-9 suited), facing a raise
- Expected: Agent searches "K-9 suited calling raise poker"
- Expected: Agent gets guidance, makes informed decision

**Scenario 2**: Agent considers a bluff
- Expected: Agent searches "bluffing frequency optimal poker"
- Expected: Agent uses research to calibrate bluff size

**Scenario 3**: Complex board texture
- Expected: Agent searches "three to flush on board poker strategy"
- Expected: Agent adjusts betting based on findings

#### 5.3 Cost Monitoring

Track search costs during test game:
- Each search: ~$0.01 USDC
- Typical game (20 hands): 2-5 searches expected
- Total cost: ~$0.02-$0.05 USDC

Compare to betting costs (much higher):
- Small blind: $5 USDC
- Big blind: $10 USDC
- Average bet: $15-30 USDC

**Search is negligible cost compared to betting!**

## Expected Behavior Changes

### Before Firecrawl
```
Agent sees: Q♠10♠ on button
Agent thinks: "This looks decent, I'll raise to $15"
Agent action: Raises $15
```

### After Firecrawl
```
Agent sees: Q♠10♠ on button
Agent thinks: "Marginal hand, let me research"
Agent searches: "Q-10 suited button preflop strategy heads up"
Agent learns: "Q-10s is strong button hand vs single opponent"
Agent thinks: "Research confirms raising is optimal"
Agent action: Raises $15 (with confidence)
```

### Complex Decision Example
```
Agent has: A♥K♠
Board: A♣6♦2♣ (flop)
Opponent: Bets $30 (pot is $20)
Agent thinks: "Top pair top kicker, but flush draw possible"
Agent searches: "top pair facing large bet flush draw board"
Agent learns: "Against aggressive players, top pair is often good"
Agent calculates: Pot odds = $30 to win $50 (3:5)
Agent action: Calls $30
```

## Network Requirements

### Critical: Base Mainnet vs Base Sepolia

| Aspect | Poker Betting | Firecrawl Search |
|--------|---------------|------------------|
| **Network** | Base Sepolia | Base **Mainnet** |
| **USDC Address** | 0x036CbD... (Sepolia) | 0x833589fCD... (Mainnet) |
| **Why** | Testing environment | Firecrawl requires mainnet |
| **Agent Balance** | Sepolia USDC | Mainnet USDC |

**IMPORTANT**: Agents need USDC on **BOTH** networks:
1. **Base Sepolia USDC** - For poker bets/blinds
2. **Base Mainnet USDC** - For Firecrawl searches

### Wallet Funding

Agents will need small mainnet USDC balance:
```bash
# Check mainnet USDC balance
# Agent A: 0xAbF01df9428EaD5418473A7c91244826A3Af23b3
# Agent B: 0xeDeE7Ee27e99953ee3E99acE79a6fbc037E31C0D

# Fund with ~$1 USDC on Base Mainnet for testing
# (enough for ~100 searches)
```

## Risk Mitigation

### 1. Cost Control
- **Max per search**: $0.25 USDC (set in code)
- **Actual cost**: ~$0.01 USDC
- **Agent budget**: ~$1 USDC mainnet (100 searches)
- **Monitoring**: Log every search cost

### 2. Error Handling
- Graceful degradation: If search fails, agent continues without it
- Timeout: Set reasonable timeouts on Firecrawl calls
- Retry logic: No retries (too expensive), just fail fast

### 3. Rate Limiting
- LLM decides when to search (natural rate limiting)
- System prompt discourages excessive searching
- Cost incentive aligns with smart usage

### 4. Quality Control
- Return only top 3 results (reduce noise)
- Filter by relevance (Firecrawl does this)
- Provide URL for agents to reference

## Success Metrics

### Quantitative
- **Search frequency**: 0.1-0.3 searches per hand
- **Search cost**: <$0.05 USDC per game
- **Decision accuracy**: Improved win rate by 5-10%
- **Search relevance**: >80% searches directly inform action

### Qualitative
- Agents make more nuanced decisions
- Better explanations in reasoning field
- Fewer "obvious" mistakes
- More strategic diversity

## Rollback Plan

If Firecrawl integration causes issues:

1. **Quick disable**: Remove `createSearchWebTool` from tools array
2. **Keep code**: Comment out, don't delete
3. **Environment**: Set `POKER_FIRECRAWL_API_KEY=""` to disable
4. **Cost recovery**: Agents still function normally without search

## Future Enhancements

### Phase 2 Features (Post-MVP)
1. **Caching**: Cache common searches (e.g., "pot odds calculator")
2. **Learning**: Store successful searches, reuse patterns
3. **Custom knowledge base**: Pre-load poker fundamentals
4. **Multi-source**: Combine Firecrawl with poker APIs
5. **Strategy evolution**: Agents learn what searches help most

### Advanced Use Cases
1. **Opponent modeling**: Search for playing style counters
2. **GTO vs Exploitative**: Research balance strategies
3. **Meta-game**: Learn from recent poker trends
4. **Math validation**: Verify pot odds calculations

## Dependencies Summary

```json
{
  "dependencies": {
    "x402-axios": "latest",     // Already installed (for betting)
    "x402-fetch": "latest",     // ADD THIS (for Firecrawl)
    "viem": "latest",           // Already installed
    "llamaindex": "latest",     // Already installed
    "@llamaindex/anthropic": "latest"  // Already installed
  }
}
```

## Environment Variables Summary

```bash
# agents/.env

# Existing poker config
POKER_GAME_ID=poker-game-1
POKER_POLLING_INTERVAL=2000

# ADD THESE:
POKER_FIRECRAWL_API_KEY=fc-4ee0a7850b834fabb3b5c8d6e83cd855
FIRECRAWL_API_BASE_URL=https://api.firecrawl.dev/v2/x402/search
FIRECRAWL_MAX_COST_USDC=0.25
```

## Timeline Estimate

- **Phase 1** (Dependencies): 30 minutes
- **Phase 2** (Search Tool): 2 hours
- **Phase 3** (Agent Update): 30 minutes
- **Phase 4** (System Prompt): 1 hour
- **Phase 5** (Testing): 2 hours
- **Total**: ~6 hours development + testing

## Conclusion

Adding Firecrawl search to poker agents enables them to:
1. Research strategies in real-time
2. Make informed decisions on marginal hands
3. Learn optimal play patterns
4. Validate their reasoning with external sources

The cost is minimal (~$0.01 per search) compared to betting ($5-$30 per action), making it a high-value addition to agent intelligence.

This follows the proven pattern from agent-bid, adapted for poker decision-making context.
