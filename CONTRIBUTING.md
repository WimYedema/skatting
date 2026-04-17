# Contributing to Skatting

Thanks for your interest in contributing! This project is a peer-to-peer estimation tool built with Svelte 5 and TypeScript.

## Getting Started

```bash
git clone git@github.com:WimYedema/skatting.git
cd skatting
npm install
npm run dev
```

## Development Workflow

1. Fork the repo and create a feature branch from `master`
2. Make your changes
3. Ensure all checks pass:
   ```bash
   npm run check    # type checking
   npm run lint     # biome
   npm run test     # vitest
   npm run build    # production build
   ```
4. Open a pull request

## Code Style

- **TypeScript strict mode** — no `any`, no `@ts-ignore`
- **Svelte 5 runes** — `$state`, `$derived`, `$effect` only (no legacy reactive statements)
- **Biome** for formatting and linting — run `npm run lint:fix` to auto-fix
- **Named exports** only, no default exports
- **kebab-case** for `.ts` files, **PascalCase** for `.svelte` components
- Tests colocated next to source files (`*.test.ts`)

## Architecture Notes

- All session state lives in a single `$state` object in `App.svelte`
- Canvas drawing goes through the `canvas.ts` facade — components never call Canvas 2D API directly
- P2P transport is in `peer.ts` — triple-strategy (WebRTC/Nostr + WebRTC/MQTT + Nostr relay)
- See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details

## Reporting Issues

- Use GitHub Issues
- Include browser, OS, and steps to reproduce
- For P2P connectivity issues, include the output from the built-in connectivity diagnostics

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.
