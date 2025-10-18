# 🧠 Intelligent Bidding Agents

This system features AI-powered bidding agents that use Claude (Anthropic) to make strategic decisions in real-time.

## 🎯 How It Works

### **Intelligent Negotiation Protocol**

Instead of rigid incremental bidding, agents now:

1. **Analyze the market** using LLM reasoning
2. **Propose strategic bids** based on:
   - Current bid amount
   - Time remaining
   - Bid history patterns
   - Their remaining balance
   - Whether they were recently outbid
3. **Negotiate via x402** - Server evaluates proposals and responds with requirements
4. **Adapt strategy dynamically** - Agents learn from refunds and adjust tactics

### **Agent Strategies**

The LLM can exhibit various behaviors:
- 🎯 **Conservative Opening**: Start low to test the market
- 💪 **Aggressive Dominance**: Jump high to intimidate competitors
- 📈 **Incremental Creep**: Minimal increases to save money
- 🎭 **Bluffing**: Big early bids, then back off
- ⏰ **Last-Minute Snipe**: Wait for the right moment
- 🔄 **Tit-for-Tat**: Mirror competitor's patterns
- 🤔 **Strategic Retreat**: Recognize when to give up

## 🚀 Running Intelligent Agents

### Prerequisites

1. **Set up environment variables** in `agents/.env`:

```bash
# Agent A Configuration
AGENT_A_PRIVATE_KEY=0x...
AGENT_A_NAME=AgentA
AGENT_A_MAX_BID=10

# Agent B Configuration  
AGENT_B_PRIVATE_KEY=0x...
AGENT_B_NAME=AgentB
AGENT_B_MAX_BID=15

# Anthropic API Key (for AI reasoning)
# Note: Using BID_ANTHROPIC_API_KEY to avoid conflicts with other Claude integrations
BID_ANTHROPIC_API_KEY=sk-ant-...

# Server Configuration
BID_SERVER_URL=http://localhost:3000
BASENAME_TO_AUCTION=x402agent.base.eth
```

2. **Fund agents with USDC** on Base Sepolia:

```bash
npm run fund:agents
```

### Start the System

1. **Start the Next.js server** (in one terminal):

```bash
npm run dev
```

2. **Start Intelligent Agent A** (in another terminal):

```bash
npm run agent:ai:a
```

3. **Start Intelligent Agent B** (in a third terminal):

```bash
npm run agent:ai:b
```

4. **Watch the auction** at:
```
http://localhost:3000/auction/x402agent.base.eth
```

## 🎨 Frontend Features

The frontend now displays:

- **💭 Thinking Bubbles**: See the agent's reasoning process
- **📊 Strategy Labels**: Understand the agent's approach
- **💬 Reasoning Quotes**: Read why they bid what they bid
- **🔗 Transaction Links**: Verify on-chain payments
- **💸 Refund Notifications**: See when agents get outbid

## 🔧 Technical Architecture

### **Agent Side** (`intelligent-agent.ts`)

- **LlamaIndex Agent Framework**: Gives agents tools and reasoning capabilities
- **Claude 3.5 Sonnet**: Powers strategic decision-making
- **Tools Available to Agent**:
  - `get-my-balance`: Check USDC balance and max bid
  - `get-auction-state`: Fetch current auction status
  - `place-bid`: Submit strategic bid with reasoning

### **Server Side** (`route.ts`)

- **Proposal Evaluation**: Accepts `X-Proposed-Bid` header
- **Negotiation Response**: Returns 402 with market context:
  - Current bid
  - Minimum required
  - Suggestion amount
  - Time remaining
  - Recent bid history
- **Flexible Pricing**: Accepts any amount >= minimum (not forced increments)
- **Strategy Storage**: Saves thinking/reasoning to MongoDB

### **Frontend** (`page.tsx`)

- **iMessage-style Chat UI**: Grayscale design
- **Thinking Bubbles**: Show agent's internal reasoning
- **Strategy Display**: Label the agent's approach
- **Real-time Updates**: Poll every 2 seconds for new bids

## 🆚 Intelligent vs Simple Agents

| Feature | Simple Agents | Intelligent Agents |
|---------|--------------|-------------------|
| Decision Making | Hardcoded logic | LLM reasoning |
| Strategy | Always bid +$1 | Dynamic & adaptive |
| Reasoning | None | Visible thinking process |
| Learning | No | Adapts to refunds |
| Negotiation | No | Proposes amounts |
| Entertainment | Robotic | Compelling to watch |

## 📊 Example Agent Reasoning

```
Agent A's Thinking:
"Current bid is $6.50. That's getting steep. I have $29 left.
If I bid $8, I signal strength but risk overpaying.
Let me try $7.25 - just enough to win without showing my full hand."

Strategy: Conservative Counter
Bid: $7.25

Server Response:
"Your proposal of $7.25 is too low. Minimum: $7.50"

Agent A Reconsiders:
"They want $7.50 minimum. I'll go to $8.00 to show I'm serious
and discourage AgentB from continuing."

Strategy: Aggressive Escalation
Bid: $8.00 ✅
```

## 🎮 Watching the Battle

Open the frontend and watch as:

1. 🤖 **Agent A thinks** about opening strategy
2. 💭 **Proposes $5.00** (testing the waters)
3. 🏛️ **Server negotiates**: "Too low, minimum $1.00"
4. 🤖 **Agent A reconsiders**, bids $2.00
5. 💸 **Transaction settles** on-chain
6. 🦾 **Agent B analyzes** the situation
7. 💭 **Decides to bid $4.00** (aggressive jump)
8. 💸 **Agent A gets refunded** → detects outbid
9. 🤖 **Agent A re-evaluates** strategy
10. 🔄 **Cycle continues** until auction ends!

## 🔮 Future Enhancements

- [ ] **A2A Discovery**: Agents discover each other's capabilities
- [ ] **Server-side LLM**: Intelligent dynamic pricing
- [ ] **Multi-agent Coordination**: Agents form alliances
- [ ] **Historical Learning**: Agents remember past auctions
- [ ] **Personality Profiles**: Different agent personalities

## 🐛 Troubleshooting

**Agent not bidding?**
- Check `ANTHROPIC_API_KEY` is set
- Ensure agent has USDC balance
- Verify server is running

**"Replacement transaction underpriced"?**
- This is normal during concurrent bids
- System has retry logic built-in

**Frontend not updating?**
- Check MongoDB connection
- Verify API routes are accessible
- Look for console errors

## 📚 Resources

- [LlamaIndex Documentation](https://docs.llamaindex.ai/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [x402 Protocol](https://github.com/coinbase/x402)
- [Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)

---

**Built with ❤️ using x402, Claude, and LlamaIndex**

