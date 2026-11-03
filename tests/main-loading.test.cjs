const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'main.js'), 'utf8');

function element(className = '') {
  return {
    className,
    children: [],
    style: {},
    attributes: {},
    appendChild(child) {
      if (child.isFragment) this.children.push(...child.children);
      else this.children.push(child);
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    querySelector(selector) {
      const matches = this.querySelectorAll(selector);
      const pageNumber = selector.match(/data-page-num="(\d+)"/);
      return pageNumber ? matches.find(node => node.getAttribute('data-page-num') === pageNumber[1]) || null : matches[0] || null;
    },
    querySelectorAll(selector) {
      const classToFind = selector.startsWith('.page') ? 'page' : selector.slice(1);
      const found = [];
      function visit(node) {
        for (const child of node.children) {
          if (child.className === classToFind) found.push(child);
          visit(child);
        }
      }
      visit(this);
      return found;
    },
    getBoundingClientRect() { return { top: 0, bottom: 800 }; },
  };
}

test('the first page starts rendering before the rest of the placeholders are built', async () => {
  const pageCalls = [];
  const rendered = [];
  const timers = [];
  let requestedDocument;
  let observerCallback;
  const pdf = {
    numPages: 30,
    async getPage(number) {
      pageCalls.push(number);
      return { getViewport() { return { width: 300, height: 400 }; }, cleanup() {} };
    },
  };
  const pagesHolder = element();
  const wrapper = element();
  wrapper.clientHeight = 800;
  wrapper.addEventListener = () => {};
  const container = element();
  const ui = { pagesHolder, wrapper, pageTotal: element() };
  const window = {
    __viewer_darkModeEnabled: true,
    detectCopyPermission: async () => ({ canCopy: true }),
    setupShell: () => ui,
    wireToolbarLogic() {},
    ensureHighlightToggle() {},
    setupHighlightObserver() {},
    ensureDarkModeToggle() {},
    __viewer_applyMode() {},
    scrollTo() {},
    renderPageContent: async number => { rendered.push(number); return 'rendered'; },
  };
  const context = {
    window,
    document: {
      title: '',
      getElementById: () => container,
      createElement: () => element(),
      createDocumentFragment: () => ({ ...element(), isFragment: true }),
    },
    chrome: { runtime: { getURL: path => `chrome-extension://test/${path}` } },
    location: { search: '?file=https%3A%2F%2Fexample.com%2Flarge.pdf', href: 'chrome-extension://test/viewer.html' },
    localStorage: { getItem: () => null },
    pdfjsLib: { GlobalWorkerOptions: {}, getDocument: options => { requestedDocument = options; return { promise: Promise.resolve(pdf) }; } },
    IntersectionObserver: class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() {} },
    URL,
    URLSearchParams,
    setTimeout: callback => { timers.push(callback); },
    requestAnimationFrame: callback => setImmediate(callback),
    console,
  };
  vm.runInNewContext(source, context);
  await window.startViewer();
  assert.equal(requestedDocument.url, 'https://example.com/large.pdf');
  assert.deepEqual(pageCalls, [1]);
  assert.deepEqual(rendered, [1]);
  assert.equal(pagesHolder.querySelectorAll('.page').length, 1);

  await window.__viewer_ensurePage(20);
  assert.ok(pageCalls.includes(20));
  assert.equal(pagesHolder.querySelectorAll('.page').length, 20);
  timers[0]();
  await window.__viewer_ensurePage(30);
  assert.equal(pagesHolder.querySelectorAll('.page').length, 30);

  const pages = pagesHolder.querySelectorAll('.page');
  pages[1].getBoundingClientRect = () => ({ top: 1800, bottom: 2200 });
  pages[2].getBoundingClientRect = () => ({ top: 0, bottom: 400 });
  observerCallback([
    { isIntersecting: true, target: pages[1] },
    { isIntersecting: true, target: pages[2] },
  ]);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rendered.slice(1), [3, 2]);
});
