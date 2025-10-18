import { NextRequest, NextResponse } from 'next/server';
import { getBidRecord, updateBidRecord, addBidToHistory } from '@/lib/db';
import { sendRefund, getServerWalletClient } from '@/lib/wallet';
import { calculateCurrentBidPrice, parseBidAmount, AUCTION_DURATION_MS } from '@/lib/x402-config';
import { verify, settle } from 'x402/facilitator';
import type { PaymentPayload } from 'x402/types';

// Simple in-memory lock to prevent concurrent settlements
const settlementLocks = new Map<string, Promise<any>>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ basename: string }> }
) {
  const { basename } = await params;

  try {
    // Get current bid state from MongoDB
    const bidRecord = await getBidRecord(basename);

    // Check if auction has ended
    if (bidRecord && bidRecord.status === 'ended') {
      return NextResponse.json(
        { error: 'Auction has ended' },
        { status: 410 } // Gone
      );
    }

    // Check if auction time has elapsed
    if (bidRecord && bidRecord.auctionEndTime && new Date() > bidRecord.auctionEndTime) {
      // Mark auction as ended
      await updateBidRecord(basename, { status: 'ended' });
      return NextResponse.json(
        { error: 'Auction time has expired' },
        { status: 410 }
      );
    }

    // Get payment header
    const paymentHeader = request.headers.get('X-PAYMENT');
    const agentId = request.headers.get('X-Agent-ID') || 'unknown';

    // If no payment, return 402 Payment Required
    if (!paymentHeader) {
      const currentBid = bidRecord?.currentBid || null;
      const requiredPrice = calculateCurrentBidPrice(currentBid);

      const paymentRequirements = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'base-sepolia',
            maxAmountRequired: (parseBidAmount(requiredPrice) * 1_000_000).toString(), // USDC has 6 decimals
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC Base Sepolia
            payTo: process.env.SERVER_WALLET_ADDRESS,
            resource: `${request.nextUrl.origin}/api/bid/${basename}`,
            description: `Bid ${requiredPrice} USDC on ${basename}`,
            mimeType: 'application/json',
            maxTimeoutSeconds: 60,
            extra: {
              name: 'USDC',
              version: '2'
            }
          }
        ],
        error: 'Payment required to place bid'
      };

      return NextResponse.json(paymentRequirements, { status: 402 });
    }

    // Payment received - parse, verify, and settle
    const payment: PaymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));

    const currentBid = bidRecord?.currentBid || null;
    const requiredPrice = calculateCurrentBidPrice(currentBid);

    const paymentRequirements = {
      scheme: 'exact' as const,
      network: 'base-sepolia' as const,
      maxAmountRequired: (parseBidAmount(requiredPrice) * 1_000_000).toString(),
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: process.env.SERVER_WALLET_ADDRESS as `0x${string}`,
      resource: `${request.nextUrl.origin}/api/bid/${basename}`,
      description: `Bid ${requiredPrice} USDC on ${basename}`,
      mimeType: 'application/json',
      maxTimeoutSeconds: 60,
    };

    // Step 1: Verify the payment
    console.log(`🔍 Verifying payment from ${agentId}...`);
    const walletClient = await getServerWalletClient();
    const verifyResult = await verify(walletClient as any, payment, paymentRequirements);

    if (!verifyResult.isValid) {
      console.log(`❌ Payment verification failed: ${verifyResult.invalidReason}`);
      return NextResponse.json(
        { error: `Payment verification failed: ${verifyResult.invalidReason}` },
        { status: 402 }
      );
    }

    console.log(`✅ Payment verified from ${verifyResult.payer}`);

    // Step 2: Settle the payment on-chain (with lock to prevent concurrent settlements)
    console.log(`⛓️  Settling payment on-chain...`);

    // Wait for any pending settlement to complete first
    const lockKey = 'settlement';
    if (settlementLocks.has(lockKey)) {
      console.log(`⏳ Waiting for previous settlement to complete...`);
      await settlementLocks.get(lockKey);
    }

    // Create new settlement promise and store it
    const settlementPromise = settle(walletClient as any, payment, paymentRequirements);
    settlementLocks.set(lockKey, settlementPromise);

    let settleResult;
    try {
      settleResult = await settlementPromise;
    } finally {
      // Clean up lock after settlement completes
      settlementLocks.delete(lockKey);
    }

    if (!settleResult.success) {
      console.log(`❌ Payment settlement failed: ${settleResult.errorReason}`);
      return NextResponse.json(
        { error: `Payment settlement failed: ${settleResult.errorReason}` },
        { status: 402 }
      );
    }

    console.log(`✅ Payment settled! Tx: ${settleResult.transaction}`);

    const payerAddress = verifyResult.payer || 'unknown';
    const exactPayload = payment.payload as any;
    const paidAmount = exactPayload?.authorization?.value || '0';
    const bidAmount = parseFloat(paidAmount) / 1_000_000;
    const transactionHash = settleResult.transaction;

    console.log(`💰 Bid accepted from ${agentId}: ${bidAmount} USDC`);

    // Store previous winner for refund
    const previousWinner = bidRecord?.currentWinner;

    // Calculate auction end time (5 minutes from first bid)
    const auctionEndTime = bidRecord?.auctionEndTime ||
      new Date(Date.now() + AUCTION_DURATION_MS);

    // Update bid record
    await updateBidRecord(basename, {
      basename,
      currentBid: bidAmount,
      currentWinner: {
        agentId,
        walletAddress: payerAddress || 'unknown',
        externalId: (payment as any).externalId || '',
        timestamp: new Date(),
      },
      status: 'active',
      auctionStartTime: bidRecord?.auctionStartTime || new Date(),
      auctionEndTime,
      winnerNotified: false,
    });

    // Add to bid history with transaction hash
    await addBidToHistory(basename, {
      agentId,
      walletAddress: payerAddress || 'unknown',
      amount: bidAmount,
      timestamp: new Date(),
      txHash: transactionHash,
    });

    // Refund previous bidder if exists
    if (previousWinner && bidRecord?.currentBid) {
      // Send refund asynchronously (don't block the response)
      // Add a small delay to avoid nonce conflicts with the settlement transaction
      setTimeout(async () => {
        try {
          console.log(`🔄 Refunding ${bidRecord.currentBid} USDC to ${previousWinner.agentId}...`);
          await sendRefund(previousWinner.walletAddress, bidRecord.currentBid);
          console.log(`✅ Refund completed successfully`);
        } catch (error: any) {
          console.error('❌ Refund failed:', error.message);
          // Retry once after a delay if it fails
          setTimeout(async () => {
            try {
              console.log(`🔄 Retrying refund to ${previousWinner.agentId}...`);
              await sendRefund(previousWinner.walletAddress, bidRecord.currentBid);
              console.log(`✅ Refund retry successful`);
            } catch (retryError: any) {
              console.error('❌ Refund retry failed:', retryError.message);
            }
          }, 3000);
        }
      }, 2000); // Wait 2 seconds after settlement before refunding
    }

    // Calculate time remaining
    const timeRemaining = Math.max(0, Math.floor((auctionEndTime.getTime() - Date.now()) / 1000));

    return NextResponse.json({
      success: true,
      message: `Bid placed: ${bidAmount} USDC`,
      currentWinner: agentId,
      currentBid: bidAmount,
      auctionEndsIn: timeRemaining,
      auctionEndTime: auctionEndTime.toISOString(),
    });

  } catch (error) {
    console.error('❌ Error processing bid:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
