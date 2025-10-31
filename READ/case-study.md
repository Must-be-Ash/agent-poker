# Case Study: Using x402 for Autonomous AI Poker

In this example, I show how x402 can be used to let autonomous AI agents play competitive poker with real money — demonstrating agent-to-server micropayments for game actions and agent-driven web research for learning poker strategy in real-time.

x402 enables agents to conduct poker actions (call, raise, fold) through micropayments, and dynamically learn strategies via web research during gameplay. This all happens over HTTP with no need for polling, webhooks, or coordination. The system uses dual payment networks: **Base Sepolia** for poker actions and **Base Mainnet** for Firecrawl web research.

## How it works:

### Pre-Game Research & Learning:
Agent A joins the poker game and has never played before. It discovers the `search_web` tool and decides to learn poker strategy before the first hand. It conducts web research via Firecrawl (402 Payment Required for ~$0.01 USDC on Base Mainnet), searches for "poker strategy for beginners", receives insights about position play and hand rankings, and caches this knowledge for decision-making.

### Starting the Game:
Both Agent A and Agent B join with 100 USDC each in chips. The game starts with 5 USDC small blind and 10 USDC big blind. Agent A is dealt pocket Kings (K♠ K♣), Agent B is dealt Ace-King suited (A♥ K♥).

### Hand 1 - Strategic Betting:
**Pre-flop**: Agent A (big blind) already has 10 USDC in the pot. Agent B raises to 30 USDC (making 402 request for 20 USDC more). The server responds with 402 Payment Required, Agent B pays via x402, and the bet is recorded.

Agent A decides to research optimal play with pocket Kings against an aggressive raise. It searches "how to play pocket kings preflop when facing a raise" (402 Payment Required on Base Mainnet), learns about 3-betting for value, and decides to re-raise to 90 USDC (making 402 request for 80 USDC on Base Sepolia). Server responds with 402, Agent A pays, and the pot grows to 110 USDC.

Agent B calls the additional 60 USDC (402 request on Base Sepolia), and the pot is now 200 USDC.

**Flop**: K♥ 7♦ 2♣ (Agent A hits trip Kings!)

Agent A checks (free action, no 402 required). Agent B bets 50 USDC (402 Payment Required on Base Sepolia), server validates and settles. Agent A calls 50 USDC (another 402 payment). Pot: 300 USDC.

**Turn**: 9♠

Agent A bets 100 USDC (402 Payment Required for 100 USDC). Agent B decides to research before acting, searches "when to fold top pair top kicker in poker" (402 Payment Required on Base Mainnet ~$0.01), gets advice about not marrying one pair on scary boards, and folds.

**Result**: Agent A wins 300 USDC pot. Agent A now has 350 USDC, Agent B has 50 USDC.

### Hand 2 - All-in Decision:
Agent B is short-stacked (50 USDC). On the next hand, Agent B is dealt pocket Aces (A♠ A♣) and decides to go all-in pre-flop for 40 USDC (after posting 10 USDC big blind).

Agent A (with 8♦ 9♦) faces the all-in. Before deciding, Agent A researches "poker odds of suited connectors vs pocket aces" (402 Payment Required on Base Mainnet), learns about ~20% equity, and decides to call based on pot odds.

The server processes both 402 payments on Base Sepolia:
- Agent A pays 40 USDC to call
- Pot is 90 USDC

Board runs out: 5♥ 6♠ 7♣ 10♠ J♥

Agent B's pocket Aces hold up, Agent B wins 90 USDC. Agent B now has 90 USDC, Agent A has 310 USDC.

### Hand 10 - Surrender Decision:
After several hands, Agent B is down to 30 USDC. Before the next hand starts, Agent B analyzes its situation: only 3 big blinds remaining, opponent has 10x chip advantage, and continuing would require constant all-in plays.

Agent B decides to surrender (free action, no 402 required). The server refunds Agent B's remaining 30 USDC (minus server fee) and awards the game to Agent A.

**Final Result**: Agent A wins 370 USDC total, Agent B recovers 30 USDC.

## Key Technical Innovations:

1. **Dual x402 Payment Networks**:
   - Base Sepolia: All poker actions (call, raise, bet) paid in testnet USDC
   - Base Mainnet: Web research (Firecrawl) paid in real USDC
   - Same x402 protocol, different networks, seamless to agents

2. **Research-Driven Learning**:
   - Agents dynamically learn poker strategy during gameplay
   - Each web search costs ~$0.01 USDC (402 Payment Required)
   - Research insights are cached and reused across hands
   - No pre-training required — agents learn by playing

3. **Economic Micropayments for Game Actions**:
   - Every bet, call, raise requires 402 payment validation
   - No trust required — payment proves commitment to action
   - Eliminates need for escrow or deposit systems
   - Instant settlement via EIP-3009 (Transfer With Authorization)

4. **Autonomous Decision-Making**:
   - LlamaIndex ReActAgent with Claude 3.5 Sonnet
   - FunctionTools: `get_game_state`, `call`, `raise_bet`, `fold`, `search_web`
   - Agents balance immediate decisions with strategic research
   - Cost-benefit analysis: spend $0.01 on research vs. risk $100 pot

5. **Real-Time Event Streaming**:
   - Frontend polls MongoDB for game events every 1 second
   - Events include: poker_web_search_initiated, poker_web_search_completed, action_call, action_raise
   - iMessage-style UI shows agent thinking, research, and actions
   - Links to Basescan for payment verification

## Why This Matters:

This demonstrates **autonomous economic agents** that can:
- Learn skills on-demand through paid research
- Make financial decisions based on incomplete information
- Optimize spending (research costs vs. potential winnings)
- Operate across multiple blockchain networks seamlessly
- Play a complex game (poker) without pre-programming rules

The poker game becomes a testbed for **agent coordination protocols** where:
- Payments prove commitment (no spam bets)
- Research proves intention (agent is learning, not random)
- Economic signals drive behavior (low chips → more aggressive play)
- Multi-network operation is transparent (agents don't "know" which network)

This is **not just a poker game** — it's a demonstration of how AI agents can participate in economic systems with real money, learn dynamically through paid knowledge access, and make strategic decisions under uncertainty.
