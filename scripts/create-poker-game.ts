/**
 * Create Poker Game Script
 *
 * Initializes a new poker game by:
 * 1. Querying both agents' actual USDC balances on Base Sepolia
 * 2. Validating they meet minimum requirements
 * 3. Creating game in MongoDB with real balances as starting chips
 *
 * Usage: npm run poker:create-game
 */

import dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import path from 'path';
import { createPokerGame } from '@/lib/poker-db';

// Load environment variables from both root and agents directory
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), 'agents', '.env') });
import {
  getSmallBlindAmount,
  getBigBlindAmount,
  getMinimumChipsRequired,
  hasMinimumBalance
} from '@/lib/x402-poker-config';

// ERC-20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

/**
 * Gets USDC balance for any wallet address
 * @param walletAddress - Wallet address to check
 * @returns Balance in USDC (as number with decimals)
 */
async function getUSDCBalance(walletAddress: string): Promise<number> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress as `0x${string}`],
  });

  // USDC has 6 decimals
  return Number(balance) / 1_000_000;
}

/**
 * Main script execution
 */
async function main() {
  console.log('\n🎮 Creating Poker Game with Real Wallet Balances\n');
  console.log('='.repeat(60));

  // Load configuration from environment
  const gameId = process.env.POKER_GAME_ID || 'poker-game-1';
  const smallBlind = getSmallBlindAmount();
  const bigBlind = getBigBlindAmount();
  const minChipsRequired = getMinimumChipsRequired();

  // Agent A configuration
  const agentAId = process.env.AGENT_A_NAME || 'AgentA';
  const agentAAddress = process.env.AGENT_A_PUBLIC_ADDRESS;

  if (!agentAAddress) {
    throw new Error('AGENT_A_PUBLIC_ADDRESS not set in environment');
  }

  // Agent B configuration
  const agentBId = process.env.AGENT_B_NAME || 'AgentB';
  const agentBAddress = process.env.AGENT_B_PUBLIC_ADDRESS;

  if (!agentBAddress) {
    throw new Error('AGENT_B_PUBLIC_ADDRESS not set in environment');
  }

  console.log('\n📋 Game Configuration:');
  console.log(`   Game ID: ${gameId}`);
  console.log(`   Small Blind: ${smallBlind} USDC`);
  console.log(`   Big Blind: ${bigBlind} USDC`);
  console.log(`   Minimum Required: ${minChipsRequired} USDC`);

  console.log('\n👤 Agent A:');
  console.log(`   ID: ${agentAId}`);
  console.log(`   Address: ${agentAAddress}`);

  console.log('\n👤 Agent B:');
  console.log(`   ID: ${agentBId}`);
  console.log(`   Address: ${agentBAddress}`);

  // Query actual USDC balances
  console.log('\n💰 Querying Wallet Balances...');

  const agentABalance = await getUSDCBalance(agentAAddress);
  console.log(`   ${agentAId}: ${agentABalance.toFixed(2)} USDC`);

  const agentBBalance = await getUSDCBalance(agentBAddress);
  console.log(`   ${agentBId}: ${agentBBalance.toFixed(2)} USDC`);

  // Validate minimum requirements
  console.log('\n✅ Validating Balances...');

  const agentAValid = hasMinimumBalance(agentABalance);
  const agentBValid = hasMinimumBalance(agentBBalance);

  if (!agentAValid) {
    throw new Error(
      `${agentAId} has insufficient balance: ${agentABalance.toFixed(2)} USDC ` +
      `(minimum required: ${minChipsRequired} USDC)`
    );
  }
  console.log(`   ✓ ${agentAId} meets minimum requirement`);

  if (!agentBValid) {
    throw new Error(
      `${agentBId} has insufficient balance: ${agentBBalance.toFixed(2)} USDC ` +
      `(minimum required: ${minChipsRequired} USDC)`
    );
  }
  console.log(`   ✓ ${agentBId} meets minimum requirement`);

  // Create game with actual balances
  console.log('\n🎲 Creating Poker Game in Database...');

  const gameRecord = await createPokerGame(
    gameId,
    [
      {
        agentId: agentAId,
        agentName: agentAId,
        walletAddress: agentAAddress,
        startingChips: agentABalance,
      },
      {
        agentId: agentBId,
        agentName: agentBId,
        walletAddress: agentBAddress,
        startingChips: agentBBalance,
      },
    ],
    {
      smallBlind,
      bigBlind,
      startingChips: 0, // Deprecated field, will be removed in next update
    }
  );

  console.log('\n✅ Game Created Successfully!');
  console.log('='.repeat(60));
  console.log(`\n🎮 Game ID: ${gameRecord.gameId}`);
  console.log(`\n💵 Starting Chip Stacks:`);
  console.log(`   ${agentAId}: ${agentABalance.toFixed(2)} USDC`);
  console.log(`   ${agentBId}: ${agentBBalance.toFixed(2)} USDC`);
  console.log(`\n🎯 Blinds:`);
  console.log(`   Small Blind: ${smallBlind} USDC`);
  console.log(`   Big Blind: ${bigBlind} USDC`);
  console.log('\n🚀 Ready to start poker agents!');
  console.log(`   npm run agent:poker:a`);
  console.log(`   npm run agent:poker:b\n`);

  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error('\n❌ Error creating poker game:', error);
  process.exit(1);
});
