# Overnight autonomous run — specs #5–#8 (roadmap)

Date: 2026-07-14 (evening) → for morning preview.
Context: The human authorized autonomous overnight execution of the remaining
roadmap specs (#5 Images, #6 Export, #7 AI, #8 Polish) and will preview the
result in the morning. This doc records the order, per-spec MVP scope + the
scoping decisions made WITHOUT interactive brainstorming (the human's morning
preview is the review gate), and what can vs. cannot be verified without the
human (GUI, network, API keys).

## Process (per spec)

Each spec runs the full pipeline: design doc (decisions documented here + in the
spec) → implementation plan → subagent-driven build (per-task implementer +
reviewer) → whole-branch review → fix wave → **merge to `master` on green
automated gates only** (`npm run check` 0 errors, `npm test` green, `npm run
build` OK). Each spec is its own `feat/…` branch merged with `--no-ff`, so the
human can preview each independently. **Manual GUI verification and any
network/API-key live checks are deferred to the human's morning preview** — they
are noted per spec below, not done autonomously.

Decisions are made to a sensible MVP scaled to the flashcard-creator reference
app (`d:\github\flashcard-creator`); larger/optional pieces are deferred and
noted. If a spec proves too large, a coherent first slice ships and the rest is
recorded as a follow-up.

## Order + per-spec MVP scope

### #5 — Images (search + crop + set)
- **Search:** Wikimedia Commons API (`https://commons.wikimedia.org/w/api.php`) — **keyless**, no auth. Query → thumbnail results → pick → set the field's image (data-URL or remote URL). Use Tauri `plugin-http` for CORS-free fetch in the desktop app (fallback `fetch` under vitest/browser). Unsplash (needs key) is out.
- **Crop:** `cropperjs` — crop a chosen/pasted image to a data-URL before setting.
- **Wire into:** `ImageField` (used by records form + card editor) gains "Search" + "Crop" actions alongside the existing URL/paste/pick.
- **Verify (human, morning):** live search needs network; crop is a GUI interaction.
- **Autotest:** search parse (mocked http response), crop util (pure where possible), ImageField actions render.

### #6 — Export (print / PDF)
- **Approach:** a print route/view that lays out all cards (or a chosen schema's cards) at real paper size, one per page, then `window.print()` — the webview's print dialog lets the user "Save as PDF". No heavy deps (no jsPDF/html2canvas), no key. Honors paper size/orientation + `@media print` CSS.
- **Scope:** print all packed + auto cards; print CSS with page breaks; a toolbar "Print / Export PDF" action.
- **Verify (human, morning):** the actual print dialog + PDF output.
- **Autotest:** the print-layout builder produces one page per card with correct paper dims (structural assertions on the generated HTML/string).

### #7 — AI (generate / edit records)
- **Approach:** provider-agnostic AI service (Anthropic default per project CLAUDE.md; OpenAI optional), API key stored in project/app settings (localStorage). A chat/prompt panel that can (a) generate records for a schema from a prompt, (b) rewrite a record field. Operations applied through the existing pure record ops.
- **Requires the human's API key** — cannot be run live autonomously. Built + unit-tested with a **mocked** provider; the prompt-building + operation-applying logic is pure/testable.
- **Verify (human, morning):** enter an API key, run a real generate/rewrite.
- **Autotest:** prompt builder, response→operations parser, operation application (mocked API, no network).

### #8 — Polish
- Concrete items (scoped): **recent files** (persist + reopen from Start screen), **backup** (write a timestamped copy on save, or an explicit "backup" action), **multi-language** niceties (project locale UX already exists — tighten). Pick the highest-value subset that's fully autonomously verifiable; defer the rest.
- **Verify (human, morning):** GUI flows.
- **Autotest:** recent-files store/persistence, backup writer (mocked fs), pure bits.

## Guardrails

- Never weaken a test to make it pass; never skip the whole-branch review or fix wave.
- Card interior = fixed print colors; chrome = Calm Paper tokens; lucide subpath imports; module isolation; pure logic immutable + TDD — all unchanged from prior specs.
- New dependencies (`cropperjs`, `@tauri-apps/plugin-http`) added only where the spec needs them; note them in the spec.
- If blocked (e.g. a decision with no sensible default, or a gate that can't pass without the human), stop that spec, record the blocker here, and move to the next.

## Progress log (updated as specs land)

- ✅ #5 Images — merged `9263d98` (searchWikimedia keyless + ImageSearchModal + CropModal cropperjs + ImageField Search/Crop). 251 tests. Human morning: live Wikimedia search (network) + crop canvas. Minor follow-ups noted in the branch ledger (crossOrigin comment, tainted/search toast, modal a11y).
- ✅ #6 Export — merged `088af3d` (collectPrintCards + PrintView @media-print isolation + Workspace Print button → window.print). 258 tests. Whole-branch review caught + FIXED an Important cross-module bug (persisted global print-hide rule → scoped via `:has(.print-view)`). Human morning: print dialog / Save-as-PDF.
- (pending) #7 AI
- (pending) #8 Polish
