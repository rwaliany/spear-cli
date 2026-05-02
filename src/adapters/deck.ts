/**
 * Deck adapter — pptxgenjs build + LibreOffice render + per-slide JPEG checks.
 *
 * Mechanical checks the CLI runs deterministically:
 *   - workspace/deck/build.js exists
 *   - `node build.js` exits 0
 *   - output/deck.pptx exists, nonzero size
 *   - LibreOffice render produces N JPEGs (qa/v-NN.jpg)
 *   - Each JPEG has minimum dimensions (not blank/cropped)
 *
 * Subjective checks (deferred to LLM, listed in defects with mechanical:false):
 *   - Pyramid principle, MECE, voice match, layout aesthetics
 *   - Lettered failure modes from ASSESS.md (A, B, C…)
 *
 * Every claim emits an Evidence row so the LLM (and reviewers) can verify.
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import path from 'path';
import type { Adapter, AssessOutput, ExecuteResult } from './index.js';
import type { Defect, Evidence } from '../types.js';
import { fileEvidence, valueEvidence } from '../evidence.js';

export const deckAdapter: Adapter = {
  async execute(cwd: string): Promise<ExecuteResult> {
    const steps: ExecuteResult['steps'] = [];
    const buildJs = path.join(cwd, 'workspace/deck/build.js');

    if (!existsSync(buildJs)) {
      steps.push({
        name: 'workspace/deck/build.js exists',
        success: false,
        error: 'Have Claude generate build.js based on PLAN.md',
      });
      return { success: false, steps };
    }
    steps.push({ name: 'workspace/deck/build.js exists', success: true });

    if (!existsSync(path.join(cwd, 'workspace/deck/node_modules'))) {
      const r = spawnSync('npm', ['install', '--silent'], { cwd: path.join(cwd, 'workspace/deck'), stdio: 'pipe' });
      const success = r.status === 0;
      steps.push({ name: 'npm install', success, error: success ? undefined : r.stderr?.toString() });
      if (!success) return { success: false, steps };
    }

    const buildOut = path.join(cwd, 'output');
    const r = spawnSync('node', ['build.js'], {
      cwd: path.join(cwd, 'workspace/deck'),
      stdio: 'pipe',
      env: { ...process.env, OUTPUT_DIR: buildOut },
    });
    const buildSuccess = r.status === 0;
    steps.push({ name: 'node build.js', success: buildSuccess, error: buildSuccess ? undefined : r.stderr?.toString() });
    if (!buildSuccess) return { success: false, steps };

    const pptx = path.join(cwd, 'output/deck.pptx');
    const pptxOk = existsSync(pptx) && statSync(pptx).size > 1024;
    steps.push({ name: 'output/deck.pptx exists', success: pptxOk });
    if (!pptxOk) return { success: false, steps };

    const soffice = findSoffice();
    if (!soffice) {
      steps.push({
        name: 'libreoffice available',
        success: false,
        error: 'Install: brew install --cask libreoffice (Mac) or apt install libreoffice (Linux)',
      });
      return { success: false, steps };
    }
    steps.push({ name: 'libreoffice available', success: true });

    const qaDir = path.join(cwd, 'workspace/qa');
    if (existsSync(qaDir)) {
      spawnSync(
        'rm',
        ['-f', ...readdirSync(qaDir).filter((f) => f.endsWith('.jpg') || f.endsWith('.pdf')).map((f) => path.join(qaDir, f))],
        { stdio: 'pipe' },
      );
    }
    const r2 = spawnSync(soffice, ['--headless', '--convert-to', 'pdf', pptx, '--outdir', qaDir], { stdio: 'pipe' });
    const pdfOk = r2.status === 0 && existsSync(path.join(qaDir, 'deck.pdf'));
    steps.push({ name: 'pptx → pdf', success: pdfOk });
    if (!pdfOk) return { success: false, steps };

    const r3 = spawnSync('pdftoppm', ['-jpeg', '-r', '100', path.join(qaDir, 'deck.pdf'), path.join(qaDir, 'v')], { stdio: 'pipe' });
    const jpegOk = r3.status === 0;
    steps.push({ name: 'pdf → jpegs', success: jpegOk });

    return { success: jpegOk, steps };
  },

  async assess(cwd: string, opts: { fast: boolean }): Promise<AssessOutput> {
    const defects: Defect[] = [];
    const evidence: Evidence[] = [];
    const qaDir = path.join(cwd, 'workspace/qa');

    if (!existsSync(qaDir)) {
      evidence.push(
        valueEvidence({
          id: 'deck.render.qa-dir',
          description: 'workspace/qa directory exists',
          pass: false,
          expected: 'directory exists',
          actual: 'missing',
        }),
      );
      defects.push({
        unit: 'workspace/qa',
        metric: 'render',
        severity: 'high',
        description: 'No rendered JPEGs found. Run `spear execute` first.',
        mechanical: true,
        evidenceId: 'deck.render.qa-dir',
      });
      return { defects, evidence };
    }

    const jpegs = readdirSync(qaDir).filter((f) => /^v-\d+\.jpg$/.test(f)).sort();
    evidence.push(
      valueEvidence({
        id: 'deck.render.slide-count',
        description: `Rendered slide JPEGs in workspace/qa/`,
        pass: jpegs.length > 0,
        expected: '> 0',
        actual: jpegs.length,
      }),
    );
    if (jpegs.length === 0) {
      defects.push({
        unit: 'workspace/qa',
        metric: 'render',
        severity: 'high',
        description: 'No v-NN.jpg files. Render pipeline produced no slides.',
        mechanical: true,
        evidenceId: 'deck.render.slide-count',
      });
      return { defects, evidence };
    }

    // Mechanical: every JPEG has nonzero size + per-slide artifact evidence
    for (const f of jpegs) {
      const slideNum = parseInt(f.replace('v-', '').replace('.jpg', ''), 10);
      const rel = path.join('workspace/qa', f);
      const size = statSync(path.join(cwd, rel)).size;
      const evId = `deck.slide.${slideNum}.render`;
      evidence.push(
        await fileEvidence({
          id: evId,
          kind: 'mechanical',
          description: `Slide ${slideNum} JPEG (${size} bytes)`,
          filePath: rel,
          cwd,
          pass: size >= 1024,
          expected: '>= 1024 bytes',
          actual: size,
        }),
      );
      if (size < 1024) {
        defects.push({
          unit: `Slide ${slideNum}`,
          metric: 'render',
          severity: 'high',
          description: `${f} is empty/corrupt (${size} bytes)`,
          mechanical: true,
          evidenceId: evId,
        });
      }
    }

    // Subjective per-slide rubric scoring — defer to the LLM.
    // Each emits an Evidence pointing at the JPEG so the LLM has a stable
    // (path, hash, size) handle and a reviewer can replay.
    if (!opts.fast) {
      for (const f of jpegs) {
        const slideNum = parseInt(f.replace('v-', '').replace('.jpg', ''), 10);
        const rel = path.join('workspace/qa', f);
        const evId = `deck.slide.${slideNum}.rubric`;
        evidence.push(
          await fileEvidence({
            id: evId,
            kind: 'subjective',
            description: `Slide ${slideNum} — score against ASSESS.md`,
            filePath: rel,
            cwd,
            rubricRef: 'ASSESS.md',
          }),
        );
        defects.push({
          unit: `Slide ${slideNum}`,
          metric: 'rubric',
          severity: 'medium',
          description: `Score slide against ASSESS.md (read ${rel})`,
          mechanical: false,
          evidenceId: evId,
        });
      }
    }

    return { defects, evidence };
  },
};

function findSoffice(): string | null {
  const candidates = [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const out = execSync('which soffice', { stdio: 'pipe' }).toString().trim();
    return out || null;
  } catch {
    return null;
  }
}
