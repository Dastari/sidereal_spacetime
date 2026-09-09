import { compileLayout } from "../../../../../packages/sim/src/layout-compiler";
self.onmessage = (event: MessageEvent) => {
  const { serial, document } = event.data,
    start = performance.now();
  try {
    self.postMessage({
      serial,
      result: compileLayout(document),
      milliseconds: performance.now() - start,
    });
  } catch (error) {
    self.postMessage({ serial, error: String(error) });
  }
};
