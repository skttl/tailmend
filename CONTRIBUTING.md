# Contributing

Use Node.js 22 or later and npm. There is no build step.

```sh
npm ci
npm test
npm run check:package
```

Integration checks create fixtures under `node_modules/.cache`. The package check creates a temporary project, installs the packed package with Tailwind CSS 4 from npm, and removes that project after the check. It requires network access.

## Code map

- `cli.mjs`: argument handling, file selection, normalization and writes.
- `razor.mjs`: static attribute extraction and replacement.
- `server.mjs`: official Tailwind language server lifecycle and requests.
- `self-check.mjs`: executable integration assertions.
- `scripts/check-package.mjs`: published-file assertions and installed CLI smoke check.

Keep changes focused. Parser changes should include a regression fixture, especially for syntax that must be skipped or rejected. Preserve surrounding markup and error handling. Do not resolve distinct conflicting classes by deleting one automatically.

CI runs checks on Linux and Windows with Node.js 22 and 24. Keep `package-lock.json` in sync with `package.json`. The npm package uses a `files` allowlist; add any new runtime file there and update the package check.

Report bugs with the command, Node/Tailwind versions, exit code and a minimal view/CSS example. Remove credentials and application data before sharing examples.

See [releasing](docs/releasing.md) for maintainer instructions.
