import { CdpClient } from '@coinbase/cdp-sdk';
import { encodeFunctionData, createPublicClient, http, createWalletClient, publicActions } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { labelhash, normalize } from 'viem/ens';

let cdp: CdpClient;
let serverAccount: Awaited<ReturnType<CdpClient['evm']['getAccount']>>;

// ERC-20 ABI for transfer function
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Basename contract (Base Mainnet)
const BASENAME_CONTRACT_ADDRESS = '0x03c4738ee98ae44591e1a4a4f3cab6641d95dd9a';

// ERC-721 ABI for safeTransferFrom
const ERC721_ABI = [
  {
    name: 'safeTransferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }]
  }
] as const;

export async function initializeWallet() {
  if (cdp && serverAccount) {
    return { cdp, serverAccount };
  }

  // Initialize CDP client (automatically loads from environment variables)
  cdp = new CdpClient();

  // Get the existing server account by address (the one that owns the basename)
  const serverAddress = process.env.SERVER_WALLET_ADDRESS;
  if (!serverAddress) {
    throw new Error('SERVER_WALLET_ADDRESS not set in environment');
  }

  serverAccount = await cdp.evm.getAccount({
    address: serverAddress as `0x${string}`
  });

  console.log(`✅ Server wallet initialized: ${serverAccount.address}`);

  return { cdp, serverAccount };
}

export async function getServerWalletClient() {
  const serverPrivateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!serverPrivateKey) {
    throw new Error('SERVER_WALLET_PRIVATE_KEY not set in environment');
  }

  const account = privateKeyToAccount(serverPrivateKey as `0x${string}`);

  // Create wallet client with public actions for x402
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  }).extend(publicActions);

  return walletClient;
}

export async function getMainnetWalletClient() {
  const serverPrivateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!serverPrivateKey) {
    throw new Error('SERVER_WALLET_PRIVATE_KEY not set in environment');
  }

  const account = privateKeyToAccount(serverPrivateKey as `0x${string}`);

  // Create wallet client for Base Mainnet (for Basename transfers)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  }).extend(publicActions);

  return walletClient;
}

export async function getWalletBalance(): Promise<{ eth: string; usdc: string }> {
  const { serverAccount } = await initializeWallet();

  // Create public client to read balances
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  // Get ETH balance
  const ethBalance = await publicClient.getBalance({
    address: serverAccount.address as `0x${string}`,
  });

  // Get USDC balance
  const usdcBalance = await publicClient.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [serverAccount.address as `0x${string}`],
  });

  return {
    eth: (Number(ethBalance) / 1e18).toFixed(6),
    usdc: (Number(usdcBalance) / 1e6).toFixed(6), // USDC has 6 decimals
  };
}

export async function sendRefund(
  toAddress: string,
  amountUSDC: number,
  network: 'base-sepolia' = 'base-sepolia'
): Promise<string> {
  const { cdp, serverAccount } = await initializeWallet();

  console.log(`💸 Sending USDC refund of ${amountUSDC} USDC to ${toAddress}...`);

  // USDC has 6 decimals
  const amountInAtomicUnits = BigInt(Math.floor(amountUSDC * 1_000_000));

  // Send USDC transfer using CDP SDK
  // This is the economic signal that tells the agent they've been outbid
  const { transactionHash } = await cdp.evm.sendTransaction({
    address: serverAccount.address,
    transaction: {
      to: USDC_BASE_SEPOLIA,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [toAddress as `0x${string}`, amountInAtomicUnits],
      }),
    },
    network: network,
  });

  console.log(`✅ Refund sent! Tx: https://sepolia.basescan.org/tx/${transactionHash}`);

  return transactionHash;
}

export async function fundWalletFromFaucet(
  network: 'base-sepolia' = 'base-sepolia',
  token: 'eth' | 'usdc' = 'eth'
): Promise<string> {
  const { cdp, serverAccount } = await initializeWallet();

  console.log(`🚰 Requesting ${token.toUpperCase()} from faucet for ${serverAccount.address}...`);

  const { transactionHash } = await cdp.evm.requestFaucet({
    address: serverAccount.address,
    network,
    token,
  });

  console.log(`✅ Faucet funded! Tx: https://sepolia.basescan.org/tx/${transactionHash}`);

  return transactionHash;
}

/**
 * Transfers a Basename (ENS domain) to a winner's wallet address
 * Network: Base Mainnet
 * @param basename - Full basename (e.g., "x402agent.base.eth")
 * @param toAddress - Winner's wallet address
 * @returns Transaction hash of the transfer
 */
export async function transferBasename(
  basename: string,
  toAddress: string
): Promise<string> {
  const walletClient = await getMainnetWalletClient();
  const serverAddress = process.env.SERVER_WALLET_ADDRESS;

  if (!serverAddress) {
    throw new Error('SERVER_WALLET_ADDRESS not set in environment');
  }

  // Extract label from full basename (e.g., "x402agent" from "x402agent.base.eth")
  const label = basename.replace('.base.eth', '');

  // Convert label to token ID using ENS labelhash
  const tokenId = labelhash(normalize(label));

  console.log(`🏷️  Transferring Basename: ${basename}`);
  console.log(`   Label: ${label}`);
  console.log(`   Token ID: ${tokenId}`);
  console.log(`   From: ${serverAddress}`);
  console.log(`   To: ${toAddress}`);

  try {
    // Verify server owns the basename before attempting transfer
    const owner = await walletClient.readContract({
      address: BASENAME_CONTRACT_ADDRESS,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });

    if (owner.toLowerCase() !== serverAddress.toLowerCase()) {
      throw new Error(
        `Server does not own this Basename. Owner: ${owner}, Server: ${serverAddress}`
      );
    }

    console.log(`✅ Ownership verified. Initiating transfer...`);

    // Transfer the ERC-721 token (Basename) to the winner
    const hash = await walletClient.writeContract({
      address: BASENAME_CONTRACT_ADDRESS,
      abi: ERC721_ABI,
      functionName: 'safeTransferFrom',
      args: [serverAddress as `0x${string}`, toAddress as `0x${string}`, BigInt(tokenId)],
    });

    console.log(`✅ Basename transferred! Tx: https://basescan.org/tx/${hash}`);

    return hash;
  } catch (error: unknown) {
    console.error(`❌ Basename transfer failed:`, error);
    throw new Error(
      `Failed to transfer Basename: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
