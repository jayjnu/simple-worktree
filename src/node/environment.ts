import path from 'node:path';

const KNOWN_BIN_NAMES = new Set(['simple-worktree', 'swt']);

export interface NodeEnvironmentPort {
  argv(): string[];
  executablePath(): string | undefined;
  binName(): string;
  cwd(): string;
  env(): Record<string, string | undefined>;
  platform(): NodeJS.Platform;
  stdout(message: string): void;
  stderr(message: string): void;
  exit(code: number): never;
}

export class ProcessEnvironment implements NodeEnvironmentPort {
  argv(): string[] {
    return process.argv.slice(2);
  }

  executablePath(): string | undefined {
    return process.argv[1];
  }

  binName(): string {
    const executablePath = this.executablePath();
    const name = executablePath ? path.basename(executablePath) : 'simple-worktree';
    if (KNOWN_BIN_NAMES.has(name)) return name;
    return 'swt';
  }

  cwd(): string {
    return process.cwd();
  }

  env(): Record<string, string | undefined> {
    return process.env;
  }

  platform(): NodeJS.Platform {
    return process.platform;
  }

  stdout(message: string): void {
    process.stdout.write(message);
  }

  stderr(message: string): void {
    process.stderr.write(message);
  }

  exit(code: number): never {
    process.exit(code);
  }
}

export function createProcessEnvironment(): NodeEnvironmentPort {
  return new ProcessEnvironment();
}
