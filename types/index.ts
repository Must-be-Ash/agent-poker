import { ObjectId } from 'mongodb';

export interface BidRecord {
  _id?: ObjectId;
  basename: string;
  currentBid: number; // USDC amount
  currentWinner: {
    agentId: string;
    walletAddress: string;
    externalId: string; // x402 external ID
    timestamp: Date;
  } | null;
  bidHistory: {
    agentId: string;
    walletAddress: string;
    amount: number;
    timestamp: Date;
    txHash?: string;
    thinking?: string;
    strategy?: string;
    reasoning?: string;
    reflection?: string;
  }[];
  auctionStartTime: Date;
  auctionEndTime: Date;
  status: 'active' | 'ended' | 'finalized';
  winnerNotified: boolean;
  basenameTransferTxHash?: string;
  withdrawnAgents?: string[]; // List of agents who withdrew
  auctionEnded?: boolean; // True if auction ended early
  auctionEndReason?: 'withdrawal' | 'timeout'; // Why auction ended
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentConfig {
  name: string;
  privateKey: `0x${string}`;
  walletAddress: string;
  maxBid: number;
}

export interface BidEvent {
  type: 'bid' | 'refund' | 'auction_end' | 'transfer_complete';
  agentId: string;
  amount: number;
  timestamp: Date;
  message: string;
}
