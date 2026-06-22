import { useState } from 'react';
import { Role } from '../types';
import { roleCard } from '../assets/images';
import { RoleIcon } from '../assets/icons';
import { roleLabel } from '../format';

// Shows the generated role illustration, falling back to the inline SVG role icon if
// the image isn't present. Used for the self-role display, death reveals, and the
// game-over scoreboard.
export function RoleCard({ role, size = 96 }: { role: Role; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`role-card ${role}`} style={{ width: size }}>
      {failed ? (
        <div className="role-card-fallback" style={{ height: size }}>
          <RoleIcon role={role} />
        </div>
      ) : (
        <img src={roleCard(role)} alt={roleLabel(role)} width={size} onError={() => setFailed(true)} />
      )}
      <span className="role-card-label">{roleLabel(role)}</span>
    </div>
  );
}
