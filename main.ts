// The driver the harness runs: reads every case from /input/cases.json
// (or $MAKEFUN_INPUT_DIR), answers each with run from solve.js, and writes
// the answers in case order to /output/answers.json (or $MAKEFUN_OUTPUT_DIR).
// V8's incremental marking is switched off before solve.js is loaded, so the
// parse runs without the marker stepping through its strings.

import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { run } = await import('./solve.js');

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = cases.map((entry) => run(entry.input));
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
