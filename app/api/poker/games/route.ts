/**
 * Poker Games List Endpoint
 * GET /api/poker/games
 *
 * Returns list of all poker games with their current status
 */

import { NextResponse } from 'next/server';
import { getAllPokerGames } from '@/lib/poker-db';

export async function GET() {
  try {
    const games = await getAllPokerGames();

    // Transform games for dashboard view
    const gameInfoList = games.map((game) => ({
      gameId: game.gameId,
      handNumber: game.handNumber,
      bettingRound: game.bettingRound,
      pot: game.pot,
      currentBet: game.currentBet,
      gameStatus: game.gameStatus,
      players: game.players.map((p) => ({
        agentId: p.agentId,
        agentName: p.agentName,
        chipStack: p.chipStack,
        status: p.status,
      })),
      currentPlayerIndex: game.currentPlayerIndex,
      smallBlind: game.smallBlind,
      bigBlind: game.bigBlind,
      updatedAt: game.updatedAt.toISOString(),
    }));

    // Sort by most recently updated first
    gameInfoList.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({
      success: true,
      games: gameInfoList,
      count: gameInfoList.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching poker games:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch poker games',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
