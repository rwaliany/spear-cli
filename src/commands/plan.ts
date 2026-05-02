/**
 * spear plan — validate PLAN.md exists and has a numbered step list.
 * Does NOT generate the plan content — that's Claude's job. The CLI just
 * enforces "PLAN.md must exist and be reviewed before Execute can start."
 */
import kleur from 'kleur';
import { readMd, readState, writeState } from '../state.js';

export async function planCmd(opts: { json?: boolean }): Promise<void> {
  const md = await readMd('plan');
  if (md === null) {
    fail('PLAN.md not found.', opts, 'Have Claude write the plan, then re-run.');
    return;
  }

  const stepCount = countSteps(md);
  const approved = isApproved(md);

  const report = {
    valid: stepCount > 0 && approved,
    stepCount,
    approved,
  };

  // Update state
  const state = await readState();
  if (state && report.valid) {
    state.phase = 'execute';
    await writeState(state);
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (report.valid) {
      console.log(kleur.green(`✓ PLAN.md is valid (${stepCount} steps, approved).`));
    } else {
      console.log(kleur.red('✗ PLAN.md is incomplete:'));
      if (stepCount === 0) console.log('  - no numbered steps found');
      if (!approved) console.log('  - not yet approved (mark `[x] User confirmed` in PLAN.md)');
    }
  }

  process.exit(report.valid ? 0 : 1);
}

function countSteps(md: string): number {
  // Count top-level numbered list items: lines starting with "1. ", "2. ", etc.
  const matches = md.match(/^\d+\.\s+/gm);
  return matches ? matches.length : 0;
}

function isApproved(md: string): boolean {
  return /\[x\]\s*User confirmed/i.test(md);
}

function fail(msg: string, opts: { json?: boolean }, hint?: string): void {
  if (opts.json) {
    console.log(JSON.stringify({ valid: false, error: msg, hint }));
  } else {
    console.error(kleur.red('✗ ' + msg));
    if (hint) console.error(kleur.dim('  ' + hint));
  }
  process.exit(1);
}
