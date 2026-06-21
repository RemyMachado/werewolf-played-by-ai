import { useState } from 'react';
import { PromptChoice, PromptDto } from '../types';

type Props = {
  prompt: PromptDto;
  // For a select prompt, the choices that are NOT seats on the board (abstain,
  // don't-poison, …). Seat choices are picked by clicking a player at the table.
  extraChoices: PromptChoice[];
  hasSeatTargets: boolean;
  onAnswer: (value: string | null | boolean) => void;
};

// The action bar at the bottom: turns the current prompt into game controls.
export function ActionBar({ prompt, extraChoices, hasSeatTargets, onAnswer }: Props) {
  return (
    <div className="action-bar">
      <div className="action-question">{prompt.question}</div>

      {prompt.kind === 'select' && (
        <div className="action-controls">
          {hasSeatTargets && <span className="hint">👆 Click a player at the table</span>}
          {extraChoices.map((c) => (
            <button key={c.value} className="secondary" onClick={() => onAnswer(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {prompt.kind === 'text' && <TextAnswer onAnswer={onAnswer} />}

      {prompt.kind === 'confirm' && (
        <div className="action-controls">
          <button onClick={() => onAnswer(true)}>{prompt.confirmLabel}</button>
          <button className="secondary" onClick={() => onAnswer(false)}>
            {prompt.denyLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function TextAnswer({ onAnswer }: { onAnswer: (value: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="text-answer">
      <textarea
        autoFocus
        rows={2}
        value={text}
        placeholder="Say something… (or stay quiet)"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="action-controls">
        <button onClick={() => onAnswer(text)}>Speak</button>
        <button className="secondary" onClick={() => onAnswer('')}>
          Stay quiet
        </button>
      </div>
    </div>
  );
}
