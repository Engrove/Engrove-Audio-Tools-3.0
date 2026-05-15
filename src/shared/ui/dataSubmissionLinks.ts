import { escapeHtml } from './renderSafe';

const GITHUB_ISSUE_BASE =
  'https://github.com/Engrove/Engrove-Audio-Tools-3.0/issues/new';

export const DATA_SUBMISSION_URLS = {
  choose: `${GITHUB_ISSUE_BASE}/choose`,
  missingGear: `${GITHUB_ISSUE_BASE}?template=missing-gear.yml`,
  incorrectData: `${GITHUB_ISSUE_BASE}?template=incorrect-data.yml`,
  missingData: `${GITHUB_ISSUE_BASE}?template=missing-data.yml`,
} as const;

export type DataSubmissionKind =
  | 'choose'
  | 'missingGear'
  | 'incorrectData'
  | 'missingData';

type RenderDataSubmissionLinkOptions = {
  kind?: DataSubmissionKind;
  label?: string;
  className?: string;
};

export function renderDataSubmissionLink(
  options: RenderDataSubmissionLinkOptions = {},
): string {
  const kind = options.kind ?? 'choose';
  const label = options.label ?? 'Missing your gear? Submit data here';
  const className = options.className ?? 'data-submission-link';

  return `<a class="${escapeHtml(className)}" href="${DATA_SUBMISSION_URLS[kind]}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}
