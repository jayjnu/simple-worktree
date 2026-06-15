import type { RuntimePort } from '../core/ports.js';

export function runHooks(commands: string[], hookName: string, cwd: string, runtime: RuntimePort): void {
  for (const command of commands) {
    if (!command) continue;
    runtime.logger.info(`▶ ${hookName}: ${command}`);
    runtime.commandRunner.run(command, { cwd });
  }
}
