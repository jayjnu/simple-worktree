import { defaultConfigSource } from '../lib/config.js';
import { UsageError } from '../lib/errors.js';
import { absolutePath } from '../lib/runtime-path.js';
import type { RuntimePort } from './ports.js';

export interface InitConfigOptions {
  configPath: string;
  force: boolean;
}

export function initConfig(options: InitConfigOptions, runtime: RuntimePort): void {
  const configPath = absolutePath(options.configPath, runtime);
  if (runtime.fs.exists(configPath) && !options.force) {
    throw new UsageError(`config already exists: ${options.configPath}. Use --force to overwrite.`);
  }
  runtime.fs.mkdirp(runtime.path.dirname(configPath));
  runtime.fs.writeFile(configPath, defaultConfigSource());
  runtime.logger.info(`✅ wrote ${configPath}`);
}
