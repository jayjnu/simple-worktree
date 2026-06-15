import { parseWorktreeConfig, type WorktreeConfig } from './config.js';
import { UsageError } from './errors.js';
import { absolutePath } from './runtime-path.js';
import type { RuntimePort } from '../core/ports.js';

export interface LoadedWorktreeConfig {
  configPath: string;
  configRoot: string;
  config: WorktreeConfig;
}

export function loadWorktreeConfig(configPathInput: string, runtime: RuntimePort): LoadedWorktreeConfig {
  const configPath = absolutePath(configPathInput, runtime);
  if (!runtime.fs.isFile(configPath)) throw new UsageError(`config not found: ${configPathInput}`);

  return {
    configPath,
    configRoot: runtime.path.dirname(configPath),
    config: parseWorktreeConfig(runtime.fs.readFile(configPath)),
  };
}
