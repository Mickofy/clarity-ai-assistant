const DEFAULT_WINDOW_SIZE = Object.freeze({ width: 860, height: 760 });
const MIN_WINDOW_SIZE = Object.freeze({ width: 680, height: 580 });

function normalizeWindowSize(value) {
  const width = Number(value?.width);
  const height = Number(value?.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ...DEFAULT_WINDOW_SIZE };
  }

  return {
    width: Math.max(320, Math.min(10000, Math.round(width))),
    height: Math.max(320, Math.min(10000, Math.round(height))),
  };
}

function clampWindowSize(value, workArea, margin = 20) {
  const size = normalizeWindowSize(value);
  const maxWidth = Math.max(1, Math.floor(Number(workArea?.width) - margin * 2));
  const maxHeight = Math.max(1, Math.floor(Number(workArea?.height) - margin * 2));
  const minWidth = Math.min(MIN_WINDOW_SIZE.width, maxWidth);
  const minHeight = Math.min(MIN_WINDOW_SIZE.height, maxHeight);

  return {
    width: Math.max(minWidth, Math.min(maxWidth, size.width)),
    height: Math.max(minHeight, Math.min(maxHeight, size.height)),
  };
}

function createWindowSizeStore({
  read = () => DEFAULT_WINDOW_SIZE,
  write = () => {},
  delayMs = 250,
} = {}) {
  let size = { ...DEFAULT_WINDOW_SIZE };
  let saveTimer = null;

  function get() {
    return { ...size };
  }

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    try {
      write(get());
    } catch {
      // A failed settings write must not prevent the window from closing.
    }

    return get();
  }

  function load() {
    try {
      size = normalizeWindowSize(read());
    } catch {
      size = { ...DEFAULT_WINDOW_SIZE };
    }

    return get();
  }

  function set(nextSize) {
    size = normalizeWindowSize(nextSize);

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, delayMs);
    saveTimer.unref?.();

    return get();
  }

  return { get, load, set, flush };
}

module.exports = {
  DEFAULT_WINDOW_SIZE,
  normalizeWindowSize,
  clampWindowSize,
  createWindowSizeStore,
};
