# Tomoe Spec #8 — Polish: Recent files (design)

Date: 2026-07-14 (autonomous overnight run; decisions made without interactive brainstorming — see overnight plan doc).
Status: Approved-by-delegation → ready for implementation plan
Scope: shell-level (`src/lib/`), not a single module.
Depends on: foundation shell (fileService, StartScreen) merged.

## Goal

Let the user reopen a recently used file in one click from the Start screen,
instead of navigating the OS file picker every time.

## Scope

**In scope**
- `lib/recentFiles.ts` (shell-level): a `recentFiles` store (persisted to `localStorage`, newest-first, capped at 10, deduped by path), with `recordRecent(path)`, `removeRecent(path)`, `clearRecent()`, and pure helpers `basename(path)` + `pushRecent(list, path, ts)`.
- `fileService.openPath`: record the file in the recent list after a successful open (the one shell chokepoint every open flows through — picker, cold-start, warm-start, and click-to-reopen).
- `StartScreen.svelte`: a **Recent** section below the actions listing recent files (name + muted path) → click reopens via `openPath` (which already guards unsaved changes); a per-item remove (×) and a **Clear** action. Hidden when empty.

**Out of scope (deferred, documented)**
- **Backup-on-save** (timestamped copy on save): needs a shell-level save chokepoint or a module-contract change — each module owns its own `save()`. Deferred to keep this spec shell-isolated and to avoid a cross-module save hook. Follow-up.
- **Multi-language niceties**: the project-locale UX already exists (LocaleBar, per-field locale editing); no concrete, high-value, autonomously-verifiable increment identified. Deferred.
- Recording on **save** (capturing a brand-new file's path the moment it's first saved): same save-chokepoint gap as backup; open-time recording covers the dominant reopen case. Follow-up.
- Pinning/reordering recents, thumbnails, "open recent" in a menu/toolbar.

## Decisions (made autonomously)

- **Record on open, at the `fileService.openPath` chokepoint.** Every way a file becomes active — picker, launch file, warm-start event, and clicking a recent entry — funnels through `openPath`, so one call there covers them all and keeps recording out of the module facades. (Save-time recording needs a chokepoint that doesn't exist yet — deferred.)
- **localStorage, capped at 10, deduped by path, newest-first.** Recents are app/device state, not document state — never in the project file. `pushRecent` is pure (ts injected) so ordering/dedup/cap are unit-tested without touching storage or the clock.
- **Reopen goes through `openPath`,** which already runs `confirmDiscardIfDirty` — clicking a recent while the active module is dirty prompts before discarding, same as the picker. Missing/renamed files surface the existing "Cannot open file" error toast; the entry stays (the user can remove it).
- **Recent-files-only for #8.** A tight, fully-verifiable final polish deliverable beats a sprawling one; backup + multi-lang are recorded as follow-ups.

## Architecture

```
src/lib/
  recentFiles.ts            # NEW: recentFiles store + record/remove/clear + pure basename/pushRecent
  fileService.ts            # MODIFY: recordRecent(path) after a successful openPath
  components/
    StartScreen.svelte      # MODIFY: Recent section (reopen / remove / clear)
```

- `recentFiles.ts` is shell-level (sibling of `shell.ts`), imported by both `fileService` (writer) and `StartScreen` (reader) — no module dependency, no cross-module reactivity.

## Data flow

```
open (picker / launch / warm-start / recent click) → openPath(path)
  → confirmDiscardIfDirty → readTextFile → pickModuleForOpen → mod.open(text,path)
  → recordRecent(path)  → recentFiles store + localStorage (newest-first, cap 10)
StartScreen: $recentFiles → list → click → openPath(path) ; × → removeRecent ; Clear → clearRecent
```

## Error handling / edge cases

- Open fails (bad/missing file) → existing error toast; `recordRecent` is NOT called (it runs only after `mod.open` succeeds), so failures don't pollute the list.
- Clicking a recent whose file was since deleted/moved → `openPath` shows the error toast; the entry remains (removable via ×).
- `localStorage` unavailable/corrupt → load returns `[]`, writes are swallowed (try/catch); the app still works, recents just don't persist.
- Same path opened again → moves to the top (dedup), not duplicated.

## Testing

- `recentFiles.test.ts`: `basename` (posix + windows separators); `pushRecent` (newest-first, dedup moves-to-top, cap 10, name from path) — pure, ts injected; `recordRecent`/`removeRecent`/`clearRecent` persist to `localStorage` (jsdom).
- `fileService` (focused): with `@tauri-apps/plugin-fs`/`plugin-dialog` and the registry mocked, `openPath('/x.tomoe.json')` calls `recordRecent` after a successful open; on a read failure it does NOT record.
- `StartScreen.test.ts`: seeded `recentFiles` render an entry per file; clicking one calls `openPath` (mocked); × calls `removeRecent`; Clear empties the list; empty store → no Recent section.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.
- **Manual (human, morning):** open a couple of files, relaunch/return to Start → they appear under Recent → click reopens; × and Clear behave.

## References

- Reuse `fileService.openPath` (the open chokepoint, with its dirty guard), `StartScreen.svelte`, Calm Paper tokens, lucide subpath icons. Mirrors the `localStorage`-backed app-state pattern established by `theme.ts` and #7's `aiConfig`.
