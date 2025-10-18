import { NextRequest } from 'next/server';
import { getBidRecord } from '@/lib/db';

export async function GET(request: NextRequest) {
  const basename = request.nextUrl.searchParams.get('basename');

  if (!basename) {
    return new Response('basename query parameter is required', { status: 400 });
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send SSE headers
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Polling interval - check every 2 seconds
      const interval = setInterval(async () => {
        try {
          const bidRecord = await getBidRecord(basename);

          if (!bidRecord) {
            sendEvent('status', {
              basename,
              status: 'not_started',
              currentBid: null,
              currentWinner: null,
              timeRemaining: null,
            });
            return;
          }

          // Check if auction ended
          const now = new Date();
          const isEnded = bidRecord.auctionEndTime && now > bidRecord.auctionEndTime;

          if (isEnded && bidRecord.status === 'active') {
            bidRecord.status = 'ended';
            sendEvent('auction_end', {
              basename: bidRecord.basename,
              winner: bidRecord.currentWinner,
              finalBid: bidRecord.currentBid,
            });
          }

          // Calculate time remaining
          const timeRemaining = bidRecord.auctionEndTime
            ? Math.max(0, Math.floor((bidRecord.auctionEndTime.getTime() - now.getTime()) / 1000))
            : null;

          // Send status update
          sendEvent('status', {
            basename: bidRecord.basename,
            status: bidRecord.status,
            currentBid: bidRecord.currentBid,
            currentWinner: bidRecord.currentWinner,
            bidHistory: bidRecord.bidHistory,
            timeRemaining,
          });

          // If auction ended, stop the stream
          if (bidRecord.status === 'ended' || bidRecord.status === 'finalized') {
            clearInterval(interval);
            controller.close();
          }

        } catch (error) {
          console.error('❌ SSE error:', error);
          sendEvent('error', { message: 'Internal server error' });
        }
      }, 2000); // Poll every 2 seconds

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
