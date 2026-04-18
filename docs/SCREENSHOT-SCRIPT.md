# Screenshot Script

A step-by-step playbook to produce the best screenshots for marketing materials
(README hero image, GitHub social preview, blog posts, etc.).

**Setup:** One browser window is enough — use demo mode.  
URL: https://wimyedema.github.io/skatting/?demo (or `npm run dev` locally, then add `?demo`)

Demo mode pre-populates Alice, Bob, and Carol with realistic blob positions and animates
the full reveal sequence automatically. No extra windows or incognito tabs needed.

---

## Shot A — The Reveal (primary hero image)

This is the money shot: all blobs revealed, three participants with different
certainty levels, and Alice animating the conclusion curve to "call it 13".

### Steps

1. Open `/?demo`
2. Wait for all three peer badges to appear and go ready (about 7 s)
3. Click **Ready ✓** — the blobs all reveal simultaneously
4. Wait ~2 s — Alice's conclusion curve slides into place and the label appears
5. **Take the screenshot** when the "call it 13" label is visible on the canvas

> Best crop: full canvas including the axis ticks, participant badges, and the
> verdict label. The demo banner at the top can be cropped out.

**Optional Shot A0 — "hidden blobs" / in-progress state**  
Don't click Ready yet. Screenshot the canvas showing your blob (green) while
Alice, Bob, and Carol show as colored name badges — estimates still hidden.
This illustrates the pre-reveal phase well.

---

## Shot B — The Divergence (great for blog posts / alt hero)

Demo mode uses sensible blob positions. For a more dramatic *disagreement* shot
you'll need a real session with 2 windows (you + one incognito tab):

1. Window 1: **Alice** — New Session, Points, drag blob far left (~30% across, ~65% up)
2. Window 2: **Bob** — Join, drag blob far right (~75% across, ~30% up)
3. Both click Ready ✓ → reveal

After reveal: two blobs at opposite ends of the canvas with minimal overlap.
The facilitation prompt "Big spread — discuss anchoring bias" should appear.
Screenshot Window 1 showing the full canvas with that prompt.

> If a 2-window setup is too awkward, skip Shot B — Shot A from demo mode is
> sufficient for the README hero and social preview.

---

## Shot C — Backlog Panel (good for feature showcase)

This shows the sidebar + ticket list. Needs a real session (one window is fine as creator).

1. Open the app, enter name **Alice**, click **+ New Session**, choose **Points**
2. Click **+ Add tickets ▾ → Import CSV**, import `example-backlog.csv` from the repo root
3. The sidebar opens with tickets. Estimate a couple (drag + Ready ✓) so they get verdict badges.
4. Navigate to the next ticket and place a blob (not yet revealed)

**Take a screenshot** showing:
- Sidebar on the right with 2–3 tickets having verdict badges
- Canvas with the current blob visible
- Topic name visible at the top

---

## Shot D — Lobby (simple, for docs)

1. Open the app fresh (no saved sessions)
2. Enter name **Alice** in the name field
3. Do NOT click any button yet

Screenshot the lobby screen as-is — clean, minimal.

---

## Tips for great screenshots

- **Browser zoom**: Set to 100% (Ctrl+0). The sketchy aesthetic looks best at native pixel ratio.
- **Window size**: Aim for 1280×800 or 1440×900 — wide enough to show canvas comfortably.
- **DevTools device mode** (F12 → Ctrl+Shift+M): lock to 1280×800, then
  "Capture screenshot" (Ctrl+Shift+P → "Capture screenshot") — cleanest result, no OS chrome.
- **Crop the demo banner**: the blue "Demo — drag the blob…" bar at the top can be cropped
  out of marketing images — it's only useful for visitors trying the live app.

## Which shot goes where

| Use | Best shot |
|---|---|
| README hero (top of page) | Shot A — reveal with "call it 13" label |
| GitHub social preview (1280×640) | Shot A — wide canvas crop |
| Blog post thumbnail | Shot B — divergence state (more dramatic) |
| Feature row: "Backlog import" | Shot C |
| Feature row: "Join in seconds" | Shot D |

---

## Shot A — The Reveal (primary hero image)

This is the money shot: all blobs revealed simultaneously, showing 3 participants
with different certainty levels and a clear consensus.

### Step 1 — Window 1 (Creator, "Alice")

1. Open the app
2. Enter name: **Alice**
3. Click **+ New Session**, choose **Points**, click **Start**
4. Copy the room code from the header (you'll paste it into the other windows)
5. Type in the topic field: **"User auth redesign"**
6. Drag your blob: **right-center of canvas** (medium-large effort, fairly high up — confident)
   - Target: about 60% across horizontally, 70% up vertically
   - The blob should be tall and narrow — "pretty sure"

### Step 2 — Window 2 (Participant, "Bob")

1. Open the app (incognito)
2. Enter name: **Bob**
3. Click **Join by Code**, paste Alice's room code, click **Join**
4. Drag blob: **slightly left of Alice** (same effort range but lower — uncertain)
   - Target: about 50% across, 30% up vertically
   - The blob should be short and wide — "gut feeling"
5. Do NOT click Ready yet

### Step 3 — Window 3 (Participant, "Carol")

1. Open app (second incognito tab)
2. Enter name: **Carol**
3. Join with the same room code
4. Drag blob: **far right** (thinks it's larger work, moderately confident)
   - Target: about 80% across, 55% up vertically
5. Do NOT click Ready yet

### Step 4 — Capture the "during estimation" state

**(Optional Shot A0 — "hidden blobs" / in-progress state)**  
Back in Window 1, before revealing, look at the canvas:
- You see your own blob (Alice)
- Bob and Carol show as colored dots/initials — their estimates are hidden
- Take a screenshot of Window 1 in this state

### Step 5 — Reveal

1. In Window 1, click **Ready ✓**
2. In Window 2, click **Ready ✓**
3. In Window 3, click **Ready ✓**
4. The blobs all appear simultaneously on everyone's screen

**Take screenshots of ALL three windows side by side or pick the best one.**

The ideal shot: Window 1 (Alice), showing three overlapping colored blobs —  
a tight tall one (Alice, blue), a wide low one (Bob, green), and a narrower outlier (Carol, orange).  
The combined verdict blob appears as a semi-transparent contour over all three.

> Best crop: full canvas, include the axis labels + participant initials + ready badges.

---

## Shot B — The Divergence (great for blog posts / alt hero)

Same setup but position the blobs far apart to show what *disagreement* looks like.

### Blob positions

| Person | Horizontal | Vertical | What it shows |
|---|---|---|---|
| Alice | ~30% (small) | ~65% (confident) | "This is a small, well-understood task" |
| Bob   | ~75% (large) | ~40% (uncertain) | "I have no idea, could be huge" |
| Carol | ~55% (medium) | ~60% | "Middling, fairly sure" |

After reveal: three blobs spread across the canvas with minimal overlap.  
The facilitation prompt should appear ("Big spread — discuss anchoring bias").  
Take a screenshot of Window 1 showing the full canvas with the prompt.

---

## Shot C — Backlog Panel (good for feature showcase)

This shows the sidebar + ticket list.

1. In Window 1 (as Alice/creator), click **📋 Import CSV** and import `example-backlog.csv`  
   (this file is in the repo root — copy it somewhere accessible first)
2. The sidebar opens with a list of tickets. Navigate a few tickets by clicking them.
3. Complete **Shots A or B** on a ticket — after clicking Next →, the ticket gets a verdict badge
4. Navigate to the next ticket and start estimating (blob placed, not yet revealed)

**Take a screenshot** showing:
- Sidebar on the right with 2–3 tickets having verdict badges
- Canvas on the left with the current blob
- Topic name visible at the top

---

## Shot D — Lobby (simple, for docs)

1. Open the app fresh (no saved sessions)
2. Enter name **Alice**
3. Do NOT click any button yet

Screenshot the lobby screen as-is — clean, minimal.

---

## Tips for great screenshots

- **Browser zoom**: Set to 100% (Ctrl+0). The sketchy aesthetic looks best at native pixel ratio.
- **Window size**: Aim for 1280×800 or 1440×900 — wide enough to show canvas + sidebar.
- **Hide browser chrome**: Press F11 for fullscreen, or use Chrome's "Screenshot" in DevTools  
  (F12 → Ctrl+Shift+P → "Screenshot") to capture at a precise size without OS chrome.
- **DevTools device mode** (Ctrl+Shift+M): lock to 1280×800, then "Capture screenshot" — cleanest result.

## Which shot goes where

| Use | Best shot |
|---|---|
| README hero (top of page) | Shot A — reveal, Window 1 close-up |
| GitHub social preview (1280×640) | Shot A — all three canvases side-by-side, or wide single canvas |
| Blog post thumbnail | Shot B — divergence state (more dramatic) |
| Feature row: "Backlog import" | Shot C |
| Feature row: "Join in seconds" | Shot D |
