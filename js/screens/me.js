/**
 * Me: progress, learning goal, sync, optional smarter word picks, backup.
 */
import { esc, plural, timeAgo, haptic, runtime } from '../utils.js';
import { icon, toast, confirmSheet } from '../ui.js';
import { CONFIG } from '../config.js';
import { syncConfigured, syncEnabled, signIn, signOut, syncNow, validName } from '../sync.js';
import { testGemini } from '../sources.js';
import { bindGoalEditor, goalCount, sameGoals } from '../goals.js';
import { status } from '../status.js';

const LEVELS = [
  { id: 'beginner', title: 'Just starting' },
  { id: 'middle', title: 'I know the basics' },
  { id: 'advanced', title: "I'm quite good" },
];

export function mount(root, ctx) {
  const { store, engine, go } = ctx;
  let formError = '';
  let busy = '';

  function syncSection() {
    const s = store.state.sync;
    if (CONFIG.PREVIEW) {
      return '<p class="section-note" style="margin:0">Sync is off in this preview. It works in your GitHub version once SYNC_URL is set.</p>';
    }
    if (!syncConfigured()) {
      return `<p class="section-note" style="margin:0">Sync isn't set up for this app yet. Follow "Turn on sync" in the README. Until then, your words are saved on this phone.</p>`;
    }
    if (syncEnabled(store)) {
      const bad = !!s.error;
      return `<div class="status-line"><span class="status-dot ${bad ? 'is-bad' : 'is-on'}"></span>
          <span>Signed in as <strong>${esc(s.user)}</strong></span></div>
        <p class="muted small" style="margin-top:6px">${bad ? esc(s.error) : `Last synced ${timeAgo(s.last)}`}</p>
        <div class="row-actions">
          <button class="btn btn-soft btn-sm ${busy === 'sync' ? 'is-busy' : ''}" data-act="sync-now">${icon('sync', 18)} Sync now</button>
          <button class="btn btn-ghost btn-sm" data-act="sign-out">Sign out</button>
        </div>`;
    }
    return `<p class="section-note">Use the same name and PIN on another phone to get your words there too. A new name creates a new account.</p>
      <label class="field"><span class="field-label">Name</span>
        <input id="sync-name" class="input" type="text" maxlength="40" autocomplete="username" autocapitalize="none" placeholder="For example: raj" value="${esc(s.user || store.state.profile.name.toLowerCase().replace(/\s+/g, ''))}">
        <span class="field-hint">Letters, numbers, dots or dashes. No spaces.</span></label>
      <label class="field"><span class="field-label">PIN</span>
        <input id="sync-pin" class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" placeholder="4 to 8 numbers"></label>
      ${formError ? `<p class="field-error" role="alert">${esc(formError)}</p>` : ''}
      <div class="row-actions"><button class="btn btn-primary btn-block ${busy === 'signin' ? 'is-busy' : ''}" data-act="sign-in">Turn on sync</button></div>`;
  }

  /** How smart picks work right now, in one or two lines. */
  function aiIntro() {
    const info = status.get().words.ai;
    if (syncEnabled(store)) {
      if (info && info.on) {
        return `<div class="status-line"><span class="status-dot is-on"></span><span>On, using the Gemini key in your Google Sheet</span></div>
          <p class="muted small" style="margin:6px 0 14px">${info.used} of ${info.limit} smart picks used today. Each pick adds up to 12 words. When they run out, free dictionary words fill in until tomorrow.</p>`;
      }
      return `<p class="section-note">Best option: in your Google Sheet, click WordNest &gt; Set Gemini key and paste a free key from
        <a class="ext-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>.
        The key stays in the sheet, works on all your phones, and new words go into your Library.</p>`;
    }
    return `<p class="section-note">Optional. A free Google Gemini key lets the app pick words that match your goals and answers, with past, present and future examples.
      Without it, the app uses its own word list and free dictionaries.
      <a class="ext-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free key</a></p>`;
  }

  function draw() {
    const p = store.state.profile;
    const c = store.counts();
    const ai = store.ai;
    const initial = (p.name || 'You').trim().charAt(0).toUpperCase();
    root.innerHTML = `
      <div class="me-head">
        <div class="avatar" aria-hidden="true">${esc(initial)}</div>
        <div style="min-width:0"><h1 class="me-name">${esc(p.name || 'Your profile')}</h1>
        <p class="muted small">Learning English</p></div>
      </div>

      <div class="stats stats--2">
        <div class="stat"><p class="stat-num">${store.streak()}</p><p class="stat-label">Days in a row</p></div>
        <div class="stat"><p class="stat-num">${store.bestStreak()}</p><p class="stat-label">Best run</p></div>
        <div class="stat"><p class="stat-num">${c.learning + c.mastered}</p><p class="stat-label">Words learned</p></div>
        <div class="stat"><p class="stat-num">${store.state.days.length}</p><p class="stat-label">Days practiced</p></div>
      </div>

      <section class="me-group panel">
        <h2 class="section-title">What you're learning for</h2>
        <p class="section-note">Pick all that fit. Changing this only changes which new words you get. Your learned words, revision and streak stay the same.</p>
        <div id="goal-editor"></div>
        <h3 class="section-title" style="margin-top:22px">Your level</h3>
        <div class="seg" role="radiogroup" aria-label="Your level" style="margin-top:8px">
          ${LEVELS.map((l) => `<button class="seg-opt ${pendingLevel === l.id ? 'is-on' : ''}" type="button" role="radio" aria-checked="${pendingLevel === l.id}" data-act="level" data-level="${l.id}">
            <span class="seg-radio"></span><span class="seg-text"><span class="seg-title">${l.title}</span></span></button>`).join('')}
        </div>
        <div class="row-actions"><button class="btn btn-primary btn-block" data-act="save-ctx" disabled>Save changes</button></div>
      </section>

      <section class="me-group panel">
        <h2 class="section-title">Sync across devices</h2>
        ${syncSection()}
      </section>

      ${CONFIG.PREVIEW ? `<section class="me-group panel">
        <h2 class="section-title">Smarter word picks</h2>
        <p class="section-note" style="margin:0">In this preview, Claude picks new words for your goal once the starter list runs out.</p>
      </section>` : `      <section class="me-group panel">
        <h2 class="section-title">Smarter word picks</h2>
        ${aiIntro()}
        <details class="more" ${ai.key ? 'open' : ''}>
          <summary>${syncEnabled(store) ? 'Or use a key on this phone only' : 'Add a Gemini key on this phone'}</summary>
          <label class="field" style="margin-top:12px"><span class="field-label">Gemini key</span>
            <input id="ai-key" class="input" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key" value="${esc(ai.key)}">
            <span class="field-hint">Saved on this phone only. It is never synced.</span></label>
          <label class="field"><span class="field-label">Model</span>
            <input id="ai-model" class="input" type="text" autocomplete="off" spellcheck="false" value="${esc(ai.model || CONFIG.DEFAULT_AI_MODEL)}"></label>
          <div class="row-actions">
            <button class="btn btn-primary btn-sm ${busy === 'ai' ? 'is-busy' : ''}" data-act="ai-save">Save and test</button>
            ${ai.key ? '<button class="btn btn-ghost btn-sm" data-act="ai-remove">Remove key</button>' : ''}
          </div>
        </details>
      </section>`}

      <section class="me-group panel">
        <div class="setting-row">
          <div><h2 class="section-title" style="margin:0">Learning language</h2><p class="muted small">English</p></div>
          <button class="btn btn-soft btn-sm" data-act="lang">Change</button>
        </div>
      </section>

      <section class="me-group panel">
        <h2 class="section-title">Your data</h2>
        <p class="section-note">Save a backup file, or bring one back.</p>
        <div class="row-actions">
          <button class="btn btn-soft btn-sm" data-act="export">Save backup</button>
          <button class="btn btn-soft btn-sm" data-act="import">Restore backup</button>
          <input id="import-file" type="file" accept="application/json,.json" hidden>
        </div>
        <div class="row-actions"><button class="btn btn-danger btn-block" data-act="reset">Delete all progress</button></div>
      </section>

      <p class="foot-note">WordNest ${CONFIG.VERSION}${CONFIG.PREVIEW ? ' preview' : ''}${store.storageOk ? '' : '. Saving is blocked in this browser, so progress will be lost when you close it.'}</p>`;
    bind();
  }

  function bind() {
    const save = root.querySelector('[data-act="save-ctx"]');
    const dirty = () => {
      const p = store.state.profile;
      const changed = !sameGoals(pendingGoals, p) || pendingLevel !== p.level;
      save.disabled = !changed || !goalCount(pendingGoals);
    };
    root._dirty = dirty;
    bindGoalEditor(root.querySelector('#goal-editor'), pendingGoals, dirty);

    root.querySelector('#import-file').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const ok = await confirmSheet({ title: 'Restore this backup?', text: 'Your progress on this phone will be replaced by the backup.', okLabel: 'Restore' });
        if (!ok) return;
        store.importData(data);
        toast('Backup restored');
        draw();
      } catch {
        toast("This file isn't a WordNest backup.");
      } finally {
        e.target.value = '';
      }
    });
  }

  let pendingLevel = store.state.profile.level;
  const freshGoals = () => ({ goals: [...store.state.profile.goals], custom: [...store.state.profile.custom] });
  let pendingGoals = freshGoals();

  root.onclick = async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;

    if (act === 'level') {
      haptic();
      pendingLevel = el.dataset.level;
      root.querySelectorAll('[data-act="level"]').forEach((b) => {
        const on = b.dataset.level === pendingLevel;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      });
      root._dirty?.();
    }

    if (act === 'save-ctx') {
      const prev = store.state.profile;
      const goalsChanged = !sameGoals(pendingGoals, prev);
      const prevLevel = prev.level;
      const levelChanged = pendingLevel !== prevLevel;
      store.update((s) => {
        s.profile.goals = [...pendingGoals.goals];
        s.profile.custom = [...pendingGoals.custom];
        s.profile.level = pendingLevel;
        s.profile.u = Date.now();
      });
      if (levelChanged) engine.applyLevelChange(prevLevel, pendingLevel);
      if (goalsChanged) engine.applyGoalChange();
      pendingGoals = freshGoals();
      toast(goalsChanged ? 'Saved. New words will follow your goals.' : 'Saved. New words will match your level.');
      draw();
    }

    if (act === 'sign-in') {
      const name = root.querySelector('#sync-name').value;
      const pin = root.querySelector('#sync-pin').value.trim();
      formError = '';
      if (!validName(name)) formError = 'Use 2 to 40 letters or numbers for your name, with no spaces.';
      else if (!/^\d{4,8}$/.test(pin)) formError = 'Your PIN needs 4 to 8 numbers.';
      if (formError) return draw();
      busy = 'signin';
      draw();
      try {
        const { created } = await signIn(store, name, pin);
        toast(created ? 'Account created. Sync is on.' : 'Signed in. Your words are synced.');
      } catch (err) {
        formError = err.code === 'wrong_pin' ? 'That PIN is wrong for this name.' : err.message;
        if (err.code !== 'network' && err.code !== 'wrong_pin') signOut(store);
      }
      busy = '';
      draw();
    }

    if (act === 'sync-now') {
      busy = 'sync';
      draw();
      try {
        await syncNow(store);
        toast('Synced');
      } catch (err) {
        toast(err.message);
      }
      busy = '';
      draw();
    }

    if (act === 'sign-out') {
      const ok = await confirmSheet({ title: 'Sign out?', text: 'Your words stay on this phone. Sync stops until you sign in again.', okLabel: 'Sign out' });
      if (ok) { signOut(store); draw(); }
    }

    if (act === 'ai-save') {
      const key = root.querySelector('#ai-key').value.trim();
      const model = root.querySelector('#ai-model').value.trim() || CONFIG.DEFAULT_AI_MODEL;
      if (!key) return toast('Paste your Gemini key first.');
      busy = 'ai';
      draw();
      try {
        await testGemini({ key, model });
        store.setAi({ key, model });
        toast('Key works. Smarter word picks are on.');
      } catch (err) {
        const s = err.status;
        toast(s === 400 || s === 401 || s === 403 ? "That key didn't work. Check it and try again."
          : s === 404 ? "That model name wasn't found. Try gemini-2.5-flash."
          : s === 429 ? 'The free limit is used up for now. Try again later.'
          : "Couldn't check the key. Check your internet.");
      }
      busy = '';
      draw();
    }

    if (act === 'ai-remove') {
      store.setAi({ key: '' });
      toast('Key removed');
      draw();
    }

    if (act === 'lang') go('welcome?edit=lang');

    if (act === 'export') {
      const filename = `wordnest-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const json = JSON.stringify(store.exportData(), null, 1);
      if (CONFIG.PREVIEW) {
        // Plain download links don't work inside Claude; use the downloads capability.
        const downloads = await runtime('downloads');
        if (!downloads) return toast("Saving files isn't available in this view.");
        try { await downloads.save({ filename, data: json }); toast('Backup saved'); } catch { /* declined */ }
        return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('Backup saved to your downloads');
    }

    if (act === 'import') root.querySelector('#import-file').click();

    if (act === 'reset') {
      const ok = await confirmSheet({
        title: 'Delete all progress?',
        text: `This removes ${plural(Object.keys(store.state.words).length, 'word', 'words')}, your streak and settings from this phone. Synced data in your sheet is not deleted.`,
        okLabel: 'Delete everything',
        danger: true,
      });
      if (ok) {
        store.reset();
        toast('All progress deleted');
        go('welcome', { replace: true });
      }
    }
  };

  draw();
}
