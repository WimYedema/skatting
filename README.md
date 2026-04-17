# Skatting — 2D Continuous Estimation for Agile Teams

A real-time, peer-to-peer estimation tool that replaces discrete planning poker with **two-dimensional continuous input**. Users position a log-normal "blob" on a plane where X = effort and Y = certainty — capturing both the estimate and confidence in a single gesture.

**Fully serverless** — peers connect directly via WebRTC, signaled through Nostr relays and MQTT. Deployed as a single static HTML file.

## Why?

Traditional planning poker forces discrete values (1, 2, 3, 5, 8…) and ignores uncertainty. Skatting lets estimators express:

- **How big** they think the work is (horizontal position)
- **How sure** they are (vertical position — which controls the blob's spread)

The blob shape follows a log-normal distribution, reflecting how software estimates actually behave: bounded at zero, right-skewed, with a long tail.

## Quick Start

```bash
npm install
npm run dev
```

Open the displayed URL, create a room, and share the link with your team.

## Demo

Visit the [live deployment](https://wimyedema.github.io/skatting/) — no sign-up required.

## Tech Stack

| Layer | Tool |
|---|---|
| Language | TypeScript (strict) |
| UI | Svelte 5 (runes) |
| Canvas | Canvas 2D API |
| P2P | Trystero (WebRTC via Nostr + MQTT) + Nostr relay fallback |
| Build | Vite → single HTML file |
| Lint | Biome |
| Tests | Vitest |

## Development

```bash
npm run dev          # dev server
npm run build        # production build (single HTML file)
npm run check        # type checking (svelte-check + tsc)
npm run lint         # biome check
npm run test         # run tests
```

## How It Works

1. One person creates a room and shares the link
2. Each participant drags their blob to express effort + certainty
3. When everyone is ready, estimates are revealed simultaneously
4. A combined distribution shows the team's consensus (or disagreement)

All communication is peer-to-peer — no estimation data touches a server.

## Architecture

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions, [PROTOCOL.md](docs/PROTOCOL.md) for the P2P protocol, and [PRODUCT.md](docs/PRODUCT.md) for the full product spec.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © Wim Yedema
