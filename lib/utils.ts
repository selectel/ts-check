import ts from 'typescript';
import { readFile } from 'fs';

export type Frame = { before: number; after: number };
export type Location = ts.server.protocol.Location;
export type Diagnostic =
  | ts.server.protocol.Diagnostic
  | ts.server.protocol.DiagnosticWithLinePosition;

/** Сообщение является ответом на запрос */
export const isResponse = (msg: ts.server.protocol.Message): msg is ts.server.protocol.Response =>
  msg.type === 'response';

/** Сообщение является ответом на запрос {@link SemanticDiagnosticsSync} */
export const isSemanticDiagnosticsSyncResponse = (
  msg: ts.server.protocol.Message,
): msg is ts.server.protocol.SemanticDiagnosticsSyncResponse => {
  if (isResponse(msg)) {
    return msg.command === ts.server.protocol.CommandTypes.SemanticDiagnosticsSync;
  }
  return false;
};

/** Объект является результатом диагностики */
export const isDiagnostic = (data: unknown): data is ts.server.protocol.Diagnostic => {
  if (!data) return false;
  return Object.hasOwn(data, 'start') && Object.hasOwn(data, 'end') && Object.hasOwn(data, 'text');
};

/** Местоположение в коде, где сработала диагностика */
export const diagnosticToLocation = (
  diagnostic: Diagnostic,
): { start: Location; end: Location } => {
  const [start, end] = isDiagnostic(diagnostic)
    ? [diagnostic.start, diagnostic.end]
    : [diagnostic.startLocation, diagnostic.endLocation];
  return { start, end };
};

/** Строки на которых сработала диагностика */
export const diagnosticToLines = (diagnostic: Diagnostic): { start: number; end: number } => {
  const { start, end } = diagnosticToLocation(diagnostic);
  return { start: start.line, end: end.line };
};

/** Смещения внутри строки на которых сработала диагностика */
export const diagnosticToOffsets = (diagnostic: Diagnostic): { start: number; end: number } => {
  const { start, end } = diagnosticToLocation(diagnostic);
  return { start: start.offset, end: end.offset };
};

/** Текстовое пояснение к сработанной диагностике */
export const diagnosticToMessage = (diagnostic: Diagnostic): string => {
  if (isDiagnostic(diagnostic)) return diagnostic.text;
  return diagnostic.message;
};

/**
 * Чтение участков кода файла, где сработали диагностики сервера. Метод используется для вывода
 * сообщения в консоль пользователя. Для этого из файла извлекается одна строка до строки,
 * содержащей ошибку, и одна после.
 *
 * @param file - полный путь до файла
 * @param diagnostics - диагностические сообщения от сервера к указанному файлу
 * @param frame - сколько строк до и после ошибки включить в фрагмент
 * @returns участки кода, где была обнаружена ошибка
 */
export const readFileCodeFragments = async (
  file: string,
  diagnostics: ts.server.protocol.SemanticDiagnosticsSyncResponse['body'],
  frame: Frame,
) => {
  if (!diagnostics?.length) return [];

  const text = await new Promise<string>((resolve, reject) => {
    readFile(file, 'utf8', (error, response) => {
      if (error) return reject(error);
      return resolve(response);
    });
  });

  const lines = text.split(/\r?\n/);

  return diagnostics.map(diagnosticToLines).map(({ start, end }) => {
    const firstLine = Math.max(start - 1 - frame.before, 0);
    const lastLine = Math.min(end + frame.after, lines.length);
    const code = lines.slice(firstLine, lastLine);
    return code;
  });
};
