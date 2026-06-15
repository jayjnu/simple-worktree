export function renderRootHelp(bin: string): string {
  return `Usage: ${bin} <command> [options]\n\nCommands:\n  create [--config .worktree.yaml] [--enter] <branch-name> [base-ref]\n      Create a git worktree, copy configured files, and run postCreate hooks.\n\n  cleanup [--config .worktree.yaml] [--keep-branch] [--force] [worktree-path-or-branch]\n      Remove a git worktree and, by default, delete its branch.\n\n  init [--force] [--config .worktree.yaml]\n      Write a starter .worktree.yaml in the current directory.\n\nExamples:\n  pnpm dlx @jayjnu/simple-worktree init\n  ${bin} create feature/my-task\n  ${bin} cleanup feature/my-task\n`;
}

export function renderCreateHelp(bin: string): string {
  return `Usage: ${bin} create [--enter] [--config .worktree.yaml] <branch-name> [base-ref]\n`;
}

export function renderCleanupHelp(bin: string): string {
  return `Usage: ${bin} cleanup [--config .worktree.yaml] [--keep-branch] [--force] [worktree-path-or-branch]\n`;
}

export function renderInitHelp(bin: string): string {
  return `Usage: ${bin} init [--force] [--config .worktree.yaml]\n`;
}
