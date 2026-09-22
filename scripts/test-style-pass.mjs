// End-to-end tests for stylePass() with the Anthropic API stubbed out.
//
// validate() is tested separately in test-validate.mjs. This covers the
// plumbing around it: fence stripping, the fallback on a rejected response,
// the fallback on an API error, and the no-key path.
//
//   node scripts/test-style-pass.mjs

import { stylePass } from "./style-pass.mjs";

const TITLE = "Configuring The PitchPrint Module";
const INPUT = `---
title: "Configuring The PitchPrint Module"
description: "Set your API key and upload the module."
---

## Before you start

You need your PitchPrint \`apiKey\` from the dashboard.

<Steps>
  <Step title="Copy the module into the modules directory on your server">
    Copy \`pitchprint.zip\` into the \`modules\` directory.
  </Step>

  <Step title="Open the configure screen and paste your key into the field">
    Open **Modules → PitchPrint → Configure** and paste your \`apiKey\`, then save.
  </Step>
</Steps>
`;

// A good response: better step titles, same facts.
const GOOD_RESPONSE = `---
title: "Configuring The PitchPrint Module"
description: "Set your API key and upload the module."
---

## Before you start

You need your PitchPrint \`apiKey\` from the dashboard.

<Steps>
  <Step title="Upload the module">
    Copy \`pitchprint.zip\` into the \`modules\` directory on your server.
  </Step>

  <Step title="Set the API key">
    Open **Modules → PitchPrint → Configure**, paste your \`apiKey\` and save.
  </Step>
</Steps>
`;

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`ok    ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${detail}`);
  }
};

const realFetch = globalThis.fetch;

/** Stub the Messages API with a fixed assistant reply. */
function stubModel(reply, { status = 200 } = {}) {
  globalThis.fetch = async (url) => {
    // The component-docs fetch is a different host; let it return nothing.
    if (!String(url).includes("api.anthropic.com")) {
      return { ok: false, status: 404, text: async () => "" };
    }
    if (status !== 200) {
      return { ok: false, status, text: async () => '{"error":{"message":"boom"}}' };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: reply }] }),
      text: async () => reply,
    };
  };
}

const run = (opts = {}) =>
  stylePass({ mdx: INPUT, title: TITLE, section: "documentation", exemplar: "(none)", ...opts });

/* -------------------------------------------------------------------- tests */

// No key: the mechanical version is kept, and the caller is told why.
delete process.env.ANTHROPIC_API_KEY;
globalThis.fetch = realFetch;
{
  const r = await run();
  check("no API key keeps the mechanical version", r.applied === false && r.mdx === INPUT, JSON.stringify(r.problems));
  check("no API key explains itself", /ANTHROPIC_API_KEY/.test(r.problems.join(" ")), r.problems.join(" "));
}

process.env.ANTHROPIC_API_KEY = "test-key-not-real";

// A good response is applied.
{
  stubModel(GOOD_RESPONSE);
  const r = await run();
  check("a good response is applied", r.applied === true && /Upload the module/.test(r.mdx), JSON.stringify(r.problems));
  check("the applied output has no leading blank line", !/^\s*\n/.test(r.mdx), JSON.stringify(r.mdx.slice(0, 20)));
}

// A fenced response is unwrapped rather than rejected.
{
  stubModel("```mdx\n" + GOOD_RESPONSE.trim() + "\n```");
  const r = await run();
  check("a fenced response is unwrapped and applied", r.applied === true && !r.mdx.includes("```mdx"), JSON.stringify(r.problems));
}

// A response with chatty preamble fails validation and falls back.
{
  stubModel("Sure! Here's the rewritten article:\n\n" + GOOD_RESPONSE);
  const r = await run();
  check("a chatty preamble is rejected", r.applied === false && r.mdx === INPUT, JSON.stringify(r.problems));
}

// A response that drops a step falls back to the mechanical version.
{
  stubModel(GOOD_RESPONSE.replace(/  <Step title="Set the API key">[\s\S]*?<\/Step>\n/, ""));
  const r = await run();
  check("a dropped step is rejected and the input kept", r.applied === false && r.mdx === INPUT, JSON.stringify(r.problems));
  check("the rejection names the reason", /steps lost|specifics dropped/.test(r.problems.join(" ")), r.problems.join(" "));
}

// An API error falls back rather than throwing.
{
  stubModel("", { status: 429 });
  const r = await run();
  check("a 429 falls back without throwing", r.applied === false && r.mdx === INPUT, JSON.stringify(r.problems));
  check("the 429 is reported", /429/.test(r.problems.join(" ")), r.problems.join(" "));
}

// A network failure falls back rather than throwing.
{
  globalThis.fetch = async (url) => {
    if (!String(url).includes("api.anthropic.com")) return { ok: false, status: 404, text: async () => "" };
    throw new Error("ECONNRESET");
  };
  const r = await run();
  check("a network failure falls back", r.applied === false && r.mdx === INPUT, JSON.stringify(r.problems));
  check("the network failure is reported", /ECONNRESET/.test(r.problems.join(" ")), r.problems.join(" "));
}

// An empty response falls back.
{
  stubModel("");
  const r = await run();
  check("an empty response is rejected", r.applied === false && r.mdx === INPUT, JSON.stringify(r.problems));
}

globalThis.fetch = realFetch;

console.log("");
if (failures) {
  console.log(`${failures} test(s) failed.`);
  process.exit(1);
}
console.log("All stylePass() tests passed.");
