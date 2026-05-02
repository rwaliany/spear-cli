/**
 * Sub-agent grader — runs the subjective grading pass in a fresh subprocess
 * with a focused, adversarial prompt. Solves the rubber-stamp problem
 * structurally: the drafting LLM never sees the grader's prompt or scoring
 * reasoning. Same model, fresh context, focused brief.
 *
 * Default grader command: `claude -p` (headless Claude Code, uses local auth).
 * Override with `--grader "<cmd>"` to use any tool that takes a prompt on
 * stdin and returns a `<spear-grade>...</spear-grade>` block on stdout.
 *
 * Output contract: the grader's stdout must contain one block of the form:
 *
 *   <spear-grade>
 *   {
 *     "metrics": [
 *       { "id": "M1", "score": 8, "evidence": "...", "below_10_reason": "..." }
 *     ],
 *     "failure_modes": [
 *       { "letter": "F", "open": true, "evidence": "..." }
 *     ]
 *   }
 *   </spear-grade>
 *
 * Anything else on stdout is ignored. Surrounding chatter is fine.
 */
import { spawn } from 'child_process';
import type { Defect, Evidence } from './types.js';

export interface GraderInput {
  cmd: string;          // e.g. "claude -p" or "claude --model haiku -p"
  prompt: string;       // full prompt: rubric + artifact + scoring instructions
  timeoutMs?: number;   // default 5 min
}

export interface GraderMetric {
  id: string;
  score: number;
  evidence?: string;
  below_10_reason?: string;
}

export interface GraderFailureMode {
  letter: string;
  open: boolean;
  evidence?: string;
}

export interface GraderOutput {
  metrics: GraderMetric[];
  failure_modes: GraderFailureMode[];
}

export interface GraderResult {
  output: GraderOutput;
  rawStdout: string;
  durationMs: number;
}

const GRADE_BLOCK_RE = /<spear-grade>([\s\S]*?)<\/spear-grade>/i;

export async function runGrader(input: GraderInput): Promise<GraderResult> {
  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? 300_000;

  const parts = input.cmd.split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error('Empty grader command');
  const [bin, ...args] = parts;

  const stdout = await new Promise<string>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdoutBuf = '';
    let stderrBuf = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`grader timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on('data', (b) => { stdoutBuf += b.toString(); });
    proc.stderr.on('data', (b) => { stderrBuf += b.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`grader '${input.cmd}' exited ${code}: ${stderrBuf.slice(0, 500)}`));
      } else {
        resolve(stdoutBuf);
      }
    });
    proc.stdin.end(input.prompt);
  });

  const m = stdout.match(GRADE_BLOCK_RE);
  if (!m) {
    throw new Error(
      `grader output missing <spear-grade>...</spear-grade> block. Got ${stdout.length} bytes of stdout. ` +
        `First 200 chars: ${stdout.slice(0, 200)}`,
    );
  }
  let parsed: GraderOutput;
  try {
    parsed = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`grader output is not valid JSON inside <spear-grade>: ${(e as Error).message}`);
  }

  if (!Array.isArray(parsed.metrics)) parsed.metrics = [];
  if (!Array.isArray(parsed.failure_modes)) parsed.failure_modes = [];

  return {
    output: parsed,
    rawStdout: stdout,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Build the adversarial grader prompt. Inlines the rubric + artifact and
 * instructs the grader to default low and surface every violation.
 */
export function buildGraderPrompt(opts: {
  rubricMd: string;
  artifactText: string;
  artifactName: string;
  artifactType: string;
}): string {
  return `You are a strict, adversarial grader for SPEAR — a five-stage methodology for high-quality LLM work product. Your job is to find defects, not to validate. The artifact's author may have rubber-stamped their own work; catch them.

# Rubric to apply

${opts.rubricMd}

# Artifact (${opts.artifactType}: ${opts.artifactName})

${opts.artifactText}

# Your task

Score each metric in the rubric (1-10) and check each lettered failure mode.

Rules:
- Default to lower scores when in doubt. Generous grading is the failure mode you must avoid.
- A metric scores 10/10 only when there is concrete evidence the criterion is fully met. Cite the line, sentence, or section.
- If you cannot find concrete evidence, the score is below 10 and you must explain why.
- For lettered failure modes: list ALL that are open (set "open": true). Do not omit any.
- Be specific. "Voice is consistent" is not evidence. "First-person used in §1, §3, §5; no slips into second-person" is evidence.

# Output format

Return EXACTLY this structure inside a single <spear-grade>...</spear-grade> block on stdout. Any prose before or after the block is fine; only the JSON inside is parsed.

<spear-grade>
{
  "metrics": [
    {"id": "M1", "score": 8, "evidence": "concrete citation", "below_10_reason": "what would push it to 10"},
    {"id": "M2", "score": 10, "evidence": "concrete citation"}
  ],
  "failure_modes": [
    {"letter": "F", "open": true, "evidence": "where in the artifact the failure mode appears"}
  ]
}
</spear-grade>

The "id" field for metrics should match the rubric (M1, M2, ...). The "letter" field for failure modes should match the rubric's lettered list. Output every metric in the rubric. Output every failure mode you find open.`;
}

/**
 * Translate a grader's structured output into Evidence + Defect rows that
 * fit the existing assess pipeline.
 */
export function graderToEvidence(grader: GraderOutput): { evidence: Evidence[]; defects: Defect[] } {
  const evidence: Evidence[] = [];
  const defects: Defect[] = [];

  for (const m of grader.metrics) {
    const id = `grader.metric.${m.id}`;
    const passing = m.score === 10;
    evidence.push({
      id,
      kind: 'mechanical',
      description: `Grader metric ${m.id}: ${m.evidence ?? '(no evidence)'}`,
      pass: passing,
      expected: 10,
      actual: m.score,
      rubricRef: m.id,
    });
    if (!passing) {
      defects.push({
        unit: m.id,
        metric: `grader/${m.id}`,
        severity: m.score <= 6 ? 'high' : m.score <= 8 ? 'medium' : 'low',
        description: m.below_10_reason
          ? `Score ${m.score}/10. ${m.below_10_reason}`
          : `Score ${m.score}/10. ${m.evidence ?? '(no evidence)'}`,
        mechanical: false,
        evidenceId: id,
      });
    }
  }

  for (const fm of grader.failure_modes.filter((f) => f.open)) {
    const id = `grader.failure-mode.${fm.letter}`;
    evidence.push({
      id,
      kind: 'mechanical',
      description: `Grader failure mode ${fm.letter}: ${fm.evidence ?? '(no evidence)'}`,
      pass: false,
      expected: 'closed',
      actual: 'open',
      rubricRef: fm.letter,
    });
    defects.push({
      unit: `failure-mode/${fm.letter}`,
      metric: fm.letter,
      severity: 'medium',
      description: `Grader flagged failure mode ${fm.letter} as open. ${fm.evidence ?? ''}`,
      mechanical: false,
      evidenceId: id,
    });
  }

  return { evidence, defects };
}
