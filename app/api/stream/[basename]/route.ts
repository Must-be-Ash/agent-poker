import { NextRequest } from 'next/server';
import { registerConnection, unregisterConnection } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ basename: string }> }
) {
  const { basename } = await params;

  const stream = new ReadableStream({
    start(controller) {
      // Register this connection
      registerConnection(basename, controller);

      // Send initial connection message
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
      );

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        unregisterConnection(basename, controller);
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


