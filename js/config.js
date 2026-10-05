/**
 * App settings you may want to change.
 *
 * SYNC_URL: paste your Google Apps Script web app link here to turn on
 * cross-device sync (see README, "Turn on sync"). Leave empty to keep
 * everything on this phone only.
 */
export const CONFIG = {
  APP_NAME: 'WordNest',
  VERSION: '1.4.0',

  SYNC_URL: 'https://script.google.com/macros/s/AKfycbzc890rFv74CY0Ea6oEsqtkTEYIreW3cHRVlwVosweTF5EDM24Ec6tYzSyeNOTAIEEeTA/exec',

  // Set to true only by tools/build-preview.mjs for the in-Claude preview.
  // Preview: no outside network, new words come from Claude, sync is off.
  PREVIEW: false,

  DAILY_REVIEW_SIZE: 5,   // words in the daily revision
  CHECK_EVERY: 4,         // in Learn, show a quick check after this many cards (if a missed word is waiting)
  DEFAULT_AI_MODEL: 'gemini-flash-latest', // optional, only used if the user adds a free Gemini key
};
