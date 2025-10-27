/**
 * Poker Game Creation Endpoint
 * POST /api/poker/create
 *
 * Creates a new poker game with real wallet balances
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createPokerGame } from '@/lib/poker-db';
import {
  getSmallBlindAmount,
  getBigBlindAmount,
  getMinimumChipsRequired,
  hasMinimumBalance,
} from '@/lib/x402-poker-config';
import { initializeGame } from '@/lib/poker/game-orchestrator';

// ERC-20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

/**
 * Gets USDC balance for a wallet address
 */
async function getUSDCBalance(walletAddress: string): Promise<number> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress as `0x${string}`],
  });

  // USDC has 6 decimals
  return Number(balance) / 1_000_000;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      agentAId,
      agentBId,
      agentAAddress,
      agentBAddress,
      gameId: customGameId,
      smallBlind: customSmallBlind,
      bigBlind: customBigBlind,
    } = body;

    // Validate required fields
    if (!agentAId || !agentBId) {
      return NextResponse.json(
        { error: 'agentAId and agentBId are required' },
        { status: 400 }
      );
    }

    if (!agentAAddress || !agentBAddress) {
      return NextResponse.json(
        { error: 'agentAAddress and agentBAddress are required' },
        { status: 400 }
      );
    }

    // Generate gameId if not provided
    const gameId = customGameId || `poker-game-${Date.now()}`;

    // Get blind amounts (use custom or defaults)
    const smallBlind = customSmallBlind || getSmallBlindAmount();
    const bigBlind = customBigBlind || getBigBlindAmount();
    const minChipsRequired = getMinimumChipsRequired();

    console.log(`\n🎮 Creating poker game: ${gameId}`);
    console.log(`   ${agentAId} (${agentAAddress}) vs ${agentBId} (${agentBAddress})`);
    console.log(`   Blinds: ${smallBlind}/${bigBlind}`);

    // Query actual USDC balances
    console.log(`💰 Querying wallet balances...`);
    const agentABalance = await getUSDCBalance(agentAAddress);
    const agentBBalance = await getUSDCBalance(agentBAddress);

    console.log(`   ${agentAId}: ${agentABalance.toFixed(2)} USDC`);
    console.log(`   ${agentBId}: ${agentBBalance.toFixed(2)} USDC`);

    // Validate minimum requirements
    if (!hasMinimumBalance(agentABalance)) {
      return NextResponse.json(
        {
          error: `${agentAId} has insufficient balance: ${agentABalance.toFixed(2)} USDC (minimum required: ${minChipsRequired} USDC)`,
        },
        { status: 400 }
      );
    }

    if (!hasMinimumBalance(agentBBalance)) {
      return NextResponse.json(
        {
          error: `${agentBId} has insufficient balance: ${agentBBalance.toFixed(2)} USDC (minimum required: ${minChipsRequired} USDC)`,
        },
        { status: 400 }
      );
    }

    // Create game with actual balances
    const gameRecord = await createPokerGame(
      gameId,
      [
        {
          agentId: agentAId,
          agentName: agentAId,
          walletAddress: agentAAddress,
          startingChips: agentABalance,
        },
        {
          agentId: agentBId,
          agentName: agentBId,
          walletAddress: agentBAddress,
          startingChips: agentBBalance,
        },
      ],
      {
        smallBlind,
        bigBlind,
        startingChips: 0, // Deprecated field
      }
    );

    console.log(`✅ Game created successfully: ${gameId}`);

    // Initialize game by starting first hand
    await initializeGame(gameId);
    console.log(`✅ First hand started automatically`);

    return NextResponse.json({
      success: true,
      gameId: gameRecord.gameId,
      players: gameRecord.players.map((p) => ({
        agentId: p.agentId,
        agentName: p.agentName,
        chipStack: p.chipStack,
      })),
      smallBlind,
      bigBlind,
      url: `/poker/${gameId}`,
    });
  } catch (error: unknown) {
    console.error('❌ Error creating poker game:', error);
    return NextResponse.json(
      {
        error: 'Failed to create poker game',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
