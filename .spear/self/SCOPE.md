# SCOPE — spear-cli/self

## Goal

Ship a deterministic TypeScript CLI that LLMs (Claude Code, Cursor, Copilot, Aider) call between the five phases of project work — Scope, Plan, Execute, Assess, Resolve — so the protocol is enforced by exit codes instead of self-asserted by the model. Quality bar: every documented command works, every adapter emits verifiable evidence, and the dogfood test (`spear init code self` against the source) passes the rubric the codebase claims to enforce.

## Audience

Engineers building LLM-driven workflows who are tired of probabilistic skills and prompt-based protocols. Two cohorts:

- **Heavy users**: people running multi-round assess loops on their own artifacts (decks, blogs, code modules) who need stable phase gates, structured defect lists, and per-round evidence on disk.
- **Onlookers**: readers of the methodology blog post who want to see the protocol in code form before adopting it. They install the CLI, run `spear init blog`, and walk through the loop in 60 seconds.

Both groups expect: zero hidden state, JSON output for every gate, exit codes that mean things, and no surprise file pollution at the repo root.

## Inputs

- The methodology essay at https://ryanwaliany.com/posts/09-spear (canonical source for the five phases and the "exit codes mean things" principle).
- The TypeScript source under `src/` (cli, state, types, evidence, report, pr, commands/, adapters/).
- The four template directories under `templates/<type>/` that `spear init` copies from.
- The MECE end-to-end harness at `scripts/e2e.sh` — currently 68 checks across CLI surface, scaffold, slug resolution, gates, evidence, history, atomic writes, stuck detection, report parsing, complete signal, image+config, resolve PR, list, dogfood.
- The user-installed runtime: Node ≥ 20 (native `fetch` for `spear image`), optional LibreOffice + pdftoppm for the deck adapter.

## Constraints

- **Deterministic behavior only.** No LLM calls from inside the CLI; every probabilistic decision is explicitly handed off to the caller via structured output (defects + evidence) and exit codes.
- **One namespace.** All SPEAR working files live under `.spear/<slug>/` so a repo can host multiple loops without root-level pollution. The spec files (SCOPE/PLAN/ASSESS/RESOLVE.md) are tracked; runtime state (state.json, rounds/, output/) is gitignored.
- **No external runtime deps beyond Node 20.** Native `fetch` for OpenAI; commander, kleur, zod for ergonomics. Per-adapter system deps (LibreOffice for deck) are documented but not required for install.
- **Atomic on-disk writes.** `state.json` and the four spec files write via temp + rename so Ctrl-C never corrupts state.
- **Evidence is mandatory.** Every assess pass MUST emit Evidence rows. An assess without evidence is a bug, not a soft expectation.
- **Backwards-compat for v0.2+.** Slug-aware paths are now the contract; future changes preserve them or ship a migration. v0.1 is dead (no users).
- **Apache 2.0 with author attribution.** No GPL or copyleft deps.

## Background

This project is the runtime distillation of lessons absorbed from many rounds of multi-loop iteration on prior artifacts (visual case studies of 30+ rounds, dozens of audit/code-quality loops). The patterns the rubric must encode:

- **Rubrics grow with iteration.** A first-pass rubric has 10 generic checks. After 30 rounds it has 47 specific ones. Each new check pays back forever — it never relaxes a future round.
- **Verify computed values, not claims.** Classes-on-an-element ≠ styles-applied. Tests-pass-locally ≠ CI-green. Always read the rendered artifact and compare measured values to expected.
- **Files on disk are the contract.** No DB, no in-memory truth. Every important value lands in a named file the LLM and reviewer can both read.
- **Atomic writes only.** Temp + rename. Ctrl-C mid-iteration cannot corrupt state.
- **Convergence is a decision, not a side-effect.** Zero defects ≠ done. The LLM declares completion via an explicit signal (`<spear-complete/>`). No bonus polish past the close.
- **Stuck loops must self-report.** Two rounds with the same defect count = stuck. Surface immediately so the LLM can revise approach instead of grinding to MAX_ROUNDS.
- **Mechanical / subjective split is load-bearing.** The CLI does deterministic work (file scans, build commands, JSON parsing). The LLM does judgment work (does the headline land? does the voice match?). Mixing them is the most common failure of prior systems.
- **Iteration protocol fits a watchdog.** Each round: orient (read state) → build (one item) → verify (no regressions) → update state (mark done) → report (emit `<spear-report>` block). Bigger items thrash the watchdog; smaller items don't accumulate.

## Principles

The cross-cutting rules every release of this CLI must preserve:

1. **No probabilistic decisions inside the CLI.** Anything requiring judgment is handed off via structured output + exit codes. The LLM (or human) is the judge; the CLI is the gate.
2. **Evidence is mandatory.** Every assess pass emits Evidence rows. Mechanical evidence has expected/actual/pass; subjective evidence points at the artifact with hash + size. An assess pass with zero evidence is a bug.
3. **Single namespace.** All working files live under `.spear/<slug>/`. Spec files (SCOPE/PLAN/ASSESS/RESOLVE.md) are tracked; runtime files (state.json, rounds/, output/) are gitignored. No top-level pollution.
4. **Slug-aware everything.** Multi-project repos are first-class. Every command resolves a slug; single-slug repos auto-detect; multi-slug repos require `--name` or `SPEAR_PROJECT`.
5. **Exit codes mean things.** 0 = pass, 1 = phase failed (validation gap), 2 = defects open, 3 = max rounds exhausted. Callers depend on these — never repurpose.
6. **The rubric grows with the iteration.** When a new failure mode is discovered, it gets a letter and lands in this project's `.spear/<slug>/ASSESS.md`. Letters are append-only; once `J` is taken, never reuse.
7. **Reporting is the close-out's job.** After applying fixes, the LLM writes `<spear-report>` blocks that the CLI parses on the next loop call. These persist into state and feed the resolve closure document.

## Done means

- All 12 documented commands run end-to-end with the documented options and exit codes.
- Every adapter (deck, blog, code, generic) emits both mechanical (pass/expected/actual) and subjective (artifact + hash + size) evidence.
- `scripts/e2e.sh` passes 68/68 across MECE categories: CLI shape, init, multi-slug, scope/plan gates, execute, assess+evidence, per-round history, atomic writes, stuck detection, report parsing, complete signal, image+config, resolve PR, list, dogfood.
- The dogfood test (`spear init code self` against the spear-cli source itself) passes its own scope validator and emits a non-empty evidence manifest.
- The README and docs match the actual CLI surface — no stale flags, no removed commands, no orphan paths.
- The repo is published at https://github.com/rwaliany/spear-cli with Apache 2.0 + author attribution; CI builds on every push.

`MAX_ROUNDS = 20`
