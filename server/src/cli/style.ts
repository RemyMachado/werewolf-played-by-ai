// Minimal ANSI styling for the CLI. On when stdout is a TTY (or FORCE_COLOR is
// set, e.g. to pipe into `less -R`); off when NO_COLOR is set, so plain
// redirected output stays clean text.
const enabled = !process.env.NO_COLOR && (Boolean(process.stdout.isTTY) || Boolean(process.env.FORCE_COLOR));

function code(open: number): (s: string) => string {
  return (s) => (enabled ? `\x1b[${open}m${s}\x1b[0m` : s);
}

export const bold = code(1);
export const dim = code(2);
export const red = code(31);
export const green = code(32);
export const yellow = code(33);
export const blue = code(34);
export const magenta = code(35);
export const cyan = code(36);
export const gray = code(90);

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
const visibleLength = (s: string): string['length'] => stripAnsi(s).length;

function wrapWidth(): number {
  return Math.min(process.stdout.columns || 100, 100);
}

// Word-wraps long lines to a readable width, measuring VISIBLE length (ignoring
// ANSI color codes) and breaking only at spaces — so color codes and colored
// names (single words) are never split. Continuation lines get a hanging indent.
export function wrap(text: string, width = wrapWidth()): string {
  return text
    .split('\n')
    .map((line) => wrapLine(line, width))
    .join('\n');
}

function wrapLine(line: string, width: number): string {
  if (visibleLength(line) <= width) return line;
  const leading = line.match(/^[ \t]*/)?.[0] ?? '';
  const indent = leading + '  ';
  const words = line.slice(leading.length).split(' ').filter((w) => w.length > 0);

  const out: string[] = [];
  let current = leading;
  let currentLen = leading.length;
  for (const word of words) {
    const wordLen = visibleLength(word);
    if (currentLen > leading.length && currentLen + 1 + wordLen > width) {
      out.push(current);
      current = indent + word;
      currentLen = indent.length + wordLen;
    } else if (currentLen === leading.length) {
      current += word;
      currentLen += wordLen;
    } else {
      current += ' ' + word;
      currentLen += 1 + wordLen;
    }
  }
  out.push(current);
  return out.join('\n');
}
