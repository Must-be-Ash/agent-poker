'use client';

import { use, useEffect, useState, useRef } from 'react';
import type { PokerEventType } from '@/lib/poker-events';

interface PokerEvent {
  sequence: number;
  type: PokerEventType;
  timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

interface Card {
  rank: string;
  suit: string;
}

interface GameState {
  pot: number;
  communityCards: Card[];
  bettingRound: string;
  handNumber: number;
  players: {
    agentId: string;
    agentName: string;
    chipStack: number;
    currentBet: number;
    status: string;
    holeCards?: [Card, Card];
  }[];
}

export default function PokerGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const [events, setEvents] = useState<PokerEvent[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastSequence, setLastSequence] = useState<number>(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // Poll for poker events every 1 second
  useEffect(() => {
    const pollEvents = async () => {
      try {
        const response = await fetch(
          `/api/poker/events/${encodeURIComponent(gameId)}?after=${lastSequence}`
        );
        const data = await response.json();

        if (data.events && data.events.length > 0) {
          setEvents(prev => [...prev, ...data.events]);
          const maxSeq = Math.max(...data.events.map((e: { sequence: number }) => e.sequence));
          setLastSequence(maxSeq);

          // Update game state from latest events
          data.events.forEach((event: PokerEvent) => {
            updateGameStateFromEvent(event);
          });
        }
      } catch (error) {
        console.error('Error polling poker events:', error);
      }
    };

    pollEvents();
    pollingIntervalRef.current = setInterval(pollEvents, 1000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [gameId, lastSequence]);

  const updateGameStateFromEvent = (event: PokerEvent) => {
    const { type, data } = event;

    switch (type) {
      case 'hand_started':
        setGameState({
          pot: 0,
          communityCards: [],
          bettingRound: 'preflop',
          handNumber: data.handNumber,
          players: data.players || [],
        });
        break;

      case 'cards_dealt':
        setGameState(prev => prev ? {
          ...prev,
          communityCards: data.communityCards || [],
          bettingRound: data.bettingRound,
          pot: data.pot || prev.pot,
        } : null);
        break;

      case 'action_taken':
        setGameState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            pot: data.potAfter || prev.pot,
            players: prev.players.map(p =>
              p.agentId === data.agentId
                ? { ...p, chipStack: data.chipStackAfter, currentBet: data.currentBetAfter }
                : p
            ),
          };
        });
        break;

      case 'hand_complete':
        if (data.finalChipStacks) {
          setGameState(prev => prev ? {
            ...prev,
            players: prev.players.map(p => ({
              ...p,
              chipStack: data.finalChipStacks[p.agentId] || p.chipStack,
            })),
          } : null);
        }
        break;
    }
  };

  const getAgentColor = (agentId: string) => {
    return agentId.includes('a') || agentId.includes('A') ? '#d4af8c' : '#628268';
  };

  const formatCard = (card: Card) => {
    const suitSymbols: Record<string, string> = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠',
    };
    const suit = suitSymbols[card.suit.toLowerCase()] || card.suit;
    const isRed = card.suit.toLowerCase() === 'hearts' || card.suit.toLowerCase() === 'diamonds';
    return { display: `${card.rank}${suit}`, isRed };
  };

  const renderAgentEvent = (event: PokerEvent, idx: number, isAgentA: boolean) => {
    const { type, data } = event;

    return (
      <div key={`${idx}-${event.sequence}-${type}`} className={`flex ${isAgentA ? 'justify-start' : 'justify-end'} mb-4`}>
        <div className={`flex gap-3 max-w-lg ${isAgentA ? 'flex-row' : 'flex-row-reverse'}`}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: getAgentColor(data.agentId) }}
            >
              {data.agentId.charAt(data.agentId.length - 1).toUpperCase()}
            </div>
          </div>

          {/* Message content */}
          <div className={`flex flex-col ${isAgentA ? 'items-start' : 'items-end'}`}>
            <div className="text-[#888888] text-xs mb-1 px-2">
              {data.agentName || data.agentId}
            </div>

            {/* Agent thinking */}
            {type === 'agent_thinking' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] relative overflow-hidden ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                {/* Shimmer animation */}
                <div className="absolute inset-0 shimmer"></div>
                <div className="text-[#888888] text-xs flex items-center gap-1 relative z-10">
                  <span className="animate-pulse">💭</span>
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            {/* Agent decision complete (reasoning) */}
            {type === 'agent_decision_complete' && data.reasoning && (
              <div
                className={`rounded-2xl px-4 py-3 bg-[#333333] border border-[#555555] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#aaaaaa] text-xs mb-1 flex items-center gap-1">
                  <span>💰</span>
                  <span>Decision</span>
                </div>
                <div className="text-[#cccccc] text-xs leading-relaxed italic">
                  &quot;{data.reasoning}&quot;
                </div>
              </div>
            )}

            {/* Action taken */}
            {type === 'action_taken' && (
              <div
                className={`rounded-2xl px-4 py-3 ${
                  isAgentA ? 'bg-[#333333] rounded-tl-sm' : 'bg-[#444444] rounded-tr-sm'
                }`}
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[#cccccc] text-sm font-semibold">
                    {data.action.toUpperCase()}
                  </span>
                  {data.amount && data.amount > 0 && (
                    <>
                      <span className="text-[#ffffff] text-lg font-bold">
                        ${data.amount.toFixed(2)}
                      </span>
                      <span className="text-[#888888] text-xs">USDC</span>
                    </>
                  )}
                </div>
                <div className="text-[#888888] text-xs">
                  Stack: ${data.chipStackAfter?.toFixed(2)}
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

            {/* Tool call */}
            {type === 'agent_tool_call' && (
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

            {/* Tool response */}
            {type === 'agent_tool_response' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs flex items-center gap-1">
                  <span>✓</span>
                  <span className="font-mono">{data.tool} complete</span>
                </div>
              </div>
            )}

            {/* Poker action initiated */}
            {type === 'poker_action_initiated' && (
              <div
                className={`rounded-2xl px-4 py-3 bg-[#333333] border border-[#555555] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#cccccc] text-sm mb-2 font-semibold">
                  💡 {data.action?.toUpperCase()} {data.amount ? `$${data.amount}` : ''}
                </div>
                {data.reasoning && (
                  <div className="text-[#aaaaaa] text-xs leading-relaxed italic">
                    &quot;{data.reasoning}&quot;
                  </div>
                )}
              </div>
            )}

            {/* Poker action response */}
            {type === 'poker_action_response' && (
              <div
                className={`rounded-2xl px-3 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs flex items-center gap-1">
                  <span>✓</span>
                  <span>{data.action} executed</span>
                </div>
              </div>
            )}

            {/* Blind posted */}
            {type === 'blind_posted' && (
              <div
                className={`rounded-2xl px-4 py-3 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#cccccc] text-sm mb-1">
                  Posted {data.blindType} blind: ${data.amount?.toFixed(2)}
                </div>
                <div className="text-[#888888] text-xs">
                  Stack: ${data.chipStackAfter?.toFixed(2)}
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

            {/* Agent joined */}
            {type === 'agent_joined' && (
              <div
                className={`rounded-2xl px-4 py-3 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#cccccc] text-sm mb-1">
                  🎰 Joined game
                </div>
                {data.balance && (
                  <div className="text-[#888888] text-xs">
                    Balance: ${data.balance.toFixed(2)} USDC
                  </div>
                )}
                {data.personality && (
                  <div className="text-[#666666] text-xs mt-1">
                    Style: {data.personality.style}
                  </div>
                )}
              </div>
            )}

            {/* Agent error */}
            {type === 'agent_error' && (
              <div
                className={`rounded-2xl px-4 py-3 bg-[#3a2a2a] border border-[#664444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#ff8888] text-sm mb-1">
                  ❌ Error
                </div>
                {data.error && (
                  <div className="text-[#cc8888] text-xs">
                    {data.error}
                  </div>
                )}
              </div>
            )}

            {/* Balance check */}
            {type === 'agent_balance_check' && (
              <div
                className={`rounded-2xl px-3 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs flex items-center gap-1">
                  <span>💵</span>
                  <span>Balance: ${data.balance?.toFixed(2)} USDC</span>
                </div>
              </div>
            )}

            {/* Waiting */}
            {type === 'agent_waiting' && (
              <div
                className={`rounded-2xl px-3 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs flex items-center gap-1">
                  <span>⏳</span>
                  <span>Waiting for turn...</span>
                </div>
              </div>
            )}

            {/* Agent reflection */}
            {type === 'agent_reflection' && data.reflection && (
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
          </div>
        </div>
      </div>
    );
  };

  const renderCenterEvent = (event: PokerEvent, idx: number) => {
    const { type, data } = event;

    if (type === 'hand_started') {
      return (
        <div key={`${idx}-${event.sequence}-${type}`} className="flex justify-center my-6">
          <div className="bg-[#2a2a2a] border border-[#444444] rounded-lg px-6 py-3 max-w-md text-center">
            <div className="text-2xl mb-2">🎴</div>
            <div className="text-[#ffffff] text-lg font-bold">Hand #{data.handNumber}</div>
            <div className="text-[#888888] text-xs mt-1">
              Dealer: {data.dealerPosition === 0 ? 'Agent A' : 'Agent B'}
            </div>
            <div className="text-[#888888] text-xs">
              Blinds: ${data.smallBlindAmount} / ${data.bigBlindAmount}
            </div>
          </div>
        </div>
      );
    }

    if (type === 'cards_dealt') {
      return (
        <div key={`${idx}-${event.sequence}-${type}`} className="flex justify-center my-4">
          <div className="bg-[#1e3a1e] border border-[#2d5a2d] rounded-lg px-4 py-2">
            <div className="text-[#90ee90] text-sm font-semibold">
              {data.bettingRound.toUpperCase()} - {data.cards?.length} card{data.cards?.length !== 1 ? 's' : ''} dealt
            </div>
          </div>
        </div>
      );
    }

    if (type === 'hand_complete') {
      return (
        <div key={`${idx}-${event.sequence}-${type}`} className="flex justify-center my-6">
          <div className="bg-[#2a2a2a] border border-[#444444] rounded-lg px-6 py-4 max-w-md text-center">
            <div className="text-3xl mb-3">🏆</div>
            <div className="text-[#ffffff] text-xl font-bold mb-2">
              {data.winnerName} wins!
            </div>
            <div className="text-[#cccccc] text-sm mb-1">
              Pot: ${data.amountWon?.toFixed(2)}
            </div>
            {data.winningHand && (
              <div className="text-[#888888] text-xs">
                {data.winningHand.name || 'Best hand'}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (type === 'game_ended') {
      return (
        <div key={`${idx}-${event.sequence}-${type}`} className="flex justify-center my-6">
          <div className="bg-[#1e3a1e] border border-[#2d5a2d] rounded-lg px-8 py-6 max-w-md text-center">
            <div className="text-5xl mb-4">🎉</div>
            <div className="text-[#90ee90] text-2xl font-bold mb-3">Game Over!</div>
            <div className="text-[#ffffff] text-lg mb-2">
              Winner: {data.winnerName}
            </div>
            <div className="text-[#cccccc] text-sm">
              Final chips: ${data.winnerChips?.toFixed(2)}
            </div>
            <div className="text-[#888888] text-xs mt-3">
              {data.handsPlayed} hands played
            </div>
          </div>
        </div>
      );
    }

    if (type === 'showdown') {
      return (
        <div key={`${idx}-${event.sequence}-${type}`} className="flex justify-center my-6">
          <div className="bg-[#2a2a2a] border border-[#444444] rounded-lg px-6 py-4 max-w-md text-center">
            <div className="text-3xl mb-2">🃏</div>
            <div className="text-[#ffffff] text-lg font-bold mb-2">Showdown!</div>
            <div className="text-[#888888] text-xs">
              Players reveal their cards
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // Separate events by agent (use exact match to avoid overlap)
  const agentAEvents = events.filter(e => {
    const agentId = e.data.agentId;
    return agentId === 'agent-a';
  });

  const agentBEvents = events.filter(e => {
    const agentId = e.data.agentId;
    return agentId === 'agent-b';
  });

  const centerEvents = events.filter(e => {
    const { type } = e;
    // Exclude 'hand_started' as hand number is already shown in sticky header
    return ['cards_dealt', 'betting_round_complete', 'showdown', 'hand_complete', 'game_ended'].includes(type);
  });

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

      {/* Sticky Header Container */}
      <div className="sticky top-0 z-10 bg-[#1a1a1a]">
        {/* Header */}
        <div className="bg-[#2a2a2a] border-b border-[#333333] px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[#ffffff] text-xl font-semibold">
                  Poker: {gameId}
                </h1>
                <p className="text-[#888888] text-sm">AI vs AI Texas Hold&apos;em</p>
              </div>
              <div className="text-right">
                <div className="text-[#888888] text-xs uppercase tracking-wide">Pot</div>
                <div className="text-[#ffffff] text-2xl font-bold">
                  ${gameState?.pot?.toFixed(2) || '0.00'}
                </div>
                {gameState?.handNumber && (
                  <div className="text-[#888888] text-xs mt-1">
                    Hand #{gameState.handNumber}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Agent Status Bar */}
        {gameState && gameState.players && gameState.players.length > 0 && (
          <div className="bg-[#222222] border-b border-[#333333] px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-around">
            {gameState.players.map(player => (
              <div key={player.agentId} className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl"
                  style={{ backgroundColor: getAgentColor(player.agentId) }}
                >
                  {player.agentId.charAt(player.agentId.length - 1).toUpperCase()}
                </div>
                <div>
                  <div className="text-[#ffffff] font-semibold">{player.agentName}</div>
                  <div className="text-[#aaaaaa] text-sm">
                    ${player.chipStack?.toFixed(2)}
                  </div>
                  {player.currentBet > 0 && (
                    <div className="text-[#888888] text-xs">
                      Bet: ${player.currentBet?.toFixed(2)}
                    </div>
                  )}
                  {player.holeCards && player.holeCards.length === 2 && (
                    <div className="flex gap-1 mt-2">
                      {player.holeCards.map((card, idx) => {
                        const formatted = formatCard(card);
                        return (
                          <div
                            key={idx}
                            className="bg-white px-2 py-1 rounded shadow-md font-mono text-xs font-bold"
                            style={{ color: formatted.isRed ? '#dc2626' : '#000000' }}
                          >
                            {formatted.display}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Community Cards */}
          {gameState.communityCards && gameState.communityCards.length > 0 && (
            <div className="max-w-7xl mx-auto mt-4 text-center">
              <div className="text-[#888888] text-xs uppercase tracking-wide mb-2">
                {gameState.bettingRound}
              </div>
              <div className="flex justify-center gap-2">
                {gameState.communityCards.map((card, idx) => {
                  const formatted = formatCard(card);
                  return (
                    <div
                      key={idx}
                      className="bg-white px-3 py-4 rounded-lg font-mono text-sm font-bold shadow-lg"
                      style={{ color: formatted.isRed ? '#dc2626' : '#000000' }}
                    >
                      {formatted.display}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Split-View Events Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {events.length === 0 ? (
            <div className="text-center text-[#666666] py-12">
              <div className="text-4xl mb-4">🎰</div>
              <p>Waiting for poker game to start...</p>
              <p className="text-sm mt-2">Game ID: {gameId}</p>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr,auto,1fr] gap-8">
              {/* Agent A Column (Left) */}
              <div className="space-y-4">
                {agentAEvents.map((event, idx) => renderAgentEvent(event, idx, true))}
              </div>

              {/* Center Column (System Events) */}
              <div className="w-px bg-[#333333]" />

              {/* Agent B Column (Right) */}
              <div className="space-y-4">
                {agentBEvents.map((event, idx) => renderAgentEvent(event, idx, false))}
              </div>
            </div>
          )}

          {/* Center events overlay */}
          <div className="mt-6">
            {centerEvents.map((event, idx) => renderCenterEvent(event, idx)).filter(Boolean)}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
