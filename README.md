# @jayjnu/simple-worktree

TypeScript-based, config-driven Git worktree bootstrap and cleanup CLI. The core orchestration is separated from OS/Node details through service interfaces, and the Node CLI provides filesystem, Git, path, and command-runner adapters.

## Requirements

- Node.js 22.22+ (recommended: 22.22.3)
- Git
- pnpm via Corepack

Setup hint:

```bash
corepack enable
```

Use Node.js 22.22.x for development and publishing. `.nvmrc` and `.node-version` are included for version managers.

No project-local `.sh` script is required. Hooks are executed through the host platform shell via Node's `child_process` shell mode.

## Quick start

```bash
pnpm dlx @jayjnu/simple-worktree init
git add .worktree.yaml && git commit -m "add worktree config"
pnpm dlx @jayjnu/simple-worktree create feature/my-task
pnpm dlx @jayjnu/simple-worktree cleanup feature/my-task
```

Commit `.worktree.yaml` before creating child worktrees if you want to run `cleanup` from inside a child worktree without passing `--config`.

The package exposes two binary names:

- `simple-worktree`: descriptive default command
- `swt`: short alias for everyday use

After installing locally or globally, you can use the short alias:

```bash
pnpm exec swt create feature/my-task
pnpm exec swt cleanup
```

## Configuration

Create and commit `.worktree.yaml` in the repository root. Committing it lets `cleanup` run from inside child worktrees without passing `--config` manually.

```yaml
worktreeDir: .worktrees

copyFiles:
  - backend/.env
  - frontend/.env.local

hooks:
  postCreate:
    - pnpm install
  preCleanup: []
  postCleanup: []
```

### `worktreeDir`

Relative directory under the primary worktree where new worktrees are created. Defaults to `.worktrees`.

### `copyFiles`

Relative files copied from the primary worktree into the newly-created worktree. Missing files are skipped with a warning.

### `hooks`

Shell commands run through the current platform's default shell.

- `postCreate`: runs inside the new worktree after copyFiles are copied
- `preCleanup`: runs inside the target worktree before removal
- `postCleanup`: runs inside the primary worktree after removal

## Commands

### Create

```bash
swt create [--enter] [--config .worktree.yaml] <branch-name> [base-ref]
```

- Creates `<worktreeDir>/<sanitized-branch-name>` under the primary worktree.
- If `<branch-name>` already exists, it checks out that branch in the new worktree.
- Otherwise, it creates the branch from `[base-ref]` or the invoking worktree's `HEAD`.
- If `postCreate` fails, newly-created worktree and branch are rolled back.
- `--enter` is accepted for compatibility; the CLI prints a copy-pasteable `cd` hint because a child process cannot change the parent shell directory.

### Cleanup

```bash
swt cleanup [--config .worktree.yaml] [--keep-branch] [--force] [worktree-path-or-branch]
```

- With no target, removes the current worktree context.
- Refuses to remove the primary repository worktree.
- Deletes the worktree branch by default. Pass `--keep-branch` to preserve it.
- Pass `--force` to forward force deletion to `git worktree remove --force` and `git branch -D`.

### Init

```bash
swt init [--force] [--config .worktree.yaml]
```

Writes a starter config. Existing config files are not overwritten unless `--force` is passed.

## Architecture

```text
src/core/
  index.ts             use-case exports
  ports.ts             service interfaces for fs/git/path/process/logging
  create-worktree.ts   create worktree use case
  cleanup-worktree.ts  cleanup worktree use case
  init-config.ts       init config use case

src/lib/
  config.ts                YAML parsing and default config
  errors.ts                shared error types
  hooks.ts                 hook command runner helper
  path-safety.ts           path validation and branch directory naming
  runtime-path.ts          runtime-backed path resolution helper
  worktree-config-file.ts  config file loading helper

src/cli/
  arguments.ts    command argument parsing
  help.ts         help/usage rendering and bin-name handling
  run.ts          CLI command dispatcher
  types.ts        CLI-specific types

src/node/
  environment.ts  Node process/environment abstraction
  node-ports.ts   Node.js implementations of the service interfaces

src/bin/
  cli.ts          executable entrypoint and error handling
```

`src/core` contains the use-case orchestration and port contracts only. Utility code used by core lives in `src/lib`. CLI parsing/rendering lives in `src/cli`, while Node process/env access is isolated behind `src/node/environment.ts`. OS-specific behavior is isolated in `src/node/node-ports.ts`, making the core use cases testable with alternate adapters.

## Publish

Before publishing, verify the package contents:

```bash
pnpm test
pnpm run pack:dry-run
pnpm publish
```
