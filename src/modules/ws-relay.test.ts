import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { TerrariumWebSocketRelay } from "./ws-relay";
import { SqliteAgentStore, runMigrations } from "./agent-store";
import type { ServerMessage, ClientMessage, AgentConfig, AgentState, ModelTier } from "../types";
import type { HermesGateway } from "./hermes-gateway";

// ---------------------------------------------------------------------------
// Test harness: a real Bun WebSocket server wired to a real relay, plus a
// helper client that buffers incoming messages so tests can assert on them.
// ---------------------------------------------------------------------------

/** Spawns a Bun HTTP+WS server wired to the relay. Returns port + shutdown. */
function startServer(relay: TerrariumWebSocketRelay) {
  const server = Bun.serve({
    port: 0,
    fetch(req, server) {
      if (new URL(req.url).pathname === "/ws") {
        if (server.upgrade(req)) return;
        return new Response("upgrade failed", { status: 500 });
      }
      return new Response("not found", { status: 404 });
    },
    websocket: {
      open: (ws) => relay.handleConnection(ws),
      message: (ws, msg) => relay.handleMessage(ws, String(msg)),
      close: (ws) => relay.handleClose(ws),
    },
  });
  return {
    port: server.port,
    url: `ws://localhost:${server.port}/ws`,
    stop: () => server.stop(true),
  };
}

/** A test client that buffers messages and lets you await them by predicate. */
class TestClient {
  private ws: WebSocket;
  private buffer: ServerMessage[] = [];
  private waiters: Array<{
    predicate: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }> = [];
  public ready: Promise<void>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", (e) => {
      const msg = JSON.parse(String(e.data)) as ServerMessage;
      this.buffer.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (w.predicate(msg)) {
          w.resolve(msg);
          return false;
        }
        return true;
      });
    });
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", () => reject(new Error("ws error")));
    });
  }

  /** Wait for the next message matching the predicate (up to `timeoutMs`). */
  waitFor(
    predicate: (m: ServerMessage) => boolean,
    timeoutMs = 1000,
  ): Promise<ServerMessage> {
    // Drain buffered matches first
    const idx = this.buffer.findIndex(predicate);
    if (idx >= 0) {
      const match = this.buffer.splice(idx, 1)[0]!;
      return Promise.resolve(match);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.predicate !== predicate);
        reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  all(): ServerMessage[] {
    return [...this.buffer];
  }

  close() {
    this.ws.close();
  }
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeStore() {
  const db = new Database(":memory:");
  runMigrations(db);
  return new SqliteAgentStore(db);
}

const sampleConfig: AgentConfig = {
  name: "TestBot",
  specialty: "General Chat",
  spriteId: "sprite-a",
  personality: "helpful",
  modelTier: "Budget",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TerrariumWebSocketRelay", () => {
  let relay: TerrariumWebSocketRelay;
  let server: { port: number; url: string; stop: () => void };
  let store: SqliteAgentStore;
  const clients: TestClient[] = [];

  beforeEach(() => {
    store = makeStore();
    relay = new TerrariumWebSocketRelay(store);
    server = startServer(relay);
  });

  afterEach(() => {
    for (const c of clients) c.close();
    clients.length = 0;
    relay.shutdown();
    server.stop();
  });

  const connect = async () => {
    const c = new TestClient(server.url);
    clients.push(c);
    await c.ready;
    return c;
  };

  describe("connection handshake", () => {
    it("sends `connected` and `agent_list` on connection", async () => {
      // Seed the store before client connects
      const agent = await store.createAgent(sampleConfig);

      const c = await connect();
      const connected = await c.waitFor((m) => m.type === "connected");
      expect(connected.type).toBe("connected");

      const list = await c.waitFor((m) => m.type === "agent_list");
      expect(list.type).toBe("agent_list");
      if (list.type !== "agent_list") throw new Error();
      expect(list.data.agents).toHaveLength(1);
      expect(list.data.agents[0]!.id).toBe(agent.id);
    });

    it("excludes archived agents from the initial agent_list", async () => {
      await store.createAgent({ ...sampleConfig, name: "Active" });
      const b = await store.createAgent({ ...sampleConfig, name: "Archived" });
      await store.archiveAgent(b.id);

      const c = await connect();
      const list = await c.waitFor((m) => m.type === "agent_list");
      if (list.type !== "agent_list") throw new Error();
      expect(list.data.agents.map((a) => a.name)).toEqual(["Active"]);
    });
  });

  describe("ping/pong", () => {
    it("responds with pong to a ping", async () => {
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list"); // drain handshake
      c.send({ type: "ping" });
      const pong = await c.waitFor((m) => m.type === "pong");
      expect(pong.type).toBe("pong");
    });
  });

  describe("request_state", () => {
    it("returns the current agent list on demand", async () => {
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list"); // initial

      await store.createAgent(sampleConfig);
      c.send({ type: "request_state" });

      const list = await c.waitFor((m) => m.type === "agent_list");
      if (list.type !== "agent_list") throw new Error();
      expect(list.data.agents).toHaveLength(1);
    });
  });

  describe("create_agent", () => {
    it("persists the new agent and broadcasts agent_added to all clients", async () => {
      const a = await connect();
      const b = await connect();
      await Promise.all([
        a.waitFor((m) => m.type === "agent_list"),
        b.waitFor((m) => m.type === "agent_list"),
      ]);

      a.send({ type: "create_agent", data: { config: sampleConfig } });

      const [aMsg, bMsg] = await Promise.all([
        a.waitFor((m) => m.type === "agent_added"),
        b.waitFor((m) => m.type === "agent_added"),
      ]);
      if (aMsg.type !== "agent_added" || bMsg.type !== "agent_added")
        throw new Error();
      expect(aMsg.data.agent.name).toBe("TestBot");
      expect(bMsg.data.agent.id).toBe(aMsg.data.agent.id);

      // And the store actually has it
      const stored = await store.getAgent(aMsg.data.agent.id);
      expect(stored).not.toBeNull();
    });

    it("sends an error for invalid config", async () => {
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      // Missing required fields
      c.send({
        type: "create_agent",
        data: {
          // @ts-expect-error — intentionally invalid for the test
          config: { name: "X" },
        },
      });

      const err = await c.waitFor((m) => m.type === "error");
      if (err.type !== "error") throw new Error();
      expect(err.data.message).toMatch(/config|invalid|required/i);
    });
  });

  describe("archive_agent", () => {
    it("archives the agent and broadcasts agent_archived", async () => {
      const agent = await store.createAgent(sampleConfig);
      const a = await connect();
      const b = await connect();
      await Promise.all([
        a.waitFor((m) => m.type === "agent_list"),
        b.waitFor((m) => m.type === "agent_list"),
      ]);

      a.send({ type: "archive_agent", data: { agentId: agent.id } });

      const [aMsg, bMsg] = await Promise.all([
        a.waitFor((m) => m.type === "agent_archived"),
        b.waitFor((m) => m.type === "agent_archived"),
      ]);
      if (aMsg.type !== "agent_archived" || bMsg.type !== "agent_archived")
        throw new Error();
      expect(aMsg.data.agentId).toBe(agent.id);
      expect(bMsg.data.agentId).toBe(agent.id);

      const stored = await store.getAgent(agent.id);
      expect(stored!.archived).toBe(true);
    });

    it("sends error when archiving unknown agent", async () => {
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");
      c.send({ type: "archive_agent", data: { agentId: "does-not-exist" } });
      const err = await c.waitFor((m) => m.type === "error");
      if (err.type !== "error") throw new Error();
      expect(err.data.message).toMatch(/not found/i);
    });
  });

  describe("restore_agent", () => {
    it("restores agent and broadcasts agent_restored with full record", async () => {
      const agent = await store.createAgent(sampleConfig);
      await store.archiveAgent(agent.id);

      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "restore_agent", data: { agentId: agent.id } });
      const msg = await c.waitFor((m) => m.type === "agent_restored");
      if (msg.type !== "agent_restored") throw new Error();
      expect(msg.data.agent.id).toBe(agent.id);
      expect(msg.data.agent.archived).toBe(false);
    });
  });

  describe("update_agent", () => {
    it("applies changes and broadcasts agent_updated", async () => {
      const agent = await store.createAgent(sampleConfig);
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({
        type: "update_agent",
        data: { agentId: agent.id, changes: { statusText: "hello" } },
      });

      const msg = await c.waitFor((m) => m.type === "agent_updated");
      if (msg.type !== "agent_updated") throw new Error();
      expect(msg.data.agent.statusText).toBe("hello");
    });
  });

  describe("malformed input", () => {
    it("sends error on invalid JSON", async () => {
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");
      // Bypass typed send to push raw text
      (c as unknown as { ws: WebSocket }).ws.send("not-json{");
      const err = await c.waitFor((m) => m.type === "error");
      if (err.type !== "error") throw new Error();
      expect(err.data.message).toMatch(/json/i);
    });

    it("sends error on unknown message type", async () => {
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");
      (c as unknown as { ws: WebSocket }).ws.send(
        JSON.stringify({ type: "not-a-real-type" }),
      );
      const err = await c.waitFor((m) => m.type === "error");
      if (err.type !== "error") throw new Error();
      expect(err.data.message).toMatch(/unknown|type/i);
    });
  });

  describe("connection lifecycle", () => {
    it("removes client from broadcast list after close", async () => {
      const a = await connect();
      const b = await connect();
      await Promise.all([
        a.waitFor((m) => m.type === "agent_list"),
        b.waitFor((m) => m.type === "agent_list"),
      ]);

      b.close();
      // Small wait to ensure close propagated
      await Bun.sleep(20);

      a.send({ type: "create_agent", data: { config: sampleConfig } });
      await a.waitFor((m) => m.type === "agent_added");

      // b should not receive anything new (nothing to assert beyond no crash)
      expect(relay.connectionCount()).toBe(1);
    });
  });

  describe("broadcast helper", () => {
    it("sends a typed server message to all connected clients", async () => {
      const a = await connect();
      const b = await connect();
      await Promise.all([
        a.waitFor((m) => m.type === "agent_list"),
        b.waitFor((m) => m.type === "agent_list"),
      ]);

      relay.broadcast({ type: "pong" });
      const [aMsg, bMsg] = await Promise.all([
        a.waitFor((m) => m.type === "pong"),
        b.waitFor((m) => m.type === "pong"),
      ]);
      expect(aMsg.type).toBe("pong");
      expect(bMsg.type).toBe("pong");
    });
  });

  describe("chat", () => {
    /** Fake Hermes that yields predetermined chunks. */
    class FakeHermes implements HermesGateway {
      chunks: string[] = ["Hello", " world"];
      shouldFail = false;

      async isReachable() { return true; }
      async getAgentStates() { return new Map<string, AgentState>(); }
      async createSession() { return "fake-session-id"; }
      async resetSession() { return "fake-reset-session-id"; }
      async *sendChat(): AsyncIterable<string> {
        if (this.shouldFail) throw new Error("Hermes exploded");
        for (const chunk of this.chunks) yield chunk;
      }
    }

    it("streams chat_chunk messages and ends with chat_end", async () => {
      const hermes = new FakeHermes();
      relay.setHermes(hermes);

      const agent = await store.createAgent(sampleConfig);
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "chat", data: { agentId: agent.id, message: "hi" } });

      const chunk1 = await c.waitFor((m) => m.type === "chat_chunk");
      if (chunk1.type !== "chat_chunk") throw new Error();
      expect(chunk1.data.content).toBe("Hello");
      expect(chunk1.data.agentId).toBe(agent.id);

      const chunk2 = await c.waitFor((m) => m.type === "chat_chunk" && m !== chunk1);
      if (chunk2.type !== "chat_chunk") throw new Error();
      expect(chunk2.data.content).toBe(" world");

      const end = await c.waitFor((m) => m.type === "chat_end");
      if (end.type !== "chat_end") throw new Error();
      expect(end.data.agentId).toBe(agent.id);
      expect(end.data.messageId).toBe(chunk1.data.messageId);
    });

    it("sends chat_error when Hermes is not connected", async () => {
      // Don't call relay.setHermes()
      const agent = await store.createAgent(sampleConfig);
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "chat", data: { agentId: agent.id, message: "hi" } });

      const err = await c.waitFor((m) => m.type === "chat_error");
      if (err.type !== "chat_error") throw new Error();
      expect(err.data.message).toMatch(/hermes/i);
    });

    it("sends chat_error when Hermes throws during streaming", async () => {
      const hermes = new FakeHermes();
      hermes.shouldFail = true;
      relay.setHermes(hermes);

      const agent = await store.createAgent(sampleConfig);
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "chat", data: { agentId: agent.id, message: "hi" } });

      const err = await c.waitFor((m) => m.type === "chat_error");
      if (err.type !== "chat_error") throw new Error();
      expect(err.data.message).toMatch(/exploded/i);
    });

    it("sends chat_error for unknown agent", async () => {
      const hermes = new FakeHermes();
      relay.setHermes(hermes);

      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "chat", data: { agentId: "nonexistent", message: "hi" } });

      const err = await c.waitFor((m) => m.type === "chat_error");
      if (err.type !== "chat_error") throw new Error();
      expect(err.data.message).toMatch(/not found/i);
    });

    it("rejects empty message", async () => {
      const hermes = new FakeHermes();
      relay.setHermes(hermes);

      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "chat", data: { agentId: "x", message: "  " } });

      const err = await c.waitFor((m) => m.type === "error");
      if (err.type !== "error") throw new Error();
      expect(err.data.message).toMatch(/requires/i);
    });
  });

  describe("reset_context", () => {
    class FakeHermes implements HermesGateway {
      resetCalled = false;
      async isReachable() { return true; }
      async getAgentStates() { return new Map<string, AgentState>(); }
      async createSession() { return "fake-session-id"; }
      async resetSession() { this.resetCalled = true; return "fresh-session-id"; }
      async *sendChat(): AsyncIterable<string> { yield "test"; }
    }

    it("sends context_reset to the client", async () => {
      const hermes = new FakeHermes();
      relay.setHermes(hermes);

      const agent = await store.createAgent(sampleConfig);
      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "reset_context", data: { agentId: agent.id } });

      const msg = await c.waitFor((m) => m.type === "context_reset");
      if (msg.type !== "context_reset") throw new Error();
      expect(msg.data.agentId).toBe(agent.id);
      expect(hermes.resetCalled).toBe(true);
    });

    it("sends error for unknown agent", async () => {
      const hermes = new FakeHermes();
      relay.setHermes(hermes);

      const c = await connect();
      await c.waitFor((m) => m.type === "agent_list");

      c.send({ type: "reset_context", data: { agentId: "nope" } });

      const err = await c.waitFor((m) => m.type === "error");
      if (err.type !== "error") throw new Error();
      expect(err.data.message).toMatch(/not found/i);
    });
  });
});
