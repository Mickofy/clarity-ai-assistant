# Writing workspaces — review and release notes

## Implemented behavior

- Express Clearly has Message and AI Prompt purposes. Prompt rewriting preserves
  scope, constraints, and approval instructions and does not execute the embedded task.
- Natural English, Taglish/Tagalog understanding, uncertainty, and the existing
  no-fabrication rules are retained. Idea development is an explicit separate action.
- Drafts retain original notes, additional facts/corrections, clarification answers,
  the current editable result, and up to 20 undo states. Follow-up instructions
  become saved context; later user corrections take precedence.
- Client Reply stays within one workspace. A generated first reply opens directly,
  while three alternatives remain available. Users can edit, refine, copy, mark as
  sent, and add the next client message there.
- Conversations have separate names, messages, preferences, drafts, and context.
  Repeated Copy updates the same turn. Copy alone never marks a message as sent.
- Copy stays open and handles failures. Paste restores the preserved window
  without stealing destination focus, including failure paths. A newer shortcut
  or user hide prevents obsolete paste work from reopening the window.
- Cancelling aborts the desktop HTTP request and invalidates late completions.
  This does not guarantee that an upstream model request has stopped executing.
- Home, saved writing drafts, and client conversations are directly reachable.
  Normal reopening resumes the current screen; new captured text is offered as
  an import. Explicit quick shortcuts process their new input without overwriting
  the Home scratchpad.
- The window remembers its last non-maximized size between launches and clamps
  that size to the current monitor. Switching views moves keyboard focus into
  the visible workspace; Alt + 1–4 navigation does not interrupt text fields.
- IME composition keystrokes are ignored by app shortcuts. If Windows cannot
  register a global shortcut, Clarity reports the conflict in Shortcuts & Settings.
- The dark visual identity is retained with a reading font for body text, larger
  controls, native scrollbars, a resizable window, reduced-motion support, and
  keyboard focus management in Settings.

## Local storage

Drafts and conversations use the Electron renderer's local storage on this device.
They are not encrypted. No provider API key or app credential is stored there.
The Settings control clears saved work; individual drafts and conversations can
also be deleted.

Limits are 50 writing drafts, 50 conversations, and 100 turns per conversation.
Reaching a limit requests explicit cleanup rather than silently deleting older work.
Context sent to the service includes recent complete exchanges within a character
budget, the latest client message, and the user's notes/corrections. Omitted older
messages are labelled. Storage failures are shown while the current draft remains
available to copy.

## Automated checks

Run npm test to check:

- workspace persistence, conversation isolation, copy deduplication, copied/sent
  status, context budgeting, undo, corrupt-storage recovery, and request guards;
- desktop API contract, credentials, actual AbortController cancellation, timeout,
  input limits, and invalid responses;
- paste restoration and obsolete-window guards;
- Worker model/structured-output compatibility and new purpose/operation routing;
- the real HTML/CSS/renderer in an isolated Electron profile, covering rewriting,
  clarification, refinement, undo, copy failures, cancellation, stale responses,
  conversation continuation, reload/resume, importing, retries, keyboard drawer
  behavior, compact layout, clearing storage, Grammar Only, and Understand This.

The Electron harness mocks IPC. It never captures a real selection, writes the
system clipboard, pastes into a real application, or calls the live AI service.
Review screenshots are generated under ignored .artifacts/.

## Output-quality review

The following are evaluation cases for an approved live preview or deployment.
Automated contract tests cannot establish semantic quality. None of these cases
should be reported as live-model evaluations until actually run.

| Case | Input / setup | Expected behavior |
| --- | --- | --- |
| Uncertainty | “maybe cache causing it. checking pa. not confirmed” | Natural English retains uncertainty and ongoing investigation. |
| Rough thought order | “don't remove script. feature might use it. checked product page” | Logical order; no new cause, deadline, or completed fix. |
| Prompt boundaries | “inspect app, list improvements, plan first. don't edit or deploy” | A usable prompt preserving every boundary; no execution or added deliverable. |
| Short prompt | “summarize this in 3 bullets” | Short rewrite, preserving the requested three bullets. |
| Clarification | “tell them I can do that” with ambiguous “that” | Ask one important question when the action cannot be inferred safely. |
| Required client fact | Client asks availability, no user availability supplied | Ask for availability; do not invent a schedule. |
| Optional detail | User provides a project, a delay, and steps taken, but no exact dates | Generate a useful reply without demanding optional dates or metrics. |
| Continuous conversation | Prior copied draft differs from the user's later correction | Use the correction; do not treat a copied draft as a confirmed sent message. |
| Idea development | “I want client conversations to continue here” | Offer optional ideas and tradeoffs clearly separated from facts and commitments. |
| Refinement | Manually edit a draft, then request “warmer, keep the same boundary” | Use the current edit; preserve the boundary; Undo restores that manual version. |

## Release sequence

1. Review the feature branch and tests. No merge, deployment, or publication is
   part of implementation approval.
2. Approve the Worker deployment first. The request additions are optional, so
   the existing desktop remains compatible. Worker secrets and model override
   remain server-side. Production pushes to main deploy automatically.
3. Verify the quality cases above through the updated service.
4. Test native selection/paste in a disposable Notepad document, browser textarea,
   and VS Code, including two monitors, held shortcut modifiers, failure to focus,
   and clipboard restoration. Automated mocks do not establish native reliability.
5. Bump the desktop version and build a manual Electron installer after release
   approval. Verify saved drafts survive reopening and upgrading. Distribute only
   after approval; existing v1.0.7 installations do not change from a source edit.
