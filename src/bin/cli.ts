#!/usr/bin/env node
import { runCli } from '../cli/run.js';
import { CommandError, UsageError } from '../lib/errors.js';
import { createProcessEnvironment } from '../node/environment.js';
import { createNodeRuntime } from '../node/node-ports.js';

const environment = createProcessEnvironment();

try {
  runCli({
    args: environment.argv(),
    binName: environment.binName(),
    createRuntime: () => createNodeRuntime({ environment }),
    stdout: { write: (message) => environment.stdout(message) },
  });
} catch (error) {
  if (error instanceof UsageError) {
    environment.stderr(`❌ ${error.message}\n`);
    environment.exit(error.exitCode);
  }
  if (error instanceof CommandError) {
    environment.stderr(`❌ ${error.message}\n`);
    environment.exit(error.exitCode);
  }
  environment.stderr(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  environment.exit(1);
}
