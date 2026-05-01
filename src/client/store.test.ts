import { describe, it, expect, beforeEach } from "bun:test";
import { useTerrariumStore } from "./store";
import type { Agent, ServerMessage } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const agent = (id: string, overrides: Partial<Agent> = {}): Agent => ({
  id,
  name: `Agent-${id}`,
  specialty: "General Chat",
  spriteId: "sprite-a",
  hermesPersonality: "helpful",
  hermesSessionId: null,
  state: "idle",
  statusText: "",
  modelTier: "Budget",
  archived: false,
  createdAt: new Date(2026, 0, 1, 0, 0, Number(id) || 0).toISOString(),
  updatedAt: new Date(2026, 0, 1, 0, 0, Number(id) || 0).toISOString(),
  ...overrides,
});

// Reset store before every test (Zustand is a module-level singleton)
beforeEach(() => {
  useTerrariumStore.setState({
    connection: "connecting",
    agents: new Map(),
    agentList: [],
    archivedAgents: new Map(),
    agentListLoaded: false,
    chatHistory: new Map(),
    streamingMessages: new Map(),
    chatLoading: new Set(),
    route: { name: "grid" },
    lastError: null,
    ui: { wizardOpen: false },
  });
});

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

describe("store: ui.wizardOpen", () => {
  it("starts closed", () => {
    expect(useTerrariumStore.getState().ui.wizardOpen).toBe(false);
  });

  it("setWizardOpen toggles the flag", () => {
    useTerrariumStore.getState().setWizardOpen(true);
    expect(useTerrariumStore.getState().ui.wizardOpen).toBe(true);
    useTerrariumStore.getState().setWizardOpen(false);
    expect(useTerrariumStore.getState().ui.wizardOpen).toBe(false);
  });
});

describe("store: connection", () => {
  it("starts as connecting", () => {
    expect(useTerrariumStore.getState().connection).toBe("connecting");
  });

  it("setConnection transitions the status", () => {
    useTerrariumStore.getState().setConnection("open");
    expect(useTerrariumStore.getState().connection).toBe("open");
    useTerrariumStore.getState().setConnection("closed");
    expect(useTerrariumStore.getState().connection).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// applyServerMessage
// ---------------------------------------------------------------------------

describe("store: applyServerMessage", () => {
  const apply = (m: ServerMessage) =>
    useTerrariumStore.getState().applyServerMessage(m);

  it("agent_list replaces the whole map and sets agentListLoaded", () => {
    apply({
      type: "agent_list",
      data: { agents: [agent("1"), agent("2")] },
    });
    const s = useTerrariumStore.getState();
    expect(s.agents.size).toBe(2);
    expect(s.agents.get("1")).toBeDefined();
    expect(s.agentListLoaded).toBe(true);
  });

  it("agent_added inserts a new agent", () => {
    apply({ type: "agent_list", data: { agents: [agent("1")] } });
    apply({ type: "agent_added", data: { agent: agent("2") } });
    expect(useTerrariumStore.getState().agents.size).toBe(2);
  });

  it("agent_archived removes from agents and adds to archivedAgents", () => {
    apply({ type: "agent_list", data: { agents: [agent("1"), agent("2")] } });
    apply({ type: "agent_archived", data: { agentId: "1" } });
    const s = useTerrariumStore.getState();
    expect(s.agents.has("1")).toBe(false);
    expect(s.agents.has("2")).toBe(true);
    expect(s.archivedAgents.has("1")).toBe(true);
    expect(s.archivedAgents.get("1")!.archived).toBe(true);
  });

  it("agent_archived bounces the route to grid if viewing the archived agent", () => {
    apply({ type: "agent_list", data: { agents: [agent("1")] } });
    useTerrariumStore.getState().setRoute({ name: "room", agentId: "1" });
    apply({ type: "agent_archived", data: { agentId: "1" } });
    expect(useTerrariumStore.getState().route).toEqual({ name: "grid" });
  });

  it("agent_archived leaves unrelated route alone", () => {
    apply({ type: "agent_list", data: { agents: [agent("1"), agent("2")] } });
    useTerrariumStore.getState().setRoute({ name: "room", agentId: "2" });
    apply({ type: "agent_archived", data: { agentId: "1" } });
    expect(useTerrariumStore.getState().route).toEqual({
      name: "room",
      agentId: "2",
    });
  });

  it("agent_restored moves agent back to agents map", () => {
    apply({ type: "agent_list", data: { agents: [agent("1")] } });
    apply({ type: "agent_archived", data: { agentId: "1" } });
    expect(useTerrariumStore.getState().agents.has("1")).toBe(false);

    apply({
      type: "agent_restored",
      data: { agent: agent("1", { archived: false }) },
    });
    const s = useTerrariumStore.getState();
    expect(s.agents.has("1")).toBe(true);
    expect(s.archivedAgents.has("1")).toBe(false);
  });

  it("agent_updated replaces the existing agent's record", () => {
    apply({ type: "agent_list", data: { agents: [agent("1")] } });
    apply({
      type: "agent_updated",
      data: { agent: agent("1", { statusText: "thinking hard" }) },
    });
    expect(useTerrariumStore.getState().agents.get("1")!.statusText).toBe(
      "thinking hard",
    );
  });

  it("error sets lastError for the UI to display", () => {
    apply({ type: "error", data: { message: "boom" } });
    expect(useTerrariumStore.getState().lastError).toBe("boom");
    useTerrariumStore.getState().clearError();
    expect(useTerrariumStore.getState().lastError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// agentList selector
// ---------------------------------------------------------------------------

describe("store: agentList derived field", () => {
  const apply = () => useTerrariumStore.getState().applyServerMessage;

  it("starts empty", () => {
    expect(useTerrariumStore.getState().agentList).toEqual([]);
  });

  it("is kept sorted by createdAt ascending", () => {
    apply()({
      type: "agent_list",
      data: {
        agents: [
          agent("3", { createdAt: "2026-01-01T00:00:03.000Z" }),
          agent("1", { createdAt: "2026-01-01T00:00:01.000Z" }),
          agent("2", { createdAt: "2026-01-01T00:00:02.000Z" }),
        ],
      },
    });
    expect(useTerrariumStore.getState().agentList.map((a) => a.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("stays in sync when an agent is added", () => {
    apply()({ type: "agent_list", data: { agents: [agent("1")] } });
    apply()({ type: "agent_added", data: { agent: agent("2") } });
    expect(useTerrariumStore.getState().agentList.map((a) => a.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("stays in sync when an agent is archived", () => {
    apply()({
      type: "agent_list",
      data: { agents: [agent("1"), agent("2")] },
    });
    apply()({ type: "agent_archived", data: { agentId: "1" } });
    expect(useTerrariumStore.getState().agentList.map((a) => a.id)).toEqual([
      "2",
    ]);
  });

  it("reference is stable across store updates that don't touch agents", () => {
    apply()({ type: "agent_list", data: { agents: [agent("1")] } });
    const before = useTerrariumStore.getState().agentList;
    useTerrariumStore.getState().setRoute({ name: "room", agentId: "1" });
    useTerrariumStore.getState().setWizardOpen(true);
    useTerrariumStore.getState().setConnection("open");
    const after = useTerrariumStore.getState().agentList;
    // This is the footgun guard: if this equality fails, something in the
    // reducer is rebuilding the list on unrelated updates and subscribers
    // will re-render every time. (See "infinite re-render loop" fix in
    // commit 0dd9965 for the incident this invariant prevents.)
    expect(after).toBe(before);
  });

  it("reference changes only when the agent set changes", () => {
    apply()({ type: "agent_list", data: { agents: [agent("1")] } });
    const before = useTerrariumStore.getState().agentList;
    apply()({ type: "agent_added", data: { agent: agent("2") } });
    const after = useTerrariumStore.getState().agentList;
    expect(after).not.toBe(before);
    expect(after.map((a) => a.id)).toEqual(["1", "2"]);
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

describe("store: route", () => {
  it("defaults to grid", () => {
    expect(useTerrariumStore.getState().route).toEqual({ name: "grid" });
  });

  it("setRoute updates the current route", () => {
    useTerrariumStore.getState().setRoute({ name: "room", agentId: "abc" });
    expect(useTerrariumStore.getState().route).toEqual({
      name: "room",
      agentId: "abc",
    });
  });
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

describe("store: chat", () => {
  const apply = (m: ServerMessage) =>
    useTerrariumStore.getState().applyServerMessage(m);

  it("addUserMessage adds a user message and sets chatLoading", () => {
    const id = useTerrariumStore.getState().addUserMessage("a1", "hello");
    const s = useTerrariumStore.getState();
    expect(id).toMatch(/^msg-/);
    expect(s.chatHistory.get("a1")).toHaveLength(1);
    expect(s.chatHistory.get("a1")![0].role).toBe("user");
    expect(s.chatHistory.get("a1")![0].content).toBe("hello");
    expect(s.chatLoading.has("a1")).toBe(true);
  });

  it("addUserMessage appends to existing history", () => {
    useTerrariumStore.getState().addUserMessage("a1", "first");
    useTerrariumStore.getState().addUserMessage("a1", "second");
    expect(useTerrariumStore.getState().chatHistory.get("a1")).toHaveLength(2);
  });

  it("chat_chunk creates a streaming message on first chunk", () => {
    apply({
      type: "chat_chunk",
      data: { agentId: "a1", messageId: "m1", content: "Hello" },
    });
    const s = useTerrariumStore.getState();
    expect(s.streamingMessages.has("a1")).toBe(true);
    expect(s.streamingMessages.get("a1")!.content).toBe("Hello");
    expect(s.streamingMessages.get("a1")!.role).toBe("assistant");
  });

  it("chat_chunk appends content to existing streaming message", () => {
    apply({
      type: "chat_chunk",
      data: { agentId: "a1", messageId: "m1", content: "Hel" },
    });
    apply({
      type: "chat_chunk",
      data: { agentId: "a1", messageId: "m1", content: "lo!" },
    });
    expect(useTerrariumStore.getState().streamingMessages.get("a1")!.content).toBe(
      "Hello!",
    );
  });

  it("chat_end moves streaming message to history and clears loading", () => {
    // Set up loading state
    useTerrariumStore.getState().addUserMessage("a1", "hi");
    // Simulate streaming
    apply({
      type: "chat_chunk",
      data: { agentId: "a1", messageId: "m1", content: "response" },
    });
    apply({
      type: "chat_end",
      data: { agentId: "a1", messageId: "m1" },
    });
    const s = useTerrariumStore.getState();
    expect(s.streamingMessages.has("a1")).toBe(false);
    expect(s.chatLoading.has("a1")).toBe(false);
    // History: user message + assistant response
    expect(s.chatHistory.get("a1")).toHaveLength(2);
    expect(s.chatHistory.get("a1")![1].role).toBe("assistant");
    expect(s.chatHistory.get("a1")![1].content).toBe("response");
  });

  it("chat_error clears streaming and loading, sets lastError", () => {
    useTerrariumStore.getState().addUserMessage("a1", "hi");
    apply({
      type: "chat_chunk",
      data: { agentId: "a1", messageId: "m1", content: "partial" },
    });
    apply({
      type: "chat_error",
      data: { agentId: "a1", message: "Hermes down" },
    });
    const s = useTerrariumStore.getState();
    expect(s.streamingMessages.has("a1")).toBe(false);
    expect(s.chatLoading.has("a1")).toBe(false);
    expect(s.lastError).toContain("Hermes down");
  });

  it("context_reset clears chat history for that agent", () => {
    useTerrariumStore.getState().addUserMessage("a1", "hi");
    useTerrariumStore.getState().addUserMessage("a2", "hey");
    apply({ type: "context_reset", data: { agentId: "a1" } });
    const s = useTerrariumStore.getState();
    expect(s.chatHistory.has("a1")).toBe(false);
    // a2 should be untouched
    expect(s.chatHistory.get("a2")).toHaveLength(1);
  });

  it("clearChatHistory removes all chat state for an agent", () => {
    useTerrariumStore.getState().addUserMessage("a1", "hi");
    apply({
      type: "chat_chunk",
      data: { agentId: "a1", messageId: "m1", content: "streaming" },
    });
    useTerrariumStore.getState().clearChatHistory("a1");
    const s = useTerrariumStore.getState();
    expect(s.chatHistory.has("a1")).toBe(false);
    expect(s.streamingMessages.has("a1")).toBe(false);
    expect(s.chatLoading.has("a1")).toBe(false);
  });

  it("chat state is isolated per agent", () => {
    useTerrariumStore.getState().addUserMessage("a1", "msg to a1");
    useTerrariumStore.getState().addUserMessage("a2", "msg to a2");
    apply({
      type: "chat_chunk",
      data: { agentId: "a1", messageId: "m1", content: "from a1" },
    });
    const s = useTerrariumStore.getState();
    expect(s.chatHistory.get("a1")).toHaveLength(1);
    expect(s.chatHistory.get("a2")).toHaveLength(1);
    expect(s.streamingMessages.has("a1")).toBe(true);
    expect(s.streamingMessages.has("a2")).toBe(false);
  });
});
