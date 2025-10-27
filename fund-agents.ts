import { initializeWallet, sendRefund, getWalletBalance } from './lib/wallet';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';
import { Hex } from 'viem';

// Load both env files - CDP credentials and agent keys
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'agents/.env' });

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

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

async function getUSDCBalance(address: string): Promise<string> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });

  // USDC has 6 decimals
  return (Number(balance) / 1_000_000).toFixed(2);
}

async function fundAgent(agentName: string, privateKey: Hex, amount: number, retryCount = 0) {
  console.log(`\n🤖 Funding ${agentName}...`);

  // Derive address from private key
  const account = privateKeyToAccount(privateKey);
  console.log(`   Address: ${account.address}`);

  // Check initial balance
  const initialBalance = await getUSDCBalance(account.address);
  console.log(`   Initial USDC balance: ${initialBalance}`);

  // Send USDC from server wallet
  console.log(`   💸 Sending ${amount} USDC from server wallet...`);

  try {
    const txHash = await sendRefund(account.address, amount);
    console.log(`   ✅ Transfer initiated`);
    console.log(`   Transaction hash: ${txHash}`);
  } catch (error: any) {
    if (error.message?.includes('Nonce too low') && retryCount < 3) {
      console.log(`   ⚠️  Nonce conflict detected, retrying in 10 seconds... (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return fundAgent(agentName, privateKey, amount, retryCount + 1);
    }
    console.error(`   ❌ Error sending USDC: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('🚀 Splitting server wallet USDC evenly between Agent A and Agent B...\n');

  const agentAKey = process.env.AGENT_A_PRIVATE_KEY as Hex;
  const agentBKey = process.env.AGENT_B_PRIVATE_KEY as Hex;

  if (!agentAKey || !agentBKey) {
    console.error('❌ Agent private keys not found in agents/.env');
    process.exit(1);
  }

  // Initialize server wallet and check balance
  console.log('🔗 Initializing server wallet...');
  const { serverAccount } = await initializeWallet();
  console.log(`✅ Server wallet: ${serverAccount.address}\n`);

  // Get current server balance
  const serverBalance = await getWalletBalance();
  const currentUSDC = parseFloat(serverBalance.usdc);
  
  console.log('📊 Server wallet balance:');
  console.log(`💵 USDC: ${currentUSDC} USDC\n`);

  if (currentUSDC < 2) {
    console.log('❌ Insufficient USDC balance for funding agents');
    console.log(`   Required: At least 2 USDC (1 USDC per agent)`);
    console.log(`   Available: ${currentUSDC} USDC`);
    process.exit(1);
  }

  // Calculate split amount (leave some for gas/fees)
  const reserveAmount = 1; // Keep 1 USDC in server wallet
  const availableAmount = currentUSDC - reserveAmount;
  const amountPerAgent = Math.floor(availableAmount / 2);

  console.log('📋 Funding Plan:');
  console.log(`   • Available for agents: ${availableAmount} USDC`);
  console.log(`   • Amount per agent: ${amountPerAgent} USDC`);
  console.log(`   • Reserve in server: ${reserveAmount} USDC\n`);

  if (amountPerAgent < 1) {
    console.log('❌ Not enough USDC to fund both agents');
    console.log(`   Each agent needs at least 1 USDC`);
    process.exit(1);
  }

  // Fund Agent A
  await fundAgent('Agent A', agentAKey, amountPerAgent);

  // Wait between transfers
  console.log('\n⏳ Waiting 15 seconds between transfers to avoid nonce conflicts...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Fund Agent B
  await fundAgent('Agent B', agentBKey, amountPerAgent);

  // Wait for transactions to process
  console.log('\n⏳ Waiting for transactions to confirm (15 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Check final balances
  console.log('\n📊 Final balances:');
  const accountA = privateKeyToAccount(agentAKey);
  const accountB = privateKeyToAccount(agentBKey);

  const finalBalanceA = await getUSDCBalance(accountA.address);
  const finalBalanceB = await getUSDCBalance(accountB.address);
  const finalServerBalance = await getWalletBalance();

  console.log(`   Agent A (${accountA.address}): ${finalBalanceA} USDC`);
  console.log(`   Agent B (${accountB.address}): ${finalBalanceB} USDC`);
  console.log(`   Server (${serverAccount.address}): ${finalServerBalance.usdc} USDC`);

  console.log('\n✅ Agent wallet funding complete!');
}

main().catch(console.error);
