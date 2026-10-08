import { Runtime } from './runtime.js';
import { simulateBatch, createLabState } from './lab.js';
let runtime;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'start' || data.type === 'debugStart')
      runtime = new Runtime(data.code, data.language, data.devices, data.board);
    if (data.type === 'start' || data.type === 'tick') {
      const result = data.lab
        ? simulateBatch(runtime, { ...data, count: data.type === 'start' ? 1 : data.count || 1 })
        : runtime.step(data.env, data.ms);
      self.postMessage({ type: 'state', ...result });
    } else if (data.type === 'debugStep' || data.type === 'debugStart')
      self.postMessage({ type: 'state', ...runtime.debugStep(data.env, data.ms || 200) });
  } catch (e) {
    self.postMessage({
      type: 'error',
      message: e.message,
      line: e.line || runtime?.currentLine || null,
    });
  }
};
