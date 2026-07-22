import type { Component } from 'svelte';
import type { Readable } from 'svelte/store';

export interface TomoeModule {
  id: string;                 // 'flashcards' | 'json-table'
  label: string;              // 'Flashcards' | 'JSON Table'
  icon?: Component;
  extensions: string[];       // file extensions this module owns, e.g. ['tomoe.json'] / ['json']
  matches?(text: string): boolean;  // content sniff for ambiguous extensions
  Workspace: Component;       // reads/writes this module's own stores
  newDoc(): void;             // reset this module's store to an empty document
  open(text: string, path: string | null): void;  // parse text into this module's store
  save(): Promise<void>;      // this module serializes + writes (native) + toast
  saveAs?(): Promise<void>;   // always prompt for a new path (Save As…), then write there
  filePath: Readable<string | null>;  // current bound file, or null when unsaved (drives auto-save)
  dirty: Readable<boolean>;
  canUndo: Readable<boolean>;
  canRedo: Readable<boolean>;
  undo(): void;
  redo(): void;
}
