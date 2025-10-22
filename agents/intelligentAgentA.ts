import { IntelligentBiddingAgent } from './shared/intelligent-agent';
import dotenv from 'dotenv';
import { Hex } from 'viem';

dotenv.config({ path: 'agents/.env' });

// Parse maxBid if provided, otherwise agent will research and set their own budget
const maxBidEnv = process.env.AGENT_A_MAX_BID;
const maxBid = maxBidEnv ? parseFloat(maxBidEnv) : undefined;

const agentA = new IntelligentBiddingAgent({
  privateKey: process.env.AGENT_A_PRIVATE_KEY as Hex,
  agentName: process.env.AGENT_A_NAME || 'AgentA',
  ...(maxBid !== undefined && { maxBid }), // Only include if defined
  serverUrl: process.env.BID_SERVER_URL || 'http://localhost:3000',
  anthropicApiKey: process.env.BID_ANTHROPIC_API_KEY || '',
});

if (maxBid !== undefined) {
  console.log(`💰 Agent A starting with fixed budget: $${maxBid.toFixed(2)}`);
} else {
  console.log(`🔬 Agent A starting in research mode - will determine own budget`);
}

const basename = process.env.BASENAME_TO_AUCTION || 'test.base.eth';
agentA.start(basename);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Intelligent Agent A...');
  agentA.stop();
  process.exit(0);
});

