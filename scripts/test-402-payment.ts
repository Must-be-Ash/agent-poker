/**
 * Isolated Test: x402 Payment Flow
 * Tests if agent can successfully make a payment to the poker server
 */

import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load agent environment
dotenv.config({ path: path.resolve(__dirname, 'agents', '.env') });

async function testPayment() {
  console.log('\n🧪 Starting x402 Payment Test\n');
  console.log('='.repeat(60));

  // Configuration
  const serverUrl = process.env.BID_SERVER_URL || 'http://localhost:3000';
  const gameId = process.env.POKER_GAME_ID || 'poker-game-1';
  const agentName = 'agent-b';  // Must match game player name
  const privateKey = process.env.AGENT_B_PRIVATE_KEY as `0x${string}`;

  if (!privateKey) {
    console.error('❌ AGENT_B_PRIVATE_KEY not found in agents/.env');
    process.exit(1);
  }

  console.log(`📍 Server: ${serverUrl}`);
  console.log(`🎮 Game ID: ${gameId}`);
  console.log(`👤 Agent: ${agentName}`);

  // Create wallet client
  const wallet = createWalletClient({
    chain: baseSepolia,
    transport: http(),
    account: privateKeyToAccount(privateKey),
  }).extend(publicActions);

  console.log(`💼 Wallet: ${wallet.account.address}`);

  // Create axios with x402 payment interceptor
  const axiosWithPayment = withPaymentInterceptor(
    axios.create({
      headers: { 'X-Agent-ID': agentName }
    }),
    wallet as any
  );

  console.log('\n' + '='.repeat(60));
  console.log('🔍 Step 1: Check game state');
  console.log('='.repeat(60));

  try {
    const stateResponse = await axios.get(
      `${serverUrl}/api/poker/${gameId}/state`,
      {
        headers: { 'X-Agent-ID': agentName }
      }
    );

    console.log('✅ Game state retrieved');
    console.log(`   Current bet: ${stateResponse.data.currentBet} USDC`);
    console.log(`   Pot: ${stateResponse.data.pot} USDC`);
    console.log(`   Your chips: ${stateResponse.data.yourChips} USDC`);
    console.log(`   Is your turn: ${stateResponse.data.isYourTurn}`);

    if (!stateResponse.data.isYourTurn) {
      console.log('\n⚠️  Not your turn - test may not work correctly');
    }

  } catch (error: any) {
    console.error('❌ Failed to get game state:', error.message);
    if (error.response?.status === 404) {
      console.log('\n💡 Game not found. Start the game first:');
      console.log('   1. Run: npm run dev');
      console.log('   2. Click "Start Game" in http://localhost:3000');
      process.exit(1);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('💳 Step 2: Attempt payment (bet 10 USDC)');
  console.log('='.repeat(60));

  try {
    console.log('\n📤 Sending bet request...');

    const betResponse = await axiosWithPayment.post(
      `${serverUrl}/api/poker/${gameId}/action`,
      {
        action: 'bet',
        amount: 10,
        reasoning: 'Test payment from isolated test script'
      },
      {
        headers: {
          'X-Agent-ID': agentName,
          'X-ACTION': 'bet',
          'X-AMOUNT': '10',
        },
      }
    );

    console.log('\n✅ PAYMENT SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log(`   Status: ${betResponse.status}`);
    console.log(`   Action: ${betResponse.data.action}`);
    console.log(`   Amount: ${betResponse.data.amount} USDC`);

    if (betResponse.data.settlement?.hash) {
      console.log(`   TX Hash: ${betResponse.data.settlement.hash}`);
      console.log(`   🔗 View: https://sepolia.basescan.org/tx/${betResponse.data.settlement.hash}`);
    }

    console.log('\n🎉 x402 Payment Flow: WORKING!');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n❌ PAYMENT FAILED');
    console.log('='.repeat(60));

    if (axios.isAxiosError(error)) {
      console.log(`   Status: ${error.response?.status}`);
      console.log(`   Error: ${error.response?.data?.error || error.message}`);

      if (error.response?.status === 402) {
        console.log('\n📋 402 Response Details:');
        console.log(JSON.stringify(error.response.data, null, 2));

        console.log('\n💡 This might be expected if payment verification failed.');
        console.log('   Check server logs for details.');
      }

      if (error.response?.status === 400) {
        console.log('\n💡 Validation Error Details:');
        console.log(`   ${error.response.data.details || 'No details'}`);
        console.log(`   Hint: ${error.response.data.hint || 'No hint'}`);
      }
    } else {
      console.error(`   ${error.message}`);
    }

    console.log('\n❌ x402 Payment Flow: FAILED');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

// Run test
testPayment().catch((error) => {
  console.error('\n💥 Test crashed:', error);
  process.exit(1);
});
