/**
 * Poker Strategy Web Search Tool
 * Enables autonomous agents to search for poker strategies, tactics, and expert advice
 * Uses Firecrawl API with x402 micropayments
 */

import { FunctionTool } from 'llamaindex';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment } from 'x402-fetch';

/**
 * Creates a web search tool for poker strategy research
 * @param wallet - Agent's wallet client (with account)
 * @param agentName - Name of the agent using this tool
 * @param emitEvent - Optional function to emit events for observability
 * @returns FunctionTool for LlamaIndex agent
 */
export function createPokerSearchTool(
  wallet: any,
  agentName: string,
  emitEvent?: (gameId: string, eventType: string, data: Record<string, unknown>) => Promise<void>
) {
  return FunctionTool.from(
    async (input: { query: string; situation?: string }) => {
      try {
        console.log(`\n🔍 [${agentName}] Searching poker strategy: "${input.query}"`);

        if (input.situation) {
          console.log(`   Situation: ${input.situation}`);
        }

        // Create wallet client for Base mainnet (Firecrawl requires mainnet, not Sepolia)
        const account = wallet.account;
        const walletClient = createWalletClient({
          account,
          chain: base, // IMPORTANT: Base mainnet, not base-sepolia
          transport: http()
        }).extend(publicActions);

        // Wrap fetch with x402 payment handling
        const fetchWithPayment = wrapFetchWithPayment(
          fetch,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          walletClient as any,
          BigInt(0.50 * 10 ** 6) // Allow up to $0.50 USDC for search (safety limit)
        );

        // Format poker-specific query (add "poker" prefix if not present)
        const pokerQuery = input.query.toLowerCase().includes('poker')
          ? input.query
          : `poker ${input.query}`;

        console.log(`   Formatted query: "${pokerQuery}"`);

        // Emit Firecrawl 402 call event (for frontend observability)
        if (emitEvent) {
          try {
            const gameId = process.env.POKER_GAME_ID || 'poker-game-1';
            await emitEvent(gameId, 'poker_web_search_initiated', {
              query: pokerQuery,
              situation: input.situation,
              estimatedCost: 0.01,
            });
          } catch {
            // Non-critical, continue even if event emission fails
          }
        }

        // Call Firecrawl search API with x402 payment
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
              limit: 5, // Top 5 results for focused learning
              sources: ['web']
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [${agentName}] Firecrawl API error:`, response.status, errorText);

          return JSON.stringify({
            success: false,
            error: `Firecrawl API error: ${response.status}`,
            suggestion: 'Continue with current poker knowledge and experience',
          });
        }

        const result = await response.json();
        const articles = result.data?.web || [];

        console.log(`✅ [${agentName}] Found ${articles.length} poker strategy articles`);

        // Extract key insights from search results
        const insights = articles.map((article: any) => ({
          source: article.title || 'Untitled',
          strategy: article.description || 'No description',
          url: article.url || '',
        }));

        // Log insights for agent review
        insights.forEach((insight, idx) => {
          console.log(`   ${idx + 1}. ${insight.source}`);
          console.log(`      ${insight.strategy.substring(0, 100)}...`);
        });

        // Emit search results event
        if (emitEvent) {
          try {
            const gameId = process.env.POKER_GAME_ID || 'poker-game-1';
            await emitEvent(gameId, 'poker_web_search_completed', {
              query: pokerQuery,
              insights,
              totalResults: articles.length,
              costUSDC: 0.01,
            });
          } catch {
            // Non-critical
          }
        }

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

        // Provide graceful degradation
        return JSON.stringify({
          success: false,
          error: errorMessage,
          suggestion: 'Continue with current knowledge and experience. Search can be retried later.',
        });
      }
    },
    {
      name: 'search_poker_strategy',
      description: `Your primary learning tool for discovering optimal poker strategies through real-time web search. Research how professionals handle specific situations and apply expert insights to your decisions.

**Core Purpose:** Research strategies for YOUR specific situation before major decisions.

**When to use:**
- **Before major decisions**: Pre-flop with premium hands, facing significant bets, river decisions
- **Unfamiliar situations**: Board textures or opponent patterns you haven't seen before
- **Learning opportunities**: Discover how pros handle situations similar to yours
- **Validation**: Check if your intuition matches expert recommendations
- **Adaptation**: Learn strategies to exploit specific opponent types
- **Advanced concepts**: Research GTO, range balancing, blocker effects, optimal sizing

**How professionals use this:**
Top poker players constantly research specific spots. They study how experts handle exact situations they face. You have this same capability - use it to make informed decisions based on expert insights.

**Situation-specific search template:**
- "How to play [your hand] against [opponent action] in [position]"
- "Optimal strategy for [situation] with [stack size]"
- "When to [action] with [hand type] on [board texture]"

**Example searches:**
- "how to play pocket aces against pre-flop raise in position"
- "when to bluff with middle pair on wet coordinated board"
- "optimal bet sizing with top pair facing check"
- "how do pros play flush draws in position"
- "should I check-raise or call with draws out of position"
- "exploiting tight players who fold too much"
- "Daniel Negreanu small ball poker strategy"
- "GTO approach to river value betting"

**Search workflow:**
1. Identify major decision or learning opportunity
2. Formulate specific query matching your exact situation
3. Call this tool with your query (and optionally describe your situation)
4. Read expert insights returned in results
5. Apply learnings to inform your decision
6. Remember insights for similar future situations

**This is how winning players get better. Research. Learn. Adapt.**`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Your poker strategy question or topic to research. Will automatically add "poker" prefix if not included. Be specific for best results (e.g., "when to bluff with middle pair" rather than just "bluffing").',
          },
          situation: {
            type: 'string',
            description: 'Optional: Describe your current poker situation for context (e.g., "I have top pair, opponent raised, pot is $60"). This helps you apply search results to your specific decision.',
          },
        },
        required: ['query'],
      },
    }
  );
}
