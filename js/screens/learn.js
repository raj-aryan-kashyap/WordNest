/**
 * Learn: one word at a time. "New to me" adds it to revision,
 * "I know this" skips it and teaches the engine to aim higher.
 * Every few cards, a word the user got wrong earlier comes back as a quick check.
 *
 * Phases: loading -> card | check | empty | error
 */
import { plural, haptic, wait, prefersReducedMotion } from '../utils.js';
import { icon, toast, speak, openSearch } from '../ui.js';
import { renderEntry, renderEntrySkeleton, renderQuestion, renderFeedback, streakPill, stateBlock, statusChip } from '../components.js';
import { status } from '../status.js';
import { reviewStatus, pickRecheck, grade } from '../srs.js';
import { buildQuestion } from '../quiz.js';
import { CONFIG } from '../config.js';

export function mount(root, ctx) {
  const { store, engine, go } = ctx;
  let alive = true;
  let phase = 'loading';
  let card = null;
  let check = null;              // { card, q, answered }
  let busy = false;
  let sinceCheck = 0;
  const checked = new Set();     // words already re-checked in this visit
  let animateIn = true;

  /* ---------- Views ---------- */
  function header() {
    const n = store.addedToday();
    const rs = reviewStatus(store.state, CONFIG.DAILY_REVIEW_SIZE);
    const banner = rs.state === 'ready' ? `
      <div class="banner">
        <div class="banner-text"><strong>Your daily revision is ready</strong><span>${plural(rs.count, 'word', 'words')}, about a minute</span></div>
        <button class="btn btn-soft btn-sm" data-act="review">Start</button>
      </div>` : '';
    return `<header class="topbar">
        <div class="topbar-text"><h1 class="screen-title">Learn</h1>
        <p class="screen-sub">${n ? `${plural(n, 'new word', 'new words')} today` : 'Words picked for your goal'}</p></div>
        <div class="topbar-actions">${statusChip()}${streakPill(store)}</div>
      </header>${banner}`;
  }

  function body() {
    if (phase === 'loading') return renderEntrySkeleton(status.get().words.phase === 'running' ? 'Finding new words for your goals...' : 'Finding your next word...');
    if (phase === 'error') {
      return stateBlock({
        iconName: 'wifi',
        title: "Couldn't load a new word",
        text: CONFIG.PREVIEW
          ? "Claude couldn't pick new words just now. Try again in a moment."
          : 'New words need the internet. Check your connection and try again.',
        actions: '<button class="btn btn-primary" data-act="retry">Try again</button><button class="btn btn-ghost" data-act="words">See my words</button>',
      });
    }
    if (phase === 'empty') {
      return stateBlock({
        iconName: 'sparkle',
        title: "You've seen every word we have right now",
        text: CONFIG.PREVIEW
          ? "New words from Claude aren't available in this view. You can still revise your words."
          : 'Add more detail to your goal, or turn on smarter word picks in Me. You can also revise your words.',
        actions: '<button class="btn btn-primary" data-act="me">Open Me</button><button class="btn btn-ghost" data-act="extra">Revise my words</button>',
      });
    }
    if (phase === 'check') {
      const { q, answered, card: c } = check;
      return `<section class="panel">${renderQuestion(q, { answered, note: 'Quick check: you missed this one before.' })}</section>
        ${answered !== null ? renderFeedback(q.options[answered].ok, c, { cta: 'Next word' }) : ''}`;
    }
    // card
    return `${renderEntry(card, { animate: animateIn && !prefersReducedMotion() })}
      <div class="learn-actions">
        <button class="btn btn-soft" data-act="known">${icon('check', 20)} I know this</button>
        <button class="btn btn-primary" data-act="new">${icon('plus', 20)} New to me</button>
      </div>`;
  }

  function draw() {
    if (!alive) return;
    root.innerHTML = `${header()}<div class="learn-stage">${body()}</div>`;
  }

  /* ---------- Flow ---------- */
  async function loadNext() {
    // Quick check for a missed word, every few cards.
    if (sinceCheck >= CONFIG.CHECK_EVERY) {
      const rec = pickRecheck(store.state.words, { exclude: checked });
      const c = rec && engine.card(rec.id);
      if (c) {
        sinceCheck = 0;
        checked.add(c.id);
        check = { card: c, q: buildQuestion(c, engine.allCards()), answered: null };
        phase = 'check';
        draw();
        return;
      }
    }
    phase = 'loading';
    draw();
    try {
      const next = await engine.next();
      if (!alive) return;
      card = next;
      phase = next ? 'card' : 'empty';
      animateIn = true;
    } catch (e) {
      console.warn(e);
      if (!alive) return;
      phase = 'error';
    }
    draw();
    if (phase === 'card') engine.prefetch();
  }

  async function decide(known) {
    if (busy || !card) return;
    busy = true;
    haptic(10);
    const entry = root.querySelector('.entry');
    if (entry && !prefersReducedMotion()) {
      entry.classList.add(known ? 'is-out-left' : 'is-out-right');
      await wait(170);
    }
    const shown = card;
    engine.record(shown, known);
    sinceCheck++;
    const firstToday = store.markActive();
    const n = store.streak();
    const msg = firstToday
      ? (n > 1 ? `${n} days in a row. Keep it up!` : 'Your streak has started!')
      : (known ? 'Marked as known' : 'Added to your words');
    toast(msg, {
      action: 'Undo',
      onAction: () => {
        const back = engine.undo();
        if (!back || !alive) return;
        card = back;
        phase = 'card';
        animateIn = false;
        draw();
      },
    });
    busy = false;
    if (alive) loadNext();
  }

  function answerCheck(i) {
    if (!check || check.answered !== null) return;
    const ok = check.q.options[i].ok;
    haptic(ok ? 10 : 30);
    check.answered = i;
    store.update((s) => {
      const rec = s.words[check.card.id];
      if (rec) grade(rec, ok);
    });
    engine.noteQuizAnswer(check.card, ok);
    draw();
    root.querySelector('.feedback')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    switch (el.dataset.act) {
      case 'new': decide(false); break;
      case 'known': decide(true); break;
      case 'hear': speak(card?.w || check?.card.w, card?.audio, el); break;
      case 'search': if (card) openSearch(card.w); break;
      case 'answer': answerCheck(Number(el.dataset.i)); break;
      case 'continue': check = null; loadNext(); break;
      case 'retry': loadNext(); break;
      case 'review': go('review?mode=daily'); break;
      case 'extra': go('review?mode=extra'); break;
      case 'words': go('words'); break;
      case 'me': go('me'); break;
      default:
    }
  };

  loadNext();
  return () => { alive = false; };
}
