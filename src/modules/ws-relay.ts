import type { ServerWebSocket } from "bun";
import type {
  Agent,
  AgentConfig,
  ClientMessage,
  ServerMessage,
  Specialty,
  ModelTier,
} from "../types";
import type { AgentStore } from "./agent-store";
import { AgentNotFoundError } from "./agent-store";
import type { HermesGateway } from "./hermes-gateway";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * WebSocketRelay — binds incoming WebSocket messages to store operations
 * and broadcasts agent state changes to all connected clients.
 *
 * This is the shared real-time fabric between server and client. The React
 * app's `useTerrarium` hook talks to an instance of this relay.
 */
export interface WebSocketRelay {
  handleConnection(ws: ServerWebSocket<unknown>): void;
  handleMessage(ws: ServerWebSocket<unknown>, data: string): void;
  handleClose(ws: ServerWebSocket<unknown>): void;
  broadcast(message: ServerMessage): void;
  shutdown(): void;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const VALID_SPECIALTIES: readonly Specialty[] = [
  "Code Reviewer",
  "Spec Griller",
  "General Chat",
  "DevOps",
  "Creative Writer",
  "Researcher",
  "Debugger",
];

const VALID_TIERS: readonly ModelTier[] = ["Budget", "Balanced", "Premium"];

/** Type-guarded validation of an AgentConfig payload from an untrusted client. */
function validateAgentConfig(
  raw: unknown,
): { ok: true; config: AgentConfig } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "config must be an object" };
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== "string" || !c.name.trim()) {
    return { ok: false, error: "config.name is required" };
  }
  if (typeof c.specialty !== "string" || !VALID_SPECIALTIES.includes(c.specialty as Specialty)) {
    return { ok: false, error: "config.specialty is invalid" };
  }
  if (typeof c.spriteId !== "string" || !c.spriteId.trim()) {
    return { ok: false, error: "config.spriteId is required" };
  }
  if (typeof c.personality !== "string") {
    return { ok: false, error: "config.personality is required" };
  }
  if (typeof c.modelTier !== "string" || !VALID_TIERS.includes(c.modelTier as ModelTier)) {
    return { ok: false, error: "config.modelTier is invalid" };
  }
  return {
    ok: true,
    config: {
      name: c.name.trim(),
      specialty: c.specialty as Specialty,
      spriteId: c.spriteId,
      personality: c.personality,
      modelTier: c.modelTier as ModelTier,
    },
  };
}

// ---------------------------------------------------------------------------
// Real implementation
// ---------------------------------------------------------------------------

/**
 * Real WebSocket relay: routes typed `ClientMessage`s to the agent store and
 * broadcasts typed `ServerMessage`s back. All state mutations go through
 * the store; the relay is stateless aside from the connected-client set.
 */
export class TerrariumWebSocketRelay implements WebSocketRelay {
  private readonly clients = new Set<ServerWebSocket<unknown>>();
  private hermes: HermesGateway | null = null;

  constructor(private readonly store: AgentStore) {}

  /** Attach a Hermes gateway for chat routing. */
  setHermes(hermes: HermesGateway): void {
    this.hermes = hermes;
  }

  connectionCount(): number {
    return this.clients.size;
  }

  handleConnection(ws: ServerWebSocket<unknown>): void {
    this.clients.add(ws);
    this.sendTo(ws, { type: "connected" });
    // Fire-and-forget: send initial agent list once the store resolves.
    this.sendAgentList(ws).catch((err) => {
      this.sendTo(ws, {
        type: "error",
        data: { message: `Failed to load agents: ${String(err)}` },
      });
    });
  }

  handleMessage(ws: ServerWebSocket<unknown>, data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.sendTo(ws, {
        type: "error",
        data: { message: "Invalid JSON", code: "invalid_json" },
      });
      return;
    }

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      this.sendTo(ws, {
        type: "error",
        data: { message: "Message missing `type` field", code: "missing_type" },
      });
      return;
    }

    // Cast narrow — individual handlers re-validate the shape of `data`.
    const msg = parsed as ClientMessage;

    // Route async handlers via a promise so one bad message can't crash the
    // relay. Errors become `error` messages to the originating client.
    this.route(ws, msg).catch((err) => {
      this.sendTo(ws, {
        type: "error",
        data: {
          message: err instanceof Error ? err.message : String(err),
          code: "handler_error",
        },
      });
    });
  }

  private async route(
    ws: ServerWebSocket<unknown>,
    msg: ClientMessage,
  ): Promise<void> {
    switch (msg.type) {
      case "ping":
        this.sendTo(ws, { type: "pong" });
        return;

      case "request_state":
        await this.sendAgentList(ws);
        return;

      case "create_agent": {
        const validated = validateAgentConfig(msg.data?.config);
        if (!validated.ok) {
          this.sendTo(ws, {
            type: "error",
            data: { message: validated.error, code: "invalid_config" },
          });
          return;
        }
        const agent = await this.store.createAgent(validated.config);
        this.broadcast({ type: "agent_added", data: { agent } });
        return;
      }

      case "archive_agent": {
        const id = msg.data?.agentId;
        if (typeof id !== "string") {
          this.sendTo(ws, {
            type: "error",
            data: { message: "agentId is required", code: "invalid_id" },
          });
          return;
        }
        try {
          await this.store.archiveAgent(id);
          this.broadcast({ type: "agent_archived", data: { agentId: id } });
        } catch (err) {
          this.sendNotFoundOrRethrow(ws, err);
        }
        return;
      }

      case "restore_agent": {
        const id = msg.data?.agentId;
        if (typeof id !== "string") {
          this.sendTo(ws, {
            type: "error",
            data: { message: "agentId is required", code: "invalid_id" },
          });
          return;
        }
        try {
          const agent = await this.store.restoreAgent(id);
          this.broadcast({ type: "agent_restored", data: { agent } });
        } catch (err) {
          this.sendNotFoundOrRethrow(ws, err);
        }
        return;
      }

      case "update_agent": {
        const id = msg.data?.agentId;
        const changes = msg.data?.changes;
        if (typeof id !== "string" || !changes || typeof changes !== "object") {
          this.sendTo(ws, {
            type: "error",
            data: {
              message: "update_agent requires agentId and changes",
              code: "invalid_update",
            },
          });
          return;
        }
        try {
          const agent = await this.store.updateAgent(id, changes as Partial<Agent>);
          this.broadcast({ type: "agent_updated", data: { agent } });
        } catch (err) {
          this.sendNotFoundOrRethrow(ws, err);
        }
        return;
      }

      case "chat": {
        const agentId = msg.data?.agentId;
        const message = msg.data?.message;
        if (typeof agentId !== "string" || typeof message !== "string" || !message.trim()) {
          this.sendTo(ws, {
            type: "error",
            data: { message: "chat requires agentId and message", code: "invalid_chat" },
          });
          return;
        }
        if (!this.hermes) {
          this.sendTo(ws, {
            type: "chat_error",
            data: { agentId, message: "Hermes is not connected" },
          });
          return;
        }

        // Verify agent exists
        const agent = await this.store.getAgent(agentId);
        if (!agent) {
          this.sendTo(ws, {
            type: "chat_error",
            data: { agentId, message: `Agent not found: ${agentId}` },
          });
          return;
        }

        // Stream response from Hermes back to the requesting client
        const messageId = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try {
          for await (const chunk of this.hermes.sendChat(agentId, message.trim())) {
            this.sendTo(ws, {
              type: "chat_chunk",
              data: { agentId, messageId, content: chunk },
            });
          }
          this.sendTo(ws, {
            type: "chat_end",
            data: { agentId, messageId },
          });
        } catch (err) {
          this.sendTo(ws, {
            type: "chat_error",
            data: {
              agentId,
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
        return;
      }

      case "reset_context": {
        const agentId = msg.data?.agentId;
        if (typeof agentId !== "string") {
          this.sendTo(ws, {
            type: "error",
            data: { message: "reset_context requires agentId", code: "invalid_id" },
          });
          return;
        }
        const resetAgent = await this.store.getAgent(agentId);
        if (!resetAgent) {
          this.sendTo(ws, {
            type: "error",
            data: { message: `Agent not found: ${agentId}`, code: "not_found" },
          });
          return;
        }
        try {
          if (this.hermes) {
            const newSessionId = await this.hermes.resetSession(agentId);
            await this.store.updateAgent(agentId, { hermesSessionId: newSessionId } as Partial<Agent>);
          }
          this.sendTo(ws, { type: "context_reset", data: { agentId } });
        } catch (err) {
          this.sendNotFoundOrRethrow(ws, err);
        }
        return;
      }

      default: {
        // Exhaustiveness check falls through on unknown types
        const unknownType = (msg as { type: string }).type;
        this.sendTo(ws, {
          type: "error",
          data: {
            message: `Unknown message type: ${unknownType}`,
            code: "unknown_type",
          },
        });
      }
    }
  }

  handleClose(ws: ServerWebSocket<unknown>): void {
    this.clients.delete(ws);
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      try {
        ws.send(payload);
      } catch {
        // Ignore broken sockets — they'll be cleaned up on close.
      }
    }
  }

  shutdown(): void {
    for (const ws of this.clients) {
      try {
        ws.close(1000, "Server shutting down");
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private sendTo(ws: ServerWebSocket<unknown>, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Ignore — socket may be closing.
    }
  }

  private async sendAgentList(ws: ServerWebSocket<unknown>): Promise<void> {
    const agents = await this.store.listAgents(false);
    this.sendTo(ws, { type: "agent_list", data: { agents } });
  }

  private sendNotFoundOrRethrow(
    ws: ServerWebSocket<unknown>,
    err: unknown,
  ): void {
    if (err instanceof AgentNotFoundError) {
      this.sendTo(ws, {
        type: "error",
        data: { message: err.message, code: "not_found" },
      });
      return;
    }
    this.sendTo(ws, {
      type: "error",
      data: {
        message: err instanceof Error ? err.message : String(err),
        code: "handler_error",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Stub (kept for tests / local dev without a store)
// ---------------------------------------------------------------------------

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
      ws.send(JSON.stringify({ type: "error", data: { message: "Invalid JSON" } }));
    }
  }

  handleClose(ws: ServerWebSocket<unknown>): void {
    this.clients.delete(ws);
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.clients) ws.send(payload);
  }

  shutdown(): void {
    for (const ws of this.clients) ws.close(1000, "Server shutting down");
    this.clients.clear();
  }
}
