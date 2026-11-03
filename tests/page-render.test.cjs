const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'page_rendering', 'page-render.js'), 'utf8');

function makeElement() {
  return {
    style: {},
    children: [],
    appendChild(child) { this.children.push(child); },
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    hasAttribute() { return false; },
    querySelectorAll() { return []; },
  };
}

function makeViewer() {
  let finishImages;
  let failImages;
  const imagesFinished = new Promise((resolve, reject) => { finishImages = resolve; failImages = reject; });
  let replacements = 0;
  let textLayers = 0;
  const placeholder = { replaceWith() { replacements++; } };
  const placeholderPage = { closest() { return placeholder; } };
  const svg = makeElement();
  const page = {
    getViewport() { return { width: 300, height: 400 }; },
    async getOperatorList() { return {}; },
    async getTextContent() { return { items: [{ str: 'Hello' }] }; },
    cleanup() {},
  };
  const pdf = { numPages: 1, async getPage() { return page; } };
  const window = {
    __viewer_darkModeEnabled: true,
    __viewer_renderedPages: new Set(),
    invertSvgColorsSmart() {},
    processSvgImagesHighQuality: () => imagesFinished,
    renderTextLayerFromTextContent() { textLayers++; },
  };
  const context = {
    window,
    document: { createElement: makeElement, body: makeElement() },
    pdfjsLib: { SVGGraphics: class { async getSVG() { return svg; } } },
    localStorage: { getItem() { return 'svg'; } },
    console,
  };
  vm.runInNewContext(source, context);
  const container = { querySelector() { return placeholderPage; }, appendChild() { throw new Error('Unexpected append'); } };
  return {
    window,
    finishImages,
    failImages,
    get replacements() { return replacements; },
    get textLayers() { return textLayers; },
    render() { return window.renderPageContent(1, pdf, container, true, 'svg'); },
  };
}

test('the page is swapped only after image processing and one text layer is built', async () => {
  const viewer = makeViewer();
  const rendering = viewer.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(viewer.replacements, 0);
  assert.equal(viewer.textLayers, 0);
  viewer.finishImages();
  assert.equal(await rendering, 'rendered');
  assert.equal(viewer.replacements, 1);
  assert.equal(viewer.textLayers, 1);
});

test('a mode change during processing leaves the placeholder intact', async () => {
  const viewer = makeViewer();
  const rendering = viewer.render();
  await new Promise(resolve => setImmediate(resolve));
  viewer.window.__viewer_darkModeEnabled = false;
  viewer.finishImages();
  assert.equal(await rendering, 'deferred');
  assert.equal(viewer.replacements, 0);
  assert.equal(viewer.textLayers, 0);
});

test('an image processing failure keeps the placeholder visible', async () => {
  const viewer = makeViewer();
  const rendering = viewer.render();
  await new Promise(resolve => setImmediate(resolve));
  viewer.failImages(new Error('image processing failed'));
  await assert.rejects(rendering, /image processing failed/);
  assert.equal(viewer.replacements, 0);
});
