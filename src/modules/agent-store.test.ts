import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  SqliteAgentStore,
  runMigrations,
  seedAgents,
  SEED_AGENTS,
  AgentNotFoundError,
  StubAgentStore,
} from "./agent-store";
import type { AgentConfig } from "../types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory SqliteAgentStore for test isolation. */
function makeStore(): SqliteAgentStore {
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
// Schema / migration
// ---------------------------------------------------------------------------

describe("runMigrations", () => {
  it("creates the agents table with all required columns", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(agents)")
      .all()
      .map((r) => r.name);

    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "specialty",
        "sprite_id",
        "hermes_personality",
        "hermes_session_id",
        "state",
        "status_text",
        "model_tier",
        "archived",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("is idempotent — safe to run twice", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createAgent
// ---------------------------------------------------------------------------

describe("SqliteAgentStore.createAgent", () => {
  it("returns a full Agent object with generated id and timestamps", async () => {
    const store = makeStore();
    const agent = await store.createAgent(sampleConfig);

    expect(agent.id).toBeString();
    expect(agent.id.length).toBeGreaterThan(0);
    expect(agent.name).toBe("TestBot");
    expect(agent.specialty).toBe("General Chat");
    expect(agent.spriteId).toBe("sprite-a");
    expect(agent.hermesPersonality).toBe("helpful");
    expect(agent.hermesSessionId).toBeNull();
    expect(agent.state).toBe("idle");
    expect(agent.statusText).toBe("");
    expect(agent.modelTier).toBe("Budget");
    expect(agent.archived).toBe(false);
    expect(agent.createdAt).toBeString();
    expect(agent.updatedAt).toBeString();
    // ISO 8601 validation
    expect(() => new Date(agent.createdAt).toISOString()).not.toThrow();
  });

  it("generates unique IDs for each agent", async () => {
    const store = makeStore();
    const a = await store.createAgent(sampleConfig);
    const b = await store.createAgent({ ...sampleConfig, name: "Other" });
    expect(a.id).not.toEqual(b.id);
  });

  it("persists the agent so it can be retrieved", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    const got = await store.getAgent(created.id);
    expect(got).toEqual(created);
  });
});

// ---------------------------------------------------------------------------
// getAgent
// ---------------------------------------------------------------------------

describe("SqliteAgentStore.getAgent", () => {
  it("returns null for unknown agent ID", async () => {
    const store = makeStore();
    expect(await store.getAgent("does-not-exist")).toBeNull();
  });

  it("returns the full agent with correct field types", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    const got = await store.getAgent(created.id);

    expect(got).not.toBeNull();
    expect(typeof got!.archived).toBe("boolean"); // not 0/1
    expect(got!.archived).toBe(false);
    expect(got!.hermesSessionId).toBeNull(); // not undefined
  });
});

// ---------------------------------------------------------------------------
// listAgents
// ---------------------------------------------------------------------------

describe("SqliteAgentStore.listAgents", () => {
  it("returns empty array when no agents exist", async () => {
    const store = makeStore();
    const list = await store.listAgents();
    expect(list).toEqual([]);
  });

  it("excludes archived agents by default", async () => {
    const store = makeStore();
    const a = await store.createAgent({ ...sampleConfig, name: "Active" });
    const b = await store.createAgent({ ...sampleConfig, name: "Archived" });
    await store.archiveAgent(b.id);

    const list = await store.listAgents();
    expect(list.map((x) => x.name)).toEqual(["Active"]);
    expect(list[0]!.id).toBe(a.id);
  });

  it("includes archived agents when includeArchived=true", async () => {
    const store = makeStore();
    await store.createAgent({ ...sampleConfig, name: "Active" });
    const b = await store.createAgent({ ...sampleConfig, name: "Archived" });
    await store.archiveAgent(b.id);

    const list = await store.listAgents(true);
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.name).sort()).toEqual(["Active", "Archived"]);
  });

  it("returns agents ordered by createdAt ascending", async () => {
    const store = makeStore();
    const a = await store.createAgent({ ...sampleConfig, name: "First" });
    await Bun.sleep(5); // ensure distinct timestamps
    const b = await store.createAgent({ ...sampleConfig, name: "Second" });
    await Bun.sleep(5);
    const c = await store.createAgent({ ...sampleConfig, name: "Third" });

    const list = await store.listAgents();
    expect(list.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });
});

// ---------------------------------------------------------------------------
// updateAgent
// ---------------------------------------------------------------------------

describe("SqliteAgentStore.updateAgent", () => {
  it("updates the specified fields and returns the new agent", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);

    const updated = await store.updateAgent(created.id, {
      hermesSessionId: "new-session-123",
      state: "thinking",
      statusText: "pondering",
    });

    expect(updated.hermesSessionId).toBe("new-session-123");
    expect(updated.state).toBe("thinking");
    expect(updated.statusText).toBe("pondering");
    // Unchanged fields preserved
    expect(updated.name).toBe("TestBot");
    expect(updated.modelTier).toBe("Budget");
  });

  it("refreshes updatedAt timestamp", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    await Bun.sleep(10);
    const updated = await store.updateAgent(created.id, { statusText: "x" });
    expect(updated.updatedAt).not.toBe(created.updatedAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
  });

  it("does NOT change createdAt", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    await Bun.sleep(10);
    const updated = await store.updateAgent(created.id, { statusText: "x" });
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it("throws AgentNotFoundError for unknown id", async () => {
    const store = makeStore();
    expect(store.updateAgent("nope", { statusText: "x" })).rejects.toThrow(
      AgentNotFoundError,
    );
  });

  it("ignores immutable fields (id, createdAt) in changes", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    const updated = await store.updateAgent(created.id, {
      // @ts-expect-error — id is technically Partial<Agent> but should be ignored
      id: "tampered",
      createdAt: "1970-01-01T00:00:00.000Z",
      statusText: "hello",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.statusText).toBe("hello");
  });

  it("updates hermesSessionId to null (reset)", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    await store.updateAgent(created.id, { hermesSessionId: "something" });
    const cleared = await store.updateAgent(created.id, {
      hermesSessionId: null,
    });
    expect(cleared.hermesSessionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// archiveAgent / restoreAgent
// ---------------------------------------------------------------------------

describe("SqliteAgentStore.archiveAgent", () => {
  it("sets archived=true and returns the agent", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    const archived = await store.archiveAgent(created.id);
    expect(archived.archived).toBe(true);
    expect(archived.id).toBe(created.id);
  });

  it("preserves the record (soft-delete)", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    await store.archiveAgent(created.id);
    const got = await store.getAgent(created.id);
    expect(got).not.toBeNull();
    expect(got!.archived).toBe(true);
  });

  it("throws AgentNotFoundError for unknown id", async () => {
    const store = makeStore();
    expect(store.archiveAgent("nope")).rejects.toThrow(AgentNotFoundError);
  });
});

describe("SqliteAgentStore.restoreAgent", () => {
  it("clears the archived flag", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    await store.archiveAgent(created.id);
    const restored = await store.restoreAgent(created.id);
    expect(restored.archived).toBe(false);
  });

  it("makes a previously-archived agent appear in listAgents again", async () => {
    const store = makeStore();
    const created = await store.createAgent(sampleConfig);
    await store.archiveAgent(created.id);
    expect(await store.listAgents()).toHaveLength(0);

    await store.restoreAgent(created.id);
    const list = await store.listAgents();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
  });

  it("throws AgentNotFoundError for unknown id", async () => {
    const store = makeStore();
    expect(store.restoreAgent("nope")).rejects.toThrow(AgentNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

describe("seedAgents", () => {
  it("inserts Glitchkin, Mapsie, and Blipblop", async () => {
    const store = makeStore();
    await seedAgents(store);

    const list = await store.listAgents();
    const names = list.map((a) => a.name).sort();
    expect(names).toEqual(["Blipblop", "Glitchkin", "Mapsie"]);
  });

  it("gives each seed agent its correct specialty and tier", async () => {
    const store = makeStore();
    await seedAgents(store);
    const list = await store.listAgents();
    const byName = new Map(list.map((a) => [a.name, a]));

    const glitch = byName.get("Glitchkin")!;
    expect(glitch.specialty).toBe("Code Reviewer");
    expect(glitch.modelTier).toBe("Premium");
    expect(glitch.hermesPersonality).toBe("technical");

    const mapsie = byName.get("Mapsie")!;
    expect(mapsie.specialty).toBe("Spec Griller");
    expect(mapsie.modelTier).toBe("Balanced");
    expect(mapsie.hermesPersonality).toBe("grillme");

    const blipblop = byName.get("Blipblop")!;
    expect(blipblop.specialty).toBe("General Chat");
    expect(blipblop.modelTier).toBe("Budget");
    expect(blipblop.hermesPersonality).toBe("concise");
  });

  it("is idempotent — does not duplicate seed agents on second run", async () => {
    const store = makeStore();
    await seedAgents(store);
    await seedAgents(store);
    const list = await store.listAgents();
    expect(list).toHaveLength(3);
  });

  it("preserves user edits to seed agents on re-seed", async () => {
    const store = makeStore();
    await seedAgents(store);
    const glitch = (await store.listAgents()).find((a) => a.name === "Glitchkin")!;
    await store.updateAgent(glitch.id, { statusText: "user-set" });

    await seedAgents(store); // re-run
    const after = await store.getAgent(glitch.id);
    expect(after!.statusText).toBe("user-set");
  });

  it("exports SEED_AGENTS with exactly 3 entries", () => {
    expect(SEED_AGENTS).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Concurrent access
// ---------------------------------------------------------------------------

describe("SqliteAgentStore concurrent access", () => {
  it("handles parallel createAgent calls without id collision", async () => {
    const store = makeStore();
    const configs = Array.from({ length: 20 }, (_, i) => ({
      ...sampleConfig,
      name: `Agent${i}`,
    }));
    const results = await Promise.all(configs.map((c) => store.createAgent(c)));
    const ids = new Set(results.map((a) => a.id));
    expect(ids.size).toBe(20);
  });

  it("handles interleaved updates to different agents", async () => {
    const store = makeStore();
    const a = await store.createAgent({ ...sampleConfig, name: "A" });
    const b = await store.createAgent({ ...sampleConfig, name: "B" });

    await Promise.all([
      store.updateAgent(a.id, { state: "thinking" }),
      store.updateAgent(b.id, { state: "working" }),
      store.updateAgent(a.id, { statusText: "hi" }),
      store.updateAgent(b.id, { statusText: "bye" }),
    ]);

    const gotA = await store.getAgent(a.id);
    const gotB = await store.getAgent(b.id);
    expect(gotA!.statusText).toBe("hi");
    expect(gotB!.statusText).toBe("bye");
  });
});

// ---------------------------------------------------------------------------
// Stub (kept for back-compat)
// ---------------------------------------------------------------------------

describe("StubAgentStore", () => {
  it("createAgent returns a placeholder agent", async () => {
    const stub = new StubAgentStore();
    const a = await stub.createAgent(sampleConfig);
    expect(a.id).toBe("stub-id");
    expect(a.name).toBe("TestBot");
  });

  it("listAgents returns empty array", async () => {
    const stub = new StubAgentStore();
    expect(await stub.listAgents()).toEqual([]);
  });

  it("getAgent returns null", async () => {
    const stub = new StubAgentStore();
    expect(await stub.getAgent("x")).toBeNull();
  });
});
