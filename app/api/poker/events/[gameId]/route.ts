import { NextRequest, NextResponse } from 'next/server';
import { getPokerEventsSince, storePokerEvent } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Polling endpoint for poker game events
 * Frontend polls this every 1-2 seconds with ?after=<lastSequence>
 *
 * Usage:
 * GET /api/poker/events/poker-game-1?after=5
 *
 * Returns events with sequence > 5 for game "poker-game-1"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const after = parseInt(searchParams.get('after') || '-1');

  try {
    const events = await getPokerEventsSince(gameId, after);

    return NextResponse.json({
      events: events.map(event => ({
        sequence: event.sequence,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
      })),
      count: events.length,
      gameId,
    });
  } catch (error: unknown) {
    console.error(`Error fetching poker events for game ${gameId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch poker events' },
      { status: 500 }
    );
  }
}

/**
 * Endpoint for poker agents to emit events
 * Poker agents POST events here for full observability
 *
 * Usage:
 * POST /api/poker/events/poker-game-1
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    const body = await request.json();
    const { eventType, agentId, data } = body;

    console.log(`📥 [POKER EMIT] Received event: ${eventType} from ${agentId} for game ${gameId}`);

    if (!eventType) {
      return NextResponse.json(
        { error: 'eventType is required' },
        { status: 400 }
      );
    }

    // Store event using gameId as the identifier
    await storePokerEvent(gameId, eventType as any, {
      ...data,
      agentId,
      gameId,
    });

    console.log(`✅ [POKER EMIT] Event stored successfully`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('❌ [POKER EMIT] Error emitting event:', error);
    return NextResponse.json(
      { error: 'Failed to emit event' },
      { status: 500 }
    );
  }
}
