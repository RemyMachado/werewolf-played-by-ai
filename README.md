<h1 align="center">🐺 Werewolf, Played by AI</h1>

<p align="center">
  <em>A solo game of <strong>The Werewolves of Miller's Hollow</strong> where you are the only human at the table —
  every other villager is a local LLM that talks, lies, deduces, and plays to win.</em>
</p>

<p align="center">
  <img src="docs/hero.png" alt="The village square at dawn — players seated around the table, the live game log on the right" width="100%">
</p>

---

## What is this?

You sit down in a fog-bound village. Some of your neighbours are werewolves. Each night they kill;
each day everyone argues and lynches a suspect. Find the wolves before they outnumber you.

The twist: **the other players are AI.** Every NPC is driven by a local model through
[Ollama](https://ollama.com), with its own private memory and agenda. They aren't scripted — they get
the rules, what they can legitimately see, and a single goal (**win**), then play it out: bluffing,
accusing, defending packmates, wasting potions, sometimes outing themselves.

Roles in the box: **Villager · Werewolf · Seer · Witch.**

The interface is a 2D board that moves from night to day, and each NPC's turn plays out live as it
happens. The server only ever sends you what your role is allowed to see, so another living player's
role never reaches your browser.

<table>
  <tr>
    <td width="50%"><img src="docs/voting.png" alt="Click a player at the table to cast your vote"></td>
    <td width="50%"><img src="docs/history.png" alt="The styled game history with colour-coded names and roles"></td>
  </tr>
  <tr>
    <td align="center"><sub>Click a neighbour to vote — or abstain.</sub></td>
    <td align="center"><sub>Every name is bold; the dead reveal their true colours.</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/finale.png" alt="The Werewolves prevail — the game-over scoreboard reveals every role" width="75%">
  <br><sub>Game over reveals the whole table.</sub>
</p>

## How a round flows

1. **Night** 🌙 — the werewolves choose a victim, the Seer investigates one player, the Witch may heal or poison.
2. **Day** ☀️ — survivors debate over one or more rounds (you can speak or stay quiet).
3. **Vote** ⚖️ — the village lynches a suspect (ties go to a runoff). Eliminated players have their role revealed.
4. Repeat until one team is wiped out.

## Tech stack

A pnpm monorepo, TypeScript end to end, Zod schemas as the single source of truth.

| Layer | Stack |
|---|---|
| **Game engine** (`server/src/game`) | Pure, immutable, deterministic (injectable RNG). No I/O. |
| **NPC brain** (`server/src/npc`) | Per-player view + prompt → Ollama with **grammar-constrained JSON** → validated action. Private reasoning + rewritable memory each turn. |
| **API** (`server/src/api`) | Express + **Server-Sent Events** (no WebSockets needed for one player) + plain HTTP for your answers. One in-memory session. |
| **Web UI** (`client`) | React + Vite + **Framer Motion**. Procedural SVG characters, AI-generated backdrops/role cards, full `prefers-reduced-motion` support. |
| **LLM** | [Ollama](https://ollama.com) locally — default `gemma4:e4b` (any format-friendly model works; `phi4`, `qwen2.5` are good too). |

## Getting started

**Prerequisites:** [Node](https://nodejs.org) + [pnpm](https://pnpm.io), and [Ollama](https://ollama.com) running locally.

```bash
# 1. Pull a model (once)
ollama pull gemma4:e4b

# 2. Install
pnpm install

# 3. Run the server (connects to Ollama, serves the game API on :3000)
pnpm dev:server

# 4. In another terminal, run the web client (Vite on :5173)
pnpm dev:client
```

Open **http://localhost:5173**, pick a preset, and take your seat.

> The web UI ships with AI-generated art in `client/public/images/`. If those files are absent the game
> falls back to its built-in gradients and SVG icons — it always runs.

### Other ways to play

```bash
pnpm --filter server launch   # interactive terminal launcher (play / watch / testing)
pnpm --filter server npc      # watch an all-AI game in the terminal
pnpm --filter server web      # headless client that drives a full game over the API
```

### Developing

```bash
pnpm typecheck                # both packages
pnpm --filter server test     # the engine + NPC + API test suite (vitest)
```

## Project layout

```
server/
  src/game/    pure engine: phases, night/day resolution, votes, win conditions
  src/npc/     LLM controller, per-player hidden-info view, prompts, output schemas
  src/api/     Express + SSE session, the wire protocol, the web-human controller
  src/ollama/  structured-output Ollama client
  src/cli/     terminal runners (launch / npc / play) and rendering
client/
  src/         React board: table, seats, animations, action bar, history, finale
  public/images/  AI-generated backdrops, role cards, and finale scenes
```

## Design principles

- **Don't script the AI.** Prompts give facts, the rules, and the goal — never "do X." Forcing moves makes every NPC identical and kills the bluffing.
- **The hidden-information boundary is sacred.** Enforced on the server (`buildPlayerView`) and preserved all the way into the art — a living player's role is never sent to the client.
- **KISS / SRP / DRY**, everything typed from Zod, no overengineering.

## Credits

A personal experiment — vibe-coded in maybe ten hours. Character and scene art generated with
**Nano Banana (Gemini)**. Inspired by *The Werewolves of Miller's Hollow*.
