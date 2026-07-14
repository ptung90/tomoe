# Tomoe Foundation — SDD ledger
Plan: flashcard-creator/specs/2026-07-14-tomoe-foundation-plan.md
Target repo: d:/github/tomoe (created in Task 1)
Verification split: subagents run check+test+vite build; tauri dev/build+visual = human.

Task 1: complete (tomoe 45b8a8b..f094987, review clean). Fork+rebrand; 132/132 tests, vite build ok. Used cp -r fallback (git archive CRLF issue). GUI launch deferred to human.
Task 2: complete (tomoe f094987..ac77615, review clean). json-table module + AI stripped; 110 tests, vite ok. MINOR (final-review): unused @tauri-apps/plugin-http dep. NOTE: ConfigModal deleted (was 100% AI) -> Task 5 recreates theme-only.
Task 3: complete (tomoe ac77615..5532874, review clean). flashcards model.ts + tests (4/4). MINOR: looksLikeFlashcards untested here (routing test Task 5 covers).
Task 4: complete (tomoe 5532874..f90764d, review clean). Contract+flashcards module+minimal shell.ts(toast); io 4/4, suite 118 (1 pre-existing Toast/jsdom animate error). MINOR: dead .panel class in flashcards Workspace. NOTE Task5: extend shell.ts (activeModuleId/theme/config), recreate theme-only ConfigModal, unify toast to shell, adapt json-table facade to real stores/io exports, rewrite Toolbar module-agnostic.
Task 5: complete (tomoe f90764d..2cf3df8, review clean, 9/9 risks pass). Multi-module shell: registry/routing/start screen/App/Toolbar/ConfigModal/toast-unify; routing 4/4, suite 123. MINOR(final): orphaned theme/setTheme in json-table stores; two-column UI toggle dropped (store intact, default true).
Task 6: complete (tomoe 2cf3df8..caee713, review clean). Teal-600 accent in theme.css (3 blocks).
Final review (opus, 45b8a8b..caee713): Ready WITH FIXES.
 IMPORTANT #1: unsaved-changes guard dropped from shell openPath+New (data loss on json-table; spec §6). Fix at shell level via active module dirty+confirm.
 MINORS to fix: dead @tauri-apps/plugin-http (pkg+Cargo+lib.rs+capabilities http entry); orphaned theme/setTheme in json-table stores; dead io.ts open funcs (trap: divergent guarded openPath); .panel dead class; add Element.animate polyfill to vitest setup (clears 2 Toast/jsdom unhandled errors).
 DEFER (later specs): flashcards beforeunload guard, two-column toolbar slot, filename-in-toolbar.
Final-fix: complete (tomoe caee713..7c82974). All 6 findings fixed. Gates: check 0 err, test 123 pass 0 unhandled errors, vite ok, cargo check ok.
FOUNDATION COMPLETE (7 commits 45b8a8b..7c82974 on tomoe master).
HUMAN-PENDING: GUI flows via tauri dev; tauri build installer.
