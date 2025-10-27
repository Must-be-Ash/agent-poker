/**
 * Poker Game Monitoring Dashboard
 *
 * Lists all active poker games with their current status:
 * - Game ID and players
 * - Current hand number and betting round
 * - Chip stacks and pot size
 * - Current player whose turn it is
 * - Time remaining for current turn
 * - Link to detailed game view
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PlayerInfo {
  agentId: string;
  agentName: string;
  chipStack: number;
  status: string;
}

interface GameInfo {
  gameId: string;
  handNumber: number;
  bettingRound: string;
  pot: number;
  currentBet: number;
  gameStatus: string;
  players: PlayerInfo[];
  currentPlayerIndex: number;
  smallBlind: number;
  bigBlind: number;
  updatedAt: string;
}

export default function PokerDashboard() {
  const router = useRouter();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('/api/poker/games');
        if (!response.ok) {
          throw new Error('Failed to fetch games');
        }
        const data = await response.json();
        setGames(data.games || []);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    fetchGames();
    const interval = setInterval(fetchGames, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, []);

  const handleStartGame = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch('/api/poker/start', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to create game');
      }

      const data = await response.json();
      console.log('Game created:', data.gameId);

      // Redirect to the new game page
      router.push(`/poker/${data.gameId}`);
    } catch (err) {
      console.error('Error creating game:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create game');
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Poker Game Dashboard</h1>
          <div className="text-gray-500">Loading games...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Poker Game Dashboard</h1>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Poker Game Dashboard</h1>
          <div className="text-sm text-gray-500">
            {games.length} {games.length === 1 ? 'game' : 'games'}
          </div>
        </div>

        {/* Start Game Button */}
        <div className="mb-6">
          <button
            onClick={handleStartGame}
            disabled={creating}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow transition-colors"
          >
            {creating ? 'Creating Game...' : 'Start New Game'}
          </button>
          {createError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {createError}
            </div>
          )}
        </div>

        {games.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No active poker games. Create a game to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => {
              const currentPlayer = game.players[game.currentPlayerIndex];
              const timeSinceUpdate = Date.now() - new Date(game.updatedAt).getTime();
              const secondsSinceUpdate = Math.floor(timeSinceUpdate / 1000);
              const isStale = secondsSinceUpdate > 60;

              return (
                <Link
                  key={game.gameId}
                  href={`/poker/${game.gameId}`}
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                >
                  <div className="p-6">
                    {/* Game Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-xl font-semibold mb-1">{game.gameId}</h2>
                        <div className="flex gap-4 text-sm text-gray-600">
                          <span>Hand #{game.handNumber}</span>
                          <span className="capitalize">{game.bettingRound}</span>
                          <span className={`font-semibold ${
                            game.gameStatus === 'ended' ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {game.gameStatus}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">
                          Pot: ${game.pot}
                        </div>
                        <div className="text-sm text-gray-500">
                          Blinds: ${game.smallBlind}/${game.bigBlind}
                        </div>
                      </div>
                    </div>

                    {/* Players */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {game.players.map((player, idx) => {
                        const isCurrentPlayer = idx === game.currentPlayerIndex;
                        const hasChips = player.chipStack > 0;

                        return (
                          <div
                            key={player.agentId}
                            className={`p-4 rounded-lg border-2 ${
                              isCurrentPlayer && game.gameStatus === 'in_progress'
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold">{player.agentName}</div>
                                <div className="text-xs text-gray-500 capitalize">
                                  {player.status}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-lg font-bold ${
                                  hasChips ? 'text-gray-900' : 'text-red-600'
                                }`}>
                                  ${player.chipStack}
                                </div>
                                {isCurrentPlayer && game.gameStatus === 'in_progress' && (
                                  <div className="text-xs text-blue-600 font-semibold">
                                    Their turn
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Current Turn Info */}
                    {game.gameStatus === 'in_progress' && currentPlayer && (
                      <div className="flex justify-between items-center text-sm">
                        <div className="text-gray-600">
                          Waiting for <span className="font-semibold">{currentPlayer.agentName}</span> to act
                        </div>
                        <div className={`${isStale ? 'text-orange-600' : 'text-gray-500'}`}>
                          Last update: {secondsSinceUpdate}s ago
                        </div>
                      </div>
                    )}

                    {game.gameStatus === 'ended' && (
                      <div className="text-center text-red-600 font-semibold">
                        Game has ended
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold mb-2">Quick Start</h3>
          <div className="text-sm text-gray-700 space-y-1">
            <p>1. Use the create endpoint to start a new poker game</p>
            <p>2. Click on a game above to view the detailed poker table</p>
            <p>3. Agents will automatically play using x402 payments</p>
          </div>
        </div>
      </div>
    </div>
  );
}
