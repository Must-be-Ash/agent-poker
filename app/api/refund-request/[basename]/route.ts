import { NextRequest, NextResponse } from 'next/server';
import { getBidRecord, updateBidRecord, markAgentAsWithdrawn, addOrUpdateParticipatingAgent } from '@/lib/db';
import { sendRefund, transferBasename } from '@/lib/wallet';
import { broadcastEvent } from '@/lib/events';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ basename: string }> }
) {
  const { basename } = await params;
  const body = await request.json();
  const { agentId, walletAddress, reasoning } = body;

  if (!agentId || !walletAddress) {
    return NextResponse.json(
      { error: 'agentId and walletAddress are required' },
      { status: 400 }
    );
  }

  try {
    const bidRecord = await getBidRecord(basename);

    if (!bidRecord) {
      return NextResponse.json(
        { error: 'No auction found for this basename' },
        { status: 404 }
      );
    }

    // Find the agent's last bid in history (if any)
    const agentBids = (bidRecord.bidHistory || []).filter(bid => bid.agentId === agentId);
    const hasBids = agentBids.length > 0;
    const lastBid = hasBids ? agentBids[agentBids.length - 1] : null;

    // Check if this agent is currently the highest bidder
    if (bidRecord.currentWinner?.agentId === agentId) {
      return NextResponse.json(
        { error: 'Cannot withdraw - you are currently winning. Wait to be outbid first.' },
        { status: 400 }
      );
    }

    console.log(`🏳️ [${agentId}] Requesting withdrawal from auction for ${basename}`);
    console.log(`   Reasoning: ${reasoning || 'No reasoning provided'}`);
    console.log(`   Has placed bids: ${hasBids}`);

    // Issue refund only if they actually placed bids
    let refundTxHash: string | undefined;
    let refundAmount = 0;

    if (hasBids && lastBid) {
      refundAmount = lastBid.amount;
      console.log(`💸 Issuing withdrawal refund of ${refundAmount} USDC to ${agentId}...`);
      refundTxHash = await sendRefund(walletAddress, refundAmount);
      console.log(`✅ Withdrawal refund completed: ${refundTxHash}`);
    } else {
      console.log(`ℹ️ No refund needed - ${agentId} never placed any bids`);
    }

    // Ensure agent exists in participatingAgents before marking as withdrawn
    await addOrUpdateParticipatingAgent(basename, agentId, walletAddress);

    // Mark agent as withdrawn using atomic operation
    await markAgentAsWithdrawn(basename, agentId);

    // Also update legacy withdrawnAgents array for backwards compatibility
    const withdrawnAgents = bidRecord.withdrawnAgents || [];
    if (!withdrawnAgents.includes(agentId)) {
      withdrawnAgents.push(agentId);
      await updateBidRecord(basename, {
        withdrawnAgents,
      });
    }

    // Store withdrawal event
    await broadcastEvent(basename, 'withdrawal_decision', {
      agentId,
      amount: refundAmount,
      reasoning: reasoning || 'Agent decided to stop bidding',
      transactionHash: refundTxHash,
    });

    // Re-fetch bid record to get updated participatingAgents after withdrawal
    const updatedBidRecord = await getBidRecord(basename);
    if (!updatedBidRecord) {
      return NextResponse.json(
        { error: 'Failed to retrieve updated auction state' },
        { status: 500 }
      );
    }

    // Check if auction should end (only one active participant remaining)
    const activeParticipants = (updatedBidRecord.participatingAgents || []).filter(a => a.status === 'active');
    const auctionShouldEnd = activeParticipants.length <= 1;

    if (auctionShouldEnd) {
      const hasActiveBids = updatedBidRecord.currentBid > 0;

      if (hasActiveBids) {
        // Case 1: There are bids - end auction and declare winner
        console.log(`🏁 Auction ending - only ${activeParticipants.length} active participant(s) remaining`);
        console.log(`   Winner: ${updatedBidRecord.currentWinner?.agentId} with $${updatedBidRecord.currentBid}`);

        await broadcastEvent(basename, 'auction_ended', {
          winner: updatedBidRecord.currentWinner,
          finalBid: updatedBidRecord.currentBid,
          reason: 'All other bidders withdrew',
        });

        await updateBidRecord(basename, {
          status: 'ended',
          auctionEnded: true,
          auctionEndReason: 'withdrawal',
        });

        // Attempt to transfer Basename to winner
        if (updatedBidRecord.currentWinner) {
          console.log(`🏷️  Attempting to transfer Basename to winner...`);
          try {
            const transferTxHash = await transferBasename(
              basename,
              updatedBidRecord.currentWinner.walletAddress
            );

            console.log(`✅ Basename transferred successfully! Tx: ${transferTxHash}`);

            // Mark auction as finalized with transfer tx hash
            await updateBidRecord(basename, {
              status: 'finalized',
              basenameTransferTxHash: transferTxHash,
            });

            await broadcastEvent(basename, 'basename_transferred', {
              winner: updatedBidRecord.currentWinner,
              transactionHash: transferTxHash,
              basename,
            });

          } catch (error: unknown) {
            console.error(`❌ Basename transfer failed:`, error);

            // Auction ended but transfer failed - keep status as 'ended' (not 'finalized')
            // This allows manual retry later
            await broadcastEvent(basename, 'basename_transfer_failed', {
              winner: updatedBidRecord.currentWinner,
              error: error instanceof Error ? error.message : String(error),
              basename,
            });

            console.log(`⚠️  Auction ended but Basename transfer failed. Manual retry required.`);
          }
        }
      } else {
        // Case 2: No bids yet - auction continues, next bid from remaining agent will continue normally
        console.log(`ℹ️ Only 1 active participant remaining, but no bids yet`);
        console.log(`   Auction continues - ${activeParticipants[0]?.agentId} can still place bids`);
      }
    }

    // Check if basename was transferred
    const finalBidRecord = await getBidRecord(basename);
    const basenameTransferred = finalBidRecord?.status === 'finalized';

    return NextResponse.json({
      success: true,
      refunded: refundAmount,
      transactionHash: refundTxHash,
      auctionEnded: auctionShouldEnd && updatedBidRecord.currentBid > 0,
      basenameTransferred,
      basenameTransferTxHash: finalBidRecord?.basenameTransferTxHash,
      message: auctionShouldEnd && updatedBidRecord.currentBid > 0
        ? basenameTransferred
          ? 'Withdrawal successful. Auction has ended and Basename transferred to winner!'
          : 'Withdrawal successful. Auction has ended - Basename transfer pending.'
        : hasBids
        ? `Refund of ${refundAmount} USDC issued. You have withdrawn from the auction.`
        : 'Withdrawal successful. You have been removed from the auction.',
    });

  } catch (error: unknown) {
    console.error(`❌ Refund request failed:`, error);
    return NextResponse.json(
      { error: `Failed to process refund: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

