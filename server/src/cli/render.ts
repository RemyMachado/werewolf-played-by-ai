import { GameState, LogEntry, Phase, Player, Role } from '../types/game';
import { ROLE_META } from '../game/roles';
import { PlayerView } from '../npc/view';
import { blue, bold, cyan, dim, green, magenta, red, yellow } from './style';

// Color text by a role: werewolf red, seer magenta, villager green.
function paintByRole(text: string, role: Role | undefined): string {
  if (role === 'werewolf') return red(text);
  if (role === 'seer') return magenta(text);
  if (role === 'witch') return cyan(text);
  if (role === 'villager') return green(text);
  return text;
}

function roleColored(role: Role): string {
  return paintByRole(ROLE_META[role].displayName, role);
}

// One emoji per role, used to tag who is thinking/speaking in watch & testing mode
// (where roles are already revealed). Never shown to a human player — see the
// `reveal` gate in renderLogEntry and the thought observer (watch/eval only).
const ROLE_EMOJI: Record<Role, string> = {
  villager: '👤',
  werewolf: '🐺',
  seer: '🔮',
  witch: '🧙',
};

export function roleEmoji(role: Role): string {
  return ROLE_EMOJI[role];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Color every player name found in any text by that player's role. The SINGLE
// place names get colored — route all output through this (see narrator.ts) so we
// can never forget for a particular message. Off for a human player (would leak
// living roles). Names must sit in plain regions (not wrapped in other ANSI codes)
// for the word-boundary match to find them — the renderers keep names plain.
export function colorizeNames(text: string, players: Player[], reveal: boolean): string {
  if (!reveal || players.length === 0) return text;
  const byName = new Map(players.map((p) => [p.name.toLowerCase(), p]));
  const pattern = new RegExp(`\\b(${players.map((p) => escapeRegExp(p.name)).join('|')})\\b`, 'gi');
  return text.replace(pattern, (match) => {
    const p = byName.get(match.toLowerCase());
    return p ? paintByRole(match, p.role) : match;
  });
}

export function renderHeader(state: GameState): string {
  return bold(`Round ${state.round} · ${state.phaseData.phase}`);
}

export function renderRoster(state: GameState, revealRoles: boolean): string {
  // Names are left plain so the narrator can color them; only the role label and
  // dead-status marker are styled here.
  return state.players
    .map((p) => {
      const role = revealRoles ? ` ${roleColored(p.role)}` : '';
      const status = p.isAlive ? '' : dim(' — dead');
      return `  ${p.name}${role}${status}`;
    })
    .join('\n');
}

// A prominent banner for a phase transition.
function phaseBanner(phase: Phase, round: number): string {
  switch (phase) {
    case 'night':
      return '\n' + blue(bold(`════════ NIGHT ${round} ════════`));
    case 'day-debate':
      return '\n' + yellow(bold(`════════ DAY ${round} ════════`)) + '\n' + dim('   · debate ·');
    case 'day-vote':
      return '\n' + yellow('   · vote ·');
    case 'lobby':
    case 'game-over':
      return '';
  }
}

// Renders one log entry. Player names are left PLAIN (and kept out of ANSI wraps)
// so the narrator can color them in one pass; structural markers are styled here.
export function renderLogEntry(entry: LogEntry, players: Player[], reveal: boolean): string {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  switch (entry.type) {
    case 'speech': {
      // A leading blank line + a marker so a player SPEAKING is as visually distinct
      // as a player THINKING is in watch mode. When roles are revealed (watch/testing)
      // the marker is the speaker's role emoji; for a human player it stays a neutral
      // 💬 so their living role is never leaked.
      const speaker = players.find((p) => p.id === entry.playerId);
      const marker = reveal && speaker ? roleEmoji(speaker.role) : '💬';
      return `\n  ${marker} ${name(entry.playerId)}: ${entry.text}`;
    }
    case 'vote': {
      const target = entry.targetId === null ? dim('abstains') : name(entry.targetId);
      return `    ${name(entry.voterId)} ${dim('→')} ${target}`;
    }
    case 'elimination': {
      const verb =
        entry.cause === 'night-kill'
          ? 'was killed in the night'
          : entry.cause === 'poison'
            ? 'was poisoned by the witch'
            : 'was voted out';
      return `\n${red('  ☠')}  ${name(entry.playerId)} ${dim(`${verb} — was a ${ROLE_META[entry.role].displayName}`)}`;
    }
    case 'runoff':
      return `\n${yellow('   · runoff:')} ${entry.candidates.map(name).join(' vs ')}`;
    case 'no-elimination': {
      if (entry.reason === 'no-night-death') {
        return `\n${blue('  🌙')}  ${dim('no one died during the night')}`;
      }
      const why = entry.reason === 'all-abstained' ? 'everyone abstained' : 'the runoff ended in a tie';
      return `\n${yellow('   · no elimination')} ${dim(`— ${why}; no one is voted out today`)}`;
    }
    case 'phase-change':
      return phaseBanner(entry.phase, entry.round);
  }
}

export function renderRecentLog(state: GameState, count = 12, reveal = false): string {
  return state.log
    .slice(-count)
    .map((e) => renderLogEntry(e, state.players, reveal))
    .join('\n');
}

// The known roles, revealed up front in watch mode (colored by role).
export function renderRoles(state: GameState): string {
  return state.players.map((p) => `  ${p.name}: ${roleColored(p.role)}`).join('\n');
}

// A single player's own cockpit — role, private knowledge, who's alive/dead.
export function renderPlayerView(view: PlayerView): string {
  const lines = [`You are ${bold(view.self.name)} — ${roleColored(view.self.role)}.`];

  if (view.self.role === 'werewolf') {
    lines.push(
      view.werewolfAllies.length > 0
        ? red(`Your werewolf allies: ${view.werewolfAllies.map((a) => a.name).join(', ')}`)
        : red('You are the lone werewolf.'),
    );
    if (view.wolfChat.length > 0) {
      lines.push(dim('Pack discussion:'));
      for (const m of view.wolfChat) lines.push(dim(`  ${m.speaker}: ${m.text}`));
    }
    if (view.wolfVotes.length > 0) {
      lines.push(dim('Pack kill votes so far:'));
      for (const v of view.wolfVotes) lines.push(dim(`  ${v.voter} → ${v.target}`));
    }
  }
  if (view.self.role === 'seer') {
    if (view.seerFindings.length > 0) {
      lines.push(magenta('You have learned:'));
      for (const f of view.seerFindings) lines.push(magenta(`  ${f.player.name} is a ${ROLE_META[f.role].displayName}`));
    } else {
      lines.push(magenta('You have not investigated anyone yet.'));
    }
  }
  if (view.self.role === 'witch' && view.witchPotions) {
    const heal = view.witchPotions.heal ? 'available' : 'used';
    const poison = view.witchPotions.poison ? 'available' : 'used';
    lines.push(cyan(`Potions — healing: ${heal}, poison: ${poison}`));
  }

  lines.push(`${green('Alive')}: ${view.alive.map((p) => p.name).join(', ')}`);
  if (view.dead.length > 0) {
    lines.push(dim(`Dead: ${view.dead.map((p) => `${p.name} (${ROLE_META[p.role].displayName})`).join(', ')}`));
  }
  return lines.join('\n');
}

// The end-of-game summary: winner and the full role reveal.
export function renderOutcome(state: GameState): string {
  const lines = ['', bold('═══════════ GAME OVER ═══════════')];
  if (state.phaseData.phase === 'game-over') {
    const winner = state.phaseData.winner;
    const paint = winner === 'werewolves' ? red : green;
    lines.push(paint(bold(`Winner: ${winner}`)));
  }
  lines.push('', dim('Final roles:'));
  for (const p of state.players) {
    lines.push(`  ${p.name}: ${roleColored(p.role)}${p.isAlive ? '' : dim(' — dead')}`);
  }
  return lines.join('\n');
}
