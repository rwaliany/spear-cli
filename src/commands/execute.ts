/**
 * spear execute — run the artifact's deterministic build pipeline.
 * Per-artifact-type adapters define exactly which commands to run.
 */
import kleur from 'kleur';
import { readState, writeState } from '../state.js';
import { getAdapter } from '../adapters/index.js';

export async function executeCmd(opts: { json?: boolean }): Promise<void> {
  const state = await readState();
  if (!state) {
    fail('No SPEAR project found in current directory. Run `spear init <type>` first.', opts);
    return;
  }

  const adapter = getAdapter(state.type);
  const result = await adapter.execute(process.cwd());

  state.phase = result.success ? 'assess' : 'execute';
  await writeState(state);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      console.log(kleur.green('✓ Execute complete.'));
      for (const step of result.steps) {
        console.log(`  ${step.success ? kleur.green('✓') : kleur.red('✗')} ${step.name}`);
      }
    } else {
      console.log(kleur.red('✗ Execute failed.'));
      for (const step of result.steps) {
        console.log(`  ${step.success ? kleur.green('✓') : kleur.red('✗')} ${step.name}`);
        if (!step.success && step.error) {
          console.log(kleur.dim('    ' + step.error));
        }
      }
    }
  }

  process.exit(result.success ? 0 : 1);
}

function fail(msg: string, opts: { json?: boolean }): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: false, error: msg }));
  } else {
    console.error(kleur.red('✗ ' + msg));
  }
  process.exit(1);
}
