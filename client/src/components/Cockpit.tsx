import { PlayerView, Role } from '../types';
import { roleLabel } from '../format';

type Props = { view: PlayerView | null };

const ROLE_ORDER: Role[] = ['werewolf', 'seer', 'witch', 'villager'];

// The human's private cockpit: their own role and whatever their role legitimately
// knows. Everything here comes from buildPlayerView, the server's hidden-info
// boundary — living players' roles are never present.
export function Cockpit({ view }: Props) {
  if (!view) return <aside className="cockpit empty">No game yet.</aside>;

  const remaining = ROLE_ORDER.filter((r) => view.composition[r] > 0).map((r) => {
    const dead = view.dead.filter((d) => d.role === r).length;
    return `${roleLabel(r)}: ${view.composition[r] - dead}/${view.composition[r]}`;
  });

  return (
    <aside className="cockpit">
      <h2>
        {view.self.name} <span className="role">{roleLabel(view.self.role)}</span>
      </h2>
      <div className="meta">Round {view.round}</div>

      <section>
        <h3>Roles remaining</h3>
        <ul className="flat">
          {remaining.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Alive ({view.alive.length})</h3>
        <ul className="flat">
          {view.alive.map((p) => (
            <li key={p.id} className={p.id === view.self.id ? 'self' : undefined}>
              {p.name}
            </li>
          ))}
        </ul>
      </section>

      {view.dead.length > 0 && (
        <section>
          <h3>Dead</h3>
          <ul className="flat">
            {view.dead.map((p) => (
              <li key={p.id}>
                {p.name} <span className="muted">— {roleLabel(p.role)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.seerFindings.length > 0 && (
        <section>
          <h3>Your findings</h3>
          <ul className="flat">
            {view.seerFindings.map((f) => (
              <li key={f.player.id}>
                {f.player.name} <span className="muted">is a {roleLabel(f.role)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.werewolfAllies.length > 0 && (
        <section>
          <h3>Your pack</h3>
          <ul className="flat">
            {view.werewolfAllies.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </section>
      )}

      {view.witchPotions && (
        <section>
          <h3>Potions</h3>
          <ul className="flat">
            <li>Healing: {view.witchPotions.heal ? 'available' : 'used'}</li>
            <li>Poison: {view.witchPotions.poison ? 'available' : 'used'}</li>
          </ul>
        </section>
      )}
    </aside>
  );
}
