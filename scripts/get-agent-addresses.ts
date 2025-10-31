/**
 * Get agent wallet addresses from private keys
 */
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: './agents/.env' });

const agentAKey = process.env.AGENT_A_PRIVATE_KEY as `0x${string}`;
const agentBKey = process.env.AGENT_B_PRIVATE_KEY as `0x${string}`;

const agentA = privateKeyToAccount(agentAKey);
const agentB = privateKeyToAccount(agentBKey);

console.log('Agent A Address:', agentA.address);
console.log('Agent B Address:', agentB.address);
