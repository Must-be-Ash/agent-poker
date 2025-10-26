/**
 * Poker Game State Endpoint
 * Returns filtered game state visible to a specific agent
 * GET /api/poker/[gameId]/state
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPokerGame } from '@/lib/poker-db';
import type { Card } from '@/types/poker';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    const agentId = request.headers.get('X-Agent-ID');

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID required (X-Agent-ID header)' },
        { status: 400 }
      );
    }

    // Get game state from database
    const game = await getPokerGame(gameId);
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.gameStatus === 'ended') {
      return NextResponse.json({ error: 'Game has ended' }, { status: 410 });
    }

    // Find the requesting player
    const player = game.players.find((p) => p.agentId === agentId);
    if (!player) {
      return NextResponse.json(
        { error: `Player ${agentId} not found in game` },
        { status: 404 }
      );
    }

    // Check if it's this player's turn
    const currentPlayer = game.players[game.currentPlayerIndex];
    const isYourTurn = currentPlayer.agentId === agentId;

    // Determine legal actions based on game state and player position
    const legalActions: string[] = [];

    if (isYourTurn) {
      // Folding is always legal on your turn (unless you're all-in)
      if (player.status !== 'all-in') {
        legalActions.push('fold');
      }

      // Check if player can check (no bet to call)
      if (game.currentBet === player.currentBet) {
        legalActions.push('check');
      }

      // Check if player can call
      const callAmount = game.currentBet - player.currentBet;
      if (callAmount > 0 && callAmount <= player.chipStack) {
        legalActions.push('call');
      }

      // Check if player can bet (no current bet)
      if (game.currentBet === 0 && player.chipStack > 0) {
        legalActions.push('bet');
      }

      // Check if player can raise
      if (game.currentBet > 0 && player.chipStack > callAmount) {
        legalActions.push('raise');
      }
    }

    // Calculate minimum raise amount (typically the size of the current bet)
    const minimumRaise = game.currentBet > 0 ? game.currentBet * 2 : game.bigBlind;

    // Calculate pot odds (if facing a bet)
    let potOdds: number | undefined;
    const callAmount = game.currentBet - player.currentBet;
    if (callAmount > 0) {
      potOdds = callAmount / (game.pot + callAmount);
    }

    // Determine position names
    const getPositionName = (playerState: typeof game.players[0]): string => {
      if (playerState.isDealer) return 'DEALER';
      if (playerState.isSmallBlind) return 'SMALL_BLIND';
      if (playerState.isBigBlind) return 'BIG_BLIND';
      return 'PLAYER';
    };

    // Build player summaries (hide opponent hole cards)
    const players = game.players.map((p) => ({
      name: p.agentName,
      chips: p.chipStack,
      status: p.status,
      currentBet: p.currentBet,
      position: getPositionName(p),
      isDealer: p.isDealer,
      isSmallBlind: p.isSmallBlind,
      isBigBlind: p.isBigBlind,
      // Only reveal this player's cards, hide opponents' cards
      cards: p.agentId === agentId ? p.cards : null,
    }));

    // Format cards for JSON response
    const formatCard = (card: Card) => ({
      rank: card.rank,
      suit: card.suit,
    });

    // Build response
    const response = {
      gameId: game.gameId,
      yourCards: player.cards ? player.cards.map(formatCard) : null,
      communityCards: game.communityCards.map(formatCard),
      pot: game.pot,
      yourChips: player.chipStack,
      yourCurrentBet: player.currentBet,
      currentBet: game.currentBet,
      bettingRound: game.bettingRound,
      isYourTurn,
      yourPosition: getPositionName(player),
      yourStatus: player.status,
      handNumber: game.handNumber,
      players,
      legalActions,
      minimumRaise,
      potOdds,
      smallBlind: game.smallBlind,
      bigBlind: game.bigBlind,
    };

    console.log(`📊 [State] ${agentId} queried game state - Turn: ${isYourTurn ? 'YES' : 'NO'}`);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`❌ [State] Error fetching game state for ${gameId}:`, error);

    return NextResponse.json(
      {
        error: 'Failed to fetch game state',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Agent-ID',
      },
    }
  );
}
