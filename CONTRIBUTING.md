# Contributing

## Development
Prereqs:
- Node.js
- Git on PATH

Common commands:
```bash
npm install
npm run build
npm run smoke
```

## Guidelines
- Keep the tool surface stable (additive changes only)
- Prefer structured errors (`{ ok:false, error:{ code, message, details? } }`)
- Avoid shell execution; use `spawn` with args arrays
- Add/extend smoke tests for end-to-end behaviors

