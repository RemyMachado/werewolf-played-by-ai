import { Player, Role } from '../types/game';
import { ROLE_META } from '../game/roles';
import { PlayerView } from './view';

// Builds the system + user prompts for each NPC decision. Pure string functions:
// game knowledge in (already filtered through PlayerView), prompt text out.
//
// Design rule: prompts give the model FACTS and its GOAL, never a strategy. What
// to say, who to target, when to bluff or reveal — all of that is the model's
// call. We only ensure it has complete, grounded information to decide with.

const RULES = [
  'You are playing Werewolf, a social deduction game between two hidden teams: the Werewolves and the Villagers.',
  'NIGHT: everyone sleeps; certain roles secretly wake to act — the werewolves agree on one player to kill, and other special roles use their powers. Every night action is SECRET.',
  'DAY: everyone learns who died (and that dead player\'s true role is revealed to all), then the living players discuss and vote to eliminate one suspect. A tie triggers a runoff between the tied players; if the runoff also ties, no one is eliminated that day.',
  'The Villagers win when every Werewolf is eliminated. The Werewolves win as soon as they equal or outnumber the remaining players.',
].join('\n');

// Explains every role PRESENT in this game (from the composition) and — crucially —
// what each one does and does NOT know. Role abilities are public knowledge (everyone
// knows the game contains a Seer, a Witch, etc., and what they do); only WHO holds
// each role is hidden. Spelling this out stops confusions like a Seer assuming the
// werewolves can see her findings. Facts, not strategy.
function rolesInThisGame(view: PlayerView): string {
  const c = view.composition;
  const lines = ['THE ROLES IN THIS GAME — what each can do, and what they do/don\'t know:'];
  if (c.werewolf) {
    lines.push(
      '- Werewolf (werewolf team): the werewolves secretly know each other and together choose one player to kill each night. They want the villagers eliminated.',
    );
  }
  if (c.seer) {
    lines.push(
      '- Seer (village team): each night secretly learns ONE living player\'s true role. What the Seer learns is known ONLY to the Seer — no one else, not even the werewolves, sees it or even knows who the Seer is, unless the Seer chooses to reveal it.',
    );
  }
  if (c.witch) {
    lines.push(
      '- Witch (village team): holds two single-use potions — one HEAL that saves the wolves\' victim for a night, one POISON that kills any one player. Each night she secretly sees WHO the wolves are about to kill (but not that player\'s role). Her potions and choices are secret.',
    );
  }
  if (c.villager) {
    lines.push('- Villager (village team): no night power and no secret knowledge — only reasoning and the daytime vote.');
  }
  lines.push(
    'IMPORTANT — secret knowledge is PRIVATE. Each player knows only their OWN role and what their OWN power reveals. The werewolves know their fellow werewolves, but they do NOT know who the Seer or Witch is, nor what the Seer has discovered. No role automatically learns another player\'s role or another player\'s private information.',
  );
  return lines.join('\n');
}

function rosterBlock(view: PlayerView): string {
  return [
    ...view.alive.map((p) => `- ${p.name} (alive)`),
    ...view.dead.map((p) => `- ${p.name} (dead — was a ${ROLE_META[p.role].displayName})`),
  ].join('\n');
}

// A public-knowledge recap of the game's makeup: for each role, how many are still
// alive out of how many the game started with. Since a dead player's role is
// revealed, these counts are exact public facts (counts, not identities) — this just
// spares weak models the bookkeeping. NOT strategy — pure arithmetic everyone can do.
function compositionRecap(view: PlayerView): string {
  const c = view.composition;
  const deadByRole: Record<Role, number> = { villager: 0, werewolf: 0, seer: 0, witch: 0 };
  for (const d of view.dead) deadByRole[d.role]++;

  const line = (label: string, role: Role): string | null =>
    c[role] > 0 ? `- ${label}: ${c[role] - deadByRole[role]}/${c[role]}` : null;

  const lines = [
    line('Werewolves', 'werewolf'),
    line('Seer', 'seer'),
    line('Witch', 'witch'),
    line('Villagers', 'villager'),
  ].filter(Boolean);

  return [
    'ROLES REMAINING (still alive / total at game start) — exact public counts, since every dead player\'s role was revealed:',
    ...lines,
  ].join('\n');
}

function roleSection(view: PlayerView): string {
  switch (view.self.role) {
    case 'villager':
      return [
        'YOUR ROLE: Villager.',
        'You are an ORDINARY villager: you are NOT the Seer, NOT the Witch, and NOT a Werewolf. You have no night action and no secret knowledge of anyone\'s role. Never claim, hint at, or imagine that you hold a special role or power — you simply do not have one.',
        'Your only tools are your reasoning and your daytime vote.',
        'You win when every werewolf has been eliminated.',
      ].join('\n');
    case 'werewolf': {
      const allies =
        view.werewolfAllies.length > 0
          ? `Your fellow werewolves are: ${view.werewolfAllies.map((a) => a.name).join(', ')}. They know you too.`
          : 'You are the only werewolf.';
      return [
        'YOUR ROLE: Werewolf.',
        allies,
        'You ALREADY KNOW every werewolf — it is you and the packmate(s) named above, no one else. So never try to work out who the werewolves are, never suspect a packmate, and never accuse a player you know is not a werewolf of being one. That is the villagers\' problem, not yours.',
        'To everyone else you must pass as an ordinary villager. Each night the werewolves together choose one player to kill. Your side wins when the werewolves equal or outnumber the remaining players — so your aim is to avoid suspicion and get villagers eliminated, by whatever means you judge best.',
        'Some things to weigh (your call how to use them): do not all pile your votes onto one villager in an obvious bloc — coordinated voting is exactly what exposes a pack, and openly defending a packmate draws suspicion onto BOTH of you if either is caught. At night, the most dangerous villager to leave alive is usually the one others trust most or who reasons sharpest — often the Seer. Claiming to be the Seer yourself is a high-risk bluff a later reveal can expose.',
        'When the village turns on a packmate, pick ONE coherent line and make your WORDS and your VOTE match it: either back them — speak up in their defence AND vote to save them — or deliberately cut them loose (do not defend them, and vote with the village against them). Never do half of each — e.g. siding with their accuser out loud while still voting to protect them — that is the worst of both: your matching vote ties you two together while your words gave them no cover. Whichever you choose, your speech and your vote must tell the same story.',
      ].join('\n');
    }
    case 'seer': {
      const findings =
        view.seerFindings.length > 0
          ? view.seerFindings.map((f) => `- ${f.player.name} is a ${f.role}`).join('\n')
          : '- (nothing yet)';
      return [
        'YOUR ROLE: Seer.',
        'You are the ONLY Seer in this game. Never wonder who the Seer is, and never suspect another player of being the Seer — that is you. (Anyone else who claims to be the Seer is lying — almost certainly a werewolf.)',
        'Your investigations are completely SECRET: no other player — NOT EVEN the werewolves — knows what you have learned, or even that you are the Seer, unless you reveal it yourself. Never assume anyone else shares your knowledge.',
        'Each night you secretly learn one player\'s true role. These facts are CERTAIN. What you have confirmed so far:',
        findings,
        'Treat everyone you have confirmed as settled fact — never doubt, suspect, or vote against a player you confirmed innocent, and never trust one you confirmed is a werewolf.',
        'You are the village\'s only source of hard facts — powerful, but only if you use it. Each day, weigh how to play what you know: push the vote toward someone you have CONFIRMED is a werewolf, defend or vouch for a player you have cleared when suspicion turns on them unfairly, drop a careful hint, or stay hidden for now. The trade-offs are real — openly claiming to be the Seer makes you the werewolves\' top target the very next night, but sitting silently on what you know lets confirmed wolves survive and your cleared allies get lynched. The choice and the timing are entirely yours.',
        'Your whole edge is CERTAINTY, so lean on what you have actually confirmed rather than guessing on hunches like everyone else. Do not lead or join a lynch of a player you know nothing about on a vibe — if you have no confirmed werewolf to push yet, the most valuable thing you can do is keep investigating to FIND one (look at your strongest still-unknown suspects), not gamble the village\'s vote.',
        'You win when every werewolf has been eliminated.',
      ].join('\n');
    }
    case 'witch': {
      const potions = view.witchPotions ?? { heal: false, poison: false };
      const status = `Potions remaining — healing: ${potions.heal ? 'YES' : 'used'}, poison: ${potions.poison ? 'YES' : 'used'}.`;
      return [
        'YOUR ROLE: Witch (on the village team).',
        'Each night, AFTER the werewolves choose, you secretly learn who they are about to kill. You hold two potions, each usable only ONCE the entire game:',
        '- a HEALING potion that saves the wolves\' victim that night (you may even save yourself);',
        '- a POISON potion that kills any one player you choose.',
        'You may use both, either, or neither on a given night. Spend them wisely — once a potion is gone it is gone.',
        status,
        'On HEALING: your one save is most valuable spent on the SEER — the village\'s only source of hard facts. The wolves tend to kill whoever threatens them most, so their victim is often the Seer; if tonight\'s target looks like the Seer (they claimed it, or have been acting on real information), saving them is usually the strongest move. Saving an ordinary villager is rarely worth the potion. Only once the Seer is already dead (the role counts above tell you) does saving the next victim become worthwhile.',
        'On POISON: spent on a villager it only helps the wolves, so keep it for a player you have hard, specific reason to believe is a werewolf. The targets and timing are yours.',
        'Your role and your potion use are secret. Revealing you are the Witch can make you a target. You win when every werewolf has been eliminated.',
      ].join('\n');
    }
  }
}

export function systemPrompt(view: PlayerView): string {
  return [
    `You are ${view.self.name}, a player in a game of Werewolf.`,
    '',
    RULES,
    '',
    rolesInThisGame(view),
    '',
    `It is round ${view.round}.`,
    'THE PLAYERS (the only people in this game — never invent or mention anyone else):',
    rosterBlock(view),
    '',
    compositionRecap(view),
    '',
    roleSection(view),
    '',
    'HOW TO PLAY:',
    `- You ARE ${view.self.name}: in the roster and history, "${view.self.name}" is YOU, and the speeches and votes under that name are your own. Always reason and speak in the FIRST PERSON — never analyse yourself as a third party, and never refer to your own role in the third person (if you are the Seer, it was YOU who investigated).`,
    '- Play to win for your side, and plan ahead. Anything goes — deception, bluffing, alliances, revealing or hiding what you know, even sacrificing an ally — if it helps you win. There is no required strategy.',
    '- Your PRIVATE knowledge is certain fact (your own role, your packmates if you are a werewolf, any role the Seer has confirmed), so never reason against it — a werewolf already knows every wolf and never wonders who they are. Base everything else ONLY on what has actually happened (you see the full history): never invent events, votes, or behaviour, and never guess a role from a player\'s NAME or any outside/real-world knowledge. If nothing has happened yet, say you have nothing to go on rather than making things up.',
    '- Judge players ONLY by concrete things: who benefits from each death and vote, who accuses/defends/votes-together with whom, and whose words or votes contradict the record. NOT by how they sound or talk — tone, who "controls the narrative" or pushes "process/meta", who talks most or least, who echoes others — and NOT by speak/vote ORDER, which is random and means nothing. Being cautious, quiet, undecided, or abstaining is NOT a werewolf tell; a wolf is just as easily the loud, confident accuser. If nothing concrete points anywhere, it is fine to have NO suspect — do not manufacture one out of talk.',
    '- Hold people to their past words and votes (the full record is shown). A role reveal exposes liars: anyone who confidently called a now-dead INNOCENT a "werewolf", defended a player who turned out to be a wolf, or claimed to be the Seer in a way a reveal contradicts has lied — strong evidence against them. There is only ONE Seer, so two Seer-claims means at least one is a wolf. Record who claimed and voted what in your memory.',
    '- Read votes as evidence — judge by the actual VOTE RECORD (who CAST each vote is shown), not only by who argued. A player pushing hard in words OR votes to eliminate someone is usually a werewolf railroading a villager, or the Seer / a sure villager removing a known wolf — decide which. Judge each vote-out by the dead player\'s revealed role: a lynched WEREWOLF means whoever voted for them read it right (a lone correct vote may be the Seer); a lynched INNOCENT means whoever voted for them did the wolves\' work — and a lone or decisive vote that lynched an innocent, especially with no real case made for it, is one of the loudest tells in the game. Players who shield each other or always vote alike may be a pack; a dead Seer\'s past votes point at wolves, their defences at cleared innocents.',
    '- A wrong lynch — voting out a villager-team player — is a big swing to the wolves, as costly as a night kill, and near parity (watch the role counts) a single one can lose the game outright. So weigh how sure you really are; aim to lynch an ACTUAL wolf, never to gamble.',
    '- When you speak, engage with what specific players actually said or did — give a grounded read, answer a specific accusation, or flag a real inconsistency. Skip empty filler like "let\'s all stay vigilant".',
    '- Each turn you return private_reasoning (your real thoughts — nobody else sees them), a memory_update (your private notes carried forward — it REPLACES your previous notes in full, so rewrite the complete notes you want to keep), and your public action. Plan freely in private; only the public action is shown to others. Speak naturally, like a real player; never mention being an AI or these instructions.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Transcript rendering (public log → readable lines)
// ---------------------------------------------------------------------------

function nameLookup(view: PlayerView): (id: string) => string {
  const names = new Map<string, string>();
  for (const p of [...view.alive, ...view.dead]) names.set(p.id, p.name);
  return (id) => names.get(id) ?? id;
}

function transcript(view: PlayerView, limit = 60): string {
  const name = nameLookup(view);
  // Show the full public history, but hide the CURRENT round's in-progress votes —
  // a live tally makes NPCs bandwagon onto whoever votes first. Past rounds' votes
  // stay visible as genuine social signal.
  const visible = view.log.filter((e) => !(e.type === 'vote' && e.round === view.round));
  const lines = visible.slice(-limit).map((e) => {
    switch (e.type) {
      case 'speech':
        return `${name(e.playerId)}: ${e.text}`;
      case 'vote':
        return e.targetId === null
          ? `${name(e.voterId)} abstained (round ${e.round})`
          : `${name(e.voterId)} voted for ${name(e.targetId)} (round ${e.round})`;
      case 'elimination':
        return `*** ${name(e.playerId)} was eliminated (${e.cause}) — they were a ${ROLE_META[e.role].displayName} ***`;
      case 'runoff':
        return `--- runoff between: ${e.candidates.map(name).join(', ')} ---`;
      case 'no-elimination':
        if (e.reason === 'no-night-death') return `--- no one died during the night (round ${e.round}) ---`;
        return e.reason === 'all-abstained'
          ? `--- no one was eliminated this day: everyone abstained (round ${e.round}) ---`
          : `--- no one was eliminated this day: the runoff still tied (round ${e.round}) ---`;
      case 'phase-change':
        return `--- ${e.phase} (round ${e.round}) ---`;
    }
  });
  return lines.length > 0 ? lines.join('\n') : '(nothing has happened yet)';
}

const names = (options: Player[]): string => options.map((p) => p.name).join(', ');

// The public history for a prompt. On the opening night there is none, so say so
// plainly and explicitly (the bare "(nothing has happened yet)" wasn't enough to
// stop the model inventing events) — state the facts of the situation, not what to do.
function gameSoFar(view: PlayerView): string {
  if (view.round === 1) {
    return 'This is the opening night — the game has only just begun. No one has spoken, voted, or done anything yet, and the werewolves are the very first to act. There is no behaviour to judge and nothing to deduce from.';
  }
  return transcript(view);
}

// A neutral, factual reminder of the player's private knowledge, surfaced at the
// moment of a decision because models under-weight system-prompt facts. Facts
// only — no advice on how to use them. Empty for a plain villager.
function privateReminder(view: PlayerView): string {
  if (view.self.role === 'seer' && view.seerFindings.length > 0) {
    return `Reminder — you have secretly confirmed: ${view.seerFindings
      .map((f) => `${f.player.name} = ${f.role}`)
      .join('; ')}.`;
  }
  if (view.self.role === 'werewolf' && view.werewolfAllies.length > 0) {
    const allies = view.werewolfAllies.map((a) => a.name).join(', ');
    const are = view.werewolfAllies.length > 1 ? 'are your fellow werewolves' : 'is your fellow werewolf';
    return `Reminder — ${allies} ${are} and your ally. You KNOW they are not a threat, so never genuinely suspect them or call them suspicious. (You may throw an ally under the bus as a deliberate ploy, but never out of real confusion about their role.)`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Decision prompts
//
// Each builder takes the player's current private memory and ends with the JSON
// shape for that decision. Every shape includes private_reasoning + memory_update;
// the action field is public_message / target / vote (+ intended_vote on speeches).
// ---------------------------------------------------------------------------

function packDiscussion(view: PlayerView, emptyLabel: string): string {
  // Only TONIGHT's discussion — wolfChat persists across nights, and showing old
  // nights' messages as "the discussion so far" makes the conversation feel disjointed.
  const tonight = view.wolfChat.filter((m) => m.round === view.round);
  return tonight.length > 0 ? tonight.map((m) => `${m.speaker}: ${m.text}`).join('\n') : emptyLabel;
}

export function memorySection(memory: string): string {
  return `Your private notes so far (only you can see these):\n${memory.trim() ? memory : '(empty — nothing noted yet)'}`;
}

const REASONING_AND_MEMORY =
  '"private_reasoning": "a few sentences of genuine analysis — who benefits, what is inconsistent, who is aligned — and commit to a read rather than saying it is too early", "memory_update": "your COMPLETE updated private notes. This REPLACES your previous notes entirely, so re-include everything you still want to remember (condense or reorganise freely) — not just what is new"';

export function nightTalkPrompt(view: PlayerView, memory: string): string {
  return [
    'It is NIGHT. You are talking secretly with your fellow werewolves to decide tonight\'s kill. Only the werewolves hear this.',
    'What has happened in the game so far:',
    gameSoFar(view),
    '',
    'Your pack\'s discussion TONIGHT so far:',
    packDiscussion(view, '(you are first to speak)'),
    '',
    memorySection(memory),
    '',
    'In one or two sentences, RESPOND to your packmates above: answer any question they asked, react to a target someone proposed, and push toward agreeing on tonight\'s kill. Build on what was just said — do not monologue or repeat points already made. If you are first to speak, open with a concrete proposal.',
    `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "public_message": "<what you say to your pack>"}.`,
  ].join('\n');
}

export function nightKillPrompt(view: PlayerView, memory: string, options: Player[]): string {
  const parts = [
    'It is NIGHT. Cast your vote for whom the pack should kill.',
    'What has happened in the game so far:',
    gameSoFar(view),
    '',
    'Your pack\'s discussion so far:',
    packDiscussion(view, '(no discussion)'),
    '',
    memorySection(memory),
    '',
  ];
  if (view.round === 1) {
    parts.push(
      'It is the FIRST night — no one has spoken, voted, or done anything, so you have no real reason to prefer one target over another. Just pick someone; do NOT invent a justification (do not guess roles from names or anything outside the game).',
      '',
    );
  }
  parts.push(
    `You may target: ${names(options)}.`,
    `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "target": "<exact player name>"}.`,
  );
  return parts.join('\n');
}

export function witchHealPrompt(view: PlayerView, memory: string, victimName: string, isSelf: boolean): string {
  const parts: string[] = isSelf
    ? [
        'It is NIGHT. As the Witch, you have secretly learned that the werewolves are about to kill YOU tonight.',
        'This is your OWN life — and unlike with anyone else, you know exactly who you are and your own value. If you do nothing you die now: the village loses its Witch and your unused potion is gone with you.',
      ]
    : [
        'It is NIGHT. As the Witch, you have secretly learned that the werewolves are about to kill this player tonight:',
        `>>> ${victimName} <<<`,
        'Their true role is not revealed to you — you do not know it for certain.',
      ];
  parts.push('What has happened in the game so far:', gameSoFar(view), '', memorySection(memory), '');

  // The "uninformed random victim" framing applies ONLY to saving someone else on
  // night 1 — never to saving yourself, where you fully know who is at stake.
  if (isSelf) {
    if (view.round === 1) {
      parts.push(
        'NOTE — it is the FIRST night, so you know nothing about the OTHER players yet. But that uncertainty does not apply to you: it is you the wolves are about to kill, and you know your own role and worth. Whether to spend your one healing potion to save your own life is your call.',
        '',
      );
    }
  } else if (view.round === 1) {
    parts.push(
      `NOTE — it is the FIRST night. The wolves picked ${victimName} with no information (essentially at random), and no one has spoken or acted yet, so you know nothing about who ${victimName} is or whether they matter. Healing now spends your single once-per-game potion on an unknown player, and since your action is secret it signals nothing to anyone. The choice is still entirely yours.`,
      '',
    );
  } else {
    parts.push(
      `You may not know ${victimName}'s role for certain, but you are not in the dark: weigh whether they are worth saving from what they have actually said and done so far — their claims, their votes, who they have helped, accused, or been cleared by. The wolves chose to kill them for a reason; consider what that target choice suggests too.`,
      '',
    );
  }
  parts.push(
    isSelf
      ? 'You may use your one HEALING potion to save yourself tonight, or skip it. The potion works only once the whole game: if you use it now you will not have it later. Decide for yourself whether your own survival is worth spending it.'
      : 'You may use your one HEALING potion to save them tonight, or skip it. The potion works only once the whole game: if you use it now you will not have it later. Decide for yourself whether saving this particular player is worth spending it.',
    `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "heal": "save" or "skip"}.`,
  );
  return parts.join('\n');
}

export function witchPoisonPrompt(view: PlayerView, memory: string, options: Player[]): string {
  const parts = [
    'It is NIGHT. As the Witch, you may use your one POISON potion to kill a player, or save it for a better moment.',
    'What has happened in the game so far:',
    gameSoFar(view),
    '',
    memorySection(memory),
    '',
  ];
  if (view.round === 1) {
    parts.push(
      'NOTE — it is the FIRST night. No one has spoken, voted, or done anything, so you have no information about anyone\'s role: poisoning now would be a blind guess that just as likely kills a fellow villager. The choice is still entirely yours.',
      '',
    );
  }
  parts.push(
    'The poison kills whoever you pick, whatever their role — if they turn out to be a villager, that loss helps the werewolves. The potion works only once the whole game; choosing "none" keeps it for later. Decide for yourself whether to spend it now and on whom.',
    `You may poison: ${names(options)}, or choose "none".`,
    `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "target": "<a player name, or none>"}.`,
  );
  return parts.join('\n');
}

export function investigationPrompt(view: PlayerView, memory: string, options: Player[]): string {
  return [
    'It is NIGHT. As the Seer, choose one player to investigate.',
    'What has happened in the game so far:',
    gameSoFar(view),
    '',
    memorySection(memory),
    '',
    'Investigate where it tells you the most: a living player whose role you do not yet know — a strong suspect, or an influential voice you cannot yet place. There is no value in re-checking someone you have already confirmed.',
    'IMPORTANT: you do NOT know the result yet — you will be told their true role only AFTER you choose. So do not guess or state a result now; just pick who to look at and why.',
    `You may investigate: ${names(options)}.`,
    // Note: memory_update here is just your choice rationale; you will update your real
    // notes once you see the result.
    `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "target": "<exact player name>"}.`,
  ].join('\n');
}

// The seer's reflection AFTER her investigation resolves: she is told the true role
// she uncovered and records what it means. This is where her investigation memory is
// written — never before, when the result did not yet exist.
export function investigationResultPrompt(view: PlayerView, memory: string, targetName: string, roleName: string): string {
  return [
    `It is NIGHT. You used your Seer power and have now learned the truth:`,
    `>>> ${targetName} is a ${roleName}. <<<`,
    'This is a CERTAIN fact you now know for the rest of the game.',
    'What has happened in the game so far:',
    gameSoFar(view),
    '',
    memorySection(memory),
    '',
    `Reflect privately on what this confirmed role means for you: does it confirm or break a suspicion, who can you now trust or must you stop trusting, and how (and when) might you use this knowledge? Record the finding and your takeaway in your notes. This is private thought ONLY.`,
    `Respond ONLY as JSON: {${REASONING_AND_MEMORY}}.`,
  ].join('\n');
}

// Guard for the first day: the night-1 kill is uninformative and nobody has acted
// yet, so curb fabricated suspicion and relax the "don't hedge" push for this day.
function firstDayNote(): string {
  return 'NOTE — it is the FIRST day. The werewolves\' night victim was chosen with no information (essentially at random), so who died tells you NOTHING about who the werewolves are. This is the first real conversation, so there is very little to deduce yet: it is completely fine to say you have little to go on and NOT force an accusation. Never invent suspicions, and never claim a player said or did something earlier — no one acted before now. Reason only from what is actually said in this debate.';
}

// `reactionRound` is true for the 2nd and later debate passes of the day: everyone
// has already had an opening say, so this turn is for RESPONDING — and a player who
// has nothing to add may stay silent (an empty public_message).
export function speechPrompt(view: PlayerView, memory: string, reactionRound: boolean): string {
  const reminder = privateReminder(view);
  const parts = ['It is the DAY debate. What has happened so far:', transcript(view)];
  if (view.round === 1 && !reactionRound) parts.push('', firstDayNote());
  if (reminder) parts.push('', reminder);
  parts.push('', memorySection(memory));
  if (reactionRound) {
    parts.push(
      '',
      `Everyone has already had their say today — this is a REACTION round, ONLY for adding something genuinely NEW: a fresh accusation, a defence against a point aimed at you, or a contradiction you have spotted. Do NOT repeat your earlier statement or just agree with the room again.`,
      `If you have nothing genuinely new to add, set "contribution" to "pass" and leave public_message empty — most reaction turns add nothing, so passing is the normal, expected outcome, not a failure. Only set "contribution" to "speak" when you truly have a new point to make. Whether you speak or pass, note who you currently lean toward voting for (or "undecided").`,
      `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "contribution": "speak" or "pass", "public_message": "<your reply if you speak; empty if you pass>", "intended_vote": "<a player name or undecided>"}.`,
    );
  } else if (view.round === 1) {
    parts.push(
      '',
      `It is your turn to speak to the group as ${view.self.name}. Give your honest first impression. With no real information yet, it is FINE — and correct — to say you have little to go on; do NOT invent a suspect, and do NOT treat how people are talking (who "leads", who is cautious, who echoes others) as a reason to suspect them. Note who you lean toward, or "undecided".`,
      `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "public_message": "<what you say out loud>", "intended_vote": "<a player name or undecided>"}.`,
    );
  } else {
    parts.push(
      '',
      `It is your turn to speak to the group as ${view.self.name}. Say one to three sentences with REAL content — point at a specific player and your reason (grounded in their votes, claims, or a contradiction — NOT in how they talk), defend yourself against a specific accusation, or flag an inconsistency you noticed. Avoid empty hedging like "let's stay vigilant". Also note who you currently lean toward voting for (or "undecided").`,
      `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "public_message": "<what you say out loud>", "intended_vote": "<a player name or undecided>"}.`,
    );
  }
  return parts.join('\n');
}

export function votePrompt(view: PlayerView, memory: string, options: Player[], isRunoff: boolean): string {
  const reminder = privateReminder(view);
  const parts = [
    isRunoff
      ? 'It is a RUNOFF vote between the tied players. Choose one of them to eliminate.'
      : 'It is the VOTE. Choose one player to eliminate.',
    'Discussion so far:',
    transcript(view),
  ];
  if (view.round === 1) parts.push('', firstDayNote());
  if (reminder) parts.push('', reminder);
  parts.push('', memorySection(memory));
  // Applies to EVERYONE: a style-based accusation is weak play from any role (a wolf
  // doing it just exposes itself), so this is a universal reasoning-quality rule, not
  // village-only strategy.
  parts.push(
    '',
    'Before you choose: a vote should rest on something CONCRETE — a vote, a claim, a contradiction, a confirmed role — never on how someone talks. Do not vote anyone out merely for being cautious, quiet, undecided, abstaining, or "focused on process"; that is weak, unconvincing reasoning no matter who makes it. And if nothing concretely points to a specific player, it is completely fine to have no one to accuse — abstaining is then a legitimate choice, not a failure to take part.',
  );
  parts.push(
    '',
    `You may vote for: ${names(options)}. You may also "abstain" if you would rather not cast a vote.`,
    `Respond ONLY as JSON: {${REASONING_AND_MEMORY}, "vote": "<a player name, or abstain>"}.`,
  );
  return parts.join('\n');
}

// A private reflection turn triggered after a death. No public message — just
// think about what the death (and revealed role) means and update your notes.
// Role-aware: village deduces, wolves reassess their position, seer leverages its
// certain knowledge. (Never reached for the opening-night kill — the orchestrator
// skips reflection at round 1, since that kill is random with nothing to deduce.)
// None of these script a move.
export function reflectionPrompt(
  view: PlayerView,
  memory: string,
  deceasedName: string,
  cause: 'vote' | 'night-kill' | 'poison',
): string {
  const question =
    view.self.role === 'werewolf'
      ? wolfReflection(deceasedName, cause)
      : view.self.role === 'seer'
        ? seerReflection(deceasedName, cause)
        : townReflection(deceasedName, cause);
  const reminder = privateReminder(view);
  const parts = [
    'A player has just died and their true role was revealed. Here is what has happened:',
    gameSoFar(view),
    '',
    memorySection(memory),
  ];
  if (reminder) parts.push('', reminder);
  parts.push('', question, `Respond ONLY as JSON: {${REASONING_AND_MEMORY}}.`);
  return parts.join('\n');
}

function seerReflection(deceasedName: string, cause: 'vote' | 'night-kill' | 'poison'): string {
  const know =
    'You already KNOW several players\' true roles for certain (listed above), and you are the only Seer. Anyone you have confirmed is SETTLED — never call them "unconfirmed" or stay suspicious of a player you cleared.';
  if (cause === 'poison') {
    return `${deceasedName} was POISONED by the Witch (a fellow villager) in the night; their role is now known. ${know} Did the Witch hit a werewolf (good) or waste the potion on a villager? Given what only you know, who is your strongest werewolf suspect, and is it time to use your knowledge? Update your notes. This is private thought ONLY.`;
  }
  if (cause === 'night-kill') {
    return `The werewolves killed ${deceasedName} in the night; their role is now known. ${know} Does this fit what you know — did they kill someone you had cleared (you have lost a known ally), or are they hunting threats (they may come for you next)? Given what only you know, who is your strongest werewolf suspect, and is it time to use your knowledge? Update your notes. This is private thought ONLY.`;
  }
  return `The village voted ${deceasedName} out; their role is now known. ${know} If you yourself pushed for or voted for ${deceasedName} and they turned out to be a werewolf, then YOUR judgement was just proven right in front of everyone — note who voted WITH you (potential allies) and who defended ${deceasedName} (now suspicious). Did anyone's earlier claim get exposed as a lie by this reveal? Given what only you know, who is your strongest werewolf suspect, and is it time to act on your knowledge? Update your notes. This is private thought ONLY.`;
}

function townReflection(deceasedName: string, cause: 'vote' | 'night-kill' | 'poison'): string {
  if (cause === 'poison') {
    return `${deceasedName} was POISONED by the Witch (one of your own villagers) in the night; their role is now known. Reflect privately: was ${deceasedName} actually a werewolf (a good kill that helps the village) or a villager (a wasted potion — the Witch was careless or fooled)? What does this tell you about who the Witch trusts? Reach a sharp takeaway about who the werewolves are. This is private thought ONLY.`;
  }
  if (cause === 'night-kill') {
    return `The werewolves killed ${deceasedName} in the night — you CANNOT see which players chose it, so do not pretend to know who "voted" for the kill. Their role is now known. Reflect privately: what does the wolves' CHOICE of target suggest — did they fear ${deceasedName} as the Seer, a sharp accuser, or a trusted voice? Does the revealed role change your read on who is left? Reach a sharp takeaway about who the werewolves are. This is private thought ONLY.`;
  }
  return `The village voted ${deceasedName} out; their role is now known. First read the actual VOTE RECORD (every vote is shown), not just who argued: exactly WHO cast a vote for ${deceasedName}, and was it a real majority or just one or two players? Then judge by the revealed role — if ${deceasedName} was a WEREWOLF, whoever VOTED for them read it correctly and is credible (a lone correct vote may be the Seer); if ${deceasedName} was an INNOCENT villager, whoever VOTED for them just did the wolves' work, and a lone or decisive vote that lynched an innocent — especially with little or no case made for it — is one of the loudest tells in the game, so treat those voters as prime suspects and remember them by name. Also: did this reveal prove anyone's earlier claim FALSE (a false werewolf-call, or a Seer claim it contradicts)? Record who voted how and who lied, and reach a sharp read on who the werewolves are. This is private thought ONLY.`;
}

function wolfReflection(deceasedName: string, cause: 'vote' | 'night-kill' | 'poison'): string {
  if (cause === 'poison') {
    return `${deceasedName} was POISONED in the night — this is the WITCH's doing, NOT your pack. So there is a Witch among the villagers and she has just spent a potion. Reflect privately AS A WEREWOLF: did she waste it on a villager, or did she hit one of your pack? How does losing ${deceasedName} change your position, and how worried should you be about the Witch? Update your notes. This is private thought ONLY.`;
  }
  if (cause === 'night-kill') {
    return `Your pack killed ${deceasedName} in the night — this was YOUR doing and you know exactly why, so there is no mystery to solve about who did it. Reflect privately AS A WEREWOLF: how will the village react to this kill, and is suspicion drifting toward you or a packmate? Did any villager get close to the truth? Who is the biggest danger to the pack now — a likely Seer, or a sharp accuser? Update your notes. This is private thought ONLY.`;
  }
  return `The village voted ${deceasedName} out. Reflect privately AS A WEREWOLF (you know your pack — this is not about working out who the wolves are). Did this go your way? If ${deceasedName} was one of your packmates, you are more exposed and down an ally — and crucially, whoever pushed that vote or voted for them SAW THROUGH your pack: that player is your most dangerous opponent and may well be the Seer, so note exactly who it was. Is suspicion now drifting toward you, and did anything threaten to expose your earlier lies? Who is the biggest danger to the pack to deal with next? Update your notes. This is private thought ONLY.`;
}
