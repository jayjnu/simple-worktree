import assert from 'node:assert/strict';
import path from 'node:path';
import { cleanupWorktree, createWorktree, initConfig } from '../dist/core/index.js';
import { parseWorktreeConfig } from '../dist/lib/config.js';
import { UsageError } from '../dist/lib/errors.js';

function normalize(input) {
  return path.posix.normalize(input).replace(/\/+$|^$/g, '') || '/';
}

function dirname(input) {
  return normalize(path.posix.dirname(input));
}

class MockPathPort {
  cwd() {
    return '/repo';
  }

  resolve(from, target) {
    return normalize(path.posix.resolve(from, target));
  }

  dirname(target) {
    return dirname(target);
  }

  join(...parts) {
    return normalize(path.posix.join(...parts));
  }

  isAbsolute(target) {
    return path.posix.isAbsolute(target);
  }

  normalize(target) {
    return normalize(target);
  }

  isSameOrInside(parent, child) {
    const normalizedParent = normalize(parent);
    const normalizedChild = normalize(child);
    const relative = path.posix.relative(normalizedParent, normalizedChild);
    return relative === '' || (!relative.startsWith('..') && !path.posix.isAbsolute(relative));
  }
}

class MockFileSystemPort {
  constructor() {
    this.files = new Map();
    this.dirs = new Set(['/']);
    this.copied = [];
    this.writes = [];
    this.removed = [];
  }

  addDir(target) {
    const normalized = normalize(target);
    if (normalized === '/') {
      this.dirs.add('/');
      return;
    }
    this.addDir(dirname(normalized));
    this.dirs.add(normalized);
  }

  addFile(target, content) {
    const normalized = normalize(target);
    this.addDir(dirname(normalized));
    this.files.set(normalized, content);
  }

  exists(target) {
    const normalized = normalize(target);
    return this.files.has(normalized) || this.dirs.has(normalized);
  }

  isFile(target) {
    return this.files.has(normalize(target));
  }

  isDirectory(target) {
    return this.dirs.has(normalize(target));
  }

  mkdirp(target) {
    this.addDir(target);
  }

  copyFilePreserveMetadata(source, destination) {
    const normalizedSource = normalize(source);
    const normalizedDestination = normalize(destination);
    assert.ok(this.files.has(normalizedSource), `missing source: ${normalizedSource}`);
    this.addDir(dirname(normalizedDestination));
    this.files.set(normalizedDestination, this.files.get(normalizedSource));
    this.copied.push([normalizedSource, normalizedDestination]);
  }

  realpath(target) {
    return normalize(target);
  }

  readFile(target) {
    const normalized = normalize(target);
    assert.ok(this.files.has(normalized), `missing file: ${normalized}`);
    return this.files.get(normalized);
  }

  writeFile(target, content) {
    const normalized = normalize(target);
    this.addFile(normalized, content);
    this.writes.push([normalized, content]);
  }

  removeDirectoryForce(target) {
    const normalized = normalize(target);
    for (const file of [...this.files.keys()]) {
      if (file === normalized || file.startsWith(`${normalized}/`)) this.files.delete(file);
    }
    for (const dir of [...this.dirs]) {
      if (dir === normalized || dir.startsWith(`${normalized}/`)) this.dirs.delete(dir);
    }
    this.removed.push(normalized);
  }
}

class MockGitPort {
  constructor(fs) {
    this.fs = fs;
    this.calls = [];
    this.branches = new Set();
    this.branchByPath = new Map();
  }

  primaryRoot(anyWorktree) {
    this.calls.push(['primaryRoot', normalize(anyWorktree)]);
    return '/repo';
  }

  commonDir(worktree) {
    this.calls.push(['commonDir', normalize(worktree)]);
    return '/repo/.git';
  }

  isInsideWorkTree(target) {
    this.calls.push(['isInsideWorkTree', normalize(target)]);
    return true;
  }

  headCommit(worktree) {
    this.calls.push(['headCommit', normalize(worktree)]);
    return 'HEAD_SHA';
  }

  localBranchExists(root, branchName) {
    this.calls.push(['localBranchExists', normalize(root), branchName]);
    return this.branches.has(branchName);
  }

  addWorktree(root, worktreePath, branchName, baseRef) {
    const normalized = normalize(worktreePath);
    this.calls.push(['addWorktree', normalize(root), normalized, branchName, baseRef]);
    this.branches.add(branchName);
    this.branchByPath.set(normalized, branchName);
    this.fs.addDir(normalized);
    this.fs.addFile(path.posix.join(normalized, '.git'), 'gitdir');
  }

  removeWorktree(root, worktreePath, force) {
    const normalized = normalize(worktreePath);
    this.calls.push(['removeWorktree', normalize(root), normalized, force]);
    this.fs.removeDirectoryForce(normalized);
  }

  deleteBranch(root, branchName, force) {
    this.calls.push(['deleteBranch', normalize(root), branchName, force]);
    this.branches.delete(branchName);
  }

  topLevel(target) {
    this.calls.push(['topLevel', normalize(target)]);
    return normalize(target);
  }

  branchForPath(root, targetPath) {
    this.calls.push(['branchForPath', normalize(root), normalize(targetPath)]);
    return this.branchByPath.get(normalize(targetPath));
  }
}

class MockCommandRunnerPort {
  constructor() {
    this.calls = [];
  }

  run(command, options) {
    this.calls.push([command, normalize(options.cwd)]);
    if (command === 'fail') throw new Error('hook failed');
  }
}

class MockLoggerPort {
  constructor() {
    this.messages = [];
  }

  info(message) {
    this.messages.push(['info', message]);
  }

  warn(message) {
    this.messages.push(['warn', message]);
  }

  error(message) {
    this.messages.push(['error', message]);
  }
}

function createMockRuntime({ cwd = '/repo', env = {} } = {}) {
  const fs = new MockFileSystemPort();
  const pathPort = new MockPathPort();
  const git = new MockGitPort(fs);
  const commandRunner = new MockCommandRunnerPort();
  const logger = new MockLoggerPort();

  fs.addDir('/repo');
  fs.addDir('/repo/.git');

  return {
    runtime: {
      cwd,
      env,
      fs,
      git,
      path: pathPort,
      commandRunner,
      logger,
    },
    fs,
    git,
    commandRunner,
    logger,
  };
}

function testCreateUsesOnlyPorts() {
  const { runtime, fs, git, commandRunner, logger } = createMockRuntime();
  fs.addFile('/repo/.worktree.yaml', `worktreeDir: .worktrees\ncopyFiles:\n  - backend/.env\nhooks:\n  postCreate:\n    - install\n`);
  fs.addFile('/repo/backend/.env', 'secret');

  createWorktree({ configPath: '.worktree.yaml', branchName: 'feature/mock', baseRef: 'main' }, runtime);

  assert.deepEqual(fs.copied, [['/repo/backend/.env', '/repo/.worktrees/feature-mock/backend/.env']]);
  assert.deepEqual(commandRunner.calls, [['install', '/repo/.worktrees/feature-mock']]);
  assert.ok(git.calls.some((call) => call[0] === 'addWorktree' && call[3] === 'feature/mock' && call[4] === 'main'));
  assert.ok(logger.messages.some(([, message]) => message.includes('Worktree ready')));
}

function testCreateRollsBackThroughPorts() {
  const { runtime, fs, git } = createMockRuntime();
  fs.addFile('/repo/.worktree.yaml', `worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  postCreate:\n    - fail\n`);

  assert.throws(() => createWorktree({ configPath: '.worktree.yaml', branchName: 'feature/fail', baseRef: 'main' }, runtime));

  assert.ok(git.calls.some((call) => call[0] === 'removeWorktree' && call[3] === true));
  assert.ok(git.calls.some((call) => call[0] === 'deleteBranch' && call[1] === '/repo' && call[2] === 'feature/fail' && call[3] === true));
  assert.equal(fs.exists('/repo/.worktrees/feature-fail'), false);
}

function testCleanupUsesOnlyPorts() {
  const { runtime, fs, git, commandRunner } = createMockRuntime({ cwd: '/repo/.worktrees/feature-clean' });
  fs.addFile('/repo/.worktrees/feature-clean/.worktree.yaml', `worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  preCleanup:\n    - pre\n  postCleanup:\n    - post\n`);
  fs.addDir('/repo/.worktrees/feature-clean');
  git.branches.add('feature/clean');
  git.branchByPath.set('/repo/.worktrees/feature-clean', 'feature/clean');

  cleanupWorktree({ configPath: '.worktree.yaml', keepBranch: false, force: false }, runtime);

  assert.deepEqual(commandRunner.calls, [
    ['pre', '/repo/.worktrees/feature-clean'],
    ['post', '/repo'],
  ]);
  assert.ok(git.calls.some((call) => call[0] === 'removeWorktree' && call[2] === '/repo/.worktrees/feature-clean' && call[3] === false));
  assert.ok(git.calls.some((call) => call[0] === 'deleteBranch' && call[2] === 'feature/clean' && call[3] === false));
}

function testCleanupFallsBackWhenMiseOriginalCwdIsInvalid() {
  const { runtime, fs, git } = createMockRuntime({ cwd: '/repo/.worktrees/feature-clean', env: { MISE_ORIGINAL_CWD: '/missing' } });
  fs.addFile('/repo/.worktrees/feature-clean/.worktree.yaml', `worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  preCleanup: []\n  postCleanup: []\n`);
  fs.addDir('/repo/.worktrees/feature-clean');
  git.branches.add('feature/clean');
  git.branchByPath.set('/repo/.worktrees/feature-clean', 'feature/clean');

  cleanupWorktree({ configPath: '.worktree.yaml', keepBranch: false, force: false }, runtime);

  assert.ok(git.calls.some((call) => call[0] === 'topLevel' && call[1] === '/repo/.worktrees/feature-clean'));
  assert.ok(!git.calls.some((call) => call[0] === 'topLevel' && call[1] === '/missing'));
}

function testRejectsReservedWorktreeDirs() {
  for (const worktreeDir of ['.', './', '.git', '.Git', '.GIT/hooks', '.git/hooks', './.git/hooks']) {
    const { runtime, fs, git } = createMockRuntime();
    fs.addFile('/repo/.worktree.yaml', `worktreeDir: ${worktreeDir}\ncopyFiles: []\nhooks:\n  postCreate: []\n`);

    assert.throws(
      () => createWorktree({ configPath: '.worktree.yaml', branchName: 'feature/reserved', baseRef: 'main' }, runtime),
      UsageError,
    );
    assert.ok(!git.calls.some((call) => call[0] === 'addWorktree'));
  }
}

function testCleanupRejectsSanitizedBranchNameCollision() {
  const { runtime, fs, git } = createMockRuntime();
  fs.addFile('/repo/.worktree.yaml', `worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  preCleanup: []\n  postCleanup: []\n`);
  fs.addDir('/repo/.worktrees/feature-foo');
  git.branches.add('feature-foo');
  git.branchByPath.set('/repo/.worktrees/feature-foo', 'feature-foo');

  assert.throws(
    () => cleanupWorktree({ configPath: '.worktree.yaml', target: 'feature/foo', keepBranch: false, force: false }, runtime),
    UsageError,
  );
  assert.ok(!git.calls.some((call) => call[0] === 'removeWorktree'));
  assert.equal(git.branches.has('feature-foo'), true);
}

function testMalformedConfigThrowsUsageError() {
  assert.throws(() => parseWorktreeConfig('hooks:\n  - bad\n'), UsageError);
  assert.throws(() => parseWorktreeConfig('copyFiles: [unterminated\n'), UsageError);
}

function testInitUsesFilesystemPort() {
  const { runtime, fs } = createMockRuntime();

  initConfig({ configPath: '.worktree.yaml', force: false }, runtime);

  assert.equal(fs.writes[0][0], '/repo/.worktree.yaml');
  assert.match(fs.readFile('/repo/.worktree.yaml'), /worktreeDir: \.worktrees/);
}

for (const test of [
  testCreateUsesOnlyPorts,
  testCreateRollsBackThroughPorts,
  testCleanupUsesOnlyPorts,
  testCleanupFallsBackWhenMiseOriginalCwdIsInvalid,
  testRejectsReservedWorktreeDirs,
  testCleanupRejectsSanitizedBranchNameCollision,
  testMalformedConfigThrowsUsageError,
  testInitUsesFilesystemPort,
]) {
  test();
}

console.log('core port mock behavior: ok');
