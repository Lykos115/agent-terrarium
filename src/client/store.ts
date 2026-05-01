import { create } from "zustand";
import type { Agent, AgentConfig, ChatMessage, ClientMessage, ServerMessage } from "../types";

// ---------------------------------------------------------------------------
// Route model
// ---------------------------------------------------------------------------

/**
 * The app's top-level navigation state. We use an in-memory route (not the
 * URL yet) for the first-cut UI; #10 (Agent Room Zoom) wires this into the
 * browser history API for back/forward support.
 */
export type Route =
  | { name: "grid" }
  | { name: "room"; agentId: string }
  | { name: "editor"; agentId: string };

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface TerrariumState {
  // Connection
  /** WebSocket connection status reflected in the UI (header status dot). */
  connection: "connecting" | "open" | "closed";

  // Agents
  /** Non-archived agents currently in the terrarium, keyed by id. */
  agents: Map<string, Agent>;
  /**
   * Precomputed sorted array of `agents.values()` (ascending by `createdAt`).
   *
   * Kept in state on purpose: React components that want the list use
   * `useTerrariumStore((s) => s.agentList)` and get a stable reference that
   * only changes when the agent set actually changes. Do NOT replace this
   * with a method-style selector (e.g. `agentList: () => Agent[]`): calling
   * it inside a Zustand selector returns a fresh array on every snapshot
   * check, which trips React's "The result of getSnapshot should be
   * cached" guard and sends the component into an infinite re-render loop.
   *
   * Updated by the internal `withAgents` helper, which every reducer path
   * that mutates `agents` routes through.
   */
  agentList: Agent[];
  /** Archived agents (needed by the summoning wizard's Restore section, #11). */
  archivedAgents: Map<string, Agent>;
  /** True until the first `agent_list` message has been applied. */
  agentListLoaded: boolean;

  // Chat
  /** Chat message history per agent, keyed by agentId. */
  chatHistory: Map<string, ChatMessage[]>;
  /**
   * In-progress streaming assistant message per agent.
   * While streaming, this holds the partial message being assembled from
   * `chat_chunk` events. On `chat_end`, it's moved to chatHistory.
   */
  streamingMessages: Map<string, ChatMessage>;
  /** Set of agentIds currently waiting for or receiving a response. */
  chatLoading: Set<string>;

  // Navigation
  route: Route;

  // Errors surfaced to the UI as toasts
  lastError: string | null;

  // UI state
  /**
   * Summoning wizard modal visibility. Owned by #9 (the wizard) and opened
   * by #5 (empty-terrarium portal click) and later by the grid's "+ add"
   * button. Kept in the root store so any view can toggle it.
   */
  ui: { wizardOpen: boolean };

  // -------------------------------------------------------------------------
  // Actions — pure state mutations invoked by useTerrarium / components
  // -------------------------------------------------------------------------
  setConnection: (status: TerrariumState["connection"]) => void;
  applyServerMessage: (message: ServerMessage) => void;
  setRoute: (route: Route) => void;
  clearError: () => void;
  setWizardOpen: (open: boolean) => void;
  /** Add a user message to chat history (called before sending to WS). */
  addUserMessage: (agentId: string, content: string) => string;
  /** Clear chat history for an agent (on context reset). */
  clearChatHistory: (agentId: string) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the sorted agent array from the agents Map. Centralising this here
 * means every reducer path produces an identical ordering, and guarantees
 * `agentList` is always in sync with `agents`.
 */
function buildAgentList(agents: Map<string, Agent>): Agent[] {
  return Array.from(agents.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Return a partial state update that replaces the agents Map and the
 * derived `agentList` array together. Every reducer that writes to
 * `agents` should go through this to keep the two in sync.
 */
function withAgents(agents: Map<string, Agent>): {
  agents: Map<string, Agent>;
  agentList: Agent[];
} {
  return { agents, agentList: buildAgentList(agents) };
}

/**
 * Immutable update helpers — Zustand accepts either partial state or an updater.
 * Using functions keeps each transition small and testable.
 */
/** Generate a unique-enough ID for chat messages. */
function chatMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTerrariumStore = create<TerrariumState>((set, get) => ({
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

  setConnection: (status) => set({ connection: status }),

  setRoute: (route) => set({ route }),

  clearError: () => set({ lastError: null }),

  setWizardOpen: (open) => set({ ui: { wizardOpen: open } }),

  addUserMessage: (agentId, content) => {
    const id = chatMsgId();
    const msg: ChatMessage = {
      id,
      agentId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    const history = new Map(get().chatHistory);
    history.set(agentId, [...(history.get(agentId) ?? []), msg]);
    const loading = new Set(get().chatLoading);
    loading.add(agentId);
    set({ chatHistory: history, chatLoading: loading });
    return id;
  },

  clearChatHistory: (agentId) => {
    const history = new Map(get().chatHistory);
    history.delete(agentId);
    const streaming = new Map(get().streamingMessages);
    streaming.delete(agentId);
    const loading = new Set(get().chatLoading);
    loading.delete(agentId);
    set({ chatHistory: history, streamingMessages: streaming, chatLoading: loading });
  },

  applyServerMessage: (message) => {
    switch (message.type) {
      case "connected":
        // No state change — the WS open event sets connection="open"
        return;

      case "pong":
        return;

      case "agent_list": {
        const agents = new Map<string, Agent>();
        for (const a of message.data.agents) agents.set(a.id, a);
        const archivedAgents = new Map<string, Agent>();
        for (const a of message.data.archivedAgents ?? []) {
          archivedAgents.set(a.id, { ...a, archived: true });
        }
        set({ ...withAgents(agents), archivedAgents, agentListLoaded: true });
        return;
      }

      case "agent_added": {
        const agents = new Map(get().agents);
        agents.set(message.data.agent.id, message.data.agent);
        set(withAgents(agents));
        return;
      }

      case "agent_archived": {
        const id = message.data.agentId;
        const current = get().agents;
        const removed = current.get(id);
        const agents = new Map(current);
        agents.delete(id);
        const archivedAgents = new Map(get().archivedAgents);
        if (removed) {
          archivedAgents.set(id, { ...removed, archived: true });
        }
        set({ ...withAgents(agents), archivedAgents });
        // If we were viewing the archived agent's room, bounce to the grid
        const route = get().route;
        if (
          (route.name === "room" || route.name === "editor") &&
          route.agentId === id
        ) {
          set({ route: { name: "grid" } });
        }
        return;
      }

      case "agent_restored": {
        const agent = message.data.agent;
        const agents = new Map(get().agents);
        agents.set(agent.id, agent);
        const archivedAgents = new Map(get().archivedAgents);
        archivedAgents.delete(agent.id);
        set({ ...withAgents(agents), archivedAgents });
        return;
      }

      case "agent_updated": {
        const agent = message.data.agent;
        if (agent.archived) {
          const agents = new Map(get().agents);
          agents.delete(agent.id);
          const archivedAgents = new Map(get().archivedAgents);
          archivedAgents.set(agent.id, agent);
          set({ ...withAgents(agents), archivedAgents });
        } else {
          const agents = new Map(get().agents);
          agents.set(agent.id, agent);
          set(withAgents(agents));
        }
        return;
      }

      case "chat_chunk": {
        const { agentId, messageId, content } = message.data;
        const streaming = new Map(get().streamingMessages);
        const existing = streaming.get(agentId);
        if (existing) {
          streaming.set(agentId, {
            ...existing,
            content: existing.content + content,
          });
        } else {
          streaming.set(agentId, {
            id: messageId,
            agentId,
            role: "assistant",
            content,
            timestamp: new Date().toISOString(),
          });
        }
        set({ streamingMessages: streaming });
        return;
      }

      case "chat_end": {
        const { agentId, messageId } = message.data;
        const streaming = new Map(get().streamingMessages);
        const completed = streaming.get(agentId);
        streaming.delete(agentId);

        const history = new Map(get().chatHistory);
        if (completed) {
          history.set(agentId, [
            ...(history.get(agentId) ?? []),
            { ...completed, id: messageId },
          ]);
        }

        const loading = new Set(get().chatLoading);
        loading.delete(agentId);
        set({ streamingMessages: streaming, chatHistory: history, chatLoading: loading });
        return;
      }

      case "chat_error": {
        const { agentId, message: errMsg } = message.data;
        const streaming = new Map(get().streamingMessages);
        streaming.delete(agentId);
        const loading = new Set(get().chatLoading);
        loading.delete(agentId);
        set({
          streamingMessages: streaming,
          chatLoading: loading,
          lastError: `Chat error (${agentId}): ${errMsg}`,
        });
        return;
      }

      case "context_reset": {
        const { agentId } = message.data;
        const history = new Map(get().chatHistory);
        history.delete(agentId);
        const streaming = new Map(get().streamingMessages);
        streaming.delete(agentId);
        const loading = new Set(get().chatLoading);
        loading.delete(agentId);
        set({ chatHistory: history, streamingMessages: streaming, chatLoading: loading });
        return;
      }

      case "error":
        set({ lastError: message.data.message });
        return;
    }
  },
}));

// ---------------------------------------------------------------------------
// Send helpers — thin wrappers that serialize the typed ClientMessage and
// ship it over a supplied WebSocket. Kept outside the store so components
// can depend on `send` without pulling the whole store.
// ---------------------------------------------------------------------------

export function sendClientMessage(ws: WebSocket, msg: ClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function requestCreateAgent(ws: WebSocket, config: AgentConfig): void {
  sendClientMessage(ws, { type: "create_agent", data: { config } });
}

export function requestArchiveAgent(ws: WebSocket, agentId: string): void {
  sendClientMessage(ws, { type: "archive_agent", data: { agentId } });
}

export function requestRestoreAgent(ws: WebSocket, agentId: string): void {
  sendClientMessage(ws, { type: "restore_agent", data: { agentId } });
}

export function sendChatMessage(ws: WebSocket, agentId: string, message: string): void {
  sendClientMessage(ws, { type: "chat", data: { agentId, message } });
}

export function requestResetContext(ws: WebSocket, agentId: string): void {
  sendClientMessage(ws, { type: "reset_context", data: { agentId } });
}
