import { slugifyName } from './filename';

/** Backup filename for a project: "<slug>-<stamp>.tomoe.json". */
export function backupFileName(projectName: string, stamp: string): string {
  return `${slugifyName(projectName) || 'project'}-${stamp}.tomoe.json`;
}

/** Whether `name` is a backup of this project (its slug prefix + our suffix). */
export function isBackupOf(name: string, projectName: string): boolean {
  const slug = slugifyName(projectName) || 'project';
  return name.startsWith(slug + '-') && name.endsWith('.tomoe.json');
}

/** Given this project's backup filenames and a keep count, the ones to DELETE — everything but the
 *  newest `keep`. Timestamped names sort chronologically as text, so lexical-desc = newest first. */
export function selectToPrune(names: string[], keep: number): string[] {
  const sorted = [...names].sort().reverse();
  return sorted.slice(Math.max(0, keep));
}
