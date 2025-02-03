import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { resolve } from 'path';
import { argv } from 'process';

import { from } from 'rxjs';
import { map, mergeAll, switchMap } from 'rxjs/operators';

import { TsServer } from './tsserver';
import { requestSemanticDiagnostics } from './request';
import { type Frame, readFileCodeFragments } from './utils';
import { type ReportRecord, consoleReport, gitlabReport } from './report';

/**
 * Проверка, что указанный аргумент является массивом строк
 */
function assertArrayOfString(arr: unknown): asserts arr is string[] {
  if (!Array.isArray(arr)) {
    throw new Error('Invalid arguments');
  }
  if (!arr.every((x) => typeof x === 'string')) {
    throw new Error('Invalid arguments');
  }
}

/**
 * Запрос ошибок и чтение участков кода, где были найдены ошибки
 *
 * @param file - относительный путь до файла, то как он был передан в аргументах к команде
 * @returns структура с именем файла, диагностическими сообщениями и участками кода, где эти ошибки
 * были найдены
 */
const requestDiagnosticsWithCodeParts = (server: TsServer, frame: Frame) => (file: string) => {
  const path = resolve(file);
  return requestSemanticDiagnostics(server, path).pipe(
    map(({ body }) => ({ file, diagnostics: body })),
    switchMap((result) =>
      readFileCodeFragments(path, result.diagnostics, frame).then((code) => ({ ...result, code })),
    ),
  );
};

// run
const args = yargs(hideBin(argv))
  .usage('$0 [<files...>]', 'Checking types for the passed list of files', (yargs) => {
    return yargs.option('files', {
      describe: 'A list of files for type checking',
      type: 'string',
      array: true,
      default: [],
    });
  })
  .option('no-color', {
    type: 'boolean',
    description: 'Disable colors for output',
  })
  .option('code-lines-before', {
    alias: 'b',
    type: 'number',
    description: 'Print <number> lines of code before error',
    default: 0,
  })
  .option('code-lines-after', {
    alias: 'a',
    type: 'number',
    description: 'Print <number> lines of code after error',
    default: 0,
  })
  .option('gitlab-report', {
    type: 'string',
    description: 'Path to gitlab code quality report file',
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .version(false)
  .help('h', 'Show a help message')
  .alias('h', 'help')
  .parseSync();

assertArrayOfString(args.files);

let hasError = false;
const frame: Frame = { before: args.codeLinesBefore, after: args.codeLinesAfter };
const server = new TsServer({ verbose: args.verbose });

const gitlabReportPath = args.gitlabReport;
const reportRecords: ReportRecord[] = [];

from(new Set(args.files))
  .pipe(map(requestDiagnosticsWithCodeParts(server, frame)), mergeAll())
  .subscribe({
    next: ({ file, diagnostics, code }) => {
      if (!diagnostics?.length) return;
      reportRecords.push({ file, diagnostics, code, frame });
      hasError ||= diagnostics.some((x) => x.category === 'error');
    },
    error: (error) => {
      console.error(error);
      process.exit(1);
    },
    complete: () => {
      consoleReport(reportRecords);

      if (gitlabReportPath) {
        gitlabReport(reportRecords, gitlabReportPath);
      }

      process.exit(hasError ? 1 : 0);
    },
  });
