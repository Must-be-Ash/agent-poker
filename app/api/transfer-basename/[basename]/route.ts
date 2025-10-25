import { NextRequest, NextResponse } from 'next/server';
import { getBidRecord, updateBidRecord } from '@/lib/db';
import { transferBasename } from '@/lib/wallet';
import { broadcastEvent } from '@/lib/events';

/**
 * Manual retry endpoint for failed Basename transfers
 * Only works if auction has ended but not yet finalized
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ basename: string }> }
) {
  const { basename } = await params;

  try {
    const bidRecord = await getBidRecord(basename);

    if (!bidRecord) {
      return NextResponse.json(
        { error: 'No auction found for this basename' },
        { status: 404 }
      );
    }

    // Check if auction has ended
    if (bidRecord.status !== 'ended') {
      return NextResponse.json(
        {
          error: 'Cannot transfer Basename - auction is still active or already finalized',
          currentStatus: bidRecord.status
        },
        { status: 400 }
      );
    }

    // Check if there is a winner
    if (!bidRecord.currentWinner) {
      return NextResponse.json(
        { error: 'No winner found for this auction' },
        { status: 400 }
      );
    }

    console.log(`🔄 Manual Basename transfer retry for ${basename}`);
    console.log(`   Winner: ${bidRecord.currentWinner.agentId}`);
    console.log(`   Wallet: ${bidRecord.currentWinner.walletAddress}`);

    // Attempt the transfer
    try {
      const transferTxHash = await transferBasename(
        basename,
        bidRecord.currentWinner.walletAddress
      );

      console.log(`✅ Basename transferred successfully! Tx: ${transferTxHash}`);

      // Mark auction as finalized
      await updateBidRecord(basename, {
        status: 'finalized',
        basenameTransferTxHash: transferTxHash,
      });

      await broadcastEvent(basename, 'basename_transferred', {
        winner: bidRecord.currentWinner,
        transactionHash: transferTxHash,
        basename,
      });

      return NextResponse.json({
        success: true,
        message: 'Basename transferred successfully',
        transactionHash: transferTxHash,
        winner: bidRecord.currentWinner.agentId,
      });

    } catch (transferError: unknown) {
      console.error(`❌ Basename transfer retry failed:`, transferError);

      await broadcastEvent(basename, 'basename_transfer_failed', {
        winner: bidRecord.currentWinner,
        error: transferError instanceof Error ? transferError.message : String(transferError),
        basename,
        retryAttempt: true,
      });

      return NextResponse.json(
        {
          error: 'Basename transfer failed',
          details: transferError instanceof Error ? transferError.message : String(transferError),
          winner: bidRecord.currentWinner.agentId,
        },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error(`❌ Transfer basename endpoint error:`, error);
    return NextResponse.json(
      { error: `Failed to process request: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
