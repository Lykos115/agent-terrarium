import { create } from "zustand";
import type { Agent, AgentConfig, ClientMessage, ServerMessage } from "../types";

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
  /** Archived agents (needed by the summoning wizard's Restore section, #11). */
  archivedAgents: Map<string, Agent>;
  /** True until the first `agent_list` message has been applied. */
  agentListLoaded: boolean;

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

  // Selectors exposed as methods for convenience
  agentList: () => Agent[];
}

/**
 * Immutable update helpers — Zustand accepts either partial state or an updater.
 * Using functions keeps each transition small and testable.
 */
export const useTerrariumStore = create<TerrariumState>((set, get) => ({
  connection: "connecting",
  agents: new Map(),
  archivedAgents: new Map(),
  agentListLoaded: false,
  route: { name: "grid" },
  lastError: null,
  ui: { wizardOpen: false },

  setConnection: (status) => set({ connection: status }),

  setRoute: (route) => set({ route }),

  clearError: () => set({ lastError: null }),

  setWizardOpen: (open) => set({ ui: { wizardOpen: open } }),

  agentList: () => {
    const m = get().agents;
    // Sort by createdAt ascending for stable grid ordering
    return Array.from(m.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
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
        set({ agents, agentListLoaded: true });
        return;
      }

      case "agent_added": {
        const agents = new Map(get().agents);
        agents.set(message.data.agent.id, message.data.agent);
        set({ agents });
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
        set({ agents, archivedAgents });
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
        set({ agents, archivedAgents });
        return;
      }

      case "agent_updated": {
        const agent = message.data.agent;
        if (agent.archived) {
          // Shouldn't normally happen (archive has its own event) but handle it.
          const agents = new Map(get().agents);
          agents.delete(agent.id);
          const archivedAgents = new Map(get().archivedAgents);
          archivedAgents.set(agent.id, agent);
          set({ agents, archivedAgents });
        } else {
          const agents = new Map(get().agents);
          agents.set(agent.id, agent);
          set({ agents });
        }
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
