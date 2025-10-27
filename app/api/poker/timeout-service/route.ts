/**
 * Timeout Service Management Endpoint
 * GET /api/poker/timeout-service
 *
 * Provides status and control for the timeout checker service
 */

import { NextResponse } from 'next/server';
import { checkAllGamesForTimeouts } from '@/lib/poker/timeout-checker';

/**
 * GET endpoint - Manually triggers a timeout check
 * This is useful for testing and can be called periodically by a cron job
 */
export async function GET() {
  try {
    console.log(`🔍 [Timeout Service API] Manual timeout check triggered`);

    const timeoutsProcessed = await checkAllGamesForTimeouts();

    return NextResponse.json({
      success: true,
      timeoutsProcessed,
      message:
        timeoutsProcessed > 0
          ? `Processed ${timeoutsProcessed} timeout(s)`
          : 'No timeouts found',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('❌ [Timeout Service API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check timeouts',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint - Force check a specific game
 * Body: { gameId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gameId } = body;

    if (!gameId) {
      return NextResponse.json(
        { error: 'gameId is required' },
        { status: 400 }
      );
    }

    const { checkGameTimeout } = await import('@/lib/poker/timeout-checker');
    const hadTimeout = await checkGameTimeout(gameId);

    return NextResponse.json({
      success: true,
      gameId,
      hadTimeout,
      message: hadTimeout
        ? 'Timeout processed and player auto-folded'
        : 'No timeout detected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('❌ [Timeout Service API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check game timeout',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
