# WordNest

A mobile-first vocabulary app (PWA) for learning useful English words for your goal.
Plain HTML, CSS and JavaScript. No build step. Free to host on GitHub Pages.

## What it does

- Pick a language (English now, Portuguese marked "coming soon").
- Pick one or more learning goals (Customer care, AI products, Job interviews...)
  and add up to 5 of your own in your own words. Edit them any time in Me.
- Learn one word at a time: word, pronunciation (tap to hear), simple meaning,
  past / present / future examples, then the Hindi meaning.
- **New to me** adds the word to revision. **I know this** skips it and makes
  later words a bit harder. Undo is always there for a few seconds.
- **Search on Google** opens Google for the word's meaning in English and Hindi.
- From day 2, a 5-word daily revision quiz. Right answers space a word out,
  wrong answers bring it back sooner (also as quick checks while learning).
- **Add your own word** (My words > Add a word): type it, and the meaning, pronunciation,
  examples and Hindi are filled in for free. It shows "Added by you" in the app and
  "Added by user" in the sheet.
- Streak with a 7-day strip. No daily limit on learning.
- Works offline after the first visit. Optional free cloud sync.

## What's in this folder

This whole folder is the GitHub repository. Upload everything in it as it is.

```
Vocabulary_App/
│
├── README.md                  You are here. What everything is and how to use it.
│
├── index.html                 ┐
├── manifest.webmanifest       │  The app itself. These must stay at the top level
├── sw.js                      │  so GitHub Pages can serve the app.
├── css/styles.css             │
├── icons/                     │  App icons (home screen, browser tab)
├── js/                        ┘  All app code (see below)
│
├── google-sheet/              Everything for cloud sync and the word Library
│   ├── 1_SETUP_STEPS.txt         Step-by-step setup and updates (no code inside)
│   ├── 2_APPS_SCRIPT_CODE.txt    Only the Apps Script: open, Ctrl+A, Ctrl+C, paste
│   └── 3_SPARE_SHEET_WordNest_Sync.xlsx  Formatted sheet, Library pre-filled
│
├── preview/
│   └── wordnest-preview.html  One-file copy of the app for previewing inside Claude
│
├── tools/                     Optional helpers (need Node.js)
│   ├── build-preview.mjs         Rebuilds preview/wordnest-preview.html
│   └── build-gs-starter.mjs      Copies the starter words into google-sheet/2_APPS_SCRIPT_CODE.txt
│
├── .gitignore                 Files Git should skip
└── .nojekyll                  Tells GitHub Pages to serve files as they are
```

### Inside js/

| File | What it does |
|---|---|
| `config.js` | **Settings you edit:** sync URL, app version, revision size |
| `app.js` | Starts the app, moves between screens, background sync |
| `store.js` | Saves your progress on the phone |
| `engine.js` | Chooses the next word and learns from your answers |
| `srs.js` | Spaced revision rules (when a word comes back) |
| `goals.js` | Learning goals and the goal editor |
| `quiz.js` | Builds the revision questions |
| `sync.js` | Sign in and sync with the Google Sheet |
| `library.js` | Sends words to the sheet's Library and takes new ones back |
| `sources.js` | Free online word sources and the optional Gemini key |
| `status.js`, `statusview.js` | The status icon and its details sheet |
| `addword.js` | "Add your own word": look up, fill in details, save |
| `ui.js`, `components.js` | Buttons, cards, toasts, sheets, icons |
| `data/seed.js` | The 161 built-in starter words |
| `screens/*.js` | One file per screen: onboarding, home, learn, review, words, me |

## Upload to GitHub (fastest ways)

**Option A, in the browser (no install):**
1. On github.com, create a new repository (for example `vocabulary-app`). Leave it empty.
2. On the empty repo page, click "uploading an existing file".
3. Open your `Vocabulary_App` folder, select **everything inside it** (Ctrl + A), and drag it onto the page.
   Folders upload too. Note: Windows hides `.gitignore` and `.nojekyll`; they're optional.
4. Click "Commit changes".
5. Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/ (root)`, Save.
   After a minute the app is at `https://<your-username>.github.io/vocabulary-app/`.

**Option B, GitHub Desktop (best for repeated updates):**
1. Install GitHub Desktop and sign in.
2. File > Add local repository > choose `Vocabulary_App` > "create a repository" if asked.
3. Click "Publish repository". Later changes: edit files, then Commit and Push.

**Every time you change the app:** change `VERSION` in both `sw.js` and `js/config.js`,
so phones load the new version.

## Try it on your computer

```
cd Desktop\Vocabulary_App
python -m http.server 8000
```
Open http://localhost:8000. (Opening index.html directly will not work, because
the app uses JavaScript modules.)

## Install on your phone

Open the GitHub Pages link in Chrome and tap "Add to Home screen"
(iPhone Safari: Share > Add to Home Screen).

## Turn on sync (free, about 5 minutes)

Full step-by-step guide: `google-sheet/1_SETUP_STEPS.txt`. The script to paste: `google-sheet/2_APPS_SCRIPT_CODE.txt`.

1. Open the WordNest Sync Google Sheet (or any new Google Sheet).
2. Extensions > Apps Script. Paste all of `google-sheet/2_APPS_SCRIPT_CODE.txt`. Save.
3. Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone**.
4. Copy the web app URL (ends in `/exec`) into `js/config.js` as `SYNC_URL`,
   bump `VERSION` in `sw.js`, push to GitHub.
5. In the app: Me > Sync across devices. Pick a name and a 4 to 8 number PIN.
   On another phone, tap "I already use WordNest" and use the same name and PIN.

The sheet has four tabs: **Library** (the master word list, see below), **Start here** (guide and live totals), **Users**
(one row per person: readable totals, then the app's raw data from column K)
and **Words** (one readable row per word, rebuilt on every sync). The script
also adds a **WordNest** menu to the sheet with "Check setup" and "Format tabs again".

### Master Library

The Library starts with all 161 starter words (WordNest menu > Add starter words to Library;
it also runs by itself when the tab is first created). After that, every word anyone's app shows goes to the **Library** tab once: context, word,
level, meaning, how to say it, past / present / future examples, Hindi, source,
first added date, weekday, who added it and who else uses it. It is sorted by
context, newest first. On each sync the sheet sends back up to 40 Library words
the person hasn't seen, matching their goals first, so words picked by AI on one
phone are reused everywhere. Edit a meaning in the sheet and the fix reaches
anyone who gets that word next.

How it works: the PIN is hashed on the phone. Each sync sends your data, the
script merges it with the copy in the sheet (word by word, newest change wins,
streak days are combined), saves it, and sends the merged copy back. So using
two phones never loses words. Fine for a personal project, not bank-level
security: don't reuse an important PIN.

## Smarter word picks (optional)

Put a free Gemini key in your Google Sheet (WordNest menu > Set Gemini key).
The script calls Gemini for every phone, adds the words to the Library, and keeps
usage under a daily cap. Full steps: `google-sheet/1_SETUP_STEPS.txt`, section C.
The small round icon next to the streak shows sync and word-finding status; tap it for details.

### Key on the phone (legacy)

No longer shown in the app. Anyone who saved a phone key before 1.5.0 keeps using it silently.
The text below is kept for reference.

Without any key, words come from the starter pack, then from free sources:
Datamuse (related words and how common they are), Free Dictionary
(pronunciation, meaning, examples) and MyMemory (Hindi).

For better cards, add a free Google Gemini key in Me > Smarter word picks
(get one at https://aistudio.google.com/apikey). Gemini then suggests words for
your exact goal and level, with past/present/future examples and Hindi. The key
stays on that phone and is never synced. If the default model name stops
working, try another one from Google AI Studio (for example `gemini-2.5-flash`).

## How the app chooses words

- Every word has a difficulty from 1 (easy) to 5 (hard) and topic tags.
- The app keeps one "skill" number for you. Each answer moves it like a simple
  Elo rating: saying you know a hard word moves it up a lot, saying a word is new
  moves it down. It moves faster in your first 20 words.
- It aims a little above your skill so most words are new but reachable, and
  aims lower if your recent quiz answers are often wrong.
- Topics you keep knowing get less weight; topics full of new words get more.
  Words that match one of your goals get a boost; words outside all goals get a penalty.
- With several goals, the goal that got the fewest of your last 40 new words gets
  an extra boost, so the mix stays balanced. Online searches also start with that goal.
- Every word you've seen is stored, so nothing repeats.

### What happens when you edit goals

| Change | Effect |
|---|---|
| Add a goal | It has 0 recent words, so it gets the biggest boost. Its words appear within a few cards. |
| Remove a goal | Upcoming online words that only fit that goal are dropped. Words you already learned stay, with their revision. |
| Learned words, revision, streak | Never change. |
| Your skill estimate | Stays. Goals change topics, not how good your English is. |
| Topic weights | Stay. Knowing that you find customer care words easy is still true. |
| Level setting | Under 20 answers: restart from the new level. After that: move halfway, because your answers are better evidence. |

Older saves with one goal text are moved into "your own goals" automatically.

## Revision rules

Boxes 0 to 7 with gaps of 0, 1, 2, 4, 7, 14, 30, 60 days. Right = up one box.
Wrong = down two boxes and due today. Box 6 or higher = Mastered (still revised
rarely). Extra practice never pushes a word up early. A wrong answer in a round
is asked once more at the end.

## Data saved per user

Profile (name, goal, level), learner model, every word seen with its status,
box, due date, right/wrong counts, an activity history (last 1,500), active days
for the streak, and daily revision results. Content of online words you are
learning is saved too, so another phone can show them.

## Known limits

- The free Hindi translation service has a daily limit. When it runs out, cards
  show "The Hindi meaning isn't available" with a Search on Google link. Gemini avoids this.
- Free Dictionary examples are not split by tense; those cards show "Example".
  The starter pack and Gemini cards always use past / present / future.
- Pronunciation uses the phone's built-in voice, so it can sound slightly different
  on each phone.
