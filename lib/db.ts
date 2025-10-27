import { MongoClient, Db } from 'mongodb';
import { BidRecord, AuctionEvent } from '@/types';
import type { PokerEvent, PokerEventType } from './poker-events';

let client: MongoClient;
let db: Db;

export async function connectToDatabase() {
  if (db) {
    return { client, db };
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  if (!dbName) {
    throw new Error('MONGODB_DB_NAME is not defined in environment variables');
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  console.log(`Connected to MongoDB database: ${dbName}`);

  return { client, db };
}

export async function getBidRecord(basename: string): Promise<BidRecord | null> {
  const { db } = await connectToDatabase();
  return db.collection<BidRecord>('bids').findOne({ basename });
}

export async function updateBidRecord(
  basename: string,
  update: Partial<BidRecord>
): Promise<void> {
  const { db } = await connectToDatabase();
  await db.collection<BidRecord>('bids').updateOne(
    { basename },
    {
      $set: { ...update, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
}

export async function addBidToHistory(
  basename: string,
  bid: BidRecord['bidHistory'][0]
): Promise<void> {
  const { db } = await connectToDatabase();
  await db.collection<BidRecord>('bids').updateOne(
    { basename },
    {
      $push: { bidHistory: bid },
      $set: { updatedAt: new Date() }
    }
  );
}

export async function addOrUpdateParticipatingAgent(
  basename: string,
  agentId: string,
  walletAddress?: string
): Promise<void> {
  const { db } = await connectToDatabase();
  const now = new Date();

  // Try to update existing agent's lastActivity
  const updateResult = await db.collection<BidRecord>('bids').updateOne(
    {
      basename,
      'participatingAgents.agentId': agentId,
      'participatingAgents.status': 'active'
    },
    {
      $set: {
        'participatingAgents.$.lastActivity': now,
        ...(walletAddress ? { 'participatingAgents.$.walletAddress': walletAddress } : {}),
        updatedAt: now
      }
    }
  );

  // If no agent was updated, add new participant atomically
  if (updateResult.matchedCount === 0) {
    await db.collection<BidRecord>('bids').updateOne(
      {
        basename,
        'participatingAgents.agentId': { $ne: agentId } // Only add if agent doesn't exist
      },
      {
        $push: {
          participatingAgents: {
            agentId,
            walletAddress,
            status: 'active',
            firstSeen: now,
            lastActivity: now
          }
        },
        $set: { updatedAt: now },
        $setOnInsert: {
          basename,
          currentBid: 0,
          currentWinner: null,
          bidHistory: [],
          auctionStartTime: now,
          auctionEndTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          status: 'active',
          winnerNotified: false,
          withdrawnAgents: [],
          createdAt: now
        }
      },
      { upsert: true }
    );
  }
}

export async function markAgentAsWithdrawn(
  basename: string,
  agentId: string
): Promise<void> {
  const { db } = await connectToDatabase();
  const now = new Date();

  await db.collection<BidRecord>('bids').updateOne(
    {
      basename,
      'participatingAgents.agentId': agentId
    },
    {
      $set: {
        'participatingAgents.$.status': 'withdrawn',
        'participatingAgents.$.lastActivity': now,
        updatedAt: now
      }
    }
  );
}

// Event storage functions for MongoDB-based event streaming
export async function storeEvent(
  basename: string,
  eventType: AuctionEvent['eventType'],
  data: Record<string, unknown>
): Promise<number> {
  console.log(`📝 [EVENT] storeEvent called: ${eventType} for ${basename}`);
  console.log(`   Data:`, JSON.stringify(data));

  const { db } = await connectToDatabase();

  // Get the next sequence number for this basename
  const lastEvent = await db.collection<AuctionEvent>('events')
    .findOne(
      { basename },
      { sort: { sequence: -1 } }
    );

  const sequence = (lastEvent?.sequence ?? -1) + 1;

  const event: Omit<AuctionEvent, '_id'> = {
    basename,
    eventType,
    agentId: typeof data.agentId === 'string' ? data.agentId : undefined,
    sequence,
    timestamp: new Date(),
    data,
    createdAt: new Date(),
  };

  console.log(`📝 [EVENT] Inserting event with sequence ${sequence}`);
  await db.collection<AuctionEvent>('events').insertOne(event as AuctionEvent);

  console.log(`✅ [EVENT] Stored ${eventType} for ${basename} (seq: ${sequence}, agentId: ${data.agentId})`);

  return sequence;
}

export async function getEventsSince(
  basename: string,
  afterSequence: number = -1
): Promise<AuctionEvent[]> {
  const { db } = await connectToDatabase();

  const events = await db.collection<AuctionEvent>('events')
    .find({
      basename,
      sequence: { $gt: afterSequence }
    })
    .sort({ sequence: 1 })
    .toArray();

  return events;
}

// ============================================================================
// POKER EVENT STORAGE
// ============================================================================

/**
 * MongoDB document for poker events
 */
export interface PokerEventDocument {
  gameId: string;
  type: PokerEventType;
  data: Record<string, unknown>;
  timestamp: Date;
  sequence: number;
  createdAt: Date;
}

/**
 * Store a poker event to MongoDB for a game
 * @param gameId - Game identifier
 * @param eventType - Type of poker event
 * @param data - Event data payload
 * @returns Sequence number of the stored event
 */
export async function storePokerEvent(
  gameId: string,
  eventType: PokerEventType,
  data: Record<string, unknown>
): Promise<number> {
  console.log(`📝 [POKER EVENT] storePokerEvent called: ${eventType} for ${gameId}`);
  console.log(`   Data:`, JSON.stringify(data));

  const { db } = await connectToDatabase();

  // Get the next sequence number for this game
  const lastEvent = await db.collection<PokerEventDocument>('pokerEvents')
    .findOne(
      { gameId },
      { sort: { sequence: -1 } }
    );

  const sequence = (lastEvent?.sequence ?? -1) + 1;

  const event: Omit<PokerEventDocument, '_id'> = {
    gameId,
    type: eventType,
    data: { ...data, timestamp: new Date() },
    timestamp: new Date(),
    sequence,
    createdAt: new Date(),
  };

  console.log(`📝 [POKER EVENT] Inserting event with sequence ${sequence}`);
  await db.collection('pokerEvents').insertOne(event);

  console.log(`✅ [POKER EVENT] Stored ${eventType} for ${gameId} (seq: ${sequence})`);

  return sequence;
}

/**
 * Get poker events for a game since a specific sequence number
 * @param gameId - Game identifier
 * @param afterSequence - Get events after this sequence number (default: -1 = all events)
 * @returns Array of poker events sorted by sequence
 */
export async function getPokerEventsSince(
  gameId: string,
  afterSequence: number = -1
): Promise<PokerEventDocument[]> {
  const { db } = await connectToDatabase();

  const events = await db.collection<PokerEventDocument>('pokerEvents')
    .find({
      gameId,
      sequence: { $gt: afterSequence }
    })
    .sort({ sequence: 1 })
    .toArray();

  return events;
}

/**
 * Get all poker events for a game
 * @param gameId - Game identifier
 * @returns Array of all poker events sorted by sequence
 */
export async function getAllPokerEvents(gameId: string): Promise<PokerEventDocument[]> {
  return getPokerEventsSince(gameId, -1);
}

/**
 * Create indexes for poker events collection
 * Should be called during application setup
 */
export async function createPokerEventIndexes(): Promise<void> {
  const { db } = await connectToDatabase();

  const collection = db.collection('pokerEvents');

  await Promise.all([
    // Primary lookup by gameId
    collection.createIndex({ gameId: 1 }, { name: 'idx_poker_gameId' }),

    // Compound index for efficient sequence queries
    collection.createIndex(
      { gameId: 1, sequence: 1 },
      { name: 'idx_poker_game_sequence' }
    ),

    // Index for timestamp-based queries
    collection.createIndex({ createdAt: -1 }, { name: 'idx_poker_createdAt' }),
  ]);

  console.log('✅ Created poker event indexes');
}
