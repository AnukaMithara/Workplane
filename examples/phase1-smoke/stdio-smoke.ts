import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

function git(cwd: string, args: string[]) {
  execFileSync("git", ["-C", cwd, ...args], {
    stdio: "ignore",
    windowsHide: true,
  });
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workplane-smoke-"));
  const tmpRepo = path.join(tmpRoot, "src-repo");
  fs.mkdirSync(tmpRepo, { recursive: true });

  // Minimal local git repo for worktree operations.
  git(tmpRepo, ["init"]);
  fs.writeFileSync(path.join(tmpRepo, "README.md"), "hello\n", "utf8");
  git(tmpRepo, ["add", "."]);
  execFileSync(
    "git",
    [
      "-C",
      tmpRepo,
      "-c",
      "user.email=smoke@example.com",
      "-c",
      "user.name=workplane-smoke",
      "commit",
      "-m",
      "init",
    ],
    { stdio: "ignore", windowsHide: true }
  );

  // Ensure server uses a temp root so smoke doesn't touch the user's real home dir.
  process.env.WORKPLANE_ROOT = tmpRoot;

  const client = new Client({ name: "workplane-smoke", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  transport.stderr?.on("data", (chunk) => {
    // Surface server stderr to the test runner for debugging.
    process.stderr.write(chunk);
  });

  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = new Set(tools.tools.map((t) => t.name));

  const expected = [
    "workspace.create",
    "workspace.get",
    "workspace.list",
    "workspace.close",
    "workspace.lock",
    "workspace.release",
    "workspace.apply_patch",
    "workspace.diff",
    "workspace.run",
    "artifact.put",
    "artifact.get",
    "artifact.list",
  ];

  for (const name of expected) {
    assert(toolNames.has(name), `Missing expected tool: ${name}`);
  }

  // Optional tools are allowed to exist; we just verify registration if present.
  const optional = ["workspace.note.add", "workspace.note.list"];
  for (const name of optional) {
    if (!toolNames.has(name)) {
      console.warn(`Optional tool not registered: ${name}`);
    }
  }

  const r1 = await client.callTool({
    name: "workspace.list",
    arguments: {},
  });
  assert(
    typeof r1 === "object" && r1 !== null,
    "workspace.list returned non-object"
  );

  const r2 = await client.callTool({
    name: "workspace.create",
    arguments: { repo_path: tmpRepo, base_ref: "HEAD" },
  });
  assert(
    typeof r2 === "object" && r2 !== null,
    "workspace.create returned non-object"
  );

  const wsId =
    (r2 as any)?.structuredContent?.workspace_id ??
    JSON.parse((r2 as any)?.content?.[0]?.text ?? "{}")?.workspace_id;
  assert(typeof wsId === "string" && wsId.length > 0, "Missing workspace_id");

  const r3 = await client.callTool({
    name: "workspace.get",
    arguments: { workspace_id: wsId },
  });
  assert(typeof r3 === "object" && r3 !== null, "workspace.get returned non-object");

  const r4 = await client.callTool({
    name: "workspace.list",
    arguments: { status: "open" },
  });
  assert(
    typeof r4 === "object" && r4 !== null,
    "workspace.list returned non-object"
  );

  const r5 = await client.callTool({
    name: "workspace.close",
    arguments: { workspace_id: wsId },
  });
  assert(
    typeof r5 === "object" && r5 !== null,
    "workspace.close returned non-object"
  );

  await transport.close();

  fs.rmSync(tmpRoot, { recursive: true, force: true });

  console.log("Phase 1 smoke test passed (tool registration + worktree lifecycle).");
}

main().catch((err) => {
  console.error("Phase 1 smoke test failed:");
  console.error(err);
  process.exitCode = 1;
});
