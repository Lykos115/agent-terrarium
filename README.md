# Agent Terrarium

A web-based control center styled as a chibi tamagotchi terrarium. Each AI agent lives as an animated sprite in its own dollhouse room.

## Status

Design phase — see [PRD](docs/prd.md) for full specification.

## Quick Start

```bash
bun install
bun dev
```

## Architecture

| Module | Description |
|--------|-------------|
| Hermes Gateway Adapter | Communication with Hermes agent system |
| Agent Store (SQLite) | Persistence layer for agent configuration |
| WebSocket Relay | Binds WebSocket messages to store/Hermes |
| Sprite Engine | PixiJS-based rendering layer |
| React Application | Zustand store + component hierarchy |
| Bun HTTP Server | Entry point, serves/proxies, orchestrates |

See [docs/prd.md](docs/prd.md) for detailed design decisions.
