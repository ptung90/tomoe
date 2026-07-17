import { hashStr } from './hash';

/** Hash of a file's full text content — the baseline we compare against to detect that the
 *  file on disk changed out from under us (e.g. a cloud-sync client wrote another machine's
 *  version). Non-crypto; content-based (not mtime, which cloud sync touches spuriously). */
export function hashContent(text: string): string {
  return hashStr(text);
}

/** True when the on-disk text no longer matches the baseline hash we last synced with
 *  (on open, or on a successful save). A null baseline (new unsaved doc, or a load without a
 *  known on-disk text) is never a conflict. */
export function hasExternalChange(baselineHash: string | null, diskText: string): boolean {
  return baselineHash !== null && hashStr(diskText) !== baselineHash;
}
