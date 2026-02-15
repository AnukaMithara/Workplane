import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

async function withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

function git(cwd: string, args: string[]) {
  execFileSync("git", ["-C", cwd, ...args], {
    stdio: "ignore",
    windowsHide: true,
  });
}

function getStructured(callResult: any) {
  return callResult?.structuredContent ?? JSON.parse(callResult?.content?.[0]?.text ?? "{}");
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..", "..");
  const serverJs = path.join(repoRoot, "dist", "server.js");

  if (!fs.existsSync(serverJs)) {
    throw new Error("dist/server.js not found. Run: npm run build");
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workplane-demo-"));
  const tmpRepo = path.join(tmpRoot, "src-repo");
  fs.mkdirSync(tmpRepo, { recursive: true });

  // Create a minimal local git repo so the demo is runnable anywhere.
  git(tmpRepo, ["init"]);
  fs.writeFileSync(path.join(tmpRepo, "README.md"), "demo\n", "utf8");
  git(tmpRepo, ["add", "."]);
  execFileSync(
    "git",
    [
      "-C",
      tmpRepo,
      "-c",
      "user.email=demo@example.com",
      "-c",
      "user.name=workplane-demo",
      "commit",
      "-m",
      "init",
    ],
    { stdio: "ignore", windowsHide: true }
  );

  // Ensure the server writes state/artifacts into a temp root (not ~/.workplane).
  process.env.WORKPLANE_ROOT = tmpRoot;

  const client = new Client({ name: "workplane-two-ws-demo", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverJs],
    cwd: repoRoot,
    stderr: "pipe",
  });

  transport.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await withTimeout("client.connect", 20_000, client.connect(transport));

    const ws1 = await withTimeout(
      "workspace.create (ws1)",
      60_000,
      client.callTool({
        name: "workspace.create",
        arguments: { repo_path: tmpRepo, base_ref: "HEAD" },
      })
    );
    const ws1s = getStructured(ws1);
    assert(ws1s?.ok === true, "workspace.create (ws1) failed");
    const ws1Id = ws1s.workspace_id as string;
    assert(typeof ws1Id === "string" && ws1Id.length > 0, "Missing ws1 id");

    const ws2 = await withTimeout(
      "workspace.create (ws2)",
      60_000,
      client.callTool({
        name: "workspace.create",
        arguments: { repo_path: tmpRepo, base_ref: "HEAD" },
      })
    );
    const ws2s = getStructured(ws2);
    assert(ws2s?.ok === true, "workspace.create (ws2) failed");
    const ws2Id = ws2s.workspace_id as string;
    assert(typeof ws2Id === "string" && ws2Id.length > 0, "Missing ws2 id");

    // Lock each workspace with its own holder.
    const holder1 = "demo-holder-1";
    const holder2 = "demo-holder-2";

    const l1 = await withTimeout(
      "workspace.lock (ws1)",
      20_000,
      client.callTool({
        name: "workspace.lock",
        arguments: { workspace_id: ws1Id, holder_id: holder1, ttl_ms: 60_000 },
      })
    );
    assert(getStructured(l1)?.ok === true, "workspace.lock (ws1) failed");

    const l2 = await withTimeout(
      "workspace.lock (ws2)",
      20_000,
      client.callTool({
        name: "workspace.lock",
        arguments: { workspace_id: ws2Id, holder_id: holder2, ttl_ms: 60_000 },
      })
    );
    assert(getStructured(l2)?.ok === true, "workspace.lock (ws2) failed");

    // Apply different patches in each workspace.
    const patch1 =
      "diff --git a/README.md b/README.md\n" +
      "--- a/README.md\n" +
      "+++ b/README.md\n" +
      "@@ -1 +1,2 @@\n" +
      " demo\n" +
      "+workspace one change\n";

    const patch2 =
      "diff --git a/README.md b/README.md\n" +
      "--- a/README.md\n" +
      "+++ b/README.md\n" +
      "@@ -1 +1,2 @@\n" +
      " demo\n" +
      "+workspace two change\n";

    const ap1 = await withTimeout(
      "workspace.apply_patch (ws1)",
      20_000,
      client.callTool({
        name: "workspace.apply_patch",
        arguments: {
          workspace_id: ws1Id,
          holder_id: holder1,
          check: true,
          patch: patch1,
        },
      })
    );
    assert(getStructured(ap1)?.ok === true, "workspace.apply_patch (ws1) failed");

    const ap2 = await withTimeout(
      "workspace.apply_patch (ws2)",
      20_000,
      client.callTool({
        name: "workspace.apply_patch",
        arguments: {
          workspace_id: ws2Id,
          holder_id: holder2,
          check: true,
          patch: patch2,
        },
      })
    );
    assert(getStructured(ap2)?.ok === true, "workspace.apply_patch (ws2) failed");

    // Run a harmless command in each workspace (captures stdout/stderr as artifacts).
    const run1 = await withTimeout(
      "workspace.run (ws1)",
      20_000,
      client.callTool({
        name: "workspace.run",
        arguments: {
          workspace_id: ws1Id,
          holder_id: holder1,
          command: "git",
          args: ["status", "--porcelain"],
          timeout_ms: 20_000,
        },
      })
    );
    assert(getStructured(run1)?.ok === true, "workspace.run (ws1) failed");

    const run2 = await withTimeout(
      "workspace.run (ws2)",
      20_000,
      client.callTool({
        name: "workspace.run",
        arguments: {
          workspace_id: ws2Id,
          holder_id: holder2,
          command: "git",
          args: ["status", "--porcelain"],
          timeout_ms: 20_000,
        },
      })
    );
    assert(getStructured(run2)?.ok === true, "workspace.run (ws2) failed");

    // Collect diffs (and store as artifacts).
    const d1 = await withTimeout(
      "workspace.diff (ws1)",
      20_000,
      client.callTool({
        name: "workspace.diff",
        arguments: {
          workspace_id: ws1Id,
          store_as_artifact: true,
          pathspec: ["README.md"],
        },
      })
    );
    assert(getStructured(d1)?.ok === true, "workspace.diff (ws1) failed");

    const d2 = await withTimeout(
      "workspace.diff (ws2)",
      20_000,
      client.callTool({
        name: "workspace.diff",
        arguments: {
          workspace_id: ws2Id,
          store_as_artifact: true,
          pathspec: ["README.md"],
        },
      })
    );
    assert(getStructured(d2)?.ok === true, "workspace.diff (ws2) failed");

    // List artifacts in each workspace.
    const a1 = await withTimeout(
      "artifact.list (ws1)",
      20_000,
      client.callTool({
        name: "artifact.list",
        arguments: { workspace_id: ws1Id },
      })
    );
    assert(getStructured(a1)?.ok === true, "artifact.list (ws1) failed");

    const a2 = await withTimeout(
      "artifact.list (ws2)",
      20_000,
      client.callTool({
        name: "artifact.list",
        arguments: { workspace_id: ws2Id },
      })
    );
    assert(getStructured(a2)?.ok === true, "artifact.list (ws2) failed");

    const run1s = getStructured(run1);
    const run2s = getStructured(run2);
    const d1s = getStructured(d1);
    const d2s = getStructured(d2);
    const a1s = getStructured(a1);
    const a2s = getStructured(a2);

    console.log("Two-workspaces demo completed:");
    console.log(`- workspace_1: ${ws1Id}`);
    console.log(`  - diff_artifact_id: ${d1s.artifact_id}`);
    console.log(`  - stdout_artifact_id: ${run1s.stdout_artifact_id}`);
    console.log(`  - stderr_artifact_id: ${run1s.stderr_artifact_id}`);
    console.log(`  - artifacts: ${Array.isArray(a1s.artifacts) ? a1s.artifacts.length : 0}`);
    console.log(`- workspace_2: ${ws2Id}`);
    console.log(`  - diff_artifact_id: ${d2s.artifact_id}`);
    console.log(`  - stdout_artifact_id: ${run2s.stdout_artifact_id}`);
    console.log(`  - stderr_artifact_id: ${run2s.stderr_artifact_id}`);
    console.log(`  - artifacts: ${Array.isArray(a2s.artifacts) ? a2s.artifacts.length : 0}`);

    // Cleanup: release locks and close workspaces.
    await withTimeout(
      "workspace.close (ws1)",
      60_000,
      client.callTool({
        name: "workspace.close",
        arguments: { workspace_id: ws1Id, holder_id: holder1 },
      })
    );
    await withTimeout(
      "workspace.close (ws2)",
      60_000,
      client.callTool({
        name: "workspace.close",
        arguments: { workspace_id: ws2Id, holder_id: holder2 },
      })
    );

    await withTimeout("transport.close", 20_000, transport.close());
  } finally {
    await transport.close().catch(() => {});
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Two-workspaces demo failed:");
  console.error(err);
  process.exitCode = 1;
});
