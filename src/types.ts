export type AgentState = "idle" | "thinking" | "working" | "sleeping";

export type ModelTier = "Budget" | "Balanced" | "Premium";

export type Specialty =
  | "Code Reviewer"
  | "Spec Griller"
  | "General Chat"
  | "DevOps"
  | "Creative Writer"
  | "Researcher"
  | "Debugger";

export interface Agent {
  id: string;
  name: string;
  specialty: Specialty;
  spriteId: string;
  hermesPersonality: string;
  hermesSessionId: string | null;
  state: AgentState;
  statusText: string;
  modelTier: ModelTier;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  name: string;
  specialty: Specialty;
  spriteId: string;
  personality: string;
  modelTier: ModelTier;
}

// ---------------------------------------------------------------------------
// WebSocket wire protocol
//
// All messages are JSON envelopes with a `type` discriminator and an optional
// `data` payload. These types are the contract between server (ws-relay) and
// client (useTerrarium hook).
// ---------------------------------------------------------------------------

/** Messages the server sends to the client. */
export type ServerMessage =
  | { type: "connected" }
  | { type: "pong" }
  | { type: "agent_list"; data: { agents: Agent[] } }
  | { type: "agent_added"; data: { agent: Agent } }
  | { type: "agent_archived"; data: { agentId: string } }
  | { type: "agent_restored"; data: { agent: Agent } }
  | { type: "agent_updated"; data: { agent: Agent } }
  | { type: "error"; data: { message: string; code?: string } };

/** Messages the client sends to the server. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "request_state" }
  | { type: "create_agent"; data: { config: AgentConfig } }
  | { type: "archive_agent"; data: { agentId: string } }
  | { type: "restore_agent"; data: { agentId: string } }
  | {
      type: "update_agent";
      data: { agentId: string; changes: Partial<Agent> };
    };
