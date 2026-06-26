---
name: Production has no npm registry access
description: Why runtime `npx -y <pkg>` fails in deployed apps and how to launch installed CLIs/MCP servers instead.
---

# Production deployments cannot reach the npm registry

Deployed (autoscale/production) apps have **no access to the package firewall / npm
registry** at runtime. Any code that does `npx -y <pkg>` (or otherwise downloads a
package on first use) fails in production with errors like
`getaddrinfo EAI_AGAIN package-firewall.replit.local`. For MCP servers spawned over
stdio this surfaces to the client as `MCP error -32001: Request timed out`.

Development works because the package is already cached locally, masking the bug.

**Why:** the production sandbox blocks outbound package-registry traffic; only your
already-installed `node_modules` is available.

**How to apply:** add the tool as a real dependency in package.json, then resolve and
run it directly instead of via npx:

```ts
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const entry = nodeRequire.resolve('@hubspot/mcp-server'); // -> .../dist/index.js
// spawn: command = process.execPath (node), args = [entry]
```

`createRequire(import.meta.url)` resolves at runtime relative to the bundled
`dist/index.mjs` and walks up to the workspace `node_modules`, so it works after the
esbuild ESM bundle (the build banner's global `require` is not needed). Do **not** add
an `npx` fallback — it just re-introduces the offline failure; prefer fail-fast with a
clear module-resolution error.
