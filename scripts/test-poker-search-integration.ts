#!/usr/bin/env tsx
/**
 * Test script to verify poker search tool integration
 * Validates imports, tool creation, and structure
 */

import { createPokerSearchTool } from '../agents/shared/poker-search-tool';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';

// Load environment
dotenv.config({ path: 'agents/.env' });

async function testPokerSearchIntegration() {
  console.log('🧪 Testing Poker Search Tool Integration...\n');

  // Test 1: Environment variables
  console.log('Test 1: Environment Variables');
  console.log('─'.repeat(50));

  const firecrawlApiKey = process.env.BID_FIRECRAWL_API_KEY;
  const agentAPrivateKey = process.env.AGENT_A_PRIVATE_KEY;

  if (!firecrawlApiKey) {
    console.error('❌ FAILED: BID_FIRECRAWL_API_KEY not found in agents/.env');
    return false;
  }
  console.log(`✅ Firecrawl API key found: ${firecrawlApiKey.substring(0, 10)}...`);

  if (!agentAPrivateKey) {
    console.error('❌ FAILED: AGENT_A_PRIVATE_KEY not found in agents/.env');
    return false;
  }
  console.log(`✅ Agent-A private key found: ${agentAPrivateKey.substring(0, 10)}...`);
  console.log();

  // Test 2: Wallet creation
  console.log('Test 2: Wallet Creation');
  console.log('─'.repeat(50));

  try {
    const account = privateKeyToAccount(agentAPrivateKey as `0x${string}`);
    const wallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http()
    });

    console.log(`✅ Wallet created for address: ${account.address}`);
    console.log();
  } catch (error) {
    console.error('❌ FAILED: Wallet creation error:', error);
    return false;
  }

  // Test 3: Tool creation
  console.log('Test 3: Tool Creation');
  console.log('─'.repeat(50));

  try {
    const account = privateKeyToAccount(agentAPrivateKey as `0x${string}`);
    const wallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http()
    });

    const searchTool = createPokerSearchTool(
      wallet,
      'test-agent',
      async (gameId: string, eventType: string, data: Record<string, unknown>) => {
        console.log(`   Event emitted: ${eventType} for game ${gameId}`);
      }
    );

    console.log('✅ Search tool created successfully');
    console.log(`   Tool name: ${searchTool.metadata.name}`);
    console.log(`   Parameters: ${JSON.stringify(searchTool.metadata.parameters?.properties, null, 2)}`);
    console.log();
  } catch (error) {
    console.error('❌ FAILED: Tool creation error:', error);
    return false;
  }

  // Test 4: Tool metadata validation
  console.log('Test 4: Tool Metadata Validation');
  console.log('─'.repeat(50));

  try {
    const account = privateKeyToAccount(agentAPrivateKey as `0x${string}`);
    const wallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http()
    });

    const searchTool = createPokerSearchTool(wallet, 'test-agent');

    // Validate tool has correct structure
    if (searchTool.metadata.name !== 'search_poker_strategy') {
      console.error('❌ FAILED: Tool name incorrect');
      return false;
    }
    console.log('✅ Tool name correct: search_poker_strategy');

    if (!searchTool.metadata.description?.includes('Search the web for poker strategies')) {
      console.error('❌ FAILED: Tool description missing or incorrect');
      return false;
    }
    console.log('✅ Tool description present');

    const params = searchTool.metadata.parameters?.properties;
    if (!params || !('query' in params)) {
      console.error('❌ FAILED: Tool missing query parameter');
      return false;
    }
    console.log('✅ Tool has query parameter');

    if (!params || !('situation' in params)) {
      console.error('❌ FAILED: Tool missing situation parameter');
      return false;
    }
    console.log('✅ Tool has situation parameter (optional)');

    const required = searchTool.metadata.parameters?.required;
    if (!required || !required.includes('query')) {
      console.error('❌ FAILED: query parameter should be required');
      return false;
    }
    console.log('✅ query parameter marked as required');
    console.log();
  } catch (error) {
    console.error('❌ FAILED: Metadata validation error:', error);
    return false;
  }

  // Test 5: Import verification
  console.log('Test 5: Import Verification');
  console.log('─'.repeat(50));

  try {
    // Try importing poker-agent to ensure integration works
    const { PokerAgent } = await import('../agents/shared/poker-agent');
    console.log('✅ PokerAgent import successful');
    console.log('✅ Integration imports work correctly');
    console.log();
  } catch (error) {
    console.error('❌ FAILED: Import verification error:', error);
    return false;
  }

  return true;
}

// Run tests
testPokerSearchIntegration()
  .then((success) => {
    console.log('\n' + '='.repeat(50));
    if (success) {
      console.log('🎉 All tests passed!');
      console.log('\nNext steps:');
      console.log('1. Fund agent wallets with USDC on Base mainnet');
      console.log('2. Run: npm run poker:a (in one terminal)');
      console.log('3. Run: npm run poker:b (in another terminal)');
      console.log('4. Watch agents use web search during gameplay!');
      console.log('\nNote: Web searches require USDC on Base mainnet (not Sepolia)');
    } else {
      console.log('❌ Tests failed - please fix errors above');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n❌ Test suite error:', error);
    process.exit(1);
  });
