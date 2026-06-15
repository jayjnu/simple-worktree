import { UsageError } from './errors.js';
import type { RuntimePort } from '../core/ports.js';

export function sanitizeName(name: string): string {
  return name
    .replace(/^refs\/heads\//, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function requireSafeRelativePath(label: string, candidate: string, runtime: RuntimePort): void {
  if (candidate.length === 0) throw new UsageError(`${label} must not be empty`);
  if (runtime.path.isAbsolute(candidate)) throw new UsageError(`${label} must be a relative path: ${candidate}`);

  const segments = candidate.split(/[\\/]+/).filter(Boolean);
  if (segments.includes('..')) {
    throw new UsageError(`${label} must not contain '..' path segments: ${candidate}`);
  }
}

export function requireSafeWorktreeDir(candidate: string, runtime: RuntimePort): void {
  requireSafeRelativePath('worktreeDir', candidate, runtime);

  const segments = candidate.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) {
    throw new UsageError(`worktreeDir must not target the repository root: ${candidate}`);
  }

  if (segments.some((segment) => segment.toLowerCase() === '.git')) {
    throw new UsageError(`worktreeDir must not target Git metadata: ${candidate}`);
  }
}

export function requireExistingPathWithin(label: string, root: string, candidate: string, runtime: RuntimePort): void {
  if (!runtime.fs.exists(candidate)) throw new UsageError(`${label} does not exist: ${candidate}`);

  const rootReal = runtime.fs.realpath(root);
  const candidateReal = runtime.fs.realpath(candidate);
  if (!runtime.path.isSameOrInside(rootReal, candidateReal)) {
    throw new UsageError(`${label} must resolve within ${root}: ${candidate}`);
  }
}

export function requirePathParentWithin(label: string, root: string, candidate: string, runtime: RuntimePort): void {
  const originalParent = runtime.path.dirname(candidate);
  let probe = originalParent;

  while (!runtime.fs.exists(probe)) {
    const next = runtime.path.dirname(probe);
    if (next === probe) throw new UsageError(`${label} parent does not exist: ${originalParent}`);
    probe = next;
  }

  if (!runtime.fs.isDirectory(probe)) throw new UsageError(`${label} parent is not a directory: ${probe}`);
  requireExistingPathWithin(`${label} parent`, root, probe, runtime);
}

export function formatCdHint(path: string): string {
  return `cd ${JSON.stringify(path)}`;
}
