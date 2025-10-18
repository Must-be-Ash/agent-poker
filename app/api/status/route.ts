import { NextRequest, NextResponse } from 'next/server';
import { getBidRecord } from '@/lib/db';
import { AUCTION_DURATION_MS } from '@/lib/x402-config';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const basename = searchParams.get('basename');

  if (!basename) {
    return NextResponse.json({ error: 'Basename is required' }, { status: 400 });
  }

  try {
    const bidRecord = await getBidRecord(basename);

    if (!bidRecord) {
      return NextResponse.json({
        basename,
        currentBid: null,
        timeRemaining: null,
        bidHistory: [],
      });
    }

    // Calculate time remaining
    const auctionEndTime = new Date(bidRecord.auctionStartTime.getTime() + AUCTION_DURATION_MS);
    const timeRemaining = Math.max(0, Math.floor((auctionEndTime.getTime() - Date.now()) / 1000));

    return NextResponse.json({
      basename,
      currentBid: bidRecord.currentBid,
      currentWinner: bidRecord.currentWinner,
      timeRemaining,
      bidHistory: bidRecord.bidHistory.map((bid) => ({
        agentId: bid.agentId,
        amount: bid.amount,
        timestamp: bid.timestamp,
        txHash: bid.txHash,
        thinking: bid.thinking,
        strategy: bid.strategy,
        reasoning: bid.reasoning,
        reflection: bid.reflection,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching auction status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch auction status' },
      { status: 500 }
    );
  }
}
