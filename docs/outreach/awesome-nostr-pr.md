# awesome-nostr PR draft

Repo: https://github.com/aljazceru/awesome-nostr

## Where to add it

Section: **Clients → Other**  
(This is the catch-all section for non-social-feed Nostr clients — connect4, Jester/chess,
Hivetalk/video calls, etc. Skatting fits here as a collaborative tool that uses Nostr for
P2P signaling and encrypted relay transport.)

## The line to add

Find alphabetically by "S" in the "Other" section and insert:

```markdown
- [Skatting](https://wimyedema.github.io/skatting/)[![stars](https://img.shields.io/github/stars/WimYedema/skatting.svg?style=social)](https://github.com/WimYedema/skatting) - Serverless 2D planning poker for agile teams. Express effort + certainty by dragging a log-normal blob on a 2D canvas. P2P via WebRTC (Nostr + MQTT signaling) with AES-256-GCM encrypted Nostr relay fallback. No signup, no server.
```

## PR title

```
Add Skatting — serverless 2D planning poker using Nostr signaling
```

## PR description

```
Skatting is an open-source, serverless team estimation tool that uses Nostr in two ways:

1. **WebRTC signaling** via Trystero (alongside MQTT) to establish direct peer connections
2. **Encrypted fallback relay** — AES-256-GCM encrypted ephemeral events (kind 25078) for clients where WebRTC is blocked by corporate firewalls

It also uses replaceable events (kind 30078/30079) to persist room state across sessions.

Live app: https://wimyedema.github.io/skatting/
Source: https://github.com/WimYedema/skatting
License: MIT
```

## Checklist before opening the PR

- [ ] Screenshot/OG image added to the repo (makes the PR more credible)
- [ ] Verify the live URL still resolves
- [ ] Fork aljazceru/awesome-nostr, edit README.md, open PR from your fork
