export type StopStatus = {
  checkFailed: boolean;
  totalErrors: number;
  needsSync: boolean;
  codeLines: number;
  latMdLines: number;
};

/** Minimum code change size (lines) before we consider flagging lat.md/ sync. */
const DIFF_THRESHOLD = 5;

/** lat.md/ changes below this ratio of code changes trigger a sync reminder. */
const LATMD_RATIO = 0.05;

/** If lat.md/ changes exceed this many lines, skip the ratio check entirely. */
const LATMD_UPPER_THRESHOLD = 50;

export function computeNeedsSync(codeLines: number, latMdLines: number): boolean {
  if (codeLines < DIFF_THRESHOLD || latMdLines >= LATMD_UPPER_THRESHOLD) {
    return false;
  }

  const effectiveLatMd = latMdLines === 0 ? 0 : Math.max(latMdLines, 1);
  return effectiveLatMd < codeLines * LATMD_RATIO;
}

export function buildStopStatus(input: {
  checkFailed: boolean;
  totalErrors: number;
  codeLines: number;
  latMdLines: number;
}): StopStatus {
  return {
    ...input,
    needsSync: computeNeedsSync(input.codeLines, input.latMdLines),
  };
}

// @lat: [[cli#hook#Stop]]
export function formatStopReason({
  checkFailed,
  totalErrors,
  needsSync,
  codeLines,
  latMdLines,
}: StopStatus): string | null {
  if (!checkFailed && !needsSync) return null;

  const parts: string[] = [];

  const syncMsg =
    latMdLines === 0
      ? 'The codebase has changes (' +
        codeLines +
        ' lines) but `lat.md/` was not updated.'
      : 'The codebase has changes (' +
        codeLines +
        ' lines) but `lat.md/` may not be fully in sync (' +
        latMdLines +
        ' lines changed).';

  if (checkFailed && needsSync) {
    parts.push(
      '`lat check` found errors. ' + syncMsg + ' Before finishing:',
      '',
      '1. Update `lat.md/` to reflect your code changes — run `lat search` to find relevant sections.',
      '2. Run `lat check` until it passes.',
    );
  } else if (checkFailed) {
    parts.push(
      '`lat check` found ' +
        totalErrors +
        ' error(s). Run `lat check`, fix the errors, and repeat until it passes.',
    );
  } else {
    parts.push(
      syncMsg +
        ' Verify `lat.md/` is in sync — run `lat search` to find relevant sections. Run `lat check` at the end.',
    );
  }

  return parts.join('\n');
}
