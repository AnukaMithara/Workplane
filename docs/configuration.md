# Configuration

## WORKPLANE_ROOT

Controls where Workplane stores all state (repos, workspaces, artifacts, and `state.json`).

- Default: `~/.workplane`
- Override: set `WORKPLANE_ROOT` to an absolute path

Examples:

Linux/macOS:

```bash
export WORKPLANE_ROOT="$HOME/.workplane"
```

Windows (PowerShell):

```powershell
$env:WORKPLANE_ROOT = "$env:USERPROFILE\\.workplane"
```

## WORKPLANE_COMMAND_DENYLIST

Controls the executable denylist for `workspace.run`.

- Format: comma-separated executable names
- Matching: Workplane normalizes by lowercasing and stripping common extensions (`.exe`, `.cmd`, `.bat`)

Example:

```bash
export WORKPLANE_COMMAND_DENYLIST="powershell,cmd,rm,del"
```

Notes:

- This is a Phase 1 safety mechanism. Expect it to evolve into allowlists and/or per-tool policies.

## See Also

- [README.md](README.md)
- [tools.md](tools.md)
- [architecture.md](architecture.md)
- [hosting.md](hosting.md)
