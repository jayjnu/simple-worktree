import { runHooks } from '../lib/hooks.js';
import { UsageError } from '../lib/errors.js';
import { loadWorktreeConfig } from '../lib/worktree-config-file.js';
import { requireSafeWorktreeDir, sanitizeName } from '../lib/path-safety.js';
import type { RuntimePort } from './ports.js';

export interface CleanupWorktreeOptions {
  configPath: string;
  target?: string;
  keepBranch: boolean;
  force: boolean;
}

export function cleanupWorktree(options: CleanupWorktreeOptions, runtime: RuntimePort): void {
  const { configRoot, config } = loadWorktreeConfig(options.configPath, runtime);
  const root = runtime.git.primaryRoot(configRoot);

  requireSafeWorktreeDir(config.worktreeDir, runtime);

  const resolvedTarget = resolveCleanupTarget(options.target, root, configRoot, config.worktreeDir, runtime);
  let target = resolvedTarget.path;
  if (runtime.fs.isDirectory(target)) target = runtime.git.topLevel(target);

  if (runtime.path.normalize(target) === runtime.path.normalize(root)) {
    throw new UsageError(`Refusing to cleanup the primary repo worktree: ${root}`);
  }

  const branchName = runtime.git.branchForPath(root, target);
  if (!branchName) {
    throw new UsageError(`Target is not a branch worktree registered under this repo: ${target}`);
  }
  if (resolvedTarget.expectedBranch && branchName !== resolvedTarget.expectedBranch) {
    throw new UsageError(`worktree target branch mismatch: requested ${resolvedTarget.expectedBranch}, found ${branchName}`);
  }

  runHooks(config.hooks.preCleanup, 'preCleanup', target, runtime);
  runtime.git.removeWorktree(root, target, options.force);

  if (options.keepBranch) {
    runtime.logger.info(`✅ kept branch: ${branchName}`);
  } else {
    runtime.git.deleteBranch(root, branchName, options.force);
    runtime.logger.info(`✅ deleted branch: ${branchName}`);
  }

  runHooks(config.hooks.postCleanup, 'postCleanup', root, runtime);
  runtime.logger.info(`✅ Worktree cleaned up: ${target}`);
}

interface ResolvedCleanupTarget {
  path: string;
  expectedBranch?: string;
}

function resolveCleanupTarget(
  target: string | undefined,
  root: string,
  configRoot: string,
  worktreeDir: string,
  runtime: RuntimePort,
): ResolvedCleanupTarget {
  if (!target) {
    return { path: runtime.git.topLevel(resolveDefaultCleanupCwd(configRoot, runtime)) };
  }

  if (runtime.path.isAbsolute(target)) return { path: target };

  const cwdTarget = runtime.path.resolve(runtime.cwd, target);
  if (runtime.fs.isDirectory(cwdTarget)) return { path: cwdTarget };

  const rootTarget = runtime.path.join(root, target);
  if (runtime.fs.isDirectory(rootTarget)) return { path: rootTarget };

  const namedTarget = runtime.path.join(root, worktreeDir, sanitizeName(target));
  if (runtime.fs.isDirectory(namedTarget)) {
    return { path: namedTarget, expectedBranch: target.replace(/^refs\/heads\//, '') };
  }

  throw new UsageError(`worktree target not found: ${target}`);
}

function resolveDefaultCleanupCwd(configRoot: string, runtime: RuntimePort): string {
  const originalCwd = runtime.env.MISE_ORIGINAL_CWD;
  if (!originalCwd) return runtime.cwd;

  if (!runtime.fs.isDirectory(originalCwd) || !runtime.git.isInsideWorkTree(originalCwd)) {
    return runtime.cwd;
  }

  const configCommonDir = runtime.fs.realpath(runtime.git.commonDir(configRoot));
  const originalCommonDir = runtime.fs.realpath(runtime.git.commonDir(originalCwd));
  if (runtime.path.normalize(originalCommonDir) !== runtime.path.normalize(configCommonDir)) {
    return runtime.cwd;
  }

  return originalCwd;
}
