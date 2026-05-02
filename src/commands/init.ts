/**
 * spear init <type> — scaffold a SPEAR project.
 * Deterministic file copy from templates/<type>/ into cwd.
 */
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import kleur from 'kleur';
import { writeState } from '../state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', 'templates');

const VALID_TYPES = ['deck', 'blog', 'code', 'generic'] as const;
type ProjectType = (typeof VALID_TYPES)[number];

export async function initCmd(type: string, opts: { force?: boolean }): Promise<void> {
  if (!VALID_TYPES.includes(type as ProjectType)) {
    console.error(kleur.red(`Unknown type: ${type}`));
    console.error(`Valid types: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const src = path.join(TEMPLATES_DIR, type);
  const dst = process.cwd();

  if (!existsSync(src)) {
    console.error(kleur.red(`Template not found: ${src}`));
    console.error('The CLI may not be installed correctly.');
    process.exit(1);
  }

  // Copy canonical files
  for (const file of ['SCOPE.md', 'PLAN.md', 'ASSESS.md', 'RESOLVE.md']) {
    const srcFile = path.join(src, file);
    const dstFile = path.join(dst, file);
    if (existsSync(dstFile) && !opts.force) {
      console.error(kleur.yellow(`Exists, skipping: ${file} (--force to overwrite)`));
      continue;
    }
    if (existsSync(srcFile)) {
      await fs.copyFile(srcFile, dstFile);
      console.log(kleur.green('  + ') + file);
    }
  }

  // Create workspace + output directories
  for (const dir of ['workspace', 'output']) {
    await fs.mkdir(path.join(dst, dir), { recursive: true });
  }

  // Type-specific scaffolding (e.g., starter package.json for deck)
  if (type === 'deck') {
    const pkgPath = path.join(dst, 'workspace', 'deck', 'package.json');
    if (!existsSync(pkgPath)) {
      await fs.mkdir(path.dirname(pkgPath), { recursive: true });
      await fs.writeFile(
        pkgPath,
        JSON.stringify(
          {
            name: 'deck',
            type: 'module',
            private: true,
            dependencies: { pptxgenjs: '^3.12.0' },
          },
          null,
          2,
        ) + '\n',
      );
      console.log(kleur.green('  + ') + 'workspace/deck/package.json');
    }
  }

  // Initialize state
  await writeState({
    type: type as ProjectType,
    round: 0,
    phase: 'scope',
    maxRounds: 20,
  }, dst);

  console.log();
  console.log(kleur.bold('✓ SPEAR project initialized.'));
  console.log();
  console.log('Next steps:');
  console.log(`  1. Edit ${kleur.cyan('SCOPE.md')} — fill in goal, audience, constraints, done means`);
  console.log(`  2. Run ${kleur.cyan('spear scope')} to validate scope`);
  console.log(`  3. Run ${kleur.cyan('spear loop')} to execute the full SPEAR pipeline`);
}
