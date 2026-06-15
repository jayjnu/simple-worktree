import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CommandError } from '../lib/errors.js';
import type { CommandRunnerPort, FileSystemPort, GitPort, LoggerPort, PathPort, RuntimePort } from '../core/ports.js';
import { createProcessEnvironment, type NodeEnvironmentPort } from './environment.js';

export class ConsoleLogger implements LoggerPort {
  constructor(private readonly environment: NodeEnvironmentPort) {}

  info(message: string): void {
    this.environment.stdout(`${message}\n`);
  }

  warn(message: string): void {
    this.environment.stderr(`${message}\n`);
  }

  error(message: string): void {
    this.environment.stderr(`${message}\n`);
  }
}

export class NodePathPort implements PathPort {
  private readonly baseCwd: string;

  constructor(
    private readonly environment: NodeEnvironmentPort,
    cwd?: string,
  ) {
    this.baseCwd = cwd ?? environment.cwd();
  }

  cwd(): string {
    return this.baseCwd;
  }

  resolve(from: string, target: string): string {
    return path.resolve(from, target);
  }

  dirname(target: string): string {
    return path.dirname(target);
  }

  join(...parts: string[]): string {
    return path.join(...parts);
  }

  isAbsolute(target: string): boolean {
    return path.isAbsolute(target);
  }

  normalize(target: string): string {
    const normalized = path.isAbsolute(target) ? path.resolve(target) : path.resolve(this.baseCwd, target);
    return this.environment.platform() === 'win32' ? normalized.toLowerCase() : normalized;
  }

  isSameOrInside(parent: string, child: string): boolean {
    const normalizedParent = this.normalize(parent);
    const normalizedChild = this.normalize(child);
    const relative = path.relative(normalizedParent, normalizedChild);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }
}

export class NodeFileSystemPort implements FileSystemPort {
  exists(target: string): boolean {
    return fs.existsSync(target);
  }

  isFile(target: string): boolean {
    try {
      return fs.statSync(target).isFile();
    } catch {
      return false;
    }
  }

  isDirectory(target: string): boolean {
    try {
      return fs.statSync(target).isDirectory();
    } catch {
      return false;
    }
  }

  mkdirp(target: string): void {
    fs.mkdirSync(target, { recursive: true });
  }

  copyFilePreserveMetadata(source: string, destination: string): void {
    fs.copyFileSync(source, destination);
    const stat = fs.statSync(source);
    fs.chmodSync(destination, stat.mode);
    fs.utimesSync(destination, stat.atime, stat.mtime);
  }

  realpath(target: string): string {
    return fs.realpathSync(target);
  }

  readFile(target: string): string {
    return fs.readFileSync(target, 'utf8');
  }

  writeFile(target: string, content: string): void {
    fs.writeFileSync(target, content, { mode: 0o644 });
  }

  removeDirectoryForce(target: string): void {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

export class NodeCommandRunnerPort implements CommandRunnerPort {
  constructor(private readonly environment: NodeEnvironmentPort) {}

  run(command: string, options: { cwd: string }): void {
    const result = spawnSync(command, {
      cwd: options.cwd,
      env: this.environment.env(),
      shell: true,
      stdio: 'inherit',
    });
    throwIfSpawnFailed(result, command);
  }
}

export class NodeGitPort implements GitPort {
  constructor(private readonly paths: PathPort) {}

  primaryRoot(anyWorktree: string): string {
    const output = this.git(['worktree', 'list', '--porcelain'], anyWorktree, 'capture');
    const line = output.split(/\r?\n/).find((entry) => entry.startsWith('worktree '));
    if (!line) throw new CommandError('git worktree list did not report a primary worktree');
    return line.slice('worktree '.length);
  }

  commonDir(worktree: string): string {
    return this.git(['rev-parse', '--path-format=absolute', '--git-common-dir'], worktree, 'capture').trim();
  }

  isInsideWorkTree(target: string): boolean {
    const result = spawnSync('git', ['-C', target, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    return result.status === 0;
  }

  headCommit(worktree: string): string {
    return this.git(['rev-parse', '--verify', 'HEAD^{commit}'], worktree, 'capture').trim();
  }

  localBranchExists(root: string, branchName: string): boolean {
    const result = spawnSync('git', ['-C', root, 'show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], {
      stdio: 'ignore',
    });
    if (result.error) throw result.error;
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new CommandError(`git show-ref failed for branch: ${branchName}`, result.status ?? 1);
  }

  addWorktree(root: string, worktreePath: string, branchName: string, baseRef?: string): void {
    const args = baseRef
      ? ['worktree', 'add', '-b', branchName, worktreePath, baseRef]
      : ['worktree', 'add', worktreePath, branchName];
    this.git(args, root, 'inherit');
  }

  removeWorktree(root: string, worktreePath: string, force: boolean): void {
    this.git(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], root, 'inherit');
  }

  deleteBranch(root: string, branchName: string, force: boolean): void {
    this.git(['branch', force ? '-D' : '-d', branchName], root, 'inherit');
  }

  topLevel(target: string): string {
    return this.git(['rev-parse', '--show-toplevel'], target, 'capture').trim();
  }

  branchForPath(root: string, targetPath: string): string | undefined {
    const output = this.git(['worktree', 'list', '--porcelain'], root, 'capture');
    const normalizedTarget = this.paths.normalize(targetPath);

    for (const block of output.split(/\r?\n\r?\n/)) {
      let worktreePath: string | undefined;
      let branchName: string | undefined;

      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('worktree ')) worktreePath = line.slice('worktree '.length);
        if (line.startsWith('branch refs/heads/')) branchName = line.slice('branch refs/heads/'.length);
      }

      if (worktreePath && branchName && this.paths.normalize(worktreePath) === normalizedTarget) {
        return branchName;
      }
    }

    return undefined;
  }

  private git(args: string[], cwd: string, stdio: 'capture' | 'inherit'): string {
    const result = spawnSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: stdio === 'capture' ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    throwIfSpawnFailed(result, `git -C ${cwd} ${args.join(' ')}`);
    return result.stdout?.toString() ?? '';
  }
}

export function createNodeRuntime(
  options: { cwd?: string; logger?: LoggerPort; environment?: NodeEnvironmentPort } = {},
): RuntimePort {
  const environment = options.environment ?? createProcessEnvironment();
  const paths = new NodePathPort(environment, options.cwd);
  return {
    cwd: paths.cwd(),
    env: environment.env(),
    fs: new NodeFileSystemPort(),
    git: new NodeGitPort(paths),
    path: paths,
    commandRunner: new NodeCommandRunnerPort(environment),
    logger: options.logger ?? new ConsoleLogger(environment),
  };
}

function throwIfSpawnFailed(result: ReturnType<typeof spawnSync>, command: string): void {
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new CommandError(`command not found: ${command}`, 127);
    throw result.error;
  }

  if (result.signal) throw new CommandError(`${command} terminated by signal ${result.signal}`, 1);
  if ((result.status ?? 0) !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const detail = stderr ? `\n${stderr}` : '';
    throw new CommandError(`${command} failed with exit code ${result.status}${detail}`, result.status ?? 1);
  }
}
