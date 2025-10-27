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
    holeCards?: [Card, Card]; // Hole cards for TV poker view
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
        // Update final chip stacks
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
    return agentId.includes('A') ? '#d4af8c' : '#628268';
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

  const renderEvent = (event: PokerEvent, idx: number) => {
    const { type, data } = event;
    const agentId = data.agentId;
    const isAgentA = agentId?.includes('A');

    // System events (centered)
    if (type === 'hand_started' || type === 'cards_dealt' || type === 'betting_round_complete' ||
        type === 'hand_complete' || type === 'game_ended') {

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

      return null;
    }

    // Agent events (left/right aligned)
    if (!agentId) return null;

    return (
      <div key={`${idx}-${event.sequence}-${type}`} className={`flex ${isAgentA ? 'justify-start' : 'justify-end'} mb-4`}>
        <div className={`flex gap-3 max-w-lg ${isAgentA ? 'flex-row' : 'flex-row-reverse'}`}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: getAgentColor(agentId) }}
            >
              {agentId.charAt(agentId.length - 1)}
            </div>
          </div>

          {/* Message content */}
          <div className={`flex flex-col ${isAgentA ? 'items-start' : 'items-end'}`}>
            <div className="text-[#888888] text-xs mb-1 px-2">
              {data.agentName || agentId}
            </div>

            {/* Agent thinking */}
            {type === 'agent_thinking' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs flex items-center gap-1">
                  <span className="animate-pulse">💭</span>
                  <span>Thinking...</span>
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
                <div className="flex items-baseline gap-2">
                  <span className="text-[#cccccc] text-sm font-semibold">
                    {data.action.toUpperCase()}
                  </span>
                  {data.amount && (
                    <>
                      <span className="text-[#ffffff] text-lg font-bold">
                        ${data.amount.toFixed(2)}
                      </span>
                      <span className="text-[#888888] text-xs">USDC</span>
                    </>
                  )}
                </div>
                <div className="text-[#888888] text-xs mt-1">
                  Stack: ${data.chipStackAfter?.toFixed(2)}
                </div>
              </div>
            )}

            {/* Blind posted */}
            {type === 'blind_posted' && (
              <div
                className={`rounded-2xl px-4 py-2 bg-[#2a2a2a] border border-[#444444] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#888888] text-xs">
                  Posted {data.blindType} blind: ${data.amount?.toFixed(2)}
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

            {/* Agent decision complete */}
            {type === 'agent_decision_complete' && data.reasoning && (
              <div
                className={`rounded-2xl px-4 py-3 bg-[#333333] border border-[#555555] ${
                  isAgentA ? 'rounded-tl-sm' : 'rounded-tr-sm'
                }`}
              >
                <div className="text-[#cccccc] text-xs leading-relaxed">
                  {data.reasoning.substring(0, 200)}
                  {data.reasoning.length > 200 && '...'}
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
      {/* Header */}
      <div className="bg-[#2a2a2a] border-b border-[#333333] px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[#ffffff] text-xl font-semibold">
                Poker Game: {gameId}
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

      {/* Game Status Bar */}
      {gameState && gameState.players && gameState.players.length > 0 && (
        <div className="bg-[#222222] border-b border-[#333333] px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-around">
            {gameState.players.map(player => (
              <div key={player.agentId} className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl"
                  style={{ backgroundColor: getAgentColor(player.agentId) }}
                >
                  {player.agentId.charAt(player.agentId.length - 1)}
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
                  {/* Hole Cards (TV Poker View) */}
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
            <div className="max-w-4xl mx-auto mt-4 text-center">
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

      {/* Events Feed (iMessage style) */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {events.length === 0 ? (
            <div className="text-center text-[#666666] py-12">
              <div className="text-4xl mb-4">🎰</div>
              <p>Waiting for poker game to start...</p>
              <p className="text-sm mt-2">Game ID: {gameId}</p>
            </div>
          ) : (
            events.map((event, idx) => renderEvent(event, idx)).filter(Boolean)
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
