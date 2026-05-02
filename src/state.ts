/**
 * State helpers — read/write the four canonical files (SCOPE/PLAN/ASSESS/RESOLVE)
 * and the .spear/ runtime directory.
 *
 * Per-round artifacts live under .spear/rounds/{N}/:
 *   assess.json     — full AssessResult for that round
 *   RESOLVE.md      — snapshot of RESOLVE.md as written that round
 *   evidence/       — copies (or hashes) of artifacts referenced by evidence
 *
 * State writes are atomic (temp + rename) to survive Ctrl-C mid-write.
 */
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

export const FILES = {
  scope: 'SCOPE.md',
  plan: 'PLAN.md',
  assess: 'ASSESS.md',
  resolve: 'RESOLVE.md',
  state: '.spear/state.json',
} as const;

export interface SpearState {
  type: 'deck' | 'blog' | 'code' | 'generic';
  round: number;
  phase: 'scope' | 'plan' | 'execute' | 'assess' | 'resolve' | 'converged';
  maxRounds: number;
  lastAssess?: {
    defectCount: number;
    evidenceCount?: number;
    timestamp: string;
    fixed?: number;          // from <spear-report> COMPLETED-style fields
    progress?: string;
  };
  lastRoundDefectCount?: number;
  stuckSince?: number;       // round number when defectCount plateaued
  failureReason?: string;    // adapter execute failure summary
  blockers?: string;         // last reported BLOCKERS line (non-"None" = blocked)
  completedAt?: string;      // ISO timestamp when <spear-complete/> was honored
  history?: Array<{
    round: number;
    defectCount: number;
    durationMs?: number;
    exitCode?: number;
    timestamp: string;
  }>;
}

export async function readState(cwd: string = process.cwd()): Promise<SpearState | null> {
  const p = path.join(cwd, FILES.state);
  if (!existsSync(p)) return null;
  return JSON.parse(await fs.readFile(p, 'utf-8'));
}

/**
 * Atomic state write: serialize to a sibling .tmp file, then rename. Rename
 * is atomic on POSIX, so a partial write or Ctrl-C between steps cannot
 * leave state.json half-written.
 */
export async function writeState(state: SpearState, cwd: string = process.cwd()): Promise<void> {
  const p = path.join(cwd, FILES.state);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await fs.rename(tmp, p);
}

export async function readMd(name: keyof typeof FILES, cwd: string = process.cwd()): Promise<string | null> {
  const p = path.join(cwd, FILES[name]);
  if (!existsSync(p)) return null;
  return fs.readFile(p, 'utf-8');
}

export async function writeMd(name: keyof typeof FILES, content: string, cwd: string = process.cwd()): Promise<void> {
  const p = path.join(cwd, FILES[name]);
  const tmp = `${p}.tmp.${process.pid}`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, p);
}

export function projectExists(cwd: string = process.cwd()): boolean {
  return existsSync(path.join(cwd, FILES.scope));
}

/**
 * Per-round directory. Round numbers are 1-indexed (round 1 = first assess).
 */
export function roundDir(round: number, cwd: string = process.cwd()): string {
  return path.join(cwd, '.spear', 'rounds', String(round));
}

export async function ensureRoundDir(round: number, cwd: string = process.cwd()): Promise<string> {
  const dir = roundDir(round, cwd);
  await fs.mkdir(path.join(dir, 'evidence'), { recursive: true });
  return dir;
}

export function evidenceDir(round: number, cwd: string = process.cwd()): string {
  return path.join(roundDir(round, cwd), 'evidence');
}
