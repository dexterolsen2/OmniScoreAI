# OmniScore AI — Voice-Controlled Multi-Sport Scoreboard

A client-side, zero-build **Voice-Controlled Multi-Sport Scoreboard** designed to be hosted directly on **GitHub Pages** for free.

## Key Features

### 1. Multi-Stage Zero-False-Positive Voice NLU & AI Filter (`nlp-engine.js`)
- **Arbitrary Point Detection**: Say *any* number of points in digits or spoken words (`"Add 17 points to Home"`, `"Give Away one hundred and twenty-five points"`, `"Home plus 4"`, `"Subtract 2 points from Red"`).
- **ASR Homophone Recovery**: Automatically resolves speech-to-text homophones in numeric contexts (`"add to points"` -> `2`, `"give for points"` -> `4`, `"won point"` -> `1`, `"ate points"` -> `8`).
- **Multi-Alternative Consensus**: Evaluates up to 5 N-best speech recognition alternatives per utterance to recover from noisy transcriptions.
- **Self-Correction & Negation Engine**:
  - Understands mid-sentence corrections: `"Add 5 points to Home wait no add 3 points to Away"` -> only adds `3` to `Away`.
  - Blocks negated statements: `"Don't add points"`, `"Nevermind"`, `"Cancel that"`.
- **Conversational Chatter & Hypothetical Speech Filter**:
  - Blocks background conversation, questions, and hypotheticals (`"I think Home needs 3 points to win"`, `"What if Away gets 10 points?"`, `"Did they score 2 points?"`).
- **Phonetic (Soundex) & Fuzzy (Levenshtein) Team Matching**:
  - Recognizes custom team names, colors (`Red`, `Blue`, `Green`, `Gold`, `Purple`, `Orange`), and sides (`Home`, `Away`, `Guest`, `Visitor`, `Left`, `Right`, `Team 1`, `Team 2`) even when slightly mispronounced.
- **100% Free Local AI + Optional Cloud LLM Verification**:
  - Runs 100% free and offline in the browser out of the box, with an optional setting to connect a free-tier Google Gemini (`gemini-2.5-flash`) or Groq API key.

### 2. 12 Dedicated Sport Layouts & Rules (`sports-config.js`)
1. **Basketball** 🏀 — 24s/14s Shot Clock, Quarter Breakdown, Team Fouls & Bonus Badges, Timeouts, Possession Arrow.
2. **Soccer / Football** ⚽ — Count-up Match Clock, Stoppage Time (`+X'`), Yellow/Red Cards, Shots on Target, Corners.
3. **American Football** 🏈 — Down & Distance (`1st & 10`), Yard Line, 40s/25s Play Clock, Possession Icon, TD/FG/PAT/Safety shortcuts.
4. **Baseball / Softball** ⚾ — Interactive Base Diamond (`1B`, `2B`, `3B`), Balls/Strikes/Outs LED indicators, 9-Inning R/H/E Linescore Table.
5. **Ice Hockey** 🏒 — 20:00 Period Clock, Shots on Goal (SOG), Live 2:00 / 5:00 Power Play & Penalty Countdown Timers.
6. **Tennis / Padel** 🎾 — Automatic `0 → 15 → 30 → 40 → AD → Game` state machine, Tiebreak mode toggle, 3-Set Matrix, Server & Aces tracking.
7. **Volleyball** 🏐 — 5-Set Scoreboard, Win-by-2 Set Detection, Service Rotation, Aces & Blocks.
8. **Table Tennis / Ping Pong** 🏓 — 7-Game Match Tracker, Automatic 2-Point Service Rotation (and 1-Point Deuce Rotation), 11/21 Target Toggle.
9. **Rugby Union / League** 🏉 — Tries (+5), Conversions (+2), Penalty Goals (+3), Drop Goals (+3), and 10:00 Sin Bin Timer.
10. **Cricket (T20 / ODI)** 🏏 — Runs/Wickets (`142/4`), Overs (`16.3`), Current Run Rate (CRR), Ball-by-Ball Over Tracker, 4s/6s/Extras/Wickets.
11. **Wrestling / BJJ / Combat** 🥋 — Takedowns, Escapes, Reversals, Near Falls, Warnings, and Live Riding/Control Time Clock.
12. **Universal / Backyard / Cornhole / Darts** 🎯 — Custom Target Score Progress Bars (`21`, `50`, `100`, `501`), Round Delta, and Scoring Streaks.

---

## Deploying to GitHub Pages

1. Push this repository (`index.html`, `styles.css`, `sports-config.js`, `nlp-engine.js`, `app.js`) to GitHub.
2. Go to **Settings → Pages** in your GitHub repository.
3. Under **Build and deployment**, select **Deploy from a branch** → `main` (root `/`).
4. Click **Save** — your voice-controlled scoreboard will be live at `https://<your-username>.github.io/<repo-name>/`!
