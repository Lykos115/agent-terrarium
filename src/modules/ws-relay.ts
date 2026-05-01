import type { ServerWebSocket } from "bun";

/** WebSocket Relay — binds incoming WS messages to store reads and Hermes calls. */
export interface WebSocketRelay {
  /** Handle a new WebSocket connection — returns the ws for later message routing */
  handleConnection(ws: ServerWebSocket<unknown>): void;

  /** Route an incoming message from a connected client */
  handleMessage(ws: ServerWebSocket<unknown>, data: string): void;

  /** Handle client disconnect */
  handleClose(ws: ServerWebSocket<unknown>): void;

  /** Broadcast event to all connected clients */
  broadcast(event: string, data: unknown): void;

  /** Close all connections and clean up */
  shutdown(): void;
}

/** Stub implementation — echoes ping/pong, no real routing. */
export class StubWebSocketRelay implements WebSocketRelay {
  private clients = new Set<ServerWebSocket<unknown>>();

  handleConnection(ws: ServerWebSocket<unknown>): void {
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: "connected" }));
  }

  handleMessage(ws: ServerWebSocket<unknown>, data: string): void {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else {
        ws.send(JSON.stringify({ type: "echo", data: msg }));
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }
  }

  handleClose(ws: ServerWebSocket<unknown>): void {
    this.clients.delete(ws);
  }

  broadcast(event: string, data: unknown): void {
    const payload = JSON.stringify({ type: event, data });
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  shutdown(): void {
    for (const ws of this.clients) {
      ws.close(1000, "Server shutting down");
    }
    this.clients.clear();
  }
}
