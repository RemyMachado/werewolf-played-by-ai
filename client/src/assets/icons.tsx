import { Role } from '../types';

// Hand-drawn SVG game assets, kept as React components so CSS can tint and animate
// them (they paint in currentColor). Roles, the day/night bodies, a death marker, and
// a generative player avatar coloured from the name.

type IconProps = { className?: string };
const BASE = { viewBox: '0 0 24 24', width: '1em', height: '1em' } as const;
const CUT = '#0b0c10'; // dark cut-outs (eyes, nose) read against any tint

export function VillagerIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4.2" />
      <path d="M3.5 21a8.5 8.5 0 0 1 17 0z" />
    </svg>
  );
}

export function WerewolfIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} fill="currentColor" aria-hidden>
      <path d="M3 2l5 4h8l5-4-1.5 7.5C19 14 16 18 12 18S5 14 4.5 9.5L3 2z" />
      <circle cx="9" cy="10" r="1.1" fill={CUT} />
      <circle cx="15" cy="10" r="1.1" fill={CUT} />
      <path d="M10.4 13h3.2L12 15z" fill={CUT} />
    </svg>
  );
}

export function SeerIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WitchIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} fill="currentColor" aria-hidden>
      <path d="M9 2h6v2h-1v4.2l4.2 8.1A3 3 0 0 1 15.5 21h-7A3 3 0 0 1 5.8 16.3L10 8.2V4H9z" />
      <circle cx="11" cy="15.5" r="1" fill={CUT} />
      <circle cx="13.8" cy="17.3" r="0.8" fill={CUT} />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} fill="currentColor" aria-hidden>
      <path d="M15 2A10 10 0 1 0 22 15 8 8 0 0 1 15 2z" />
    </svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" />
    </svg>
  );
}

export function SkullIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C7 2 3 5.8 3 10.5c0 2.7 1.3 5 3.5 6.4V20a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3.1c2.2-1.4 3.5-3.7 3.5-6.4C21 5.8 17 2 12 2z" />
      <circle cx="9" cy="11" r="1.7" fill={CUT} />
      <circle cx="15" cy="11" r="1.7" fill={CUT} />
      <path d="M11 15h2v3h-2z" fill={CUT} />
    </svg>
  );
}

const ROLE_ICON: Record<Role, (p: IconProps) => JSX.Element> = {
  villager: VillagerIcon,
  werewolf: WerewolfIcon,
  seer: SeerIcon,
  witch: WitchIcon,
};

export function RoleIcon({ role, className }: { role: Role; className?: string }) {
  const Icon = ROLE_ICON[role];
  return <Icon className={className} />;
}

// A stable hue from a name, so each player gets a consistent colour across the board.
export function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

// A generative circular portrait: a name-tinted gradient disc with a simple figure.
// Living players all look like anonymous townsfolk; their role is shown elsewhere only
// when it is legitimately known (self, or the dead).
export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const hue = nameHue(name);
  const id = `av-${hue}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="avatar-svg" aria-hidden>
      <defs>
        <radialGradient id={id} cx="50%" cy="32%" r="75%">
          <stop offset="0%" stopColor={`hsl(${hue} 62% 58%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 28) % 360} 55% 28%)`} />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${id})`} />
      <circle cx="32" cy="26" r="10" fill="rgba(255,255,255,0.92)" />
      <path d="M13 57c0-10.5 8.5-17 19-17s19 6.5 19 17z" fill="rgba(255,255,255,0.92)" />
    </svg>
  );
}
