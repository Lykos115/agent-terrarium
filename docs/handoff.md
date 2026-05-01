# Session handoff — next steps

## Current status (as of 2026-05-01)

**Completed issues:** #2 (scaffold), #3 (Hermes Gateway), #4 (Agent Store), Phase 2a foundation
**Deferred:** #7 (Caddy — do last, after app works on localhost)
**Next up:** Layer 2 — issues #5, #6, #9 (parallel-friendly frontend work)

All tests passing: **94/94** across 4 files.

## Phase 2a: what just shipped (commit `edce24d`)

Shared foundation for all Layer 2 work:

- **Wire protocol** in `src/types.ts`: typed `ServerMessage` / `ClientMessage` unions
- **Real `TerrariumWebSocketRelay`** in `src/modules/ws-relay.ts` (14 tests)
- **Zustand store** in `src/client/store.ts` with full `applyServerMessage` reducer (14 tests)
- **`useTerrarium` hook** in `src/client/useTerrarium.ts` — owns the WS connection with exponential-backoff reconnect
- **`App.tsx` shell** with header (connection dot), error toast, and **4 view placeholders** that the Layer 2 subagents will replace

Verified end-to-end: server boots with seeds, client WS connects, `agent_list` with Glitchkin/Mapsie/Blipblop arrives.

## Layer 2 plan — parallel subagents

Spawn three subagents in parallel. Each owns disjoint files, so there is no merge risk. After they return, the parent integrates their work into `App.tsx` by swapping placeholders for real imports.

### Subagent A — Issue #5: Empty Terrarium First-Run Experience
**Owns:**
- `src/client/EmptyTerrarium.tsx` (new)

**Integration point:** Replaces `EmptyTerrariumPlaceholder` in `App.tsx`.

**Task prompt shape:**
> Implement `src/client/EmptyTerrarium.tsx` as a dark, dormant screen with a glowing pulsing summoning portal at center. Clicking the portal sets `ui.wizardOpen = true` in the store (you'll need to add this state slice). The portal should glow/pulse via CSS keyframes. On hover, pulse brighter. When the first agent is added, the component fades out (the parent swaps it for the grid).
>
> Read `src/client/store.ts` for the existing Zustand store shape. Add a `wizardOpen: boolean` + `setWizardOpen(v)` action to it. Read `src/client/App.tsx` to see where your component will plug in.
>
> Acceptance criteria are in GitHub issue #5. Tests for the new store slice must pass (`bun test`).

**GitHub issue:** https://github.com/Lykos115/agent-terrarium/issues/5

### Subagent B — Issue #6: Dollhouse Grid with Agent Sprites
**Owns:**
- `src/client/DollhouseGrid.tsx` (new)
- `src/client/RoomTile.tsx` (new)
- `src/modules/sprite-engine.ts` (real implementation replacing stubs)
- `src/client/sprites/` (programmatic placeholder sprites — no external PNG assets needed for MVP)

**Integration point:** Replaces `DollhouseGridPlaceholder` in `App.tsx`.

**Task prompt shape:**
> Implement the dollhouse grid view: CSS grid of room tiles, each containing a PixiJS canvas with a sprite playing its idle animation. Responsive: 3 columns desktop, 1 column mobile.
>
> **Sprite placeholders:** the PRD says 3 sprite kits; we don't have pixel art yet. Generate programmatic placeholders with PixiJS `Graphics` — a colored blob that bobs up and down and color-shifts slightly. Three distinct colors for the three seed agents. Parse the `spriteId` from the agent record (e.g. `sprite-glitchkin` → red blob). Build a proper `SpriteActor` / `Room` implementation in `sprite-engine.ts` that accepts state changes (`setState("idle" | ...)`) and position changes (`walkTo`).
>
> Clicking a room tile dispatches `setRoute({ name: "room", agentId })` on the store.
>
> Tests: write unit tests for `sprite-engine.ts` using a mock/headless PixiJS setup if feasible; otherwise test the pure logic (frame selection, state transition math) and leave PixiJS rendering to manual verification.
>
> **Integration point:** Export `DollhouseGrid` from `DollhouseGrid.tsx`. Read `src/client/App.tsx` to see where it plugs in. Read `src/types.ts` for the Agent shape. Read `src/client/store.ts` for the store selectors.
>
> Acceptance criteria are in GitHub issue #6.

**GitHub issue:** https://github.com/Lykos115/agent-terrarium/issues/6

### Subagent C — Issue #9: Summoning Wizard
**Owns:**
- `src/client/SummoningWizard.tsx` (new — 4-step modal)
- `src/client/summoning-presets.ts` (new — specialty→tier mapping, personality prompts, sprite kit list)

**Integration point:** Rendered as a modal overlay from `App.tsx` when `store.ui.wizardOpen === true` (state slice added by Subagent A — wait, no: **this subagent adds it** — see coordination note below).

**Task prompt shape:**
> Implement a 4-step modal wizard:
>
> 1. **Step 1 — specialty**: 7 cards (Code Reviewer, Spec Griller, General Chat, DevOps, Creative Writer, Researcher, Debugger). Click to select.
> 2. **Step 2 — confirm tier**: auto-selected from specialty (see mapping in `summoning-presets.ts`), overridable via radios.
> 3. **Step 3 — sprite kit**: 3 kits with animated preview. For MVP, programmatic placeholders are fine (reuse whatever #6 builds in `sprite-engine.ts` — you may need to wait for it or build your own simple preview).
> 4. **Step 4 — name & confirm**: text input (pre-filled suggestion like "Agent #4"), summary of choices, "Summon" button.
>
> On "Summon", call `requestCreateAgent(ws, config)` from `store.ts`. Close the modal on success.
>
> ESC or backdrop click cancels at any step. Tests for `summoning-presets.ts` (pure data/mappings) are required; wizard UI is manual.
>
> **State coordination:** Add `wizardOpen: boolean` + `setWizardOpen(v: boolean)` to the store if not already present. This is the ONE state field you and Subagent A might both touch — if #5 already added it, just use it. Otherwise, add it.
>
> Acceptance criteria are in GitHub issue #9.

**GitHub issue:** https://github.com/Lykos115/agent-terrarium/issues/9

## Coordination hazard: the `wizardOpen` store slice

Both subagent A (#5 — empty portal click → open wizard) and subagent C (#9 — the wizard itself) need `wizardOpen` state. Solutions:

- **Parent (me) adds `wizardOpen` to the store BEFORE spawning subagents.** Cleanest. Each subagent just reads/writes it.
- Or: assign the slice ownership to Subagent C and tell Subagent A to call a function like `openWizard()` that C exports.

Recommended: **parent adds the slice first**, then spawns subagents. I'll do this as part of the Phase 2b kickoff.

## How to run Layer 2 after restart

```typescript
// After adding wizardOpen slice, spawn 3 subagents in parallel:
subagent({
  tasks: [
    { agent: "worker", task: "<issue #5 prompt>" },
    { agent: "worker", task: "<issue #6 prompt>" },
    { agent: "worker", task: "<issue #9 prompt>" }
  ],
  concurrency: 3
})
```

Or spawn them individually and async, then integrate as each returns.

After all three return:
1. Swap placeholders in `App.tsx` for real imports
2. Run full test suite
3. Boot server, manually verify each view
4. Review each subagent's diff
5. Three commits (one per issue) or one squashed merge commit
6. Close #5, #6, #9 with comments + AC tables
7. Move to Layer 3

## Anchor commits

- `350f84f` Initial commit (PRD + empty scaffold)
- `0ba8218` Scaffold work from #2
- `443f6c4` Hermes Gateway Adapter (#3)
- `0f24fd1` Agent Store + seed data (#4)
- `edce24d` Phase 2a: WS relay + client foundation

## Test commands

```bash
bun test                    # full suite
bun test src/modules        # server-side only
bun test src/client         # client store only
bun run src/server/index.ts # boot server on :3000
```
