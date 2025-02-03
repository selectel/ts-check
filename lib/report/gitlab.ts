import type { Issue, Category, Severity, Location } from 'codeclimate-types';

import { createHash } from 'crypto';
import { dirname, relative } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

import type { ReportRecord } from './types';
import type { Diagnostic } from '../utils';
import { diagnosticToLocation, diagnosticToMessage } from '../utils';

const { CI_PROJECT_DIR = process.cwd() } = process.env;

/**
 * {@link https://gitlab.com/remcohaszing/eslint-formatter-gitlab/-/blob/main/lib/eslint-formatter-gitlab.js?ref_type=heads#L73}
 *
 * @param file The path to the linted file.
 * @param message The TypeString server diagnostic.
 * @param hashes Hashes already encountered. Used to avoid duplicate hashes
 * @returns The fingerprint for the ESLint report message.
 */
const diagnosticToFingerprint = (file: string, diagnostic: Diagnostic, hashes: Set<string>) => {
  const md5 = createHash('md5');
  md5.update(file);

  if (diagnostic.code) {
    md5.update(`TS${diagnostic.code}`);
  }

  const message = diagnosticToMessage(diagnostic);
  md5.update(message);

  // Create copy of hash since md5.digest() will finalize it, not allowing us to .update() again
  let md5Tmp = md5.copy();
  let hash = md5Tmp.digest('hex');

  while (hashes.has(hash)) {
    // Hash collision. This happens if we encounter the same ESLint message in one file
    // multiple times. Keep generating new hashes until we get a unique one.
    md5.update(hash);

    md5Tmp = md5.copy();
    hash = md5Tmp.digest('hex');
  }

  hashes.add(hash);
  return hash;
};

const diagnosticToIssueCategory = (diagnostic: Diagnostic): Category => {
  if (diagnostic.category === 'error') return 'Bug Risk';
  return 'Clarity';
};

const diagnosticToIssueSeverity = (diagnostic: Diagnostic): Severity => {
  if (diagnostic.category === 'error') return 'major';
  if (diagnostic.category === 'warning') return 'minor';
  return 'info';
};

const diagnosticToIssueLocation = (file: string, diagnostic: Diagnostic): Location => {
  const location = diagnosticToLocation(diagnostic);
  return {
    path: file,
    positions: {
      begin: {
        line: location.start.line,
        column: location.start.offset,
      },
      end: {
        line: location.end.line,
        column: location.end.offset,
      },
    },
  };
};

const convert = (records: ReportRecord[]): Issue[] => {
  const hashes = new Set<string>();
  const issues: Issue[] = [];

  for (const { file, diagnostics } of records) {
    const relativePath = relative(CI_PROJECT_DIR, file);

    for (const diagnostic of diagnostics) {
      const issue: Issue = {
        type: 'issue',
        check_name: diagnostic.code ? `TS${diagnostic.code}` : '',
        description: diagnosticToMessage(diagnostic),
        categories: [diagnosticToIssueCategory(diagnostic)],
        severity: diagnosticToIssueSeverity(diagnostic),
        fingerprint: diagnosticToFingerprint(relativePath, diagnostic, hashes),
        location: diagnosticToIssueLocation(relativePath, diagnostic),
      };

      issues.push(issue);
    }
  }

  return issues;
};

export const gitlabReport = (records: ReportRecord[], outputPath: string) => {
  const issues = convert(records);
  const dir = dirname(outputPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(issues, null, 2));
};
