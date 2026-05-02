/**
 * spear status — show current phase + open defects.
 * Designed for piping: `spear status --json | jq .phase`
 */
import kleur from 'kleur';
import { existsSync } from 'fs';
import path from 'path';
import { readState, FILES } from '../state.js';

export async function statusCmd(opts: { json?: boolean }): Promise<void> {
  const state = await readState();
  if (!state) {
    if (opts.json) console.log(JSON.stringify({ initialized: false }));
    else console.log(kleur.dim('No SPEAR project here.'));
    process.exit(1);
  }

  const cwd = process.cwd();
  const status = {
    initialized: true,
    type: state.type,
    phase: state.phase,
    round: state.round,
    maxRounds: state.maxRounds,
    files: {
      scope: existsSync(path.join(cwd, FILES.scope)),
      plan: existsSync(path.join(cwd, FILES.plan)),
      assess: existsSync(path.join(cwd, FILES.assess)),
      resolve: existsSync(path.join(cwd, FILES.resolve)),
    },
    lastAssess: state.lastAssess,
  };

  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(kleur.bold('SPEAR project'));
  console.log(`  type:  ${kleur.cyan(status.type)}`);
  console.log(`  phase: ${kleur.cyan(status.phase)}`);
  console.log(`  round: ${status.round} / ${status.maxRounds}`);
  if (status.lastAssess) {
    console.log(`  last assess: ${status.lastAssess.defectCount} defect(s) @ ${status.lastAssess.timestamp}`);
  }
}
