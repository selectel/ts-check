console.log(undefinedVariable);

const asyncFlag = (): Boolean =>
  new Promise<boolean>((resolve) => {
    resolve(false);
  });
