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
import { recordPotContribution } from '@/lib/poker/pot-escrow';
import {
  calculatePokerPayment,
  formatPaymentAmount,
  requiresPayment,
  validatePaymentAction,
  createPaymentRequirements,
  facilitatorConfig,
} from '@/lib/x402-poker-config';
import type { PokerActionType } from '@/types/poker';
import { storePokerEvent } from '@/lib/events';
import { withSettlementLock } from '@/lib/poker/settlement-lock';
import { progressGameIfReady } from '@/lib/poker/game-orchestrator';
import { advanceToNextPlayer } from '@/lib/poker/turn-manager';
import { validateAllInBet } from '@/lib/poker/all-in-logic';
import { validateAction, getAvailableActions, getBettingConstraints } from '@/lib/poker/action-validator';
import * as PokerLogger from '@/lib/poker/poker-logger';

/**
 * GET endpoint - Query available actions for an agent
 * Returns what actions the agent can currently take
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    const agentId = request.headers.get('X-Agent-ID') || 'unknown';

    // Get current game state
    const gameRecord = await getPokerGame(gameId);
    if (!gameRecord) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Get player
    const player = gameRecord.players.find((p) => p.agentId === agentId);
    if (!player) {
      return NextResponse.json({ error: `Player ${agentId} not found in game` }, { status: 404 });
    }

    // Get available actions
    const availableActions = getAvailableActions(gameRecord, agentId);
    const constraints = getBettingConstraints(gameRecord, player);
    const currentPlayer = gameRecord.players[gameRecord.currentPlayerIndex];

    return NextResponse.json({
      success: true,
      gameId,
      agentId,
      isYourTurn: currentPlayer.agentId === agentId,
      currentPlayer: {
        agentId: currentPlayer.agentId,
        agentName: currentPlayer.agentName,
      },
      availableActions,
      bettingConstraints: constraints,
      gameState: {
        bettingRound: gameRecord.bettingRound,
        pot: gameRecord.pot,
        currentBet: gameRecord.currentBet,
        yourChips: player.chipStack,
        yourCurrentBet: player.currentBet,
      },
    });
  } catch (error: unknown) {
    console.error(`❌ [${gameId}] Error getting available actions:`, error);
    return NextResponse.json(
      {
        error: 'Failed to get available actions',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

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

    // Get player for logging
    const playerForLogging = gameRecord.players.find((p) => p.agentId === agentId);
    const playerName = playerForLogging?.agentName || agentId;

    // Check if player has already folded
    if (playerForLogging && playerForLogging.status === 'folded') {
      PokerLogger.logActionFailed(gameId, agentId, playerName, actionType, 'Already folded');
      return NextResponse.json(
        {
          error: 'Cannot act - you have already folded this hand',
          details: 'You folded earlier in this hand and cannot take further actions',
          hint: 'Wait for the current hand to complete and a new hand to begin',
          yourStatus: 'folded',
        },
        { status: 400 }
      );
    }

    // Log action attempt
    PokerLogger.logActionAttempt(gameId, agentId, playerName, actionType, amount);

    // Validate the action (comprehensive validation)
    const validation = validateAction(gameRecord, agentId, actionType, amount);
    if (!validation.valid) {
      PokerLogger.logActionFailed(gameId, agentId, playerName, actionType, validation.error || 'Unknown');

      // Include available actions and betting constraints for helpful error messages
      const availableActions = getAvailableActions(gameRecord, agentId);
      const player = gameRecord.players.find((p) => p.agentId === agentId);
      const constraints = player ? getBettingConstraints(gameRecord, player) : null;

      return NextResponse.json(
        {
          error: validation.error,
          details: validation.details,
          hint: validation.hint,
          availableActions,
          bettingConstraints: constraints,
        },
        { status: 400 }
      );
    }

    // Action validated
    PokerLogger.logActionValidated(gameId, agentId, playerName, actionType, amount);

    // Get player (we know it exists from validation)
    const player = gameRecord.players.find((p) => p.agentId === agentId)!;

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

        // For call action, cap payment at player's chip stack (all-in call)
        if (actionType === 'call' && paymentAmount > player.chipStack) {
          console.log(`   💰 [All-In Call] ${player.agentName} has ${player.chipStack} USDC but needs ${paymentAmount} USDC to call`);
          console.log(`   💰 [All-In Call] Adjusting to all-in call with ${player.chipStack} USDC`);
          paymentAmount = player.chipStack;
        }
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // Validate payment action (skip validation for all-in calls)
      const isAllInCall = actionType === 'call' && paymentAmount === player.chipStack;
      if (!isAllInCall) {
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
    }

    // Create payment requirements for actions that require payment
    let paymentRequirements;
    if (requiresPayment(actionType)) {
      paymentRequirements = createPaymentRequirements(
        paymentAmount,
        actionType,
        `${actionType} ${formatPaymentAmount(paymentAmount)} in ${gameId}`
      );
    }

    // If no payment header but payment required, return 402
    if (requiresPayment(actionType) && !paymentHeader) {
      PokerLogger.logPaymentRequired(gameId, agentId, playerName, paymentAmount, actionType);

      return NextResponse.json({
        x402Version: 1,
        accepts: [paymentRequirements],
      }, {
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
        PokerLogger.logPaymentVerifying(gameId, agentId, playerName, paymentAmount);

        try {
          // Get wallet client for verification/settlement
          const walletClient = await getServerWalletClient();

          // Verify payment with facilitator
          const payload: PaymentPayload = JSON.parse(
            Buffer.from(paymentHeader, 'base64').toString()
          );

          // Verify payment (without minAmountRequired, matching agent-bid pattern)
          const verification = await verify(walletClient as any, payload, paymentRequirements!);
          if (!verification.isValid) {
            const reason = verification.invalidReason || 'Unknown reason';
            console.error(`❌ [${gameId}] Facilitator rejected payment:`, reason);
            console.error(`   Payment Requirements:`, JSON.stringify(paymentRequirements, null, 2));
            PokerLogger.logPaymentFailed(gameId, agentId, playerName, paymentAmount, `Verification failed: ${reason}`);
            return NextResponse.json(
              {
                error: 'Payment verification failed',
                details: `Facilitator: ${reason}`,
                retryable: true,
                hint: 'Please retry your action with a new payment authorization',
              },
              { status: 402 }
            );
          }

          PokerLogger.logPaymentVerified(gameId, agentId, playerName, paymentAmount);

          // Settle payment on-chain
          PokerLogger.logPaymentSettling(gameId, agentId, playerName, paymentAmount);
          settlementResult = await settle(walletClient as any, payload, paymentRequirements!);

          PokerLogger.logPaymentSettled(gameId, agentId, playerName, paymentAmount, settlementResult.transaction);

          // Record contribution in escrow
          await recordPotContribution(gameId, agentId, paymentAmount);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ [${agentId}] Payment processing failed:`, errorMessage);

          // Check if it's an insufficient balance error
          if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
            // Mark player as out of game due to insufficient funds
            const updatedPlayers = gameRecord.players.map((p) =>
              p.agentId === agentId ? { ...p, status: 'out' as const } : p
            );

            await updateGameState(gameId, { players: updatedPlayers });

            await storePokerEvent(gameId, 'action_taken', {
              gameId,
              handNumber: gameRecord.handNumber,
              bettingRound: gameRecord.bettingRound,
              agentId,
              agentName: player.agentName,
              action: 'fold',
              reason: 'insufficient_funds',
              chipStackAfter: player.chipStack,
              potAfter: gameRecord.pot,
              currentBetAfter: gameRecord.currentBet,
            });

            console.log(`⚠️ [${agentId}] Marked as OUT due to insufficient USDC balance`);

            // Progress game since player is now out
            await advanceToNextPlayer(gameId);
            await progressGameIfReady(gameId);

            return NextResponse.json(
              {
                error: 'Insufficient USDC balance',
                details: 'You do not have enough USDC to make this bet. You have been marked as out of the game.',
                retryable: false,
                playerStatus: 'out',
              },
              { status: 402 }
            );
          }

          // Generic payment failure
          return NextResponse.json(
            {
              error: 'Payment processing failed',
              details: errorMessage,
              retryable: true,
              hint: 'Please check your wallet balance and try again',
            },
            { status: 402 }
          );
        }
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
          // Handle all-in call (when player doesn't have enough chips to call full amount)
          const amountToCall = gameRecord.currentBet - player.currentBet;
          const isAllInCall = paymentAmount < amountToCall || player.chipStack === paymentAmount;

          updatedPlayers[playerIndex].chipStack -= paymentAmount;
          updatedPlayers[playerIndex].currentBet += paymentAmount;
          updatedPlayers[playerIndex].totalBetThisHand += paymentAmount;
          gameRecord.pot += paymentAmount;

          // Check if player is all-in after this call
          if (updatedPlayers[playerIndex].chipStack === 0) {
            updatedPlayers[playerIndex].status = 'all-in';
            if (isAllInCall) {
              console.log(`   💥 ${player.agentName} is ALL-IN with ${paymentAmount} USDC (short call)`);
            } else {
              console.log(`   💥 ${player.agentName} is ALL-IN after calling ${paymentAmount} USDC`);
            }
          }
          break;

        case 'bet':
        case 'raise':
          updatedPlayers[playerIndex].chipStack -= paymentAmount;
          updatedPlayers[playerIndex].currentBet += paymentAmount;
          updatedPlayers[playerIndex].totalBetThisHand += paymentAmount;
          gameRecord.pot += paymentAmount;
          gameRecord.currentBet = updatedPlayers[playerIndex].currentBet;

          // Check if player is all-in after this bet/raise
          if (updatedPlayers[playerIndex].chipStack === 0) {
            updatedPlayers[playerIndex].status = 'all-in';
            console.log(`   💥 ${player.agentName} is ALL-IN with ${actionType}`);
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

      // Broadcast poker action event
      await storePokerEvent(gameId, 'action_taken', {
        gameId,
        handNumber: gameRecord.handNumber,
        bettingRound: gameRecord.bettingRound,
        agentId,
        agentName: player.agentName,
        action: actionType,
        amount: paymentAmount,
        chipStackAfter: updatedPlayers[playerIndex].chipStack,
        potAfter: gameRecord.pot,
        currentBetAfter: gameRecord.currentBet,
        transactionHash: settlementResult?.transaction, // Include on-chain transaction hash
      });

      // Log action completed
      PokerLogger.logActionCompleted(gameId, agentId, playerName, actionType, {
        pot: gameRecord.pot,
        currentBet: gameRecord.currentBet,
        playerChips: updatedPlayers[playerIndex].chipStack,
      });

      // Log pot update if payment was made
      if (paymentAmount > 0) {
        PokerLogger.logPotUpdate(
          gameId,
          gameRecord.handNumber,
          paymentAmount,
          playerName,
          gameRecord.pot
        );
      }

      // Advance to next player's turn
      await advanceToNextPlayer(gameId);

      // Automatically progress game if betting round is complete
      const progression = await progressGameIfReady(gameId);
      if (progression.bettingRoundAdvanced) {
        console.log(`   ⚡ Game auto-progressed to next betting round`);
      }
      if (progression.showdownInitiated) {
        console.log(`   ⚡ Showdown auto-initiated`);
      }
      if (progression.newHandStarted) {
        console.log(`   ⚡ New hand auto-started`);
      }
      if (progression.gameEnded) {
        console.log(`   ⚡ Game ended`);
      }

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
              hash: settlementResult.transaction,
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
