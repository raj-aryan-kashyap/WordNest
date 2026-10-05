/**
 * Free online word sources. No keys needed except the optional Gemini one.
 *
 *  Datamuse        related words + how common they are   api.datamuse.com
 *  Free Dictionary pronunciation, meaning, examples      dictionaryapi.dev
 *  MyMemory        English to Hindi translation          mymemory.translated.net
 *  Gemini (opt.)   full cards picked by AI               generativelanguage.googleapis.com
 */
import { fetchJSON, runtime } from './utils.js';

/* ---------- Datamuse ---------- */

/** Word frequency (per million words) to our 1-5 difficulty scale. */
export function freqToLevel(f) {
  if (f > 40) return 2;
  if (f > 15) return 2.5;
  if (f > 6) return 3;
  if (f > 2.5) return 3.5;
  if (f > 1) return 4;
  return 4.5;
}

const POS = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

/** Turn one Datamuse item into a candidate, or null if it is not useful. */
export function parseDatamuse(item) {
  const w = String(item.word || '').toLowerCase();
  if (!/^[a-z][a-z-]{3,17}$/.test(w)) return null;          // single words only
  const tags = item.tags || [];
  if (tags.includes('prop')) return null;                    // skip names
  const ft = tags.find((t) => t.startsWith('f:'));
  const f = ft ? parseFloat(ft.slice(2)) : 0;
  if (f > 150 || f < 0.4) return null;                       // too basic or too rare
  const posTag = ['v', 'adj', 'n', 'adv'].find((p) => tags.includes(p));
  const def = ((item.defs && item.defs[0]) || '').split('\t')[1] || '';
  return { w, f, d: freqToLevel(f), p: POS[posTag] || '', def };
}

export async function datamuseRelated(keyword) {
  const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(keyword)}&md=fpd&max=100`;
  const list = await fetchJSON(url, {}, 8000);
  return (Array.isArray(list) ? list : []).map(parseDatamuse).filter(Boolean);
}

/** How common a word is, as our 1-5 level. Defaults to 3 if unknown. */
export async function levelForWord(word) {
  try {
    const list = await fetchJSON(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=f&max=1`, {}, 6000);
    const ft = (list[0]?.tags || []).find((t) => t.startsWith('f:'));
    return ft ? freqToLevel(parseFloat(ft.slice(2))) : 3;
  } catch {
    return 3;
  }
}

/** "Did you mean" suggestions for a misspelled word. */
export async function spellingSuggestions(word) {
  try {
    const list = await fetchJSON(`https://api.datamuse.com/sug?s=${encodeURIComponent(word)}&max=6`, {}, 6000);
    return list.map((x) => x.word).filter((w) => w && w.toLowerCase() !== word.toLowerCase()).slice(0, 4);
  } catch {
    return [];
  }
}

/* ---------- Free Dictionary ---------- */

/** Returns { ipa, audio, pos, meaning, examples } or null if the word is unknown. */
export async function lookupDictionary(word) {
  let data;
  try {
    data = await fetchJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {}, 8000);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
  const entries = Array.isArray(data) ? data : [];
  if (!entries.length) return null;

  let ipa = '';
  let audio = '';
  for (const en of entries) {
    if (!ipa && en.phonetic) ipa = en.phonetic;
    for (const ph of en.phonetics || []) {
      if (!ipa && ph.text) ipa = ph.text;
      if (ph.audio && (!audio || /-us\./.test(ph.audio))) audio = ph.audio;
    }
  }

  let meaning = '';
  let pos = '';
  const examples = [];
  for (const en of entries) {
    for (const m of en.meanings || []) {
      for (const d of m.definitions || []) {
        if (!meaning && d.definition) { meaning = d.definition; pos = m.partOfSpeech || ''; }
        if (d.example && examples.length < 3 && !examples.includes(d.example)) examples.push(d.example);
      }
    }
  }
  if (!meaning) return null;
  if (meaning.length > 160) meaning = meaning.slice(0, 157).replace(/\s+\S*$/, '') + '...';
  if (audio.startsWith('//')) audio = 'https:' + audio;
  return { ipa, audio, pos, meaning, examples };
}

/* ---------- MyMemory (Hindi) ---------- */

/** English to Hindi. Returns '' when the free service has no good answer. */
export async function translateToHindi(text) {
  if (!text) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=en|hi`;
    const data = await fetchJSON(url, {}, 8000);
    const out = (data && data.responseData && data.responseData.translatedText) || '';
    if (String(data.responseStatus) !== '200') return '';
    if (/MYMEMORY|QUERY LENGTH|INVALID|PLEASE SELECT/i.test(out)) return '';
    if (!/[\u0900-\u097F]/.test(out)) return '';               // must contain Devanagari
    return out.trim();
  } catch {
    return '';
  }
}

/* ---------- Claude (preview inside claude.ai only) ---------- */

/** Ask Claude for JSON. Returns null when this page can't reach Claude. */
export async function claudeJSON(prompt) {
  const sample = await runtime('sample');
  if (!sample) return null;
  return sample.json(prompt, { modelTier: 'default' });
}

/* ---------- Gemini (optional) ---------- */

export async function geminiJSON({ key, model, prompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const data = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    }),
  }, 30000);
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

/** Quick check that a key works. Throws with .status on failure. */
export async function testGemini({ key, model }) {
  const out = await geminiJSON({ key, model, prompt: 'Reply with this JSON only: {"ok": true}' });
  if (!out || out.ok !== true) throw new Error('Unexpected reply');
  return true;
}
