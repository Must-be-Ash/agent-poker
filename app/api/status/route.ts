import { NextRequest, NextResponse } from 'next/server';
import { getBidRecord } from '@/lib/db';

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
        bidHistory: [],
      });
    }

    return NextResponse.json({
      basename,
      currentBid: bidRecord.currentBid,
      currentWinner: bidRecord.currentWinner,
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
  } catch (error: unknown) {
    console.error('Error fetching auction status:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Failed to fetch auction status' },
      { status: 500 }
    );
  }
}
