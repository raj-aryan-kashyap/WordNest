/**
 * My words: Learning / Mastered / Known lists with search.
 * Tap a word to see the full card and move it between lists.
 */
import { esc, diffDays, dayKey, addDays } from '../utils.js';
import { icon, sheet, speak, openSearch, toast } from '../ui.js';
import { renderEntry, stateBlock } from '../components.js';

let tab = 'learning';   // remembered while the app is open
let query = '';

function dueText(rec, today) {
  if (rec.s === 'known' || !rec.due) return { text: '', due: false };
  const d = diffDays(today, rec.due);
  if (rec.add >= today) return { text: 'From tomorrow', due: false };
  if (d <= 0) return { text: 'Due today', due: true };
  if (d === 1) return { text: 'Tomorrow', due: false };
  return { text: `In ${d} days`, due: false };
}

export function mount(root, ctx) {
  const { store, engine, go } = ctx;

  function lists() {
    const all = Object.values(store.state.words);
    const out = { learning: [], mastered: [], known: [] };
    for (const r of all) (out[r.s] || out.learning).push(r);
    const today = dayKey();
    out.learning.sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.w.localeCompare(b.w));
    out.mastered.sort((a, b) => a.w.localeCompare(b.w));
    out.known.sort((a, b) => (b.u || 0) - (a.u || 0));
    return { out, today };
  }

  function rowsHtml() {
    const { out, today } = lists();
    const q = query.trim().toLowerCase();
    const list = out[tab].filter((r) => !q || r.w.toLowerCase().includes(q) || (engine.card(r.id)?.m || '').toLowerCase().includes(q));
    if (!out[tab].length) {
      const empty = {
        learning: ['No words to learn yet', 'Words you mark "New to me" show up here.', '<button class="btn btn-primary" data-act="learn">Learn new words</button>'],
        mastered: ['No mastered words yet', 'Keep revising. Words you remember for a month move here.', ''],
        known: ['No known words yet', 'Words you mark "I know this" show up here.', ''],
      }[tab];
      return stateBlock({ iconName: tab === 'known' ? 'check' : 'book', title: empty[0], text: empty[1], actions: empty[2] });
    }
    if (!list.length) return stateBlock({ iconName: 'search', title: 'No matches', text: `Nothing in this list matches "${query.trim()}".` });
    return `<ul class="wlist">${list.map((r) => {
      const c = engine.card(r.id);
      const due = dueText(r, today);
      return `<li><button class="wrow" data-act="open" data-id="${esc(r.id)}">
        <div class="wrow-main"><p class="wrow-word">${esc(r.w)}</p>${c?.m ? `<p class="wrow-mean">${esc(c.m)}</p>` : ''}</div>
        ${due.text ? `<span class="wrow-side ${due.due ? 'is-due' : ''}">${due.text}</span>` : ''}
        <span class="muted">${icon('chevron', 18)}</span>
      </button></li>`;
    }).join('')}</ul>`;
  }

  function tabsHtml() {
    const { out } = lists();
    const t = (id, label) => `<button class="tabs-btn ${tab === id ? 'is-on' : ''}" role="tab" aria-selected="${tab === id}" data-act="tab" data-tab="${id}">${label}<span class="tabs-count">${out[id].length}</span></button>`;
    return `<div class="tabs" role="tablist">${t('learning', 'Learning')}${t('mastered', 'Mastered')}${t('known', 'Known')}</div>`;
  }

  function draw() {
    const total = Object.keys(store.state.words).length;
    root.innerHTML = `
      <header class="topbar"><div class="topbar-text"><h1 class="screen-title">My words</h1>
        <p class="screen-sub">${total ? `${total} words so far` : 'Your words will collect here'}</p></div></header>
      <div id="tabs">${tabsHtml()}</div>
      ${total ? `<label class="search"><span class="visually-hidden">Search your words</span>${icon('search', 18)}
        <input id="q" class="input" type="search" placeholder="Search your words" value="${esc(query)}" autocomplete="off" enterkeyhint="search"></label>` : '<div style="height:14px"></div>'}
      <div id="list">${rowsHtml()}</div>`;
    const input = root.querySelector('#q');
    input?.addEventListener('input', () => {
      query = input.value;
      root.querySelector('#list').innerHTML = rowsHtml(); // keep focus in the search box
    });
  }

  function openWord(id) {
    const rec = store.state.words[id];
    if (!rec) return;
    const c = engine.card(id);
    const actions = rec.s === 'known'
      ? '<button class="btn btn-primary btn-block" data-move="learning">Add to my learning words</button>'
      : `<button class="btn btn-soft btn-block" data-move="known">I know this now</button>
         ${rec.s === 'mastered' ? '<button class="btn btn-soft btn-block" data-move="again">Practice it again</button>' : ''}`;
    sheet({
      label: rec.w,
      html: `${c ? renderEntry(c, { tools: false }) : `<h2 class="sheet-title">${esc(rec.w)}</h2><p class="sheet-text">The details for this word aren't saved on this phone. Tap Search on Google to look it up.</p>`}
        <div class="sheet-actions">
          ${actions}
          <button class="btn btn-ghost btn-block" data-search>${icon('search', 18)} Search on Google</button>
        </div>`,
      onMount(el, close) {
        el.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.act === 'hear') return speak(rec.w, c?.audio, b);
          if (b.hasAttribute('data-search')) return openSearch(rec.w);
          const move = b.dataset.move;
          if (!move) return;
          const today = dayKey();
          store.update((s) => {
            const r = s.words[id];
            if (move === 'known') { r.s = 'known'; r.due = null; }
            else { r.s = 'learning'; r.box = 0; r.due = addDays(today, 1); r.lw = false; }
            r.u = Date.now();
          });
          close();
          toast(move === 'known' ? 'Moved to Known' : 'Added to your learning words');
          draw();
        });
      },
    });
  }

  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'tab') {
      tab = el.dataset.tab;
      draw();
    } else if (el.dataset.act === 'open') openWord(el.dataset.id);
    else if (el.dataset.act === 'learn') go('learn');
  };

  draw();
}
