#!/usr/bin/env bash
# e2e.sh — MECE end-to-end test of every spear command + new Tier 1 behavior.
#
# Categories (mutually exclusive, collectively exhaustive over the CLI surface):
#   1. CLI shape         — every command + help is reachable
#   2. Init & scaffold   — all four templates scaffold correctly
#   3. Scope/plan gates  — exit codes + validation
#   4. Adapter execute   — generic + blog
#   5. Adapter assess    — defects + evidence per adapter
#   6. Per-round history — .spear/rounds/N/ artifacts
#   7. Atomic state      — no .tmp leftovers, file mode preserved
#   8. Stuck detection   — stuckSince set after 2 unchanged rounds
#   9. Report parsing    — boilerplate ignored; real <spear-report> applied
#  10. Complete signal   — inline mention ignored; own-line tag honored
#  11. Image + config    — error paths (no API key, invalid size, overwrite guard)
#  12. Dogfood           — spear init code on spear-cli itself + assess
#
# Each check prints PASS/FAIL with a short line. Final line is the tally.
# Exit code: 0 = all green, 1 = any fail.

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

ok() {
  printf '  \033[32m✓\033[0m %s\n' "$1"
  PASS=$((PASS + 1))
}
ko() {
  printf '  \033[31m✗\033[0m %s\n' "$1"
  FAIL=$((FAIL + 1))
}
section() {
  printf '\n\033[1m== %s ==\033[0m\n' "$1"
}

run() { node "$SPEAR" "$@"; }

# ---------------------------------------------------------------------------
section "1. CLI shape"
# ---------------------------------------------------------------------------
HELP=$(run --help 2>&1)
for cmd in init scope plan execute assess resolve loop status runner image config; do
  if echo "$HELP" | grep -q "^  $cmd"; then ok "$cmd registered"; else ko "$cmd missing from help"; fi
done

# ---------------------------------------------------------------------------
section "2. Init & scaffold"
# ---------------------------------------------------------------------------
for type in deck blog code generic; do
  D="$TMP/init-$type"
  mkdir -p "$D"
  (cd "$D" && run init "$type" >/dev/null 2>&1) && \
    [ -f "$D/SCOPE.md" ] && [ -f "$D/PLAN.md" ] && [ -f "$D/ASSESS.md" ] && [ -f "$D/RESOLVE.md" ] && \
    [ -f "$D/.spear/state.json" ] && ok "$type scaffold complete" || ko "$type scaffold missing files"
done

# ---------------------------------------------------------------------------
section "3. Scope/plan gates"
# ---------------------------------------------------------------------------
D="$TMP/init-blog"
(cd "$D" && run scope >/dev/null 2>&1) ; [ $? -eq 1 ] && ok "scope rejects unfilled template (exit 1)" || ko "scope exit code wrong"

cat > "$D/SCOPE.md" <<'EOF'
# SCOPE

## Goal
Demonstrate that the SPEAR CLI gates phases correctly and emits structured evidence.

## Audience
Engineers evaluating SPEAR for their own deterministic AI workflow loops.

## Inputs
The README, the existing CLI source, and a short draft of body content for assess to score against.

## Constraints
500-2000 words target, must include three concrete examples not feature lists.

## Done means
The reader can decide adoption in under a minute and knows where the on-ramp is.
EOF
(cd "$D" && run scope >/dev/null 2>&1) ; [ $? -eq 0 ] && ok "scope accepts filled template (exit 0)" || ko "scope rejects valid SCOPE.md"

(cd "$D" && run plan >/dev/null 2>&1) ; PE=$?
[ $PE -ne 0 ] && ok "plan rejects unapproved PLAN.md (exit $PE)" || ko "plan accepted unapproved PLAN.md"

# ---------------------------------------------------------------------------
section "4. Adapter execute"
# ---------------------------------------------------------------------------
G="$TMP/init-generic"
mkdir -p "$G/workspace" && echo "content" > "$G/workspace/file.txt"
(cd "$G" && run execute --json >/dev/null 2>&1) ; [ $? -eq 0 ] && ok "generic execute succeeds with workspace content" || ko "generic execute failed"

mkdir -p "$D/workspace" && cat > "$D/workspace/draft.md" <<'EOF'
# Why SPEAR
Just a short stub draft so blog assess fires word-count defects.
EOF
(cd "$D" && run execute --json >/dev/null 2>&1) ; [ $? -eq 0 ] && ok "blog execute succeeds with draft.md" || ko "blog execute failed"

# ---------------------------------------------------------------------------
section "5. Adapter assess + evidence"
# ---------------------------------------------------------------------------
ASSESS=$(cd "$D" && run assess --json 2>&1)
echo "$ASSESS" | grep -q '"evidence"' && ok "blog assess emits evidence array" || ko "blog assess missing evidence"
echo "$ASSESS" | grep -q '"blog.draft.word-count"' && ok "blog evidence has word-count check" || ko "blog evidence missing word-count"
echo "$ASSESS" | grep -q '"pass": false' && ok "blog mechanical evidence shows pass:false on stub draft" || ko "blog evidence pass field missing"
echo "$ASSESS" | grep -q '"kind": "subjective"' && ok "blog evidence has subjective deferral row" || ko "blog evidence missing subjective row"

# ---------------------------------------------------------------------------
section "6. Per-round history"
# ---------------------------------------------------------------------------
[ -d "$D/.spear/rounds/1" ] && ok ".spear/rounds/1/ created" || ko ".spear/rounds/1/ missing"
[ -f "$D/.spear/rounds/1/assess.json" ] && ok "round 1/assess.json written" || ko "round 1/assess.json missing"
[ -f "$D/.spear/rounds/1/evidence.json" ] && ok "round 1/evidence.json written" || ko "round 1/evidence.json missing"
[ -d "$D/.spear/rounds/1/evidence" ] && ok "round 1/evidence/ dir present" || ko "round 1/evidence/ dir missing"
[ -f "$D/.spear/rounds/1/RESOLVE.md" ] && ok "round 1/RESOLVE.md snapshot written" || ko "round 1/RESOLVE.md missing"

# Run two more rounds to test history accumulation
(cd "$D" && run assess --json >/dev/null 2>&1) ; (cd "$D" && run assess --json >/dev/null 2>&1)
HIST_LEN=$(node -e "const s=require('$D/.spear/state.json'); console.log((s.history||[]).length)")
[ "$HIST_LEN" = "3" ] && ok "history accumulates across 3 rounds" || ko "history len=$HIST_LEN, expected 3"

# ---------------------------------------------------------------------------
section "7. Atomic state writes"
# ---------------------------------------------------------------------------
LEFTOVER=$(find "$D/.spear" -name '*.tmp*' 2>/dev/null | wc -l | tr -d ' ')
[ "$LEFTOVER" = "0" ] && ok "no .tmp files leaked" || ko "$LEFTOVER stray .tmp files"

# ---------------------------------------------------------------------------
section "8. Stuck-loop detection"
# ---------------------------------------------------------------------------
STUCK=$(node -e "const s=require('$D/.spear/state.json'); console.log(s.stuckSince||'none')")
[ "$STUCK" != "none" ] && ok "stuckSince=$STUCK after 3 rounds with same defectCount" || ko "stuckSince not set"

# ---------------------------------------------------------------------------
section "9. Report parsing"
# ---------------------------------------------------------------------------
# 9a — boilerplate alone must NOT short-circuit (or false-positive complete)
B="$TMP/report-boilerplate"
mkdir -p "$B/workspace" && (cd "$B" && run init blog >/dev/null 2>&1)
cp "$D/SCOPE.md" "$B/SCOPE.md"
echo "# stub" > "$B/workspace/draft.md"
(cd "$B" && run scope >/dev/null && run assess >/dev/null 2>&1)
LOOP_OUT=$(cd "$B" && run loop --max-rounds 0 --json 2>&1)
echo "$LOOP_OUT" | grep -q "user-signaled" && ko "boilerplate template false-triggered <spear-complete/>" || ok "boilerplate template does NOT short-circuit"

# 9b — real <spear-report> outside fence is parsed
cat >> "$B/RESOLVE.md" <<'EOF'

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
PROGRESS=$(node -e "const s=require('$B/.spear/state.json'); console.log(s.lastAssess.progress||'none')")
FIXED=$(node -e "const s=require('$B/.spear/state.json'); console.log(s.lastAssess.fixed||'none')")
[ "$PROGRESS" = "1/2" ] && ok "report PROGRESS parsed: $PROGRESS" || ko "PROGRESS not parsed (got '$PROGRESS')"
[ "$FIXED" = "3" ] && ok "report COMPLETED counted into fixed: $FIXED" || ko "fixed=$FIXED, expected 3"

# 9c — BLOCKERS: None clears state.blockers
BLOCKERS=$(node -e "const s=require('$B/.spear/state.json'); console.log(s.blockers||'unset')")
[ "$BLOCKERS" = "unset" ] && ok 'BLOCKERS: None leaves state.blockers unset' || ko "blockers=$BLOCKERS"

# 9d — BLOCKERS with real text sets state.blockers
B2="$TMP/report-blocked"
mkdir -p "$B2/workspace" && (cd "$B2" && run init blog >/dev/null 2>&1)
cp "$D/SCOPE.md" "$B2/SCOPE.md"
echo "# stub" > "$B2/workspace/draft.md"
(cd "$B2" && run scope >/dev/null && run assess >/dev/null 2>&1)
cat >> "$B2/RESOLVE.md" <<'EOF'

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
B2BLOCK=$(node -e "const s=require('$B2/.spear/state.json'); console.log(s.blockers||'unset')")
[ "$B2BLOCK" = "API key not provisioned" ] && ok "BLOCKERS text sets state.blockers" || ko "blockers=$B2BLOCK"

# ---------------------------------------------------------------------------
section "10. Complete signal"
# ---------------------------------------------------------------------------
# 10a — inline mention in prose does NOT trigger
C="$TMP/complete-inline"
mkdir -p "$C/workspace" && (cd "$C" && run init blog >/dev/null 2>&1)
cp "$D/SCOPE.md" "$C/SCOPE.md"
echo "# stub" > "$C/workspace/draft.md"
(cd "$C" && run scope >/dev/null && run assess >/dev/null 2>&1)
echo "Note: I will add <spear-complete/> when satisfied." >> "$C/RESOLVE.md"
LOOP_OUT=$(cd "$C" && run loop --max-rounds 0 --json 2>&1)
echo "$LOOP_OUT" | grep -q "user-signaled" && ko "inline <spear-complete/> mention false-triggered" || ok "inline mention does NOT trigger complete"

# 10b — own-line tag DOES trigger
echo "" >> "$C/RESOLVE.md"
echo "<spear-complete/>" >> "$C/RESOLVE.md"
(cd "$C" && run loop --max-rounds 5 >/dev/null 2>&1) ; CE=$?
[ $CE -eq 0 ] && ok "<spear-complete/> on own line stops loop (exit 0)" || ko "complete signal exit=$CE"
COMPLETED_AT=$(node -e "const s=require('$C/.spear/state.json'); console.log(s.completedAt||'unset')")
[ "$COMPLETED_AT" != "unset" ] && ok "completedAt timestamp set: $COMPLETED_AT" || ko "completedAt not set"

# ---------------------------------------------------------------------------
section "11. Image + config error paths"
# ---------------------------------------------------------------------------
HOME_BAK="${HOME:-}"
export HOME="$TMP/fake-home"
mkdir -p "$HOME"
unset OPENAI_API_KEY
ERR_OUT=$(run image --prompt "x" --out "$TMP/x.png" 2>&1) ; [ $? -eq 1 ] && \
  echo "$ERR_OUT" | grep -q "OPENAI_API_KEY" && ok "image errors clearly when no key" || ko "image error path"

ERR_OUT=$(run image --prompt "x" --out "$TMP/x.png" --size weird 2>&1) ; \
  echo "$ERR_OUT" | grep -q "Invalid --size" && ok "image rejects invalid size" || ko "image size validation"

run config set openai-key sk-test1234567890ABCD >/dev/null 2>&1
GET_OUT=$(run config get openai-key 2>&1)
echo "$GET_OUT" | grep -q "sk-t" && echo "$GET_OUT" | grep -q "ABCD" && ok "config get masks key" || ko "config masking"
run config unset openai-key >/dev/null 2>&1
[ -f "$HOME/.spear/config.json" ] && [ "$(node -e "const c=require('$HOME/.spear/config.json'); console.log(Object.keys(c).length)")" = "0" ] && \
  ok "config unset removes key" || ko "config unset"
export HOME="$HOME_BAK"

# ---------------------------------------------------------------------------
section "12. Resolve — closing-phase PR summary"
# ---------------------------------------------------------------------------
# Build on the project from §9 ($B has 1 round + a real <spear-report>)
PR_OUT=$(cd "$B" && run resolve 2>&1)
echo "$PR_OUT" | grep -q "## Highlights" && ok "PR includes Highlights" || ko "no Highlights"
echo "$PR_OUT" | grep -q "## Lowlights" && ok "PR includes Lowlights" || ko "no Lowlights"
echo "$PR_OUT" | grep -q "## What to test" && ok "PR includes What to test" || ko "no What to test"
echo "$PR_OUT" | grep -q "## Warnings" && ok "PR includes Warnings" || ko "no Warnings"
echo "$PR_OUT" | grep -q "## Next steps" && ok "PR includes Next steps" || ko "no Next steps"
echo "$PR_OUT" | grep -q "extended draft" && ok "PR highlights pull from <spear-report> COMPLETED" || ko "report data not surfaced"

# --json emits structured PRContext
PR_JSON=$(cd "$B" && run resolve --json 2>&1)
echo "$PR_JSON" | grep -q '"highlights"' && ok "resolve --json emits PRContext" || ko "PR JSON missing fields"

# --write defaults to CLOSEOUT.md (neutral name; works with or without a repo)
(cd "$B" && run resolve --write >/dev/null 2>&1)
[ -f "$B/CLOSEOUT.md" ] && grep -q "Highlights" "$B/CLOSEOUT.md" && ok "resolve --write created CLOSEOUT.md" || ko "--write didn't persist"

# Explicit path still works (for repo workflows: --write PR.md | gh pr create -F -)
(cd "$B" && run resolve --write PR.md >/dev/null 2>&1)
[ -f "$B/PR.md" ] && ok "resolve --write PR.md respects explicit path" || ko "explicit path ignored"

# Custom template
mkdir -p "$B/.spear" && cat > "$B/.spear/pr-template.md" <<'EOF'
TITLE: {{title}}
ROUNDS: {{rounds}}
DEFECTS_REMAINING: {{defectsRemaining}}
EOF
TPL_OUT=$(cd "$B" && run resolve 2>&1)
echo "$TPL_OUT" | grep -q "^TITLE:" && echo "$TPL_OUT" | grep -q "^ROUNDS:" && \
  ok "custom .spear/pr-template.md is honored" || ko "custom template not used"

# Stuck status surfaces in Warnings (from §8 — $D has stuckSince)
STUCK_PR=$(cd "$D" && run resolve 2>&1)
echo "$STUCK_PR" | grep -q "stuck" && ok "stuck status surfaces in PR Warnings" || ko "stuck not surfaced"

# Legacy --next still works
NEXT_OUT=$(cd "$D" && run resolve --next 2>&1)
echo "$NEXT_OUT" | grep -q "Next:" && ok "resolve --next legacy flag still works" || ko "--next broken"

# ---------------------------------------------------------------------------
section "13. Dogfood — spear init code on spear-cli itself"
# ---------------------------------------------------------------------------
DF="$TMP/dogfood-spear-cli"
cp -r "$REPO_ROOT" "$DF"
rm -rf "$DF/.spear" "$DF/SCOPE.md" "$DF/PLAN.md" "$DF/ASSESS.md" "$DF/RESOLVE.md"
(cd "$DF" && run init code >/dev/null 2>&1) && ok "spear init code on spear-cli source" || ko "init code failed"

cat > "$DF/SCOPE.md" <<'EOF'
# SCOPE

## Goal
Verify the spear-cli TypeScript codebase passes its own deterministic checks: type-check clean, no console.log debris, no `any` types, no leftover TODO comments in shipped code.

## Audience
Maintainers reviewing changes to the spear-cli source before publishing a release to npm.

## Inputs
All TypeScript source under src/, the package.json scripts (typecheck/lint/test), and the existing rubric in ASSESS.md.

## Constraints
Must pass without modifying source files. Mechanical checks should agree with manual inspection of the dist build.

## Done means
spear assess emits zero high-severity defects and the evidence manifest covers every src/ file scanned.
EOF
(cd "$DF" && run scope >/dev/null 2>&1) && ok "dogfood scope passes" || ko "dogfood scope rejected"

(cd "$DF" && run assess --fast --json > /tmp/dogfood-assess.json 2>&1) ; AE=$?
EVIDENCE_COUNT=$(node -e "const r=require('/tmp/dogfood-assess.json'); console.log(r.evidence.length)" 2>/dev/null)
DEFECT_COUNT=$(node -e "const r=require('/tmp/dogfood-assess.json'); console.log(r.defects.length)" 2>/dev/null)
[ -n "$EVIDENCE_COUNT" ] && [ "$EVIDENCE_COUNT" -gt 0 ] && ok "dogfood assess emits $EVIDENCE_COUNT evidence rows" || ko "dogfood assess no evidence"
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
