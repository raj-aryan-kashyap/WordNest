/**
 * Home: greeting, streak, today's revision, learn new words, simple stats.
 */
import { esc, plural } from '../utils.js';
import { icon } from '../ui.js';
import { streakPill, weekStrip, statusChip } from '../components.js';
import { reviewStatus } from '../srs.js';
import { CONFIG } from '../config.js';
import { goalSummary } from '../goals.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Hello';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function streakCard(store) {
  const n = store.streak();
  const today = store.isActiveToday();
  let title;
  let msg;
  if (!n) { title = 'Start your streak today'; msg = 'Learn one word to begin.'; }
  else if (today) { title = `${plural(n, 'day', 'days')} in a row`; msg = "You've practiced today. Nice work."; }
  else { title = `${plural(n, 'day', 'days')} in a row`; msg = 'Learn or revise today to keep it going.'; }
  return `<section class="panel" aria-label="Streak">
    <div class="streak-head">
      <div class="streak-flame ${today ? 'is-on' : ''}">${icon('flame', 24)}</div>
      <div><p class="streak-num">${esc(title)}</p><p class="streak-msg">${esc(msg)}</p></div>
    </div>
    ${weekStrip(store)}
  </section>`;
}

function revisionCard(rs) {
  if (rs.state === 'none') return '';
  if (rs.state === 'tomorrow') {
    return `<section class="panel task">
      <div class="task-top"><div class="task-icon task-icon--lilac">${icon('repeat')}</div>
      <div><h2 class="task-title">Revision starts tomorrow</h2><p class="task-text">Come back tomorrow for a quick quiz on today's words.</p></div></div>
    </section>`;
  }
  if (rs.state === 'done') {
    return `<section class="panel task">
      <div class="task-top"><div class="task-icon task-icon--lilac">${icon('repeat')}</div>
      <div><h2 class="task-title">Today's revision is done</h2><p class="task-done">${icon('check', 18)} ${rs.ok} of ${rs.total} right</p></div></div>
      <button class="btn btn-soft btn-block" data-act="practice">Practice more</button>
    </section>`;
  }
  return `<section class="panel task">
    <div class="task-top"><div class="task-icon task-icon--lilac">${icon('repeat')}</div>
    <div><h2 class="task-title">Daily revision</h2><p class="task-text">${plural(rs.count, 'word', 'words')}, about a minute.</p></div></div>
    <button class="btn btn-primary btn-block" data-act="review">Start revision</button>
  </section>`;
}

function learnCard(store, primary) {
  const added = store.addedToday();
  const ctx = goalSummary(store.state.profile);
  return `<section class="panel task">
    <div class="task-top"><div class="task-icon">${icon('learn')}</div>
    <div><h2 class="task-title">Learn new words</h2>
    <p class="task-text">${added ? `You've added ${plural(added, 'word', 'words')} today.` : esc(ctx ? `Picked for: ${ctx}` : 'Words picked for you.')}</p></div></div>
    <button class="btn ${primary ? 'btn-primary' : 'btn-soft'} btn-block" data-act="learn">${added ? 'Keep learning' : 'Start learning'}</button>
  </section>`;
}

export function mount(root, ctx) {
  const { store, go } = ctx;
  const { profile } = store.state;
  const rs = reviewStatus(store.state, CONFIG.DAILY_REVIEW_SIZE);
  const c = store.counts();
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  root.innerHTML = `
    <header class="topbar">
      <div class="topbar-text">
        <p class="greet-date">${esc(date)}</p>
        <h1 class="greet-hi">${esc(greeting())}${profile.name ? `, ${esc(profile.name)}` : ''}</h1>
      </div>
      <div class="topbar-actions">${statusChip()}${streakPill(store)}</div>
    </header>
    <div class="stack">
      ${revisionCard(rs)}
      ${learnCard(store, rs.state !== 'ready')}
      ${streakCard(store)}
    </div>
    <div class="stats" aria-label="Your words">
      <div class="stat"><p class="stat-num">${c.learning}</p><p class="stat-label">Learning</p></div>
      <div class="stat"><p class="stat-num">${c.mastered}</p><p class="stat-label">Mastered</p></div>
      <div class="stat"><p class="stat-num">${c.known}</p><p class="stat-label">Already known</p></div>
    </div>`;

  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'learn') go('learn');
    else if (act === 'review') go('review?mode=daily');
    else if (act === 'practice') go('review?mode=extra');
  };
}
