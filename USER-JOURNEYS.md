# Skatting — User Journeys

## Overview

Skatting is a real-time, peer-to-peer 2D estimation tool for agile teams. Users position a log-normal "blob" on a continuous plane where **X = effort** and **Y = certainty**. Sessions are fully serverless — peers connect via WebRTC.

Skatting has no built-in chat or voice — teams are expected to be on a separate call (video, Slack huddle, in person) while using the app. It works on desktop and mobile/tablet (touch supported).

### Roles

There are two roles, determined at session creation:

| | **Creator ("in charge")** | **Participant** |
|---|---|---|
| How you get the role | Click "+ New Session" | Click "Join by Code" or rejoin as non-creator |
| Choose estimation unit | ✓ (points or days) | Receives the creator's choice |
| Import CSV backlog | ✓ | Receives the backlog |
| Reorder / remove tickets | ✓ | Read-only |
| Navigate tickets in meeting mode | ✓ (peers follow) | Follows the creator |
| Navigate tickets in prep mode | ✓ | ✓ (independent) |
| Start meeting (end prep mode) | ✓ | — |
| Estimate and vote | ✓ | ✓ |
| Force-reveal before everyone is ready | ✓ | ✓ (anyone can) |
| Export results | ✓ | — |

Both roles estimate in exactly the same way — the creator just has additional facilitator controls.

### Phases

A session can follow two paths:

- **With a backlog** → the creator (typically the PO) imports a CSV and shares the room code. The session starts in **prep mode**, where each team member can asynchronously work through the backlog at their own pace — potentially over several days. When the team is ready to meet, the creator clicks "Start meeting" to transition to **meeting mode** (collaborative ready/reveal).
- **Without a backlog** → the session starts directly in **meeting mode**. The creator types a topic and the team estimates it together.

---

## 1. Starting a Session

### 1.1 Create a New Session

1. Open the app → land on the lobby screen
2. Enter your name
3. Click **"+ New Session"**
4. A random room code is generated from three 2-letter syllables (e.g. `ba-ki-tu`)
5. Choose the estimation unit: **points** or **days**
6. Click **"Start"** → enter the estimation canvas as **creator**

> **GAP: Change unit.** The estimation unit is locked at session creation. If the wrong unit is chosen, there is no way to change it without starting a new session.

The room code can be shared with teammates so they can join.

### 1.2 Join by Code

1. Open the app → lobby screen
2. Enter your name
3. Click **"Join by Code"**
4. Type or paste the room code
5. Click **"Join"** → enter as **participant**
6. Unit, backlog, and current state are automatically received from the creator

> **Note:** If you join mid-meeting (after "Start meeting"), you land on the current ticket and can estimate immediately. You will not see verdicts from earlier rounds — only future rounds.

### 1.3 Rejoin a Saved Session

1. Open the app → lobby shows recent room cards
2. Each card displays: room name/code, peer names, unit, last used date
3. Click a card → rejoin with your original role: if you were the creator **and use the exact same name** (case-sensitive), you rejoin as creator ("in charge"); otherwise you join as a regular participant
4. Previous backlog and personal pre-estimates are restored from local storage

> **Note:** Pre-estimates are stored in your browser's local storage. If you rejoin from a different device or a different browser, your personal prep estimates will not be available.

> **Note:** If two people join with the same name, the app treats them as separate peers (they get different colours), but the header will show duplicate names. Use distinct names to avoid confusion.

---

## 2. Creator: Setting Up the Session

### 2.1 Ad-Hoc Estimation (No Backlog)

1. After creating a session, you're in meeting mode with an empty canvas
2. Type a topic or paste a URL in the session name field — it syncs to all peers
3. Everyone estimates on the canvas (see §3 for canvas mechanics), then follows the ready/reveal flow (see §5)
4. After reveal and "Next →", the canvas resets — type the next topic and repeat

This is the simplest path — no CSV, no sidebar, no prep mode. The session continues indefinitely until someone leaves.

### 2.2 Importing a Backlog

> **GAP: Skip prep.** After importing a backlog the session always enters prep mode. There is no option to skip prep and go straight to meeting mode. This matters in two cases: (1) a short backlog where live estimation is faster, and (2) a mixed session where some tickets need async prep but a few urgent ones should be estimated live right away.

1. Click **"📋 Import CSV"** in the header
2. Select a `.csv` file with columns: `id`, `title`, and optionally `url`, `labels`, `assignee`, `description`
3. The backlog appears in the sidebar and is synced to all peers
4. Prep mode activates — the first ticket is selected

### 2.3 Managing the Backlog

1. Drag tickets in the sidebar to reorder priorities — peers see the updated order
2. Click × on a ticket to remove it
3. The sidebar shows progress: how many tickets are prepared or estimated

> **Caution:** Re-importing a CSV replaces the entire backlog. If the team has been prepping asynchronously over days, a re-import will wipe everyone's pre-estimates. Coordinate with the team before re-importing.

The PO is also a participant — don't forget to prep your own estimates while managing the backlog.

### 2.4 Starting the Meeting

1. When the scheduled estimation meeting begins and the team is on a call, click **"Start meeting"**
2. Prep mode ends for everyone — the current ticket and your estimate are synced
3. The team enters the collaborative ready/reveal flow

### 2.5 Leading the Meeting

1. Navigate tickets by clicking in the sidebar — all peers follow your selection
2. After each reveal, click **"Next →"** to record the verdict and advance
3. On the last ticket, the session summary appears

### 2.6 Exporting Results

1. Once tickets have estimates, export buttons appear at the bottom of the sidebar
2. Click **"CSV ↓"** or **"Excel ↓"** to download
3. Exported columns: id, title, median, P10, P90, unit, url, labels, assignee

---

## 3. The Canvas

This section covers the canvas mechanics — what you see and how blobs work. For the meeting flow that orchestrates estimation (ready → reveal → next), see §5.

### 3.1 Layout and Interaction

> **GAP: Onboarding.** First-time users land on the canvas with no explanation of what the 2D plane means, how blobs work, or what "certainty" represents. A brief contextual hint or interactive tutorial would reduce the learning curve significantly.

1. After entering a session, you see a canvas with an effort axis (horizontal, log-scale) and a certainty axis (vertical). A default blob is already placed at a moderate position — you don't start from scratch
2. The effort axis has Fibonacci reference marks (1, 2, 3, 5, 8, 13, 21, 34) but the scale is continuous — your blob can sit anywhere between marks
3. The certainty axis has descriptive labels: "don't ask me…", "gut feeling", "pretty sure", "I know this!"
4. Click or drag anywhere on the canvas to reposition your blob — works with mouse or touch
5. Drag left/right to change your effort estimate
6. Drag up/down to change your certainty — dragging up makes the blob taller and narrower (more confident), dragging down makes it wider and squatter (less sure)
7. The blob's area stays constant — only the shape changes

### 3.2 What You See

- **Before reveal:** only your own blob is visible — peer blobs are hidden to prevent anchoring bias
- **After reveal:** all blobs appear overlaid, each with a distinct colour and hatched fill. A **combined team estimate** shows as a dashed outline with the median and P10–P90 range labelled
- **History marks:** past verdicts from earlier rounds appear as faint × marks on the canvas for spatial context
- Hover over any blob to see whose estimate it is (tap on mobile)

---

## 4. Prep Mode — Asynchronous Pre-Estimation

Prep mode is designed for asynchronous use over days, not just a quick warm-up before the meeting. The PO imports a backlog and shares the room code; team members join at their own pace and work through the tickets independently — from home, between meetings, whenever suits them. When the team reconvenes for the estimation meeting, everyone already has a position on every ticket.

### 4.1 Entering Prep Mode

- The PO imports a CSV backlog → prep mode activates automatically
- The PO shares the room code with the team (e.g. via Slack or email)
- Team members join whenever they're ready — they don't need to be online at the same time
- Each joiner receives the full backlog and can start prepping immediately

> **Note:** If your browser tab crashes or you accidentally close it, your pre-estimates are safe in local storage. Rejoin the session from the lobby to continue where you left off. Your peers will see you leave and rejoin, but your prep work is preserved.

### 4.2 Working Through Tickets

1. Select a ticket from the sidebar (or let it auto-advance)
2. Position your blob to estimate effort and certainty
3. Click **"Next issue →"** to save and move to the next ticket
4. Your estimate is saved locally — it is **not** broadcast to peers
5. The sidebar tracks progress: `●` = has a local pre-estimate

> **Note:** If you click "Next issue →" without repositioning the blob, the default position is saved as your estimate for that ticket. Deliberately skip tickets you're not ready to estimate — select them from the sidebar later.

Everyone navigates independently — your position in the backlog doesn't affect others.

### 4.3 Ending Prep Mode

Only the creator can click **"Start meeting"** to transition everyone to meeting mode. At that moment:
- The current ticket and estimate are synced to all peers
- The team enters the collaborative ready/reveal flow

> **GAP: Prep-done signalling.** Participants have no way to signal "I'm done prepping". Since prep happens asynchronously over days, the PO has no visibility into who has finished — they'd have to ask on Slack or just pick a meeting date and hope. A done-indicator per peer (visible even when peers are offline) would let the PO know when the team is ready to meet.

> **GAP: Re-enter prep.** Once "Start meeting" is clicked the transition is one-way. If the team realises they need more prep time, there is no way to go back.

---

## 5. Meeting Mode — Ready / Reveal / Verdict

Meeting mode requires all participants to be online simultaneously — this is a live, synchronous flow.

### 5.1 Estimating Together

1. All participants see the same ticket (creator controls navigation)
2. Each person drags their blob — positions are broadcast to peers but blobs remain hidden until reveal
3. If you pre-estimated this ticket in prep mode, your blob starts at that position
4. When satisfied, click **"Ready ✓"**

> **GAP: Abstain / skip.** A participant may lack context for a ticket (e.g. unfamiliar domain). There is no formal way to abstain. **Workaround:** any participant can click "Reveal anyway" to proceed without everyone being ready — the non-ready person's blob is simply excluded from the combined estimate. But this is a blunt tool — it skips *all* non-ready participants, not just the one who wants to abstain.

### 5.2 Reveal

- When **everyone** is ready, estimates are revealed automatically
- If someone is unresponsive, any participant can click **"Reveal anyway"**
- All blobs appear overlaid, plus the combined team estimate
- You can still drag your blob after reveal — the combined estimate updates in real time
- Discuss disagreements on the call before moving on

> **GAP: Re-estimate round.** After reveal the team can silently adjust blobs, but there is no way to trigger a formal re-vote (re-hide blobs, reset ready states) when the discussion reveals a misunderstanding. The only option is to move on and hope post-reveal adjustments suffice.

### 5.3 Moving to the Next Round

After reveal, click **"Next →"** to:
- Record the verdict (median, P10, P90) on the current ticket
- Reset the round (all blobs cleared, ready states reset)
- Auto-advance to the next backlog ticket (or show the summary if it was the last one)

> **GAP: Revisit a verdict.** Once "Next →" is clicked the verdict is recorded and the round resets. **Partial workaround:** from the summary screen, clicking "Back to session" returns to the canvas with the full backlog — you can select a previous ticket and re-estimate it, but the old verdict remains in history alongside the new one (no overwrite). There is no clean "redo" flow.

---

## 6. Session Summary

When the last ticket in the backlog is completed:
1. A summary overlay appears with a table of all tickets and their estimates
2. Unestimated tickets show "—"
3. Export buttons (CSV / Excel) are available
4. Click **"Back to session"** to return to the canvas

---

## 7. History

### 7.1 Session History

Each round verdict (median + uncertainty) is shown as a faint × mark on the canvas for the remainder of the session. This gives the team spatial context: "our last estimate was around here."

### 7.2 Persistent History

Verdicts are saved to local storage across sessions. On future sessions (with the same unit), past estimates appear as even fainter marks. Toggle visibility with the **"↪ Show past" / "↩ Hide past"** button.

---

## 8. Participant Indicators

### 8.1 Who's in the Room

The header shows:
- Your name with "(you)"
- The creator gets a **"✎ in charge"** label
- Each peer's name with a coloured dot

### 8.2 Ready State

- Grey dot = not ready
- Coloured dot = ready
- A count shows `X / Y ready`

### 8.3 Room Badge

The room code is shown as a badge in the header. Click it to copy the code to your clipboard for sharing.

---

## 9. Leaving and Reconnecting

Click **"Leave"** to exit the session and return to the lobby. The session is saved to recent rooms — you can rejoin later.

> **Connection drop:** If your internet connection drops or a P2P relay goes down, your peers' blobs freeze on your screen and your updates stop reaching them. The header shows a connection warning. Refreshing the page and rejoining from the lobby usually restores the connection.

---

## Journey Map

```
Lobby                          Prep Mode                    Meeting Mode
  │                               │                              │
  ├─ Create session ──┐           │                              │
  ├─ Join by code ────┤           │                              │
  ├─ Rejoin saved ────┘           │                              │
  │                               │                              │
  └──► Enter session ─┬──► Import CSV ──► Prep mode              │
                      │           │                              │
                      │     Navigate tickets independently       │
                      │     Position blob (not broadcast)        │
                      │     Next issue → (save locally)          │
                      │           │                              │
                      │     Creator: "Start meeting" ───────────►│
                      │                                          │
                      └──► No backlog ──────────────────────────►│
                           (type topic, estimate, repeat)        │
                                                                 │
                                                    Position blob (broadcast)
                                                    "Ready ✓"
                                                    Auto-reveal (all ready)
                                                        or "Reveal anyway"
                                                    View combined estimate
                                                    Adjust blobs, discuss
                                                    "Next →" (save verdict)
                                                         │
                                                    More tickets? ──► repeat
                                                         │
                                                    Last ticket ──► Summary
                                                         │
                                                    Export CSV/Excel
                                                    "Leave" ──► Lobby
```
