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
