# Using Workplane From An MCP Host

Workplane is an MCP **stdio server**. Your MCP host is responsible for starting the process and connecting over stdin/stdout.

## Dev vs Prod

- Dev: `npm run dev` (runs `src/server.ts` via tsx)
- Prod: `npm run build` then `node dist/server.js` (or `npm start`)

## Typical Host Configuration

Most MCP hosts accept a command + args + environment. A typical configuration looks like:

- command: `node`
- args: `["dist/server.js"]`
- env:
  - `WORKPLANE_ROOT=/path/to/workplane-root`
  - `WORKPLANE_COMMAND_DENYLIST=powershell,cmd,rm,del` (optional)

If your host prefers `npm`, you can also use:

- command: `npm`
- args: `["start"]`

Notes:

- Workplane must keep stdout reserved for MCP JSON-RPC. Logs go to stderr.
- Always set a dedicated `WORKPLANE_ROOT` for local testing so you can delete it safely.

## See Also

- [README.md](README.md)
- [configuration.md](configuration.md)
- [tools.md](tools.md)
