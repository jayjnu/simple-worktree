import { runHooks } from '../lib/hooks.js';
import { UsageError } from '../lib/errors.js';
import { loadWorktreeConfig } from '../lib/worktree-config-file.js';
import type { RuntimePort } from './ports.js';
import {
  formatCdHint,
  requireExistingPathWithin,
  requirePathParentWithin,
  requireSafeRelativePath,
  requireSafeWorktreeDir,
  sanitizeName,
} from '../lib/path-safety.js';

export interface CreateWorktreeOptions {
  configPath: string;
  branchName: string;
  baseRef?: string;
}

export function createWorktree(options: CreateWorktreeOptions, runtime: RuntimePort): void {
  const { configRoot, config } = loadWorktreeConfig(options.configPath, runtime);
  const root = runtime.git.primaryRoot(configRoot);
  const baseRef = options.baseRef ?? inferBaseRef(configRoot, runtime);

  requireSafeWorktreeDir(config.worktreeDir, runtime);
  const safeName = sanitizeName(options.branchName);
  if (!safeName) {
    throw new UsageError(`branch name cannot be converted to a worktree directory name: ${options.branchName}`);
  }

  const copyFiles = config.copyFiles.map((file) => {
    requireSafeRelativePath('copyFiles entry', file, runtime);
    return file;
  });

  const worktreePath = runtime.path.join(root, config.worktreeDir, safeName);
  const worktreeParent = runtime.path.dirname(worktreePath);
  requirePathParentWithin('worktree path', root, worktreePath, runtime);

  if (runtime.fs.exists(worktreePath)) {
    throw new UsageError(`Worktree path already exists: ${worktreePath}`);
  }

  runtime.fs.mkdirp(worktreeParent);
  requireExistingPathWithin('worktree path parent', root, worktreeParent, runtime);

  let worktreeAdded = false;
  let createdBranch = false;

  try {
    if (runtime.git.localBranchExists(root, options.branchName)) {
      runtime.git.addWorktree(root, worktreePath, options.branchName);
    } else {
      runtime.git.addWorktree(root, worktreePath, options.branchName, baseRef);
      createdBranch = true;
    }
    worktreeAdded = true;

    copyConfiguredFiles({ files: copyFiles, root, worktreePath }, runtime);
    runHooks(config.hooks.postCreate, 'postCreate', worktreePath, runtime);
  } catch (error) {
    rollbackFailedCreate({ root, worktreePath, branchName: options.branchName, worktreeAdded, createdBranch }, runtime);
    throw error;
  }

  runtime.logger.info(`✅ Worktree ready: ${worktreePath}`);
  runtime.logger.info(`➡️  ${formatCdHint(worktreePath)}`);
}

function copyConfiguredFiles(options: { files: string[]; root: string; worktreePath: string }, runtime: RuntimePort): void {
  for (const file of options.files) {
    const source = runtime.path.join(options.root, file);
    const destination = runtime.path.join(options.worktreePath, file);

    if (!runtime.fs.isFile(source)) {
      runtime.logger.warn(`⚠️  copyFiles entry missing, skipped: ${file}`);
      continue;
    }

    requireExistingPathWithin('copyFiles source', options.root, source, runtime);
    requirePathParentWithin('copyFiles destination', options.worktreePath, destination, runtime);
    runtime.fs.mkdirp(runtime.path.dirname(destination));
    requireExistingPathWithin('copyFiles destination parent', options.worktreePath, runtime.path.dirname(destination), runtime);
    if (runtime.fs.exists(destination)) {
      requireExistingPathWithin('copyFiles destination', options.worktreePath, destination, runtime);
    }
    runtime.fs.copyFilePreserveMetadata(source, destination);
    runtime.logger.info(`✅ copied ${file}`);
  }
}

function rollbackFailedCreate(
  options: { root: string; worktreePath: string; branchName: string; worktreeAdded: boolean; createdBranch: boolean },
  runtime: RuntimePort,
): void {
  if (!options.worktreeAdded) return;

  runtime.logger.error(`❌ Worktree bootstrap failed; rolling back: ${options.worktreePath}`);
  try {
    runtime.git.removeWorktree(options.root, options.worktreePath, true);
  } catch {
    if (runtime.fs.exists(options.worktreePath)) runtime.fs.removeDirectoryForce(options.worktreePath);
  }

  if (options.createdBranch) {
    try {
      runtime.git.deleteBranch(options.root, options.branchName, true);
    } catch {
      // Best-effort rollback.
    }
  }
}

function inferBaseRef(configRoot: string, runtime: RuntimePort): string {
  const configCommonDir = runtime.fs.realpath(runtime.git.commonDir(configRoot));
  let invokingCwd = runtime.env.MISE_ORIGINAL_CWD ?? runtime.cwd;

  if (runtime.fs.isDirectory(invokingCwd) && runtime.git.isInsideWorkTree(invokingCwd)) {
    const invokingCommonDir = runtime.fs.realpath(runtime.git.commonDir(invokingCwd));
    if (runtime.path.normalize(invokingCommonDir) !== runtime.path.normalize(configCommonDir)) {
      invokingCwd = configRoot;
    }
  } else {
    invokingCwd = configRoot;
  }

  return runtime.git.headCommit(invokingCwd);
}
