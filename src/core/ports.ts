export interface LoggerPort {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PathPort {
  cwd(): string;
  resolve(from: string, target: string): string;
  dirname(path: string): string;
  join(...parts: string[]): string;
  isAbsolute(path: string): boolean;
  normalize(path: string): string;
  isSameOrInside(parent: string, child: string): boolean;
}

export interface FileSystemPort {
  exists(path: string): boolean;
  isFile(path: string): boolean;
  isDirectory(path: string): boolean;
  mkdirp(path: string): void;
  copyFilePreserveMetadata(source: string, destination: string): void;
  realpath(path: string): string;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  removeDirectoryForce(path: string): void;
}

export interface GitPort {
  primaryRoot(anyWorktree: string): string;
  commonDir(worktree: string): string;
  isInsideWorkTree(path: string): boolean;
  headCommit(worktree: string): string;
  localBranchExists(root: string, branchName: string): boolean;
  addWorktree(root: string, worktreePath: string, branchName: string, baseRef?: string): void;
  removeWorktree(root: string, worktreePath: string, force: boolean): void;
  deleteBranch(root: string, branchName: string, force: boolean): void;
  topLevel(path: string): string;
  branchForPath(root: string, targetPath: string): string | undefined;
}

export interface CommandRunnerPort {
  run(command: string, options: { cwd: string }): void;
}

export interface RuntimePort {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly fs: FileSystemPort;
  readonly git: GitPort;
  readonly path: PathPort;
  readonly commandRunner: CommandRunnerPort;
  readonly logger: LoggerPort;
}
