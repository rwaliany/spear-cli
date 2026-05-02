/**
 * Generic adapter — open-ended artifacts. The CLI can't run a build here;
 * Execute is a no-op that just verifies workspace/ has files. All assessment
 * is deferred to the LLM (read ASSESS.md, score the output).
 *
 * Evidence: emit one row per file in workspace/ so the LLM has hashes/sizes
 * for everything it might be asked to score.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import type { Adapter, AssessOutput, ExecuteResult } from './index.js';
import type { Defect, Evidence } from '../types.js';
import { fileEvidence, valueEvidence } from '../evidence.js';

export const genericAdapter: Adapter = {
  async execute(cwd: string): Promise<ExecuteResult> {
    const ws = path.join(cwd, 'workspace');
    const exists = existsSync(ws) && readdirSync(ws).length > 0;
    return {
      success: exists,
      steps: [{ name: 'workspace has content', success: exists, error: exists ? undefined : 'Add files to workspace/' }],
    };
  },

  async assess(cwd: string, opts: { fast: boolean }): Promise<AssessOutput> {
    const defects: Defect[] = [];
    const evidence: Evidence[] = [];
    const ws = path.join(cwd, 'workspace');

    if (!existsSync(ws)) {
      evidence.push(
        valueEvidence({
          id: 'generic.workspace.exists',
          description: 'workspace/ directory exists',
          pass: false,
          expected: 'exists',
          actual: 'missing',
        }),
      );
      return { defects, evidence };
    }

    const files: string[] = [];
    walk(ws, ws, files);
    evidence.push(
      valueEvidence({
        id: 'generic.workspace.file-count',
        description: 'Files under workspace/',
        pass: files.length > 0,
        expected: '> 0',
        actual: files.length,
      }),
    );

    for (const rel of files) {
      const evId = `generic.workspace.${rel.replace(/[^A-Za-z0-9]+/g, '-')}`;
      evidence.push(
        await fileEvidence({
          id: evId,
          kind: 'subjective',
          description: `Score workspace/${rel} against ASSESS.md`,
          filePath: path.join('workspace', rel),
          cwd,
          rubricRef: 'ASSESS.md',
        }),
      );
    }

    if (!opts.fast) {
      defects.push({
        unit: 'workspace',
        metric: 'rubric',
        severity: 'medium',
        description: 'Score against ASSESS.md (custom rubric)',
        mechanical: false,
        evidenceId: 'generic.workspace.file-count',
      });
    }

    return { defects, evidence };
  },
};

function walk(root: string, dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(root, p, out);
    } else if (statSync(p).isFile()) {
      out.push(path.relative(root, p));
    }
  }
}
