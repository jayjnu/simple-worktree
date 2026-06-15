import type { RuntimePort } from '../core/ports.js';

export function absolutePath(input: string, runtime: RuntimePort): string {
  return runtime.path.isAbsolute(input) ? input : runtime.path.resolve(runtime.cwd, input);
}
