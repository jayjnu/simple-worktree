import { parse } from 'yaml';
import { UsageError } from './errors.js';

export interface WorktreeHooks {
  postCreate: string[];
  preCleanup: string[];
  postCleanup: string[];
}

export interface WorktreeConfig {
  worktreeDir: string;
  copyFiles: string[];
  hooks: WorktreeHooks;
}

const DEFAULT_CONFIG: WorktreeConfig = {
  worktreeDir: '.worktrees',
  copyFiles: [],
  hooks: {
    postCreate: [],
    preCleanup: [],
    postCleanup: [],
  },
};

export function parseWorktreeConfig(source: string): WorktreeConfig {
  let value: unknown;
  try {
    value = parse(source) ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(`config YAML is invalid: ${message}`);
  }

  if (!isRecord(value)) {
    throw new UsageError('config root must be a YAML object');
  }

  if (value.hooks != null && !isRecord(value.hooks)) {
    throw new UsageError('hooks must be a YAML object');
  }

  const hooksValue = value.hooks ?? {};

  return {
    worktreeDir: stringValue(value.worktreeDir, DEFAULT_CONFIG.worktreeDir, 'worktreeDir'),
    copyFiles: stringArray(value.copyFiles, DEFAULT_CONFIG.copyFiles, 'copyFiles'),
    hooks: {
      postCreate: stringArray(hooksValue.postCreate, DEFAULT_CONFIG.hooks.postCreate, 'hooks.postCreate'),
      preCleanup: stringArray(hooksValue.preCleanup, DEFAULT_CONFIG.hooks.preCleanup, 'hooks.preCleanup'),
      postCleanup: stringArray(hooksValue.postCleanup, DEFAULT_CONFIG.hooks.postCleanup, 'hooks.postCleanup'),
    },
  };
}

export function defaultConfigSource(): string {
  return 'worktreeDir: .worktrees\n\ncopyFiles: []\n\nhooks:\n  postCreate: []\n  preCleanup: []\n  postCleanup: []\n';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string, label: string): string {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw new UsageError(`${label} must be a string`);
  return value;
}

function stringArray(value: unknown, fallback: string[], label: string): string[] {
  if (value == null) return [...fallback];
  if (!Array.isArray(value)) throw new UsageError(`${label} must be a list`);
  return value.map((entry, index) => {
    if (typeof entry !== 'string') throw new UsageError(`${label}[${index}] must be a string`);
    return entry;
  });
}
