import { MongoClient, Db } from 'mongodb';
import { BidRecord, AuctionEvent } from '@/types';

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
