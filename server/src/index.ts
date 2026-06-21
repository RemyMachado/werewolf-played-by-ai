// Server entry point — Phase 4 will wire up Express + WebSocket here.
// For now: smoke-test the game engine end-to-end.

import { startGame, recordSpeech, recordVote, resolveNight, setNightKillTarget, setNightInvestigateTarget } from './game/engine';
import { createGame } from './game/state';

const state0 = createGame({
  players: [
    { id: 'p1', name: 'Alice', isHuman: true },
    { id: 'p2', name: 'Bob', isHuman: false },
    { id: 'p3', name: 'Charlie', isHuman: false },
    { id: 'p4', name: 'Diana', isHuman: false },
    { id: 'p5', name: 'Eve', isHuman: false },
  ],
  werewolfCount: 1,
});

console.log('Roles assigned:');
for (const p of state0.players) {
  console.log(`  ${p.name}: ${p.role}`);
}

const werewolf = state0.players.find((p) => p.role === 'werewolf')!;
const seer = state0.players.find((p) => p.role === 'seer')!;
const villagers = state0.players.filter((p) => p.role === 'villager');

// Night 1
let state = startGame(state0);
console.log('\nPhase:', state.phaseData.phase);

state = setNightInvestigateTarget(state, seer.id, werewolf.id); // seer investigates werewolf
state = setNightKillTarget(state, werewolf.id, villagers[0].id); // werewolf kills first villager
state = resolveNight(state);
console.log('Phase after night:', state.phaseData.phase);
console.log('Seer knows:', state.seerKnowledge);
console.log('Alive:', state.players.filter((p) => p.isAlive).map((p) => p.name));

// Day debate
for (const p of state.players.filter((p) => p.isAlive)) {
  state = recordSpeech(state, p.id, `${p.name} says something.`);
}
console.log('Phase after speeches:', state.phaseData.phase);

// Day vote — everyone votes for the werewolf
for (const p of state.players.filter((p) => p.isAlive && p.id !== werewolf.id)) {
  state = recordVote(state, p.id, werewolf.id);
}
// Werewolf votes for a random alive player
const werewolfVoteTarget = state.players.find((p) => p.isAlive && p.id !== werewolf.id)!;
state = recordVote(state, werewolf.id, werewolfVoteTarget.id);

console.log('Final phase:', state.phaseData.phase);
if (state.phaseData.phase === 'game-over') {
  console.log('Winner:', state.phaseData.winner);
}
