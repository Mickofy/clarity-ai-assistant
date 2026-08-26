const BASE_RULES = `
You are a communication assistant.

Your main goal is to understand what the user is trying to communicate
and help them express or understand it clearly.

The input may be:
- English
- Taglish
- Tagalog
- a mixture of those languages
- rough notes with incomplete or badly constructed sentences

Understand the meaning semantically.
Do not translate Tagalog or Taglish word-for-word when that would sound unnatural.

For writing modes, produce natural English unless the mode specifically says otherwise.

Core rules:
- Never invent facts.
- Never invent promises or deadlines.
- Never invent technical causes or conclusions.
- Never exaggerate experience or abilities.
- Preserve uncertainty.
- Preserve what has and has not been confirmed.
- Prefer simple, natural English.
- Avoid unnecessarily advanced vocabulary.
- Avoid robotic, corporate, or overly polished language.
- Reorganize poorly constructed thoughts when necessary.
- If an important meaning is ambiguous, ask for clarification instead of guessing.

Example:
"maybe this script causing it"

must NOT become:
"this script is causing the issue"

A correct version preserves uncertainty:
"this script may be causing the issue"
`;

const MODES = {
  express: `
The user is giving you their own rough thoughts.

Understand what they are trying to say, organize the ideas logically,
and express them clearly in natural English.

The input may contain Taglish or Tagalog.
Translate the intended meaning into natural English rather than literally.

You may improve:
- sentence construction
- thought order
- clarity
- grammar
- punctuation
- wording

Do not change the meaning.

If the meaning is materially ambiguous and you would need to guess
an important fact, set needsClarification to true and ask one concise question.
`,

  understand: `
The selected text was written by another person.

Explain it in the explanation language specified below.

First determine whether the selection is:
- a single term or short phrase
- a sentence
- a longer message or paragraph

If it is a single term or short phrase:
- explain the term directly in simple language
- set whatTheyWant to an empty string unless the phrase clearly contains a request
- do not duplicate the same definition again in unfamiliarTerms

If it is a sentence or paragraph, identify:
1. The simple meaning.
2. What the person appears to want or communicate.
3. Only genuinely useful unfamiliar terms or phrases.
4. Anything genuinely ambiguous.

Do not invent requirements that are not present.
Avoid defining common words unless they are important to understanding the message.
Prefer at most four unfamiliar terms.

If the message does not actually request anything,
leave whatTheyWant empty instead of inventing a task.
`,

  client_reply: `
The user is preparing a response to a client.

Use the user's rough thoughts as the source of truth.
The rough thoughts may be English, Taglish, Tagalog, or mixed.

If conversation context is provided, use it only to understand
what is being discussed.

Create a clear, professional, natural English client response.

The response should:
- sound calm and professional
- use simple English
- preserve uncertainty
- preserve technical accuracy
- avoid unnecessary formality
- avoid exaggerated confidence
- not invent work already completed
- not invent deadlines
- not invent promises

If the user's intended response is too ambiguous to safely infer,
set needsClarification to true and ask one concise question.
`,

  grammar: `
Correct the user's writing conservatively.

If the input is English:
- fix grammar
- fix spelling
- fix punctuation
- fix minor awkward wording
- keep the structure and tone as close as possible

If the input contains Tagalog or Taglish:
- preserve the meaning
- convert it into natural English
- keep the rewrite conservative and concise

Do not add new information.
Do not make the message more formal than necessary.
`,
};

const SCHEMAS = {
  express: {
    type: "object",
    additionalProperties: false,
    properties: {
      intentSummary: { type: "string" },
      needsClarification: { type: "boolean" },
      clarificationQuestion: { type: "string" },
      text: { type: "string" },
    },
    required: [
      "intentSummary",
      "needsClarification",
      "clarificationQuestion",
      "text",
    ],
  },

  understand: {
    type: "object",
    additionalProperties: false,
    properties: {
      simpleMeaning: { type: "string" },
      whatTheyWant: { type: "string" },
      unfamiliarTerms: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            term: { type: "string" },
            meaning: { type: "string" },
          },
          required: ["term", "meaning"],
        },
      },
      ambiguityNote: { type: "string" },
    },
    required: [
      "simpleMeaning",
      "whatTheyWant",
      "unfamiliarTerms",
      "ambiguityNote",
    ],
  },

  client_reply: {
    type: "object",
    additionalProperties: false,
    properties: {
      intentSummary: { type: "string" },
      needsClarification: { type: "boolean" },
      clarificationQuestion: { type: "string" },
      text: { type: "string" },
    },
    required: [
      "intentSummary",
      "needsClarification",
      "clarificationQuestion",
      "text",
    ],
  },

  grammar: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string" },
    },
    required: ["text"],
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  let result = "";

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;

      for (const content of item.content) {
        if (
          content?.type === "output_text" &&
          typeof content?.text === "string"
        ) {
          result += content.text;
        }
      }
    }
  }

  return result.trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "Clarity AI Assistant API",
        version: "0.2.2",
      });
    }

    if (request.method !== "POST" || url.pathname !== "/improve") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    if (!env.WRITING_APP_TOKEN) {
      console.error("WRITING_APP_TOKEN missing");
      return json(
        { ok: false, error: "Server authentication is not configured." },
        500,
      );
    }

    if (!env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY missing");
      return json({ ok: false, error: "AI service is not configured." }, 500);
    }

    const authorization = request.headers.get("Authorization") || "";
    const expected = `Bearer ${env.WRITING_APP_TOKEN}`;

    if (authorization !== expected) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";

    const mode = typeof body?.mode === "string" ? body.mode : "express";

    const context =
      typeof body?.context === "string" ? body.context.trim() : "";

    const explanationLanguage =
      body?.explanationLanguage === "taglish" ? "taglish" : "simple_english";

    if (!text) {
      return json({ ok: false, error: "Text is required." }, 400);
    }

    if (text.length > 12000) {
      return json({ ok: false, error: "Text is too long." }, 400);
    }

    if (context.length > 20000) {
      return json(
        { ok: false, error: "Conversation context is too long." },
        400,
      );
    }

    if (!MODES[mode]) {
      return json({ ok: false, error: "Invalid writing mode." }, 400);
    }

    const explanationInstruction =
      mode === "understand"
        ? explanationLanguage === "taglish"
          ? `
EXPLANATION LANGUAGE:
Explain the selected text in clear, natural Taglish.
Use Tagalog only where it makes the explanation easier to understand.
Keep technical terms in English when that is clearer.
`
          : `
EXPLANATION LANGUAGE:
Explain the selected text in very simple, natural English.
Avoid advanced vocabulary where a simpler word would work.
`
        : `
OUTPUT LANGUAGE:
Return the final writing in natural English.
`;

    const instructions = `
${BASE_RULES}

MODE:
${MODES[mode]}

${explanationInstruction}
    `.trim();

    let input = text;

    if (mode === "client_reply" && context) {
      input = `
CLIENT / CONVERSATION CONTEXT:

<context>
${context}
</context>

THE USER'S ROUGH RESPONSE:

<rough_response>
${text}
</rough_response>
      `.trim();
    }

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5.6-luna",
          instructions,
          input,
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: `writing_${mode}`,
              description: "Structured result for the writing assistant.",
              schema: SCHEMAS[mode],
              strict: true,
            },
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("OpenAI API error:", {
          status: response.status,
          error: data?.error?.message,
        });

        return json(
          {
            ok: false,
            error: "The writing service could not process this request.",
          },
          502,
        );
      }

      const output = extractOutputText(data);

      if (!output) {
        return json(
          { ok: false, error: "The AI returned an empty response." },
          502,
        );
      }

      let result;

      try {
        result = JSON.parse(output);
      } catch {
        console.error("Could not parse structured output.");

        return json(
          {
            ok: false,
            error: "The writing service returned an invalid result.",
          },
          502,
        );
      }

      return json({
        ok: true,
        mode,
        result,
      });
    } catch (error) {
      console.error("Worker error:", error);

      return json({ ok: false, error: "Unable to process the request." }, 500);
    }
  },
};
