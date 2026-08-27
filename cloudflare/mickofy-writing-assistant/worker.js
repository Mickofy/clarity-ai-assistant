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

  client_reply_options: `
The user wants three possible replies to another person's message.

Use:
- the latest client message
- recent conversation context
- any rough response, intent, or factual details supplied by the user
- the requested tone, length, and variation instructions

Your first job is to decide whether the user's available information is
sufficient to answer the client's ACTUAL question truthfully.

Be intelligent and flexible.

IMPORTANT DISTINCTION:

REQUIRED INFORMATION:
Facts or decisions that are necessary to answer what the client actually asked.

OPTIONAL ENRICHMENT:
Extra details that could make the reply stronger but are not required, such as:
- exact dates
- exact number of days
- exact metrics or percentages
- detailed technical causes
- extra tools or implementation details
- additional outcomes
- precise timelines
- extra examples

Never block reply generation merely because OPTIONAL ENRICHMENT is missing.

Prefer generating a truthful, slightly general reply over asking another
clarification question when the user's rough notes already support a useful answer.

Ask for clarification ONLY when:
- answering the client's actual question would otherwise require inventing an important fact
- a real user decision is required before a reply can be written
- the user's notes are so incomplete that the core request cannot be answered truthfully

Examples:

Client asks:
"Tell us about a project where your timeline slipped. What happened, and what did you do about it?"

User notes:
"Dermaestha. unexpected bugs. adjusted timeline and tried different approaches to fix it."

This is ENOUGH.
Do not ask how many extra days it took.
Do not ask for exact dates.
Do not require a quantified result.
Create the replies from the facts supplied and keep any unknown outcome general.

If the user's notes say an issue was being worked on, do not invent that it was
fully resolved. Preserve what is known and what is still uncertain.

Client asks:
"What is your availability next week?"

User provides no availability at all.

This is NOT enough because the reply requires a real user decision.
Ask for the minimum necessary availability information.

Client asks:
"What would you charge for this project?"

User gives no price, range, or pricing direction.

This is NOT enough because a price would have to be invented.
Ask for the minimum pricing information needed.

When clarification is genuinely necessary:
- set needsClarification to true
- ask ONE concise clarification question
- request only the minimum missing information
- populate placeholderExample with one short, clearly generic example showing
  the shape of rough notes the user could enter
- the placeholderExample must start with "e.g."
- use generic placeholders such as "Project X", "Mon–Thu", or "$X–$Y"
- never put invented personal facts, real project names, employers, clients,
  claimed experience, prices, dates, or commitments into the placeholder
- return an empty replies array

Do not ask follow-up questions for facts that the client did not request unless
those facts are genuinely necessary to avoid fabrication.

If there is enough information:
- set needsClarification to false
- set clarificationQuestion to an empty string
- set placeholderExample to an empty string
- create exactly three distinct replies
- keep the same facts and intended meaning across all three
- preserve uncertainty and incomplete status when present
- follow the requested tone, length, and variation instructions
- make every reply natural and ready to send
- make the three replies meaningfully different in phrasing and delivery
- return only the actual reply text inside the replies array
- do not add labels, analysis, explanations, quotation marks, or notes inside replies

Do not ask for clarification merely because the user's writing is rough,
informal, Taglish, Tagalog, fragmented, short, or grammatically incorrect.

Rough notes are enough when they contain the core facts needed to answer the
client's actual question.
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

  client_reply_options: {
    type: "object",
    additionalProperties: false,
    properties: {
      needsClarification: { type: "boolean" },
      clarificationQuestion: { type: "string" },
      placeholderExample: { type: "string" },
      replies: {
        type: "array",
        maxItems: 3,
        items: {
          type: "string",
        },
      },
    },
    required: [
      "needsClarification",
      "clarificationQuestion",
      "placeholderExample",
      "replies",
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
        version: "0.2.5",
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

    if (
      (mode === "client_reply" || mode === "client_reply_options") &&
      context
    ) {
      const responseLabel =
        mode === "client_reply_options"
          ? "THE USER'S ROUGH RESPONSE / INTENT OR DRAFT INSTRUCTION"
          : "THE USER'S ROUGH RESPONSE";

      input = `
CLIENT / CONVERSATION CONTEXT:

<context>
${context}
</context>

${responseLabel}:

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
