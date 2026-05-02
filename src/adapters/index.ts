/**
 * Adapter dispatcher. Every artifact type implements two methods:
 *   - execute(cwd): run the build pipeline, return per-step results
 *   - assess(cwd): score the artifact, return defects + evidence
 *
 * The CLI is artifact-agnostic; adapters know the build commands + checks.
 *
 * Evidence discipline: every assess pass MUST emit evidence.
 * Mechanical evidence has expected/actual/pass; subjective evidence points
 * the LLM at the artifact it must read. An assess without evidence is a bug.
 */
import { deckAdapter } from './deck.js';
import { blogAdapter } from './blog.js';
import { codeAdapter } from './code.js';
import { genericAdapter } from './generic.js';
import type { Defect, Evidence } from '../types.js';

export interface ExecuteResult {
  success: boolean;
  steps: Array<{ name: string; success: boolean; error?: string }>;
}

export interface AssessOutput {
  defects: Defect[];
  evidence: Evidence[];
}

export interface Adapter {
  execute(cwd: string): Promise<ExecuteResult>;
  assess(cwd: string, opts: { fast: boolean }): Promise<AssessOutput>;
}

const adapters: Record<string, Adapter> = {
  deck: deckAdapter,
  blog: blogAdapter,
  code: codeAdapter,
  generic: genericAdapter,
};

export function getAdapter(type: string): Adapter {
  const a = adapters[type];
  if (!a) throw new Error(`Unknown artifact type: ${type}`);
  return a;
}
