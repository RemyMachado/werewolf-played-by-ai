import { GameState } from '../types/game';
import { GameObserver } from '../game/orchestrator';
import { NpcObserver } from '../npc/npc-controller';
import { ROLE_META } from '../game/roles';
import { renderLogEntry, roleEmoji } from './render';
import { Say } from './narrator';
import { dim, yellow } from './style';

// Renders an NPC's private turn: a 💭 line tagged with the player's role emoji and
// their private reasoning, then a 📝 line with the memory note they chose to keep.
// Preceded by a blank line so each cognitive turn is visually separated. Names sit
// after a PLAIN space so the narrator can color them. Watch/eval only (roles are
// already revealed there) — never wired in human play, so it can't leak roles.
export function createThoughtObserver(say: Say): NpcObserver {
  return ({ player, role, reasoning, memory, note }) => {
    const thought =
      '\n' + dim('      💭') + roleEmoji(role) + ' ' + player + dim(':') + ' ' + reasoning + (note ? ' ' + dim(`[${note}]`) : '');
    // Only some turns update memory (the seer's pick, for one, does not).
    const memoryLine = memory ? '\n' + dim('      📝 memory:') + ' ' + memory : '';
    say(thought + memoryLine);
  };
}

// Streams new public log entries through `say` (which colors names). When
// revealPrivate is set, also prints dim [private] notes for otherwise-hidden info
// (seer findings, the wolves' night discussion) — for watch/eval, never a human.
export function createLogObserver(say: Say, revealPrivate: boolean): GameObserver {
  let printed = 0;
  let debateRound = 1;
  let wolfChatShown = 0;
  let killTargetShown = false;
  let healShown = false;
  let poisonShown = false;
  const shownFindings = new Set<string>();
  const name = (state: GameState, id: string) => state.players.find((p) => p.id === id)?.name ?? id;

  return (state: GameState) => {
    for (const entry of state.log.slice(printed)) say(renderLogEntry(entry, state.players, revealPrivate));
    printed = state.log.length;

    // Announce a new reaction round (round 1's "· debate ·" banner comes from the
    // phase-change entry). This is public, so it shows in both watch and human play.
    if (state.phaseData.phase === 'day-debate') {
      if (state.phaseData.round !== debateRound) {
        debateRound = state.phaseData.round;
        if (debateRound > 1) say('\n' + yellow(`   · debate · reaction round ${debateRound}`));
      }
    } else {
      debateRound = 1; // reset for the next day
    }

    if (!revealPrivate) return;

    // Names must be preceded by a PLAIN space (not an ANSI reset) for the
    // narrator's word-boundary match to color them — keep the dim markers separate.
    for (const m of state.wolfChat.slice(wolfChatShown)) {
      say(dim('      🐺') + ' ' + name(state, m.wolfId) + dim(' → pack:') + ' ' + m.text);
    }
    wolfChatShown = state.wolfChat.length;

    // The witch acts last each night; her potions are revealed live (the heal is
    // otherwise invisible, leaving a silent night). Phase is still 'night' here —
    // these notes are emitted from runWitch before resolveNight applies them.
    const witch = state.players.find((p) => p.role === 'witch');
    if (state.phaseData.phase === 'night') {
      const { pendingHeal, pendingKillTarget, pendingPoison } = state.phaseData;
      // The wolves' chosen victim — otherwise only inferable from their thoughts, and
      // invisible entirely on a night the witch heals (no death results).
      if (pendingKillTarget && !killTargetShown) {
        killTargetShown = true;
        say(dim('      🐺 the werewolves target:') + ' ' + name(state, pendingKillTarget));
      }
      if (pendingHeal && pendingKillTarget && !healShown) {
        healShown = true;
        say(dim('      🧪') + ' ' + (witch?.name ?? '') + dim(' saved') + ' ' + name(state, pendingKillTarget) + dim(' with the healing potion'));
      }
      if (pendingPoison && !poisonShown) {
        poisonShown = true;
        say(dim('      ☠️') + ' ' + (witch?.name ?? '') + dim(' poisoned') + ' ' + name(state, pendingPoison));
      }
    } else {
      killTargetShown = false; // reset for the next night
      healShown = false;
      poisonShown = false;
    }

    const seer = state.players.find((p) => p.role === 'seer');
    for (const [targetId, role] of Object.entries(state.seerKnowledge)) {
      if (shownFindings.has(targetId)) continue;
      shownFindings.add(targetId);
      say(dim('      🔮') + ' ' + (seer?.name ?? '') + dim(' learned:') + ' ' + name(state, targetId) + dim(` is a ${ROLE_META[role].displayName}`));
    }
  };
}
