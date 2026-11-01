function registerShortcutSet(globalShortcut, entries) {
  globalShortcut.unregisterAll();

  const accelerators = entries.map(([, accelerator]) => accelerator);

  if (accelerators.some((accelerator) => !accelerator)) {
    return { ok: false, error: "All five global shortcuts are required." };
  }

  if (new Set(accelerators).size !== accelerators.length) {
    return {
      ok: false,
      error: "Global shortcuts must use different key combinations.",
    };
  }

  for (const [label, accelerator, callback] of entries) {
    let registered = false;

    try {
      registered = globalShortcut.register(accelerator, callback);
    } catch {
      registered = false;
    }

    if (!registered) {
      globalShortcut.unregisterAll();
      return {
        ok: false,
        error: `Could not register ${label}: ${accelerator}. Another application may already be using it.`,
      };
    }
  }

  return { ok: true };
}

module.exports = { registerShortcutSet };
