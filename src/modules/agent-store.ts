import { mkdirSync } from "node:fs";
import { Database } from "bun:sqlite";
import type { Agent, AgentConfig } from "../types";

/** Agent Store — encapsulates SQLite persistence behind a CRUD interface. */
export interface AgentStore {
  createAgent(config: AgentConfig): Promise<Agent>;
  listAgents(includeArchived?: boolean): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  updateAgent(id: string, changes: Partial<Agent>): Promise<Agent>;
  archiveAgent(id: string): Promise<Agent>;
  restoreAgent(id: string): Promise<Agent>;
}

/** Stub implementation — returns placeholder values, no persistence. */
export class StubAgentStore implements AgentStore {
  async createAgent(config: AgentConfig): Promise<Agent> {
    return {
      id: "stub-id",
      name: config.name,
      specialty: config.specialty,
      spriteId: config.spriteId,
      hermesPersonality: config.personality,
      hermesSessionId: null,
      state: "idle",
      statusText: "",
      modelTier: config.modelTier,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async listAgents(_includeArchived?: boolean): Promise<Agent[]> {
    return [];
  }

  async getAgent(_id: string): Promise<Agent | null> {
    return null;
  }

  async updateAgent(id: string, changes: Partial<Agent>): Promise<Agent> {
    throw new Error(`Agent ${id} not found`);
  }

  async archiveAgent(_id: string): Promise<Agent> {
    throw new Error("Agent not found");
  }

  async restoreAgent(_id: string): Promise<Agent> {
    throw new Error("Agent not found");
  }
}

/** Initialize SQLite database file. Returns path to created db. */
export function initDatabase(dbPath: string): Database {
  // Ensure parent directory exists
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  // Schema migration will be in a follow-up issue — no tables yet.
  return db;
}
