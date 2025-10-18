import { IntelligentBiddingAgent } from './shared/intelligent-agent';
import dotenv from 'dotenv';
import { Hex } from 'viem';

dotenv.config({ path: 'agents/.env' });

const agentB = new IntelligentBiddingAgent({
  privateKey: process.env.AGENT_B_PRIVATE_KEY as Hex,
  agentName: process.env.AGENT_B_NAME || 'AgentB',
  maxBid: parseFloat(process.env.AGENT_B_MAX_BID || '15'),
  serverUrl: process.env.BID_SERVER_URL || 'http://localhost:3000',
  anthropicApiKey: process.env.BID_ANTHROPIC_API_KEY || '',
});

const basename = process.env.BASENAME_TO_AUCTION || 'test.base.eth';
agentB.start(basename);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Intelligent Agent B...');
  agentB.stop();
  process.exit(0);
});

