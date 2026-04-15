# Skatting — User Journeys

## Overview

Skatting is a real-time, peer-to-peer 2D estimation tool for agile teams. Users position a log-normal "blob" on a continuous plane where **X = effort** and **Y = certainty**. Sessions are fully serverless — peers connect via WebRTC.

Skatting has no built-in chat or voice — teams are expected to be on a separate call (video, Slack huddle, in person) while using the app. It works on desktop and mobile/tablet (touch supported).

### Roles

There are two roles, determined at session creation:

| | **Creator ("in charge")** | **Participant** |
|---|---|---|
| How you get the role | Click "+ New Session" | Click "Join by Code" or rejoin as non-creator |
| Choose estimation unit | ✓ (points or days, changeable until first estimate) | Receives the creator's choice |
| Import CSV backlog | ✓ (can re-import: merge or replace) | Receives the backlog |
| Reorder / remove tickets | ✓ | Read-only |
| Navigate tickets in meeting mode | ✓ (peers follow) | Follows the creator |
| Navigate tickets in prep mode | ✓ | ✓ (independent) |
| Start / end meeting | ✓ (can also return to prep) | — |
| Re-estimate a round | ✓ | — |
| Estimate and vote | ✓ | ✓ |
| Abstain from a ticket | ✓ | ✓ |
| Force-reveal before everyone is ready | ✓ | ✓ (anyone can) |
| Export results | ✓ | — |

Both roles estimate in exactly the same way — the creator just has additional facilitator controls.

### Phases

A session can follow two paths:

- **With a backlog** → the creator (typically the PO) imports a CSV and shares the room code. The session starts in **prep mode**, where each team member can asynchronously work through the backlog at their own pace — potentially over several days. The creator can click "Start meeting" at any time, or immediately after importing if the backlog is short. When the team reconvenes, the creator clicks "Start meeting" to transition to **meeting mode** (collaborative ready/reveal).
- **Without a backlog** → the session starts directly in **meeting mode**. The creator types a topic and the team estimates it together.

---

## 1. Starting a Session

### 1.1 Create a New Session

1. Open the app → land on the lobby screen
2. Enter your name
3. Click **"+ New Session"**
4. A random room code is generated from four 2-letter syllables (e.g. `bakituzo`)
5. Choose the estimation unit: **points** or **days**
6. Click **"Start"** → enter the estimation canvas as **creator**

The room code can be shared with teammates so they can join.

### 1.2 Join by Code

1. Open the app → lobby screen
2. Enter your name
3. Click **"Join by Code"**
4. Type or paste the room code
5. Click **"Join"** → a spinner shows **"Looking for session…"** while connecting
6. Unit, backlog, and current state are automatically received (first from Nostr relays, then via P2P)

> **Note:** If you join mid-meeting (after "Start meeting"), you land on the current ticket and can estimate immediately. You will not see verdicts from earlier rounds — only future rounds.

### 1.3 Rejoin a Saved Session

1. Open the app → lobby shows recent room cards
2. Each card displays: room name/code, peer names, unit, last used date
3. Click a card → rejoin with your original role: if you were the creator **and use the exact same name** (case-sensitive), you rejoin as creator ("in charge"); otherwise you join as a regular participant
4. Previous backlog, personal pre-estimates, and session state are restored — first from Nostr relays (encrypted), then local storage

> **Note:** Pre-estimates are stored in your browser's local storage. If you rejoin from a different device or a different browser, your personal prep estimates will not be available.

> **Note:** If two people join with the same name, the app treats them as separate peers (they get different colours), but the header will show duplicate names. Use distinct names to avoid confusion.

### 1.4 First-Time Onboarding

If this is your first time using Skatting:
1. A welcome card appears: **"Hey [name]! First time here?"** with a diagram showing how blobs work — narrow (certain) vs. wide (uncertain), small vs. large effort
2. You can choose **"Quick tour ↝"** for a 3-step guided spotlight tour:
   - **Step 1 — Canvas:** "Drag to place your blob. Left–right = effort, up–down = how sure you are."
   - **Step 2 — Ready button:** "Hit Ready. Once everyone's in, all blobs pop up at once."
   - **Step 3 — Room code:** "Tap to copy the room code — share it and they're in."
3. Or click **"I'll figure it out"** to skip

The **"?"** button in the header reopens the tour at any time.

---

## 2. Creator: Setting Up the Session

### 2.1 Ad-Hoc Estimation (No Backlog)

1. After creating a session, you're in meeting mode with an empty canvas
2. Type a topic or paste a URL in the session name field — it syncs to all peers
3. Everyone estimates on the canvas (see §3 for canvas mechanics), then follows the ready/reveal flow (see §5)
4. After reveal and "Next →", the canvas resets — type the next topic and repeat

This is the simplest path — no CSV, no sidebar, no prep mode. The session continues indefinitely until someone leaves.

### 2.2 Importing a Backlog

1. Click **"📋 Import CSV"** in the header (available at any time for the creator)
2. Select a `.csv` file with columns: `id`, `title`, and optionally `url`, `labels`, `assignee`, `description`
3. **If a backlog already exists**, a dialog appears with three choices:
   - **"Merge (add new)"** — appends tickets from the CSV that don't already exist (matched by ID), keeping all existing estimates intact
   - **"Replace all"** — wipes the current backlog and starts fresh
   - **"Cancel"** — do nothing
4. If no backlog existed, the tickets are imported directly
5. The backlog appears in the sidebar and is synced to all peers
6. Prep mode activates — the first ticket is selected

The creator can immediately click **"Start meeting"** after importing if async prep isn't needed.

### 2.3 Managing the Backlog

1. Drag tickets in the sidebar to reorder priorities — peers see the updated order
2. Click × on a ticket to remove it
3. The sidebar shows progress: how many tickets are prepared or estimated

The PO is also a participant — don't forget to prep your own estimates while managing the backlog.

### 2.4 Changing the Unit

The unit dropdown (points / days) appears next to the room code in the header. Once any ticket has received a verdict, the unit locks — it becomes a read-only badge. If the team needs a different unit, create a new room.

### 2.5 Starting the Meeting

1. When the team is on a call, click **"Start meeting"**
2. Prep mode ends for everyone — the current ticket and estimates are synced
3. The team enters the collaborative ready/reveal flow

### 2.6 Leading the Meeting

1. Navigate tickets by clicking in the sidebar — all peers follow your selection, their round state resets, and any saved blob positions for that ticket are restored
2. After each reveal, click **"Next →"** to record the verdict and advance
3. If the team wants to redo the current ticket, click **"Re-estimate ↺"** — blobs re-hide, ready states reset, but everyone's blob stays where it was so they can adjust rather than start from scratch
4. If the team needs more prep time, click **"Back to prep"** to return to prep mode
5. On the last ticket, the session summary appears

### 2.7 Revisiting a Previous Ticket

Click any ticket in the sidebar at any time — including completed ones. The team's vote on that ticket resets (ready/reveal cleared), but blob positions are restored. After re-estimating and clicking "Next →", the new verdict **overwrites** the old one — no duplicates in history or exports.

### 2.8 Exporting Results

1. Once tickets have estimates, export buttons appear at the bottom of the sidebar
2. Click **"CSV ↓"** or **"Excel ↓"** to download
3. Exported columns: id, title, median, P10, P90, unit, url, labels, assignee

---

## 3. The Canvas

This section covers the canvas mechanics — what you see and how blobs work. For the meeting flow that orchestrates estimation (ready → reveal → next), see §5.

### 3.1 Layout and Interaction

1. After entering a session, you see a canvas with an effort axis (horizontal, log-scale) and a certainty axis (vertical). A default blob is already placed at a moderate position — you don't start from scratch
2. The effort axis has Fibonacci reference marks (1, 2, 3, 5, 8, 13, 21, 34) but the scale is continuous — your blob can sit anywhere between marks
3. The certainty axis has descriptive labels: "don't ask me…", "gut feeling", "pretty sure", "I know this!"
4. Click or drag anywhere on the canvas to reposition your blob — works with mouse or touch
5. Drag left/right to change your effort estimate
6. Drag up/down to change your certainty — dragging up makes the blob taller and narrower (more confident), dragging down makes it wider and squatter (less sure)
7. The blob's area stays constant — only the shape changes

### 3.2 What You See

- **Before reveal:** only your own blob is visible — peer blobs are hidden to prevent anchoring bias
- **Annotations on your blob:** the canvas shows your median estimate ("~12.5 points most likely"), the P10–P90 range ("10–21 points 80% falls here"), and arrows pointing to the range boundaries
- **After reveal:** all blobs appear overlaid, each with a distinct colour and hatched fill. A **combined team estimate** shows as a dashed outline with the median and P10–P90 range labelled, plus a verdict label snapped to a natural reference point ("call it 13")
- **Ticket info:** when a backlog is loaded, the current ticket's ID, title, labels, and assignee appear in handwritten style in the upper area of the canvas
- **History marks:** past verdicts from earlier rounds appear as faint × marks on the canvas for spatial context
- Hover over any blob to see whose estimate it is (tap on mobile)

### 3.3 Abstaining

If you don't have enough context to estimate a ticket, click the **"No idea 🤷"** button in the bottom-right corner of the canvas. Your blob disappears and is replaced by a sketchy hatched **"?"** symbol. Your non-estimate is excluded from the combined verdict. The 🤷 emoji appears next to your name in the participant list.

If you later change your mind, dragging on the canvas clears the abstain and places a new blob. Your abstain state is remembered per ticket — navigating away and back restores it.

If everyone abstains, no verdict is recorded for the round.

---

## 4. Prep Mode — Asynchronous Pre-Estimation

Prep mode is designed for asynchronous use over days, not just a quick warm-up before the meeting. The PO imports a backlog and shares the room code; team members join at their own pace and work through the tickets independently — from home, between meetings, whenever suits them. When the team reconvenes for the estimation meeting, everyone already has a position on every ticket.

### 4.1 Entering Prep Mode

- The PO imports a CSV backlog → prep mode activates automatically
- The PO shares the room code with the team (e.g. via Slack or email)
- Team members join whenever they're ready — they don't need to be online at the same time
- Each joiner receives the full backlog (restored from Nostr relays even if the creator is offline) and can start prepping immediately

> **Note:** If your browser tab crashes or you accidentally close it, your pre-estimates are safe in local storage. Rejoin the session from the lobby to continue where you left off. Your peers will see you leave and rejoin, but your prep work is preserved.

### 4.2 Working Through Tickets

1. Select a ticket from the sidebar (or let it auto-advance)
2. Position your blob to estimate effort and certainty — or click **"No idea 🤷"** to abstain
3. Click **"Next issue →"** to save and move to the next ticket
4. Your estimate is saved locally — it is **not** broadcast to peers
5. The sidebar tracks progress: `●` = has a local pre-estimate

> **Note:** If you click "Next issue →" without repositioning the blob, the default position is saved as your estimate for that ticket. Deliberately skip tickets you're not ready to estimate — select them from the sidebar later, or use "No idea 🤷" to explicitly abstain.

Everyone navigates independently — your position in the backlog doesn't affect others.

### 4.3 Signalling You're Done

When you reach the last ticket and click **"Finish ✓"**, a prep-done signal is published via Nostr relays. The creator (and other peers) see your name and ticket count in the participant strip — e.g. "Bob (12)" — even if you're offline when they check. This lets the PO know who's ready before scheduling the meeting.

### 4.4 Ending Prep Mode

Only the creator can click **"Start meeting"** to transition everyone to meeting mode. This can be done:
- Immediately after importing (skip prep entirely for a short backlog)
- After all prep-done signals are visible
- At any time — the team doesn't have to be fully prepped to start

If the meeting starts too early, the creator can click **"Back to prep"** to return everyone to prep mode.

---

## 5. Meeting Mode — Ready / Reveal / Verdict

Meeting mode requires all participants to be online simultaneously — this is a live, synchronous flow.

### 5.1 Estimating Together

1. All participants see the same ticket (creator controls navigation)
2. Each person drags their blob — positions are broadcast to peers but blobs remain hidden until reveal
3. If you pre-estimated this ticket in prep mode, your blob starts at that position
4. When satisfied, click **"Ready ✓"**
5. If you don't have context for this ticket, click **"No idea 🤷"** instead — you'll be marked as abstaining and excluded from the combined estimate without blocking the team

### 5.2 Reveal

- When **everyone** is ready (including those who abstained), estimates are revealed automatically
- If someone is unresponsive, any participant can click **"Reveal anyway"**
- All blobs appear overlaid, plus the combined team estimate
- You can still drag your blob after reveal — the combined estimate updates in real time
- Discuss disagreements on the call before moving on

### 5.3 Re-Estimating

If the discussion reveals a misunderstanding, the creator can click **"Re-estimate ↺"** to:
- Re-hide all blobs
- Reset everyone's ready state
- Keep blob positions intact so the team can adjust rather than re-estimate from scratch

This can be repeated as many times as needed.

### 5.4 Moving to the Next Round

After reveal, click **"Next →"** to:
- Record the verdict (median, P10, P90) on the current ticket
- Reset the round (all blobs cleared, ready states reset)
- Auto-advance to the next backlog ticket (or show the summary if it was the last one)

Navigating back to a previously-estimated ticket and re-estimating will **overwrite** the old verdict cleanly — no duplicate entries in history.

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
- 🤷 emoji = abstained ("No idea")
- A count shows `X / Y ready`

### 8.3 Prep-Done Signals

In prep mode, each team member who has finished prepping appears with their ticket count — e.g. "Carol (8)". These are persisted via Nostr relays, so the creator can see them even if the prepper is offline.

### 8.4 Room Badge

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
  │         │                     │                              │
  │    [Onboarding tour]          │                              │
  │                               │                              │
  └──► Enter session ─┬──► Import CSV ──► Prep mode              │
                      │           │                              │
                      │     Navigate tickets independently       │
                      │     Position blob / "No idea 🤷"         │
                      │     Next issue → (save locally)          │
                      │     [Prep-done signal published]         │
                      │           │                              │
                      │     Creator: "Start meeting" ───────────►│
                      │                ◄──── "Back to prep" ─────│
                      │                                          │
                      └──► No backlog ──────────────────────────►│
                           (type topic, estimate, repeat)        │
                                                                 │
                                                    Position blob / "No idea 🤷"
                                                    "Ready ✓"
                                                    Auto-reveal (all ready)
                                                        or "Reveal anyway"
                                                    View combined estimate
                                                    Adjust blobs, discuss
                                                        or "Re-estimate ↺"
                                                    "Next →" (save verdict)
                                                         │
                                                    More tickets? ──► repeat
                                                    Revisit ticket? ──► overwrite
                                                         │
                                                    Last ticket ──► Summary
                                                         │
                                                    Export CSV/Excel
                                                    "Leave" ──► Lobby
```
