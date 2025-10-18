'use client';

import { use, useEffect, useState } from 'react';

interface BidRecord {
  basename: string;
  status: 'not_started' | 'active' | 'ended' | 'finalized';
  currentBid: number | null;
  currentWinner: {
    agentId: string;
    walletAddress: string;
    timestamp: string;
  } | null;
  bidHistory: Array<{
    agentId: string;
    walletAddress: string;
    amount: number;
    timestamp: string;
    transactionHash?: string;
    thinking?: string;
    strategy?: string;
    reasoning?: string;
  }>;
  timeRemaining: number | null;
}

interface AgentBalance {
  agentId: string;
  balance: number;
}

// Mock agent balances - in production, fetch from API
const AGENT_BALANCES: Record<string, number> = {
  'AgentA': 29.27,
  'AgentB': 11.00,
};

export default function AuctionPage({ params }: { params: Promise<{ basename: string }> }) {
  const { basename } = use(params);
  const [bidRecord, setBidRecord] = useState<BidRecord | null>(null);
  const [messages, setMessages] = useState<Array<{
    type: 'bid' | 'refund' | 'outbid';
    agentId: string;
    amount: number;
    timestamp: string;
    transactionHash?: string;
    refundTo?: string;
  }>>([]);

  useEffect(() => {
    // Fetch initial state
    fetch(`/api/status?basename=${encodeURIComponent(basename)}`)
      .then(res => res.json())
      .then(data => {
        setBidRecord(data);
        // Convert bid history to messages
        if (data.bidHistory) {
          const msgs = data.bidHistory.map((bid: any) => ({
            type: 'bid' as const,
            agentId: bid.agentId,
            amount: bid.amount,
            timestamp: bid.timestamp,
            transactionHash: bid.txHash || bid.transactionHash,
            thinking: bid.thinking,
            strategy: bid.strategy,
            reasoning: bid.reasoning,
            reflection: bid.reflection,
          }));
          setMessages(msgs);
        }
      })
      .catch(err => console.error('Error fetching initial status:', err));

    // Poll for updates every 2 seconds
    const interval = setInterval(() => {
      fetch(`/api/status?basename=${encodeURIComponent(basename)}`)
        .then(res => res.json())
        .then(data => {
          setBidRecord(data);
          // Update messages if new bids - compare by length
          if (data.bidHistory) {
            setMessages(prevMessages => {
              // Only update if we have more bids than messages
              if (data.bidHistory.length > prevMessages.length) {
                const newBids = data.bidHistory.slice(prevMessages.length);
                const newMessages = newBids.map((bid: any) => ({
                  type: 'bid' as const,
                  agentId: bid.agentId,
                  amount: bid.amount,
                  timestamp: bid.timestamp,
                  transactionHash: bid.txHash || bid.transactionHash,
                  thinking: bid.thinking,
                  strategy: bid.strategy,
                  reasoning: bid.reasoning,
                  reflection: bid.reflection,
                }));
                return [...prevMessages, ...newMessages];
              }
              return prevMessages;
            });
          }
        })
        .catch(err => console.error('Error polling status:', err));
    }, 2000);

    return () => clearInterval(interval);
  }, [basename]);

  if (!bidRecord) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-[#888888]">Loading auction...</div>
      </div>
    );
  }

  const formatTime = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAgentAvatar = (agentId: string) => {
    return agentId === 'AgentA' ? '🤖' : '🦾';
  };

  const getAgentBalance = (agentId: string) => {
    const spent = bidRecord.bidHistory
      .filter(b => b.agentId === agentId)
      .reduce((sum, b) => sum + b.amount, 0);
    const refunded = bidRecord.bidHistory
      .filter((b, idx) => {
        // If this bid was outbid by the next bid, it was refunded
        const nextBid = bidRecord.bidHistory[idx + 1];
        return nextBid && b.agentId !== nextBid.agentId;
      })
      .reduce((sum, b) => sum + b.amount, 0);

    return (AGENT_BALANCES[agentId] || 0) - spent + refunded;
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <div className="bg-[#2a2a2a] border-b border-[#333333] px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[#ffffff] text-xl font-semibold">
                {bidRecord.basename}
              </h1>
              <p className="text-[#888888] text-sm">Autonomous Basename Auction</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[#888888] text-xs uppercase tracking-wide">Current Bid</div>
                <div className="text-[#ffffff] text-2xl font-bold">
                  ${bidRecord.currentBid?.toFixed(2) || '0.00'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[#888888] text-xs uppercase tracking-wide">Time Left</div>
                <div className="text-[#ffffff] text-2xl font-bold">
                  {formatTime(bidRecord.timeRemaining)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Status Bar */}
      <div className="bg-[#222222] border-b border-[#333333] px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-around">
          {['AgentA', 'AgentB'].map(agentId => {
            const isWinner = bidRecord.currentWinner?.agentId === agentId;
            const balance = getAgentBalance(agentId);

            return (
              <div key={agentId} className="flex items-center gap-3">
                <div className="text-3xl">{getAgentAvatar(agentId)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#ffffff] font-semibold">{agentId}</span>
                    {isWinner && (
                      <span className="bg-[#444444] text-[#ffffff] text-xs px-2 py-0.5 rounded-full">
                        LEADING
                      </span>
                    )}
                  </div>
                  <div className="text-[#888888] text-sm">
                    Balance: <span className="text-[#cccccc] font-mono">${balance.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages Container (iMessage style) */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-[#666666] py-12">
              <div className="text-4xl mb-4">💬</div>
              <p>Waiting for agents to start bidding...</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isAgentA = msg.agentId === 'AgentA';
              const prevMsg = messages[idx - 1];
              const wasOutbid = prevMsg && prevMsg.agentId !== msg.agentId;

              return (
                <div key={idx}>
                  {/* Show refund/outbid message */}
                  {wasOutbid && prevMsg && (
                    <div className="flex justify-center my-6">
                      <div className="bg-[#2a2a2a] border border-[#444444] rounded-lg px-4 py-3 max-w-md">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">💸</div>
                          <div className="flex-1">
                            <div className="text-[#cccccc] text-sm">
                              <span className="font-semibold">{prevMsg.agentId}</span> was outbid!
                            </div>
                            <div className="text-[#888888] text-xs mt-1">
                              Refunded ${prevMsg.amount.toFixed(2)} USDC
                            </div>
                            {prevMsg.transactionHash && (
                              <a
                                href={`https://sepolia.basescan.org/tx/${prevMsg.transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#666666] hover:text-[#888888] text-xs underline mt-1 inline-block"
                              >
                                View refund tx →
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bid message bubble */}
                  <div className={`flex ${isAgentA ? 'justify-start' : 'justify-end'}`}>
                    <div className={`flex gap-3 max-w-md ${isAgentA ? 'flex-row' : 'flex-row-reverse'}`}>
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[#333333] flex items-center justify-center text-xl">
                          {getAgentAvatar(msg.agentId)}
                        </div>
                      </div>

                      {/* Message bubble */}
                      <div className={`flex flex-col ${isAgentA ? 'items-start' : 'items-end'} max-w-lg`}>
                        <div className="text-[#888888] text-xs mb-1 px-2">
                          {msg.agentId}
                        </div>

                        {/* Thinking bubble (if present) */}
                        {(msg as any).thinking && (
                          <div
                            className={`rounded-2xl px-4 py-3 mb-2 border border-[#444444] ${isAgentA
                              ? 'bg-[#2a2a2a] rounded-tl-sm'
                              : 'bg-[#2a2a2a] rounded-tr-sm'
                              }`}
                          >
                            <div className="text-[#888888] text-xs mb-1 flex items-center gap-1">
                              <span>💭</span>
                              <span>Thinking...</span>
                            </div>
                            <div className="text-[#cccccc] text-sm italic">
                              "{(msg as any).thinking}"
                            </div>
                            {(msg as any).strategy && (
                              <div className="text-[#888888] text-xs mt-2">
                                Strategy: <span className="text-[#aaaaaa]">{(msg as any).strategy}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Bid bubble */}
                        <div
                          className={`rounded-2xl px-4 py-3 ${isAgentA
                            ? 'bg-[#333333] rounded-tl-sm'
                            : 'bg-[#444444] rounded-tr-sm'
                            }`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="text-[#cccccc] text-sm">Bid placed:</span>
                            <span className="text-[#ffffff] text-2xl font-bold">
                              ${msg.amount.toFixed(2)}
                            </span>
                            <span className="text-[#888888] text-xs">USDC</span>
                          </div>

                          {(msg as any).reflection && (
                            <div className="text-[#aaaaaa] text-xs mt-2 leading-relaxed">
                              {(msg as any).reflection}
                            </div>
                          )}

                          {msg.transactionHash && (
                            <a
                              href={`https://sepolia.basescan.org/tx/${msg.transactionHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#666666] hover:text-[#888888] text-xs underline mt-2 inline-block"
                            >
                              View on Basescan →
                            </a>
                          )}

                          <div className="text-[#666666] text-xs mt-2">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Winner Announcement */}
      {bidRecord.status === 'ended' && bidRecord.currentWinner && (
        <div className="bg-[#2a2a2a] border-t border-[#444444] px-6 py-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="text-4xl mb-3">🏆</div>
            <h2 className="text-[#ffffff] text-2xl font-bold mb-2">Auction Ended!</h2>
            <p className="text-[#cccccc] text-lg">
              Winner: <span className="font-bold">{bidRecord.currentWinner.agentId}</span>
            </p>
            <p className="text-[#888888] text-sm mt-1">
              Final Bid: ${bidRecord.currentBid?.toFixed(2)} USDC
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
