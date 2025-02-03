import defaultColors from 'colors/safe';

import type { Frame, Diagnostic } from '../utils';
import { diagnosticToLocation, diagnosticToMessage } from '../utils';
import { ReportRecord } from './types';

const colorsTheme = {
  // header
  fileName: 'brightCyan',
  fileLocation: 'brightYellow',
  errorCode: 'gray',

  // code
  lineNumber: 'inverse',

  // diagnostic
  error: 'brightRed',
  warning: 'brightYellow',
  suggestion: 'brightCyan',
  unknown: 'gray',
};

type Colors = typeof defaultColors & {
  [P in keyof typeof colorsTheme]: (input: string) => string;
};

defaultColors.setTheme(colorsTheme);
const colors = defaultColors as Colors;

/**
 * Выбор цвета для отображения категории диагностики
 *
 * @param diagnostic
 * @returns
 */
const diagnosticCategoryColor = (diagnostic: { category: string }) => {
  switch (diagnostic.category) {
    case 'error':
      return colors.error;
    case 'warning':
      return colors.warning;
    case 'suggestion':
      return colors.suggestion;
    default:
      return colors.unknown;
  }
};
/**
 * Формирование сообщения ошибки. Формат используется такой же как в выводе tsc.
 *
 * @param file - относительный путь до файла
 * @param diagnostic - диагностическое сообщение
 * @return текст с отформатированным сообщением об ошибке
 */
const headerMessage = (file: string, diagnostic: Diagnostic) => {
  const { start } = diagnosticToLocation(diagnostic);
  const categoryColor = diagnosticCategoryColor(diagnostic);

  const headerParts = [
    colors.fileName(file),
    colors.fileLocation(`:${start.line}:${start.offset}`),
    ' - ',
    categoryColor(diagnostic.category),
    colors.errorCode(` TS${diagnostic.code}: `),
    diagnosticToMessage(diagnostic),
  ];

  return headerParts.join('');
};

/**
 * Форматирование кода, где произошла ошибка, для вывода в консоль. При форматировании в начале
 * каждой строки указывается номер строки расположения в файле. А также добавляется специальная
 * подсветка, для того места, где сработала диагностика.
 *
 * Пример:
 *
 * ```
 *  9 import { Node } from './node';
 * 10 tree.add(new Node());
 *             ~~~~~~~~~~
 * 11 tree.clear();
 * ```
 *
 * @param diagnostic - диагностическое сообщение для переданного кода
 * @param code - строки кода считанные из файла
 * @param frame - сколько строк до и после ошибки включены в фрагмент кода
 * @return текст с отформатированным кодом и подсветкой места ошибки
 */
const codeMessage = (diagnostic: Diagnostic, code: string[], frame: Frame) => {
  const { start, end } = diagnosticToLocation(diagnostic);
  const linesBefore = Math.min(start.line - 1, frame.before);
  const maxLengthOfLineNumber = `${end.line + frame.after}`.length;
  const formattedLines: string[] = [];

  const lineNumberColor = colors.lineNumber;
  const underlineColor = diagnosticCategoryColor(diagnostic);

  const formatCodeLine = (lineNumber: number, line: string) => {
    const formattedLineNumber = `${lineNumber}`.padStart(maxLengthOfLineNumber, ' ');
    return lineNumberColor(formattedLineNumber) + ' ' + line;
  };

  const formatUnderline = (start: number, end: number) => {
    const formattedLineSpace = ''.padStart(maxLengthOfLineNumber, ' ');
    const underline = ''.padStart(start, ' ').padEnd(end, '~');
    return lineNumberColor(formattedLineSpace) + ' ' + underlineColor(underline);
  };

  for (let index = 0; index < code.length; index++) {
    const line = code[index];
    const lineNumber = index - linesBefore + start.line;
    formattedLines.push(formatCodeLine(lineNumber, line));

    if (start.line <= lineNumber && lineNumber < end.line) {
      if (index === linesBefore) {
        // подчеркивание от середины и до конца строки
        formattedLines.push(formatUnderline(start.offset - 1, line.length));
      } else {
        // подчеркивание всей строки
        formattedLines.push(formatUnderline(0, line.length));
      }
    }

    if (lineNumber === end.line) {
      if (index === linesBefore) {
        // подчеркивание только середины строки
        formattedLines.push(formatUnderline(start.offset - 1, end.offset - 1));
      } else {
        // подчеркивание от начала и до середины строки
        formattedLines.push(formatUnderline(0, end.offset - 1));
      }
    }
  }

  return formattedLines.join('\n');
};

/**
 * Вывод сообщения об ошибке. Сначала выводится отформатированные заголовок. Далее участок кода, где
 * была найдена ошибка.
 *
 * @param file - относительный путь до файла
 * @param diagnostic - диагностическое сообщение ошибки
 * @param code - код, где была обнаружена ошибка
 * @param frame - параметры отображения кода
 */
const printMessage = (file: string, diagnostic: Diagnostic, code: string[], frame: Frame) => {
  const message = [headerMessage(file, diagnostic), '', codeMessage(diagnostic, code, frame), ''];
  console.log(message.join('\n'));
};

export const consoleReport = (records: ReportRecord[]) => {
  const counters: Record<string, number> = {};
  const incCounter = (category: string) => {
    counters[category] = (counters[category] ?? 0) + 1;
  };

  for (const { file, diagnostics, code, frame } of records) {
    for (let index = 0; index < diagnostics.length; index++) {
      incCounter(diagnostics[index].category);
      printMessage(file, diagnostics[index], code[index], frame);
    }
  }

  for (const [key, count] of Object.entries(counters)) {
    console.log(`Total ${key}s: ${count}`);
  }
};
