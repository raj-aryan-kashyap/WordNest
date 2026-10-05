/**
 * Copies the app's starter words (js/data/seed.js) into google-sheet/2_APPS_SCRIPT_CODE.txt,
 * between the STARTER markers, so the sheet's Library can be pre-filled.
 * Run after changing seed.js:  node tools/build-gs-starter.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SEED } = await import(pathToFileURL(path.join(root, 'js/data/seed.js')).href);
const ex = (c, t) => (c.ex.find((e) => e.t === t) || {}).s || '';
// [key, word, part of speech, level, meaning, say, ipa, past, present, future, hindi, hindi meaning, tags]
const rows = SEED.map((c) => [c.id, c.w, c.p, c.d, c.m, c.say, c.ipa, ex(c, 'Past'), ex(c, 'Present'), ex(c, 'Future'), c.hi, c.him, c.t.join(',')]);
const block = `// STARTER:BEGIN (generated from js/data/seed.js by tools/build-gs-starter.mjs, ${rows.length} words)\nvar STARTER = ${JSON.stringify(rows)};\n// STARTER:END`;

const file = path.join(root, 'google-sheet', '2_APPS_SCRIPT_CODE.txt');
let gs = fs.readFileSync(file, 'utf8');
gs = gs.replace(/\/\/ STARTER:BEGIN[\s\S]*?\/\/ STARTER:END/, block);
fs.writeFileSync(file, gs);
console.log(`Wrote ${rows.length} starter words into google-sheet/2_APPS_SCRIPT_CODE.txt`);
