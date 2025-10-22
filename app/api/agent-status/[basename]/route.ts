import { NextRequest, NextResponse } from 'next/server';
import { broadcastEvent } from '@/lib/events';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ basename: string }> }
) {
  const { basename } = await params;
  const body = await request.json();
  const { agentId, status } = body;

  if (!agentId || !status) {
    return NextResponse.json(
      { error: 'agentId and status are required' },
      { status: 400 }
    );
  }

  console.log(`🤖 [${agentId}] Status update: ${status}`);

  // Store agent status event
  await broadcastEvent(basename, 'agent_status', {
    agentId,
    status, // 'thinking', 'idle', etc.
  });

  return NextResponse.json({ success: true });
}

