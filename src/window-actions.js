"use strict";
async function pasteAndResume(value, { replace, getWindow, getGeneration, wait }) {
  const window = getWindow(), generation = getGeneration();
  let result;
  try { result = await replace(value); }
  catch { result = { ok: false, error: "Could not return the text to the source app. Your draft is preserved; use Copy instead." }; }
  // The destination may consume the clipboard asynchronously.
  if (result.ok) await wait(750);
  if (getWindow() === window && window && !window.isDestroyed() && generation === getGeneration()) {
    window.setOpacity(1);
    window.showInactive();
  }
  return result;
}
module.exports = { pasteAndResume };
