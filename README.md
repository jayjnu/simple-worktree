# @jayjnu/simple-worktree

A small Git worktree helper that creates and cleans up project worktrees using a repo-local `.worktree.yaml` config.

- English | [한국어](./README.ko.md)
- Binary names: `swt` and `simple-worktree`
- Creates worktrees under `.worktrees/` by default
- Copies local-only files such as `.env` into new worktrees
- Runs optional setup/cleanup hooks

## Requirements

### To use the CLI

- Node.js 18+
- Git
- pnpm if you want to use the examples below (`pnpm dlx`, `pnpm exec`)

If pnpm is not enabled yet:

```bash
corepack enable
```

### To develop this package

- Node.js 22.22.x, recommended `22.22.3`
- pnpm `10.32.1`

This repository includes `.nvmrc` and `.node-version` for development. The higher Node version is for maintaining/building this package; installing and using the published CLI can work on lower Node versions as noted above.

## Quick start

Run this in the repository where you want to use worktrees:

```bash
pnpm dlx @jayjnu/simple-worktree init
```

Review and commit the generated config:

```bash
git add .worktree.yaml
git commit -m "add worktree config"
```

Create a worktree:

```bash
pnpm dlx @jayjnu/simple-worktree create feature/my-task
```

Clean it up later:

```bash
pnpm dlx @jayjnu/simple-worktree cleanup feature/my-task
```

> Commit `.worktree.yaml` before creating child worktrees if you want to run `cleanup` from inside a child worktree without passing `--config`.

## Install for repeated use

Project-local install:

```bash
pnpm add -D @jayjnu/simple-worktree
pnpm exec swt create feature/my-task
pnpm exec swt cleanup feature/my-task
```

Global install:

```bash
pnpm add -g @jayjnu/simple-worktree
swt create feature/my-task
swt cleanup feature/my-task
```

## Configuration

`swt init` creates this starter config:

```yaml
worktreeDir: .worktrees

copyFiles: []

hooks:
  postCreate: []
  preCleanup: []
  postCleanup: []
```

A more realistic example:

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

Unsafe values such as `..`, `.`, and `.git/**` are rejected.

### `copyFiles`

Relative files copied from the primary worktree into the newly created worktree.

Use this for files that are intentionally not committed, for example:

- `.env`
- `.env.local`
- local tool config

Missing files are skipped with a warning.

### `hooks`

Shell commands run through the current platform's default shell.

- `postCreate`: runs inside the new worktree after `copyFiles` are copied
- `preCleanup`: runs inside the target worktree before removal
- `postCleanup`: runs inside the primary worktree after removal

## Commands

### `swt init`

```bash
swt init [--force] [--config .worktree.yaml]
```

Writes a starter config. Existing config files are not overwritten unless `--force` is passed.

### `swt create`

```bash
swt create [--enter] [--config .worktree.yaml] <branch-name> [base-ref]
```

Creates `<worktreeDir>/<sanitized-branch-name>` under the primary worktree.

Behavior:

- If `<branch-name>` already exists, it checks out that branch in the new worktree.
- Otherwise, it creates the branch from `[base-ref]` or the invoking worktree's `HEAD`.
- If `postCreate` fails, the newly created worktree and branch are rolled back.
- `--enter` is accepted for compatibility, but a child process cannot change your parent shell directory. The CLI prints a copy-pasteable `cd` hint instead.

### `swt cleanup`

```bash
swt cleanup [--config .worktree.yaml] [--keep-branch] [--force] [worktree-path-or-branch]
```

Removes a Git worktree.

Behavior:

- With no target, removes the current worktree context.
- Refuses to remove the primary repository worktree.
- Deletes the worktree branch by default.
- Pass `--keep-branch` to preserve the branch.
- Pass `--force` to forward force deletion to `git worktree remove --force` and `git branch -D`.

## Local development

```bash
pnpm install
pnpm run lint
pnpm test
pnpm run pack:dry-run
```

To use the current checkout as a local binary before publishing:

```bash
pnpm run build
pnpm link --global
swt --help
```

## Notes

- No project-local `.sh` script is required.
- The package is implemented in TypeScript.
- Core worktree behavior is separated from Node/OS adapters so it can be tested with mock ports.
