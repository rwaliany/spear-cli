# PLAN — spear-cli/self

## Approach

This is a retroactive plan documenting the architecture choices already shipped through v0.2.0. It's organized around the four design decisions that drove every other line of code, then the concrete numbered steps that realize them.

## Design decisions

1. **Deterministic CLI, not a probabilistic skill.** A skill (markdown the model reads) lets the LLM decide which steps to follow and how strictly. A CLI is the same input → same output every time. Mechanical work (validate SCOPE.md, count words, render JPEGs, parse JSON) lives in the CLI; subjective work (does the headline land? does the slide pass MECE?) stays with the LLM. This single decision shapes every command boundary.

2. **Evidence is the assess output, not just defects.** Every assess pass emits structured Evidence rows: mechanical (expected/actual/pass) for measurable claims, subjective (artifact + hash + size + rubric reference) for items the LLM must judge. An assess pass without evidence is a bug. Evidence files persist into per-round directories so a reviewer can replay any check.

3. **Files on disk are the contract.** No DB, no in-memory truth. Every phase reads/writes named markdown files; every round persists `assess.json`, `evidence.json`, `RESOLVE.md` snapshot, and copied artifacts under `.spear/<slug>/rounds/N/`. State writes are atomic (temp + rename) so Ctrl-C can never corrupt.

4. **Multi-slug per repo from day one.** Real workflows want a deck + a blog + the code itself iterating in parallel. Each gets a slug-named subdir under `.spear/`. Single-slug repos auto-resolve; multi-slug repos require `--name <slug>` or `SPEAR_PROJECT=<slug>`. This pushed slug-awareness through every command and the runner.

## Steps (implemented)

1. **Define the canonical state shape.** `src/types.ts` declares `Defect`, `Evidence`, `SpearReport`, `AssessResult`, `Status`, and `SpearState` as zod schemas. Every command's `--json` output validates against one of these.

2. **Slug-aware path helpers.** `src/state.ts` exposes `projectDir(slug)`, `specPath(slug, name)`, `statePath(slug)`, `roundDir(slug, round)`, `evidenceDir(slug, round)` plus `resolveSlug(opt)` that auto-detects single-slug repos and errors clearly on multi-slug ambiguity. `readState`/`writeState`/`readMd`/`writeMd` all take slug as the first argument and write atomically.

3. **Adapter contract.** `src/adapters/index.ts` defines `AdapterContext { cwd, slug, projectDir, workspaceDir }` and the two-method `Adapter` interface (`execute`, `assess`). `buildContext()` resolves `workspaceDir` per type — code adapters scan the surrounding repo, all others scope to `.spear/<slug>/workspace/`. Four built-in adapters: deck, blog, code, generic.

4. **Evidence emission helpers.** `src/evidence.ts` provides `valueEvidence()` (mechanical pass/fail) and `fileEvidence()` (subjective with hash + size + cwd-relative artifact path). `persistEvidence()` copies referenced artifacts into `.spear/<slug>/rounds/N/evidence/` and writes `evidence.json` atomically.

5. **Report + complete signal parsing.** `src/report.ts` parses `<spear-report>` blocks and `<spear-complete/>` from RESOLVE.md. Strips fenced code blocks first so boilerplate templates don't false-trigger. The complete tag must be alone on its line.

6. **PR / closeout renderer.** `src/pr.ts` renders highlights / lowlights / what-to-test / warnings / next-steps from state + parsed reports + per-round evidence. Customizable via `.spear/<slug>/pr-template.md` with `{{var}}` substitution. Variables: title, summary, highlights, lowlights, whatToTest, warnings, nextSteps, rounds, evidenceCount, defectsRemaining, defectsFixed, generatedAt, type, slug, status.

7. **Twelve commands wired through cli.ts.** `init [type] [name]` (positional name defaults to type), `scope`, `plan`, `execute`, `assess`, `resolve` (close-out by default; `--next` and `--apply` legacy), `loop`, `status`, `list`, `runner`, `image`, `config`. Every phase command takes `--name <slug>`. Single-slug repos auto-resolve.

8. **Stuck-loop detection.** `assess` and `loop` both compare `defectCount` to the prior round; on plateau ≥ 2 rounds, set `state.stuckSince` and surface the warning in stdout, RESOLVE.md, and the runner status.

9. **Multi-loop runner.** `src/commands/runner.ts` discovers projects two ways: by default it descends into `.spear/<slug>/state.json` for every slug in cwd; with `--paths a,b,c` it aggregates across multiple repos. Five-state status glyphs (✅ ⏸ 🟡 ⚠ 🔴) reflect completed / pending / in-progress / stuck / failed.

10. **Image + config commands.** `spear image` posts to OpenAI's `/v1/images/generations` (gpt-image-2) with `--prompt`, `--out`, `--size`/`--aspect`, `--quality`, `--force`. `spear config set/get/unset/list` manages `~/.spear/config.json` (mode 600) for the OpenAI key, masked when displayed.

11. **MECE end-to-end harness.** `scripts/e2e.sh` runs 68 checks across 15 categories: CLI shape, init+scaffold (4 types + custom name + invalid-name rejection), multi-slug coexistence + resolution, scope/plan gates, execute, assess+evidence per adapter, per-round dirs, atomic writes, stuck detection, report parsing (4 sub-cases including BLOCKERS), complete signal (inline-mention vs own-line), image+config error paths, resolve PR (6 sub-cases including custom template), `spear list`, and the dogfood (`init code self` on spear-cli itself).

12. **Apache 2.0 license + initial publish.** Repo at https://github.com/rwaliany/spear-cli, GitHub Actions build CI, README + four docs (methodology, design-principles, claude-code-quickstart, extending) match the v0.2.0 surface.

- [x] User confirmed
