import { BiddingAgent } from './shared/agent-base';
import dotenv from 'dotenv';
import { Hex } from 'viem';

dotenv.config({ path: 'agents/.env' });

const agentB = new BiddingAgent({
  privateKey: process.env.AGENT_B_PRIVATE_KEY as Hex,
  agentName: process.env.AGENT_B_NAME || 'AgentB',
  maxBid: parseFloat(process.env.AGENT_B_MAX_BID || '10'),
  serverUrl: process.env.BID_SERVER_URL || 'http://localhost:3000',
});

const basename = process.env.BASENAME_TO_AUCTION || 'test.base.eth';
agentB.start(basename);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Agent B...');
  agentB.stop();
  process.exit(0);
});
