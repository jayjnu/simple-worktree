export interface CreateArgs {
  configPath: string;
  branchName: string;
  baseRef?: string;
}

export interface CleanupArgs {
  configPath: string;
  target?: string;
  keepBranch: boolean;
  force: boolean;
}

export interface InitArgs {
  configPath: string;
  force: boolean;
}

export type CliCommand =
  | { kind: 'help'; text: string }
  | { kind: 'create'; options: CreateArgs }
  | { kind: 'cleanup'; options: CleanupArgs }
  | { kind: 'init'; options: InitArgs };

export interface CliOutputPort {
  write(message: string): void;
}
