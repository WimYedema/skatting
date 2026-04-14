# Skatting — UX Review (Role-Based)

Reviewed against [USER-JOURNEYS.md](USER-JOURNEYS.md) from the perspective of each role, with no knowledge of the code — purely what a user would experience.

---

## PO / Creator Perspective

*I'm a PO. I've just been told my team is switching to Skatting for sprint estimation. I've never used it before.*

### First session — what do I do?

I open the app. Lobby is clear — I enter my name, click "+ New Session". A room code appears with a unit picker. Fine so far. I pick "points", click Start.

**Now what?** I'm staring at a canvas with a blob already on it and some Fibonacci numbers along the bottom. Nobody told me what this thing is. There's an effort axis and a certainty axis with quirky labels ("don't ask me…"), but I don't know what the blob represents, why it changes shape, or what I should do with it. The document acknowledges this (Onboarding GAP) — it's real and it would stop me cold on first use.

I probably came here to import a backlog, so I look for that. "📋 Import CSV" is in the header — found it. I upload my CSV. Sidebar appears with tickets. Good.

### Prepping asynchronously

The document says I should share the room code on Slack. That's fine — but **how do I find the room code once I'm inside the session?** §8.3 says there's a badge in the header I can click to copy. That's discoverable only if I notice it. Would be easy to miss on first use.

I prep my own estimates. I click through tickets and position my blob. The document warns me that clicking "Next issue →" without moving the blob saves a default estimate — good to know, but **would I know this in the app?** Probably not. I'd expect "Next" to skip an unestimated ticket, not silently save a wrong answer.

Days pass. My team has been prepping. **Are they done?** I have no idea. The document says there's no prep-done signalling (GAP) — so I ask on Slack "has everyone finished?" and hope for the best. This is the biggest friction point in the async workflow. I have no visibility at all.

### Running the meeting

I click "Start meeting" and we're in meeting mode. The first ticket comes up. Everyone places their blob. Ready dots light up. Reveal happens automatically — nice.

The combined estimate appears. Someone's blob is way off. We discuss on our call. They adjust. Good — the combined estimate updates live.

I click "Next →" — verdict saved, next ticket. Smooth.

**But then**: halfway through the backlog, someone says "actually, I think we got ticket #3 wrong — we forgot about the API dependency." **Can I go back?** The document says sort-of: I can click a previous ticket from the sidebar after the summary screen. But the old verdict stays in history alongside the new one. Messy. This would frustrate me as a facilitator.

### Exporting

After the last ticket, summary appears. Export works. Clean.

### Things I'd find confusing or frustrating

1. **No onboarding** — the first 60 seconds would be bewildering
2. **No prep visibility** — I'm flying blind on whether the team is ready to meet
3. **Can't undo a verdict cleanly** — the "partial workaround" feels like a bug
4. **Re-importing CSV is destructive** — the caution is warranted. If I export my Jira board again because I added a ticket, I'd wipe everyone's prep. Dangerous.
5. **Can't change the unit** — if I pick "days" and the team expects "points", I'd have to start over
6. **Can't skip prep** — sometimes I want to import a backlog and estimate live. Being forced into prep mode for a 5-ticket backlog feels heavy
7. **One-way meeting transition** — if I click "Start meeting" accidentally or prematurely, there's no undo

### Things that work well

- The async prep flow over days is exactly what I need for a distributed team
- Room code sharing is simple
- The sidebar tracks progress
- Export covers all the columns I'd need
- Rejoin with creator role preserved (exact name match) is sensible

---

## Participant Perspective

*I'm a developer on the team. The PO posts a room code on Slack: "ba-ki-tu — sprint 14 estimation, prep by Thursday."*

### Joining

I open the app, enter my name, click "Join by Code", paste the code, click Join. Something happens — the canvas appears, there's a sidebar with tickets. A blob is already on the canvas.

**What am I supposed to do?** No one explained the blob. I see axis labels — numbers on the bottom, strange phrases on the left ("gut feeling"?). The document says there's no onboarding (GAP). I'd probably poke around, drag the blob, and figure it out by trial and error. Or I'd Slack the PO: "what is this?"

### Prepping

Once I figure out the blob, I work through tickets. Select one, drag blob, click "Next issue →". My estimate is saved locally. Progress dots appear in the sidebar.

**Wait — I skipped ticket #4 because I didn't understand it.** I clicked "Next" without moving the blob. According to the document, it saved the default position as my estimate. **I didn't know that.** Now I have a bogus estimate on a ticket I wanted to skip. There's no "clear estimate" or "skip" — I'd have to go back and re-drag it to something intentional, but even then I can't mark it as "I don't know."

I finish prepping. **How do I tell the PO I'm done?** I can't. No done button. I post on Slack: "done." The document confirms this gap.

### The meeting

Thursday arrives. PO clicks "Start meeting." My blobs start at my prep positions — nice, I don't lose my work.

Creator navigates to ticket #1. My pre-estimate appears. I adjust slightly. I click "Ready ✓". The ready count shows 3/5 ready. We wait for the last two people. One of them is AFK.

**Can I force-reveal?** Yes — any participant can click "Reveal anyway." Useful but a bit aggressive — what if the AFK person comes back in 30 seconds? There's no "ping" or gentle nudge. You either wait or nuke the round.

Ticket #4 comes up — the one I don't understand. I don't want to estimate it. **Can I abstain?** No. I either put a blob somewhere and lie, or I stay "not ready" and block everyone. The document says someone can "Reveal anyway" to skip me — but that skips *all* non-ready people, not just me. If two people are still estimating and I want to abstain, forcing reveal screws them too.

### After reveal

Blobs appear. I see the combined estimate. We discuss. Someone says "that's way too high." They adjust their blob — combined estimate updates. Good.

But we realise we fundamentally misunderstood the ticket. We want to re-estimate from scratch — re-hide blobs, re-ready. **Can't do that.** We just adjust and move on. Feels unsatisfying.

### Tab crash

My browser crashes mid-meeting. I panic — did I lose everything? I reopen, click the room card on the lobby. I rejoin. My prep estimates are restored. Good. But I missed whatever the team estimated while I was disconnected. The document mentions this in §1.2 — late joiners only see future rounds.

### Things I'd find confusing or frustrating

1. **No onboarding** — first 2 minutes are "what is this blob thing?"
2. **Silent default estimates** — "Next" shouldn't save a ghost estimate for tickets I didn't touch
3. **No abstain option** — I'm forced to estimate everything or block the team
4. **No "I'm done prepping" signal** — the PO has to chase me on Slack
5. **Name must match exactly to rejoin as same person** — if I accidentally capitalise differently, I become a fresh participant. Subtle and unforgiving
6. **Can't see what happened before I joined** — if I join mid-meeting, past verdicts are invisible to me

### Things that work well

- Joining is fast and friction-free
- Prep is truly async — I can do it at my own pace over days
- Pre-estimates carry over to meeting mode — no rework
- Tab crash recovery is seamless from local storage
- Touch works — I can prep on my phone during commute
- The 2D estimation (once understood) is more expressive than a Fibonacci dropdown — I can express both effort and confidence in one gesture

---

## Priority Summary

Both roles face the same top friction points:

| Priority | Gap | Impact |
|---|---|---|
| 1 | **Onboarding** | Both roles confused on first use — the core canvas mechanic is unexplained |
| 2 | **Prep-done signalling** | PO blind, participants frustrated — core async workflow has no feedback loop |
| 3 | **Silent default estimates** | Participants accidentally save bogus estimates when skipping tickets |
| 4 | **Abstain / skip** | Participants forced to estimate or block the team — no graceful opt-out |
| 5 | **Revisit verdict** | No clean way to redo a ticket — old verdict lingers alongside the new one |
| 6 | **Skip prep option** | PO forced into async prep even for short live-estimation sessions |
