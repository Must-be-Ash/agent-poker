'use client';

import { use, useEffect, useState } from 'react';

interface StreamingMessage {
  id: string;
  type: 'thinking' | 'bid' | 'reflection' | 'refund';
  agentId: string;
  timestamp: string;
  thinking?: string;
  strategy?: string;
  proposedAmount?: number;
  amount?: number;
  transactionHash?: string;
  reflection?: string;
  refundAmount?: number;
  isLoading?: boolean;
}

export default function AuctionPageStreaming({ params }: { params: Promise<{ basename: string }> }) {
  const { basename } = use(params);
  const [messages, setMessages] = useState<StreamingMessage[]>([]);
  const [currentBid, setCurrentBid] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [agentBalances, setAgentBalances] = useState<Record<string, number>>({
    'AgentA': 37.27,
    'AgentB': 15.25,
  });

  useEffect(() => {
    // Connect to SSE stream
    const eventSource = new EventSource(`/api/stream/${encodeURIComponent(basename)}`);

    eventSource.addEventListener('message', (e) => {
      const data = JSON.parse(e.data);

      switch (data.type) {
        case 'thinking':
          // Add thinking bubble
          setMessages(prev => [...prev, {
            id: `${data.agentId}-thinking-${Date.now()}`,
            type: 'thinking',
            agentId: data.agentId,
            timestamp: data.timestamp,
            thinking: data.thinking,
            strategy: data.strategy,
            proposedAmount: data.proposedAmount,
          }]);
          break;

        case 'bid_placed':
          // Add bid card with loading state for reflection
          setMessages(prev => [...prev, {
            id: `${data.agentId}-bid-${Date.now()}`,
            type: 'bid',
            agentId: data.agentId,
            timestamp: data.timestamp,
            amount: data.amount,
            transactionHash: data.transactionHash,
            isLoading: true, // Waiting for reflection
          }]);
          setCurrentBid(data.amount);
          break;

        case 'reflection':
          // Update the corresponding bid with reflection
          setMessages(prev => prev.map(msg => {
            if (msg.type === 'bid' && msg.agentId === data.agentId && msg.isLoading) {
              return {
                ...msg,
                reflection: data.reflection,
                isLoading: false,
              };
            }
            return msg;
          }));
          break;

        case 'refund':
          // Add refund notification
          setMessages(prev => [...prev, {
            id: `${data.agentId}-refund-${Date.now()}`,
            type: 'refund',
            agentId: data.agentId,
            timestamp: data.timestamp,
            refundAmount: data.amount,
            transactionHash: data.transactionHash,
          }]);
          break;
      }
    });

    // Also poll for initial state
    fetch(`/api/status?basename=${encodeURIComponent(basename)}`)
      .then(res => res.json())
      .then(data => {
        setCurrentBid(data.currentBid);
        setTimeRemaining(data.timeRemaining);

        // Load existing messages from history
        if (data.bidHistory) {
          const historicalMessages: StreamingMessage[] = [];
          data.bidHistory.forEach((bid: any) => {
            // Add thinking bubble
            if (bid.thinking) {
              historicalMessages.push({
                id: `${bid.agentId}-thinking-${bid.timestamp}`,
                type: 'thinking',
                agentId: bid.agentId,
                timestamp: bid.timestamp,
                thinking: bid.thinking,
                strategy: bid.strategy,
              });
            }
            // Add bid card
            historicalMessages.push({
              id: `${bid.agentId}-bid-${bid.timestamp}`,
              type: 'bid',
              agentId: bid.agentId,
              timestamp: bid.timestamp,
              amount: bid.amount,
              transactionHash: bid.txHash,
              reflection: bid.reflection,
              isLoading: !bid.reflection,
            });
          });
          setMessages(historicalMessages);
        }
      });

    return () => {
      eventSource.close();
    };
  }, [basename]);

  const getAgentAvatar = (agentId: string) => {
    return agentId === 'AgentA' ? '🤖' : '🦾';
  };

  const formatTime = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <div className="bg-[#2a2a2a] border-b border-[#333333] px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[#ffffff] text-xl font-semibold">
                {basename}
              </h1>
              <p className="text-[#888888] text-sm">Autonomous Basename Auction</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[#888888] text-xs uppercase tracking-wide">Current Bid</div>
                <div className="text-[#ffffff] text-2xl font-bold">
                  ${currentBid?.toFixed(2) || '0.00'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[#888888] text-xs uppercase tracking-wide">Time Left</div>
                <div className="text-[#ffffff] text-2xl font-bold">
                  {formatTime(timeRemaining)}
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
            const balance = agentBalances[agentId] || 0;

            return (
              <div key={agentId} className="flex items-center gap-3">
                <div className="text-3xl">{getAgentAvatar(agentId)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#ffffff] font-semibold">{agentId}</span>
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

      {/* Messages Container (Streaming) */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-[#666666] py-12">
              <div className="text-4xl mb-4">💬</div>
              <p>Waiting for agents to start bidding...</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAgentA = msg.agentId === 'AgentA';

              if (msg.type === 'thinking') {
                // Thinking bubble
                return (
                  <div key={msg.id} className={`flex ${isAgentA ? 'justify-start' : 'justify-end'}`}>
                    <div className={`flex gap-3 max-w-md ${isAgentA ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[#333333] flex items-center justify-center text-xl">
                          {getAgentAvatar(msg.agentId)}
                        </div>
                      </div>
                      <div className={`flex flex-col ${isAgentA ? 'items-start' : 'items-end'} max-w-lg`}>
                        <div className="text-[#888888] text-xs mb-1 px-2">
                          {msg.agentId}
                        </div>
                        <div
                          className={`rounded-2xl px-4 py-3 border border-[#444444] ${isAgentA
                            ? 'bg-[#2a2a2a] rounded-tl-sm'
                            : 'bg-[#2a2a2a] rounded-tr-sm'
                            }`}
                        >
                          <div className="text-[#888888] text-xs mb-1 flex items-center gap-1">
                            <span>💭</span>
                            <span>Thinking...</span>
                          </div>
                          <div className="text-[#cccccc] text-sm italic">
                            "{msg.thinking}"
                          </div>
                          {msg.strategy && (
                            <div className="text-[#888888] text-xs mt-2">
                              Strategy: <span className="text-[#aaaaaa]">{msg.strategy}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.type === 'bid') {
                // Bid card
                return (
                  <div key={msg.id} className={`flex ${isAgentA ? 'justify-start' : 'justify-end'}`}>
                    <div className={`flex gap-3 max-w-md ${isAgentA ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[#333333] flex items-center justify-center text-xl">
                          {getAgentAvatar(msg.agentId)}
                        </div>
                      </div>
                      <div className={`flex flex-col ${isAgentA ? 'items-start' : 'items-end'} max-w-lg`}>
                        <div className="text-[#888888] text-xs mb-1 px-2">
                          {msg.agentId}
                        </div>
                        <div
                          className={`rounded-2xl px-4 py-3 ${isAgentA
                            ? 'bg-[#333333] rounded-tl-sm'
                            : 'bg-[#444444] rounded-tr-sm'
                            }`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="text-[#cccccc] text-sm">Bid placed:</span>
                            <span className="text-[#ffffff] text-2xl font-bold">
                              ${msg.amount?.toFixed(2)}
                            </span>
                            <span className="text-[#888888] text-xs">USDC</span>
                          </div>

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

                        {/* Reflection - appears after bid */}
                        {msg.isLoading ? (
                          <div className={`mt-2 rounded-2xl px-4 py-3 bg-[#2a2a2a] border border-[#333333] ${isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                            } max-w-lg`}>
                            <div className="flex items-center gap-2 text-[#666666] text-xs mb-2">
                              <span className="animate-pulse">💭</span>
                              <span className="animate-pulse">Analyzing outcome...</span>
                            </div>
                            <div className="space-y-2">
                              <div className="h-3 bg-[#333333] rounded animate-pulse w-full"></div>
                              <div className="h-3 bg-[#333333] rounded animate-pulse w-5/6"></div>
                              <div className="h-3 bg-[#333333] rounded animate-pulse w-4/6"></div>
                            </div>
                          </div>
                        ) : msg.reflection && (
                          <div className={`mt-2 rounded-2xl px-4 py-3 bg-[#2a2a2a] border border-[#333333] ${isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                            } max-w-lg`}>
                            <div className="text-[#888888] text-xs mb-2">
                              📊 Strategic Analysis
                            </div>
                            <div className="text-[#aaaaaa] text-xs leading-relaxed whitespace-pre-wrap">
                              {msg.reflection}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.type === 'refund') {
                // Refund notification (system message style)
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="bg-[#2a2a2a] border border-[#444444] rounded-full px-4 py-2 text-xs text-[#888888] flex items-center gap-2">
                      <span>💸</span>
                      <span>
                        <span className="text-[#aaaaaa] font-semibold">{msg.agentId}</span> was outbid and refunded{' '}
                        <span className="text-[#cccccc] font-mono">${msg.refundAmount?.toFixed(2)}</span>
                      </span>
                      {msg.transactionHash && (
                        <a
                          href={`https://sepolia.basescan.org/tx/${msg.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#666666] hover:text-[#888888] underline"
                        >
                          tx
                        </a>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })
          )}
        </div>
      </div>
    </div>
  );
}


