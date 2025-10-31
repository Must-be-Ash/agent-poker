#!/usr/bin/env tsx

import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, publicActions, createPublicClient } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment } from 'x402-fetch';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from agents/.env
dotenv.config({ path: path.join(__dirname, '../agents/.env') });

async function testPokerFirecrawl402() {
  console.log('🧪 Testing Poker Agent Firecrawl x402 Integration...\n');

  // Check required environment variables
  const privateKey = process.env.AGENT_A_PRIVATE_KEY;
  const publicAddress = process.env.AGENT_A_PUBLIC_ADDRESS;
  const firecrawlApiKey = process.env.BID_FIRECRAWL_API_KEY;

  if (!privateKey) {
    console.error('❌ No private key found. Set AGENT_A_PRIVATE_KEY in agents/.env');
    process.exit(1);
  }

  if (!firecrawlApiKey) {
    console.error('❌ No Firecrawl API key found. Set BID_FIRECRAWL_API_KEY in agents/.env');
    process.exit(1);
  }

  console.log('✅ Environment variables loaded');
  console.log(`🔑 Using private key: ${privateKey.slice(0, 10)}...`);
  console.log(`🔑 Expected address: ${publicAddress}`);
  console.log(`🔑 Firecrawl API key: ${firecrawlApiKey.slice(0, 10)}...\n`);

  try {
    // Step 1: Create account from private key
    console.log('📝 Step 1: Creating account from private key...');
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(`   ✅ Account address: ${account.address}`);

    if (publicAddress && account.address.toLowerCase() !== publicAddress.toLowerCase()) {
      console.warn(`   ⚠️  Address mismatch! Expected ${publicAddress}, got ${account.address}`);
    }

    // Step 2: Check USDC balance on Base mainnet
    console.log('\n💰 Step 2: Checking USDC balance on Base mainnet...');
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const usdcBalance = await publicClient.readContract({
      address: USDC_BASE_MAINNET,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint;

    const usdcFormatted = Number(usdcBalance) / 1e6;
    console.log(`   ✅ USDC Balance: $${usdcFormatted.toFixed(6)}`);

    if (usdcFormatted < 0.01) {
      console.error('   ❌ Insufficient USDC! Need at least $0.01 for Firecrawl payment');
      console.log('   💡 Fund this wallet with USDC on Base mainnet');
      process.exit(1);
    }

    // Step 3: Create wallet client for Base mainnet
    console.log('\n🔗 Step 3: Creating wallet client for Base mainnet...');
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http()
    }).extend(publicActions);

    console.log('   ✅ Wallet client created');
    console.log(`   Chain: ${walletClient.chain.name} (ID: ${walletClient.chain.id})`);
    console.log(`   Account: ${walletClient.account.address}`);

    // Step 4: Wrap fetch with x402 payment handling
    console.log('\n💳 Step 4: Configuring x402 payment wrapper...');
    const fetchWithPayment = wrapFetchWithPayment(
      fetch,
      walletClient as any,
      BigInt(0.50 * 10 ** 6) // Allow up to $0.50 USDC for search
    );

    console.log('   ✅ x402 payment wrapper configured (max $0.50)');

    // Step 5: Test query
    const testQuery = 'poker bluffing strategies';
    console.log(`\n🔍 Step 5: Testing search query: "${testQuery}"`);

    // Step 6: Call Firecrawl search API with x402 payment
    console.log('📡 Step 6: Making request to Firecrawl API...');
    console.log('   Endpoint: https://api.firecrawl.dev/v2/x402/search');
    console.log('   Method: POST');
    console.log('   Body: { query, limit: 5, sources: ["web"] }');

    const startTime = Date.now();
    const response = await fetchWithPayment('https://api.firecrawl.dev/v2/x402/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        query: testQuery,
        limit: 5,
        sources: ['web']
      })
    });
    const duration = Date.now() - startTime;

    console.log(`\n📊 Step 7: Response received (${duration}ms)`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log('   Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

    // Step 8: Parse response
    if (!response.ok) {
      console.log('\n❌ Step 8: Response NOT OK');
      const errorText = await response.text();
      console.error('   Error body:', errorText);

      if (response.status === 402) {
        console.log('\n🔍 DIAGNOSIS: Received 402 Payment Required');
        console.log('   This means x402-fetch did NOT automatically handle the payment!');
        console.log('   Possible causes:');
        console.log('   1. Wallet signing failed silently');
        console.log('   2. Insufficient USDC (despite balance check)');
        console.log('   3. RPC connectivity issue');
        console.log('   4. x402-fetch version mismatch');
        console.log('   5. Account/wallet client configuration issue');
      }

      process.exit(1);
    }

    console.log('✅ Step 8: Response OK - Payment successful!');
    const result = await response.json();

    console.log('\n📄 Step 9: Response data structure:', {
      hasData: !!result.data,
      hasWeb: !!result.data?.web,
      webResultsCount: result.data?.web?.length || 0
    });

    // Display results
    const articles = result.data?.web || [];
    console.log(`\n📰 Found ${articles.length} poker strategy articles:`);

    articles.forEach((article: any, index: number) => {
      console.log(`\n${index + 1}. ${article.title || 'No title'}`);
      console.log(`   URL: ${article.url || 'No URL'}`);
      console.log(`   Description: ${article.description?.substring(0, 100) || 'No description'}...`);
    });

    console.log('\n🎉 Firecrawl x402 integration test PASSED!');
    console.log('💡 This means:');
    console.log('   ✅ x402 payment was processed automatically');
    console.log('   ✅ Firecrawl API accepted the payment');
    console.log('   ✅ Search results were returned');
    console.log('\n✨ The poker agents should be able to use web search successfully!');

  } catch (error: any) {
    console.error('\n💥 Test FAILED with exception:', error.message);
    console.error('Stack trace:', error.stack);

    if (error.message.includes('insufficient funds')) {
      console.log('\n💡 Tip: Make sure your wallet has USDC on Base mainnet');
      console.log(`   Wallet: ${process.env.AGENT_A_PUBLIC_ADDRESS}`);
      console.log('   Network: Base (mainnet)');
      console.log('   Token: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)');
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      console.log('\n💡 Tip: Check your network connection and Base RPC endpoint');
    } else if (error.message.includes('x402')) {
      console.log('\n💡 Tip: Check x402-fetch library version and configuration');
    } else if (error.message.includes('account') || error.message.includes('wallet')) {
      console.log('\n💡 Tip: Check wallet client and account setup');
    }

    process.exit(1);
  }
}

// Run the test
testPokerFirecrawl402().catch(console.error);
