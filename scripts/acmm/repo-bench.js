#!/usr/bin/env node

/**
 * ACMM Repo Benchmark — Seeded-Bug AI Capability Testing
 *
 * Seeds known bugs into the codebase and provides verification functions.
 * Used to measure AI capability progression over time.
 *
 * Usage:
 *   node scripts/acmm/repo-bench.js --list          List available bugs
 *   node scripts/acmm/repo-bench.js --seed <id>     Inject a bug
 *   node scripts/acmm/repo-bench.js --verify <id>   Check if the bug was fixed
 *   node scripts/acmm/repo-bench.js --record <id> <turns> <seconds>  Record a result
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const RESULTS_PATH = join(ROOT, '.claude/acmm/repo-bench-results.json');

const SEEDED_BUGS = [
  {
    id: 'missing-import',
    name: 'Missing import statement',
    difficulty: 'easy',
    description: 'Remove an import and verify the AI restores it',
    file: 'packages/config/eslint/base.js',
    seed: (content) => content.replace(/^import .+ from ['"].+['"];?\n/m, ''),
    verify: (content) => /^import .+ from ['"].+['"];?\n/m.test(content),
  },
  {
    id: 'wrong-status-code',
    name: 'Incorrect HTTP status code',
    difficulty: 'easy',
    description: 'Change a 201 to 200 in a POST handler',
    file: 'services/users/src/routes/users.ts',
    seed: (content) => content.replace(/\.code\(201\)/, '.code(200)'),
    verify: (content) => /\.code\(201\)/.test(content),
  },
  {
    id: 'type-narrowing',
    name: 'Missing null check',
    difficulty: 'medium',
    description: 'Remove a null guard that TypeScript strict mode requires',
    file: 'packages/api-client/src/client.ts',
    seed: (content) => content.replace(/if\s*\(!callerSignal\)\s*\{[^}]+\}\n\n?/, ''),
    verify: (content) => /if\s*\(!callerSignal\)/.test(content),
  },
];

function listBugs() {
  console.log('ACMM Repo Benchmark — Seeded Bugs\n');
  for (const bug of SEEDED_BUGS) {
    console.log(`  ${bug.id} (${bug.difficulty})`);
    console.log(`    ${bug.name}: ${bug.description}`);
    console.log(`    File: ${bug.file}`);
    console.log('');
  }
}

function seedBug(id) {
  const bug = SEEDED_BUGS.find((b) => b.id === id);
  if (!bug) {
    console.error(`Unknown bug: ${id}. Run --list to see available bugs.`);
    process.exit(1);
  }
  const filePath = join(ROOT, bug.file);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${bug.file}`);
    process.exit(1);
  }
  const backup = filePath + '.bench-backup';
  copyFileSync(filePath, backup);
  const content = readFileSync(filePath, 'utf8');
  const seeded = bug.seed(content);
  if (seeded === content) {
    console.log(`Warning: seed function did not modify ${bug.file} — pattern may not match`);
  }
  writeFileSync(filePath, seeded);
  console.log(`Seeded bug '${id}' in ${bug.file}`);
  console.log(`Backup saved to ${bug.file}.bench-backup`);
  console.log(`\nGive the AI this task: "${bug.description} in ${bug.file}"`);
}

function verifyFix(id) {
  const bug = SEEDED_BUGS.find((b) => b.id === id);
  if (!bug) {
    console.error(`Unknown bug: ${id}`);
    process.exit(1);
  }
  const filePath = join(ROOT, bug.file);
  const content = readFileSync(filePath, 'utf8');
  const fixed = bug.verify(content);
  console.log(`Bug '${id}': ${fixed ? 'FIXED' : 'NOT FIXED'}`);

  const backup = filePath + '.bench-backup';
  if (existsSync(backup)) {
    copyFileSync(backup, filePath);
    unlinkSync(backup);
    console.log('Restored original file from backup');
  }
  return fixed;
}

function recordResult(id, turns, seconds) {
  const bug = SEEDED_BUGS.find((b) => b.id === id);
  if (!bug) {
    console.error(`Unknown bug: ${id}`);
    process.exit(1);
  }
  const results = existsSync(RESULTS_PATH)
    ? JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
    : { benchmarks: [] };

  const entry = {
    bugId: id,
    difficulty: bug.difficulty,
    turns: Number(turns),
    seconds: Number(seconds),
    date: new Date().toISOString(),
  };
  const updated = { ...results, benchmarks: [...results.benchmarks, entry] };
  writeFileSync(RESULTS_PATH, JSON.stringify(updated, null, 2) + '\n');
  console.log(`Recorded: ${id} — ${turns} turns, ${seconds}s`);
}

const args = process.argv.slice(2);
if (args[0] === '--list' || args.length === 0) {
  listBugs();
} else if (args[0] === '--seed' && args[1]) {
  seedBug(args[1]);
} else if (args[0] === '--verify' && args[1]) {
  verifyFix(args[1]);
} else if (args[0] === '--record' && args.length === 4) {
  recordResult(args[1], args[2], args[3]);
} else {
  console.log('Usage:');
  console.log('  node scripts/acmm/repo-bench.js --list');
  console.log('  node scripts/acmm/repo-bench.js --seed <bug-id>');
  console.log('  node scripts/acmm/repo-bench.js --verify <bug-id>');
  console.log('  node scripts/acmm/repo-bench.js --record <bug-id> <turns> <seconds>');
}
