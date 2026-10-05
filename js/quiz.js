/**
 * Builds revision questions from word cards.
 * Types: meaning (word -> meaning), word (meaning -> word),
 *        hindi (Hindi -> word), blank (fill the gap in a sentence).
 */
import { shuffle, escapeRegex, esc } from './utils.js';

/** Regex that finds a word and its common forms (resolve, resolved, resolves). */
export function wordPattern(word) {
  const stem = (t) => (t.length > 4 ? t.replace(/(e|y)$/, '') : t);
  const parts = word.toLowerCase().split(/[\s-]+/).filter(Boolean).map((t) => escapeRegex(stem(t)) + '[a-z]*');
  return new RegExp('\\b' + parts.join('[\\s-]+') + '\\b', 'i');
}

/** Escaped sentence with the target word wrapped in <mark>. */
export function highlight(sentence, word) {
  const re = wordPattern(word);
  const m = re.exec(sentence);
  if (!m) return esc(sentence);
  return esc(sentence.slice(0, m.index)) + '<mark>' + esc(m[0]) + '</mark>' + esc(sentence.slice(m.index + m[0].length));
}

/** Pick wrong options: similar part of speech and level, all distinct. */
function pickDistractors(card, pool, n, field) {
  const usedText = new Set([String(card[field] || '').toLowerCase()]);
  const ranked = pool
    .filter((c) => c.id !== card.id && c.w.toLowerCase() !== card.w.toLowerCase() && c[field])
    .map((c) => ({
      c,
      s: (c.p && card.p && c.p.split(',')[0] === card.p.split(',')[0] ? 0 : 1)
        + Math.abs((c.d || 3) - (card.d || 3)) * 0.3
        + Math.random() * 0.9,
    }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.c);
  const out = [];
  for (const c of ranked) {
    const key = String(c[field]).toLowerCase();
    if (usedText.has(key)) continue;
    usedText.add(key);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

const short = (s, n = 110) => (s.length > n ? s.slice(0, n - 3).replace(/\s+\S*$/, '') + '...' : s);

/**
 * Returns { type, label, promptHtml, promptClass, lang, options: [{ text, ok }] }.
 * `pool` is every card we know (used to build wrong options).
 */
export function buildQuestion(card, pool, { avoidType } = {}) {
  const types = ['meaning', 'word'];
  if (card.hi) types.push('hindi');
  const re = wordPattern(card.w);
  const blankSentence = (card.ex || []).map((e) => e.s).find((s) => re.test(s));
  if (blankSentence) types.push('blank', 'blank');
  const options = types.filter((t) => t !== avoidType);
  let type = options[Math.floor(Math.random() * options.length)] || 'meaning';

  const field = type === 'meaning' ? 'm' : 'w';
  const wrong = pickDistractors(card, pool, 3, field);
  if (wrong.length < 1) type = 'meaning';

  const wordOptions = () => shuffle([{ text: card.w, ok: true }, ...wrong.map((c) => ({ text: c.w, ok: false }))]);

  switch (type) {
    case 'word':
      return { type, label: 'Which word has this meaning?', promptHtml: esc(card.m), promptClass: 'is-text', options: wordOptions() };
    case 'hindi':
      return {
        type, label: 'Which English word is this?', promptClass: 'is-hindi', lang: 'hi',
        promptHtml: esc(card.hi) + (card.him ? `<span class="sub">${esc(card.him)}</span>` : ''),
        options: wordOptions(),
      };
    case 'blank': {
      const m = re.exec(blankSentence);
      const html = esc(blankSentence.slice(0, m.index)) + '<span class="gap" aria-label="missing word"></span>' + esc(blankSentence.slice(m.index + m[0].length));
      return { type, label: 'Which word fits the gap?', promptHtml: html, promptClass: 'is-sentence', options: wordOptions() };
    }
    default: {
      const opts = shuffle([{ text: short(card.m), ok: true }, ...pickDistractors(card, pool, 3, 'm').map((c) => ({ text: short(c.m), ok: false }))]);
      return { type: 'meaning', label: 'What does this word mean?', promptHtml: esc(card.w), promptClass: 'is-word', options: opts };
    }
  }
}
