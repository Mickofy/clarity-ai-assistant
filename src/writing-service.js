"use strict";

function createWritingService({ url, token, getLanguage = () => "simple_english", fetchImpl = (...args) => fetch(...args), timeoutMs = 30000 }) {
  const pending = new Map();
  const keyFor = (requestId, owner) => String(owner) + ":" + requestId;
  function cancel(requestId, owner) {
    const request = pending.get(keyFor(requestId, owner));
    if (request?.owner === owner) { request.controller.abort(); return true; }
    return false;
  }
  function cancelOwner(owner) {
    for (const request of pending.values()) if (request.owner === owner) request.controller.abort();
  }
  async function run(payload, owner) {
    if (!url) return { ok: false, error: "WRITING_API_URL is not configured." };
    if (!token) return { ok: false, error: "WRITING_APP_TOKEN is not configured." };
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    const context = typeof payload?.context === "string" ? payload.context.trim() : "";
    const refinement = typeof payload?.refinement === "string" ? payload.refinement.trim() : "";
    if (!text) return { ok: false, error: "No text was provided." };
    if (text.length > 12000) return { ok: false, error: "Maximum input is 12,000 characters." };
    if (context.length > 40000) return { ok: false, error: "Conversation context is too long." };
    if (refinement.length > 2000) return { ok: false, error: "Keep your revision instruction under 2,000 characters." };
    const requestId = typeof payload.requestId === "string" ? payload.requestId.slice(0, 80) : require("node:crypto").randomUUID();
    const key = keyFor(requestId, owner);
    cancelOwner(owner);
    const controller = new AbortController();
    const request = { owner, controller };
    pending.set(key, request);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url.replace(/\/+$/, "") + "/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          text, context, refinement,
          mode: payload.mode || "express",
          purpose: payload.purpose || "message",
          operation: payload.operation || "rewrite",
          explanationLanguage: payload.explanationLanguage || getLanguage(),
        }),
        signal: controller.signal,
      });
      let data;
      try { data = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        return { ok: false, error: "The writing service returned an invalid response." };
      }
      if (controller.signal.aborted) return { ok: false, cancelled: true, error: "Request cancelled." };
      if (!response.ok) return { ok: false, error: typeof data?.error === "string" ? data.error : "The writing service is unavailable." };
      if (!data?.ok || !data.result || typeof data.result !== "object") return { ok: false, error: "The writing service returned an invalid result." };
      if ((typeof data.result.text === "string" && data.result.text.length > 12000) ||
          (Array.isArray(data.result.replies) && data.result.replies.some(reply => typeof reply === "string" && reply.length > 12000))) {
        return { ok: false, error: "The generated draft is too long. Try a shorter request; your previous draft is preserved." };
      }
      return data;
    } catch {
      if (controller.signal.aborted) return timedOut
        ? { ok: false, error: "The request took too long. Your draft is preserved. Try again." }
        : { ok: false, cancelled: true, error: "Request cancelled." };
      return { ok: false, error: "Could not connect to the writing service." };
    } finally {
      clearTimeout(timer);
      if (pending.get(key) === request) pending.delete(key);
    }
  }
  return { run, cancel, cancelOwner };
}
module.exports = { createWritingService };
