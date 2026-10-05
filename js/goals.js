/**
 * Learning goals: several ready-made goals plus up to 5 the user writes.
 *
 * profile.goals  = ['cs', 'ai']                 ready-made goal ids
 * profile.custom = ['My job at TP Portugal ...'] user-written goals
 *
 * Each goal turns into topic tags (used to rank words) and search
 * keywords (used to find new online words). A user-written goal gets its
 * own tag "c:<slug>", plus any topic tags its words match.
 */
import { esc, slug } from './utils.js';
import { icon } from './ui.js';

export const PRESETS = [
  { id: 'cs', label: 'Customer care', tags: ['cs'], kw: ['customer service', 'complaint', 'assistance', 'apology'], about: 'customer care and support calls' },
  { id: 'hr', label: 'Workplace and HR', tags: ['hr'], kw: ['employment', 'salary', 'contract', 'leave'], about: 'working at a company: meetings, contracts, pay, leave, shifts and HR' },
  { id: 'chatgpt', label: 'ChatGPT support', tags: ['chatgpt'], kw: ['chatbot', 'subscription', 'account', 'software'], about: 'supporting ChatGPT users: accounts, sign-in, plans, billing, models and features' },
  { id: 'email', label: 'Email', tags: ['email'], kw: ['email', 'correspondence', 'mailbox'], about: 'reading, writing and fixing email: replies, attachments, spam and safety' },
  { id: 'mobile', label: 'Phone support', tags: ['mobile'], kw: ['smartphone', 'battery', 'wireless'], about: 'helping people with smartphones: settings, battery, updates, apps and resets' },
  { id: 'corp', label: 'Office and meetings', tags: ['corp'], kw: ['business', 'workplace', 'management', 'meeting'], about: 'office work, meetings and teams' },
  { id: 'tech', label: 'Tech support', tags: ['tech'], kw: ['software', 'technology', 'data', 'internet'], about: 'helping people with apps, accounts and software' },
  { id: 'ai', label: 'AI products', tags: ['ai'], kw: ['artificial intelligence', 'algorithm', 'automation'], about: 'AI tools like chat assistants' },
  { id: 'comm', label: 'Emails and writing', tags: ['comm'], kw: ['communication', 'writing', 'correspondence'], about: 'clear, polite emails and chat messages' },
  { id: 'career', label: 'Job interviews', tags: ['career'], kw: ['interview', 'career', 'skills', 'achievement'], about: 'job interviews and talking about my experience' },
  { id: 'exam', label: 'Exams like IELTS', tags: ['exam'], kw: ['academic', 'essay', 'argument', 'research'], about: 'English exams like IELTS' },
  { id: 'general', label: 'Daily life', tags: ['general'], kw: ['everyday', 'travel', 'shopping', 'conversation'], about: 'everyday life, shopping and travel' },
];

export const MAX_CUSTOM = 5;
export const MAX_CUSTOM_LEN = 120;

/** Words in user-written goals that point to a ready-made topic. */
const GROUPS = [
  { re: /\b(customer|customers|care|support|service|helpdesk|call|calls|client|clients|agent)\b/i, tag: 'cs' },
  { re: /\b(corporate|office|business|company|manager|meeting|meetings|team)\b/i, tag: 'corp' },
  { re: /\b(tech|technology|software|app|apps|product|digital)\b/i, tag: 'tech' },
  { re: /\b(ai|openai|chatgpt|gpt|model|machine)\b/i, tag: 'ai' },
  { re: /\b(email|emails|writing|write|chat|communication|speaking|presentation)\b/i, tag: 'comm' },
  { re: /\b(interview|interviews|career|cv|resume|job hunt)\b/i, tag: 'career' },
  { re: /\b(chatgpt|openai|gpt)\b/i, tag: 'chatgpt' },
  { re: /\b(email|emails|inbox|gmail|outlook|mail)\b/i, tag: 'email' },
  { re: /\b(phone|phones|smartphone|samsung|galaxy|android|iphone|mobile)\b/i, tag: 'mobile' },
  { re: /\b(hr|salary|contract|leave|shift|shifts|payslip|probation|overtime|corporate)\b/i, tag: 'hr' },
  { re: /\b(ielts|toefl|exam|exams|test|university|academic)\b/i, tag: 'exam' },
];

const STOP = new Set('about after again also and are because been being but can could each from have having here into just like more most much need only other our over role some such than that the their them then there these they this those through very want what when where which while will with work working would your using english supporting helping learning improve better people things speaking based something everyday daily'.split(' '));

export function customId(text) {
  return 'c:' + slug(text).replace(/[^a-z0-9-]/g, '').slice(0, 40);
}

/** All active goals with their tags and search keywords. */
export function activeGoals(profile) {
  const out = [];
  for (const id of profile.goals || []) {
    const p = PRESETS.find((x) => x.id === id);
    if (p) out.push({ id, label: p.label, about: p.about, tags: p.tags, keywords: p.kw.map((kw) => ({ kw, tag: p.tags[0] })) });
  }
  for (const text of profile.custom || []) {
    const id = customId(text);
    const groupTags = GROUPS.filter((g) => g.re.test(text)).map((g) => g.tag);
    // Lowercase words only, so names like "Portugal" or "OpenAI" are skipped.
    const own = [...new Set((text.match(/\b[a-z]{5,}\b/g) || []).filter((w) => !STOP.has(w)))].slice(0, 4);
    const borrowed = groupTags.flatMap((t) => PRESETS.find((p) => p.tags[0] === t)?.kw.slice(0, 2) || []);
    out.push({
      id, label: text, about: text, custom: true,
      tags: [id, ...new Set(groupTags)],
      keywords: [...own, ...borrowed].map((kw) => ({ kw, tag: id })),
    });
  }
  return out;
}

/** Every tag across active goals. */
export function goalTags(profile) {
  return new Set(activeGoals(profile).flatMap((g) => g.tags));
}

/** Short text for the UI, e.g. "Customer care, AI products and 1 more". */
export function goalSummary(profile, max = 2) {
  const labels = activeGoals(profile).map((g) => g.label);
  if (!labels.length) return '';
  const shown = labels.slice(0, max).map((l) => (l.length > 40 ? l.slice(0, 37).replace(/\s+\S*$/, '') + '...' : l));
  const rest = labels.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ` and ${rest} more` : '');
}

export const goalCount = (sel) => (sel.goals || []).length + (sel.custom || []).length;

export function sameGoals(a, b) {
  const key = (x) => JSON.stringify([[...(x.goals || [])].sort(), [...(x.custom || [])].map((t) => t.toLowerCase()).sort()]);
  return key(a) === key(b);
}

/* ---------- Goal editor (used in onboarding and in Me) ---------- */

export function goalEditorHtml(sel) {
  const n = goalCount(sel);
  const full = (sel.custom || []).length >= MAX_CUSTOM;
  return `
    <div class="goal-grid" role="group" aria-label="Ready-made goals">
      ${PRESETS.map((p) => {
        const on = sel.goals.includes(p.id);
        return `<button class="chip chip--goal ${on ? 'is-on' : ''}" type="button" role="checkbox" aria-checked="${on}" data-goal="${p.id}">
          <span class="chip-check">${icon('check', 14)}</span>${esc(p.label)}</button>`;
      }).join('')}
    </div>

    <label class="field" style="margin-top:20px">
      <span class="field-label">Add your own</span>
      <span class="add-row">
        <input class="input" data-goal-input type="text" maxlength="${MAX_CUSTOM_LEN}" enterkeyhint="done"
          placeholder="${full ? `You can add up to ${MAX_CUSTOM}` : 'For example: my job supporting an AI app'}" ${full ? 'disabled' : ''}>
        <button class="btn btn-soft" type="button" data-goal-add disabled>Add</button>
      </span>
      <span class="field-hint">Add one at a time. Be specific, like the kind of job or exam.</span>
    </label>

    ${(sel.custom || []).length ? `<div class="chips" aria-label="Your own goals">
      ${sel.custom.map((t, i) => `<span class="chip chip--own"><span class="chip-text">${esc(t)}</span>
        <button class="chip-x" type="button" data-goal-remove="${i}" aria-label="Remove ${esc(t)}">${icon('x', 16)}</button></span>`).join('')}
    </div>` : ''}

    <p class="goal-count ${n ? '' : 'is-empty'}" aria-live="polite">${n ? `${n} ${n === 1 ? 'goal' : 'goals'} picked` : 'Pick at least one goal'}</p>`;
}

/**
 * Wire up the editor inside `container`. `sel` is mutated in place;
 * `onChange()` runs after every change.
 */
export function bindGoalEditor(container, sel, onChange) {
  const draw = (focusInput = false) => {
    container.innerHTML = goalEditorHtml(sel);
    wire();
    if (focusInput) container.querySelector('[data-goal-input]')?.focus();
    onChange?.();
  };

  const wire = () => {
    const input = container.querySelector('[data-goal-input]');
    const addBtn = container.querySelector('[data-goal-add]');
    const canAdd = () => {
      const t = input.value.trim().replace(/\s+/g, ' ');
      return t.length >= 3 && (sel.custom || []).length < MAX_CUSTOM
        && !sel.custom.some((c) => c.toLowerCase() === t.toLowerCase());
    };
    const add = () => {
      if (!canAdd()) return;
      sel.custom.push(input.value.trim().replace(/\s+/g, ' ').slice(0, MAX_CUSTOM_LEN));
      draw(true);
    };
    input.addEventListener('input', () => { addBtn.disabled = !canAdd(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    addBtn.addEventListener('click', add);

    container.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.goal;
      sel.goals = sel.goals.includes(id) ? sel.goals.filter((g) => g !== id) : [...sel.goals, id];
      draw();
    }));
    container.querySelectorAll('[data-goal-remove]').forEach((b) => b.addEventListener('click', () => {
      sel.custom.splice(Number(b.dataset.goalRemove), 1);
      draw();
    }));
  };

  draw();
}
