import ts from 'typescript';
import { Observable } from 'rxjs';
import { filter, take } from 'rxjs/operators';

import { TsServer } from './tsserver';
import { isSemanticDiagnosticsSyncResponse } from './utils';

/** Глобальный счетчик, нужен чтобы сопоставлять запросы и ответы */
const globalSeq = (() => {
  let counter = 0;
  return () => counter++;
})();

/**
 * Отправка сообщения серверу на открытие указанного файла, и запрос на поиск ошибок в этом файле.
 *
 * Сначала формируется подписка на поиск ответного сообщения от сервера. Эта подписка, в том числе,
 * инициализирует сервер, если у него нет других активных подписчиков. Далее происходит отправка
 * двух сообщений подряд: на открытие и на диагностику. Как только ответ получен, поток завершается.
 * Это, в свою очередь, может привести к остановке сервера, если у него нет других подписчиков.
 *
 * @param server - экземпляр сервер
 * @param file - абсолютный путь до файла
 * @returns найденные ошибки
 */
export const requestSemanticDiagnostics = (server: TsServer, file: string) =>
  new Observable<ts.server.protocol.SemanticDiagnosticsSyncResponse>((subscriber) => {
    const openRequest: ts.server.protocol.OpenRequest = {
      seq: globalSeq(),
      type: 'request',
      command: ts.server.protocol.CommandTypes.Open,
      arguments: { file },
    };

    const diagnosticsRequest: ts.server.protocol.SemanticDiagnosticsSyncRequest = {
      seq: globalSeq(),
      type: 'request',
      command: ts.server.protocol.CommandTypes.SemanticDiagnosticsSync,
      arguments: { file },
    };

    // TODO: На сколько удалось проверить: даже если путь до файла указан неверно, то сервер все
    // равно вернет корректный ответ. Но надо проверять еще, так как в случае если сервер все же не
    // вернет никакого ответа на конкретный запрос, то поток может зависнуть навсегда. Возможно в
    // качестве обходного пути имеет смысл добавить максимальную задержку на ожидание ответа.
    const subscription = server
      .listen()
      .pipe(
        filter(isSemanticDiagnosticsSyncResponse),
        filter((resp) => resp.request_seq === diagnosticsRequest.seq),
        take(1),
      )
      .subscribe(subscriber);

    server.send(openRequest);
    server.send(diagnosticsRequest);

    return () => {
      subscription.unsubscribe();
    };
  });
