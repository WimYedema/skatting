# AlternativeTo submission draft

Submit at: https://alternativeto.net/software/add/

---

## App name

```
Skatting
```

## Website

```
https://wimyedema.github.io/skatting/
```

## Short description (shown in listings — keep under ~200 chars)

```
Serverless 2D planning poker for agile teams. Drag a blob to express effort + certainty simultaneously. P2P via WebRTC, no signup, no server, fully open source.
```

## Full description

```
Skatting replaces discrete planning poker cards with a two-dimensional continuous 
input. Instead of picking a number, each team member drags a "blob" on a canvas:

- Left–right = effort estimate (log scale, Fibonacci reference marks)
- Up–down = certainty (high = tall narrow blob, low = short wide blob)

The blob's shape is a log-normal probability density function — the same 
distribution that governs real software effort: bounded at zero, right-skewed, 
with a long tail for overruns.

When everyone is ready, all estimates are revealed simultaneously (like planning 
poker) to prevent anchoring bias. The app computes a combined distribution showing 
the team's consensus or disagreement visually.

Key features:
- Fully serverless — peers connect directly via WebRTC
- Triple-transport reliability: Nostr signaling + MQTT signaling + encrypted Nostr 
  relay fallback (works even behind corporate firewalls)
- CSV/Excel backlog import/export
- Async prep mode — team members can pre-estimate before the meeting
- No account, no server, no data leaves your browser
- Single static HTML file — self-hostable anywhere
- Open source (MIT)
```

## Alternatives to list (add Skatting as an alternative to these)

Search for each and click "suggest alternative":
- **Planning Poker Online** (planningpokeronline.com)
- **Pointing Poker** (pointingpoker.com)
- **PlanITPoker** (planitpoker.com)
- **Scrum Poker Online** (scrumpoker-online.org)

## Categories to select

- Project Management
- Agile
- Developer Tools
- Team Collaboration

## Platforms

- Web

## License

- Open Source — MIT

## Tags / keywords to add

```
agile, scrum, planning-poker, estimation, webrtc, nostr, serverless, p2p, open-source
```
