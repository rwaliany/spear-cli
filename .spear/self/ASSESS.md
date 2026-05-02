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

U. **Empty-state crash** — Running any command in a fresh repo (no `.spear/`, no init) crashes (uncaught exception, ENOENT, parse error) instead of erroring cleanly with a "No SPEAR project found. Run `spear init`" message.

V. **State-corruption crash** — Manually corrupting `.spear/<slug>/state.json` (truncated, invalid JSON, missing required fields) crashes commands instead of erroring with an actionable message ("state.json malformed; delete and re-run init").

W. **Slug edge cases** — Slugs containing unicode, hyphens-and-underscores in unusual positions, single character names, names that match reserved filesystem words (CON, PRN on Windows), or extremely long names crash, collide, or produce malformed paths. The slug regex must reject all of these consistently.

X. **--json malformed for any command** — Some `--json` output isn't parseable by `jq .`. Test: pipe every `--json` flag through jq and assert exit 0.

Y. **Phase-gate skip** — `spear execute` runs (and possibly succeeds) even though `spear plan` exits 1 (PLAN.md unapproved). The CLI should refuse to advance past a failing gate. Today this is soft (relies on adapter failure); should be hard.

Z. **Big-input regression** — A 1MB SCOPE.md, a 200-row defect list, or 50+ evidence rows causes hangs, OOM, or truncated output. Performance degrades but doesn't fail.

AA. **Cross-slug interference** — A command run with `--name foo` reads/writes paths for `bar`, OR a multi-slug runner aggregation mixes data between slugs. Test: two slugs with conflicting state, run commands on each, verify isolation.

BB. **Resume-after-kill corruption** — `kill -9` (or Ctrl-C) mid-assess leaves `.spear/<slug>/state.json` in an invalid state (partial JSON, leftover .tmp file that confuses next read). The atomic-write contract must hold under signal.

CC. **Evidence artifact path drift** — `evidence.json` references an artifact path that doesn't exist (or has a different hash than recorded) on the same filesystem at re-read time. The persisted artifacts under `.spear/<slug>/rounds/N/evidence/` must round-trip.

DD. **Help-source flag drift** — A flag exists in the cli.ts registration but isn't documented in `--help` text, OR vice-versa. Stricter than F (which only checks for descriptions): every flag in source has a help line and every help line corresponds to a real flag.

EE. **Doc code-example failure** — A bash example in README.md or docs/*.md, when actually executed, fails or produces different output than shown. Documentation drifts from code over time; this catches it.

FF. **Fresh-clone install break** — `git clone` + `npm install` + `npm run build` + `bash scripts/e2e.sh` doesn't pass on a fresh checkout (missing dep, .gitignore-leaked file required, hardcoded path, etc.).

GG. **Dependency hygiene** — `npm audit` flags a high/critical vulnerability, OR `npm outdated` shows a major version stale on a security-sensitive package, OR a transitive dep is GPL/copyleft (license incompatible with Apache-2.0).

HH. **Cross-platform path bug** — Code uses hardcoded `/` separators or POSIX-only behavior that breaks on Windows. Less critical for v0.2 (we declare Mac/Linux primary), but should be flagged where present.

II. **Evidence-emission gap** — An adapter emits zero Evidence rows in some code path (e.g., when defects.length === 0, or when fast=true). The contract says every assess emits evidence; flag any path that doesn't.

JJ. **SIGTERM mid-write** — Sending SIGTERM to a spear command mid-state-write leaves a partial state.json or stray .tmp files. Atomic-write contract must hold under signals.

KK. **Concurrent assess race** — Two `spear assess` processes on the same slug racing for state.json produce a corrupted file. Atomic-write rename-into-place must remain consistent under contention.

LL. **Reserved filesystem names** — Slug matches a Windows reserved name (CON, PRN, AUX, NUL, COM1..9, LPT1..9). Should reject on Windows; not blocking on macOS/Linux.

MM. **Version drift** — `spear --version` doesn't match `package.json` version field. Single source of truth required.

NN. **Round-dir cleanup** — After very many rounds, old rounds/ accumulate without a cleanup mechanism. Acceptable for v0.2 (history is the value); revisit if disk pressure becomes real.

OO. **State-from-future-version** — Reading a state.json written by a future spear version with new fields. Should preserve unknown fields on round-trip (or document migration policy).

PP. **Case-insensitive slug collision** — `spear init blog mypost` then `spear init blog MyPost` on a case-insensitive filesystem. Second call should detect collision.

QQ. **Invalid type to init** — `spear init not-a-real-type` should reject with "Unknown type" + valid list.

RR. **--help missing on a command** — A registered command's `--help` returns no Usage: line or no description. Every command must self-document.

SS. **Round counter divergence** — After parallel assesses, state.round ends up negative or wildly out of bounds.

TT. **Path traversal in slug** — Slug containing `../`, `/`, leading `.`, or absolute path. Validator must reject with no filesystem write outside `.spear/<slug>/`.

UU. **Symlinked state.json** — Replacing state.json with a symlink to an external file. Atomic write must either follow the symlink or replace it consistently.

VV. **--force overwrite semantics** — `spear init <type> <name> --force` doesn't actually overwrite, OR overwrites without --force. Must be opt-in destructive.

WW. **Re-assess on converged** — Running assess on a project where state.phase = 'converged'. Round counter advances; no crash.

XX. **Runner with zero projects** — `spear runner --once` in a directory with no `.spear/` should error cleanly.

YY. **Runner JSON output shape** — `spear runner --once --json` must produce a parseable JSON document with a loops array.

ZZ. **Long slug name** — A 100+ character slug name should work end-to-end (or be rejected with a clear error if there's a length limit).

AAA. **Negative round number in state.json** — Manually edited state with `round: -5` should display without crash.

BBB. **Huge round number with no rounds dirs** — `round: 99999` but no `rounds/N/` exists; resolve should still render gracefully.

CCC. **Invalid phase value** — `phase: 'garbage'` in state.json. Phase-gates should treat unknown phases conservatively (refuse downstream commands).

DDD. **Invalid type in state.json** — Type that doesn't match a registered adapter. `getAdapter()` must throw a clear error.

EEE. **History overflow** — A pre-bloated history array (50+ entries) gets capped at 10 on next assess (slice(-9) + push).

FFF. **Corrupt evidence.json** — A malformed evidence.json in a round dir. Resolve must recover (treat as empty) without crashing.

GGG. **Missing assess.json in round dir** — Round dir exists but assess.json deleted. Resolve --json must remain valid.

HHH. **Empty .spear/ directory** — `.spear/` exists but contains no slug subdirs. List should error cleanly with "No SPEAR projects".

III. **Stray non-dir under .spear/** — A regular file directly under `.spear/`. Listing must ignore it.

JJJ. **Major-version stale deps** — `npm outdated` reports major-version drift. Document as known-acceptable per release; revisit before the next minor.

KKK. **Performance under load** — A 20K-word draft assesses in seconds, not minutes. No O(N²) regressions in scanning logic.

LLL. **Many slugs per repo** — 50+ slugs in one repo: list, runner, status all complete in seconds.

MMM. **Sequential rounds drift** — Running assess 30+ times sequentially: rounds dir accumulates correctly; history capped; no state corruption.

NNN. **Large evidence list rendering** — Resolve with 200+ evidence rows renders in < 3 seconds.

OOO. **FD leak** — 200 sequential commands without errors. Proxy for file-descriptor leak detection.

PPP. **Mixed-encoding SCOPE.md** — Unicode + emoji + tabs + CRLF accepted by the validator without truncation.

QQQ. **npm pack tarball shape** — `npm pack` produces a tarball with dist/ + templates/ + README + LICENSE; excludes node_modules + .spear. Tarball installs and runs.

RRR. **Locale-dependent sort** — `LC_ALL` variations don't break list/runner sort order.

SSS. **Subdirectory invocation** — `spear status` from a subdirectory of the repo doesn't auto-walk-up (cwd is the contract).

TTT. **HOME unset** — `spear config list` with `$HOME` unset shouldn't crash.

UUU. **--help format consistency** — Every command's --help has Usage: line + description + Options section.

VVV. **Deck adapter init** — `spear init deck` creates the expected workspace/deck/ scaffold + starter package.json.

WWW. **Deck adapter execute** — A minimal pptxgenjs build.js produces a valid .pptx + per-slide JPEGs via LibreOffice + pdftoppm pipeline within 30 seconds.

XXX. **Deck render output** — Each rendered JPEG ≥ 1KB (not blank).

YYY. **Deck assess evidence** — Per-slide render evidence (mechanical, with sha256) + per-slide subjective rubric pointers; hash matches the file.

ZZZ. **Deck per-round artifact copy** — Round dir's evidence/ contains copies of all rendered JPEGs.

## Convergence

PASS when every metric 10/10 AND zero open lettered failure modes AND `<spear-complete/>` signal in RESOLVE.md.

The LLM may close the loop with `<spear-complete/>` even if mechanical defects remain — but only if those defects are explicitly documented as known-acceptable in this ASSESS.md (add a "Known acceptable" subsection if needed; otherwise fix them).

## Known acceptable

These items are explicitly approved during a SPEAR round and do not block convergence. Each entry names what was checked, why it's acceptable, and (if applicable) what would invalidate the exemption.

- **Code adapter's generic scan flags `console.log` in `src/commands/*` and `src/cli.ts`.** Those console.log calls are intentional CLI output (every user-facing command writes structured text via console.log + kleur). The generic `code` rubric was written for library code, not CLI tools where stdout is the contract. Failure-mode K (console-log debris) only applies to library files like `src/state.ts` / `src/evidence.ts` / `src/report.ts` / `src/pr.ts`, which are clean.

- **Code adapter's generic scan flags one `:any` match in `src/adapters/code.ts`.** The match is the literal string `'Source files containing \`: any\` annotations'` — the description text of the check itself, not a real type annotation. Failure-mode A (any outside strings) is not violated. A real type annotation `: any` would still be a defect.

- **M4 CI red due to GitHub Actions billing lock on the account.** The `Build` workflow at `.github/workflows/build.yml` is correctly configured (npm ci + npm run build on Node 20). Runs are aborted with `The job was not started because your account is locked due to a billing issue` before any step executes. Code is shippable; CI will turn green once billing is resolved. Invalidated if the workflow fails for any reason other than the billing lock.

- **`spear init` writes `workspace/deck/package.json` non-atomically.** This is a one-time setup write during scaffold; if interrupted, the user re-runs `spear init <type> [name] --force`. Failure-mode I (IO non-atomic) does not apply to one-shot init artifacts.
