import { GameConfig, GameState, LogEntry } from '../types/game';
import { createGame } from '../game/state';
import { Rng } from '../game/rng';
import { GameObserver, runGame } from '../game/orchestrator';
import { RoutingController } from '../game/routing-controller';
import { NpcController } from '../npc/npc-controller';
import { buildPlayerView, PlayerView } from '../npc/view';
import { LlmClient } from '../ollama/client';
import { PromptDto, ServerEvent, validateAnswer } from './protocol';
import { WebHumanController } from './web-human-controller';
import { Activity, NarratingController } from './narrating-controller';

// What a session needs from the outside: the LLM for the NPCs, a sink to push events
// to subscribers, and the optional knobs runGame already understands. `emit` is owned
// by the server (it fans out to the live SSE connections), so the session never needs
// to know about HTTP — it just produces ServerEvents.
export type SessionDeps = {
  client: LlmClient;
  emit: (event: ServerEvent) => void;
  rng?: Rng;
  wolfTalkRounds?: number;
  debateRounds?: number;
};

export type SubmitResult = { ok: true } | { ok: false; status: 400 | 409; message: string };

type Pending = { dto: PromptDto; resolve: (value: string | null | boolean) => void };

// One in-memory game. It owns the running game loop (runGame), translates its
// observer callbacks and human-input requests into ServerEvents, and resolves the
// human's posted answers back into the loop. Exactly one human seat; the rest NPCs.
//
// Hidden-information boundary: only the human's own buildPlayerView and the public
// log ever leave here — never the full GameState, and the NpcController is created
// WITHOUT an onThought observer so NPC reasoning (which would reveal roles) is never
// surfaced.
export class GameSession {
  private readonly emit: (event: ServerEvent) => void;
  private readonly humanPlayerId: string;
  private readonly names = new Map<string, string>(); // playerId -> name, for activity labels

  private logCursor = 0; // how much of state.log we've already pushed
  private logSnapshot: LogEntry[] = []; // full public log so far (for replay)
  private latestView: PlayerView | null = null; // last view pushed (for replay)
  private pending: Pending | null = null; // the one outstanding human prompt, if any
  private terminal: ServerEvent | null = null; // game-over / error once the game ends (for replay)
  private aborted = false; // set when this session is replaced; its callbacks then no-op

  constructor(config: GameConfig, deps: SessionDeps) {
    this.emit = deps.emit;
    const humans = config.players.filter((p) => p.isHuman);
    if (humans.length !== 1) throw new Error('a session needs exactly one human player');
    this.humanPlayerId = humans[0].id;
    this.run(config, deps);
  }

  // Stops this session affecting the outside world. Called when a new game replaces
  // it: the old runGame may still be mid-LLM-call, and its parked prompt will never
  // resolve, but with `aborted` set its observer/terminal handlers no longer emit.
  abort(): void {
    this.aborted = true;
  }

  // Everything a freshly (re)connected client needs to catch up: the full log, the
  // latest view, and either the terminal event or the currently pending prompt.
  replay(): ServerEvent[] {
    const events: ServerEvent[] = [];
    if (this.logSnapshot.length > 0) events.push({ type: 'log', entries: this.logSnapshot });
    if (this.latestView) events.push({ type: 'view', view: this.latestView });
    if (this.terminal) events.push(this.terminal);
    else if (this.pending) events.push({ type: 'prompt', prompt: this.pending.dto });
    return events;
  }

  // Resolves the outstanding prompt with the human's answer, letting runGame resume.
  // Rejects a stale/mismatched promptId (409) or an illegal value (400) without
  // resolving, so the game never advances on a move the engine would refuse.
  submitAnswer(promptId: string, value: string | null | boolean): SubmitResult {
    const pending = this.pending;
    if (!pending || pending.dto.promptId !== promptId) {
      return { ok: false, status: 409, message: 'no prompt is awaiting that answer' };
    }
    const validation = validateAnswer(pending.dto, value);
    if (!validation.ok) return { ok: false, status: 400, message: validation.message };
    // Clear the slot BEFORE resolving: the resumed loop may immediately request the
    // next prompt, and that must find an empty slot.
    this.pending = null;
    pending.resolve(validation.value);
    return { ok: true };
  }

  // The WebHumanController's seam: park the game on a Promise and surface the prompt.
  private requestPrompt = (dto: PromptDto): Promise<string | null | boolean> => {
    if (this.pending) return Promise.reject(new Error('a prompt is already pending'));
    return new Promise((resolve) => {
      this.pending = { dto, resolve };
      if (!this.aborted) this.emit({ type: 'prompt', prompt: dto });
    });
  };

  // Pushes new log entries and the human's refreshed view after each engine change.
  // This is the structured analogue of the CLI's createLogObserver, minus ANSI and
  // minus the reveal-private path — only public log + the human's own view.
  private observe: GameObserver = (state: GameState) => {
    if (this.aborted) return;
    const fresh = state.log.slice(this.logCursor);
    if (fresh.length > 0) {
      this.logCursor = state.log.length;
      this.logSnapshot = state.log;
      this.emit({ type: 'log', entries: fresh });
    }
    const view = buildPlayerView(state, this.humanPlayerId);
    this.latestView = view;
    this.emit({ type: 'view', view });
  };

  private setTerminal(event: ServerEvent): void {
    if (this.aborted) return;
    this.terminal = event;
    this.emit(event);
  }

  // Hidden-info-safe label for a live activity. Public day actions name the actor;
  // night roles stay anonymous.
  private activityLabel(a: Activity): string {
    switch (a.kind) {
      case 'speaking':
        return `${this.names.get(a.actorId ?? '') ?? 'Someone'} is speaking…`;
      case 'voting':
        return `${this.names.get(a.actorId ?? '') ?? 'Someone'} is deciding their vote…`;
      case 'wolves':
        return 'The werewolves are choosing their victim…';
      case 'seer':
        return 'The Seer gazes into the night…';
      case 'witch':
        return 'The Witch weighs her potions…';
    }
  }

  private run(config: GameConfig, deps: SessionDeps): void {
    const state = createGame(config, deps.rng);
    for (const p of state.players) this.names.set(p.id, p.name);
    // Share the game's rng so a seed makes the whole run reproducible; NO onThought,
    // so NPC reasoning (which would reveal roles) is never surfaced. The NPC controller
    // is wrapped so each NPC turn first emits a live "who is acting" activity event.
    const npc = new NarratingController(new NpcController(deps.client, { rng: deps.rng }), (a) => {
      if (!this.aborted) this.emit({ type: 'activity', label: this.activityLabel(a), actorId: a.actorId });
    });
    const human = new WebHumanController(this.requestPrompt);
    const controller = new RoutingController(human, npc);

    runGame(state, controller, {
      observe: this.observe,
      wolfTalkRounds: deps.wolfTalkRounds,
      debateRounds: deps.debateRounds,
      rng: deps.rng,
    })
      .then((final) => {
        if (final.phaseData.phase === 'game-over') {
          this.setTerminal({
            type: 'game-over',
            winner: final.phaseData.winner,
            roster: final.players.map((p) => ({ id: p.id, name: p.name, role: p.role })),
          });
        } else {
          this.setTerminal({ type: 'error', message: 'the game ended without a winner' });
        }
      })
      .catch((err) => {
        // An NPC LLM failure (or any loop error) ends the game cleanly over the wire
        // instead of crashing the server with an unhandled rejection.
        this.setTerminal({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }
}
