import { PointerEvent, ReactNode } from 'react';

const MIN_W = 180;
const MAX_W = 560;

type Props = {
  side: 'left' | 'right';
  panelClass: string; // 'cockpit' | 'history' — keeps each panel's existing styling
  title: string;
  open: boolean;
  width: number;
  onToggle: () => void;
  onResize: (w: number) => void;
  children: ReactNode;
};

// A dockable side panel: collapsible to a thin strip (freeing the board) and resizable
// by dragging its inner edge. Width is owned by the parent so the grid track reflows
// with it. Both side panels share this — same behavior, one implementation.
export function SidePanel({ side, panelClass, title, open, width, onToggle, onResize, children }: Props) {
  if (!open) {
    return (
      <aside className={`side-panel collapsed ${side}`}>
        <button className="panel-toggle" onClick={onToggle} title={`Show ${title}`}>
          {side === 'left' ? '▸' : '◂'}
        </button>
      </aside>
    );
  }

  const startDrag = (e: PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startX;
      const delta = side === 'left' ? dx : -dx; // the right panel grows when dragged left
      onResize(Math.max(MIN_W, Math.min(MAX_W, startW + delta)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside className={`side-panel ${panelClass} ${side}`} style={{ width }}>
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        <button className="panel-toggle" onClick={onToggle} title={`Hide ${title}`}>
          {side === 'left' ? '◂' : '▸'}
        </button>
      </div>
      <div className="side-panel-body">{children}</div>
      <div className={`resize-handle ${side}`} onPointerDown={startDrag} />
    </aside>
  );
}
