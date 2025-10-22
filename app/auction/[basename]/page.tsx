'use client';

import { use, useEffect, useState, useRef } from 'react';

interface AuctionMessage {
  sequence: number;
  eventType: string;
  agentId?: string;
  timestamp: Date;
  data: any;
}

export default function AuctionPagePolling({ params }: { params: Promise<{ basename: string }> }) {
  const { basename } = use(params);
  const [messages, setMessages] = useState<AuctionMessage[]>([]);
  const [currentBid, setCurrentBid] = useState<number | null>(null);
  const [currentWinner, setCurrentWinner] = useState<string | null>(null);
  const [lastSequence, setLastSequence] = useState<number>(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for events every 2 seconds
  useEffect(() => {
    const pollEvents = async () => {
      try {
        const response = await fetch(
          `/api/events/${encodeURIComponent(basename)}?after=${lastSequence}`
        );
        const data = await response.json();

        if (data.events && data.events.length > 0) {
          setMessages(prev => [...prev, ...data.events]);
          const maxSeq = Math.max(...data.events.map((e: any) => e.sequence));
          setLastSequence(maxSeq);

          // Update current bid and winner
          data.events.forEach((event: any) => {
            if (event.eventType === 'bid_placed') {
              setCurrentBid(event.data.amount);
              setCurrentWinner(event.agentId);
            }
          });
        }
      } catch (error) {
        console.error('Error polling events:', error);
      }
    };

    pollEvents();
    pollingIntervalRef.current = setInterval(pollEvents, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [basename, lastSequence]);

  // Load initial auction state
  useEffect(() => {
    fetch(`/api/status?basename=${encodeURIComponent(basename)}`)
      .then(res => res.json())
      .then(data => {
        setCurrentBid(data.currentBid);
        setCurrentWinner(data.currentWinner?.agentId);
      });
  }, [basename]);

  const getAgentAvatar = (agentId: string) => {
    return (
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
        agentId === 'AgentA' ? 'bg-[#d4af8c]' : 'bg-[#628268]'
      }`}>
        <div className={`w-4 h-4 rounded-full ${
          agentId === 'AgentA' ? 'bg-[#d4af8c]' : 'bg-[#628268]'
        }`}></div>
      </div>
    );
  };

  const renderEvent = (event: AuctionMessage, idx: number) => {
    const { eventType, agentId, data } = event;
    const isAgentA = agentId === 'AgentA';

    // Show all events that have content - be more inclusive
    // Only skip events that are truly empty or meaningless
    if (!eventType || (!agentId && !data)) {
      return null;
    }

    // Server/system events - centered
    if (eventType === 'refund_issued' || eventType === 'withdrawal_decision' || eventType === 'auction_ended') {
      if (eventType === 'refund_issued') {
        return (
          <div key={event.sequence} className="flex justify-center my-6">
            <div className="bg-[#333333] rounded-2xl px-4 py-2 max-w-lg flex items-center justify-between border border-[#444444]">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  agentId === 'AgentA' ? 'bg-[#d4af8c]' : 'bg-[#628268]'
                }`}></div>
                <span className="text-[#cccccc] font-medium text-sm">{agentId}</span>
                <span className="text-[#888888] text-sm">was outbid and refunded</span>
                <span className="text-[#ffffff] font-semibold text-sm">${data.amount.toFixed(2)}</span>
                {data.transactionHash && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${data.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#888888] hover:text-[#aaaaaa] text-xs underline ml-2"
                  >
                    tx
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (eventType === 'withdrawal_decision') {
        return (
          <div key={event.sequence} className="flex justify-center my-6">
            <div className="bg-[#2a2a2a] border border-[#444444] rounded-lg px-4 py-3 max-w-md">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🏳️</div>
                <div className="flex-1">
                  <div className="text-[#cccccc] text-sm">
                    <span className="font-semibold">{agentId}</span> withdrew from auction
                  </div>
                  <div className="text-[#888888] text-xs mt-1 italic">
                    {data.reasoning?.substring(0, 100)}...
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (eventType === 'auction_ended') {
        return (
          <div key={event.sequence} className="flex justify-center my-6">
            <div className="bg-[#2a2a2a] border border-[#444444] rounded-lg px-6 py-4 max-w-md text-center">
              <div className="text-4xl mb-3">🏆</div>
              <div className="text-[#ffffff] text-xl font-bold mb-2">Auction Ended!</div>
              <div className="text-[#cccccc] text-sm">
                Winner: <span className="font-semibold">{data.winner?.agentId}</span>
              </div>
              <div className="text-[#888888] text-xs mt-1">
                Final Bid: ${data.finalBid?.toFixed(2)} USDC
              </div>
            </div>
          </div>
        );
      }
    }

    // Agent events - left/right aligned
    return (
      <div key={event.sequence} className={`flex ${isAgentA ? 'justify-start' : 'justify-end'} mb-4`}>
        <div className={`flex gap-3 max-w-lg ${isAgentA ? 'flex-row' : 'flex-row-reverse'}`}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-[#333333] flex items-center justify-center text-xl">
              {getAgentAvatar(agentId!)}
            </div>
          </div>

          {/* Message content */}
          <div className={`flex flex-col ${isAgentA ? 'items-start' : 'items-end'}`}>
            <div className="text-[#888888] text-xs mb-1 px-2">
              {agentId}
            </div>

            {/* Render based on event type */}
            {eventType === 'agent_evaluation_start' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs flex items-center gap-1">
                  <span>🧠</span>
                  <span>{data.trigger === 'refund_detected' ? 'Re-evaluating...' : 'Starting evaluation...'}</span>
                </div>
              </div>
            )}

            {eventType === 'agent_tool_call' && (
              <div
                className={`rounded-2xl px-3 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                } relative overflow-hidden`}
              >
                {/* Shimmer animation */}
                <div className="absolute inset-0 shimmer"></div>

                <div className="text-[#888888] text-xs flex items-center gap-1.5 relative z-10">
                  <span className="animate-pulse">⚙️</span>
                  <span className="font-mono">{data.tool}</span>
                </div>
              </div>
            )}

            {eventType === 'agent_thinking' && data.thinking && (
              <div
                className={`rounded-2xl px-4 py-3 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs mb-1 flex items-center gap-1">
                  <span>💭</span>
                  <span>Thinking...</span>
                </div>
                <div className="text-[#cccccc] text-sm italic">
                  "{data.thinking}"
                </div>
                {data.proposedAmount && (
                  <div className="text-[#888888] text-xs mt-2">
                    Proposing: <span className="text-[#aaaaaa]">${data.proposedAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {eventType === '402_call_initiated' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs">
                  💳 Initiating payment: ${data.proposedAmount?.toFixed(2)}
                </div>
              </div>
            )}

            {eventType === '402_response_received' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className={`text-xs ${data.accepted ? 'text-[#aaaaaa]' : 'text-[#888888]'}`}>
                  {data.accepted ? '✅' : '⚠️'} {data.message}
                </div>
              </div>
            )}

            {eventType === 'bid_placed' && (
              <div
                className={`rounded-2xl px-4 py-3 ${
                  isAgentA ? 'bg-[#333333] rounded-tl-sm' : 'bg-[#444444] rounded-tr-sm'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[#cccccc] text-sm">Bid placed:</span>
                  <span className="text-[#ffffff] text-2xl font-bold">
                    ${data.amount.toFixed(2)}
                  </span>
                  <span className="text-[#888888] text-xs">USDC</span>
                </div>
                {data.transactionHash && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${data.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#666666] hover:text-[#888888] text-xs underline mt-2 inline-block"
                  >
                    View on Basescan →
                  </a>
                )}
              </div>
            )}

            {eventType === 'post_bid_analysis' && data.reflection && (
              <div
                className={`rounded-2xl px-4 py-3 mt-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#aaaaaa] text-xs leading-relaxed italic">
                  {data.reflection}
                </div>
              </div>
            )}

            {eventType === 'refund_detected' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs">
                  🔔 Refund detected: ${data.amount?.toFixed(2)}
                </div>
              </div>
            )}

            {/* Fallback for any unhandled event types */}
            {!['agent_evaluation_start', 'agent_tool_call', 'agent_thinking', 'bid_placed', 
                'post_bid_analysis', 'refund_detected', '402_call_initiated', '402_response_received'].includes(eventType) && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs">
                  <span className="font-mono">{eventType}</span>
                  {data && Object.keys(data).length > 0 && (
                    <div className="text-[#666666] text-xs mt-1">
                      {JSON.stringify(data, null, 2).substring(0, 100)}...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      {/* Shimmer animation styles */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .shimmer::after {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.03) 20%,
            rgba(255, 255, 255, 0.05) 60%,
            rgba(255, 255, 255, 0)
          );
          animation: shimmer 1.5s infinite;
        }
      `}</style>

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
            <div className="text-right">
              <div className="text-[#888888] text-xs uppercase tracking-wide">Current Bid</div>
              <div className="text-[#ffffff] text-2xl font-bold">
                ${currentBid?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Status Bar */}
      <div className="bg-[#222222] border-b border-[#333333] px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-around">
          {['AgentA', 'AgentB'].map(agentId => {
            const isWinner = currentWinner === agentId;

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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages Container (iMessage style) */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center text-[#666666] py-12">
              <div className="text-4xl mb-4">💬</div>
              <p>Waiting for agents to start bidding...</p>
            </div>
          ) : (
            messages.map((event, idx) => renderEvent(event, idx)).filter(Boolean)
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
