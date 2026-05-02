/**
 * spear runner — multi-loop status reporter for parallel SPEAR projects.
 *
 * Watches multiple SPEAR projects (one per subdirectory or via --paths) and
 * prints a structured status table every N minutes. The table is the only
 * output — no narrative, no summaries — so it can be piped or diffed.
 *
 * Use cases:
 *   - Multiple deck variants iterating in parallel
 *   - Multiple SPEAR loops running on different code modules
 *   - CI dashboard (run with --once and parse stdout)
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import kleur from 'kleur';
import { readState, FILES } from '../state.js';

interface RunnerOpts {
  paths?: string;
  interval?: string;
  once?: boolean;
  json?: boolean;
}

interface LoopStatus {
  id: string;
  cwd: string;
  scope: string;
  plan: string;
  execute: string;
  assess: string;
  resolve: string;
  counts: string;
  cursor: string;
  lastCommit: string;
  action: string;
}

const PHASE_GLYPH: Record<string, string> = {
  pending: '⏸',
  scope: '🟡',
  plan: '🟡',
  execute: '🟡',
  assess: '🟡',
  resolve: '🟡',
  converged: '✅',
  done: '✅',
  blocked: '❌',
};

export async function runnerCmd(opts: RunnerOpts): Promise<void> {
  const interval = parseInt(opts.interval ?? '300', 10) * 1000;
  const projects = await discover(opts.paths);

  if (projects.length === 0) {
    console.error(kleur.red('No SPEAR projects found.'));
    console.error(kleur.dim('Pass --paths a,b,c or run from a directory with subdirectories that contain .spear/state.json.'));
    process.exit(1);
  }

  do {
    const statuses = await Promise.all(projects.map((p) => statusOf(p)));
    if (opts.json) {
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), loops: statuses }, null, 2));
    } else {
      print(statuses);
    }
    if (opts.once) break;
    await sleep(interval);
  } while (true);
}

async function discover(paths?: string): Promise<string[]> {
  if (paths) {
    return paths.split(',').map((p) => path.resolve(p.trim()));
  }
  // Auto-discover: subdirectories of cwd that contain .spear/state.json
  const cwd = process.cwd();
  const out: string[] = [];
  if (existsSync(path.join(cwd, FILES.state))) out.push(cwd);
  for (const e of readdirSync(cwd, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const child = path.join(cwd, e.name);
    if (existsSync(path.join(child, FILES.state))) out.push(child);
  }
  return out;
}

async function statusOf(cwd: string): Promise<LoopStatus> {
  const id = path.basename(cwd);
  const state = await readState(cwd);
  const phase = state?.phase ?? 'pending';
  const round = state?.round ?? 0;
  const maxRounds = state?.maxRounds ?? 20;

  const has = (f: keyof typeof FILES) => existsSync(path.join(cwd, FILES[f])) ? '✅' : '⏸';
  const phaseGlyph = (target: string) =>
    phase === target ? `🟡 r${round}/${maxRounds}` :
    phaseAfter(phase, target) ? '✅' : '⏸';

  const counts = formatCounts(state);
  const cursor = lastCommitSha(cwd);
  const lastCommit = lastCommitMsg(cwd);
  const action = inferAction(state, cwd);

  return {
    id,
    cwd,
    scope: has('scope'),
    plan: has('plan'),
    execute: phaseGlyph('execute'),
    assess: phaseGlyph('assess'),
    resolve: phaseGlyph('resolve'),
    counts,
    cursor,
    lastCommit,
    action,
  };
}

const PHASE_ORDER = ['scope', 'plan', 'execute', 'assess', 'resolve', 'converged'];
function phaseAfter(current: string, target: string): boolean {
  return PHASE_ORDER.indexOf(current) > PHASE_ORDER.indexOf(target);
}

function formatCounts(state: Awaited<ReturnType<typeof readState>>): string {
  if (!state || !state.lastAssess) return '—';
  return `${state.lastAssess.defectCount} defect(s) @ r${state.round}`;
}

function lastCommitSha(cwd: string): string {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--short', 'HEAD'], { stdio: 'pipe' });
  return r.status === 0 ? r.stdout.toString().trim() : '—';
}

function lastCommitMsg(cwd: string): string {
  const r = spawnSync('git', ['-C', cwd, 'log', '-1', '--pretty=%h — %s'], { stdio: 'pipe' });
  return r.status === 0 ? r.stdout.toString().trim().slice(0, 60) : '—';
}

function inferAction(state: Awaited<ReturnType<typeof readState>>, _cwd: string): string {
  if (!state) return 'init';
  switch (state.phase) {
    case 'scope': return 'fill SCOPE.md';
    case 'plan': return 'have LLM write PLAN.md';
    case 'execute': return 'spear execute';
    case 'assess': return 'spear assess';
    case 'resolve': return state.lastAssess
      ? `LLM applies fixes for ${state.lastAssess.defectCount} defect(s)`
      : 'spear resolve';
    case 'converged': return '✓ done';
    default: return '—';
  }
}

function print(statuses: LoopStatus[]): void {
  const ts = new Date().toISOString();
  console.log(`=== SPEAR check-in — ${ts} ===`);
  console.log();
  const header = pad('Loop', 12) + pad('S', 4) + pad('P', 4) + pad('E', 14) + pad('A', 14) + pad('R', 8) + pad('Counts', 30) + pad('Cursor', 8) + pad('Last commit', 60) + 'Action';
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const s of statuses) {
    console.log(
      pad(s.id, 12) +
      pad(s.scope, 4) +
      pad(s.plan, 4) +
      pad(s.execute, 14) +
      pad(s.assess, 14) +
      pad(s.resolve, 8) +
      pad(s.counts, 30) +
      pad(s.cursor, 8) +
      pad(s.lastCommit, 60) +
      s.action,
    );
  }
}

function pad(s: string, n: number): string {
  // Account for emoji width — emoji and other wide chars count as 1 in .length
  // but typically display as 2 columns. Approximate by counting wide chars.
  const visible = stripWide(s);
  return s + ' '.repeat(Math.max(0, n - visible.length));
}

function stripWide(s: string): string {
  // For padding purposes: count emoji as 2 chars wide
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0x1F000) w += 2;
    else w += 1;
  }
  return ' '.repeat(w);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
