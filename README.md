# CLI utility for checking types using TypeScript server

Type checking is performed using the TypeScript server [project system](https://github.com/microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29#project-system).

## Requirements

This package requires at least typescript 5.

## Install

Install `typescript` and `@selectel/ts-check` using your package manager.

```bash
npm install --save-dev typescript @selectel/ts-check
```

## Usage

```bash
npx ts-check [<files...>]
```

The arguments are a list of files to check. Other options:

```
ts-check [options] [<files...>]

Checking types for the passed list of files

Options:
      --no-color           Disable colors for output                  [boolean]
  -b, --code-lines-before  Print <number> lines of code before error  [number]
  -a, --code-lines-after   Print <number> lines of code after error   [number]
      --gitlab-report      Path to gitlab code quality report file    [string]
  -v, --verbose            Run with verbose logging                   [boolean]
  -h, --help               Show a help message                        [boolean]
      --files              A list of files for type checking          [Array<string>]
```

## GitLab code quality

Define a GitLab job to run `ts-check`.

_.gitlab-ci.yml_:

```yaml
ts-check:
  image: node:20-alpine
  script:
    - npm ci
    - npx ts-check --gitlab-report ts-check-report.json <paths/to/files/*.ts>
  artifacts:
    reports:
      codequality: ts-check-report.json
```

## TypeScript server

The package also provides an simple interface for communicating with the TypeScript server.

```ts
import ts from "typescript";
import { TsServer } from "@selectel/ts-check";

const file = "test.ts";

// Request to open file
const openRequest: ts.server.protocol.OpenRequest = {
  seq: 1,
  type: "request",
  command: ts.server.protocol.CommandTypes.Open,
  arguments: { file },
};

// Request to search for errors in a file
const diagnosticRequest: ts.server.protocol.SemanticDiagnosticsSyncRequest = {
  seq: 2,
  type: "request",
  command: ts.server.protocol.CommandTypes.SemanticDiagnosticsSync,
  arguments: { file },
};

// Create a server instance
const server = new TsServer();

// RxJs observable with server responses
const responses$ = server.listen();

// Subscribe to server responses
responses$.subscribe(console.log);

// Sending requests to the server
server.send(openRequest);
server.send(diagnosticRequest);
```

## Other

* [Documentation of TypeScript server](https://github.com/microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29)
* [Example usage of TypeScript server](https://github.com/mmorearty/tsserver-example)
* [GitLab Code Quality documentation](https://docs.gitlab.com/ee/ci/testing/code_quality.html)
