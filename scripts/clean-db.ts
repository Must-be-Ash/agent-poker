import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function cleanDatabase() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'agent-bid';

  if (!uri) {
    console.error('❌ MONGODB_URI is not defined in .env.local');
    process.exit(1);
  }

  console.log(`🔌 Connecting to MongoDB...`);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    console.log(`\n📊 Database: ${dbName}`);
    console.log('─'.repeat(50));

    // Clean events collection
    console.log(`\n🗑️  Cleaning collection: events`);
    const eventsResult = await db.collection('events').deleteMany({});
    console.log(`   ✅ Deleted ${eventsResult.deletedCount} event(s)`);

    // Clean bids collection
    console.log(`\n🗑️  Cleaning collection: bids`);
    const bidsResult = await db.collection('bids').deleteMany({});
    console.log(`   ✅ Deleted ${bidsResult.deletedCount} bid record(s)`);

    console.log('\n' + '─'.repeat(50));
    console.log('✨ Database cleaned successfully!');
    console.log('─'.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ Error cleaning database:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed\n');
  }
}

// Run the script
cleanDatabase();
