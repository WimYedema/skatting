# Skatting — Plan

## Completed Phases

| Phase | Outcome | Commit range |
|---|---|---|
| **1 — Fix What's Broken** | Extracted `session-controller.ts` state machine, persisted backlog/unit on receive, tracked `hasMoved`, deduped verdicts by ticket ID. 100+ state-machine tests. | ✅ |
| **2 — True Async + Security** | Nostr event persistence (kind 30078) for offline-first join. AES-256-GCM encryption (HKDF from room code). 4-syllable room codes (31.6M namespace). Prep-done signalling. | ✅ |
| **3 — UX Gaps + Component Tests** | Onboarding overlay, abstain/skip, skip-prep checkbox, re-enter prep, re-estimate round. Component tests via `@testing-library/svelte`. | ✅ |
| **4 — Polish & Safety** | Revisit verdict, change unit mid-session, re-import safety (warn + merge), connecting spinner. | ✅ |

---

## Phase 5 — Estimation Quality & Facilitation

**Outcome:** Reduce anchoring risk in post-reveal discussions, improve facilitation flow, and eliminate remaining UX friction identified in the UX review (Poker Loyalist + Scrum Master perspectives).

### 5.1 Anti-Anchoring: Lock After Reveal

| # | Task | Why | Effort |
|---|---|---|---|
| 5.1 | **Lock blobs after reveal** — post-reveal blobs become read-only; adjustments require a re-estimate round | Visible convergence undermines independent estimation — the Poker Loyalist and Scrum Master both flagged this as the #1 process concern | M |

After reveal, pointer events on the canvas are disabled. The only way to change your estimate is through a full re-estimate round (blobs re-hide, everyone re-votes blind). This enforces the poker discipline: reveal → discuss → re-vote.

### 5.2 Ghost Blob + "Drag Me" Arrow

Replace the filled default blob with a **ghost blob** (dotted outline, unfilled, "?" in center) and a **sketchy hand-drawn arrow** with "Drag me!" text.

| # | Task | Why | Effort |
|---|---|---|---|
| 5.2a | **Ghost blob before first drag** — dotted outline, unfilled, "?" drawn in center at default canvas position. On first drag: fills solid, transitions to normal blob | The filled default blob looks like a committed estimate — users don't realise they need to act | S |
| 5.2b | **"Drag me!" arrow** — hand-drawn wobbly arrow pointing at the ghost blob, with "Drag me!" text at the tail. Same sketchy stroke style as axis labels. Arrow points from bottom-right quadrant toward blob center | First-timers need a verb, not just a visual cue. The arrow invites action and subtly reveals the nearby 🤷 button in peripheral vision | S |
| 5.2c | **Auto-abstain on Next** — if `!hasMoved` when clicking "Next", treat as abstain (same as "No idea 🤷") instead of saving the default position. No confirmation prompt needed — the ghost "?" already communicates "no estimate" | Eliminates accidental ghost estimates entirely. The ghost blob makes the semantics visual: unfilled = uncommitted | S |

Visual vocabulary:
- **Ghost "?" (grey dotted)** = hasn't estimated yet (passive)
- **Filled blob (solid)** = committed estimate (active)
- **Hatched "?" (sketchy pattern)** = actively abstained via 🤷 (deliberate skip)

The "Drag me!" arrow and hint text:
- Rendered on canvas in the same wobbly handwriting style as axis labels
- Vanishes on first drag (for the current ticket) or on 🤷 click
- After the user's first successful drag in the **session** (any ticket), the arrow is suppressed for all subsequent tickets (persist `hasEverDragged` flag in `$state`)
- The hint text fades; the ghost blob "?" remains for each new unestimated ticket

### 5.3 Post-Reveal Facilitation Loop

A unified system that detects agreement patterns, provides visual + verbal feedback, and **withholds the verdict until convergence** — making the tool an active facilitation partner.

#### Convergence Detection

Use the **P90/P10 ratio** of the combined estimate (already computed for export):

| Ratio | State | Meaning |
|---|---|---|
| < 3 | **Converged** | Team agrees — the range is narrow enough to call it |
| ≥ 3 | **Divergent** | Range too wide — discussion needed before a verdict |

#### Agreement Ring

After reveal, draw a **ring around the combined blob** whose colour encodes the convergence state:
- 🟢 **Green** — converged (P90/P10 < 3)
- 🟡 **Amber** — moderate divergence (P90/P10 3–5)
- 🔴 **Red** — high divergence (P90/P10 > 5)

Rendered in the same sketchy stroke style. Instant, glanceable, zero cognitive load.

#### Cluster Lassos

When divergent (2+ clusters detected), draw a **sketchy lasso** (wobbly dashed ellipse) around each blob cluster — like someone circled groups with a marker on a whiteboard. Each lasso gets a small median annotation (~5, ~13) so the facilitator can reference "the 5-camp and the 13-camp."

Cluster detection: 1D k-means on the X-axis positions (k=1,2,3), with a hysteresis threshold to prevent flickering between 1 and 2 clusters on borderline spreads.

#### Pattern-Matched Prompts

Canvas-rendered text in the wobbly handwriting style, positioned near the combined blob. Tone matches the existing axis labels:

| Pattern | Prompt |
|---|---|
| Tight agreement | *"You're all on the same page"* |
| Mild spread | *"Close enough — or worth a chat?"* |
| Two camps | *"Two camps — looks like you have something to talk about"* |
| Three+ camps | *"All over the place — someone start talking"* |
| One outlier high | *"Someone sees dragons here"* |
| One outlier low | *"Someone thinks this is a walk in the park"* |
| Everyone uncertain (high Y) | *"Nobody's confident — what don't we know?"* |
| Mixed certainty | *"Some sure, some guessing — what's the gap?"* |

The certainty-axis patterns are unique to Skatting — poker can't detect "everyone estimated 8 but nobody's confident."

Click-to-expand (optional): the facilitator can click the prompt text to see which names are in which cluster. Expansion is local (only visible to the person who clicked). Psychologically safe by default, detailed on demand.

#### Deferred Verdict ✅

The key design decision: **the "call it N" verdict is withheld until convergence.**

**Converged flow** (high pairwise overlap):
```
Reveal → green ring → "You're all on the same page"
       → "Call it 8" verdict appears
       → [Next →]
```

**Divergent flow** (low pairwise overlap):
```
Reveal → amber/red ring → cluster lassos → pattern prompt
       → NO verdict shown
       → Facilitator drags conclusion curve OR [Re-estimate ↺]
```

- **Conclusion curve** — the facilitator can grab and drag the combined curve to a new position, turning it into a "conclusion" curve. A ghost marker shows where the original combined estimate was. The "call it N" scribble updates live as the curve moves, snapping to the nearest Fibonacci/day value. Re-grabbable during discussion. Vertical movement supported for alignment even though only the horizontal position (effort) drives the verdict number.
- **"Re-estimate ↺"** — blobs re-hide per 5.1, team re-votes blind
- **"Next →"** only appears once a verdict exists (via convergence or facilitator conclusion)
- The combined blob shape is still drawn during divergence (shows the mathematical average) — only the snapped verdict label is withheld

#### Live Adjust Mode ✅

Post-reveal, the facilitator can toggle 🔒/🔓 to switch between two modes:
- **🔒 Locked (default)** — only the facilitator can drag the conclusion curve
- **🔓 Unlocked** — everyone can drag their own curves for real-time collaborative adjustment

This makes the tool opinionated about estimation quality. It won't give you a number until you've earned it through agreement — or until the creator deliberately places a conclusion.

#### Implementation Summary

| # | Task | Effort |
|---|---|---|
| 5.3a | **Convergence detection + agreement ring** — pairwise overlap integral, coloured ring on combined blob | S ✅ |
| 5.3b | **Cluster detection + lassos** — 1D k-means, sketchy ellipse around each group with median label | M ✅ |
| 5.3c | **Pattern prompts** — canvas-rendered text matched to detected pattern | S ✅ |
| 5.3d | **Deferred verdict + conclusion curve** — withhold "call it N" when divergent; facilitator drags conclusion curve to set verdict spatially | M ✅ |
| 5.3e | **Live adjust mode** — 🔒/🔓 toggle: locked = facilitator drags conclusion; unlocked = everyone drags their own blobs | S ✅ |

All canvas-rendered (ring, lassos, text, conclusion curve, grab handles) via `drawScene()`. No architectural changes needed.

### 5.4 Selective Reveal

| # | Task | Why | Effort |
|---|---|---|---|
| 5.4 | **Per-person reveal skip** — instead of all-or-nothing "Reveal anyway", allow skipping specific AFK participants while others continue estimating | One AFK person forces reveal for everyone, including people still actively placing blobs | M |

### 5.5 Identity & Joining

| # | Task | Why | Effort |
|---|---|---|---|
| 5.5a | **Name picker on join** — after entering a room code, query Nostr state and show existing participant names as a selectable list. User picks their name to rejoin, or types a new name to join fresh. Shows prep progress per name (e.g. "Bob ← 8/15") and labels the creator role | Eliminates case-sensitivity issues, duplicate identities, and "who was I?" confusion. Also gives a session preview (unit, ticket count) before joining. Falls back to manual name entry if Nostr query returns nothing | M |
| 5.5b | **Late joiner catch-up** — when joining mid-meeting, show a brief "You missed N rounds" indicator + completed tickets display verdicts in sidebar | Late joiners have no context about what happened before they arrived | M |

### 5.6 Onboarding & Import

| # | Task | Why | Effort |
|---|---|---|---|
| 5.6a | **Conditional tour steps** — adapt spotlight tour based on current mode (skip Ready button step in prep mode, show it in meeting mode) | Tour step 2 points at non-existent Ready button when entering with a backlog | S |
| 5.6b | **Paste-a-list import** — accept plain text (one title per line) as backlog input, alongside CSV | Teams without a CSV export face unnecessary friction | S |

### 5.7 Facilitator Handoff ("The Mic")

A lightweight facilitation model using a 🎤 metaphor — no roles UI, no permissions matrix.

| # | Task | Why | Effort |
|---|---|---|---|
| 5.7a | **"Hand off 🎤" action** — creator clicks a participant's name in the strip → "Give 🎤". That person gains navigation controls (select ticket, Next, Re-estimate ↺, Call it anyway). Creator retains backlog management (import, unit, start meeting, back to prep). Both see the 🎤 indicator next to the holder's name | SM can facilitate without being the session creator. One click, no role system, no setup | S |
| 5.7b | **Mic-drop on disconnect** — when the 🎤 holder disconnects, navigation opens to everyone. Toast: *"[Name] dropped the mic 🎤 — grab it?"*. First person to navigate (click ticket, Next, etc.) claims the 🎤. If nobody claims within ~10s, stays open (anyone can navigate) | Facilitator disconnect shouldn't freeze the meeting | S |
| 5.7c | **Creator reclaim on rejoin** — if the creator rejoins (via 5.5a name picker), they automatically reclaim creator permissions. If someone else holds the 🎤, the creator can take it back or leave it | Creator disconnect + rejoin should restore the session cleanly | S |

**Facilitator lifecycle:**
```
Session start
  → Creator holds 🎤 (default)

Creator clicks participant → "Hand off 🎤"
  → That person holds 🎤 (navigate, Next, Re-estimate, Call it anyway)
  → Creator keeps backlog management (import, unit, start meeting)

🎤 holder disconnects
  → "Bob dropped the mic 🎤 — grab it?"
  → First to navigate claims 🎤
  → If nobody claims in ~10s → stays open (anyone can navigate)

Creator disconnects
  → Same mic-drop mechanic
  → Backlog management locks (no import/unit changes possible)
  → Creator rejoins via name picker → reclaims creator + 🎤
```

**What's gated where:**

| Action | Creator only | 🎤 holder | Anyone |
|---|---|---|---|
| Import CSV / paste-a-list | ✓ | | |
| Change unit | ✓ | | |
| Start meeting / Back to prep | ✓ | | |
| Select ticket in sidebar | | ✓ | |
| Next → | | ✓ | |
| Re-estimate ↺ | | ✓ | |
| Call it anyway… | | ✓ | |
| Reveal anyway | | | ✓ |
| Place/drag own blob | | | ✓ |
| Ready ✓ / No idea 🤷 | | | ✓ |

Downgraded from L to **3×S** — it's removing `isCreator` guards from navigation buttons and adding a `micHolder` state field + one "Hand off" action. No new roles concept, no permissions UI.

---

## New Dependency

**`nostr-tools`** — the standard Nostr client library for JavaScript. Already used by Trystero internally (via `@trystero-p2p/nostr`), so it may already be in the dependency tree. If not, it's ~15KB gzipped and provides:
- `generateSecretKey()` / `getPublicKey()` — keypair generation
- `finalizeEvent()` — event creation + signing
- `Relay` / `SimplePool` — relay connection + subscription
- No native dependencies, works in browser

---

## Testing Strategy

Two layers, both deterministic and CI-friendly:

| Layer | Tool | What it covers | Flaky? |
|---|---|---|---|
| **State machine tests** (Phase 1.6) | Vitest | App state transitions, P2P callback logic, prep/meeting flow | No |
| **Component tests** (Phase 3.6) | Vitest + @testing-library/svelte | UI rendering, user interactions, button states | No |

E2E / multi-peer browser tests (Playwright) deferred — revisit once the state machine and component layers are solid.

**New dev dependency:** `@testing-library/svelte` (+ `@testing-library/jest-dom` for matchers).

---

## Sequencing

Phase 5 remaining work:
1. ~~**5.1** (lock blobs after reveal)~~ ✅
2. ~~**5.2a+5.2b+5.2c** (ghost blob + drag-me arrow + auto-abstain)~~ ✅
3. ~~**5.3a+5.3b** (convergence ring + cluster lassos)~~ ✅
4. ~~**5.3c** (pattern prompts)~~ ✅
5. ~~**5.3d** (deferred verdict + conclusion curve)~~ ✅
6. ~~**5.3e** (live adjust mode)~~ ✅
7. **5.4** (selective reveal) — independent, touches reveal logic
8. **5.5a+5.5b** (identity + joining) — independent pair
9. **5.6a+5.6b** (onboarding + import) — independent pair
10. **5.7a+5.7b+5.7c** (facilitator handoff) — lightweight, depends on 5.5a for rejoin reclaim

---

## Blue Sky — Future Ideas

Things that would be cool but aren't on the roadmap yet. Captured here so we don't forget.

### VS Code Extension

Wrap the single-file HTML in a Webview panel (~50 lines of extension code). Gets Skatting into the VS Code Marketplace with zero separate codebase. Developers could estimate beside their code without opening a browser.

Higher-value integrations down the line:
- Command palette: "Skatting: Import backlog from CSV in workspace"
- Status bar: "3/5 prepped" indicator during async prep
- Notification: "PO started the meeting — join now"

### AI-Assisted Estimation (no API key required)

Three layers, from simple to ambitious:

**Heuristics + statistics (web + extension, zero dependencies)**
- Complexity flags — scan ticket description for risk words (API, migration, legacy) → "⚠️ mentions: database migration"
- Spread warning — after reveal, flag when P90/P10 ratio > 4× → "high disagreement — discuss"
- Bias tracking — "you consistently underestimate by 30% vs team median"
- Velocity patterns — "last 3 sprints averaged 34 points — you've estimated 52 so far"

**Similarity matching via browser-side embeddings (web + extension)**
- Run a small embedding model (~30MB, e.g. `all-MiniLM-L6-v2`) in-browser via Transformers.js / ONNX WASM
- Embed ticket titles/descriptions → compare against past estimated tickets
- Surface: "similar tickets were estimated at 5, 8, 5 points — median 5"
- Model downloads once, caches in browser. No server, no API key, fits the serverless architecture

**LLM via VS Code Copilot API (extension only, uses the user's existing Copilot subscription)**
- The `vscode.lm` Language Model API lets extensions call Copilot with no separate key
- Ticket decomposition: "this has 3 independent work streams — consider splitting"
- Estimate rationale: "key cost drivers: new API integration, data migration, UI changes"
- Discussion prompts after reveal: "the 3× spread might be because Alice considered the API dependency and Bob didn't"
- Smart summary: "sprint estimation complete — 42 points, 2 high-uncertainty items flagged"

The Copilot integration is the strongest argument for eventually building the VS Code extension — it transforms it from "same app in a panel" to "AI-assisted estimation integrated in your editor."

### E2E Testing (Playwright)

Multi-browser tests that exercise real P2P connections. Two browser contexts, one creator, one joiner, full journey through prep → meeting → reveal → export. Flaky by nature (depends on relays), so nightly-only, not gating CI. Revisit once Layer 1+2 testing is solid.

### 🌙 Moonshot: Probabilistic Sprint Forecasting

**The insight:** Skatting is the only estimation tool that captures uncertainty as a first-class dimension. Every blob is a log-normal distribution — not a point estimate. We have mu AND sigma for every ticket, for every team member. No one else has this data.

**The question stakeholders actually ask:** *"When will it be done?"*

Planning poker answers with a number. Skatting could answer with a **cone of probability.**

**How it works:**
1. After estimating a sprint backlog, run a Monte Carlo simulation — for each ticket, sample from its log-normal distribution (the math is already in `lognormal.ts`), sum across the backlog, repeat 10,000 times
2. Output: *"This sprint is 23 points at P50, but 38 points at P90"*
3. Overlay with historical velocity: *"You'll complete this backlog by Friday at 70% confidence, by next Wednesday at 95%"*
4. Visualize as a **burndown cone** — a widening/narrowing fan instead of a line. The cone narrows as tickets complete. At the start it's wide; by mid-sprint it converges on reality

**Why it's transformative:**
- **Nobody does this.** Jira, Linear, Shortcut all show burndown *lines*. Lines lie. A cone shows whether you're fine or doomed — before the sprint fails, not after
- **The certainty axis is the secret weapon.** High certainty tickets → narrow cone → predictable sprint. Five "gut feeling" tickets → wide cone → risky sprint. Risk becomes visible before the sprint starts
- **It compounds.** After a few sprints, calibration data accumulates. "Your team's P90 is actually P65 — you're systematically overconfident." The model self-corrects. Forecasts get genuinely accurate over time
- **It changes the conversation.** Instead of "can we fit 8 more points?" → "adding these 3 tickets moves your 90% confidence date from Friday to next Tuesday." Tradeoffs, not gut feelings

**Why Skatting is uniquely positioned:** Other tools would have to retrofit uncertainty. We already have it — every estimate is a distribution. The Monte Carlo math is trivial given `lognormal.ts`. The canvas visualization is our strength. Nostr persistence means calibration data survives across sprints.

**The vision:** *Skatting — the estimation tool that tells you when you'll be done, not just how big it is — with honest confidence intervals, not false precision.*

### 🌙 Moonshot: Value × Effort — Probabilistic Prioritisation

**The insight:** Skatting already captures effort with uncertainty. What if it also captured *value* with uncertainty? The ratio — value per point — becomes a *distribution*, not a number. You can compute the probability that ticket A delivers more bang-per-buck than ticket B.

That's way more honest than a WSJF number on a spreadsheet.

**The estimation mechanic stays the same:**

| | Effort | Value |
|---|---|---|
| Who knows? | Developers | PO / stakeholders |
| When? | Prep mode / meeting | PO preps value before the meeting |
| Interaction | Same blob, same canvas | Same X=magnitude, Y=certainty |

The PO estimates value using the same blob — same log-normal, same certainty axis. Just a different question: *"How valuable is this?"* instead of *"How much work?"*

**What falls out of value + effort:**

1. **Probabilistic priority ranking** — rank tickets by expected value-per-point with confidence intervals. Tickets whose value/effort distributions overlap → "these are genuinely interchangeable, stop arguing"

2. **Priority clouds, not dots** — plot each ticket as a probability cloud on a value (Y) vs effort (X) plane. Traditional matrices show dots in quadrants (quick wins / big bets / money pits). Skatting shows *clouds* — the shape reveals how sure the team is. A tight cloud in "quick win" = do it. A cloud sprawling across quadrants = investigate before committing.

3. **Sprint optimisation (ties into Monte Carlo)** — given a velocity budget, find the commitment that maximises expected value delivered: *"Swapping ticket D for ticket G improves expected value by 15% with the same effort budget."* A knapsack problem with uncertain weights and values — tractable via simulation.

4. **Cost of delay becomes visible** — if value is time-sensitive ("worth 100 now, 20 next sprint"), the priority cloud drifts downward over time. Urgency becomes a shape, not a label.

**What's needed:**
- A second estimation round per ticket (or mode toggle: "estimate effort" / "estimate value")
- One more (mu, sigma) pair per ticket per participant
- A combined view: scatter plot with probability clouds, ranked priority list, sprint optimiser

**Why this is unique:** WSJF exists. Value/effort matrices exist. But they all use point estimates that hide uncertainty. Nobody plots the *probability that ticket A beats ticket B* in value-per-point. Nobody shows you that two tickets are statistically indistinguishable so stop debating them.

**Combined vision with the forecasting moonshot:** The two moonshots are halves of the same picture — *probabilistic planning, not just estimation.* Effort distributions power the **burndown cone** (when will we be done?). Value distributions power the **priority cloud** (what should we do first?). Together: *"Here's the sprint that delivers the most value by Friday with 90% confidence."*
