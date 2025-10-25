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
  participatingAgents?: {
    agentId: string;
    walletAddress?: string;
    status: 'active' | 'withdrawn';
    firstSeen: Date;
    lastActivity: Date;
  }[];
  auctionStartTime: Date;
  auctionEndTime: Date;
  status: 'active' | 'ended' | 'finalized';
  winnerNotified: boolean;
  basenameTransferTxHash?: string;
  withdrawnAgents?: string[]; // List of agents who withdrew (deprecated - use participatingAgents instead)
  auctionEnded?: boolean; // True if auction ended
  auctionEndReason?: 'withdrawal'; // Why auction ended
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

export interface AuctionEvent {
  _id?: ObjectId;
  basename: string;
  eventType:
    | 'agent_evaluation_start'
    | 'agent_tool_call'
    | 'agent_tool_response'
    | 'agent_thinking'
    | '402_call_initiated'
    | '402_response_received'
    | 'payment_signing'
    | 'payment_sent'
    | 'bid_placed'
    | 'post_bid_analysis'
    | 'refund_detected'
    | 'refund_issued'
    | 'withdrawal_decision'
    | 'auction_ended'
    | 'basename_transferred'
    | 'basename_transfer_failed'
    | 'agent_status'
    | 'firecrawl_402_call'
    | 'firecrawl_results'
    | 'budget_determined';
  agentId?: string;
  sequence: number;
  timestamp: Date;
  data: Record<string, unknown>;
  createdAt: Date;
}
