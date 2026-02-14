import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

  try {
    await withTimeout("client.connect", 20_000, client.connect(transport));

    const tools = await withTimeout("client.listTools", 20_000, client.listTools());
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

    const r1 = await withTimeout(
      "workspace.list",
      20_000,
      client.callTool({
        name: "workspace.list",
        arguments: {},
      })
    );
    assert(
      typeof r1 === "object" && r1 !== null,
      "workspace.list returned non-object"
    );

    const r2 = await withTimeout(
      "workspace.create",
      60_000,
      client.callTool({
        name: "workspace.create",
        arguments: { repo_path: tmpRepo, base_ref: "HEAD" },
      })
    );
    assert(
      typeof r2 === "object" && r2 !== null,
      "workspace.create returned non-object"
    );

    const wsId =
      (r2 as any)?.structuredContent?.workspace_id ??
      JSON.parse((r2 as any)?.content?.[0]?.text ?? "{}")?.workspace_id;
    assert(typeof wsId === "string" && wsId.length > 0, "Missing workspace_id");

    const r3 = await withTimeout(
      "workspace.get",
      20_000,
      client.callTool({
        name: "workspace.get",
        arguments: { workspace_id: wsId },
      })
    );
    assert(
      typeof r3 === "object" && r3 !== null,
      "workspace.get returned non-object"
    );

  // Lock + artifact basic checks.
    const holderId = "smoke-holder";
    const lock = await withTimeout(
      "workspace.lock",
      20_000,
      client.callTool({
        name: "workspace.lock",
        arguments: { workspace_id: wsId, holder_id: holderId, ttl_ms: 60_000 },
      })
    );
    const lockOk =
      (lock as any)?.structuredContent?.ok ??
      JSON.parse((lock as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(lockOk === true, "workspace.lock did not return ok=true");

  // apply_patch should fail without holder_id (mutation requires lock + holder_id).
    const applyNoHolder = await withTimeout(
      "workspace.apply_patch (no holder)",
      20_000,
      client.callTool({
        name: "workspace.apply_patch",
        arguments: {
          workspace_id: wsId,
          patch: "diff --git a/README.md b/README.md\n",
          check: true,
        },
      })
    );
    const applyNoHolderOk =
      (applyNoHolder as any)?.structuredContent?.ok ??
      JSON.parse((applyNoHolder as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(
      applyNoHolderOk === false,
      "workspace.apply_patch should deny without holder_id"
    );

  // apply_patch check failure with holder_id should return ok=false.
    const applyCheckFail = await withTimeout(
      "workspace.apply_patch (check fail)",
      20_000,
      client.callTool({
        name: "workspace.apply_patch",
        arguments: {
          workspace_id: wsId,
          holder_id: holderId,
          check: true,
          patch: "this is not a patch\n",
        },
      })
    );
    const applyCheckFailOk =
      (applyCheckFail as any)?.structuredContent?.ok ??
      JSON.parse((applyCheckFail as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(
      applyCheckFailOk === false,
      "workspace.apply_patch check should fail on invalid patch"
    );

  // apply_patch success: modify a tracked file so `git diff` can see it.
  const patchOk =
    "diff --git a/README.md b/README.md\n" +
    "--- a/README.md\n" +
    "+++ b/README.md\n" +
    "@@ -1 +1,2 @@\n" +
    " hello\n" +
    "+hello from patch\n";

    const applyOk = await withTimeout(
      "workspace.apply_patch (success)",
      20_000,
      client.callTool({
        name: "workspace.apply_patch",
        arguments: {
          workspace_id: wsId,
          holder_id: holderId,
          check: true,
          patch: patchOk,
        },
      })
    );
    const applyOkOk =
      (applyOk as any)?.structuredContent?.ok ??
      JSON.parse((applyOk as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(applyOkOk === true, "workspace.apply_patch did not return ok=true");

    const patchArtifactId =
      (applyOk as any)?.structuredContent?.patch_artifact_id ??
      JSON.parse((applyOk as any)?.content?.[0]?.text ?? "{}")?.patch_artifact_id;
    assert(
      typeof patchArtifactId === "string" && patchArtifactId.length > 0,
      "Missing patch_artifact_id"
    );

  // Verify patch was stored as an artifact.
    const patchArtifact = await withTimeout(
      "artifact.get (patch)",
      20_000,
      client.callTool({
        name: "artifact.get",
        arguments: { workspace_id: wsId, artifact_id: patchArtifactId },
      })
    );
    const patchContent =
      (patchArtifact as any)?.structuredContent?.artifact?.content ??
      JSON.parse((patchArtifact as any)?.content?.[0]?.text ?? "{}")?.artifact?.content;
    assert(
      typeof patchContent === "string" && patchContent.includes("README.md"),
      "Expected patch artifact content to include README.md"
    );

  // workspace.diff should include the new file content, and can be stored as an artifact.
    const diffRes = await withTimeout(
      "workspace.diff",
      20_000,
      client.callTool({
        name: "workspace.diff",
        arguments: {
          workspace_id: wsId,
          store_as_artifact: true,
          pathspec: ["README.md"],
        },
      })
    );
    const diffOk =
      (diffRes as any)?.structuredContent?.ok ??
      JSON.parse((diffRes as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(diffOk === true, "workspace.diff did not return ok=true");

    const diffText =
      (diffRes as any)?.structuredContent?.diff ??
      JSON.parse((diffRes as any)?.content?.[0]?.text ?? "{}")?.diff;
    assert(
      typeof diffText === "string" && diffText.includes("hello from patch"),
      "Expected workspace.diff to include patched content"
    );

    const diffArtifactId =
      (diffRes as any)?.structuredContent?.artifact_id ??
      JSON.parse((diffRes as any)?.content?.[0]?.text ?? "{}")?.artifact_id;
    assert(
      typeof diffArtifactId === "string" && diffArtifactId.length > 0,
      "Expected workspace.diff to return artifact_id when store_as_artifact=true"
    );

    const diffArtifact = await withTimeout(
      "artifact.get (diff)",
      20_000,
      client.callTool({
        name: "artifact.get",
        arguments: { workspace_id: wsId, artifact_id: diffArtifactId },
      })
    );
    const diffArtifactContent =
      (diffArtifact as any)?.structuredContent?.artifact?.content ??
      JSON.parse((diffArtifact as any)?.content?.[0]?.text ?? "{}")?.artifact?.content;
    assert(
      typeof diffArtifactContent === "string" &&
        diffArtifactContent.includes("hello from patch"),
      "Expected diff artifact to include patched content"
    );

  // workspace.run success: run a harmless command and verify log artifacts exist.
    const runRes = await withTimeout(
      "workspace.run (git status)",
      20_000,
      client.callTool({
        name: "workspace.run",
        arguments: {
          workspace_id: wsId,
          holder_id: holderId,
          command: "git",
          args: ["status", "--porcelain"],
          timeout_ms: 20_000,
          max_output_bytes: 64 * 1024,
        },
      })
    );
    const runOk =
      (runRes as any)?.structuredContent?.ok ??
      JSON.parse((runRes as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(runOk === true, "workspace.run did not return ok=true");

    const stdoutArtId =
      (runRes as any)?.structuredContent?.stdout_artifact_id ??
      JSON.parse((runRes as any)?.content?.[0]?.text ?? "{}")?.stdout_artifact_id;
    const stderrArtId =
      (runRes as any)?.structuredContent?.stderr_artifact_id ??
      JSON.parse((runRes as any)?.content?.[0]?.text ?? "{}")?.stderr_artifact_id;
    assert(
      typeof stdoutArtId === "string" && stdoutArtId.length > 0,
      "Missing stdout_artifact_id"
    );
    assert(
      typeof stderrArtId === "string" && stderrArtId.length > 0,
      "Missing stderr_artifact_id"
    );

    const stdoutArt = await withTimeout(
      "artifact.get (stdout)",
      20_000,
      client.callTool({
        name: "artifact.get",
        arguments: { workspace_id: wsId, artifact_id: stdoutArtId },
      })
    );
    const stdoutContent =
      (stdoutArt as any)?.structuredContent?.artifact?.content ??
      JSON.parse((stdoutArt as any)?.content?.[0]?.text ?? "{}")?.artifact?.content;
    assert(typeof stdoutContent === "string", "stdout artifact missing content");

    const stderrArt = await withTimeout(
      "artifact.get (stderr)",
      20_000,
      client.callTool({
        name: "artifact.get",
        arguments: { workspace_id: wsId, artifact_id: stderrArtId },
      })
    );
    const stderrContent =
      (stderrArt as any)?.structuredContent?.artifact?.content ??
      JSON.parse((stderrArt as any)?.content?.[0]?.text ?? "{}")?.artifact?.content;
    assert(typeof stderrContent === "string", "stderr artifact missing content");

  // workspace.run denylist: powershell should be denied by default.
    const denied = await withTimeout(
      "workspace.run (denied)",
      20_000,
      client.callTool({
        name: "workspace.run",
        arguments: {
          workspace_id: wsId,
          holder_id: holderId,
          command: "powershell",
          args: ["-NoProfile", "-Command", "echo denied"],
          timeout_ms: 5_000,
        },
      })
    );
    const deniedOk =
      (denied as any)?.structuredContent?.ok ??
      JSON.parse((denied as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(deniedOk === false, "workspace.run should deny powershell");

    const deniedCode =
      (denied as any)?.structuredContent?.error?.code ??
      JSON.parse((denied as any)?.content?.[0]?.text ?? "{}")?.error?.code;
    assert(deniedCode === "DENIED", "Expected DENIED error code");

  // workspace.run timeout: run a long node process and enforce a short timeout.
    const timeoutRes = await withTimeout(
      "workspace.run (timeout)",
      20_000,
      client.callTool({
        name: "workspace.run",
        arguments: {
          workspace_id: wsId,
          holder_id: holderId,
          command: "node",
          args: ["-e", "setTimeout(()=>{}, 5000)"],
          timeout_ms: 200,
          max_output_bytes: 16 * 1024,
        },
      })
    );
    const timeoutOk =
      (timeoutRes as any)?.structuredContent?.ok ??
      JSON.parse((timeoutRes as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(timeoutOk === true, "workspace.run timeout should still return ok=true");

    const timedOut =
      (timeoutRes as any)?.structuredContent?.timed_out ??
      JSON.parse((timeoutRes as any)?.content?.[0]?.text ?? "{}")?.timed_out;
    assert(timedOut === true, "Expected timed_out=true");

  // Close should be denied without the correct holder_id when locked.
    const closeDenied = await withTimeout(
      "workspace.close (denied)",
      20_000,
      client.callTool({
        name: "workspace.close",
        arguments: { workspace_id: wsId },
      })
    );
    const closeDeniedOk =
      (closeDenied as any)?.structuredContent?.ok ??
      JSON.parse((closeDenied as any)?.content?.[0]?.text ?? "{}")?.ok;
    assert(closeDeniedOk === false, "workspace.close should be denied while locked");

    const put = await withTimeout(
      "artifact.put",
      20_000,
      client.callTool({
        name: "artifact.put",
        arguments: {
          workspace_id: wsId,
          type: "log",
          name: "smoke-log",
          content: "hello artifact\n",
          content_type: "text/plain",
        },
      })
    );
    const artId =
      (put as any)?.structuredContent?.artifact_id ??
      JSON.parse((put as any)?.content?.[0]?.text ?? "{}")?.artifact_id;
    assert(typeof artId === "string" && artId.length > 0, "Missing artifact_id");

    const list = await withTimeout(
      "artifact.list",
      20_000,
      client.callTool({
        name: "artifact.list",
        arguments: { workspace_id: wsId, type: "log" },
      })
    );
    const artifacts =
      (list as any)?.structuredContent?.artifacts ??
      JSON.parse((list as any)?.content?.[0]?.text ?? "{}")?.artifacts;
    assert(Array.isArray(artifacts) && artifacts.length >= 1, "artifact.list empty");

    const get = await withTimeout(
      "artifact.get (log)",
      20_000,
      client.callTool({
        name: "artifact.get",
        arguments: { workspace_id: wsId, artifact_id: artId },
      })
    );
    const content =
      (get as any)?.structuredContent?.artifact?.content ??
      JSON.parse((get as any)?.content?.[0]?.text ?? "{}")?.artifact?.content;
    assert(content === "hello artifact\n", "artifact.get content mismatch");

    const r4 = await withTimeout(
      "workspace.list (open)",
      20_000,
      client.callTool({
        name: "workspace.list",
        arguments: { status: "open" },
      })
    );
    assert(
      typeof r4 === "object" && r4 !== null,
      "workspace.list returned non-object"
    );

    const r5 = await withTimeout(
      "workspace.close (allowed)",
      60_000,
      client.callTool({
        name: "workspace.close",
        arguments: { workspace_id: wsId, holder_id: holderId },
      })
    );
    assert(
      typeof r5 === "object" && r5 !== null,
      "workspace.close returned non-object"
    );

    await withTimeout("transport.close", 20_000, transport.close());
  } finally {
    // Ensure the child server process is not leaked on assertion failures.
    await transport.close().catch(() => {});
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log(
    "Phase 1 smoke test passed (tool registration + workspace lifecycle + locks + artifacts)."
  );
}

main().catch((err) => {
  console.error("Phase 1 smoke test failed:");
  console.error(err);
  process.exitCode = 1;
});
