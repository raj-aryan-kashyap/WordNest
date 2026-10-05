/**
 * The status sheet: opened by tapping the small status icon.
 * Shows sync, words waiting, and smart-pick usage, with two actions.
 */
import { esc, timeAgo, plural } from './utils.js';
import { icon, sheet, toast } from './ui.js';
import { status, SOURCE_NAME } from './status.js';
import { syncEnabled, syncConfigured, syncNow } from './sync.js';
import { CONFIG } from './config.js';

function syncLine(store) {
  const s = status.get().sync;
  if (CONFIG.PREVIEW) return 'Off in this preview.';
  if (!syncConfigured()) return 'Not set up yet.';
  if (!syncEnabled(store)) return 'Off. Turn it on in Me.';
  if (s.phase === 'running') return 'Syncing now...';
  if (s.phase === 'error') return s.error || "Couldn't sync.";
  const last = s.last || store.state.sync.last;
  return last ? `Synced ${timeAgo(last)}` : 'Not synced yet.';
}

function wordsLine() {
  const w = status.get().words;
  const parts = [`${plural(w.ready, 'good word', 'good words')} ready to learn`];
  if (w.phase === 'running') parts.push('Finding more...');
  else if (w.phase === 'error') parts.push(w.error);
  else if (w.lastAt && w.lastAdded) parts.push(`Last added ${w.lastAdded} from ${SOURCE_NAME[w.lastSource] || 'online'}, ${timeAgo(w.lastAt)}`);
  return parts;
}

function picksLine(store) {
  const w = status.get().words;
  if (CONFIG.PREVIEW) return ['On. Claude picks words for your goals here.'];
  if (w.ai && w.ai.on) {
    const out = ['On. New words are picked from your goals and answers.'];
    if (w.aiPausedUntil > Date.now()) out.push('Taking a short break. Back in a few minutes.');
    else if (w.ai.used >= w.ai.limit) out.push("Today's picks are used up. Dictionary words until tomorrow.");
    else out.push(`${w.ai.used} of ${w.ai.limit} picks used today`);
    return out;
  }
  if (store.ai.key) return ['On, using the key saved on this phone.'];
  return ['Using dictionary words right now.'];
}

export function openStatusSheet(store, engine) {
  engine.maybeRefill(); // also refreshes the ready count
  const row = (ic, title, lines) => `<div class="st-row">
      <span class="st-ic">${icon(ic, 20)}</span>
      <div class="st-text"><p class="st-title">${esc(title)}</p>${lines.map((l, i) => `<p class="${i ? 'st-sub' : 'st-main'}">${esc(l)}</p>`).join('')}</div>
    </div>`;
  const body = () => `<h2 class="sheet-title">Status</h2>
    <div class="st-list" data-st-body>
      ${row('sync', 'Sync', [syncLine(store)])}
      ${row('learn', 'New words', wordsLine())}
      ${row('sparkle', 'Smart picks', picksLine(store))}
    </div>
    <div class="sheet-actions">
      ${syncEnabled(store) ? '<button class="btn btn-soft btn-block" data-st="sync">Sync now</button>' : ''}
      <button class="btn btn-primary btn-block" data-st="find">Find new words now</button>
    </div>`;

  let off = null;
  sheet({
    label: 'Status',
    html: body(),
    onMount(el) {
      off = status.on(() => {
        // Re-render the rows only, so the buttons stay put.
        const tmp = document.createElement('div');
        tmp.innerHTML = body();
        const fresh = tmp.querySelector('[data-st-body]');
        const cur = el.querySelector('[data-st-body]');
        if (fresh && cur) cur.replaceWith(fresh);
      });
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-st]');
        if (!b) return;
        b.classList.add('is-busy');
        try {
          if (b.dataset.st === 'sync') { await syncNow(store); toast('Synced'); }
          else {
            const n = await engine.refill({ force: true });
            toast(n ? `Added ${plural(n, 'new word', 'new words')}` : 'No new words right now. Try again later.');
          }
        } catch (err) {
          toast(err.message || 'Something went wrong. Try again.');
        }
        b.classList.remove('is-busy');
      });
    },
    onClose: () => off?.(),
  });
}
