# ASSESS — spear-cli/self

The rubric for this project. Maps directly to SCOPE.md "Done means". Score each metric 1–10. Convergence requires every metric 10/10 AND zero open lettered failure modes.

## Scored metrics

| # | Metric | Mechanical | What |
|---|---|---|---|
| 1 | Functional surface | yes | All 12 commands appear in `spear --help`: init, scope, plan, execute, assess, resolve, loop, status, list, runner, image, config |
| 2 | E2E suite | yes | `bash scripts/e2e.sh` exits 0 with `68/68 passed` (or higher as suite grows) |
| 3 | Build clean | yes | `npm run build` (tsc) exits 0 with zero errors |
| 4 | CI green | yes | Latest commit on `main` has `gh pr checks` (or build workflow) green |
| 5 | Adapter contract | yes | Every adapter (deck/blog/code/generic) implements `execute(ctx)` + `assess(ctx, opts)`; both methods accept `AdapterContext { cwd, slug, projectDir, workspaceDir }` |
| 6 | Evidence emission | yes | Every adapter's `assess` returns ≥1 Evidence row. Mechanical evidence has `pass`/`expected`/`actual`; subjective evidence has `artifact`/`artifactHash`/`artifactSize` |
| 7 | Files-on-disk discipline | yes | `state.json` writes via temp + rename (search source for `tmp.${process.pid}` pattern); per-round dirs at `.spear/<slug>/rounds/N/{assess.json, evidence.json, evidence/, RESOLVE.md}` |
| 8 | Slug-aware paths | yes | No hardcoded `SCOPE.md` / `PLAN.md` / `ASSESS.md` / `RESOLVE.md` at cwd root in source. All path construction goes through `state.ts` helpers (`specPath`, `statePath`, `roundDir`, `projectDir`) |
| 9 | Gitignore split correct | yes | `.gitignore` excludes `.spear/*/state.json`, `.spear/*/rounds/`, `.spear/*/output/`, `.spear/*/workspace/node_modules/`, `.spear/*/*.tmp.*`. Spec files (SCOPE/PLAN/ASSESS/RESOLVE.md) are NOT excluded |
| 10 | Code hygiene (CLI-aware) | yes | No `:any` type annotations outside string literals/comments; `console.log` permitted only in `src/commands/*`, `src/cli.ts`, and adapters' user-output paths; no `// TODO` / `// FIXME` in shipped code |
| 11 | README ↔ help parity | no | Every command listed in `spear --help` appears in README's command table; every flag documented in README exists in source |
| 12 | Doc fidelity | no | `docs/methodology.md`, `docs/design-principles.md`, `docs/claude-code-quickstart.md`, `docs/extending.md` reflect the v0.2 surface (slug-aware paths, evidence discipline, close-out signal). No references to v0.1 layout |
| 13 | Error messages actionable | no | Every error path includes a next action: missing API key → "set OPENAI_API_KEY or run `spear config set openai-key sk-...`"; ambiguous slug → "Pick one with --name <slug>"; etc. |
| 14 | License + publish | yes | `LICENSE` is Apache 2.0 with copyright 2026 Ryan Waliany; `package.json` has `"license": "Apache-2.0"`; repo live at https://github.com/rwaliany/spear-cli |

## Lettered failure modes

Append-only. When a new failure pattern is discovered, add the next letter — never reuse, never renumber.

A. **`any` outside strings** — `:any` appears as a real type annotation (not as a regex/string literal). Source-of-truth: `grep -nE ':\s*any\b' src/**/*.ts` minus matches inside `'...'` or `"..."`.

B. **Build broken** — `npm run build` exits non-zero. tsc errors in any source file.

C. **README ≠ `--help` parity** — A command appears in `spear --help` but not in README's command table, or vice versa. A flag documented in README doesn't exist in the registered command.

D. **Adapter without evidence** — An adapter's `assess` method returns `{ defects, evidence: [] }` for any non-trivial input. Every adapter must emit Evidence (otherwise convergence is unverifiable).

E. **Empty-state regression** — A command crashes when run before `spear init` (instead of erroring cleanly with "No SPEAR project found"). Test by running each command in a fresh empty dir.

F. **Flag undocumented** — A flag exists in `cli.ts` registration but has no `--help` description. Flags must be self-documenting at the CLI layer.

G. **Gitignore leak** — A runtime file (`.spear/*/state.json`, rounds/, .tmp.*) is staged or committed. The split between tracked spec and ignored runtime must hold.

H. **Help mismatch** — `spear <cmd> --help` surfaces a flag or behavior not in README, OR README mentions one not in `--help`. Same parity rule as C, scoped per command.

I. **IO non-atomic** — A file write that goes directly to its target path without temp + rename. Search for `fs.writeFile` calls in `src/state.ts` / `src/evidence.ts` / `src/commands/*.ts` and verify each goes through the atomic pattern.

J. **JSON malformed** — A command's `--json` output isn't parseable as JSON (e.g., color escapes leaked, or trailing junk). Test by piping every `--json` command through `jq .`.

K. **Console-log debris** — `console.log` outside the user-output paths (`src/commands/*`, `src/cli.ts`). Library code (`src/state.ts`, `src/evidence.ts`, `src/report.ts`, `src/pr.ts`) must not log directly.

L. **License mismatch** — `LICENSE` file disagrees with `package.json` `license` field, or attribution line missing.

M. **Missing test** — A new adapter, command, or behavior shipped without coverage in `scripts/e2e.sh`. Every PR that adds a public surface must add an e2e check.

N. **Name pollution** — A slug accepts characters outside `^[a-z0-9][a-z0-9_-]*$/i`, or two slugs collide on a case-insensitive filesystem.

O. **Output leak** — A `.tmp.*` file is left in `.spear/` after a command completes (atomic-write rename failed silently).

P. **Prompt drift** — `spear image` request body or response handling diverges from documented behavior. Verify size validation, key resolution order, force-overwrite gating.

Q. **Stale doc reference** — A README/docs link points at a renamed file or removed path (e.g., `examples/lp-deck-snowball/` from v0.1).

R. **Phase-gate skip** — A command bypasses an upstream gate (e.g., `spear execute` runs even though `spear plan` exits 1). Test by running phases out of order.

S. **State corruption on Ctrl-C** — Kill a long-running command mid-write; `state.json` should remain valid JSON. Verify by interrupting `spear assess` and re-reading state.

T. **Exit code drift** — A command returns the wrong exit code for its semantic (e.g., `spear assess` exits 0 with open defects). Each command's exit table must match the documented contract.

## Convergence

PASS when every metric 10/10 AND zero open lettered failure modes AND `<spear-complete/>` signal in RESOLVE.md.

The LLM may close the loop with `<spear-complete/>` even if mechanical defects remain — but only if those defects are explicitly documented as known-acceptable in this ASSESS.md (add a "Known acceptable" subsection if needed; otherwise fix them).

## Known acceptable

These items are explicitly approved during a SPEAR round and do not block convergence. Each entry names what was checked, why it's acceptable, and (if applicable) what would invalidate the exemption.

- **Code adapter's generic scan flags `console.log` in `src/commands/*` and `src/cli.ts`.** Those console.log calls are intentional CLI output (every user-facing command writes structured text via console.log + kleur). The generic `code` rubric was written for library code, not CLI tools where stdout is the contract. Failure-mode K (console-log debris) only applies to library files like `src/state.ts` / `src/evidence.ts` / `src/report.ts` / `src/pr.ts`, which are clean.

- **Code adapter's generic scan flags one `:any` match in `src/adapters/code.ts`.** The match is the literal string `'Source files containing \`: any\` annotations'` — the description text of the check itself, not a real type annotation. Failure-mode A (any outside strings) is not violated. A real type annotation `: any` would still be a defect.

- **M4 CI red due to GitHub Actions billing lock on the account.** The `Build` workflow at `.github/workflows/build.yml` is correctly configured (npm ci + npm run build on Node 20). Runs are aborted with `The job was not started because your account is locked due to a billing issue` before any step executes. Code is shippable; CI will turn green once billing is resolved. Invalidated if the workflow fails for any reason other than the billing lock.

- **`spear init` writes `workspace/deck/package.json` non-atomically.** This is a one-time setup write during scaffold; if interrupted, the user re-runs `spear init <type> [name] --force`. Failure-mode I (IO non-atomic) does not apply to one-shot init artifacts.
