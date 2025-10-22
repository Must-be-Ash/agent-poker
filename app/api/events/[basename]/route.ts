import { NextRequest, NextResponse } from 'next/server';
import { getEventsSince } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Polling endpoint for auction events
 * Frontend polls this every 2 seconds with ?after=<lastSequence>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ basename: string }> }
) {
  const { basename } = await params;
  const searchParams = request.nextUrl.searchParams;
  const after = parseInt(searchParams.get('after') || '-1');

  try {
    const events = await getEventsSince(basename, after);

    return NextResponse.json({
      events: events.map(event => ({
        sequence: event.sequence,
        eventType: event.eventType,
        agentId: event.agentId,
        timestamp: event.timestamp,
        data: event.data,
      })),
      count: events.length,
    });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
