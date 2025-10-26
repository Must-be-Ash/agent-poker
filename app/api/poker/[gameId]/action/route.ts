/**
 * Poker Action Endpoint
 * Handles all poker actions with x402 payment integration
 * POST /api/poker/[gameId]/action
 */

import { NextRequest, NextResponse } from 'next/server';
import { verify, settle } from 'x402/facilitator';
import type { PaymentPayload } from 'x402/types';
import { getPokerGame, updateGameState, addActionToHistory } from '@/lib/poker-db';
import { PokerGame } from '@/lib/poker/game-state';
import { getServerWalletClient } from '@/lib/wallet';
import {
  calculatePokerPayment,
  formatPaymentAmount,
  requiresPayment,
  validatePaymentAction,
  createPaymentRequirements,
  facilitatorConfig,
} from '@/lib/x402-poker-config';
import type { PokerActionType } from '@/types/poker';
import { storeEvent } from '@/lib/events';
import { withSettlementLock } from '@/lib/poker/settlement-lock';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    // Get payment header and action details
    const paymentHeader = request.headers.get('X-PAYMENT');
    const agentId = request.headers.get('X-Agent-ID') || 'unknown';
    const actionTypeHeader = request.headers.get('X-ACTION') as PokerActionType;
    const amountHeader = request.headers.get('X-AMOUNT');

    // Parse request body for additional context
    let requestBody: Record<string, unknown> = {};
    try {
      requestBody = await request.json();
    } catch {
      // No body or invalid JSON
    }

    const actionType = actionTypeHeader || (requestBody.action as PokerActionType);
    const amount = amountHeader ? parseFloat(amountHeader) : (requestBody.amount as number | undefined);

    if (!actionType) {
      return NextResponse.json(
        { error: 'Action type required (X-ACTION header or action in body)' },
        { status: 400 }
      );
    }

    // Get current game state from MongoDB
    const gameRecord = await getPokerGame(gameId);
    if (!gameRecord) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Check if game has ended
    if (gameRecord.gameStatus === 'ended') {
      return NextResponse.json({ error: 'Game has ended' }, { status: 410 });
    }

    // Reconstruct PokerGame instance from database state
    // (We'll need to handle this differently - for now, validate manually)
    const player = gameRecord.players.find((p) => p.agentId === agentId);
    if (!player) {
      return NextResponse.json({ error: `Player ${agentId} not found in game` }, { status: 404 });
    }

    // Validate it's this player's turn
    const currentPlayer = gameRecord.players[gameRecord.currentPlayerIndex];
    if (currentPlayer.agentId !== agentId) {
      return NextResponse.json(
        { error: `Not your turn. Waiting for ${currentPlayer.agentName}` },
        { status: 400 }
      );
    }

    // Calculate payment amount required
    let paymentAmount = 0;
    if (requiresPayment(actionType)) {
      try {
        paymentAmount = calculatePokerPayment(
          actionType,
          amount,
          gameRecord.currentBet,
          player.currentBet
        );
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // Validate payment action
      const validation = validatePaymentAction(
        actionType,
        paymentAmount,
        gameRecord.currentBet,
        player.chipStack
      );

      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    // If no payment header but payment required, return 402
    if (requiresPayment(actionType) && !paymentHeader) {
      const requirements = createPaymentRequirements(
        paymentAmount,
        actionType,
        `${actionType} ${formatPaymentAmount(paymentAmount)} in ${gameId}`
      );

      console.log(`💳 [${agentId}] Payment required for ${actionType}: ${formatPaymentAmount(paymentAmount)}`);

      return NextResponse.json(requirements, {
        status: 402,
        headers: {
          'X-Payment-Required': 'true',
          'X-Payment-Amount': formatPaymentAmount(paymentAmount),
        },
      });
    }

    // Use settlement lock to prevent concurrent settlements
    return await withSettlementLock(gameId, `poker_action_${actionType}`, agentId, async () => {
      // Verify and settle payment if required
      let settlementResult;
      if (requiresPayment(actionType) && paymentHeader) {
        console.log(`🔍 [${agentId}] Verifying payment for ${actionType}...`);

        // Verify payment with facilitator
        const payload: PaymentPayload = JSON.parse(
          Buffer.from(paymentHeader, 'base64').toString()
        );

        const verification = await verify(payload, facilitatorConfig.url);
        if (!verification.valid) {
          throw new Error('Payment verification failed');
        }

        console.log(`✅ [${agentId}] Payment verified`);

        // Settle payment on-chain
        const walletClient = await getServerWalletClient();
        settlementResult = await settle(payload, walletClient as any, facilitatorConfig.url);

        console.log(`💰 [${agentId}] Payment settled: ${settlementResult.hash}`);
      }

      // Process the action and update game state
      // For now, we'll update the database directly
      // TODO: This should use PokerGame class methods for proper validation

      // Update player state based on action
      const updatedPlayers = [...gameRecord.players];
      const playerIndex = updatedPlayers.findIndex((p) => p.agentId === agentId);

      switch (actionType) {
        case 'fold':
          updatedPlayers[playerIndex].status = 'folded';
          updatedPlayers[playerIndex].cards = null;
          break;

        case 'check':
          // No state change for check
          break;

        case 'call':
          updatedPlayers[playerIndex].chipStack -= paymentAmount;
          updatedPlayers[playerIndex].currentBet += paymentAmount;
          updatedPlayers[playerIndex].totalBetThisHand += paymentAmount;
          gameRecord.pot += paymentAmount;

          if (updatedPlayers[playerIndex].chipStack === 0) {
            updatedPlayers[playerIndex].status = 'all-in';
          }
          break;

        case 'bet':
        case 'raise':
          updatedPlayers[playerIndex].chipStack -= paymentAmount;
          updatedPlayers[playerIndex].currentBet += paymentAmount;
          updatedPlayers[playerIndex].totalBetThisHand += paymentAmount;
          gameRecord.pot += paymentAmount;
          gameRecord.currentBet = updatedPlayers[playerIndex].currentBet;

          if (updatedPlayers[playerIndex].chipStack === 0) {
            updatedPlayers[playerIndex].status = 'all-in';
          }
          break;
      }

      // Record action in history
      await addActionToHistory(gameId, {
        handNumber: gameRecord.handNumber,
        bettingRound: gameRecord.bettingRound,
        action: {
          type: actionType,
          amount: paymentAmount,
          playerId: agentId,
          timestamp: new Date(),
        },
        potAfterAction: gameRecord.pot,
        timestamp: new Date(),
      });

      // Update game state in database
      await updateGameState(gameId, {
        players: updatedPlayers,
        pot: gameRecord.pot,
        currentBet: gameRecord.currentBet,
        updatedAt: new Date(),
      });

      // Broadcast action event
      await storeEvent(gameId, 'action_taken', {
        agentId,
        agentName: player.agentName,
        action: actionType,
        amount: paymentAmount,
        pot: gameRecord.pot,
        bettingRound: gameRecord.bettingRound,
      });

      console.log(`✅ [${agentId}] ${actionType}${amount ? ` ${amount}` : ''} - Pot: ${gameRecord.pot}`);

      // TODO: Check if betting round is complete and advance
      // TODO: Check if hand is complete and determine winner
      // This will be implemented when we integrate the full PokerGame class

      return NextResponse.json({
        success: true,
        action: actionType,
        amount: paymentAmount,
        gameState: {
          pot: gameRecord.pot,
          currentBet: gameRecord.currentBet,
          bettingRound: gameRecord.bettingRound,
          yourChips: updatedPlayers[playerIndex].chipStack,
        },
        settlement: settlementResult
          ? {
              hash: settlementResult.hash,
              verified: true,
            }
          : undefined,
      });
    });
  } catch (error: any) {
    console.error(`❌ [${gameId}] Error processing action:`, error);

    return NextResponse.json(
      {
        error: 'Failed to process action',
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, X-Agent-ID, X-ACTION, X-AMOUNT',
      },
    }
  );
}
