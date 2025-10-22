import { NextRequest, NextResponse } from 'next/server';
import { storeEvent } from '@/lib/events';
import type { AuctionEvent } from '@/types';

/**
 * Endpoint for agents to emit events
 * Agents POST events here for full observability
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ basename: string }> }
) {
  const { basename } = await params;

  try {
    const body = await request.json();
    const { eventType, agentId, data } = body;

    console.log(`📥 [EMIT API] Received event: ${eventType} from ${agentId} for ${basename}`);
    console.log(`   Body:`, JSON.stringify(body, null, 2));

    if (!eventType) {
      return NextResponse.json(
        { error: 'eventType is required' },
        { status: 400 }
      );
    }

    console.log(`🔄 [EMIT API] Calling storeEvent...`);
    await storeEvent(basename, eventType as AuctionEvent['eventType'], {
      ...data,
      agentId,
    });

    console.log(`✅ [EMIT API] Event stored successfully`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ [EMIT API] Error emitting event:', error);
    return NextResponse.json(
      { error: 'Failed to emit event' },
      { status: 500 }
    );
  }
}
