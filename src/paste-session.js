// Temporarily yield focus for Windows paste, then keep the current result visible.
function createPasteSession({ getWindow, getOpenRequestId, paste, delay }) {
  let busy = false;

  return async (text) => {
    if (busy) {
      return { ok: false, error: "A replacement is already in progress." };
    }

    busy = true;
    const windowRef = getWindow();
    const requestId = getOpenRequestId();

    try {
      const result = await paste(text);
      if (result?.ok) {
        // Let the source consume Ctrl+V before putting Clarity above it again.
        await delay(800);
      }
      return result;
    } catch {
      return { ok: false, error: "Could not replace the selected text. Use Copy instead." };
    } finally {
      busy = false;
      // A newer shortcut or explicit Close takes precedence over this paste.
      if (
        windowRef && !windowRef.isDestroyed() &&
        getWindow() === windowRef && getOpenRequestId() === requestId
      ) {
        windowRef.setOpacity(1);
        windowRef.showInactive();
      }
    }
  };
}

module.exports = { createPasteSession };
