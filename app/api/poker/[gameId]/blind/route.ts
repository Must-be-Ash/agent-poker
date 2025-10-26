/**
 * Blind Payment Endpoint
 * Handles x402 payments for small blind and big blind
 * POST /api/poker/[gameId]/blind
 */

import { NextRequest, NextResponse } from 'next/server';
import { verify, settle } from 'x402/facilitator';
import type { PaymentPayload } from 'x402/types';
import { getPokerGame, updateGameState } from '@/lib/poker-db';
import { getServerWalletClient } from '@/lib/wallet';
import { recordPotContribution } from '@/lib/poker/pot-escrow';
import {
  calculateBlindPayment,
  formatPaymentAmount,
  createPaymentRequirements,
  facilitatorConfig,
} from '@/lib/x402-poker-config';
import { storeEvent } from '@/lib/events';
import { withSettlementLock } from '@/lib/poker/settlement-lock';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    const paymentHeader = request.headers.get('X-PAYMENT');
    const agentId = request.headers.get('X-Agent-ID') || 'unknown';
    const blindType = request.headers.get('X-Blind-Type'); // 'small' or 'big'

    if (!blindType || (blindType !== 'small' && blindType !== 'big')) {
      return NextResponse.json(
        { error: 'Blind type required (X-Blind-Type: small or big)' },
        { status: 400 }
      );
    }

    // Get game state
    const game = await getPokerGame(gameId);
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.gameStatus === 'ended') {
      return NextResponse.json({ error: 'Game has ended' }, { status: 410 });
    }

    // Find player
    const player = game.players.find((p) => p.agentId === agentId);
    if (!player) {
      return NextResponse.json({ error: `Player ${agentId} not found` }, { status: 404 });
    }

    // Validate player should post this blind
    const isSmallBlind = blindType === 'small';
    const isBigBlind = blindType === 'big';

    if (isSmallBlind && !player.isSmallBlind) {
      return NextResponse.json(
        { error: `${player.agentName} is not in small blind position` },
        { status: 400 }
      );
    }

    if (isBigBlind && !player.isBigBlind) {
      return NextResponse.json(
        { error: `${player.agentName} is not in big blind position` },
        { status: 400 }
      );
    }

    // Calculate blind amount
    const blindAmount = calculateBlindPayment(isSmallBlind, isBigBlind);

    if (blindAmount === 0) {
      return NextResponse.json({ error: 'Invalid blind position' }, { status: 400 });
    }

    // Check if player has already posted blind
    if (player.currentBet > 0) {
      return NextResponse.json(
        { error: 'Blind already posted for this hand' },
        { status: 400 }
      );
    }

    // Validate sufficient chips
    if (player.chipStack < blindAmount) {
      return NextResponse.json(
        {
          error: `Insufficient chips for blind`,
          required: blindAmount,
          available: player.chipStack,
        },
        { status: 400 }
      );
    }

    // If no payment header, return 402
    if (!paymentHeader) {
      const requirements = createPaymentRequirements(
        blindAmount,
        blindType === 'small' ? 'bet' : 'bet', // Use 'bet' action type for blinds
        `${blindType === 'small' ? 'Small' : 'Big'} blind ${formatPaymentAmount(blindAmount)} for hand #${game.handNumber + 1}`
      );

      console.log(`💳 [Blind] ${player.agentName} needs to post ${blindType} blind: ${formatPaymentAmount(blindAmount)}`);

      return NextResponse.json(requirements, {
        status: 402,
        headers: {
          'X-Payment-Required': 'true',
          'X-Payment-Amount': formatPaymentAmount(blindAmount),
          'X-Blind-Type': blindType,
        },
      });
    }

    // Use settlement lock to prevent concurrent settlements
    return await withSettlementLock(gameId, `blind_${blindType}`, agentId, async () => {
      console.log(`🔍 [Blind] Verifying ${blindType} blind payment from ${player.agentName}...`);

      // Verify payment
      const payload: PaymentPayload = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString()
      );

      const verification = await verify(payload, facilitatorConfig.url);
      if (!verification.valid) {
        throw new Error('Blind payment verification failed');
      }

      console.log(`✅ [Blind] Payment verified`);

      // Settle payment on-chain
      const walletClient = await getServerWalletClient();
      const settlementResult = await settle(payload, walletClient as any, facilitatorConfig.url);

      console.log(`💰 [Blind] Payment settled: ${settlementResult.hash}`);

      // Update game state
      const updatedPlayers = game.players.map((p) => {
        if (p.agentId === agentId) {
          return {
            ...p,
            chipStack: p.chipStack - blindAmount,
            currentBet: blindAmount,
            totalBetThisHand: blindAmount,
            status: p.chipStack - blindAmount === 0 ? ('all-in' as const) : p.status,
          };
        }
        return p;
      });

      const newPot = game.pot + blindAmount;
      const newCurrentBet = Math.max(game.currentBet, blindAmount);

      await updateGameState(gameId, {
        players: updatedPlayers,
        pot: newPot,
        currentBet: newCurrentBet,
      });

      // Record in escrow
      await recordPotContribution(gameId, agentId, blindAmount);

      // Broadcast blind posted event
      await storeEvent(gameId, 'blind_posted', {
        agentId,
        agentName: player.agentName,
        blindType,
        amount: blindAmount,
        pot: newPot,
        handNumber: game.handNumber,
        txHash: settlementResult.hash,
      });

      console.log(`✅ [Blind] ${player.agentName} posted ${blindType} blind of ${blindAmount} USDC`);

      return NextResponse.json({
        success: true,
        blindType,
        amount: blindAmount,
        pot: newPot,
        yourChips: player.chipStack - blindAmount,
        settlement: {
          hash: settlementResult.hash,
          verified: true,
        },
      });
    });
  } catch (error: any) {
    console.error(`❌ [Blind] Error in blind endpoint:`, error);

    return NextResponse.json(
      {
        error: 'Failed to process blind payment',
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
        'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, X-Agent-ID, X-Blind-Type',
      },
    }
  );
}
