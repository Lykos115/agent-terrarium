# PRD: Agent Terrarium

**Date:** 2026-04-30
**Status:** Design complete, awaiting implementation
**Label:** `needs-triage`

---

## Problem Statement

Managing multiple AI agents across different systems (Hermes, OpenClaw, pi) requires switching between terminal sessions, web UIs, and chat interfaces. There's no single place to see what all agents are doing, who's active, who's idle — and there's certainly no fun way to interact with them. The user wants a single dashboard that makes agent management feel delightful rather than administrative.

---

## Solution

A web-based control center styled as a **chibi tamagotchi terrarium**. Each AI agent lives as an animated sprite in its own dollhouse room. The user can see all agents at a glance in a grid overview, zoom into individual rooms to chat with them, summon new agents through a guided wizard, and dismiss agents when no longer needed. Agents communicate through Hermes, with their live state (idle/thinking/working/sleeping) reflected visually through sprite animations and room positioning.

---

## User Stories

### Core Agent Interaction
1. As a user, I want to see all my AI agents on one screen, so that I can monitor their status at a glance.
2. As a user, I want each agent to have a unique chibi sprite and name, so that I can visually distinguish them.
3. As a user, I want agents to animate based on their current state (idle/thinking/working/sleeping), so that I can tell what they're doing without reading text.
4. As a user, I want idle agents to wander around their room randomly, so that the terrarium feels alive.
5. As a user, I want agents to auto-sleep after being idle for a period, so that they feel like real creatures with rhythms.
6. As a user, I want sleeping agents to wake up when I click on them, so that I can interact with them at any time.
7. As a user, I want to see a thinking bubble above agents when Hermes is processing, so that I know they're working on my request.
8. As a user, I want working agents to appear at their desk, so that their physical location matches their activity.

### Chat & Communication
9. As a user, I want to click an agent's room tile to zoom into their private room, so that I can interact with them one-on-one.
10. As a user, I want to open a chat panel in an agent's room by clicking a "Talk" button, so that I can initiate conversation deliberately.
11. As a user, I want to see the agent's sprite animate in the room while chatting, so that I feel like I'm talking TO them.
12. As a user, I want chat messages to appear in a right-side panel with the agent's portrait, so that conversation is readable and organized.
13. As a user, I want agent responses to render markdown (including code blocks), so that technical responses are properly formatted.
14. As a user, I want to see brief speech bubbles above the agent's sprite for status updates, so that ambient information is visible without opening chat.
15. As a user, I want to reset an agent's conversation context with a `/reset` command, so that I can start fresh without dismissing the agent.
16. As a user, I want to reset context from the agent's settings panel, so that I have a discoverable alternative to the slash command.

### Agent Management
17. As a user, I want to summon new agents through a guided wizard, so that creation feels like a ritual rather than a form.
18. As a user, I want to pick a specialty for a new agent from a preset list, so that agents come pre-configured for their role.
19. As a user, I want the summoning wizard to auto-select an appropriate model tier based on the chosen specialty, so that I don't need to know which models are best for each task.
20. As a user, I want to override the model tier during summoning, so that I have full control when needed.
21. As a user, I want to select a sprite kit for the new agent with a live preview, so that I can see how they'll look before confirming.
22. As a user, I want a summoning animation to play when an agent is created, so that their arrival feels magical.
23. As a user, I want to dismiss agents from their settings screen, so that I can remove agents I no longer need.
24. As a user, I want dismissed agents to be archived rather than permanently deleted, so that I can restore them later.
25. As a user, I want to restore archived agents from the summoning wizard, so that I can bring back agents I previously dismissed.
26. As a user, I want the dismiss flow to include an animation (sprite walks off-screen), so that removal feels intentional and final.

### Navigation & Experience
27. As a user, I want room transitions to use a horizontal curtain animation, so that navigation feels like a retro game.
28. As a user, I want to navigate between the grid, agent rooms, and settings using browser back/forward buttons, so that the app behaves like a normal website.
29. As a user, I want the first-run experience to show a dark, dormant screen with a glowing summoning portal, so that the empty terrarium feels mysterious rather than broken.
30. As a user, I want a status indicator showing Hermes connection health, so that I know if agents are unreachable due to infrastructure.

### Resilience
31. As a user, I want agents to gracefully transition to sleep when Hermes is unreachable, so that the terrarium doesn't break when the backend is down.
32. As a user, I want to still edit agents, change settings, and browse rooms when Hermes is down, so that the dashboard remains useful offline from the AI backend.
33. As a user, I want agents to automatically wake up when Hermes reconnects, so that I don't need to manually revive them.
34. As a user, I want chat input to show a helpful tooltip when Hermes is down ("Glitchkin is sleeping — Hermes is taking a nap too"), so that I understand why I can't chat.

### Access & Deployment
35. As a user, I want the dashboard accessible from any device on my local network, so that I can check agents from my phone or tablet.
36. As a user, I want access restricted to my local network IP range, so that strangers can't reach the dashboard.
37. As a user, I want the dashboard to start automatically on boot, so that I don't need to manually start it.

---

## Implementation Decisions

### Modules

The system is split into six modules, with two identified as deep modules suitable for isolated testing:

#### Deep Module: Hermes Gateway Adapter
Encapsulates all communication with the Hermes agent system behind a single interface. Responsibilities: polling agent health and run status, creating chat sessions, sending messages, subscribing to run events, resetting sessions. The rest of the system never touches Hermes APIs directly.

**Interface concepts:**
- `getAgentStates()` → current idle/thinking/working status for all tracked agents
- `sendChat(agentId, message)` → streams response chunks via async iterator
- `createSession(agentId, personality, modelTier)` → hermes_session_id
- `resetSession(agentId)` → clears session, creates fresh one
- `isReachable()` → boolean health check

#### Deep Module: Agent Store (SQLite)
Encapsulates all persistence behind a simple CRUD interface. The rest of the system never writes SQL directly.

**Interface concepts:**
- `createAgent(config)` → Agent
- `listAgents(includeArchived?)` → Agent[]
- `getAgent(id)` → Agent
- `updateAgent(id, changes)` → Agent
- `archiveAgent(id)` → Agent (archived flag set)
- `restoreAgent(id)` → Agent (archived flag cleared)

#### Module: WebSocket Relay
Binds incoming WebSocket messages to agent store reads and Hermes adapter calls. Pushes agent state updates and chat responses back to the client. Listens for state change events from the Hermes adapter.

#### Module: Sprite Engine
PixiJS-based rendering layer. Manages sprite sheet loading, animation playback by state, and position tweens. Provides a `SpriteActor` class that the React Canvas component controls.

**Interface concepts:**
- `SpriteActor` with `setState(idle|thinking|working|sleeping)`, `walkTo(x, y)`, `playBubble(text)`
- `Room` container with layered sprites (background, furniture, agent)

#### Module: React Application
Zustand store drives all client state. Components in hierarchy: App → DollhouseGrid | AgentRoom → Canvas | ChatPanel | AgentEditor. SummoningWizard as modal overlay.

#### Module: Bun HTTP Server
Entry point. Serves Vite dev proxy or static build. Upgrades WebSocket connections. Runs the Hermes polling loop. Orchestrates module wiring.

### Architecture Decisions
- PixiJS runs inside a single React `<Canvas>` component; React owns routing, modals, and all DOM UI
- SQLite is the single source of truth for agent configuration, session IDs, and archive status
- Hermes session IDs are stored in SQLite and created lazily on first message
- Agent state (idle/thinking/working/sleeping) is derived from Hermes health/runs API polling, not persisted
- Model tier (Budget/Balanced/Premium) maps to specific model identifiers in a single config location
- The grill-me skill is baked into Mapsie's Hermes system prompt as a personality
- Caddy handles IP restriction at the reverse proxy layer; the Bun server itself has no auth
- Horizontal curtain transitions use CSS/Framer Motion, not PixiJS
- Slash commands (`/reset`) are parsed client-side and translated to WebSocket actions

### Schema
Agent record stores: id, name, specialty, sprite_id, hermes_personality, hermes_session_id, state enum, status_text, model_tier, archived flag, created_at, updated_at.

### API Contracts
WebSocket messages use a simple JSON envelope:
- Server → Client: `agent_state`, `agent_chat` (streaming), `hermes_status`
- Client → Server: `chat`, `reset_context`, `request_state`

### Sprite Specification
- 64×64 pixel frames, 6-8 frames per animation
- 4 animation rows: idle, thinking, working, sleeping
- Sprite sheet PNG + accompanying JSON manifest defining frame rectangles and timings
- 3 distinct sprite kits for MVP

---

## Testing Decisions

### What makes a good test
Tests should verify external behavior, not implementation details. Given inputs, assert observable outputs. Mock external systems (Hermes API) at the boundary. Use in-memory SQLite for database tests.

### Modules to test
- **Hermes Gateway Adapter** — Mock Hermes HTTP server, test state polling, session creation, message streaming, error handling, reconnection
- **Agent Store** — In-memory SQLite, test full CRUD, archive/restore, concurrent access
- **WebSocket Relay** — Mock Hermes adapter + store, test message routing, state broadcast on change
- **Sprite Engine** — Headless canvas, test animation state transitions, position tweens, sprite sheet frame selection

### Modules NOT tested in v1
- React components (manual verification, too visual)
- PixiJS rendering output (pixel-level testing is brittle)
- Caddy configuration (infrastructure, tested by deployment)

### Prior art
None — greenfield project. Tests follow standard Bun test patterns with `describe`/`it`/`expect`. Hermes adapter tests mirror existing Hermes API server tests in structure (mock aiohttp server, assert request/response shape).

---

## Out of Scope

- Isometric village layout (v2)
- Agent-to-agent social interaction (v2)
- Mood/happiness/energy meters (v2)
- Customizable room furniture placement (v2)
- Agent bio/description fields (v2)
- Theme-variant rooms by specialty (v2)
- OpenClaw integration (v2)
- SSE event streaming from Hermes (v2 — use polling for v1)
- AI-generated sprite sheets (v2 — use pre-made kits for v1)
- Commissioned sprite art (v2)
- Context-sensitive idle behavior (v2)
- Broadcast chat to all agents (v2)
- Multi-sprite side-by-side comparison (v2)
- Docker/containerized deployment (v2)
- OAuth or user authentication beyond IP restriction (v2)

---

## Further Notes

### Initial Agent Roster
Three agents pre-configured for first summoning:
- **Glitchkin** — Code Reviewer, Premium tier, technical personality
- **Mapsie** — Spec Griller (grill-me skill baked into prompt), Balanced tier
- **Blipblop** — General Chat, Budget tier, concise personality

### Specialty Presets
Seven specialties available in the summoning wizard, each with a recommended model tier:
Code Reviewer (Premium), Spec Griller (Balanced), General Chat (Budget), DevOps (Premium), Creative Writer (Balanced), Researcher (Premium), Debugger (Premium).

### Hermes Dependency
Agents require a running Hermes instance to chat or perform tasks. The dashboard degrades gracefully when Hermes is unreachable — agents sleep, UI remains interactive for management tasks.

### Reference
Full design decisions (42) documented in `/home/defteros/agent-terrarium-plan.md`.
