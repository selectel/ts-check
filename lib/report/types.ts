import type { Diagnostic, Frame } from '../utils';

export type ReportRecord = {
  file: string;
  diagnostics: Diagnostic[];
  code: string[][];
  frame: Frame;
};
