import assert from "node:assert/strict";
import test from "node:test";

import worker from "./worker.js";

const APP_TOKEN = "test-app-token";
const OPENAI_API_KEY = "test-server-side-openai-key";

function createRequest(payload) {
  return new Request("https://worker.example/improve", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${APP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createStructuredResponse(text) {
  return {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}

function assertStrictSchema(schema) {
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(
      [...schema.required].sort(),
      Object.keys(schema.properties).sort(),
    );

    for (const property of Object.values(schema.properties)) {
      assertStrictSchema(property);
    }
  } else if (schema.type === "array") {
    assertStrictSchema(schema.items);
  }
}

async function invokeWorker({
  payload,
  openAIResponse,
  openAIStatus = 200,
  model,
}) {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init, body: JSON.parse(init.body) });

    return new Response(JSON.stringify(openAIResponse), {
      status: openAIStatus,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const env = {
      WRITING_APP_TOKEN: APP_TOKEN,
      OPENAI_API_KEY,
      ...(model ? { OPENAI_MODEL: model } : {}),
    };
    const response = await worker.fetch(createRequest(payload), env);

    return {
      response,
      body: await response.json(),
      requests,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("uses GPT-6 Luna and preserves structured requests for every writing mode", async () => {
  const modes = [
    { mode: "express", text: "rough thought" },
    {
      mode: "understand",
      text: "Please send the update by Friday.",
      explanationLanguage: "taglish",
    },
    {
      mode: "client_reply",
      text: "I am checking this now.",
      context: "Client asked for a status update.",
    },
    {
      mode: "client_reply_options",
      text: "I am checking this now.",
      context: "Client asked for a status update.",
    },
    { mode: "grammar", text: "this sentence need fixing" },
  ];

  for (const payload of modes) {
    const result = await invokeWorker({
      payload,
      openAIResponse: createStructuredResponse(
        JSON.stringify({ mode: payload.mode }),
      ),
    });

    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, {
      ok: true,
      mode: payload.mode,
      result: { mode: payload.mode },
    });

    const outbound = result.requests[0];
    assert.equal(outbound.url, "https://api.openai.com/v1/responses");
    assert.equal(outbound.init.method, "POST");
    assert.equal(
      outbound.init.headers.Authorization,
      `Bearer ${OPENAI_API_KEY}`,
    );
    assert.equal(outbound.body.model, "gpt-6-luna");
    assert.equal(outbound.body.store, false);
    assert.ok(outbound.body.instructions.includes("Never invent facts."));
    assert.ok(outbound.body.instructions.includes("MODE:"));
    assert.equal(outbound.body.text.format.type, "json_schema");
    assert.equal(outbound.body.text.format.name, `writing_${payload.mode}`);
    assert.equal(outbound.body.text.format.strict, true);
    assertStrictSchema(outbound.body.text.format.schema);
    assert.ok(
      !JSON.stringify({
        url: outbound.url,
        headers: outbound.init.headers,
        body: outbound.body,
      }).includes(APP_TOKEN),
    );
    assert.ok(!JSON.stringify(outbound.body).includes(OPENAI_API_KEY));
    assert.ok(!JSON.stringify(result.body).includes(OPENAI_API_KEY));

    if (payload.context) {
      assert.ok(outbound.body.input.includes(payload.context));
      assert.ok(outbound.body.input.includes("<rough_response>"));
    }
  }
});

test("honors OPENAI_MODEL and extracts the top-level Responses output_text value", async () => {
  const result = await invokeWorker({
    payload: { mode: "grammar", text: "this sentence need fixing" },
    model: "configured-model-id",
    openAIResponse: { output_text: '{"text":"This sentence needs fixing."}' },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.requests[0].body.model, "configured-model-id");
  assert.deepEqual(result.body.result, { text: "This sentence needs fixing." });
});

test("maps OpenAI errors and malformed structured output to safe worker errors", async () => {
  const apiError = await invokeWorker({
    payload: { mode: "express", text: "rough thought" },
    openAIStatus: 400,
    openAIResponse: { error: { message: "provider detail" } },
  });

  assert.equal(apiError.response.status, 502);
  assert.deepEqual(apiError.body, {
    ok: false,
    error: "The writing service could not process this request.",
  });
  assert.ok(!JSON.stringify(apiError.body).includes("provider detail"));

  const invalidOutput = await invokeWorker({
    payload: { mode: "express", text: "rough thought" },
    openAIResponse: createStructuredResponse("not valid JSON"),
  });

  assert.equal(invalidOutput.response.status, 502);
  assert.deepEqual(invalidOutput.body, {
    ok: false,
    error: "The writing service returned an invalid result.",
  });
});

test("AI prompt rewriting preserves source constraints and separates revision instructions", async () => {
  const payload = {
    mode: "express", purpose: "prompt", operation: "refine",
    text: "inspect checkout muna, don't edit or deploy, plan first",
    context: "Original notes: maybe the script causes it; still unconfirmed.",
    refinement: "Make the task clearer. Keep all approval boundaries.",
  };
  const result = await invokeWorker({ payload, openAIResponse: { output_text: '{"text":"A sample draft."}' } });
  const request = result.requests[0].body;
  assert.match(request.instructions, /WRITING PURPOSE: AI PROMPT/);
  assert.match(request.instructions, /Do not perform or answer the task/);
  assert.match(request.instructions, /REFINE THE CURRENT DRAFT/);
  assert.ok(request.input.includes(payload.text));
  assert.ok(request.input.includes(payload.context));
  assert.ok(request.input.includes("<revision_request>\n" + payload.refinement));
  assert.equal(request.store, false);
});

test("idea development is opt-in and keeps suggestions distinct from established facts", async () => {
  const developed = await invokeWorker({
    payload: { mode: "express", operation: "develop", text: "make the client replies continuous" },
    openAIResponse: { output_text: '{"text":"Ideas to consider."}' },
  });
  assert.match(developed.requests[0].body.instructions, /OPERATION: DEVELOP AN IDEA/);
  assert.match(developed.requests[0].body.instructions, /Keep suggestions distinct from established facts/);
  const ordinary = await invokeWorker({
    payload: { mode: "express", text: "maybe cache issue. checking pa" },
    openAIResponse: { output_text: '{"text":"The cache may be involved. I am still checking."}' },
  });
  assert.ok(!ordinary.requests[0].body.instructions.includes("OPERATION: DEVELOP AN IDEA"));
  assert.match(ordinary.requests[0].body.instructions, /WRITING PURPOSE: MESSAGE/);
});

test("new writing controls reject invalid requests before calling OpenAI", async () => {
  for (const extra of [{ purpose: "unknown" }, { operation: "execute" }, { refinement: "x".repeat(2001) }, { context: "x".repeat(40001) }]) {
    const result = await invokeWorker({ payload: { mode: "express", text: "notes", ...extra }, openAIResponse: {} });
    assert.equal(result.response.status, 400);
    assert.equal(result.requests.length, 0);
  }
});
