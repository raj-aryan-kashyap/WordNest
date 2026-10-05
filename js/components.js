/**
 * HTML building blocks shared by screens. All content is escaped.
 */
import { esc, addDays, dayKey } from './utils.js';
import { icon } from './ui.js';
import { highlight } from './quiz.js';
import { topicLabel } from './engine.js';
import { status } from './status.js';

/* ---------- Word entry (the hero card) ---------- */
function levelBars(d) {
  const n = Math.max(1, Math.min(5, Math.round(d || 3)));
  return `<span class="lvl" role="img" aria-label="Level ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'is-on' : ''}"></i>`).join('')}</span>`;
}

const tenseClass = (t) => (/past/i.test(t) ? 'past' : /present/i.test(t) ? 'present' : /future/i.test(t) ? 'future' : 'plain');

export function renderEntry(card, { tools = true, animate = false, mine = false } = {}) {
  const len = card.w.length;
  const sizeClass = len > 15 ? 'is-xlong' : len > 10 ? 'is-long' : '';
  const topic = (card.t || []).map(topicLabel).filter(Boolean)[0];
  const ex = card.ex || [];
  const isTimeline = ex.some((e) => tenseClass(e.t) !== 'plain');

  const uses = ex.length
    ? `<ol class="uses ${isTimeline ? '' : 'uses--plain'}" aria-label="Examples">${ex.map((e) => `
        <li class="use use--${tenseClass(e.t)}">
          <span class="use-label">${esc(e.t)}</span>
          <p class="use-text">${highlight(e.s, card.w)}</p>
        </li>`).join('')}</ol>`
    : '<p class="entry-empty">No example sentences for this word yet. Tap Search on Google to see it in use.</p>';

  const hindi = card.hi || card.him
    ? `<section class="hindi" lang="hi"><h3 class="hindi-label" lang="en">In Hindi</h3>
        ${card.hi ? `<p class="hindi-word">${esc(card.hi)}</p>` : ''}
        ${card.him ? `<p class="hindi-text">${esc(card.him)}</p>` : ''}</section>`
    : '<section class="hindi hindi--missing"><p>The Hindi meaning isn\'t available for this word. Tap Search on Google to see one.</p></section>';

  return `<article class="entry ${animate ? 'is-in' : ''}" aria-label="${esc(card.w)}">
    <div class="entry-meta">
      <div class="entry-tags">
        ${card.p ? `<span class="tag tag--pos">${esc(card.p)}</span>` : ''}
        ${mine || card.src === 'user' ? `<span class="tag tag--mine">${icon('me', 13)} Added by you</span>`
          : card.src === 'ai' ? `<span class="tag tag--ai">${icon('sparkle', 13)} Picked for you</span>`
          : topic ? `<span class="tag">${esc(topic)}</span>` : ''}
      </div>
      ${levelBars(card.d)}
    </div>
    <h2 class="entry-word ${sizeClass}" lang="en">${esc(card.w)}</h2>
    <div class="entry-pron">
      <button class="hear" type="button" data-act="hear" aria-label="Hear how to say ${esc(card.w)}">${icon('volume', 20)}</button>
      <div class="pron-text">
        ${card.say ? `<span class="pron-say">${esc(card.say)}</span>` : ''}
        ${card.ipa ? `<span class="pron-ipa">${esc(card.ipa)}</span>` : ''}
        ${!card.say && !card.ipa ? '<span class="pron-ipa">Tap to hear it</span>' : ''}
      </div>
    </div>
    ${card.m ? `<p class="entry-meaning">${esc(card.m)}</p>` : ''}
    ${card.note ? `<p class="entry-note">${esc(card.note)}</p>` : ''}
    ${uses}
    ${hindi}
    ${tools ? `<div class="entry-tools"><button class="link-btn" type="button" data-act="search">${icon('search', 18)} Search on Google</button>
      <button class="link-btn" type="button" data-act="add-own">${icon('plus', 18)} Add your own word</button></div>` : ''}
  </article>`;
}

export function renderEntrySkeleton(note = 'Finding your next word...') {
  return `<div class="entry entry--skeleton" aria-busy="true" aria-label="Finding your next word">
      <div class="sk sk-tag"></div><div class="sk sk-word"></div><div class="sk sk-pron"></div>
      <div class="sk sk-line"></div><div class="sk sk-line short"></div>
      <div class="sk sk-line"></div><div class="sk sk-line short"></div>
    </div>
    <p class="loading-note">${esc(note)}</p>`;
}

/* ---------- Quiz ---------- */
export function renderQuestion(q, { answered = null, note = '' } = {}) {
  const done = answered !== null;
  return `<div class="quiz">
    ${note ? `<p class="quiz-note">${esc(note)}</p>` : ''}
    <p class="quiz-label">${esc(q.label)}</p>
    <div class="quiz-prompt ${q.promptClass}" ${q.lang ? `lang="${q.lang}"` : ''}>${q.promptHtml}</div>
    <div class="quiz-opts">
      ${q.options.map((o, i) => {
        let cls = '';
        let mark = '';
        if (done) {
          if (o.ok) { cls = 'is-right'; mark = icon('check', 20); }
          else if (i === answered) { cls = 'is-wrong'; mark = icon('x', 20); }
          else cls = 'is-dim';
        }
        return `<button class="opt ${cls}" type="button" data-act="answer" data-i="${i}" ${done ? 'disabled' : ''}><span>${esc(o.text)}</span>${mark}</button>`;
      }).join('')}
    </div>
  </div>`;
}

export function renderFeedback(correct, card, { cta = 'Continue' } = {}) {
  return `<div class="feedback ${correct ? 'is-good' : 'is-bad'}" role="status">
    <p class="fb-title">${icon(correct ? 'check' : 'repeat', 20)} ${correct ? 'Correct!' : "Not quite. We'll bring this one back soon."}</p>
    <p class="fb-word"><strong>${esc(card.w)}</strong>: ${esc(card.m)}</p>
    ${card.hi ? `<p class="fb-hi" lang="hi">${esc(card.hi)}</p>` : ''}
    <button class="btn btn-primary btn-block" type="button" data-act="continue">${esc(cta)}</button>
  </div>`;
}

/* ---------- Status icon (sync + word finding) ---------- */
/** Small round icon. Grows a short label only while something is running. */
export function statusChip() {
  const { sync, words } = status.get();
  const busy = sync.phase === 'running' ? 'Syncing' : words.phase === 'running' ? 'Finding new words' : '';
  const bad = sync.phase === 'error' || words.phase === 'error';
  const label = busy || (bad ? 'Something needs a look' : sync.phase === 'ok' ? 'All synced' : 'Status');
  return `<button class="status-chip ${busy ? 'is-busy' : ''} ${bad ? 'is-bad' : ''}" type="button" data-act="status" data-status-chip aria-label="${esc(label)}. Tap for details.">
    <span class="status-ic">${icon(busy ? 'sync' : sync.phase === 'ok' ? 'cloud' : 'sync', 18)}</span>${busy ? `<span class="status-label">${busy}</span>` : ''}
  </button>`;
}

/* ---------- Streak ---------- */
export function streakPill(store) {
  const n = store.streak();
  const on = store.isActiveToday();
  const label = n ? `${n} day streak${on ? '' : ', practice today to keep it'}` : 'No streak yet';
  return `<button class="streak-pill ${on ? 'is-on' : ''}" type="button" data-act="go-home" aria-label="${label}">${icon('flame', 18)}<span>${n}</span></button>`;
}

/** Last 7 days ending today, Monday-first labels from the real dates. */
export function weekStrip(store) {
  const today = dayKey();
  const set = new Set(store.state.days);
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const [y, m, dd] = d.split('-').map(Number);
    const wd = new Date(y, m - 1, dd).getDay();
    const on = set.has(d);
    html += `<div class="week-day ${on ? 'is-on' : ''} ${i === 0 ? 'is-today' : ''}" ${i === 0 ? 'aria-current="date"' : ''}>
      <span class="week-dot">${on ? icon('check', 16) : ''}</span><span>${names[wd]}</span></div>`;
  }
  return `<div class="week" aria-label="Your last 7 days">${html}</div>`;
}

/* ---------- Empty / error state ---------- */
export function stateBlock({ iconName = 'book', good = false, title, text, actions = '' }) {
  return `<div class="state">
    <div class="state-icon ${good ? 'state-icon--good' : ''}">${icon(iconName, 28)}</div>
    <h2>${esc(title)}</h2>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${actions}
  </div>`;
}
