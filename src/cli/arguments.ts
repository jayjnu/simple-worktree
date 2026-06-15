import { UsageError } from '../lib/errors.js';
import { renderCleanupHelp, renderCreateHelp, renderInitHelp, renderRootHelp } from './help.js';
import type { CleanupArgs, CliCommand, CreateArgs, InitArgs } from './types.js';

export function parseCliCommand(args: string[], bin: string): CliCommand {
  const [command, ...rest] = args;
  if (!command || command === '-h' || command === '--help') {
    return { kind: 'help', text: renderRootHelp(bin) };
  }

  if (command === 'create') return parseCreateArgs(rest, bin);
  if (command === 'cleanup') return parseCleanupArgs(rest, bin);
  if (command === 'init') return parseInitArgs(rest, bin);

  throw new UsageError(`unknown command: ${command}`);
}

function parseCreateArgs(args: string[], bin: string): CliCommand {
  let configPath = '.worktree.yaml';
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--config') {
      const value = args[++index];
      if (!value) throw new UsageError('--config requires a path');
      configPath = value;
      continue;
    }
    if (arg === '--enter') continue;
    if (arg === '-h' || arg === '--help') return { kind: 'help', text: renderCreateHelp(bin) };
    if (arg === '--') {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith('-')) throw new UsageError(`unknown option: ${arg}`);
    positional.push(arg);
  }

  if (positional.length < 1) throw new UsageError('branch name is required');
  if (positional.length > 2) throw new UsageError('too many arguments');

  const options: CreateArgs = { configPath, branchName: positional[0]!, baseRef: positional[1] };
  return { kind: 'create', options };
}

function parseCleanupArgs(args: string[], bin: string): CliCommand {
  let configPath = '.worktree.yaml';
  let keepBranch = false;
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--config') {
      const value = args[++index];
      if (!value) throw new UsageError('--config requires a path');
      configPath = value;
      continue;
    }
    if (arg === '--keep-branch') {
      keepBranch = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '-h' || arg === '--help') return { kind: 'help', text: renderCleanupHelp(bin) };
    if (arg === '--') {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith('-')) throw new UsageError(`unknown option: ${arg}`);
    positional.push(arg);
  }

  if (positional.length > 1) throw new UsageError('too many arguments');

  const options: CleanupArgs = { configPath, keepBranch, force, target: positional[0] };
  return { kind: 'cleanup', options };
}

function parseInitArgs(args: string[], bin: string): CliCommand {
  let configPath = '.worktree.yaml';
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--config') {
      const value = args[++index];
      if (!value) throw new UsageError('--config requires a path');
      configPath = value;
      continue;
    }
    if (arg === '-h' || arg === '--help') return { kind: 'help', text: renderInitHelp(bin) };
    throw new UsageError(`unknown init option: ${arg}`);
  }

  const options: InitArgs = { configPath, force };
  return { kind: 'init', options };
}
