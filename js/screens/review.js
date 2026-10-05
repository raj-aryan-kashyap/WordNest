/**
 * Revision quiz.
 *  mode=daily  today's revision (counts for the day, 5 words)
 *  mode=extra  extra practice after the daily one is done
 * A wrong answer is asked once more at the end of the round (not graded again).
 */
import { esc, plural, haptic, dayKey, prefersReducedMotion } from '../utils.js';
import { icon, confirmSheet, speak } from '../ui.js';
import { renderQuestion, renderFeedback, stateBlock } from '../components.js';
import { pickReview, grade } from '../srs.js';
import { buildQuestion } from '../quiz.js';
import { CONFIG } from '../config.js';

export function mount(root, ctx, params) {
  const { store, engine, go } = ctx;
  const mode = params.get('mode') === 'extra' ? 'extra' : 'daily';
  const today = dayKey();
  const reviewedToday = new Set(Object.values(store.state.words).filter((r) => r.last === today).map((r) => r.id));

  // Daily: if already done today, treat as extra practice.
  const dailyDone = !!(store.state.reviews[today] && store.state.reviews[today].done);
  const isDaily = mode === 'daily' && !dailyDone;
  const recs = pickReview(store.state.words, CONFIG.DAILY_REVIEW_SIZE, { exclude: isDaily ? new Set() : reviewedToday });
  const items = recs.map((r) => engine.card(r.id)).filter(Boolean);

  let queue = items.map((c) => ({ card: c, retry: false }));
  let i = 0;
  let answered = null;
  let q = null;
  const results = new Map(); // id -> true/false (first try only)
  let finished = false;

  function progress() {
    const total = queue.length;
    const pct = total ? Math.round((i / total) * 100) : 0;
    return `<div class="rv-top">
      <button class="icon-btn" data-act="close" aria-label="Close revision">${icon('x')}</button>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${i}"><i style="width:${pct}%"></i></div>
      <span class="rv-count">${Math.min(i + 1, total)}/${total}</span>
    </div>`;
  }

  function drawQuestion() {
    const item = queue[i];
    if (!q) q = buildQuestion(item.card, engine.allCards(), { avoidType: i > 0 ? queue[i - 1].lastType : undefined });
    item.lastType = q.type;
    const ok = answered !== null ? q.options[answered].ok : null;
    root.innerHTML = `${progress()}
      ${renderQuestion(q, { answered, note: item.retry ? 'One more try' : '' })}
      ${answered !== null ? renderFeedback(ok, item.card, { cta: i + 1 < queue.length ? 'Continue' : 'See results' }) : ''}`;
    if (answered !== null) {
      root.querySelector('.feedback')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      root.querySelector('[data-act="continue"]')?.focus({ preventScroll: true });
    }
  }

  function drawSummary() {
    const ok = [...results.values()].filter(Boolean).length;
    const total = results.size;
    const msg = ok === total ? 'Every answer right. Great memory!'
      : ok >= total / 2 ? "Good work. The ones you missed will come back soon."
      : "These words need a bit more practice. They'll come back soon.";
    const list = items.map((c) => {
      const good = results.get(c.id);
      return `<li class="result">
        <span class="result-mark ${good ? 'is-good' : 'is-bad'}">${icon(good ? 'check' : 'repeat', 16)}</span>
        <div><p class="result-word">${esc(c.w)}</p><p class="result-note">${good ? 'Spaced out further' : 'Coming back sooner'}</p></div>
      </li>`;
    }).join('');
    const streak = store.streak();
    root.innerHTML = `<div class="summary">
      <div class="summary-head">
        <p class="summary-score">${ok}/${total}</p>
        <h1>${isDaily ? 'Revision done' : 'Practice done'}</h1>
        <p>${esc(msg)}</p>
        ${streak ? `<p class="muted small" style="margin-top:8px">${plural(streak, 'day', 'days')} in a row</p>` : ''}
      </div>
      <ul class="result-list">${list}</ul>
      <div class="summary-foot">
        <button class="btn btn-primary btn-block" data-act="learn">Learn new words</button>
        <button class="btn btn-ghost btn-block" data-act="home">Back to home</button>
      </div>
    </div>`;
  }

  function finish() {
    finished = true;
    const ok = [...results.values()].filter(Boolean).length;
    if (isDaily) {
      store.update((s) => { s.reviews[today] = { done: true, ok, total: results.size }; });
    }
    store.markActive();
    haptic(15);
    drawSummary();
  }

  function answer(idx) {
    if (answered !== null) return;
    answered = idx;
    const item = queue[i];
    const ok = q.options[idx].ok;
    haptic(ok ? 10 : 30);
    if (!item.retry) {
      results.set(item.card.id, ok);
      store.update((s) => {
        const rec = s.words[item.card.id];
        if (rec) grade(rec, ok, today);
      });
      engine.noteQuizAnswer(item.card, ok);
      if (!ok) queue.push({ card: item.card, retry: true });
    }
    drawQuestion();
  }

  function next() {
    i++;
    answered = null;
    q = null;
    if (i >= queue.length) finish();
    else drawQuestion();
  }

  root.onclick = async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'answer') answer(Number(el.dataset.i));
    else if (act === 'continue') next();
    else if (act === 'hear') speak(queue[i]?.card.w, queue[i]?.card.audio, el);
    else if (act === 'learn') go('learn', { replace: true });
    else if (act === 'home') go('home', { replace: true });
    else if (act === 'close') {
      if (finished || results.size === 0) return go('home', { replace: true });
      const stop = await confirmSheet({
        title: 'Stop revision?',
        text: 'Your answers so far are saved.',
        okLabel: 'Stop',
        cancelLabel: 'Keep going',
      });
      if (stop) go('home', { replace: true });
    }
  };

  // Keyboard: 1-4 to answer, Enter to continue (handy on desktop).
  const onKey = (e) => {
    if (finished || !q) return;
    if (answered === null && /^[1-4]$/.test(e.key) && q.options[Number(e.key) - 1]) answer(Number(e.key) - 1);
    else if (answered !== null && e.key === 'Enter') { e.preventDefault(); next(); }
  };
  document.addEventListener('keydown', onKey);

  if (!items.length) {
    root.innerHTML = `<div class="rv-top"><button class="icon-btn" data-act="home" aria-label="Close">${icon('x')}</button></div>
      ${stateBlock({
        iconName: 'repeat',
        title: Object.keys(store.state.words).length ? 'Nothing to revise right now' : 'No words to revise yet',
        text: Object.keys(store.state.words).length
          ? 'Words you add today are ready to revise from tomorrow.'
          : 'Learn a few new words first. Your first revision starts the next day.',
        actions: '<button class="btn btn-primary" data-act="learn">Learn new words</button>',
      })}`;
  } else {
    drawQuestion();
  }

  return () => document.removeEventListener('keydown', onKey);
}
