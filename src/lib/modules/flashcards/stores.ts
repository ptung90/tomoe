import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, type Project } from './model';

const history = writable<H.History<Project>>(H.createHistory(newProject()));
export const project: Readable<Project> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));
export const dirty: Writable<boolean> = writable(false);
export const filePath: Writable<string | null> = writable(null);

export function initProject(): void { history.set(H.createHistory(newProject())); filePath.set(null); dirty.set(false); }
export function loadProject(p: Project, path: string | null): void { history.set(H.createHistory(p)); filePath.set(path); dirty.set(false); }
export function commit(next: Project): void { history.update((h) => H.push(h, next)); dirty.set(true); }
export function undo(): void { history.update((h) => H.undo(h)); dirty.set(true); }
export function redo(): void { history.update((h) => H.redo(h)); dirty.set(true); }
export function markSaved(path: string): void { filePath.set(path); dirty.set(false); }
export function setProjectName(name: string): void { commit({ ...get(project), projectName: name }); }
