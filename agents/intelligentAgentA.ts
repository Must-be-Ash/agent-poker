import { IntelligentBiddingAgent } from './shared/intelligent-agent';
import dotenv from 'dotenv';
import { Hex } from 'viem';

dotenv.config({ path: 'agents/.env' });

const agentA = new IntelligentBiddingAgent({
  privateKey: process.env.AGENT_A_PRIVATE_KEY as Hex,
  agentName: process.env.AGENT_A_NAME || 'AgentA',
  maxBid: parseFloat(process.env.AGENT_A_MAX_BID || '10'),
  serverUrl: process.env.BID_SERVER_URL || 'http://localhost:3000',
  anthropicApiKey: process.env.BID_ANTHROPIC_API_KEY || '',
});

const basename = process.env.BASENAME_TO_AUCTION || 'test.base.eth';
agentA.start(basename);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Intelligent Agent A...');
  agentA.stop();
  process.exit(0);
});

