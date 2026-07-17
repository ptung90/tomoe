# Collaboration Safety — design (edit log · lock-file · auto-backup · identity)

**Date:** 2026-07-17
**Module:** `src/lib/modules/flashcards` (+ small `src/lib/shell.ts`, `ConfigModal`, one Rust command)
**Status:** Design (shape + build order approved; awaiting per-unit implementation)

## Problem

Teams keep Tomoe project files (`.tomoe.json`) on Google Drive / Dropbox and
sometimes edit the same project from two machines. Cloud drives do **not** merge
these files — concurrent edits produce "conflicted copy" files or silent
last-write-wins loss. The already-shipped **save-conflict guard** blocks blind
overwrites at save time, but the team also wants to: know **who** last edited and
**when** (audit), be **warned** when someone else already has the file open, and
have **backups** to recover from mistakes.

## Decisions (from brainstorming)

- **Identity:** a user-typed **"Your name"** (Settings), defaulting to the OS
  username on first run. Stored app-level (localStorage), not in the document.
- **Edit log:** record `{ by, at }` on every save; stored **in the document** so
  it travels with the file and every collaborator sees the same history. Show
  "last edited by X · <when>" prominently + a full-history modal.
- **Lock-file:** advisory — **warn but allow**. On open, if a fresh lock by
  someone else exists → offer Open read-only / Open anyway / Cancel.
- **Auto-backup:** on **every successful save**, keep the **latest N** copies,
  with an **in-app restore** UI. Backup folder is user-picked (recommend a local,
  non-synced folder).
- **Build order:** Unit 0 (identity) → 1 (edit log) → 2 (lock-file) → 3
  (auto-backup). Each is its own increment (TDD + commit).

## Scope note

This spec covers four related but independent units. They ship incrementally in
the order above; each is independently testable and useful. Unit 0 is a shared
foundation consumed by Units 1 and 2.

---

## Unit 0 — Identity

**Rust** (`src-tauri/src/lib.rs`): add a command
`os_username() -> String` returning `std::env::var("USERNAME")` (Windows) or
`USER` (fallback), or `""`. Register it in the `invoke_handler`. No new crate.
(Requires a Rust rebuild for the installed app; `cargo check` gates it.)

**`src/lib/shell.ts`:** add `userName: Writable<string>` seeded from
`localStorage['tomoe.userName']`; a `setUserName(name)` that persists. On startup,
if no stored name, `invoke('os_username')` and set it (best-effort; falls back to
`''` outside Tauri).

**`ConfigModal.svelte`:** add a "Your name" text input bound to `userName`
(persists on change). Used by Units 1 and 2 as the actor identity.

**Tests:** `setUserName` persists + reads back; store defaults from localStorage.
(The Rust command + startup seeding are a human/integration check.)

## Unit 1 — Edit log

**`model.ts`:** `Project.editLog?: { by: string; at: string }[]` — `at` is an ISO
timestamp string; capped to the most recent 50. `parseProject` tolerates a
missing/invalid `editLog` (defaults to `[]`); `serializeProject` writes it.

**Stamping on save** (`stores.ts` + `saveService.doWrite`): a store fn
`stampEditLog(by: string, at: string)` appends `{ by, at }` to
`present.editLog` (capped 50) **without pushing a new history entry** (patch
`history.present` in place, so it neither creates an undo step nor is itself
undoable) and **without** flipping `dirty` (it happens as part of saving).
`doWrite` calls `stampEditLog(get(userName) || 'unknown', new Date().toISOString())`
BEFORE `serializeProject`, so the written file contains the new entry.

**Display:**
- A compact "Last edited by **X** · <relative time>" line in the workspace
  header (derived from `editLog[last]`); hidden when the log is empty.
- An "Edit history" modal (opened from that line) listing entries newest-first
  (`by` + localized absolute time). Read-only.

**Tests:** `parseProject` round-trips `editLog` and tolerates its absence;
`stampEditLog` appends + caps at 50 + does not add an undo step (canUndo
unchanged) + does not set dirty; the "last edited" derivation picks the last
entry; the history modal renders entries.

## Unit 2 — Lock-file (advisory)

**Lock file:** a sidecar `<projectPath>.lock` containing JSON `{ by, at }`
(`at` = ISO). Pure helpers in a new `lib/lockFile.ts`:
- `lockPath(projectPath)` → the sidecar path.
- `isStale(lock, nowMs, ttlMs=30*60_000)` → true if `at` older than ttl.
- `isForeign(lock, me)` → lock.by !== me.

**On open** (`saveService`/`openPath` integration): read `<path>.lock`. If it
exists, is not stale, and is foreign → raise a store `openLock = { by, at }`
that drives a `FileLockModal` (Open read-only / Open anyway / Cancel). On "Open
anyway" or no/stale lock → proceed and **write our own lock** (`{ by: me, at:
now }`). On "read-only" → proceed with a `readOnly` store = true (do NOT take the
lock).

**Read-only:** a `readOnly: Writable<boolean>` store; when true, `save()`
no-ops with a toast ("Opened read-only — someone else holds the lock"). Reset on
every open/new.

**Lock lifecycle:** refresh the lock's `at` on each successful save (keeps an
active editor's lock fresh vs. the TTL). Release (delete the lock) on New / open
another file / window close (Tauri `onCloseRequested` best-effort). A crash
leaves a stale lock, cleaned up by the TTL check on the next open.

**Tests:** `isStale`/`isForeign`/`lockPath` pure logic; the modal wiring +
read-only save-block are component/integration tested where feasible (fs is a
human/integration check).

## Unit 3 — Auto-backup

**Config (app-level, localStorage):** `backupEnabled: boolean`, `backupDir:
string | null`, `backupKeep: number` (default 20). A "Backups" section in
`ConfigModal`: enable toggle, folder picker (`dialog.open({directory:true})`),
keep-N input.

**On successful save** (`saveService.doWrite`, after markSaved): if enabled and
`backupDir` set → write `<slug(projectName)>-<pdfStamp(now)>.tomoe.json` (reuse
`pdfStamp`/slug from `pdfExport`) into `backupDir` with the just-saved text.
Best-effort: a backup failure toasts a warning but never fails the save.

**Prune:** after writing, list `backupDir`, filter files matching this project's
`<slug>-*.tomoe.json`, sort by name (timestamp) descending, delete all beyond
`backupKeep`.

**Restore UI:** a "Backups" modal listing this project's backups newest-first
(filename → parsed timestamp). Each row: **Open** (routes through `openPath` with
the unsaved-changes guard) . A "Open backup folder" button (reveal in OS file
manager). 

**Tests:** the backup filename builder + the prune selection (given a file list +
keep-N → which to delete) are pure and unit-tested; the fs writes/reveal are a
human/integration check.

## Cross-cutting

- All new persistent app config lives in localStorage (like the existing AI
  config / schema library), never in the document — except the **edit log**,
  which is deliberately in the document so it is shared.
- Style with Calm Paper tokens; `lucide-svelte` subpath icons only.
- `npm run check` 0 errors, `npm test` green per unit; Rust changes gated by
  `cd src-tauri && cargo check`.
- Reuse existing helpers: `pdfStamp`/slug (pdfExport), `hashContent`/save flow
  (saveService), modal patterns (AutofillImagesModal/SaveConflictModal), config
  patterns (shell theme/AI config).

## Out of scope / follow-ups

- Real-time multi-user / backend sync (roadmap "Backend proxy").
- Per-record file splitting (a separate storage-model change).
- Periodic (timer-based) backups — only per-save for now.
- Merging conflicted versions (guard + backup mitigate; no auto-merge).
