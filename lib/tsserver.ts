import ts from 'typescript';
import { spawn } from 'child_process';
import { Observable, Subject } from 'rxjs';
import { share } from 'rxjs/operators';

export type TsServerOptions = {
  /** Название кодировки, которая будет использоваться для отправки и чтения сообщений сервера */
  encoding?: BufferEncoding;
  /** Вывод в консоль ошибок, которые могут возникать при ошибке чтения сообщений от сервера */
  verbose?: boolean;
};

type ParsedMessage<T> = {
  /** Начало JSON строки */
  offset: number;
  /** Длина JSON строки */
  length: number;
  /** Объект, прочитанный из JSON строки */
  message: T;
};

type BufferMessages<T> = {
  /** Количество прочитанных символов */
  read: number;
  /** Массив прочитанных сообщений */
  messages: Array<T>;
};

/**
 * Чтение сообщения, которое имеет следующий вид:
 *
 * ```
 * Content-Length: <number>\r\n
 * \r\n
 * <JSON string with Content-Length size>\r\n
 * ```
 *
 * @param string - буферизированная строка из стандартного вывода сервера
 * @param encoding - кодировка текста в чанках
 * @returns объект с сообщением от сервера
 */
const parseMessage = <T>(string: string): ParsedMessage<T> => {
  const header = string.match(/^Content-Length: (\d+)\r?\n\r?\n/);

  if (!header) {
    throw new Error('Invalid header');
  }

  const offset = header[0].length;
  const length = Number(header[1]);

  if (string.length < offset + length) {
    throw new Error('Invalid message length');
  }

  const substring = string.slice(offset, offset + length);
  const message: T = JSON.parse(substring);

  return { offset, length, message };
};

/**
 * Чтение сообщений из буфера. Если по каким-то причинам не удастся прочитать сообщение целиком, то
 * метод вернет ту часть буфера, которая не была прочитана.
 *
 * @param buffer - буфер стандартного вывода процесса сервера
 * @param encoding - кодировка чтения из буфера
 * @returns объект содержащий прочитанные сообщения и количество символов, которое было прочитано
 */
const readBuffer = <T>(
  buffer: Buffer,
  encoding?: BufferEncoding,
  verbose?: boolean,
): BufferMessages<T> => {
  let read = 0;
  const messages: Array<T> = [];

  try {
    const string = buffer.toString(encoding);
    while (read < string.length) {
      const { offset, length, message } = parseMessage<T>(string.slice(read));
      read = read + offset + length;
      messages.push(message);
    }
  } catch (error) {
    if (verbose) {
      console.error(error);
    }
  }

  return { read, messages };
};

/**
 * Оператор для преобразования {@link Buffer} чанков из `stdout` процесса сервера, в объекты
 * протокола tsserver.
 *
 * @param encoding - кодировка текста в чанках
 * @returns
 */
const chunksToMessages =
  <T>(encoding?: BufferEncoding, verbose?: boolean) =>
  (source: Observable<Buffer>) =>
    new Observable<T>((subscriber) => {
      let buffer = Buffer.from([]);

      const subscription = source.subscribe({
        next: (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          const { read, messages } = readBuffer<T>(buffer, encoding, verbose);
          buffer = 0 < read ? buffer.subarray(read) : buffer;
          messages.forEach((message) => subscriber.next(message));
        },
        error: (error) => {
          subscriber.error(error);
        },
        complete: () => {
          subscriber.complete();
        },
      });

      return () => {
        subscription.unsubscribe();
      };
    });

/**
 * Класс для общения с сервером TypeScript.
 *
 * Чтение сообщений происходит через поток rxjs. Доступ к потоку сообщений от сервера можно получить
 * через метод {@link listen}:
 *
 * ```ts
 * const server = new TsServer();
 * server.listen().subscribe(console.log);
 * ```
 *
 * Для отправки сообщения на сервер используется метод {@link send}.
 *
 * ```ts
 * const server = new TsServer();
 * server.send(message);
 * ```
 *
 * Сам сервер представляет собой отдельный процесс, который порождается через {@link spawn}. Общение
 * с сервером осуществляется через сокеты `stdin` и `stdout` этого процесса.
 *
 * > ВАЖНО! Необходимо учитывать, что запуск процесса зависит от подписчиков на поток. То есть,
 * > когда появляется первый подписчик, то сервер запускается, когда последний подписчик уходит,
 * > сервер останавливается. Если нет ни одного подписчика, то сообщения переданные через метод
 * > {@link send}, **не будут отправлены**.
 */
export class TsServer<Send = ts.server.protocol.Request, Listen = ts.server.protocol.Message> {
  private readonly encoding: BufferEncoding;
  private readonly verbose: boolean;
  private readonly inputMessages$: Subject<Send>;
  private readonly outputMessages$: Observable<Listen>;

  constructor(options?: TsServerOptions) {
    this.encoding = options?.encoding ?? 'utf8';
    this.verbose = options?.verbose ?? false;

    this.inputMessages$ = new Subject<Send>();
    this.outputMessages$ = this.spawnServer().pipe(
      chunksToMessages<Listen>(this.encoding, this.verbose),
      share(),
    );
  }

  private spawnServer() {
    return new Observable<Buffer>((subscriber) => {
      const { signal, abort } = new AbortController();

      const tsserverPath = require.resolve('typescript/bin/tsserver');
      const tsserver = spawn('node', [tsserverPath], { signal });

      tsserver.stdout.on('data', (data) => {
        subscriber.next(data);
      });

      tsserver.on('close', () => {
        subscriber.complete();
      });

      tsserver.on('error', (error) => {
        subscriber.error(error);
      });

      const subscription = this.inputMessages$.subscribe((message) => {
        const string = JSON.stringify(message) + '\n';
        const buffer = Buffer.from(string, this.encoding);
        tsserver.stdin.write(buffer);
      });

      return () => {
        abort();
        subscription.unsubscribe();
      };
    });
  }

  /** Отправка сообщения на сервер */
  public send(message: Send) {
    this.inputMessages$.next(message);
  }

  /** Получение потока сообщений от сервера */
  public listen() {
    return this.outputMessages$;
  }

  /** @alias {@link listen} */
  public asObservable() {
    return this.outputMessages$;
  }
}
