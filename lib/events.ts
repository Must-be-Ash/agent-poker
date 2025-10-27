// MongoDB-based event storage (replaces SSE EventEmitter)
import { storeEvent as dbStoreEvent, storePokerEvent as dbStorePokerEvent } from './db';
import type { AuctionEvent } from '@/types';
import type { PokerEventType } from './poker-events';

// ============================================================================
// AUCTION EVENT BROADCASTING
// ============================================================================

/**
 * Store an auction event to MongoDB for a basename
 * Events are retrieved via polling endpoint
 */
export async function storeEvent(
  basename: string,
  eventType: AuctionEvent['eventType'],
  data: Record<string, unknown>
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

// ============================================================================
// POKER EVENT BROADCASTING
// ============================================================================

/**
 * Store a poker event to MongoDB for a game
 * Events are retrieved via SSE streaming or polling endpoint
 * @param gameId - Game identifier
 * @param eventType - Type of poker event
 * @param data - Event data payload
 */
export async function storePokerEvent(
  gameId: string,
  eventType: PokerEventType,
  data: Record<string, unknown>
): Promise<void> {
  console.log(`🔵 [POKER EVENTS] storePokerEvent wrapper called: ${eventType}`);
  try {
    await dbStorePokerEvent(gameId, eventType, data);
    console.log(`✅ [POKER EVENTS] storePokerEvent wrapper completed: ${eventType}`);
  } catch (error) {
    console.error(`❌ [POKER EVENT] Failed to store ${eventType}:`, error);
  }
}

// Alias for consistency
export const broadcastPokerEvent = storePokerEvent;

/**
 * Emit a poker event (alias for storePokerEvent)
 * Matches the pattern used by poker agents
 */
export const emitPokerEvent = storePokerEvent;
