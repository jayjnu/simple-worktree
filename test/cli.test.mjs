import assert from 'node:assert/strict';
import { parseCliCommand } from '../dist/cli/arguments.js';
import { runCli } from '../dist/cli/run.js';
import { UsageError } from '../dist/lib/errors.js';
import { NodePathPort, createNodeRuntime } from '../dist/node/node-ports.js';

function testRootHelpUsesInjectedBinNameWithoutRuntime() {
  let runtimeCreated = false;
  let output = '';

  runCli({
    args: ['--help'],
    binName: 'swt',
    createRuntime: () => {
      runtimeCreated = true;
      throw new Error('runtime should not be constructed for help');
    },
    stdout: { write: (message) => (output += message) },
  });

  assert.equal(runtimeCreated, false);
  assert.match(output, /^Usage: swt <command>/);
}

function testSubcommandHelpUsesInjectedSimpleWorktreeNameWithoutRuntime() {
  let runtimeCreated = false;
  let output = '';

  runCli({
    args: ['create', '--help'],
    binName: 'simple-worktree',
    createRuntime: () => {
      runtimeCreated = true;
      throw new Error('runtime should not be constructed for subcommand help');
    },
    stdout: { write: (message) => (output += message) },
  });

  assert.equal(runtimeCreated, false);
  assert.equal(output, 'Usage: simple-worktree create [--enter] [--config .worktree.yaml] <branch-name> [base-ref]\n');
}

function testUsageErrors() {
  assert.throws(() => parseCliCommand(['create', '--config'], 'swt'), UsageError);
  assert.throws(() => parseCliCommand(['cleanup', '--unknown'], 'swt'), UsageError);
  assert.throws(() => parseCliCommand(['init', '--unknown'], 'swt'), UsageError);
}

function testDoubleDashPositionalHandling() {
  assert.deepEqual(parseCliCommand(['create', '--', 'feature/dash-name'], 'swt'), {
    kind: 'create',
    options: { configPath: '.worktree.yaml', branchName: 'feature/dash-name', baseRef: undefined },
  });

  assert.deepEqual(parseCliCommand(['cleanup', '--', '--dash-target'], 'swt'), {
    kind: 'cleanup',
    options: { configPath: '.worktree.yaml', keepBranch: false, force: false, target: '--dash-target' },
  });
}

function testNodePathNormalizeUsesInjectedCwd() {
  const environment = {
    argv: () => [],
    executablePath: () => '/tmp/swt',
    binName: () => 'swt',
    cwd: () => '/env/cwd',
    env: () => ({}),
    platform: () => process.platform,
    stdout: () => {},
    stderr: () => {},
    exit: (code) => {
      throw new Error(`unexpected exit ${code}`);
    },
  };

  const pathPort = new NodePathPort(environment, '/runtime/cwd');
  assert.equal(pathPort.cwd(), '/runtime/cwd');
  assert.equal(pathPort.normalize('relative/path'), pathPort.resolve('/runtime/cwd', 'relative/path'));

  const runtime = createNodeRuntime({ cwd: '/explicit/cwd', environment });
  assert.equal(runtime.cwd, '/explicit/cwd');
  assert.equal(runtime.path.normalize('relative/path'), runtime.path.resolve('/explicit/cwd', 'relative/path'));

  const environmentCwdRuntime = createNodeRuntime({ environment });
  assert.equal(environmentCwdRuntime.cwd, '/env/cwd');
  assert.equal(
    environmentCwdRuntime.path.normalize('relative/path'),
    environmentCwdRuntime.path.resolve('/env/cwd', 'relative/path'),
  );
}

for (const test of [
  testRootHelpUsesInjectedBinNameWithoutRuntime,
  testSubcommandHelpUsesInjectedSimpleWorktreeNameWithoutRuntime,
  testUsageErrors,
  testDoubleDashPositionalHandling,
  testNodePathNormalizeUsesInjectedCwd,
]) {
  test();
}

console.log('cli seams behavior: ok');
