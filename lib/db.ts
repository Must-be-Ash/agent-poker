import { MongoClient, Db } from 'mongodb';
import { BidRecord } from '@/types';

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
