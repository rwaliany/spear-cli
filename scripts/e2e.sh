#!/usr/bin/env bash
# e2e.sh — MECE end-to-end test of every spear command + slug-aware behavior.
#
# Categories (mutually exclusive, collectively exhaustive over the CLI surface):
#   1. CLI shape         — every command + help is reachable
#   2. Init & scaffold   — all four templates create .spear/<slug>/ correctly
#   3. Multi-slug repo   — two slugs co-exist; auto-resolve fails, --name works
#   4. Scope/plan gates  — exit codes + validation
#   5. Adapter execute   — generic + blog
#   6. Adapter assess    — defects + evidence per adapter
#   7. Per-round history — .spear/<slug>/rounds/N/ artifacts
#   8. Atomic state      — no .tmp leftovers
#   9. Stuck detection   — stuckSince set after 2 unchanged rounds
#  10. Report parsing    — boilerplate ignored; real <spear-report> applied
#  11. Complete signal   — inline mention ignored; own-line tag honored
#  12. Image + config    — error paths
#  13. Resolve PR        — closing-phase report
#  14. spear list        — table + JSON enumeration
#  15. Dogfood           — spear init code self on spear-cli itself

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEAR="$REPO_ROOT/dist/cli.js"
TMP="$(mktemp -d)"
PASS=0
FAIL=0

if [ ! -f "$SPEAR" ]; then
  echo "✗ dist/cli.js not found — run \`npm run build\` first." >&2
  exit 1
fi

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
run() { node "$SPEAR" "$@"; }

# Reusable filled SCOPE.md content (passes scope validator)
read -r -d '' FILLED_SCOPE <<'EOF' || true
# SCOPE

## Goal
Exercise the SPEAR CLI end-to-end against deterministic checks and verifiable evidence rows for the assess phase.

## Audience
Engineers integrating SPEAR into their LLM-driven workflows who need confidence the gates work as advertised.

## Inputs
The CLI source under src/, the test scripts under scripts/, and the docs that describe the convention.

## Constraints
Must run without manual setup beyond npm install and build. Should complete in under thirty seconds.

## Done means
Every category passes its check and the suite reports zero failures with a green tally line.
EOF

# ---------------------------------------------------------------------------
section "1. CLI shape"
# ---------------------------------------------------------------------------
HELP=$(run --help 2>&1)
for cmd in init scope plan execute assess resolve loop status list runner image config; do
  if echo "$HELP" | grep -q "^  $cmd"; then ok "$cmd registered"; else ko "$cmd missing from help"; fi
done

# ---------------------------------------------------------------------------
section "2. Init & scaffold"
# ---------------------------------------------------------------------------
for type in deck blog code generic; do
  D="$TMP/init-$type"
  mkdir -p "$D"
  (cd "$D" && run init "$type" >/dev/null 2>&1) && \
    [ -f "$D/.spear/$type/SCOPE.md" ] && [ -f "$D/.spear/$type/PLAN.md" ] && \
    [ -f "$D/.spear/$type/ASSESS.md" ] && [ -f "$D/.spear/$type/RESOLVE.md" ] && \
    [ -f "$D/.spear/$type/state.json" ] && ok "$type scaffold .spear/$type/" || ko "$type scaffold missing files"
done

# Custom name
N="$TMP/init-named"
mkdir -p "$N"
(cd "$N" && run init blog mypost >/dev/null 2>&1) && [ -f "$N/.spear/mypost/SCOPE.md" ] && \
  ok "custom name: spear init blog mypost → .spear/mypost/" || ko "custom name failed"

# Bad name rejected (capture then grep to avoid pipefail on exit-1 + grep-match)
BAD_OUT=$(cd "$N" && run init blog "bad name with spaces" 2>&1 || true)
echo "$BAD_OUT" | grep -q "Invalid SPEAR project name" && ok "rejects invalid slug names" || ko "should reject invalid slugs"

# ---------------------------------------------------------------------------
section "3. Multi-slug repo"
# ---------------------------------------------------------------------------
M="$TMP/multi"
mkdir -p "$M"
(cd "$M" && run init blog post-a >/dev/null 2>&1)
(cd "$M" && run init blog post-b >/dev/null 2>&1)
[ -d "$M/.spear/post-a" ] && [ -d "$M/.spear/post-b" ] && ok "two slugs co-exist" || ko "multi-slug init"

# Without --name, multi-slug repos must error (capture-then-grep pattern; commands exit 1)
AMBIG_OUT=$(cd "$M" && run scope 2>&1 || true)
echo "$AMBIG_OUT" | grep -q "Multiple SPEAR projects" && ok "auto-resolve fails with multiple slugs (clear error)" || ko "should error on ambiguous slug"

NAME_OUT=$(cd "$M" && run scope --name post-a 2>&1 || true)
echo "$NAME_OUT" | grep -q "SCOPE.md" && ok "explicit --name resolves to a project" || ko "--name flag broken"

ENV_OUT=$(cd "$M" && SPEAR_PROJECT=post-b node "$SPEAR" scope 2>&1 || true)
echo "$ENV_OUT" | grep -q "SCOPE.md" && ok "SPEAR_PROJECT env var resolves to a project" || ko "env var resolution broken"

# ---------------------------------------------------------------------------
section "4. Scope/plan gates"
# ---------------------------------------------------------------------------
D="$TMP/init-blog"
(cd "$D" && run scope >/dev/null 2>&1); [ $? -eq 1 ] && ok "scope rejects unfilled template (exit 1)" || ko "scope exit code wrong"

printf '%s\n' "$FILLED_SCOPE" > "$D/.spear/blog/SCOPE.md"
(cd "$D" && run scope >/dev/null 2>&1); [ $? -eq 0 ] && ok "scope accepts filled template (exit 0)" || ko "scope rejects valid SCOPE.md"

(cd "$D" && run plan >/dev/null 2>&1); PE=$?
[ $PE -ne 0 ] && ok "plan rejects unapproved PLAN.md (exit $PE)" || ko "plan accepted unapproved PLAN.md"

# ---------------------------------------------------------------------------
section "5. Adapter execute"
# ---------------------------------------------------------------------------
G="$TMP/init-generic"
mkdir -p "$G/.spear/generic/workspace" && echo "content" > "$G/.spear/generic/workspace/file.txt"
(cd "$G" && run execute --json >/dev/null 2>&1); [ $? -eq 0 ] && ok "generic execute succeeds" || ko "generic execute failed"

mkdir -p "$D/.spear/blog/workspace" && cat > "$D/.spear/blog/workspace/draft.md" <<'EOF'
# Why SPEAR
Just a short stub draft so blog assess fires word-count defects.
EOF
(cd "$D" && run execute --json >/dev/null 2>&1); [ $? -eq 0 ] && ok "blog execute succeeds with draft.md" || ko "blog execute failed"

# ---------------------------------------------------------------------------
section "6. Adapter assess + evidence"
# ---------------------------------------------------------------------------
ASSESS=$(cd "$D" && run assess --json 2>&1)
echo "$ASSESS" | grep -q '"evidence"' && ok "blog assess emits evidence array" || ko "blog assess missing evidence"
echo "$ASSESS" | grep -q '"blog.draft.word-count"' && ok "blog evidence has word-count check" || ko "blog evidence missing word-count"
echo "$ASSESS" | grep -q '"pass": false' && ok "blog mechanical evidence shows pass:false" || ko "evidence pass field missing"
echo "$ASSESS" | grep -q '"kind": "subjective"' && ok "blog evidence has subjective deferral row" || ko "evidence missing subjective"

# ---------------------------------------------------------------------------
section "7. Per-round history"
# ---------------------------------------------------------------------------
[ -d "$D/.spear/blog/rounds/1" ] && ok "rounds/1/ created" || ko "rounds/1/ missing"
[ -f "$D/.spear/blog/rounds/1/assess.json" ] && ok "rounds/1/assess.json written" || ko "assess.json missing"
[ -f "$D/.spear/blog/rounds/1/evidence.json" ] && ok "rounds/1/evidence.json written" || ko "evidence.json missing"
[ -d "$D/.spear/blog/rounds/1/evidence" ] && ok "rounds/1/evidence/ dir present" || ko "evidence dir missing"
[ -f "$D/.spear/blog/rounds/1/RESOLVE.md" ] && ok "rounds/1/RESOLVE.md snapshot written" || ko "RESOLVE snapshot missing"

(cd "$D" && run assess --json >/dev/null 2>&1); (cd "$D" && run assess --json >/dev/null 2>&1)
HIST_LEN=$(node -e "const s=require('$D/.spear/blog/state.json'); console.log((s.history||[]).length)")
[ "$HIST_LEN" = "3" ] && ok "history accumulates across 3 rounds" || ko "history len=$HIST_LEN"

# ---------------------------------------------------------------------------
section "8. Atomic state writes"
# ---------------------------------------------------------------------------
LEFTOVER=$(find "$D/.spear" -name '*.tmp*' 2>/dev/null | wc -l | tr -d ' ')
[ "$LEFTOVER" = "0" ] && ok "no .tmp files leaked" || ko "$LEFTOVER stray .tmp files"

# ---------------------------------------------------------------------------
section "9. Stuck-loop detection"
# ---------------------------------------------------------------------------
STUCK=$(node -e "const s=require('$D/.spear/blog/state.json'); console.log(s.stuckSince||'none')")
[ "$STUCK" != "none" ] && ok "stuckSince=$STUCK after 3 rounds" || ko "stuckSince not set"

# ---------------------------------------------------------------------------
section "10. Report parsing"
# ---------------------------------------------------------------------------
B="$TMP/report-boilerplate"
mkdir -p "$B"
(cd "$B" && run init blog >/dev/null 2>&1)
printf '%s\n' "$FILLED_SCOPE" > "$B/.spear/blog/SCOPE.md"
mkdir -p "$B/.spear/blog/workspace" && echo "# stub" > "$B/.spear/blog/workspace/draft.md"
(cd "$B" && run scope >/dev/null && run assess >/dev/null 2>&1)

LOOP_OUT=$(cd "$B" && run loop --max-rounds 0 --json 2>&1)
echo "$LOOP_OUT" | grep -q "user-signaled" && ko "boilerplate template false-triggered <spear-complete/>" || \
  ok "boilerplate template does NOT short-circuit"

cat >> "$B/.spear/blog/RESOLVE.md" <<'EOF'

<spear-report>
ITERATION: 1
PHASE: resolve
COMPLETED: extended draft, added examples, fixed headers
FILES_CHANGED: workspace/draft.md
TESTS: N/A
NEXT: re-run spear loop
BLOCKERS: None
PROGRESS: 1/2
</spear-report>
EOF
(cd "$B" && run loop --max-rounds 0 --json >/dev/null 2>&1)
PROGRESS=$(node -e "const s=require('$B/.spear/blog/state.json'); console.log(s.lastAssess.progress||'none')")
FIXED=$(node -e "const s=require('$B/.spear/blog/state.json'); console.log(s.lastAssess.fixed||'none')")
[ "$PROGRESS" = "1/2" ] && ok "report PROGRESS parsed: $PROGRESS" || ko "PROGRESS not parsed (got '$PROGRESS')"
[ "$FIXED" = "3" ] && ok "report COMPLETED counted into fixed: $FIXED" || ko "fixed=$FIXED, expected 3"

BLOCKERS=$(node -e "const s=require('$B/.spear/blog/state.json'); console.log(s.blockers||'unset')")
[ "$BLOCKERS" = "unset" ] && ok 'BLOCKERS: None leaves state.blockers unset' || ko "blockers=$BLOCKERS"

B2="$TMP/report-blocked"
mkdir -p "$B2"
(cd "$B2" && run init blog >/dev/null 2>&1)
printf '%s\n' "$FILLED_SCOPE" > "$B2/.spear/blog/SCOPE.md"
mkdir -p "$B2/.spear/blog/workspace" && echo "# stub" > "$B2/.spear/blog/workspace/draft.md"
(cd "$B2" && run scope >/dev/null && run assess >/dev/null 2>&1)
cat >> "$B2/.spear/blog/RESOLVE.md" <<'EOF'

<spear-report>
ITERATION: 1
PHASE: resolve
COMPLETED: nothing
FILES_CHANGED: none
TESTS: N/A
NEXT: human review
BLOCKERS: API key not provisioned
PROGRESS: 0/2
</spear-report>
EOF
(cd "$B2" && run loop --max-rounds 0 --json >/dev/null 2>&1)
B2BLOCK=$(node -e "const s=require('$B2/.spear/blog/state.json'); console.log(s.blockers||'unset')")
[ "$B2BLOCK" = "API key not provisioned" ] && ok "BLOCKERS text sets state.blockers" || ko "blockers=$B2BLOCK"

# ---------------------------------------------------------------------------
section "11. Complete signal"
# ---------------------------------------------------------------------------
C="$TMP/complete-inline"
mkdir -p "$C"
(cd "$C" && run init blog >/dev/null 2>&1)
printf '%s\n' "$FILLED_SCOPE" > "$C/.spear/blog/SCOPE.md"
mkdir -p "$C/.spear/blog/workspace" && echo "# stub" > "$C/.spear/blog/workspace/draft.md"
(cd "$C" && run scope >/dev/null && run assess >/dev/null 2>&1)
echo "Note: I will add <spear-complete/> when satisfied." >> "$C/.spear/blog/RESOLVE.md"
LOOP_OUT=$(cd "$C" && run loop --max-rounds 0 --json 2>&1)
echo "$LOOP_OUT" | grep -q "user-signaled" && ko "inline mention false-triggered" || \
  ok "inline mention does NOT trigger complete"

echo "" >> "$C/.spear/blog/RESOLVE.md"
echo "<spear-complete/>" >> "$C/.spear/blog/RESOLVE.md"
(cd "$C" && run loop --max-rounds 5 >/dev/null 2>&1); CE=$?
[ $CE -eq 0 ] && ok "<spear-complete/> on own line stops loop (exit 0)" || ko "complete signal exit=$CE"

# ---------------------------------------------------------------------------
section "12. Image + config error paths"
# ---------------------------------------------------------------------------
HOME_BAK="${HOME:-}"
export HOME="$TMP/fake-home"
mkdir -p "$HOME"
unset OPENAI_API_KEY
ERR_OUT=$(run image --prompt "x" --out "$TMP/x.png" 2>&1); [ $? -eq 1 ] && \
  echo "$ERR_OUT" | grep -q "OPENAI_API_KEY" && ok "image errors clearly when no key" || ko "image error path"

ERR_OUT=$(run image --prompt "x" --out "$TMP/x.png" --size weird 2>&1); \
  echo "$ERR_OUT" | grep -q "Invalid --size" && ok "image rejects invalid size" || ko "image size validation"

run config set openai-key sk-test1234567890ABCD >/dev/null 2>&1
GET_OUT=$(run config get openai-key 2>&1)
echo "$GET_OUT" | grep -q "sk-t" && echo "$GET_OUT" | grep -q "ABCD" && ok "config get masks key" || ko "config masking"
run config unset openai-key >/dev/null 2>&1
[ -f "$HOME/.spear/config.json" ] && [ "$(node -e "const c=require('$HOME/.spear/config.json'); console.log(Object.keys(c).length)")" = "0" ] && \
  ok "config unset removes key" || ko "config unset"
export HOME="$HOME_BAK"

# ---------------------------------------------------------------------------
section "13. Resolve — closing-phase PR summary"
# ---------------------------------------------------------------------------
PR_OUT=$(cd "$B" && run resolve 2>&1)
echo "$PR_OUT" | grep -q "## Highlights" && ok "PR includes Highlights" || ko "no Highlights"
echo "$PR_OUT" | grep -q "## Lowlights" && ok "PR includes Lowlights" || ko "no Lowlights"
echo "$PR_OUT" | grep -q "## What to test" && ok "PR includes What to test" || ko "no What to test"
echo "$PR_OUT" | grep -q "## Warnings" && ok "PR includes Warnings" || ko "no Warnings"
echo "$PR_OUT" | grep -q "## Next steps" && ok "PR includes Next steps" || ko "no Next steps"
echo "$PR_OUT" | grep -q "extended draft" && ok "PR highlights pull from <spear-report>" || ko "report data not surfaced"

PR_JSON=$(cd "$B" && run resolve --json 2>&1)
echo "$PR_JSON" | grep -q '"highlights"' && ok "resolve --json emits PRContext" || ko "PR JSON missing fields"

(cd "$B" && run resolve --write >/dev/null 2>&1)
[ -f "$B/CLOSEOUT.md" ] && grep -q "Highlights" "$B/CLOSEOUT.md" && ok "resolve --write CLOSEOUT.md" || ko "--write didn't persist"

(cd "$B" && run resolve --write PR.md >/dev/null 2>&1)
[ -f "$B/PR.md" ] && ok "resolve --write PR.md respects explicit path" || ko "explicit path ignored"

mkdir -p "$B/.spear/blog" && cat > "$B/.spear/blog/pr-template.md" <<'EOF'
TITLE: {{title}}
SLUG: {{slug}}
ROUNDS: {{rounds}}
DEFECTS_REMAINING: {{defectsRemaining}}
EOF
TPL_OUT=$(cd "$B" && run resolve 2>&1)
echo "$TPL_OUT" | grep -q "^TITLE:" && echo "$TPL_OUT" | grep -q "^SLUG:" && \
  ok "custom .spear/<slug>/pr-template.md is honored" || ko "custom template not used"

STUCK_PR=$(cd "$D" && run resolve 2>&1)
echo "$STUCK_PR" | grep -q "stuck" && ok "stuck status surfaces in PR Warnings" || ko "stuck not surfaced"

NEXT_OUT=$(cd "$D" && run resolve --next 2>&1)
echo "$NEXT_OUT" | grep -q "Next:" && ok "resolve --next legacy flag still works" || ko "--next broken"

# ---------------------------------------------------------------------------
section "14. spear list"
# ---------------------------------------------------------------------------
LIST_OUT=$(cd "$M" && run list 2>&1)
echo "$LIST_OUT" | grep -q "post-a" && echo "$LIST_OUT" | grep -q "post-b" && \
  ok "list shows both slugs" || ko "list missing slugs"

LIST_JSON=$(cd "$M" && run list --json 2>&1)
echo "$LIST_JSON" | grep -q '"projects"' && ok "list --json emits structured rows" || ko "list JSON malformed"

# ---------------------------------------------------------------------------
section "15. Dogfood — spear init code self on spear-cli itself"
# ---------------------------------------------------------------------------
DF="$TMP/dogfood-spear-cli"
cp -r "$REPO_ROOT" "$DF"
rm -rf "$DF/.spear"
(cd "$DF" && run init code self >/dev/null 2>&1) && ok "spear init code self on spear-cli source" || ko "init failed"

cat > "$DF/.spear/self/SCOPE.md" <<'EOF'
# SCOPE

## Goal
Verify the spear-cli TypeScript codebase passes its own deterministic checks: type-check clean, no console.log debris, no `any` types, no leftover TODO comments in shipped code.

## Audience
Maintainers reviewing changes to the spear-cli source before publishing a release to npm.

## Inputs
All TypeScript source under src/, the package.json scripts, and the existing rubric in ASSESS.md.

## Constraints
Must pass without modifying source files. Mechanical checks should agree with manual inspection of the dist build.

## Done means
spear assess emits zero high-severity defects and the evidence manifest covers every src/ file scanned.
EOF
(cd "$DF" && run scope >/dev/null 2>&1) && ok "dogfood scope passes" || ko "dogfood scope rejected"

(cd "$DF" && run assess --fast --json > /tmp/dogfood-assess.json 2>&1); AE=$?
EVIDENCE_COUNT=$(node -e "const r=require('/tmp/dogfood-assess.json'); console.log(r.evidence.length)" 2>/dev/null)
DEFECT_COUNT=$(node -e "const r=require('/tmp/dogfood-assess.json'); console.log(r.defects.length)" 2>/dev/null)
[ -n "$EVIDENCE_COUNT" ] && [ "$EVIDENCE_COUNT" -gt 0 ] && ok "dogfood assess emits $EVIDENCE_COUNT evidence rows" || ko "dogfood no evidence"
ok "dogfood assess found $DEFECT_COUNT defect(s) (exit $AE)"

# ---------------------------------------------------------------------------
echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[1;32m✓ %d/%d passed.\033[0m\n' "$PASS" "$((PASS + FAIL))"
  exit 0
else
  printf '\033[1;31m✗ %d/%d passed (%d failed).\033[0m\n' "$PASS" "$((PASS + FAIL))" "$FAIL"
  exit 1
fi
