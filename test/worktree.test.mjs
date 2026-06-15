import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = path.join(ROOT, 'dist', 'bin', 'cli.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-worktree-'));

process.on('exit', () => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: 'utf8',
  });
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `expected failure for ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  assert.equal(result.status, 0, `command failed: ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(name) {
  const repo = path.join(TMP, name);
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'root\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-q', '-m', 'initial commit']);
  return repo;
}

function writeConfig(repo, source) {
  fs.writeFileSync(path.join(repo, '.worktree.yaml'), source);
}

function branchExists(repo, branch) {
  return spawnSync('git', ['-C', repo, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0;
}

function hookAppend(logFile, label) {
  const code = `require('fs').appendFileSync(process.env.HOOK_LOG, ${JSON.stringify(label)} + process.cwd() + '\\n')`;
  return `node -e ${JSON.stringify(code)}`;
}

async function testInitWritesDefaultConfig() {
  const repo = initRepo('init-repo');
  run(['init'], { cwd: repo });
  const config = fs.readFileSync(path.join(repo, '.worktree.yaml'), 'utf8');
  assert.match(config, /worktreeDir: \.worktrees/);
  assert.match(config, /postCreate: \[\]/);
}

async function testCreateCopiesFilesAndRunsHook() {
  const repo = initRepo('create-repo');
  fs.mkdirSync(path.join(repo, 'backend'));
  fs.writeFileSync(path.join(repo, 'backend', '.env'), 'backend-secret\n');
  const hookLog = path.join(TMP, 'create-hooks.log');
  writeConfig(repo, `worktreeDir: .worktrees\ncopyFiles:\n  - backend/.env\n  - missing/.env\nhooks:\n  postCreate:\n    - ${JSON.stringify(hookAppend(hookLog, 'post:'))}\n`);

  const result = run(['create', '--config', '.worktree.yaml', 'feature/create-test'], {
    cwd: repo,
    env: { HOOK_LOG: hookLog },
  });

  const worktree = path.join(repo, '.worktrees', 'feature-create-test');
  assert.ok(fs.existsSync(path.join(worktree, '.git')));
  assert.equal(fs.readFileSync(path.join(worktree, 'backend', '.env'), 'utf8'), 'backend-secret\n');
  assert.match(fs.readFileSync(hookLog, 'utf8'), /feature-create-test/);
  assert.match(result.stdout, /Worktree ready/);
}

async function testCreateRollsBackWhenHookFails() {
  const repo = initRepo('rollback-repo');
  writeConfig(repo, `worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  postCreate:\n    - ${JSON.stringify(`node -e ${JSON.stringify('process.exit(42)')}`)}\n`);

  run(['create', '--config', '.worktree.yaml', 'feature/rollback'], { cwd: repo, expectFailure: true });

  assert.ok(!fs.existsSync(path.join(repo, '.worktrees', 'feature-rollback')));
  assert.equal(branchExists(repo, 'feature/rollback'), false);
}

async function testCreateDefaultsBaseRefToInvokingWorktreeHead() {
  const repo = initRepo('base-ref-repo');
  writeConfig(repo, 'worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  postCreate: []\n');
  git(repo, ['add', '.worktree.yaml']);
  git(repo, ['commit', '-q', '-m', 'add config']);

  const parent = path.join(repo, '.worktrees', 'feature-parent');
  git(repo, ['worktree', 'add', '-q', '-b', 'feature/parent', parent, 'HEAD']);
  fs.writeFileSync(path.join(parent, 'PARENT_ONLY.md'), 'parent only\n');
  git(parent, ['add', 'PARENT_ONLY.md']);
  git(parent, ['commit', '-q', '-m', 'parent only']);

  run(['create', '--config', '.worktree.yaml', 'feature/child'], { cwd: parent });
  assert.ok(fs.existsSync(path.join(repo, '.worktrees', 'feature-child', 'PARENT_ONLY.md')));
}

async function testCleanupDefaultsToCurrentWorktreeAndDeletesBranch() {
  const repo = initRepo('cleanup-repo');
  const hookLog = path.join(TMP, 'cleanup-hooks.log');
  writeConfig(repo, `worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  preCleanup:\n    - ${JSON.stringify(hookAppend(hookLog, 'pre:'))}\n  postCleanup:\n    - ${JSON.stringify(hookAppend(hookLog, 'post:'))}\n`);
  git(repo, ['add', '.worktree.yaml']);
  git(repo, ['commit', '-q', '-m', 'add config']);

  const worktree = path.join(repo, '.worktrees', 'feature-cleanup');
  git(repo, ['worktree', 'add', '-q', '-b', 'feature/cleanup', worktree, 'HEAD']);

  run(['cleanup'], { cwd: worktree, env: { HOOK_LOG: hookLog } });

  assert.ok(!fs.existsSync(worktree));
  assert.equal(branchExists(repo, 'feature/cleanup'), false);
  const hooks = fs.readFileSync(hookLog, 'utf8');
  assert.match(hooks, /pre:.*feature-cleanup/);
  assert.match(hooks, /post:.*cleanup-repo/);
}

async function testCleanupRefusesPrimaryRepo() {
  const repo = initRepo('cleanup-primary-repo');
  writeConfig(repo, 'worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  preCleanup: []\n  postCleanup: []\n');
  git(repo, ['add', '.worktree.yaml']);
  git(repo, ['commit', '-q', '-m', 'add config']);
  const currentBranch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);

  const result = run(['cleanup'], { cwd: repo, expectFailure: true });

  assert.match(result.stderr, /Refusing to cleanup the primary repo worktree/);
  assert.ok(fs.existsSync(path.join(repo, '.git')));
  assert.ok(fs.existsSync(path.join(repo, 'README.md')));
  assert.equal(branchExists(repo, currentBranch), true);
}

async function testCleanupCanKeepBranch() {
  const repo = initRepo('keep-branch-repo');
  writeConfig(repo, 'worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  preCleanup: []\n  postCleanup: []\n');
  git(repo, ['add', '.worktree.yaml']);
  git(repo, ['commit', '-q', '-m', 'add config']);
  const worktree = path.join(repo, '.worktrees', 'feature-keep');
  git(repo, ['worktree', 'add', '-q', '-b', 'feature/keep', worktree, 'HEAD']);

  run(['cleanup', '--keep-branch', worktree], { cwd: repo });

  assert.ok(!fs.existsSync(worktree));
  assert.equal(branchExists(repo, 'feature/keep'), true);
}

async function testRejectsUnsafePaths() {
  const repo = initRepo('unsafe-repo');
  writeConfig(repo, 'worktreeDir: ../outside\ncopyFiles: []\nhooks:\n  postCreate: []\n');
  run(['create', '--config', '.worktree.yaml', 'feature/unsafe'], { cwd: repo, expectFailure: true });
  assert.equal(branchExists(repo, 'feature/unsafe'), false);

  writeConfig(repo, 'worktreeDir: .worktrees\ncopyFiles:\n  - ../secret\nhooks:\n  postCreate: []\n');
  run(['create', '--config', '.worktree.yaml', 'feature/unsafe-copy'], { cwd: repo, expectFailure: true });
  assert.equal(branchExists(repo, 'feature/unsafe-copy'), false);

  writeConfig(repo, 'worktreeDir: .GIT/hooks\ncopyFiles: []\nhooks:\n  postCreate: []\n');
  run(['create', '--config', '.worktree.yaml', 'feature/unsafe-git-case'], { cwd: repo, expectFailure: true });
  assert.equal(branchExists(repo, 'feature/unsafe-git-case'), false);
}

async function testCleanupRejectsSanitizedBranchNameCollision() {
  const repo = initRepo('cleanup-collision-repo');
  writeConfig(repo, 'worktreeDir: .worktrees\ncopyFiles: []\nhooks:\n  preCleanup: []\n  postCleanup: []\n');
  git(repo, ['add', '.worktree.yaml']);
  git(repo, ['commit', '-q', '-m', 'add config']);

  const worktree = path.join(repo, '.worktrees', 'feature-foo');
  git(repo, ['worktree', 'add', '-q', '-b', 'feature-foo', worktree, 'HEAD']);

  const result = run(['cleanup', 'feature/foo'], { cwd: repo, expectFailure: true });

  assert.match(result.stderr, /worktree target branch mismatch/);
  assert.ok(fs.existsSync(path.join(worktree, '.git')));
  assert.equal(branchExists(repo, 'feature-foo'), true);
}

const tests = [
  testInitWritesDefaultConfig,
  testCreateCopiesFilesAndRunsHook,
  testCreateRollsBackWhenHookFails,
  testCreateDefaultsBaseRefToInvokingWorktreeHead,
  testCleanupDefaultsToCurrentWorktreeAndDeletesBranch,
  testCleanupRefusesPrimaryRepo,
  testCleanupCanKeepBranch,
  testRejectsUnsafePaths,
  testCleanupRejectsSanitizedBranchNameCollision,
];

for (const test of tests) {
  await test();
}

console.log('simple-worktree package behavior: ok');
