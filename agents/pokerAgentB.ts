/**
 * Poker Agent B
 * Autonomous poker player instance B
 */

import { PokerAgent } from './shared/poker-agent';
import { POKER_PERSONALITIES, type PokerAgentPersonality } from './shared/poker-system-prompt';
import dotenv from 'dotenv';
import { Hex } from 'viem';

dotenv.config({ path: 'agents/.env' });

// Parse playing style from environment
const playingStyleEnv = process.env.POKER_AGENT_B_STYLE || 'LOOSE_AGGRESSIVE';
const personalityKey = playingStyleEnv.toUpperCase().replace('-', '_');

// Get personality configuration
let personality: PokerAgentPersonality;
if (personalityKey in POKER_PERSONALITIES) {
  personality = POKER_PERSONALITIES[personalityKey as keyof typeof POKER_PERSONALITIES];
} else {
  console.warn(`⚠️ Unknown playing style: ${playingStyleEnv}, defaulting to LOOSE_AGGRESSIVE`);
  personality = POKER_PERSONALITIES.LOOSE_AGGRESSIVE;
}

// Override name if provided in environment
const agentName = process.env.AGENT_B_NAME || personality.name;
personality = { ...personality, name: agentName };

// Parse polling interval (optional)
const pollingIntervalEnv = process.env.POKER_POLLING_INTERVAL;
const pollingInterval = pollingIntervalEnv ? parseInt(pollingIntervalEnv, 10) : 2000;

const agentB = new PokerAgent({
  privateKey: process.env.AGENT_B_PRIVATE_KEY as Hex,
  agentName,
  gameId: process.env.POKER_GAME_ID || 'poker-game-1',
  serverUrl: process.env.BID_SERVER_URL || 'http://localhost:3000',
  anthropicApiKey: process.env.BID_ANTHROPIC_API_KEY || '',
  personality,
  pollingInterval,
});

console.log(`🎰 Poker Agent B Configuration:`);
console.log(`   Name: ${agentName}`);
console.log(`   Style: ${personality.playingStyle}`);
console.log(`   Risk: ${personality.riskTolerance}`);
console.log(`   Bluff Frequency: ${personality.bluffFrequency}`);
console.log(`   Game ID: ${process.env.POKER_GAME_ID || 'poker-game-1'}`);

agentB.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Poker Agent B...');
  agentB.stop();
  process.exit(0);
});
