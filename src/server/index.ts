import { join, resolve } from "node:path";
import { existsSync, statSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { TerrariumWebSocketRelay } from "../modules/ws-relay";
import {
  initDatabase,
  SqliteAgentStore,
  seedAgents,
} from "../modules/agent-store";
import { HermesGatewayAdapter, StubHermesGateway } from "../modules/hermes-gateway";

// ---------------------------------------------------------------------------
// Load .env files — project .env first, then Hermes .env as fallback
// Only sets vars that aren't already in process.env.
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore read errors
  }
}

// Project .env takes priority over Hermes .env
loadEnvFile(join(import.meta.dir, "../../.env"));
loadEnvFile(join(homedir(), ".hermes/.env"));

const PORT = 3000;
const VITE_PORT = 5173;
const isDev = process.env.NODE_ENV !== "production";
const DB_PATH = join(import.meta.dir, "../../data/terrarium.db");

// Init SQLite — creates the .db file, runs migrations, seeds initial agents
console.log(`[db] Initializing SQLite at ${DB_PATH}`);
const db = initDatabase(DB_PATH);
const store = new SqliteAgentStore(db);
await seedAgents(store);
const seedCount = (await store.listAgents()).length;
console.log(`[db] SQLite ready — ${seedCount} agent(s) loaded`);

// Init Hermes gateway
// HERMES_API_KEY takes priority; fall back to API_SERVER_KEY (Hermes' own env
// convention) so the terrarium works out of the box when Hermes is running
// locally with its standard .env.
const HERMES_URL = process.env.HERMES_URL ?? "http://localhost:8642";
const HERMES_API_KEY = process.env.HERMES_API_KEY || process.env.API_SERVER_KEY || "";
const hermes = new HermesGatewayAdapter(HERMES_URL, HERMES_API_KEY);
console.log(`[hermes] Gateway configured for ${HERMES_URL} (auth: ${HERMES_API_KEY ? "yes" : "none"})`);

// Source Hermes .env if no key was found in the environment
if (!HERMES_API_KEY) {
  console.warn(`[hermes] No API key found. Set HERMES_API_KEY or API_SERVER_KEY if Hermes requires auth.`);
}

// Init WebSocket relay backed by the agent store + Hermes
const relay = new TerrariumWebSocketRelay(store);
relay.setHermes(hermes);

// Path to static files
const distDir = join(import.meta.dir, "../../dist");
const publicDir = join(import.meta.dir, "../../public");

function serveStatic(pathname: string): Response | null {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  for (const base of [distDir, publicDir]) {
    const filePath = join(base, cleanPath);
    try {
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const file = Bun.file(filePath);
        return new Response(file);
      }
    } catch { /* file doesn't exist, try next */ }
  }
  return null;
}

// Dev mode: spawn Vite and proxy
let viteProcess: ChildProcess | null = null;

async function startVite(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", ["x", "vite", "--port", String(VITE_PORT), "--strictPort"], {
      cwd: join(import.meta.dir, "../.."),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      if (!started && text.includes("Local:")) {
        started = true;
        console.log(`[server] Vite ready on http://localhost:${VITE_PORT}`);
        resolve();
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(data.toString());
    });

    proc.on("exit", (code) => {
      if (!started) {
        reject(new Error(`Vite exited with code ${code}`));
      }
    });

    viteProcess = proc;
  });
}

async function proxyToVite(req: Request): Promise<Response> {
  const url = new URL(req.url);
  url.host = `localhost:${VITE_PORT}`;
  url.port = String(VITE_PORT);

  const headers = new Headers(req.headers);
  // Don't forward host header
  headers.delete("host");

  try {
    const res = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined,
    });
    return res;
  } catch (err) {
    console.error("[proxy] Vite not reachable:", err);
    return new Response("Dev server not ready", { status: 502 });
  }
}

// Start server
console.log(`[server] Starting on http://localhost:${PORT}`);

if (isDev) {
  console.log(`[server] Starting Vite dev server on port ${VITE_PORT}...`);
  startVite().then(() => {
    console.log(`[server] Open http://localhost:${PORT} in your browser`);
  });
}

const server = Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade — our own /ws relay
    if (url.pathname === "/ws") {
      const ok = server.upgrade(req);
      if (ok) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Any other WebSocket upgrade attempt: we can't proxy it through fetch().
    // Vite's HMR client is configured (vite.config.ts) to connect directly to
    // :5173, so this should never fire in practice — return 426 so any stray
    // client fails loudly instead of falling into a silent reconnect loop.
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return new Response(
        "WebSocket proxying is not supported on this port. " +
        "Vite HMR connects directly to :5173.",
        { status: 426 },
      );
    }

    // Dev mode: proxy HTTP to Vite
    if (isDev) {
      return proxyToVite(req);
    }

    // Production: serve static files
    const staticRes = serveStatic(url.pathname);
    if (staticRes) return staticRes;

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      relay.handleConnection(ws);
    },
    message(ws, message) {
      relay.handleMessage(ws, message as string);
    },
    close(ws) {
      relay.handleClose(ws);
    },
  },
});

console.log(`[server] Listening on http://localhost:${PORT}`);
console.log(`[server] Mode: ${isDev ? "development" : "production"}`);

// Graceful shutdown
async function shutdown() {
  console.log("\n[server] Shutting down...");
  relay.shutdown();
  db.close();
  viteProcess?.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
