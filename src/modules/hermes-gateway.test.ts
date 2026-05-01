import { describe, it, expect } from "bun:test";
import {
  HermesGatewayAdapter,
  HermesUnreachableError,
  HermesApiError,
  StubHermesGateway,
} from "./hermes-gateway";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Start a mock Hermes HTTP server and return { url, server, responses, requests }. */
function mockHermesServer() {
  const responses = {
    healthStatus: 200,
    healthBody: { status: "ok" },
    chatStatus: 200,
    chatChunks: ["Hello", " ", "world!"],
    chatToolEvent: false,
  };

  // Records every request the adapter made, so tests can assert on headers/body.
  const requests: { method: string; path: string; headers: Record<string, string>; body: unknown }[] = [];

  const server = Bun.serve({
    port: 0, // random available port
    async fetch(req) {
      const url = new URL(req.url);

      // Capture request metadata for assertions. Body is captured only for POSTs.
      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => { headers[k] = v; });
      let capturedBody: unknown = undefined;
      if (req.method === "POST") {
        try {
          capturedBody = await req.clone().json();
        } catch {
          capturedBody = await req.clone().text();
        }
      }
      requests.push({ method: req.method, path: url.pathname, headers, body: capturedBody });

      // GET /health
      if (req.method === "GET" && url.pathname === "/health") {
        return new Response(JSON.stringify(responses.healthBody), {
          status: responses.healthStatus,
          headers: { "Content-Type": "application/json" },
        });
      }

      // GET /health/detailed (used by isReachable fallback in some designs)
      if (req.method === "GET" && url.pathname === "/health/detailed") {
        return new Response(
          JSON.stringify({ status: "ok", active_agents: 0 }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      // POST /v1/chat/completions
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        const body = capturedBody as { stream?: boolean; model?: string } | undefined;
        const stream = body?.stream === true;

        if (!stream) {
          return new Response(
            JSON.stringify({
              id: "chatcmpl-test",
              object: "chat.completion",
              model: body?.model ?? "hermes-agent",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: responses.chatChunks.join("") },
                  finish_reason: "stop",
                },
              ],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        // Build SSE stream
        const encoder = new TextEncoder();
        const chunks: Uint8Array[] = [];

        // Role chunk
        chunks.push(
          encoder.encode(
            `data: ${JSON.stringify({
              id: "chatcmpl-test",
              object: "chat.completion.chunk",
              created: Date.now(),
              model: body?.model ?? "hermes-agent",
              choices: [
                { index: 0, delta: { role: "assistant" }, finish_reason: null },
              ],
            })}\n\n`,
          ),
        );

        // Optional tool progress event
        if (responses.chatToolEvent) {
          chunks.push(
            encoder.encode(
              `event: hermes.tool.progress\ndata: ${JSON.stringify({
                tool: "read",
                emoji: "📖",
                label: "Reading file",
                toolCallId: "tool-123",
                status: "running",
              })}\n\n`,
            ),
          );
        }

        // Content chunks
        for (const chunk of responses.chatChunks) {
          chunks.push(
            encoder.encode(
              `data: ${JSON.stringify({
                id: "chatcmpl-test",
                object: "chat.completion.chunk",
                created: Date.now(),
                model: body?.model ?? "hermes-agent",
                choices: [
                  {
                    index: 0,
                    delta: { content: chunk },
                    finish_reason: null,
                  },
                ],
              })}\n\n`,
            ),
          );
        }

        // Finish chunk
        chunks.push(
          encoder.encode(
            `data: ${JSON.stringify({
              id: "chatcmpl-test",
              object: "chat.completion.chunk",
              created: Date.now(),
              model: body?.model ?? "hermes-agent",
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            })}\n\n`,
          ),
        );

        // [DONE] signal
        chunks.push(encoder.encode("data: [DONE]\n\n"));

        // Return as a readable stream
        const stream_body = new ReadableStream({
          async start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        });

        return new Response(stream_body, {
          status: responses.chatStatus,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }

      // POST /v1/runs (used by some operations)
      if (req.method === "POST" && url.pathname === "/v1/runs") {
        return new Response(
          JSON.stringify({ run_id: "run-test-123", status: "accepted" }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("Not found", { status: 404 });
    },
  });

  const url = `http://localhost:${server.port}`;
  return { url, server, responses, requests };
}

// ---------------------------------------------------------------------------
// HermesGatewayAdapter tests
// ---------------------------------------------------------------------------

describe("HermesGatewayAdapter", () => {
  describe("isReachable", () => {
    it("returns true when Hermes /health responds ok", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      const reachable = await adapter.isReachable();
      expect(reachable).toBe(true);

      server.stop();
    });

    it("returns false when Hermes /health returns non-ok status", async () => {
      const { url, server, responses } = mockHermesServer();
      responses.healthBody = { status: "degraded" };
      const adapter = new HermesGatewayAdapter(url);

      const reachable = await adapter.isReachable();
      expect(reachable).toBe(false);

      server.stop();
    });

    it("returns false when Hermes /health returns non-200", async () => {
      const { url, server, responses } = mockHermesServer();
      responses.healthStatus = 500;
      const adapter = new HermesGatewayAdapter(url);

      const reachable = await adapter.isReachable();
      expect(reachable).toBe(false);

      server.stop();
    });

    it("returns false when Hermes is not running", async () => {
      // Connect to a port where nothing is listening
      const adapter = new HermesGatewayAdapter("http://localhost:19999");

      const reachable = await adapter.isReachable();
      expect(reachable).toBe(false);
    });
  });

  describe("createSession", () => {
    it("returns a terrarium-prefixed session ID string", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      const sessionId = await adapter.createSession(
        "agent-1",
        "technical",
        "Premium",
      );
      expect(sessionId).toStartWith("terrarium-");
      expect(sessionId.length).toBe(26); // "terrarium-" + 16 hex chars

      server.stop();
    });

    it("generates different session IDs for different agents", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      const id1 = await adapter.createSession("a", "helpful", "Budget");
      const id2 = await adapter.createSession("b", "helpful", "Budget");
      expect(id1).not.toEqual(id2);

      server.stop();
    });

    it("sets initial agent state to idle", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("agent-1", "concise", "Balanced");
      const states = await adapter.getAgentStates();
      expect(states.get("agent-1")).toBe("idle");

      server.stop();
    });
  });

  describe("resetSession", () => {
    it("returns a new session ID different from the original", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      const originalId = await adapter.createSession(
        "agent-1",
        "creative",
        "Balanced",
      );
      // Small delay to ensure different timestamp in seed
      await Bun.sleep(10);
      const newId = await adapter.resetSession("agent-1");

      expect(newId).toStartWith("terrarium-");
      expect(newId).not.toEqual(originalId);

      server.stop();
    });

    it("preserves agent personality and tier across reset", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      // Create initial session with specific personality/tier
      await adapter.createSession("agent-1", "catgirl", "Budget");

      // Get states (should still be idle)
      const states = await adapter.getAgentStates();
      expect(states.get("agent-1")).toBe("idle");

      await adapter.resetSession("agent-1");
      const statesAfter = await adapter.getAgentStates();
      expect(statesAfter.get("agent-1")).toBe("idle");

      server.stop();
    });

    it("returns a valid session ID for unknown agent (defaults to helpful/Balanced)", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      const id = await adapter.resetSession("unknown-agent");
      expect(id).toStartWith("terrarium-");

      server.stop();
    });
  });

  describe("getAgentStates", () => {
    it("returns empty map when no agents have been created", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      const states = await adapter.getAgentStates();
      expect(states.size).toBe(0);

      server.stop();
    });

    it("returns idle state for agents after createSession", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("a", "helpful", "Budget");
      await adapter.createSession("b", "technical", "Premium");

      const states = await adapter.getAgentStates();
      expect(states.get("a")).toBe("idle");
      expect(states.get("b")).toBe("idle");

      server.stop();
    });
  });

  describe("sendChat", () => {
    it("yields response chunks from Hermes SSE stream", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("agent-1", "helpful", "Budget");
      const chunks: string[] = [];
      for await (const chunk of adapter.sendChat("agent-1", "What is 1+1?")) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hello", " ", "world!"]);

      server.stop();
    });

    it("sends correct request body (model, messages, stream=true)", async () => {
      const { url, server, requests } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("agent-1", "technical", "Premium");
      for await (const _ of adapter.sendChat("agent-1", "What is TCP?")) { /* drain */ }

      const chatReq = requests.find((r) => r.path === "/v1/chat/completions");
      expect(chatReq).toBeDefined();
      const body = chatReq!.body as {
        model: string;
        stream: boolean;
        messages: { role: string; content: string }[];
      };
      expect(body.stream).toBe(true);
      expect(body.model).toBe("anthropic/claude-opus-4.6"); // Premium tier
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]!.role).toBe("system");
      expect(body.messages[0]!.content).toContain("technical expert");
      expect(body.messages[1]).toEqual({ role: "user", content: "What is TCP?" });

      server.stop();
    });

    it("sends Authorization header when apiKey is configured", async () => {
      const { url, server, requests } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url, "my-secret-key");

      await adapter.createSession("agent-1", "helpful", "Budget");
      for await (const _ of adapter.sendChat("agent-1", "hi")) { /* drain */ }

      const chatReq = requests.find((r) => r.path === "/v1/chat/completions");
      expect(chatReq!.headers["authorization"]).toBe("Bearer my-secret-key");

      server.stop();
    });

    it("omits Authorization header when apiKey is empty", async () => {
      const { url, server, requests } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url); // no key

      await adapter.createSession("agent-1", "helpful", "Budget");
      for await (const _ of adapter.sendChat("agent-1", "hi")) { /* drain */ }

      const chatReq = requests.find((r) => r.path === "/v1/chat/completions");
      expect(chatReq!.headers["authorization"]).toBeUndefined();

      server.stop();
    });

    it("sends X-Hermes-Session-Id header for session continuity (auth required)", async () => {
      const { url, server, requests } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url, "my-key");

      const sessionId = await adapter.createSession("agent-1", "helpful", "Budget");
      for await (const _ of adapter.sendChat("agent-1", "hi")) { /* drain */ }

      const chatReq = requests.find((r) => r.path === "/v1/chat/completions");
      expect(chatReq!.headers["x-hermes-session-id"]).toBe(sessionId);

      server.stop();
    });

    it("sends updated session ID after resetSession", async () => {
      const { url, server, requests } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url, "my-key");

      const original = await adapter.createSession("agent-1", "helpful", "Budget");
      await Bun.sleep(5);
      const fresh = await adapter.resetSession("agent-1");
      expect(fresh).not.toEqual(original);

      for await (const _ of adapter.sendChat("agent-1", "hi")) { /* drain */ }

      const chatReq = requests.find((r) => r.path === "/v1/chat/completions");
      expect(chatReq!.headers["x-hermes-session-id"]).toBe(fresh);

      server.stop();
    });

    it("tracks states independently for concurrent agents", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("a", "helpful", "Budget");
      await adapter.createSession("b", "helpful", "Budget");

      // Drive both chats concurrently
      const drain = async (id: string) => {
        for await (const _ of adapter.sendChat(id, "hi")) { /* drain */ }
      };
      await Promise.all([drain("a"), drain("b")]);

      const states = await adapter.getAgentStates();
      expect(states.get("a")).toBe("idle");
      expect(states.get("b")).toBe("idle");

      server.stop();
    });

    it("maps Budget tier to gemma model", async () => {
      const { url, server, requests } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("agent-1", "helpful", "Budget");
      for await (const _ of adapter.sendChat("agent-1", "hi")) { /* drain */ }

      const chatReq = requests.find((r) => r.path === "/v1/chat/completions");
      const body = chatReq!.body as { model: string };
      expect(body.model).toBe("google/gemma-3-27b-it");

      server.stop();
    });

    it("maps Balanced tier to claude-sonnet", async () => {
      const { url, server, requests } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("agent-1", "helpful", "Balanced");
      for await (const _ of adapter.sendChat("agent-1", "hi")) { /* drain */ }

      const chatReq = requests.find((r) => r.path === "/v1/chat/completions");
      const body = chatReq!.body as { model: string };
      expect(body.model).toBe("anthropic/claude-sonnet-4.6");

      server.stop();
    });

    it("transitions state to thinking during chat", async () => {
      const { url, server } = mockHermesServer();
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("agent-1", "helpful", "Budget");

      // Start chat in background, check state mid-stream
      let midState: string | undefined;
      const chatPromise = (async () => {
        const gen = adapter.sendChat("agent-1", "Hello");
        for await (const _ of gen) {
          // After first yield, check state
          if (!midState) {
            midState = (await adapter.getAgentStates()).get("agent-1");
          }
        }
      })();

      await chatPromise;

      // State should have been thinking during streaming
      expect(midState).toBe("thinking");

      // State should be idle after completion
      const afterState = await adapter.getAgentStates();
      expect(afterState.get("agent-1")).toBe("idle");

      server.stop();
    });

    it("transitions to working state when tool progress event received", async () => {
      const { url, server, responses } = mockHermesServer();
      responses.chatToolEvent = true;
      const adapter = new HermesGatewayAdapter(url);

      await adapter.createSession("agent-1", "helpful", "Budget");

      let workingStateSeen = false;
      const chunks: string[] = [];
      for await (const chunk of adapter.sendChat("agent-1", "Read the file")) {
        chunks.push(chunk);
        // After first content chunk (tool event was processed before it),
        // state should still show whatever was last set.
        // The tool event sets state to "working" before content starts.
        const currentState = (await adapter.getAgentStates()).get("agent-1");
        if (currentState === "working") {
          workingStateSeen = true;
        }
      }

      expect(chunks).toEqual(["Hello", " ", "world!"]);
      expect(workingStateSeen).toBe(true);

      // State should be idle after completion
      const afterState = await adapter.getAgentStates();
      expect(afterState.get("agent-1")).toBe("idle");

      server.stop();
    });

    it("throws HermesUnreachableError when Hermes is down", async () => {
      const adapter = new HermesGatewayAdapter("http://localhost:19998");
      await adapter.createSession("agent-1", "helpful", "Budget");

      try {
        for await (const _ of adapter.sendChat("agent-1", "Hello")) {
          // Should not yield any chunks
        }
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HermesUnreachableError);
      }

      // State should be reset to idle after error
      const states = await adapter.getAgentStates();
      expect(states.get("agent-1")).toBe("idle");
    });

    it("throws HermesApiError when Hermes returns non-200", async () => {
      const { url, server, responses } = mockHermesServer();
      responses.chatStatus = 500;
      const adapter = new HermesGatewayAdapter(url);
      await adapter.createSession("agent-1", "helpful", "Budget");

      try {
        for await (const _ of adapter.sendChat("agent-1", "Hello")) {
          expect.unreachable("Should have thrown");
        }
      } catch (err) {
        expect(err).toBeInstanceOf(HermesApiError);
        expect((err as HermesApiError).statusCode).toBe(500);
      }

      server.stop();
    });

    it("yields fallback message when stream yields no content", async () => {
      const { url, server, responses } = mockHermesServer();
      responses.chatChunks = []; // Empty — no content chunks
      const adapter = new HermesGatewayAdapter(url);
      await adapter.createSession("agent-1", "helpful", "Budget");

      const chunks: string[] = [];
      for await (const chunk of adapter.sendChat("agent-1", "Hello")) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["(No response)"]);

      server.stop();
    });
  });

  describe("error classes", () => {
    it("HermesUnreachableError has correct name", () => {
      const err = new HermesUnreachableError("test");
      expect(err.name).toBe("HermesUnreachableError");
      expect(err.message).toBe("test");
    });

    it("HermesApiError has correct name and statusCode", () => {
      const err = new HermesApiError("test", 429);
      expect(err.name).toBe("HermesApiError");
      expect(err.message).toBe("test");
      expect(err.statusCode).toBe(429);
    });
  });
});

// ---------------------------------------------------------------------------
// StubHermesGateway tests
// ---------------------------------------------------------------------------

describe("StubHermesGateway", () => {
  it("isReachable returns false", async () => {
    const stub = new StubHermesGateway();
    expect(await stub.isReachable()).toBe(false);
  });

  it("getAgentStates returns empty map", async () => {
    const stub = new StubHermesGateway();
    const states = await stub.getAgentStates();
    expect(states.size).toBe(0);
  });

  it("createSession returns stub-session-id", async () => {
    const stub = new StubHermesGateway();
    const id = await stub.createSession("x", "helpful", "Balanced");
    expect(id).toBe("stub-session-id");
  });

  it("resetSession returns a stub id", async () => {
    const stub = new StubHermesGateway();
    const id = await stub.resetSession("my-agent");
    expect(id).toBe("stub-session-id-my-agent");
  });

  it("sendChat yields stub message", async () => {
    const stub = new StubHermesGateway();
    const chunks: string[] = [];
    for await (const c of stub.sendChat("a", "hi")) {
      chunks.push(c);
    }
    expect(chunks).toEqual(["[stub] Hermes not connected"]);
  });
});
