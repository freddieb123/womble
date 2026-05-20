# Womble: Slides + Activity Diversity — Design Notes

_May 2026_

---

## Context

The goal is to consolidate the online learning experience into one app — moving beyond AI conversation activities into structured content delivery, live polling, and diverse assessment types. Slides are the connective tissue the current app is missing: a way to set context, debrief, and pace a session around the interactive activities. The broader ambition is for a session to feel like a complete lesson plan rather than a collection of loose activities.

---

## Current Activity Types (what already exists)

`chat`, `teach-ai`, `thought-partner`, `two-way-conversation`, `quiz`, `quick-fire-quiz`, `upload`, `group-board`

---

## Priority 1: Slides Activity Type

### What it is
A presentation activity. Facilitator builds a slide deck inside Womble. In **facilitated mode**, the facilitator controls which slide all participants see in real-time. In **self-paced mode**, participants navigate freely.

### Slide layouts
- `title` — large heading + subtitle
- `text` — heading + markdown body
- `bullet` — heading + bullet list
- `image` — full-width or inline image
- `split` — text column + image column
- `video` — embedded YouTube/Vimeo iframe
- `quote` — pull-quote with attribution

### Data model
No new columns needed on `chatConfigs`. Slide content lives in `userInstructions` as a `SlidesConfig` JSON object. Live state (current slide index, phase) goes in a new generic `activityState` table. Real-time sync via **polling every 1.5s** — slides advance at human pace, so polling is invisible latency and far simpler than WebSocket.

### New components needed
- `SlidesEditor.tsx` — slide builder in the admin wizard
- `SlidesInterface.tsx` — participant full-screen view
- `SlidesAdminControl.tsx` — facilitator prev/next/jump controls

---

## Priority 2: Poll Activity Type

### What it is
Single-question live vote with a real-time bar chart (`recharts` already installed). Facilitator controls when results are revealed.

### Config (stored as JSON in `userInstructions`)
```
question, options (2–6), allowMultiple, revealMode: 'manual' | 'after-all-vote'
```
Responses go in a new generic `activityResponses` table. State (voting / revealed / closed) in `activityState`.

### New components needed
- `PollInterface.tsx` — participant voting + bar chart reveal
- `PollAdminControl.tsx` — reveal/close/reset controls

---

## Priority 3: Session as Lesson Plan

### SessionControlPanel
A facilitator control bar on the session detail:
- "Next Activity / Previous Activity" buttons → single `PATCH /api/sessions/:id/advance` endpoint
- Progress visualization: done / live / upcoming
- Time elapsed per activity
- Replaces manually toggling `isLive` per activity — the whole session advances like a presentation

### Lesson Plan View
A tab in the session detail panel showing:
- Ordered activities with type badges + estimated durations
- Total estimated session length
- Currently-live activity highlighted
- Drag-to-reorder (already works)

---

## Other Activity Types (prioritised)

| Priority | Type | Why | Complexity |
|---|---|---|---|
| 1 | **Word Cloud** | High visual impact, great opener. Participants submit words → frequency cloud. Real-time via WebSocket. | Low |
| 2 | **Video + Reflection** | Zero new code — a `slides` video slide followed by an existing `chat` or `quiz`. Implement as a **session template**. | None |
| 3 | **Fill-in-the-Blank** | Text with `{{blank}}` gaps, AI fuzzy-grading on submit. | Low–Medium |
| 4 | **Matching** | Drag-to-match using `@dnd-kit` (already installed). | Medium |
| 5 | **Sorting/Categorisation** | Drag items into buckets. Same `@dnd-kit` foundation. | Medium |
| 6 | **Reflection Journal** | `thought-partner` with journal UI. Implement as a `journalMode: true` flag, not a new type. | Low |
| 7 | **Peer Review** | Participants review each other's uploads. Needs assignment table + anonymity. | High |
| 8 | **Branching Scenario** | Multi-step state machine. High value, high cost. Defer. | High |

---

## Architecture

### Two new generic tables (replace per-type proliferation)

```sql
-- Generic live state per activity
activityState:
  configId    INTEGER PK REFERENCES chat_configs(id)
  phase       TEXT NOT NULL DEFAULT 'waiting'
  stateData   JSONB NOT NULL DEFAULT '{}'
  updatedAt   TIMESTAMP DEFAULT NOW()

-- Generic per-participant responses
activityResponses:
  id              SERIAL PK
  configId        INTEGER NOT NULL REFERENCES chat_configs(id)
  participantId   TEXT NOT NULL
  userName        TEXT
  payload         JSONB NOT NULL DEFAULT '{}'
  createdAt       TIMESTAMP DEFAULT NOW()
  UNIQUE(configId, participantId)

-- Per-participant progress tracking
sessionProgress:
  id             SERIAL PK
  sessionDbId    INTEGER NOT NULL REFERENCES sessions(id)
  participantId  TEXT NOT NULL
  configId       INTEGER NOT NULL REFERENCES chat_configs(id)
  status         TEXT NOT NULL DEFAULT 'not_started'
  completedAt    TIMESTAMP
  UNIQUE(sessionDbId, participantId, configId)
```

### Type column migration
The `type` column is currently a Postgres enum. Migrate to `TEXT` once (one `ALTER TABLE` statement). Zod validates valid values at the app layer. Removes friction for every future type addition.

### Recommended build order
1. Migrate type column to TEXT
2. Add `activityState`, `activityResponses`, `sessionProgress` tables
3. Slides (editor → participant view → admin control → routes → wire into session)
4. Poll
5. SessionControlPanel + Lesson Plan View
6. Word Cloud
7. Fill-in-the-Blank → Matching

### Critical files to modify
- `db/schema.ts` — new tables, type column migration
- `client/src/lib/types.ts` — `SlidesConfig`, `SlideBlock`, `PollConfig` interfaces
- `server/routes.ts` — new route handlers, type validation
- `client/src/pages/SessionView.tsx` — add new activity types to switch
- `client/src/pages/UserView.tsx` — same
- `client/src/components/CreateGptWizard.tsx` — add `'slides'` and `'poll'` to type picker

---

## Importing Google Slides or PowerPoint

### Option A — Import as images (easiest, ~1–2 days)

Both Google Slides and PowerPoint can be exported as per-slide images. Each slide in Womble becomes a `layout: 'image'` slide.

- **Google Slides**: The Google Slides API has a `getThumbnail` endpoint returning a PNG per slide. Requires Google OAuth (Firebase is already set up, so adding a Google OAuth scope is low friction). ~10–15 lines of API calls to import a full deck.
- **PowerPoint (.pptx)**: Upload to server, run LibreOffice headless to convert to PDF, then render each page as PNG using `pdf-poppler` or `sharp`. Adds a server-side dependency (LibreOffice ~200MB) but is reliable. Alternatively use a conversion API (Cloudmersive, ILovePDF).

**Tradeoff**: Pixel-perfect render but slides are not editable inside Womble.

### Option B — Import as structured content (harder, ~1–2 weeks)

Parse actual text and layout structure and map to Womble's slide types. Google Slides API returns rich JSON per element; PPTX is a ZIP of XML parseable with `pptx2json`. High fidelity loss on complex layouts.

**Tradeoff**: Slides become editable, but visual fidelity suffers.

### Recommendation
Start with Option A. Covers 90% of the use case — most facilitators want to bring existing slides in without rebuilding them. Add a "Re-import from Google Slides" button that refreshes images when the source deck changes.

---

## Slide Builds (progressive reveals)

A "build" means elements on a slide appear one at a time (e.g. bullet points revealing on each click).

### Option A — Flatten builds into sequential slides (simplest)
Each build step is a separate slide tagged with `continueFrom: previousSlideId`. The UI renders them on the same background and suppresses the slide transition. No change to `activityState` needed.

### Option B — Step index in `activityState` (cleanest UX)
`stateData` becomes `{ currentSlide: 2, currentStep: 1 }`. Each `bullet` slide has a `buildItems` array with a `buildIndex` per element. Participant view renders elements up to `currentStep`. Facilitator "Next" advances step first, then slide.

### Option C — No builds (pragmatic for v1)
Keep slides static. Use multiple slides for reveals. Works fine for most learning contexts.

**Recommendation**: Start with Option A (almost free — just a flag on the slide object). Revisit Option B when facilitators need finer control. For Google Slides import, builds collapse to a single final-state image either way unless you render intermediate states manually.

---

## How Slides Improve the Existing Experience

### The core improvement: sessions become lessons

Every activity currently starts abruptly. Slides give you three new structural moments:
- **Before** — set context, frame the task, explain why
- **Between** — transition, reset attention, bridge activities
- **After** — debrief, reveal model answers, summarise learning

### By activity type

**Chat / Teach-AI**
Slides before = scenario briefing or topic introduction. Participants arrive at the chat with no frame of reference. A 2-slide setup ("here's the situation, here's your goal") makes the conversation immediately richer and more focused.

**Quick-Fire Quiz**
The classic "teach then test" loop. Deliver content in slides, then fire the quiz. The competitive element lands much better when participants feel they just learned the material rather than being tested cold.

**Quiz (traditional)**
Pre-teach on slides, then assess. After the quiz, a debrief slide showing model answers gives participants closure that the current flow lacks.

**Group Board**
A brainstorm without a prompt is unfocused. Slides before = problem statement, stimulus material, constraints. Opens the board with everyone aligned on what they're solving.

**Two-Way Conversation**
The biggest gap currently — participants often don't know their role or scenario context before recording. A slide showing role cards, the scenario, and what they'll be assessed on transforms the quality of conversations.

**Upload**
Brief/task specification on a slide before submission. Reduces ambiguity about what to submit and makes feedback more consistent because everyone worked to the same brief.

**Thought Partner**
Prime the coaching conversation with a reflection prompt or case study on a slide first. Participants arrive with something specific to work through rather than starting from scratch.

### The poll + slides combo

Unlocks the "predict → observe → explain" pattern:

1. **Poll**: "What do you think causes X?" — participants commit before seeing any content
2. **Reveal poll results** — shows spread of opinion, creates productive tension
3. **Slides**: explain the correct answer/concept
4. **Activity**: apply it (chat, quiz, group board, etc.)

This is one of the most evidence-backed structures in learning design. Currently impossible in Womble.

### Summary

The experience shift is from _"a collection of AI tools"_ to _"a structured lesson with interactive moments built in."_ Slides make the facilitator visible in the session — right now the facilitator sets things up in the dashboard but essentially disappears from the participant experience. With slides and session-level pacing, the facilitator is actively guiding the room throughout.
