import { NextRequest, NextResponse } from 'next/server';
import { getBidRecord } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Get basename from query params
    const basename = request.nextUrl.searchParams.get('basename');

    if (!basename) {
      return NextResponse.json(
        { error: 'basename query parameter is required' },
        { status: 400 }
      );
    }

    // Fetch bid record from MongoDB
    const bidRecord = await getBidRecord(basename);

    if (!bidRecord) {
      return NextResponse.json(
        {
          basename,
          status: 'not_started',
          currentBid: null,
          currentWinner: null,
          bidHistory: [],
          auctionStartTime: null,
          auctionEndTime: null,
        },
        { status: 200 }
      );
    }

    // Check if auction should be marked as ended
    if (bidRecord.auctionEndTime && new Date() > bidRecord.auctionEndTime && bidRecord.status === 'active') {
      bidRecord.status = 'ended';
    }

    // Calculate time remaining
    const timeRemaining = bidRecord.auctionEndTime
      ? Math.max(0, Math.floor((bidRecord.auctionEndTime.getTime() - Date.now()) / 1000))
      : null;

    return NextResponse.json({
      basename: bidRecord.basename,
      status: bidRecord.status,
      currentBid: bidRecord.currentBid,
      currentWinner: bidRecord.currentWinner,
      bidHistory: bidRecord.bidHistory,
      auctionStartTime: bidRecord.auctionStartTime,
      auctionEndTime: bidRecord.auctionEndTime,
      timeRemaining,
    });

  } catch (error) {
    console.error('❌ Error fetching status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
