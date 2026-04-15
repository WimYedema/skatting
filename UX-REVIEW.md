# Skatting — UX Review (Role-Based)

Reviewed against [USER-JOURNEYS.md](USER-JOURNEYS.md) from the perspective of each role, with no knowledge of the code — purely what a user would experience.

---

## PO / Creator Perspective

*I'm a PO. My team is switching to Skatting for sprint estimation. I've never used it before.*

### First session — what do I do?

I open the app. Lobby is clear — I enter my name, click "+ New Session". A room code appears with a unit picker. Fine so far. I pick "points", click Start.

A friendly welcome card pops up: "Hey Alice! First time here?" with a diagram showing narrow blobs vs. wide blobs, and effort vs. certainty axes. This immediately tells me what the 2D plane means. I click "Quick tour" and get three spotlight steps — canvas, ready button, room code. **After 20 seconds I understand the core mechanic.** Good first impression.

I import my CSV. Sidebar appears. I'm in prep mode. I can start prepping or click "Start meeting" right away if I don't need async prep — nice that it doesn't force me through a long prep flow for a 5-ticket backlog.

### Prepping asynchronously

I share the room code on Slack. The code is in a badge in the header — I click it and it copies. Easy, though I had to notice the badge first. The tour pointed it out, so no problem.

I prep my own estimates. Click through tickets, drag the blob, next. On ticket #4 I don't understand the requirement — I click "No idea 🤷" and skip it cleanly. A hatched "?" appears where my blob was. Good — I didn't have to fake an estimate.

Days pass. My team has been prepping. The participant strip shows "Bob (12)", "Carol (8)" — prep-done signals telling me who finished and how many tickets they covered. **I know exactly who's ready without asking on Slack.** This alone saves a day of coordination overhead.

### Running the meeting

I click "Start meeting". Everyone's online. First ticket comes up. Blobs are at pre-estimated positions. Ready dots light up. Auto-reveal. Combined estimate appears — "call it 8". Someone's blob is way off. We discuss, they adjust. Combined updates live.

Halfway through, someone says "ticket #3 was wrong — we forgot the API dependency." I click ticket #3 in the sidebar. Everyone's round resets. I click "Re-estimate ↺" — blobs re-hide but stay at their old positions. The team adjusts and re-votes. The new verdict **overwrites** the old one cleanly. No ghost duplicates in history or the export. This is exactly the flow I needed.

On ticket #7, the intern says they have no idea about the backend work. They click "No idea 🤷" — their blob disappears, they're excluded from the combined estimate, and the rest of us proceed without being blocked. Clean.

After ticket #15, I realise we should have done one more prep pass on the remaining tickets. I click "Back to prep" — everyone's back in async mode. We reconvene tomorrow and start the meeting again. **No one lost any work.**

### Exporting

Last ticket done, summary appears. Export works. All columns present including P10/P90.

### Things that work well

- Onboarding tour gets first-timers productive in seconds
- Prep-done signals eliminate the Slack coordination tax
- Abstain lets people opt out gracefully without blocking anyone
- Re-estimate and revisit are clean — overwrite, no duplicates
- "Back to prep" is a safety net for premature "Start meeting"
- Merge import means I can add tickets without wiping prep work
- The unit locks after first estimate — prevents mid-session confusion
- Touch works — I demoed it on my iPad during the sprint review

### Things I'd still find confusing or frustrating

1. **Silent default estimates** — clicking "Next issue →" without moving the blob still saves the default position as my estimate. There's no visual warning. "No idea 🤷" exists now, but you have to *know* to use it — if you just absentmindedly click "Next" you get a ghost estimate. A subtle hint ("you haven't moved your blob — save anyway?") would help
2. **Name must match exactly to rejoin as creator** — if I accidentally capitalise differently, I lose my creator role. This is unforgiving and not obvious. A case-insensitive match or a "rejoin as creator" confirmation would be safer
3. **No "ping" for AFK participants** — when someone's not ready, the only option is "Reveal anyway" which skips *everyone* who's not ready. There's no gentle nudge or per-person skip
4. **Late joiners miss past verdicts** — if someone joins mid-meeting, they see only future rounds. Past verdicts are invisible to them. A brief catch-up summary or at least the backlog sidebar showing completed tickets with verdicts would help
5. **Room code discoverability** — the room badge is subtle. If you skip the onboarding tour, you might not realise you can click it to copy. A "Share" button or a more prominent display the first time would help
6. **CSV-only import** — no support for pasting a list of ticket titles directly. For teams without a CSV export from their issue tracker, creating a CSV just for Skatting is friction

---

## Participant Perspective

*I'm a developer on the team. The PO posts a room code on Slack: "bakituzo — sprint 14 estimation, prep by Thursday."*

### Joining

I open the app, enter my name, click "Join by Code", paste the code, click Join. A spinner says "Looking for session…" — so I know something's happening. The canvas appears, sidebar has tickets.

First time? A welcome card explains the blob concept with a diagram — narrow means certain, wide means unsure. I take the 3-step tour. **I understand the mechanic without asking the PO.** Much better than staring at a blank canvas wondering what to do.

### Prepping

I work through tickets. Drag blob, next. On ticket #4 (unfamiliar domain), I click "No idea 🤷" — the "?" appears, I'm marked as abstained, and I move on without faking an estimate. The sidebar shows `●` for prepped tickets and nothing for abstained ones, so I can see my progress.

I finish and click "Finish ✓" on the last ticket. My name appears in the prep-done strip. I close the tab and go about my day.

### The meeting

Thursday arrives. PO clicks "Start meeting." My pre-estimates load automatically — I'm not starting from scratch.

Ticket #1 comes up. I adjust slightly and hit "Ready ✓". The ready count shows 4/5. One person is AFK. After 30 seconds someone clicks "Reveal anyway" — the AFK person is excluded, not me. The combined estimate appears with nice annotations ("~8 points most likely, 5–13 80% range, call it 8").

Ticket #7 — the backend one I don't understand. I click "No idea 🤷". My blob disappears, a sketchy "?" appears, and 🤷 shows next to my name. The team proceeds without me blocking. When the next ticket comes up, my abstain is cleared and I'm back to normal.

After reveal on ticket #10, the team realises we misunderstood the requirement. The PO clicks "Re-estimate ↺" — blobs hide, my blob stays where I put it. I adjust and re-ready. Much better than just silently tweaking after reveal.

### Tab crash

My browser crashes. I reopen, click the room card on the lobby. Brief "Looking for session…" spinner. I rejoin. My prep estimates are restored. I land on the current ticket. I missed a few rounds, but the backlog sidebar shows which tickets have verdicts (✓).

### Things that work well

- Onboarding tour means I'm productive immediately
- Prep is truly async — I did half on my phone during commute
- "No idea 🤷" is a dignified way to abstain without blocking anyone
- Pre-estimates carry over to meeting mode — no rework
- Tab crash recovery is seamless
- The 2D estimation is more expressive than a Fibonacci dropdown — I can express "this is medium effort but I really don't know" in one gesture
- Connecting spinner tells me something's happening (no blank stare)
- Combined estimate annotations are clear — median, range, and snapped verdict

### Things I'd still find confusing or frustrating

1. **Silent default estimates** — same issue as the PO perspective. I clicked "Next" once without thinking and got a default-position estimate on a ticket I meant to skip. "No idea 🤷" is the intended path, but it's not obvious that "Next" saves a non-estimate
2. **Name sensitivity on rejoin** — I joined as "alice" from my phone and "Alice" from my laptop. Now there are two of me in the session. The app doesn't warn about this
3. **Can't see what happened before I joined** — I joined 10 minutes late and missed 3 tickets. The sidebar shows "✓" with verdict numbers, which helps, but I can't see the actual blob distributions or who estimated what. A quick "you missed N rounds" indicator would orient me
4. **"Reveal anyway" is a blunt tool** — it skips everyone who isn't ready, not just one person. If two people are still actively estimating and one person is AFK, forcing reveal hurts the active estimators. Per-person skip or a timeout nudge would be better
5. **Tour assumes Ready button is visible** — the spotlight tour points at the Ready button, but in prep mode there is no Ready button. Step 2 highlights nothing. Minor, but confusing on first use with a backlog
6. **No undo for abstain** — once I click "No idea 🤷", the only way back is to drag on the canvas. There's no explicit "I changed my mind" button. Discoverable by accident, but not obvious
7. **Backlog sidebar collapses on mobile** — fine for phones, but on tablets the 260px sidebar eats into the canvas. The toggle is easy to miss when collapsed to 40px

---

## The Planning Poker Loyalist

*I'm a senior dev. We've been doing Planning Poker with Fibonacci cards for three years — it works. Now the PO wants us to try Skatting because "it captures uncertainty." I'm skeptical.*

### The blob: is this better than a number?

In poker, I hold up an 8 and everyone knows what 8 means. Done. Here I'm dragging an amorphous blob around a 2D plane. Two axes instead of one. The onboarding card shows a diagram — narrow blob = certain, wide blob = uncertain. Fine, I get the concept. But **do I need two dimensions?** When I say "8" in poker, the discussion afterwards is where uncertainty surfaces. "I said 8 but I'm not confident — the API is new to me." That's a conversation, not a widget.

The blob adds information, sure. But it also adds cognitive load. Every ticket I now have to think: *how much effort* AND *how confident am I about that effort*. In poker I just think: *how big is this*. The discussion round handles the rest. I'm not convinced the second dimension earns its keep.

### Anchoring — is it better or worse?

Poker hides cards until all are revealed simultaneously. That prevents anchoring. Skatting hides blobs behind "Ready" — same principle. So far, equal.

But then after reveal, **blobs are visible and adjustable in real time**. The combined estimate updates live. In practice, this means the loudest voice says "that's too high" and I watch three people silently drag their blobs toward the senior's number. In poker, if we disagree, we *talk* and then re-vote blind. Here, the social pressure is visible — I can literally see the blobs converging toward one person's position. "Re-estimate ↺" exists, which re-hides blobs — but **the PO has to know to click it**. The default path (adjust-after-reveal) is the anchoring-prone one.

This is my biggest concern. The tool's default interaction pattern encourages groupthink. Poker's default pattern discourages it.

### The async prep — do I actually want this?

The PO loves async prep. I understand why — it frontloads thinking. But in my experience, **the value of estimation is the conversation, not the number**. When I prep a ticket alone on my phone on Tuesday, I'm estimating in a vacuum. I don't hear that the backend team already built a similar feature last sprint. I don't learn that the API has rate limits. Those things come out in discussion.

Prep means I walk into the meeting with an anchored position I already committed to. Changing my mind now feels like admitting I was wrong. In poker, I haven't committed to anything before the card flip.

That said — for a 40-ticket backlog, I *don't* want to sit in a meeting estimating all 40 live. For large backlogs, async prep is genuinely useful. For 10-ticket sprints? It adds a coordination ceremony (share code, prep, signal done, reconvene) that poker doesn't have.

### The meeting itself

We're estimating live. I position my blob, click "Ready ✓". The auto-reveal when everyone's ready is smooth — equivalent to the "3, 2, 1, flip" in poker. No complaints there.

Combined estimate appears: "~8 points most likely, 5–13 80% range, call it 8." The range is interesting — poker doesn't give me that. I see the P10/P90 spread and the agreement level. **This is genuinely more information than poker produces.** Credit where it's due.

But the "call it 8" verdict is still Fibonacci-snapped, which means I'm getting a poker number at the end anyway. The journey is more complex, but the destination is the same. I could have held up an 8 card in five seconds.

### The export

The CSV export has median, P10, P90, and the snapped verdict per ticket. Poker gives me one number per ticket. The extra columns are useful for capacity planning — if I care about the confidence interval, it's there. **First time this tool has given me something poker genuinely can't.**

### What I'd tell the PO

Skatting does three things better than poker:
1. **Confidence intervals** — the P10/P90 range is real information that poker discards
2. **Large backlogs** — async prep is worth it above ~15 tickets
3. **Abstain** — "No idea 🤷" is cleaner than awkwardly holding up a "?" card (which most poker decks don't have)

But it does two things worse:
1. **Post-reveal adjustment is anchoring-prone** — the default flow lets people converge visually without re-voting blind. "Re-estimate" exists but isn't the default path
2. **Higher cognitive overhead** — two axes, blob shape, drag vs. click. For straightforward tickets, a card is faster

And one thing is a wash:
- **Discussion quality** — poker forces a discussion round after divergent votes. Skatting shows divergence visually (spread-out blobs), but doesn't *prompt* discussion. Whether the team actually talks depends on the facilitator either way.

**My recommendation**: use Skatting for large backlogs and discovery work where uncertainty matters. Use poker for sprint-sized backlogs where speed matters more than precision.

---

## The Scrum Master

*I facilitate estimation for three teams. One team just adopted Skatting. I care about process hygiene, psychological safety, and whether the tool helps or hinders good estimation conversations.*

### Facilitation control — who runs this meeting?

In poker, I control the flow: I read the ticket, open discussion, call for cards, facilitate the outlier conversation. In Skatting, the **creator** controls the flow — they navigate tickets, start the meeting, trigger re-estimates. If the PO is the creator, they're simultaneously facilitating *and* being a stakeholder. That's a role conflict.

Can I, the Scrum Master, be the creator instead? Yes — I can create the session and import the backlog. But then the PO can't change units or re-import tickets. **The creator role bundles too many permissions.** I want to facilitate the flow while the PO manages the backlog. Right now, one person has to do both.

### Psychological safety — does the tool help?

**Blobs are anonymous before reveal.** Check — same as hidden cards. Good.

**After reveal, blobs are labelled and visible.** In poker, cards are face-up but everyone has the same Fibonacci options — the outlier holds an 8 among 3s. Visible, but discrete. In Skatting, the outlier's blob is *spatially isolated* from the cluster, with their name on it. The visual separation is more dramatic than a card value mismatch. On a healthy team, this is fine — it starts a conversation. On a dysfunctional team, it's a spotlight on the person who disagrees. **The tool amplifies both good and bad team dynamics.**

**Post-reveal adjustment is visible in real time.** I watch someone drag their blob after a senior dev comments "that's too low." This is the opposite of psychological safety — it's visible capitulation. In poker, the re-vote is blind. In Skatting, "Re-estimate ↺" exists but the facilitator has to actively choose it. The easy path (just let people adjust openly) is the unsafe path.

I'd want "Re-estimate ↺" to be the **default** after divergent reveals — or at least prominently suggested. Right now it's a button the creator has to know about and choose to click.

### The "No idea 🤷" button — this is excellent

In poker, abstaining is socially awkward. You either hold up a "?" card (embarrassing in front of seniors) or you throw out a number you don't believe (dishonest). Skatting's "No idea 🤷" is **private until reveal** — you click it quietly, a hatched "?" appears at reveal alongside everyone else's blobs. The team sees you abstained, but you weren't singled out in real time.

This is the single best facilitation feature in the tool. It normalises not-knowing in a way poker never achieved in my three years of running sessions.

### Convergence patterns — can I read the room?

In poker, I see five cards. If they're 3, 3, 5, 5, 13 — I know instantly: two camps plus one outlier. Time for discussion.

In Skatting, I see five blobs on a 2D plane. Some overlap, some don't. Some are wide, some narrow. **The pattern is richer but harder to parse at a glance.** I can see that three people clustered around effort=8/certainty=medium and two people are higher effort with low confidence. That's more than poker gives me. But it takes 5 seconds instead of 1 second.

The combined estimate annotation helps: "~8 points most likely, 5–13 80% range." If the range is wide, I know we disagree. If it's narrow, we converge. That's my signal to facilitate or move on. **The annotations do the parsing for me** — as long as I know to read them.

### Timer / discussion prompts — missing

Poker apps (PlanIT, etc.) often have a built-in discussion timer and "highest/lowest, explain your reasoning" prompts. Skatting has neither. After reveal, the tool goes quiet. It's up to me to say "Dave, you're the high blob — what are you seeing?" The tool could prompt this: "Blobs are spread — outliers, explain your thinking?"

This is a facilitation gap. The tool supports estimation mechanics well, but doesn't scaffold the *conversation* that makes estimation valuable.

### History and accountability

The export has verdicts per ticket with P10/P90. Good for velocity tracking. But **I can't see per-person estimates in the export** — only the combined result. In some teams, I want to track estimation accuracy per person over time ("Alice consistently underestimates backend work"). The data exists in the session — the blobs were there — but it doesn't survive the export.

Not a dealbreaker, but a missed opportunity. Poker apps that log individual votes per round give me this for free.

### My assessment for the three teams

**Team A (experienced, high trust, 10-ticket sprints):** Stick with poker. Faster, simpler, the team already knows when to discuss. Skatting's extra dimensions don't add enough value for small backlogs on a mature team.

**Team B (new team, 30-ticket backlog, mixed experience levels):** Switch to Skatting. Async prep handles the large backlog. "No idea 🤷" protects junior devs. P10/P90 ranges surface the uncertainty that poker hides behind a single Fibonacci number.

**Team C (remote, multiple time zones, trust issues):** Skatting with caution. The async prep fits the distributed workflow. But the post-reveal adjustment pattern worries me — I'd need to use "Re-estimate ↺" aggressively and train the team not to visibly adjust. The tool's default path is the wrong one for this team.

### What I'd change

1. **Separate facilitator and backlog-owner roles** — let the SM control flow while the PO manages tickets
2. **Auto-suggest re-estimate on high divergence** — if the blob spread exceeds a threshold after reveal, prompt "Blobs show disagreement — re-estimate blind?"
3. **Discussion timer** — optional countdown after reveal with "outlier, explain" prompt
4. **Per-person estimates in export** — at least as an opt-in column, for retrospective accuracy tracking
5. **Post-reveal adjustment should be opt-in, not default** — or at minimum, log whether someone moved their blob after seeing others

---

## What's Been Fixed Since Last Review

The previous UX review identified 6 priority gaps. Here's where each stands:

| # | Gap | Status | How It Was Addressed |
|---|---|---|---|
| 1 | Onboarding | ✅ Fixed | Welcome card + 3-step spotlight tour, "?" button to reopen |
| 2 | Prep-done signalling | ✅ Fixed | "Finish ✓" publishes via Nostr relays; visible in participant strip even offline |
| 3 | Silent default estimates | ⚠️ Improved | "No idea 🤷" provides an explicit abstain — but "Next" still saves the default blob silently |
| 4 | Abstain / skip | ✅ Fixed | "No idea 🤷" button, hatched "?" display, excluded from combined estimate, per-ticket persistence |
| 5 | Revisit verdict | ✅ Fixed | Click any ticket in sidebar → re-estimate → verdict overwritten cleanly |
| 6 | Skip prep option | ✅ Fixed | Creator can click "Start meeting" immediately after import |

**Additional improvements since last review:**
- Re-estimate round ("Re-estimate ↺") lets the team redo a vote without losing blob positions
- "Back to prep" reverses the meeting transition
- Re-import safety: merge/replace dialog prevents accidental backlog wipe
- Unit changeable until first estimate, then locked
- Connecting spinner during Nostr relay queries
- Peers' round state resets properly when creator navigates to a ticket

---

## Remaining Priority Summary

| Priority | Issue | Raised By | Impact | Suggested Fix |
|---|---|---|---|---|
| 1 | **Post-reveal adjustment is anchoring-prone** | Poker Loyalist, Scrum Master | Default path lets people visibly converge toward the loudest voice — undermines independent estimation | Auto-suggest "Re-estimate ↺" when blob spread is high; or make post-reveal blobs read-only by default |
| 2 | **Silent default estimates** | PO, Participant | Accidental bogus estimates when "Next" is clicked without moving blob | Prompt or visual cue before saving unmoved blob |
| 3 | **Creator role bundles too many permissions** | Scrum Master | Facilitator and backlog-owner are forced into one role — creates role conflict | Separate facilitator (flow control) from backlog-owner (import, unit) permissions |
| 4 | **Case-sensitive name matching** | PO, Participant | Creator role lost on capitalisation typo; duplicate identities | Case-insensitive match or confirmation dialog |
| 5 | **"Reveal anyway" is all-or-nothing** | Participant, Poker Loyalist | Skipping one AFK person forces reveal for everyone still estimating | Per-person timeout or selective skip |
| 6 | **No discussion scaffolding** | Scrum Master | After reveal the tool goes silent — no timer, no "outlier explain" prompt | Optional discussion timer and facilitation prompts after divergent reveals |
| 7 | **Late joiner context** | PO, Participant | Joining mid-meeting gives no sense of what happened before | "You missed N rounds" summary or history catch-up |
| 8 | **Tour step 2 in prep mode** | Participant | Spotlight points at non-existent Ready button | Conditional tour steps based on current mode |
| 9 | **No paste-a-list import** | PO | Teams without CSV tooling face friction creating a file | Accept plain text (one title per line) as backlog input |
