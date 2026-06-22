import { nameHue } from './icons';

// A procedural gothic-villager portrait, drawn as layered SVG and seeded from the
// player's name so everyone is a distinct townsfolk — never a tinted disc, and never
// role-flavored (living roles stay hidden; the dead get their reveal elsewhere).

export type Expression = 'neutral' | 'talking' | 'worried' | 'smug';

// Muted, candlelit gothic palettes.
const SKIN = ['#e3c0a0', '#cf9e7e', '#b07d5a', '#8a5a3c', '#c2966f', '#9c6b4a'];
const CLOAK = ['#3b4a3a', '#4a3b2f', '#3a3f4d', '#4d3340', '#34464a', '#5a4632'];
const HAIR = ['#241e1b', '#43352a', '#6b5a44', '#7a7066', '#1b1917', '#5a4a3a'];

function fnv(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T,>(arr: T[], seed: number): T => arr[seed % arr.length];

export function personFromName(name: string) {
  const h = fnv(name);
  return {
    skin: pick(SKIN, h),
    cloak: pick(CLOAK, h >> 3),
    hair: pick(HAIR, h >> 6),
    hood: ((h >> 9) & 3) === 0, // ~1 in 4 wears a hood
    hue: nameHue(name),
  };
}

function Face({ expression }: { expression: Expression | 'dead' }) {
  if (expression === 'dead') {
    return (
      <g stroke="#15100e" strokeWidth={1.4} strokeLinecap="round" fill="none">
        <path d="M26 24l3 3M29 24l-3 3" />
        <path d="M35 24l3 3M38 24l-3 3" />
        <path d="M29 33q3-2 6 0" />
      </g>
    );
  }
  const mouth =
    expression === 'talking' ? (
      <ellipse cx={32} cy={31} rx={2} ry={1.7} fill="#3a201c" />
    ) : expression === 'worried' ? (
      <path d="M29 32q3 2 6 0" fill="none" stroke="#3a201c" strokeWidth={1.2} strokeLinecap="round" />
    ) : expression === 'smug' ? (
      <path d="M29 31q3 1.6 6-0.6" fill="none" stroke="#3a201c" strokeWidth={1.2} strokeLinecap="round" />
    ) : (
      <path d="M29 31h6" stroke="#3a201c" strokeWidth={1.2} strokeLinecap="round" />
    );
  return (
    <g>
      <circle cx={28} cy={25} r={1.3} fill="#15110f" />
      <circle cx={36} cy={25} r={1.3} fill="#15110f" />
      {expression === 'worried' && (
        <g stroke="#2a1e18" strokeWidth={1.2} strokeLinecap="round">
          <path d="M25 22l4 1.6" />
          <path d="M39 22l-4 1.6" />
        </g>
      )}
      {mouth}
    </g>
  );
}

export function Person({
  name,
  expression = 'neutral',
  dead = false,
}: {
  name: string;
  expression?: Expression;
  dead?: boolean;
}) {
  const p = personFromName(name);
  const id = `pp-${p.hue}`;
  return (
    <svg viewBox="0 0 64 64" className="person-svg" aria-hidden>
      <defs>
        <radialGradient id={id} cx="50%" cy="36%" r="78%">
          <stop offset="0%" stopColor={`hsl(${p.hue} 24% 26%)`} />
          <stop offset="100%" stopColor={`hsl(${p.hue} 30% 11%)`} />
        </radialGradient>
      </defs>
      <circle cx={32} cy={32} r={32} fill={`url(#${id})`} />
      {/* shoulders / cloak */}
      <path d="M8 64C10 50 20 44 32 44s22 6 24 20Z" fill={p.cloak} />
      <path d="M32 44l-6 12 6 4 6-4Z" fill="rgba(0,0,0,0.22)" />
      {/* neck + head */}
      <rect x={28} y={36} width={8} height={8} rx={3} fill={p.skin} />
      <ellipse cx={32} cy={26} rx={11} ry={12} fill={p.skin} />
      {/* hood or hair */}
      {p.hood ? (
        <path d="M18 28C18 11 46 11 46 28C46 21 40 15 32 15C24 15 18 21 18 28Z" fill={p.cloak} />
      ) : (
        <path d="M20 23C20 12 44 12 44 23C44 18 40 14 32 14C24 14 20 18 20 23Z" fill={p.hair} />
      )}
      <Face expression={dead ? 'dead' : expression} />
    </svg>
  );
}
