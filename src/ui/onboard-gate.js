// 首次引导还没关掉时，深链要打开的付费卡、皮肤单买卡先排队，等引导关掉再打开。
// 新装 App 从推广链接 laiganjue://pro 进来，用户应该先看到欢迎引导，再看到付费卡，
// 而不是关掉付费卡才发现底下还压着一张引导。
// pending 为假（老用户、屏保页、自动化）时 run 立即执行。
export function createOnboardGate(pending) {
  let waiting = !!pending;
  const queue = [];
  return {
    get waiting() { return waiting; },
    run(fn) {
      if (waiting) queue.push(fn);
      else fn();
    },
    release() {
      if (!waiting) return;
      waiting = false;
      for (const fn of queue.splice(0)) {
        try { fn(); } catch (e) { console.error(e); }
      }
    },
  };
}
