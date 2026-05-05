# Slide Deck Outline — "The Shape of Uncertainty"

Target: 40 minutes (30 talk + 10 live demo/interaction)
Tone: Informative with dry humor. The comedy comes from honest observations, not jokes.

The AI thread: Not a separate point. Never announced. Small, casual asides that
accumulate until the audience connects the dots on their own. By the close, they
realize what happened without being told.

---

## Act 1: The Problem (8 min)

### Slide 1 — Title
"The Shape of Uncertainty: What Planning Poker Has Been Hiding for 25 Years"
- Wim Yedema
- Clean, minimal. No blob yet — save the visual.
- **Visual:** Dark background with a single, thin, barely-visible curve outline
  fading in — a teaser of what's coming. Title text large, left-aligned. No
  logos, no bullet points.

### Slide 2 — The Ritual
"Raise your hand if you've done planning poker in the last month."
- Wait for hands.
- "Keep your hand up if the resulting number was used for anything other than filling in a Jira field."
- Watch the hands drop.
- **Visual:** Blank slide. Just the two lines of text, revealed one at a time.
  The emptiness *is* the design — all attention on the audience, not the screen.

### Slide 3 — The Same Card
- Footer: "Same card. Same number. Completely different reality."
- **Visual:** Two hand-drawn stick figures, each holding a large "5" card.
  Left figure has a calm expression and a small thought bubble: *"Tuesday."*
  Right figure has wide eyes and a thought bubble: *"I have literally no idea
  but everyone else said 5."* Sketchy style matching the app's aesthetic.
  The "5" cards should be identical — the contrast is entirely in the faces
  and thought bubbles.

### Slide 4 — What We Actually Do
The real planning poker algorithm:
1. Flip cards
2. See a "3" and two "8"s
3. Ask "why is yours a 3?"
4. Person says "oh I forgot about the migration"
5. Everyone changes to 8
6. Write "8" in Jira
7. Forget about it
- "The useful part was step 4. The card was an expensive way to get to step 4."
- **Visual:** Numbered list styled like pseudocode / a recipe card. Step 4
  highlighted in a different color or circled with a hand-drawn annotation
  arrow: "← the only useful part". Steps 6–7 slightly faded or struck through.

### Slide 5 — The Missing Dimension
- "The interesting conversation is always about the second one."
- **Visual:** A planning poker card ("5") shown twice. First: solid, bold —
  labeled "magnitude ✓". Second: the same card but transparent/ghosted,
  labeled "confidence ?" with a dotted outline around empty space beneath it.
  Or: a bar chart with one bar present (effort) and a second bar-shaped hole
  with a question mark (certainty). Keep it simple — the point is absence.

### Slide 6 — Boehm Knew
- "He told us 44 years ago. We're still flipping cards."
- Beat: "To be fair, cards are fun."
- **Visual:** Classic cone of uncertainty — a V-shape narrowing left to right,
  with project phases along the X axis. Keep it clean, not academic: no
  citations, no axis labels, just the shape with "early" and "late" at the
  ends. Beneath the cone, a tiny planning poker card with a single number on
  it — visually absurd next to the wide range above. The contrast between the
  fat cone and the thin card *is* the slide.

---

## Act 2: The Solution (8 min)

### Slide 7 — What If the Estimate Had a Shape?
- "Drag right → bigger estimate. Drag up → more certain. The area stays the same."
- 🧵 AI thread (throwaway): "I knew estimates weren't symmetric. I didn't know
  the name for the math. Turns out if you describe what you want to a large
  language model, it says 'that's a log-normal distribution' in about two
  seconds."
- **Visual:** Screenshot or live embed of the Skatting canvas with a single
  blob, annotated with three minimal labels: "effort →" along X, "certainty ↑"
  along Y, and a small "fixed area" annotation near the blob. Consider an
  animated transition (or two sub-slides) showing the same blob dragged from
  low-certainty (flat) to high-certainty (tall) — the area staying constant
  is the "aha" moment. No UI chrome — crop to just the canvas.

### Slide 8 — The Pancake of Shame
- "With cards, Alice and Bob both say '5'. With shapes, you can *see* the difference."
- **Visual:** Split canvas. Left: tall narrow spike in blue, labeled "Alice".
  Right: flat wide pancake in orange, labeled "Bob". Same X-axis center
  position (same effort estimate), dramatically different heights. Generated
  from the actual `lognormalPdf` function (like the article's SVG) so the math
  is real. Below each blob, a small planning poker card showing "5" — visually
  identical. The contrast between identical cards and wildly different shapes
  is the entire slide.

### Slide 9 — The Reveal
- "Your eye does the facilitation for you."
- **Visual:** Animated sequence (or 3 sub-slides): canvas starts empty, then
  blobs appear one at a time — first blue, then green, then orange, then red.
  Each appears with a soft fade. Final state: four overlapping curves on one
  canvas. Use a screenshot from the actual app's reveal view if possible —
  the sketchy hand-drawn style is distinctive and memorable. No labels needed;
  the visual speaks for itself.

### Slide 10 — Pattern: The Expert and the Guessers
- "With cards, this is '5, 5, 5, 5'. With shapes, it's obvious. Talk to the spike."
- **Visual:** Canvas with three flat, overlapping pancakes (muted colors) and
  one tall narrow spike (bright/saturated color) standing out clearly. A
  hand-drawn circle or arrow pointing at the spike with annotation: "talk to
  this person". Side panel or footer shows the card equivalent: four identical
  "5" cards in a row — to show what you'd see in planning poker (nothing).

### Slide 11 — Pattern: Genuine Agreement
- "Move on. Spend your time where you *don't* agree."
- **Visual:** Four nearly identical tall, narrow blobs stacked tightly together,
  almost merging into one shape. Calm colors, all similar hue. A green
  checkmark or a simple "✓ move on" annotation. Visually peaceful — the
  audience should feel the certainty. Contrast with previous slide's tension.

### Slide 12 — Pattern: The Hidden Risk
- "This is the most valuable moment in your refinement. *Do not skip it.*"
- **Visual:** Three tight, similar blobs clustered together + one wide, flat
  outlier curve in a contrasting color, clearly separated. A hand-drawn
  annotation arrow pointing at the outlier: "⚠ what do they know?" Consider a
  second sub-slide showing the card equivalent: three "5" cards and one "13"
  — then the question: "Is the 13 confident-high or uncertain-wide?" with two
  different blob shapes for the same "13" (one tall+shifted right, one
  flat+wide). The shapes disambiguate what cards can't.

### Slide 13 — The Question That Changes
- **Visual:** Two-panel slide with a dividing line. Left panel (muted/grey):
  a speech bubble with *"Why is yours an 8 and mine a 3?"* above two planning
  poker cards (3 and 8). Right panel (color/vivid): a speech bubble with
  *"What do you know that I don't?"* above two overlapping blobs with
  different shapes. No other text. The visual contrast carries the message.
  The right panel should feel warmer, more inviting — this is the better
  conversation.

---

## Act 3: Live Demo (10 min)

### Slide 14 — "Let's Try It"
- 🧵 AI thread (matter-of-fact): "It's a single HTML file. No server. Your
  phones are talking directly to each other, encrypted. I didn't build that part
  either."
- **Visual:** Massive QR code, centered, taking up most of the slide. Room code
  in large monospaced text below it. One line of text: "Open your phone. No
  sign-up." Nothing else. The QR code *is* the slide. Make sure it scans from
  the back row — test at distance. Consider a contrasting background color
  for this slide only to signal "we're doing something different now."

### Live Round 1: Easy one
Pick something the audience can relate to — "How long would it take to repaint your living room?"
- Everyone drags their blob.
- Reveal. Read the pattern aloud. Point out the clusters, the outliers.
- "See? Nobody thought about the ceiling."

### Live Round 2: Ambiguous one
"How long to migrate a monolith to microservices?"
- Expect wide pancakes everywhere.
- "Look at that. A room full of pancakes. This is your refinement telling you: *we don't know enough to estimate this yet.* Split it or spike it."
- If someone has a narrow blob: "Ah, we have a volunteer."

### Slide 15 — What You Just Saw
- "The shapes told you more in 30 seconds than a round of cards would have in 5 minutes."
- **Visual:** Screenshot of the actual reveal from the live demo you just did
  (take a screenshot during the demo, or have a backup pre-made). Annotated
  with hand-drawn circles around the interesting patterns that emerged. This
  is the only slide that changes every time you give the talk — it's unique
  to this audience's data, which makes it feel personal.

---

## Act 4: How It Fits (8 min)

### Slide 16 — In Refinement
- "Cards for sizing. Shapes for the stuff you're worried about."
- **Visual:** A simple sprint backlog column with ~6 sticky notes. Most are
  grey/neutral with a small card icon ("sized with cards — fine"). Two or
  three are highlighted in color with a small blob icon ("estimated with
  shapes — needs the conversation"). The visual should make it obvious this
  isn't all-or-nothing: shapes complement cards, they don't replace them.

### Slide 17 — In Sprint Planning
- "Lots of pancakes in the sprint? You're overcommitting on unknowns."
- **Visual:** Two sprint canvases side by side. Left ("risky sprint"): mostly
  flat pancakes, overlapping into a wide, uncertain mess — a blob of doubt.
  Right ("solid sprint"): mostly tall, narrow spikes with one or two pancakes.
  The risk difference is viscerally obvious without any numbers. Label:
  "Which sprint would you commit to?"

### Slide 18 — For the Scrum Master / Coach
- "You stop being the person who says 'let's discuss' and start being the
  person who says 'tell us about your pancake.'"
- (Beat. Let them laugh.)
- **Visual:** A facilitation cheat sheet — three small pattern thumbnails from
  slides 10–12 arranged vertically, each with a one-line action:
  - [spike + pancakes] → "Ask the spike"
  - [tight cluster] → "Move on"
  - [cluster + outlier] → "Stop. Listen."
  Clean, reference-card style. Something people might want to photograph for
  later. Could also work as a physical handout.

### Slide 19 — What This Means for You
- "The tool surfaces disagreements. You facilitate the conversation."
- "Free. Open source. Single file. Works tomorrow."
- **Visual:** Minimal. Just the two lines of text on a clean background.
  This is a moment for the audience to sit with the implication, not look
  at a graphic. White space is the design.

### Slide 20 — Close
- 🧵 AI thread (closing breadcrumb): "There's a Medium article about how this
  got built. It's written from the perspective of the one who wrote all 16,000
  lines of code." Pause. "It wasn't me."
- Leave it there. Don't explain. Let the curious ones find the article.
- "Especially if you can figure out the mobile landscape layout. Neither of us
  could."
- **Visual:** Three QR codes side by side, evenly spaced, with minimal labels
  beneath each: "Try it" (app URL), "Source" (GitHub), "The story" (Medium
  article). Clean, no clutter. The slide should stay up during Q&A so people
  can scan at their leisure. Consider making the Medium QR slightly smaller
  or lower — it's the curiosity hook, not the main CTA.

---

## Humor Strategy

The article's humor works because it's observational and self-deprecating, never
sarcastic toward the audience. The deck should follow the same rules:

### What works
1. **Honest observations about rituals everyone recognizes** — the planning poker
   algorithm (slide 4) gets a laugh because it's true. Nobody needs to be the
   butt of the joke; the process is.
2. **The word "pancake"** — it's inherently funny and keeps recurring. "Tell us
   about your pancake" (slide 18) lands because the audience has already been
   primed by the visual. Let the metaphor do the comedy.
3. **Understatement and beats** — "To be fair, cards are fun" (slide 6) after a
   serious point. "Ah, we have a volunteer" when someone shows a narrow spike in
   the live demo. These need timing, not emphasis.
4. **The contrast structure** — slides 3, 10, 11, 12 all set up "with cards this
   looks like X" then reveal "with shapes you can see Y." The humor is in the
   contrast, not in a punchline.
5. **Running callback** — "pancake of shame" introduced early (slide 8), called
   back in sprint planning (slide 17) and facilitation (slide 18). The audience
   feels smart for recognizing it.
6. **The AI as a thread, not a reveal** — three small moments (slides 7, 14, 20)
   that don't demand attention. Slide 7: "I described what I wanted and an LLM
   named the math." Slide 14: "I didn't build the P2P part either." Slide 20:
   "the article is written by the one who wrote all 16,000 lines — it wasn't me."
   Each one is easy to miss individually. Together they paint a picture. The
   audience members who connect the dots feel clever. The ones who don't still
   got a full talk about estimation.

### What to avoid
- Don't mock planning poker practitioners — they're your audience
- Don't make the AI the thesis — the thesis is "shapes beat numbers"
- Don't explain why something is funny — if "tell us about your pancake" doesn't
  land on its own, no explanation will save it
- Don't force humor into the live demo — the real patterns will be funnier than
  anything scripted
- Don't pause after the AI breadcrumbs — deliver them casually and move on. The
  weight comes from accumulation, not emphasis.

### Delivery notes
- The article's voice is Claude's (wry, slightly aggrieved). The talk is Wim's.
  The humor should be drier, more deadpan. Less commentary, more pauses.
- The live demo will generate its own comedy. Real audience estimates are always
  funnier than planned examples. Let it breathe.
- The AI thread works like a running gag: each mention is slightly more revealing
  than the last, but none of them are the point. By the closing slide the
  audience has enough to be curious. The Medium article does the rest.
