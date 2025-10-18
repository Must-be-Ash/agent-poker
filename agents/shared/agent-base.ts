import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { createWalletClient, http, publicActions, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { Hex } from 'viem';

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

export class BiddingAgent {
  private wallet;
  private axiosWithPayment;
  private agentName: string;
  private maxBid: number;
  private serverUrl: string;
  private currentBid: number = 0;
  private isActive: boolean = true;
  private publicClient;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: {
    privateKey: Hex;
    agentName: string;
    maxBid: number;
    serverUrl: string;
  }) {
    this.agentName = config.agentName;
    this.maxBid = config.maxBid;
    this.serverUrl = config.serverUrl;

    // Create wallet client
    this.wallet = createWalletClient({
      chain: baseSepolia,
      transport: http(),
      account: privateKeyToAccount(config.privateKey),
    }).extend(publicActions);

    // Create public client for reading balances
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    // Create axios client with x402 payment interceptor
    this.axiosWithPayment = withPaymentInterceptor(
      axios.create({
        headers: { 'X-Agent-ID': this.agentName }
      }),
      this.wallet
    );

    console.log(`🤖 ${this.agentName} initialized`);
    console.log(`   Wallet: ${this.wallet.account.address}`);
  }

  async getUSDCBalance(): Promise<number> {
    const balance = await this.publicClient.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.wallet.account.address],
    });

    // USDC has 6 decimals
    return Number(balance) / 1_000_000;
  }

  async placeBid(basename: string): Promise<boolean> {
    try {
      console.log(`\n💰 [${this.agentName}] Attempting to bid on ${basename}...`);

      // Check balance before bidding
      const balance = await this.getUSDCBalance();
      console.log(`💵 [${this.agentName}] Current USDC balance: ${balance.toFixed(2)}`);

      if (balance < 1) {
        console.log(`❌ [${this.agentName}] Insufficient balance to bid`);
        this.isActive = false;
        return false;
      }

      const response = await this.axiosWithPayment.post(
        `${this.serverUrl}/api/bid/${basename}`
      );

      if (response.status === 200 && response.data.success) {
        console.log(`✅ [${this.agentName}] Bid successful!`);
        console.log(`   Current bid: $${response.data.currentBid}`);
        console.log(`   Auction ends in: ${response.data.auctionEndsIn}s`);
        console.log(`   Current winner: ${response.data.currentWinner}`);

        this.currentBid = response.data.currentBid;

        // Start monitoring for refunds
        this.startRefundMonitoring(basename);

        return true;
      }

      return false;

    } catch (error: any) {
      if (error.response?.status === 402) {
        console.log(`💳 [${this.agentName}] 402 Payment Required, x402-axios will handle payment...`);
        // x402-axios interceptor will automatically handle payment and retry
      } else if (error.response?.status === 410) {
        console.log(`🏁 [${this.agentName}] Auction ended, stopping agent.`);
        this.isActive = false;
        this.stopRefundMonitoring();
        return false;
      } else {
        console.error(`❌ [${this.agentName}] Error:`, error.message);
      }
      return false;
    }
  }

  startRefundMonitoring(basename: string) {
    if (this.monitoringInterval) {
      // Already monitoring
      return;
    }

    console.log(`👀 [${this.agentName}] Starting refund monitoring...`);

    let previousBalance = 0;

    // Get initial balance
    this.getUSDCBalance().then(balance => {
      previousBalance = balance;
    });

    this.monitoringInterval = setInterval(async () => {
      if (!this.isActive) {
        this.stopRefundMonitoring();
        return;
      }

      const currentBalance = await this.getUSDCBalance();

      if (currentBalance > previousBalance) {
        const refundAmount = currentBalance - previousBalance;
        console.log(`\n🔔 [${this.agentName}] REFUND DETECTED: ${refundAmount.toFixed(2)} USDC`);
        console.log(`   I've been outbid! 😤`);

        // Stop monitoring
        this.stopRefundMonitoring();

        // Wait random delay before bidding again
        const delay = Math.random() * (3000 - 1000) + 1000;
        console.log(`⏳ [${this.agentName}] Waiting ${Math.floor(delay / 1000)}s before retrying...`);

        setTimeout(() => {
          if (this.isActive) {
            this.placeBid(basename);
          }
        }, delay);
      }

      previousBalance = currentBalance;
    }, 2000); // Check every 2 seconds
  }

  stopRefundMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log(`🛑 [${this.agentName}] Stopped refund monitoring`);
    }
  }

  async start(basename: string) {
    console.log(`\n🚀 [${this.agentName}] Starting bidding agent for ${basename}`);

    // Check initial balance
    const balance = await this.getUSDCBalance();
    console.log(`💵 [${this.agentName}] Initial USDC balance: ${balance.toFixed(2)}`);

    await this.placeBid(basename);
  }

  stop() {
    console.log(`🛑 [${this.agentName}] Stopping agent...`);
    this.isActive = false;
    this.stopRefundMonitoring();
  }
}
