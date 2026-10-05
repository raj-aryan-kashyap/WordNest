/**
 * Onboarding: language -> learning goal + level -> name.
 * Each step has its own URL (#/welcome?step=...) so the phone back button works.
 * The draft lives in this module until the user finishes.
 */
import { esc, haptic } from '../utils.js';
import { icon, flag, toast, BRAND_ICON } from '../ui.js';
import { syncConfigured, signIn, validName } from '../sync.js';
import { bindGoalEditor, goalCount } from '../goals.js';

const LEVELS = [
  { id: 'beginner', title: 'Just starting', sub: 'Simple, common words first' },
  { id: 'middle', title: 'I know the basics', sub: 'Useful work words' },
  { id: 'advanced', title: "I'm quite good", sub: 'Harder, more precise words' },
];

let draft = null;

function brandMark() {
  return `<img class="brand-mark" src="${BRAND_ICON}" alt="" width="32" height="32">`;
}

function steps(n) {
  return `<div class="ob-steps" aria-label="Step ${n} of 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'is-on' : ''}"></i>`).join('')}</div>`;
}

export function mount(root, ctx, params) {
  const { store, engine, go } = ctx;
  const p = store.state.profile;
  const editLang = params.get('edit') === 'lang';
  if (!draft) draft = { lang: p.lang, goals: p.goals.length || p.custom.length ? [...p.goals] : ['hr'], custom: [...p.custom], level: p.level || 'middle', name: p.name };
  let step = params.get('step') || 'lang';
  if (step !== 'lang' && step !== 'signin' && !draft.lang) step = 'lang'; // never skip the first step

  function viewLang() {
    return `<div class="ob">
      <div class="ob-top"><span class="brand">${brandMark()}WordNest</span>${editLang ? '' : steps(1)}</div>
      <h1 class="ob-title">Which language do you want to learn?</h1>
      <p class="ob-sub">${editLang ? 'Pick the language for your lessons.' : 'You can change this later.'}</p>
      <div class="ob-body">
        <div class="lang-grid" role="radiogroup" aria-label="Language">
          ${langBtn('en', 'English', 'Ready to learn')}
          ${langBtn('pt', 'Portuguese', 'Coming soon')}
        </div>
      </div>
      <div class="ob-foot">
        <button class="btn btn-primary btn-block" data-act="lang-next" ${draft.lang ? '' : 'disabled'}>${editLang ? 'Save' : 'Continue'}</button>
        ${editLang ? '<button class="btn btn-ghost btn-block" data-act="cancel-edit">Cancel</button>' : ''}
        ${!editLang && syncConfigured() ? '<button class="btn btn-ghost btn-block" data-act="have-account">I already use WordNest</button>' : ''}
      </div>
    </div>`;
  }

  function viewSignIn() {
    return `<div class="ob">
      <div class="ob-top"><button class="icon-btn" data-act="back" aria-label="Go back">${icon('back')}</button></div>
      <h1 class="ob-title">Welcome back</h1>
      <p class="ob-sub">Enter the name and PIN you use on your other phone.</p>
      <div class="ob-body">
        <label class="field"><span class="field-label">Name</span>
          <input id="si-name" class="input" type="text" maxlength="40" autocomplete="username" autocapitalize="none" placeholder="For example: raj"></label>
        <label class="field"><span class="field-label">PIN</span>
          <input id="si-pin" class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" placeholder="4 to 8 numbers"></label>
        <p class="field-error" id="si-error" role="alert" hidden></p>
      </div>
      <div class="ob-foot"><button class="btn btn-primary btn-block" data-act="sign-in">Sign in</button></div>
    </div>`;
  }

  async function doSignIn(btn) {
    const name = root.querySelector('#si-name').value;
    const pin = root.querySelector('#si-pin').value.trim();
    const errEl = root.querySelector('#si-error');
    const fail = (msg) => { errEl.textContent = msg; errEl.hidden = false; };
    if (!validName(name)) return fail('Use 2 to 40 letters or numbers for your name, with no spaces.');
    if (!/^\d{4,8}$/.test(pin)) return fail('Your PIN needs 4 to 8 numbers.');
    btn.classList.add('is-busy');
    try {
      const { created } = await signIn(store, name, pin);
      if (created || !store.state.profile.onboarded) {
        toast(created ? 'New account created. Let\'s set it up.' : 'Signed in. Let\'s finish setting up.');
        go('welcome', { replace: true });
      } else {
        draft = null;
        toast('Signed in. Your words are here.');
        go('home', { replace: true });
      }
    } catch (e) {
      btn.classList.remove('is-busy');
      fail(e.code === 'wrong_pin' ? 'That PIN is wrong for this name.' : e.message);
    }
  }

  function langBtn(code, name, note) {
    const selected = draft.lang === code;
    const soon = code === 'pt';
    return `<button class="lang ${selected ? 'is-selected' : ''} ${soon ? 'is-soon' : ''}" type="button"
        role="radio" aria-checked="${selected}" ${soon ? 'aria-disabled="true"' : ''} data-act="pick-lang" data-lang="${code}">
      <span class="lang-flag">${flag(code)}<span class="lang-check">${icon('check', 18)}</span></span>
      <span class="lang-name">${name}</span>
      <span class="lang-note">${note}</span>
    </button>`;
  }

  function viewContext() {
    return `<div class="ob">
      <div class="ob-top"><button class="icon-btn" data-act="back" aria-label="Go back">${icon('back')}</button>${steps(2)}</div>
      <h1 class="ob-title">What are you learning English for?</h1>
      <p class="ob-sub">Pick all that fit, and add your own. New words will be a mix of these.</p>
      <div class="ob-body">
        <div id="goal-editor"></div>

        <h2 class="section-title" style="margin-top:28px">How good is your English now?</h2>
        <p class="section-note">This is just a starting point. The app adjusts as you go.</p>
        <div class="seg" role="radiogroup" aria-label="Your level">
          ${LEVELS.map((l) => `<button class="seg-opt ${draft.level === l.id ? 'is-on' : ''}" type="button" role="radio" aria-checked="${draft.level === l.id}" data-act="level" data-level="${l.id}">
            <span class="seg-radio"></span><span class="seg-text"><span class="seg-title">${l.title}</span><span class="seg-sub">${l.sub}</span></span></button>`).join('')}
        </div>
      </div>
      <div class="ob-foot">
        <button class="btn btn-primary btn-block" data-act="ctx-next" ${goalCount(draft) ? '' : 'disabled'}>Continue</button>
      </div>
    </div>`;
  }

  function viewName() {
    return `<div class="ob">
      <div class="ob-top"><button class="icon-btn" data-act="back" aria-label="Go back">${icon('back')}</button>${steps(3)}</div>
      <h1 class="ob-title">What should we call you?</h1>
      <p class="ob-sub">Only used to say hello.</p>
      <div class="ob-body">
        <label class="field">
          <span class="field-label">Your name</span>
          <input id="name" class="input" type="text" maxlength="30" autocomplete="given-name" autocapitalize="words" placeholder="Your first name" value="${esc(draft.name)}">
        </label>
      </div>
      <div class="ob-foot">
        <button class="btn btn-primary btn-block" data-act="finish">Start learning</button>
        <button class="btn btn-ghost btn-block" data-act="skip-name">Skip for now</button>
      </div>
    </div>`;
  }

  function draw() {
    root.innerHTML = step === 'context' ? viewContext() : step === 'name' ? viewName() : step === 'signin' ? viewSignIn() : viewLang();
    bindInputs();
  }

  function bindInputs() {
    const editor = root.querySelector('#goal-editor');
    if (editor) {
      bindGoalEditor(editor, draft, () => {
        const next = root.querySelector('[data-act="ctx-next"]');
        if (next) next.disabled = !goalCount(draft);
      });
    }
    const name = root.querySelector('#name');
    if (name) {
      name.addEventListener('input', () => { draft.name = name.value; });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
    }
  }

  function finish(skipName = false) {
    const name = skipName ? '' : String(draft.name || '').trim().slice(0, 30);
    store.update((s) => {
      s.profile.lang = draft.lang;
      s.profile.goals = [...draft.goals];
      s.profile.custom = [...draft.custom];
      s.profile.level = draft.level;
      s.profile.name = name;
      s.profile.onboarded = true;
      s.profile.u = Date.now();
      s.model.skill = null; // start from the chosen level
    });
    draft = null;
    haptic(12);
    go('home', { replace: true });
  }

  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;

    if (act === 'pick-lang') {
      if (el.dataset.lang === 'pt') {
        haptic(20);
        el.classList.remove('is-shake');
        void el.offsetWidth; // restart the animation
        el.classList.add('is-shake');
        toast("Portuguese is coming soon. Let's start with English.");
        return;
      }
      haptic();
      draft.lang = 'en';
      draw();
    } else if (act === 'lang-next') {
      if (editLang) {
        store.update((s) => { s.profile.lang = draft.lang; s.profile.u = Date.now(); });
        draft = null;
        toast('Saved');
        go('me', { replace: true });
      } else go('welcome?step=context');
    } else if (act === 'cancel-edit') {
      draft = null;
      go('me', { replace: true });
    } else if (act === 'level') {
      haptic();
      draft.level = el.dataset.level;
      root.querySelectorAll('[data-act="level"]').forEach((b) => {
        const on = b.dataset.level === draft.level;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      });
    } else if (act === 'ctx-next') {
      go('welcome?step=name');
    } else if (act === 'back') {
      if (history.length > 1) history.back();
      else go(step === 'name' ? 'welcome?step=context' : 'welcome', { replace: true });
    } else if (act === 'have-account') {
      go('welcome?step=signin');
    } else if (act === 'sign-in') {
      doSignIn(el);
    } else if (act === 'finish') {
      finish();
    } else if (act === 'skip-name') {
      finish(true);
    }
  };

  draw();
}
