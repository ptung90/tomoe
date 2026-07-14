# Tomoe Spec #6 — Flashcards Export (print / PDF) (design)

Date: 2026-07-14 (autonomous overnight run; decisions made without interactive brainstorming — see overnight plan doc).
Status: Approved-by-delegation → ready for implementation plan
Module: `src/lib/modules/flashcards/`
Depends on: specs #4a/#4b (cards), #3 (render engine) merged.

## Goal

Let the user print all their flashcards — and thereby export to PDF via the
system print dialog's "Save as PDF" — one card per page at true paper size.

## Scope

**In scope**
- `lib/printCards.ts` (pure): `collectPrintCards(project): Card[]` — every schema's persisted packed cards + auto-derived cards for still-unpacked records, in schema order (the exact set the Cards gallery shows). Reuses `cardsPerPage`/`chunkRecords`/`recordsToCard`/`schemaForCard`/`deriveAutoTemplate`.
- `PrintView.svelte`: an off-screen container (hidden on screen) that renders each collected card via `buildCardHTML` at real paper px, one per `.print-page`, with `@media print` isolation (only the print view prints; app chrome hidden) and a page break per card.
- A **Print / Export PDF** button in the Workspace header → `window.print()`.

**Out of scope**
- A PDF library (jsPDF/html2canvas) — rely on the webview print dialog's Save-as-PDF. `pdfImageFormat`/`pdfScale` settings are ignored for now.
- Print scope options (per-schema, selection) — print all. Print preview screen. Page headers/footers/margins config.

## Decisions (made autonomously)

- **Browser print, no PDF dep.** Tauri's webview (Chromium/WebView2) has a full print dialog with "Save as PDF". Building the print layout as real DOM and calling `window.print()` is keyless, dependency-free, and honors the card CSS. A jsPDF/html2canvas pipeline would add heavy deps + rasterization quirks for no real gain here.
- **Print = the gallery's card set.** `collectPrintCards` returns exactly what the Cards view shows (packed snapshots + auto cards for unpacked records), so print output matches the on-screen gallery.
- **Isolation via a print stylesheet.** `PrintView` is `display:none` on screen; a `:global(@media print)` block hides everything except `.print-view` and shows it full-page (`body * { visibility:hidden } .print-view, .print-view * { visibility:visible }` + absolute positioning), with `.print-page { break-after: page }`. This is scoped inside the flashcards module (PrintView's `<style>`), added only when the flashcards workspace is mounted.
- **Paper size** = each card's `size` or `project.settings.paperSize`; orientation from the card/settings. Each `.print-page` sized to `getPaperPx` at scale 1 (real size); `buildCardHTML` sizes the card within.

## Architecture

```
src/lib/modules/flashcards/
  lib/printCards.ts        # NEW: collectPrintCards(project) → Card[]
  components/
    PrintView.svelte       # NEW: off-screen; real-size cards + @media print isolation
  Workspace.svelte         # MODIFY: "Print / Export PDF" header button + mount <PrintView/>
```

- `PrintView` is mounted once in `Workspace` (renders in both Records and Cards views; hidden on screen, only materializes for print). The Print button calls `window.print()`.
- `collectPrintCards` is pure and mirrors `CardGallery`'s grouping so on-screen and printed sets are identical.

## Data flow

```
Print button → window.print()
  → @media print: hide app, show .print-view (built from collectPrintCards($project))
  → each card = one page at real paper px via buildCardHTML
  → user picks a printer or "Save as PDF"
```

## Error handling / edge cases

- No cards (no records) → PrintView renders nothing; printing yields a blank/empty document (acceptable; a future guard could disable the button when there are 0 cards — include: disable the Print button when `collectPrintCards` is empty).
- Cards taller than the page → clipped by the card's own `overflow:hidden` (same as preview); not this spec's concern.
- Packed (snapshot) vs auto (derived) both render via `buildCardHTML` identically.

## Testing

- `printCards.test.ts`: `collectPrintCards` returns packed + auto cards for each schema in order (e.g. a 3card schema with 4 records + 1 packed card of 3 → 1 packed + 1 auto = 2; a single-layout schema with 3 records → 3); empty project → `[]`.
- `PrintView.test.ts`: renders one `.print-page` per collected card, each containing a `.fc-card` (jsdom; `buildCardHTML` is a pure string, no TipTap). (The `@media print` behavior itself isn't asserted in jsdom.)
- `flashcards-workspace.test.ts` (extend): the Print button calls `window.print` (mock `window.print`); it is disabled when there are no cards.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.
- **Manual (human, morning):** click Print → the webview print dialog shows one card per page at the right size; "Save as PDF" produces a correct PDF.

## References

- flashcard-creator `src/css/preview.css` `@media print` block (`.fc-card--print { page-break-after: always }`, hide chrome) — adapted to Svelte `:global` + the visibility-isolation trick.
- Reuse `buildCardHTML`/`getPaperPx` (`lib/card-render.ts`), `collectPrintCards` mirrors `CardGallery`'s packed+auto logic (`cardOps.schemaForCard`, `cardMapping`), `card-render.css`.
