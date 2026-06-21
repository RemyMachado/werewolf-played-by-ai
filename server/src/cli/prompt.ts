import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export type Choice<T> = { label: string; value: T };

// Thin wrapper over readline: free text, numbered single-choice menus (with
// re-prompt on invalid input), and plain printing. Owns all stdin/stdout.
export class Prompter {
  private readonly rl = readline.createInterface({ input, output });

  async text(question: string): Promise<string> {
    const answer = await this.rl.question(`${question} `);
    return answer.trim();
  }

  async select<T>(question: string, choices: Choice<T>[]): Promise<T> {
    if (choices.length === 0) throw new Error('select called with no choices');
    const menu = choices.map((c, i) => `  ${i + 1}) ${c.label}`).join('\n');
    for (;;) {
      const raw = await this.rl.question(`${question}\n${menu}\n> `);
      const n = Number(raw.trim());
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
        return choices[n - 1].value;
      }
      output.write(`Please enter a number between 1 and ${choices.length}.\n`);
    }
  }

  print(text: string): void {
    output.write(text + '\n');
  }

  close(): void {
    this.rl.close();
  }
}
