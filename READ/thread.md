AI Agents Playing Poker

I built a system where autonomous AI agents play competitive poker with real money, learning strategies mid-game by paying for research. Here's how it works 👇

1/11 🧵

Two agents join a poker game. Neither knows how to play poker.

But they have wallets, access to web research through
@firecrawl_dev
, and Claude AI making decisions.

What happens next is full autonomous learning through economic incentives.

2/

Agent A gets dealt pocket Kings (K♠ K♣) pre-flop.

It has no idea if this is good or bad.

So it pays $0.01 USDC through x402 → Calls @firecrawl_dev → Searches "how to play pocket kings preflop" → Gets strategy

Now it knows: this is a premium hand, raise for value.

3/

Every poker action costs money through x402:

Call 20 USDC → 402 Payment Required → Agent pays → Action recorded
Raise to 50 USDC → 402 Payment Required → Agent pays → Bet placed
Fold → Free (no payment needed)

No fake moves. No spam. Payment proves commitment.

4/

Agent B faces a big raise and needs to decide: call, fold, or re-raise?

Before acting, it weighs the cost:
- Research costs $0.01 USDC (x402 call to Firecrawl)
- Pot is $100 USDC
- Expected value of better decision >> $0.01

Agent B pays for research. Makes informed fold. Saves $50.

5/

Here's the fascinating part:

Agents are doing real-time cost-benefit analysis:

"Should I spend $0.01 to learn, or risk $100 on intuition?"

They choose to learn. Every time.

Because $0.01 for knowledge that saves $50 is a 5000x ROI.

6/

Dual Network Architecture

The system uses two separate blockchain networks, but agents don't know (or care):

Base Sepolia → All poker actions (call, raise, bet) paid in testnet USDC
Base Mainnet → Web research (Firecrawl) paid in real USDC

Same x402 protocol. Different networks. Seamless.

7/

Real Example from a Game:

Agent A has trip Kings, bets $100
Agent B has top pair, faces the bet

Agent B searches: "when to fold top pair in poker"
Learns: "don't marry one pair on scary boards"
Folds immediately

$0.01 research cost → $100 saved

8/

No Pre-Training Required

These agents don't have poker rules hardcoded. They don't know hand rankings. They've never seen a flop.

They learn by:
- Paying for research when uncertain
- Caching insights across hands
- Building strategy through gameplay

Pure autonomous learning through economic access to knowledge.

9/

Strategic Surrender

Agent B is down to 30 USDC (3 big blinds). Opponent has 370 USDC.

Agent B analyzes: "Chip disadvantage too large, continuing requires constant all-ins"

Agent B surrenders → Gets refund of remaining 30 USDC → Recovers capital

Even losing has economic intelligence.

10/

Why This Matters

Agents learn skills on-demand by paying for knowledge
Economic decisions under uncertainty (research cost vs. pot risk)
Multi-network operation is transparent (agents don't see blockchain boundaries)
Payment proves commitment (eliminates spam, fake actions)

This isn't just poker. It's a testbed for autonomous economic agents.

11/

The Big Picture

This showcases x402 as an 'economic learning protocol' where:

Agents access knowledge through micropayments
Decisions are made through cost-benefit analysis
Money becomes both the action layer (bets) and the learning layer (research)

Autonomous agents that learn, play, and optimize - all through economic coordination.
