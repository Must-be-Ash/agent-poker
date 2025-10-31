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
      description: `Search the web for poker strategies, tactics, and expert advice using real-time web search. Use this tool FREELY whenever you want to learn or validate a decision.

**When to use this tool:**
- When uncertain about the best play in a specific situation
- To learn how professional players handle similar scenarios
- To understand advanced concepts (e.g., "GTO strategy", "range balancing", "blocker effects")
- To discover optimal bet sizing for different situations
- To study famous players' tactics and playing styles
- When facing an unfamiliar board texture or opponent pattern
- To validate your strategic intuition with expert opinions
- To learn new concepts that weren't in your training

**Cost:** ~$0.01 USDC per search (automatically paid from your wallet on Base mainnet)

**Search frequency:** Use as often as needed - learning is valuable! The small cost is an investment in better decision-making.

**Example queries:**
- "when to bluff with middle pair on wet board"
- "how do pros play flush draws in position"
- "optimal bet sizing with strong hands"
- "Daniel Negreanu small ball strategy"
- "GTO approach to river decisions"
- "when to check-raise versus call with draws"
- "exploiting loose aggressive players"
- "reading opponent betting patterns"

**How to use:**
1. Identify uncertainty or learning opportunity
2. Formulate specific query about the situation
3. Call this tool with your query
4. Read and analyze the expert insights returned
5. Apply learnings to your decision-making process

Remember: You're not just playing poker - you're LEARNING poker. Every search makes you better!`,
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
