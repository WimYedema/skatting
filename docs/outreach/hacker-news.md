# Hacker News — Show HN draft

Post at: https://news.ycombinator.com/submit

**Best time:** Weekday (Tue–Thu), 8–10am US Eastern time.

---

## Title

```
Show HN: Skatting – serverless 2D planning poker with log-normal blobs, no server
```

(HN titles must not be marketing copy. "Show HN:" prefix is required for projects you built.)

---

## Body / first comment (post this as your own first comment immediately after submitting)

HN strips links from the submission body, but you can elaborate in a comment.
Post this within 60 seconds of submission to get it pinned as the first comment:

```
I built this because planning poker always bugged me: a "5" from someone who's done 
the exact task before looks identical to a "5" from someone who's never touched this 
part of the codebase. All signal about uncertainty is discarded.

Skatting replaces cards with a 2D canvas:
- Horizontal position = effort estimate (continuous, log-scale, Fibonacci marks for 
  reference but you can land anywhere between them)
- Vertical position = certainty (converts to σ of a log-normal distribution, 
  inversely: higher = narrower blob)

The blob shape is the PDF of LogNormal(μ, σ²) scaled to constant visual area. 
Moving up makes it tall and narrow ("I know this cold"). Moving down makes it short 
and wide ("could be anything"). The right tail extends further than the left — 
because "takes 3× longer" is more realistic than "takes ⅓ the time".

When everyone's ready, blobs are revealed simultaneously to prevent anchoring bias. 
The combined distribution is computed by summing the individual log-normals and 
finding the composite mode, P10, and P90.

The whole thing is serverless:
- WebRTC via Trystero (Nostr relays + MQTT for signaling) for direct peer connections
- AES-256-GCM encrypted Nostr relay (kind 25078 ephemeral events) as a fallback for 
  corporate firewalls that block WebRTC
- Room state persisted via replaceable Nostr events (kind 30078/30079)
- Deployed as a single static HTML file on GitHub Pages

No account, no server, no estimation data touches any backend.

Happy to discuss the math, the P2P architecture, or why Svelte 5 runes made the 
canvas reactivity surprisingly clean.

Source: https://github.com/WimYedema/skatting
```

---

## Things to watch for on launch day

- **Respond quickly** to early comments — HN ranks posts partly by engagement velocity
- The questions likely to come up:
  - *"How does this handle > 10 people?"* → WebRTC mesh degrades above ~10–15 peers; 
    this is a deliberate scope constraint (same as a typical scrum team)
  - *"Why Nostr and not [X]?"* → Nostr relays are public, free, and require no accounts; 
    MQTT as second strategy ensures fallback; encrypted relay events as third strategy 
    handle WebRTC-blocked networks
  - *"Why log-normal?"* → Software effort distributions are empirically right-skewed; 
    bounded at zero; log-normal is the standard model (reference: McConnell's 
    "Software Estimation" if challenged)
