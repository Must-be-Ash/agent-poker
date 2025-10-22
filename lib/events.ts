// MongoDB-based event storage (replaces SSE EventEmitter)
import { storeEvent as dbStoreEvent } from './db';
import type { AuctionEvent } from '@/types';

/**
 * Store an event to MongoDB for a basename
 * Events are retrieved via polling endpoint
 */
export async function storeEvent(
  basename: string,
  eventType: AuctionEvent['eventType'],
  data: any
): Promise<void> {
  console.log(`🔵 [EVENTS] storeEvent wrapper called: ${eventType}`);
  try {
    await dbStoreEvent(basename, eventType, data);
    console.log(`✅ [EVENTS] storeEvent wrapper completed: ${eventType}`);
  } catch (error) {
    console.error(`❌ [EVENT] Failed to store ${eventType}:`, error);
  }
}

// Backward compatibility alias
export const broadcastEvent = storeEvent;
