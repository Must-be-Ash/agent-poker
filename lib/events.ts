// Server-Sent Events broadcaster for real-time auction updates

type EventController = ReadableStreamDefaultController;

// Store active SSE connections per basename
const connections = new Map<string, Set<EventController>>();

/**
 * Register a new SSE connection for a basename
 */
export function registerConnection(basename: string, controller: EventController) {
  if (!connections.has(basename)) {
    connections.set(basename, new Set());
  }
  connections.get(basename)!.add(controller);
  console.log(`📡 SSE connection registered for ${basename} (${connections.get(basename)!.size} total)`);
}

/**
 * Unregister an SSE connection
 */
export function unregisterConnection(basename: string, controller: EventController) {
  const basenameConnections = connections.get(basename);
  if (basenameConnections) {
    basenameConnections.delete(controller);
    console.log(`📡 SSE connection closed for ${basename} (${basenameConnections.size} remaining)`);

    if (basenameConnections.size === 0) {
      connections.delete(basename);
    }
  }
}

/**
 * Broadcast an event to all connected clients for a basename
 */
export function broadcastEvent(basename: string, event: any) {
  const controllers = connections.get(basename);
  if (!controllers || controllers.size === 0) {
    console.log(`📡 No SSE connections for ${basename}, event not broadcast:`, event.type);
    return;
  }

  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(event)}\n\n`;

  console.log(`📡 Broadcasting ${event.type} to ${controllers.size} client(s) for ${basename}`);

  controllers.forEach((controller) => {
    try {
      controller.enqueue(encoder.encode(data));
    } catch (error) {
      console.error('📡 Failed to send to client, removing connection:', error);
      controllers.delete(controller);
    }
  });
}

/**
 * Get the number of active connections for a basename
 */
export function getConnectionCount(basename: string): number {
  return connections.get(basename)?.size || 0;
}

