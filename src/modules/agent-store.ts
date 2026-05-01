import { mkdirSync } from "node:fs";
import { Database } from "bun:sqlite";
import type {
  Agent,
  AgentConfig,
  AgentState,
  ModelTier,
  Specialty,
} from "../types";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Agent Store — encapsulates SQLite persistence behind a CRUD interface. */
export interface AgentStore {
  createAgent(config: AgentConfig): Promise<Agent>;
  listAgents(includeArchived?: boolean): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  updateAgent(id: string, changes: Partial<Agent>): Promise<Agent>;
  archiveAgent(id: string): Promise<Agent>;
  restoreAgent(id: string): Promise<Agent>;
}

/** Thrown when a store operation targets an agent id that does not exist. */
export class AgentNotFoundError extends Error {
  constructor(id: string) {
    super(`Agent not found: ${id}`);
    this.name = "AgentNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Row mapping (SQL ↔ TS)
// ---------------------------------------------------------------------------

/** Raw shape returned by SELECT against the agents table. */
interface AgentRow {
  id: string;
  name: string;
  specialty: string;
  sprite_id: string;
  hermes_personality: string;
  hermes_session_id: string | null;
  state: string;
  status_text: string;
  model_tier: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty as Specialty,
    spriteId: row.sprite_id,
    hermesPersonality: row.hermes_personality,
    hermesSessionId: row.hermes_session_id,
    state: row.state as AgentState,
    statusText: row.status_text,
    modelTier: row.model_tier as ModelTier,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

/** Create the agents table and supporting indexes. Idempotent. */
export function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      sprite_id TEXT NOT NULL,
      hermes_personality TEXT NOT NULL,
      hermes_session_id TEXT,
      state TEXT NOT NULL DEFAULT 'idle',
      status_text TEXT NOT NULL DEFAULT '',
      model_tier TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_archived ON agents(archived)`);
}

/**
 * Initialize the SQLite database file and run schema migrations.
 * Returns the opened Database handle. Caller is responsible for closing it.
 */
export function initDatabase(dbPath: string): Database {
  if (dbPath !== ":memory:") {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir) mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  runMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Real SQLite-backed implementation
// ---------------------------------------------------------------------------

/**
 * SQLite-backed AgentStore.
 *
 * All timestamps are stored as ISO-8601 strings (UTC). IDs are UUID v4 for
 * user-created agents; seed agents use deterministic "seed-<name>" IDs so
 * re-seeding doesn't create duplicates.
 *
 * The archived flag is stored as INTEGER (0/1) for SQLite and translated to
 * boolean in rowToAgent().
 */
export class SqliteAgentStore implements AgentStore {
  constructor(private readonly db: Database) {}

  async createAgent(config: AgentConfig): Promise<Agent> {
    return this.insertAgent({
      id: crypto.randomUUID(),
      name: config.name,
      specialty: config.specialty,
      spriteId: config.spriteId,
      hermesPersonality: config.personality,
      modelTier: config.modelTier,
    });
  }

  /**
   * Insert an agent with a caller-supplied id. Used by seedAgents() to get
   * stable IDs. Exposed as a separate internal method so seed logic can
   * supply its own id without racing createAgent's UUID generation.
   */
  insertAgent(args: {
    id: string;
    name: string;
    specialty: Specialty;
    spriteId: string;
    hermesPersonality: string;
    modelTier: ModelTier;
  }): Agent {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO agents (
        id, name, specialty, sprite_id, hermes_personality,
        hermes_session_id, state, status_text, model_tier,
        archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 'idle', '', ?, 0, ?, ?)`,
      [
        args.id,
        args.name,
        args.specialty,
        args.spriteId,
        args.hermesPersonality,
        args.modelTier,
        now,
        now,
      ],
    );
    return this.getAgentSync(args.id)!;
  }

  async getAgent(id: string): Promise<Agent | null> {
    return this.getAgentSync(id);
  }

  private getAgentSync(id: string): Agent | null {
    const row = this.db
      .query<AgentRow, [string]>("SELECT * FROM agents WHERE id = ?")
      .get(id);
    return row ? rowToAgent(row) : null;
  }

  async listAgents(includeArchived = false): Promise<Agent[]> {
    const sql = includeArchived
      ? "SELECT * FROM agents ORDER BY created_at ASC"
      : "SELECT * FROM agents WHERE archived = 0 ORDER BY created_at ASC";
    return this.db.query<AgentRow, []>(sql).all().map(rowToAgent);
  }

  async updateAgent(id: string, changes: Partial<Agent>): Promise<Agent> {
    const existing = this.getAgentSync(id);
    if (!existing) throw new AgentNotFoundError(id);

    // Map TS field names to SQL column names; omit immutable fields.
    const fieldMap: Record<string, string> = {
      name: "name",
      specialty: "specialty",
      spriteId: "sprite_id",
      hermesPersonality: "hermes_personality",
      hermesSessionId: "hermes_session_id",
      state: "state",
      statusText: "status_text",
      modelTier: "model_tier",
      archived: "archived",
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(fieldMap)) {
      if (!(key in changes)) continue;
      const value = (changes as Record<string, unknown>)[key];
      sets.push(`${column} = ?`);
      params.push(key === "archived" ? (value ? 1 : 0) : value);
    }

    // Always bump updated_at
    sets.push("updated_at = ?");
    params.push(new Date().toISOString());

    // If no meaningful changes, still bump updated_at (caller asked for an update)
    params.push(id);
    this.db.run(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`, params);

    return this.getAgentSync(id)!;
  }

  async archiveAgent(id: string): Promise<Agent> {
    return this.updateAgent(id, { archived: true });
  }

  async restoreAgent(id: string): Promise<Agent> {
    return this.updateAgent(id, { archived: false });
  }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

/**
 * The three initial agents pre-configured for first summoning (per PRD).
 * Stable IDs (`seed-<name>`) let repeated seedAgents() calls stay idempotent
 * and preserve user edits on re-start.
 */
export const SEED_AGENTS: Array<{
  id: string;
  name: string;
  specialty: Specialty;
  spriteId: string;
  hermesPersonality: string;
  modelTier: ModelTier;
}> = [
  {
    id: "seed-glitchkin",
    name: "Glitchkin",
    specialty: "Code Reviewer",
    spriteId: "sprite-glitchkin",
    hermesPersonality: "technical",
    modelTier: "Premium",
  },
  {
    id: "seed-mapsie",
    name: "Mapsie",
    specialty: "Spec Griller",
    spriteId: "sprite-mapsie",
    hermesPersonality: "grillme",
    modelTier: "Balanced",
  },
  {
    id: "seed-blipblop",
    name: "Blipblop",
    specialty: "General Chat",
    spriteId: "sprite-blipblop",
    hermesPersonality: "concise",
    modelTier: "Budget",
  },
];

/**
 * Idempotently insert the seed agents. If a seed agent already exists
 * (matched by stable ID), it is left untouched — user edits are preserved.
 */
export async function seedAgents(store: SqliteAgentStore): Promise<void> {
  for (const seed of SEED_AGENTS) {
    const existing = await store.getAgent(seed.id);
    if (existing) continue;
    store.insertAgent(seed);
  }
}

// ---------------------------------------------------------------------------
// Stub (kept for back-compat with existing callers)
// ---------------------------------------------------------------------------

/** Stub implementation — returns placeholder values, no persistence. */
export class StubAgentStore implements AgentStore {
  async createAgent(config: AgentConfig): Promise<Agent> {
    const now = new Date().toISOString();
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
      createdAt: now,
      updatedAt: now,
    };
  }

  async listAgents(_includeArchived?: boolean): Promise<Agent[]> {
    return [];
  }

  async getAgent(_id: string): Promise<Agent | null> {
    return null;
  }

  async updateAgent(id: string, _changes: Partial<Agent>): Promise<Agent> {
    throw new AgentNotFoundError(id);
  }

  async archiveAgent(id: string): Promise<Agent> {
    throw new AgentNotFoundError(id);
  }

  async restoreAgent(id: string): Promise<Agent> {
    throw new AgentNotFoundError(id);
  }
}
