// RENDERER=three npm run test:browser runs the browser tests against the three.js renderer:
// every page starts with the game told to use it, as ?renderer=three does.
export function useRenderer(browser) {
  const renderer = process.env.RENDERER;
  if (!renderer) return browser;
  const init = (target) =>
    target.addInitScript((r) => (globalThis.IOTQUEST_RENDERER = r), renderer);
  const newPage = browser.newPage.bind(browser),
    newContext = browser.newContext.bind(browser);
  browser.newPage = async (options) => {
    const page = await newPage(options);
    await init(page);
    return page;
  };
  browser.newContext = async (options) => {
    const context = await newContext(options);
    await init(context);
    return context;
  };
  return browser;
}
