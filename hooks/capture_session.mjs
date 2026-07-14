#!/usr/bin/env node

const SESSION_ID = /^[A-Za-z0-9_.:-]{1,256}$/;

async function readStdin() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return;
  }

  const sessionId = payload?.session_id;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return;

  try {
    const { executeCommand } = await import("../server/local-cli.mjs");
    await executeCommand({ command: "set-current", thread: sessionId });
  } catch {
    // Bookmark synchronization must never interrupt the Codex task.
  }
}

await main();
