#!/usr/bin/env node
import { Command } from 'commander';
import { initCmd } from './commands/init.js';
import { scopeCmd } from './commands/scope.js';
import { planCmd } from './commands/plan.js';
import { executeCmd } from './commands/execute.js';
import { assessCmd } from './commands/assess.js';
import { resolveCmd } from './commands/resolve.js';
import { loopCmd } from './commands/loop.js';
import { statusCmd } from './commands/status.js';
import { runnerCmd } from './commands/runner.js';
import { imageCmd } from './commands/image.js';
import {
  configSetCmd,
  configGetCmd,
  configUnsetCmd,
  configListCmd,
} from './commands/config.js';

const program = new Command();

program
  .name('spear')
  .description('Five-phase protocol for AI work that actually finishes.')
  .version('0.1.0');

program
  .command('init <type>')
  .description('Scaffold a SPEAR project (deck | blog | code | generic)')
  .option('-f, --force', 'overwrite existing canonical files')
  .action(initCmd);

program
  .command('scope')
  .description('Validate SCOPE.md (errors out with gaps if incomplete)')
  .option('--json', 'emit JSON status')
  .action(scopeCmd);

program
  .command('plan')
  .description('Validate PLAN.md exists and is approved')
  .option('--json', 'emit JSON status')
  .action(planCmd);

program
  .command('execute')
  .description('Run the artifact build (e.g., node build.js for decks)')
  .option('--json', 'emit JSON status')
  .action(executeCmd);

program
  .command('assess')
  .description('Run rubric checks, write RESOLVE.md, exit nonzero if defects')
  .option('--json', 'emit JSON defect list')
  .option('--fast', 'mechanical checks only (skip subjective items deferred to LLM)')
  .action(assessCmd);

program
  .command('resolve')
  .description('Closing phase — render a project-closure report (works as a PR body or standalone handoff)')
  .option('-w, --write [path]', 'write to file (default CLOSEOUT.md); omit for stdout')
  .option('-t, --template <path>', 'custom template (default: .spear/pr-template.md or built-in)')
  .option('--next', '[legacy] output next defect to fix during the assess loop')
  .option('--apply', '[legacy] apply mechanical fixes; flag the rest')
  .option('--json', 'emit JSON (PRContext) instead of rendered markdown')
  .action(resolveCmd);

program
  .command('loop')
  .description('Orchestrate full SPEAR pipeline (validate → execute → assess → loop)')
  .option('-r, --max-rounds <n>', 'iteration cap', '20')
  .option('--json', 'emit JSON per round')
  .action(loopCmd);

program
  .command('status')
  .description('Show current phase + open defects')
  .option('--json', 'emit JSON')
  .action(statusCmd);

program
  .command('runner')
  .description('Multi-loop status reporter — print structured table every N seconds')
  .option('-p, --paths <list>', 'comma-separated project paths (default: auto-discover from cwd)')
  .option('-i, --interval <seconds>', 'seconds between checks', '300')
  .option('--once', 'print once and exit (for CI / cron)')
  .option('--json', 'emit JSON instead of table')
  .action(runnerCmd);

program
  .command('image')
  .description('Generate a single image via OpenAI (gpt-image-2)')
  .requiredOption('--prompt <text>', 'image prompt (LLM writes this)')
  .requiredOption('--out <path>', 'output PNG path (parent dirs auto-created)')
  .option('--size <WxH>', 'explicit pixel size, e.g. 1024x1536 (overrides --aspect)')
  .option('--aspect <ratio>', '1:1 | 2:3 | 3:2 | square | portrait | landscape', '1:1')
  .option('--quality <level>', 'low | medium | high (passed through to API)')
  .option('--model <name>', 'override model name', 'gpt-image-2')
  .option('-f, --force', 'overwrite if --out exists')
  .option('--json', 'emit JSON status')
  .action(imageCmd);

const config = program.command('config').description('Manage user config (~/.spear/config.json)');

config
  .command('set <key> <value>')
  .description('Set a config value (e.g., openai-key sk-...)')
  .action(configSetCmd);

config
  .command('get <key>')
  .description('Get a config value (secrets are masked)')
  .option('--json', 'emit JSON')
  .action(configGetCmd);

config
  .command('unset <key>')
  .description('Remove a config value')
  .action(configUnsetCmd);

config
  .command('list')
  .description('Show all config values (secrets masked)')
  .option('--json', 'emit JSON')
  .action(configListCmd);

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
