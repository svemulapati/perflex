#!/usr/bin/env node
/**
 * perflex-ci — replay a recorded Perflex flow in CI, measure performance, and
 * pass/fail against budgets or the flow's baseline.
 *
 *   npx perflex-ci --flow checkout.flow.json [--budgets budgets.json]
 *                  [--url http://localhost:3000] [--out report.json]
 *                  [--tolerance 0.2] [--md report.md] [--verbose]
 *
 * Exit code 0 = pass, 1 = fail, 2 = usage/runtime error.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { replayFlow } from './lib/replay.mjs';
import { aggregateMetrics, evaluateBudgets, evaluateBaseline } from './lib/evaluate.mjs';
import { toMarkdown, summaryLine } from './lib/report.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verbose') args.verbose = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.flow) {
    console.error('Usage: perflex-ci --flow <flow.json> [--budgets <budgets.json>] [--url <override>] [--out <report.json>] [--md <report.md>] [--tolerance 0.2]');
    process.exit(2);
  }

  let flow;
  try {
    flow = readJson(args.flow);
    if (!Array.isArray(flow.steps)) throw new Error('flow has no steps[]');
  } catch (e) {
    console.error(`Could not read flow file: ${e.message}`);
    process.exit(2);
  }

  const log = args.verbose ? (m) => console.error(`  ${m}`) : () => {};
  console.error(`Perflex CI — replaying "${flow.name}" (${flow.steps.length} steps)…`);

  let run;
  try {
    run = await replayFlow(flow, { url: args.url, log });
  } catch (e) {
    console.error(`Replay failed: ${e.message}`);
    console.error('Is Playwright installed? Run: npm i playwright && npx playwright install chromium');
    process.exit(2);
  }

  const metrics = aggregateMetrics(run.perPage);

  let evaluation;
  if (args.budgets) {
    const budgetsFile = readJson(args.budgets);
    const budgets = Array.isArray(budgetsFile) ? budgetsFile : budgetsFile.budgets || [];
    evaluation = evaluateBudgets(metrics, budgets);
  } else if (flow.baseline) {
    evaluation = evaluateBaseline(metrics, flow.baseline, args.tolerance ? Number(args.tolerance) : 0.2);
  } else {
    console.error('No --budgets file and no baseline in the flow — nothing to check against. Reporting metrics only.');
    evaluation = { mode: 'budgets', results: [], pass: true, errors: 0, warnings: 0 };
  }

  const report = { flow: { name: flow.name, steps: flow.steps.length }, summary: { pages: run.pages, finalUrl: run.finalUrl }, metrics, evaluation };
  const markdown = toMarkdown({ flow, summary: report.summary, evaluation });

  if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
  if (args.md) writeFileSync(args.md, markdown);

  // Always print the markdown to stdout so CI can capture it.
  console.log(markdown);
  console.error(summaryLine({ flow, evaluation }));

  process.exit(evaluation.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
