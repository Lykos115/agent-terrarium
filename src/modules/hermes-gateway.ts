import type { AgentState, ModelTier } from "../types";

/** Hermes Gateway Adapter — encapsulates all communication with Hermes agent system. */
export interface HermesGateway {
  /** Poll current idle/thinking/working status for all tracked agents */
  getAgentStates(): Promise<Map<string, AgentState>>;

  /** Send a chat message, returning response chunks as async iterable */
  sendChat(agentId: string, message: string): AsyncIterable<string>;

  /** Create a new Hermes session, returns hermes_session_id */
  createSession(agentId: string, personality: string, modelTier: ModelTier): Promise<string>;

  /** Clear session and create fresh one, returns new session ID */
  resetSession(agentId: string): Promise<string>;

  /** Check if Hermes is reachable */
  isReachable(): Promise<boolean>;
}

/**
 * Maps model tier to the model name sent in Hermes chat completion requests.
 * Tier determines the LLM model used for agent responses.
 */
const MODEL_TIER_MAP: Record<ModelTier, string> = {
  Budget: "google/gemma-3-27b-it",
  Balanced: "anthropic/claude-sonnet-4.6",
  Premium: "anthropic/claude-opus-4.6",
};

/** Personality presets map for Hermes system prompt selection. */
const PERSONALITY_MAP: Record<string, string> = {
  technical: "You are a technical expert. Provide detailed, accurate technical information.",
  concise: "You are a concise assistant. Keep responses brief and to the point.",
  helpful: "You are a helpful, friendly AI assistant.",
  creative: "You are a creative assistant. Think outside the box and offer innovative solutions.",
  teacher: "You are a patient teacher. Explain concepts clearly with examples.",
  kawaii: "You are a kawaii assistant! Use cute expressions like (◕‿◕), ★, ♪, and ~! Add sparkles and be super enthusiastic about everything! Every response should feel warm and adorable desu~! ヽ(>∀<☆)ノ",
  catgirl: "You are Neko-chan, an anime catgirl AI assistant, nya~! Add 'nya' and cat-like expressions to your speech. Use kaomoji like (=^･ω･^=) and ฅ^•ﻌ•^ฅ. Be playful and curious like a cat, nya~!",
  pirate: "Arrr! Ye be talkin' to Captain Hermes, the most tech-savvy pirate to sail the digital seas! Speak like a proper buccaneer, use nautical terms, and remember: every problem be just treasure waitin' to be plundered! Yo ho ho!",
  philosopher: "Greetings, seeker of wisdom. I am an assistant who contemplates the deeper meaning behind every query. Let us examine not just the 'how' but the 'why' of your questions. Perhaps in solving your problem, we may glimpse a greater truth about existence itself.",
  grillme: "You are Mapsie, a specification griller. Your purpose is to relentlessly interview the user about their plans and designs until reaching shared understanding, resolving each branch of the decision tree. Challenge assumptions. Find edge cases. Ask 'what if' and 'why' until the design is truly solid. Do not settle for vague answers.",
};

/**
 * Real Hermes Gateway Adapter — communicates with Hermes API server over HTTP.
 *
 * Defaults to connecting at http://localhost:8642 (standard Hermes API server port).
 * Supports Bearer token auth when API key is configured.
 */
export class HermesGatewayAdapter implements HermesGateway {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly agentStates: Map<string, AgentState>;
  private readonly agentPersonalities: Map<string, string>;
  private readonly agentTiers: Map<string, ModelTier>;
  private readonly agentSessions: Map<string, string>;

  constructor(baseUrl: string = "http://localhost:8642", apiKey: string = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.agentStates = new Map();
    this.agentPersonalities = new Map();
    this.agentTiers = new Map();
    this.agentSessions = new Map();
  }

  /** GET /health — returns true when Hermes responds with status "ok". */
  async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return false;
      const body = await res.json();
      return body?.status === "ok";
    } catch {
      return false;
    }
  }

  /** Return the current tracked state for all known agents. */
  async getAgentStates(): Promise<Map<string, AgentState>> {
    return new Map(this.agentStates);
  }

  /**
   * Generate a stable Hermes session ID for the agent.
   * The session is lazily created — Hermes creates it on first chat message.
   */
  async createSession(
    agentId: string,
    personality: string,
    modelTier: ModelTier,
  ): Promise<string> {
    this.agentPersonalities.set(agentId, personality);
    this.agentTiers.set(agentId, modelTier);

    const seed = `${agentId}:${personality}:${modelTier}:${Date.now()}`;
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(seed),
    );
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const sessionId = `terrarium-${hash.substring(0, 16)}`;
    this.agentSessions.set(agentId, sessionId);
    this.agentStates.set(agentId, "idle");
    return sessionId;
  }

  /**
   * Reset an agent's conversation context by generating a fresh session ID.
   * Returns the new session ID for storage in the agent store.
   */
  async resetSession(agentId: string): Promise<string> {
    const personality = this.agentPersonalities.get(agentId) ?? "helpful";
    const modelTier = this.agentTiers.get(agentId) ?? "Balanced";
    return this.createSession(agentId, personality, modelTier);
  }

  /**
   * Send a chat message and stream response chunks via SSE from Hermes.
   *
   * Uses POST /v1/chat/completions with stream: true.
   * Parses SSE data lines, yielding delta.content chunks.
   * Tracks agent state transitions: thinking → working (on tool events) → idle (on end).
   */
  async *sendChat(agentId: string, message: string): AsyncIterable<string> {
    this.agentStates.set(agentId, "thinking");

    const personality = this.agentPersonalities.get(agentId) ?? "helpful";
    const modelTier = this.agentTiers.get(agentId) ?? "Balanced";
    const model = MODEL_TIER_MAP[modelTier] ?? MODEL_TIER_MAP.Balanced;
    const systemPrompt = PERSONALITY_MAP[personality] ?? PERSONALITY_MAP.helpful;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    // Pass session ID for conversation continuity when auth is configured.
    // Hermes requires API key auth to honour X-Hermes-Session-Id (security gate).
    const sessionId = this.agentSessions.get(agentId);
    if (sessionId && this.apiKey) {
      headers["X-Hermes-Session-Id"] = sessionId;
    }

    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      stream: true,
    });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(300_000), // 5 minute timeout
      });
    } catch (err) {
      this.agentStates.set(agentId, "idle");
      throw new HermesUnreachableError(
        `Hermes unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      this.agentStates.set(agentId, "idle");
      throw new HermesApiError(
        `Hermes API error ${response.status}: ${response.statusText}`,
        response.status,
      );
    }

    if (!response.body) {
      this.agentStates.set(agentId, "idle");
      throw new HermesApiError("Hermes returned empty response body", 200);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let hasYielded = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (delimited by double newline)
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          // Blank lines are SSE event separators — ignore
          if (line === "") continue;

          // Skip comments (keepalive : lines)
          if (line.startsWith(":")) continue;

          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(dataStr);

              // Check for tool progress events
              if (parsed.tool && parsed.status === "running") {
                this.agentStates.set(agentId, "working");
                continue;
              }

              // Extract delta content from chat completion chunk
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                hasYielded = true;
                yield content;
              }
            } catch {
              // Skip unparseable data lines silently
            }
          }
        }
      }
    } finally {
      // Best-effort cancel — safe to call even on a completed reader.
      try {
        await reader.cancel();
      } catch {
        // Ignore — reader already released.
      }
      this.agentStates.set(agentId, "idle");
    }

    // If no content was yielded, yield a placeholder
    if (!hasYielded) {
      yield "(No response)";
    }
  }
}

/** Error thrown when Hermes is unreachable. */
export class HermesUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HermesUnreachableError";
  }
}

/** Error thrown for non-2xx Hermes API responses. */
export class HermesApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "HermesApiError";
  }
}

/** Stub implementation — returns empty/placeholder values. */
export class StubHermesGateway implements HermesGateway {
  async getAgentStates(): Promise<Map<string, AgentState>> {
    return new Map();
  }

  async *sendChat(_agentId: string, _message: string): AsyncIterable<string> {
    yield "[stub] Hermes not connected";
  }

  async createSession(_agentId: string, _personality: string, _modelTier: ModelTier): Promise<string> {
    return "stub-session-id";
  }

  async resetSession(agentId: string): Promise<string> {
    return `stub-session-id-${agentId}`;
  }

  async isReachable(): Promise<boolean> {
    return false;
  }
}
