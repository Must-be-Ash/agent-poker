/**
 * Poker Game Database Operations
 * MongoDB operations for poker game state management
 */

import { connectToDatabase } from './db';
import type { PokerGameRecord, PlayerState, ActionEvent, HandResult } from '@/types/poker';

// Collection name for poker games
const POKER_GAMES_COLLECTION = 'pokerGames';

// ============================================================================
// INDEX MANAGEMENT
// ============================================================================

/**
 * Creates indexes for poker games collection
 * Should be called on application startup or during setup
 */
export async function createPokerGameIndexes(): Promise<void> {
  const { db } = await connectToDatabase();

  const collection = db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION);

  // Create indexes
  await Promise.all([
    // Primary lookup by gameId (unique)
    collection.createIndex({ gameId: 1 }, { unique: true, name: 'idx_gameId' }),

    // Agent game history lookup
    collection.createIndex({ 'players.agentId': 1 }, { name: 'idx_players_agentId' }),

    // Active games query
    collection.createIndex({ gameStatus: 1 }, { name: 'idx_gameStatus' }),

    // Compound index for agent + status queries
    collection.createIndex(
      { 'players.agentId': 1, gameStatus: 1 },
      { name: 'idx_agentId_status' }
    ),

    // Sort by creation date
    collection.createIndex({ createdAt: -1 }, { name: 'idx_createdAt' }),
  ]);

  console.log('✅ Created poker game indexes');
}

/**
 * Creates indexes for hand results collection
 */
export async function createHandResultIndexes(): Promise<void> {
  const { db } = await connectToDatabase();

  const collection = db.collection(HAND_RESULTS_COLLECTION);

  await Promise.all([
    // Lookup by gameId
    collection.createIndex({ gameId: 1 }, { name: 'idx_hr_gameId' }),

    // Compound index for game + hand number
    collection.createIndex(
      { gameId: 1, handNumber: 1 },
      { unique: true, name: 'idx_hr_game_hand' }
    ),
  ]);

  console.log('✅ Created hand result indexes');
}

/**
 * Initializes all poker database indexes
 * Call this once during application setup
 */
export async function initializePokerIndexes(): Promise<void> {
  await createPokerGameIndexes();
  await createHandResultIndexes();
  console.log('✅ All poker database indexes initialized');
}

// ============================================================================
// GAME CRUD OPERATIONS
// ============================================================================

/**
 * Creates a new poker game in the database
 * @param gameId - Unique game identifier
 * @param players - Array of player configurations
 * @param config - Game configuration (blinds, starting chips)
 * @returns The created game record
 */
export async function createPokerGame(
  gameId: string,
  players: {
    agentId: string;
    agentName: string;
    walletAddress: string;
    startingChips: number;
  }[],
  config: {
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
  }
): Promise<PokerGameRecord> {
  const { db } = await connectToDatabase();

  // Initialize player states
  const playerStates: PlayerState[] = players.map((player, index) => ({
    agentId: player.agentId,
    agentName: player.agentName,
    walletAddress: player.walletAddress,
    chipStack: player.startingChips,
    currentBet: 0,
    cards: null,
    status: 'active',
    position: index,
    totalBetThisHand: 0,
    isDealer: index === 0,
    isSmallBlind: index === 0,
    isBigBlind: index === 1,
  }));

  // Create initial game record
  const gameRecord: PokerGameRecord = {
    gameId,
    players: playerStates,
    deck: [],
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentBet: 0,
    bettingRound: 'preflop',
    dealerPosition: 0,
    currentPlayerIndex: 0,
    actionHistory: [],
    handNumber: 0,
    gameStatus: 'waiting',
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    startingChips: config.startingChips,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).insertOne(gameRecord);

  console.log(`✅ Created poker game: ${gameId}`);
  return gameRecord;
}

/**
 * Gets a poker game by gameId
 * @param gameId - Game identifier
 * @returns Game record or null if not found
 */
export async function getPokerGame(gameId: string): Promise<PokerGameRecord | null> {
  const { db } = await connectToDatabase();
  return db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).findOne({ gameId });
}

/**
 * Updates poker game state
 * @param gameId - Game identifier
 * @param updates - Partial game state to update
 */
export async function updateGameState(
  gameId: string,
  updates: Partial<PokerGameRecord>
): Promise<void> {
  const { db } = await connectToDatabase();

  await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).updateOne(
    { gameId },
    {
      $set: { ...updates, updatedAt: new Date() },
    }
  );
}

/**
 * Adds an action to the game's action history
 * @param gameId - Game identifier
 * @param action - Action event to record
 */
export async function addActionToHistory(gameId: string, action: ActionEvent): Promise<void> {
  const { db } = await connectToDatabase();

  await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).updateOne(
    { gameId },
    {
      $push: { actionHistory: action },
      $set: { updatedAt: new Date() },
    }
  );
}

/**
 * Ends a poker game and records final state
 * @param gameId - Game identifier
 * @param winnerId - Winner's agent ID
 * @param finalState - Final game state
 */
export async function endGame(
  gameId: string,
  winnerId: string,
  finalState: Partial<PokerGameRecord>
): Promise<void> {
  const { db } = await connectToDatabase();

  const game = await getPokerGame(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const winner = game.players.find((p) => p.agentId === winnerId);
  if (!winner) {
    throw new Error(`Winner ${winnerId} not found in game`);
  }

  // Calculate final chip counts
  const finalChipCounts: Record<string, number> = {};
  for (const player of game.players) {
    finalChipCounts[player.agentId] = player.chipStack;
  }

  await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).updateOne(
    { gameId },
    {
      $set: {
        ...finalState,
        gameStatus: 'ended',
        winnerId,
        winnerName: winner.agentName,
        finalChipCounts,
        updatedAt: new Date(),
      },
    }
  );

  console.log(`🏆 Game ${gameId} ended. Winner: ${winner.agentName}`);
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Gets all hands played in a game
 * @param gameId - Game identifier
 * @returns Array of action events grouped by hand number
 */
export async function getGameHistory(gameId: string): Promise<ActionEvent[]> {
  const { db } = await connectToDatabase();

  const game = await db
    .collection<PokerGameRecord>(POKER_GAMES_COLLECTION)
    .findOne({ gameId }, { projection: { actionHistory: 1 } });

  return game?.actionHistory || [];
}

/**
 * Gets all active poker games
 * @returns Array of active game records
 */
export async function getActiveGames(): Promise<PokerGameRecord[]> {
  const { db } = await connectToDatabase();

  return db
    .collection<PokerGameRecord>(POKER_GAMES_COLLECTION)
    .find({ gameStatus: 'in_progress' })
    .toArray();
}

/**
 * Gets all games for a specific agent
 * @param agentId - Agent identifier
 * @returns Array of game records where agent participated
 */
export async function getAgentGames(agentId: string): Promise<PokerGameRecord[]> {
  const { db } = await connectToDatabase();

  return db
    .collection<PokerGameRecord>(POKER_GAMES_COLLECTION)
    .find({ 'players.agentId': agentId })
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Deletes a poker game (for testing/cleanup)
 * @param gameId - Game identifier
 */
export async function deletePokerGame(gameId: string): Promise<void> {
  const { db } = await connectToDatabase();

  await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).deleteOne({ gameId });

  console.log(`🗑️  Deleted poker game: ${gameId}`);
}

/**
 * Deletes all poker games (for testing/cleanup)
 */
export async function deleteAllPokerGames(): Promise<void> {
  const { db } = await connectToDatabase();

  const result = await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).deleteMany({});

  console.log(`🗑️  Deleted ${result.deletedCount} poker games`);
}

// ============================================================================
// HAND RESULT TRACKING
// ============================================================================

// Collection for storing completed hand results
const HAND_RESULTS_COLLECTION = 'handResults';

/**
 * Stores a completed hand result
 * @param gameId - Game identifier
 * @param handResult - Hand result data
 */
export async function storeHandResult(gameId: string, handResult: HandResult): Promise<void> {
  const { db } = await connectToDatabase();

  const record = {
    gameId,
    ...handResult,
    storedAt: new Date(),
  };

  await db.collection(HAND_RESULTS_COLLECTION).insertOne(record);
}

/**
 * Gets all hand results for a game
 * @param gameId - Game identifier
 * @returns Array of hand results
 */
export async function getHandResults(gameId: string): Promise<HandResult[]> {
  const { db } = await connectToDatabase();

  const results = await db
    .collection(HAND_RESULTS_COLLECTION)
    .find({ gameId })
    .sort({ handNumber: 1 })
    .toArray();

  return results.map((r) => ({
    handNumber: r.handNumber,
    winnerId: r.winnerId,
    winnerName: r.winnerName,
    winningHand: r.winningHand,
    winningCards: r.winningCards,
    potWon: r.potWon,
    showdownCards: r.showdownCards,
    timestamp: r.timestamp,
  }));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if a game exists
 * @param gameId - Game identifier
 * @returns true if game exists, false otherwise
 */
export async function gameExists(gameId: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const count = await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).countDocuments({ gameId });
  return count > 0;
}

/**
 * Updates a specific player's state in a game
 * @param gameId - Game identifier
 * @param agentId - Agent identifier
 * @param playerUpdate - Partial player state to update
 */
export async function updatePlayerState(
  gameId: string,
  agentId: string,
  playerUpdate: Partial<PlayerState>
): Promise<void> {
  const { db } = await connectToDatabase();

  // Build update object with dot notation for array element
  const updateFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(playerUpdate)) {
    updateFields[`players.$.${key}`] = value;
  }

  await db.collection<PokerGameRecord>(POKER_GAMES_COLLECTION).updateOne(
    { gameId, 'players.agentId': agentId },
    {
      $set: { ...updateFields, updatedAt: new Date() },
    }
  );
}
