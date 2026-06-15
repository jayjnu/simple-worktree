import { cleanupWorktree, createWorktree, initConfig } from '../core/index.js';
import type { RuntimePort } from '../core/ports.js';
import { parseCliCommand } from './arguments.js';
import type { CliOutputPort } from './types.js';

export interface RunCliOptions {
  args: string[];
  binName: string;
  createRuntime: () => RuntimePort;
  stdout: CliOutputPort;
}

export function runCli(options: RunCliOptions): void {
  const command = parseCliCommand(options.args, options.binName);

  if (command.kind === 'help') {
    options.stdout.write(command.text);
    return;
  }

  const runtime = options.createRuntime();

  if (command.kind === 'create') {
    createWorktree(command.options, runtime);
    return;
  }

  if (command.kind === 'cleanup') {
    cleanupWorktree(command.options, runtime);
    return;
  }

  initConfig(command.options, runtime);
}
