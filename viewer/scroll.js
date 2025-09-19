// scroll.js
// スクロール関連のユーティリティ

window._getWrapperAndPagesHolder = function _getWrapperAndPagesHolder() {
  const ui = window.__viewer_ui || {};
  const wrapper = ui.wrapper || document.getElementById('viewer-container-wrapper') || document.querySelector('.viewer-wrapper') || document.body;
  const pagesHolder = ui.pagesHolder || document.getElementById('viewer-pages') || (wrapper && wrapper.querySelector ? wrapper.querySelector('.pages') : null) || wrapper;
  return { wrapper, pagesHolder, ui };
};

// pageIdx: 1-based
// options: { behavior:'auto'|'smooth', extraGap: number, waitForRender: boolean }
window.scrollToPageTopByIndex = function scrollToPageTopByIndex(pageIdx, options = {}) {
  const { wrapper, pagesHolder, ui } = window._getWrapperAndPagesHolder();
  if (!wrapper || !pagesHolder) return;

  const idx = Math.max(1, pageIdx);
  const pages = Array.from(pagesHolder.querySelectorAll('.page'));
  if (idx > pages.length) return;
  const pageDiv = pages[idx - 1];

  const opts = Object.assign({ behavior: 'auto', extraGap: 0, waitForRender: true }, options);

  let contentElem = pageDiv.querySelector('.paper') || pageDiv.querySelector('svg') || pageDiv;

  const doScroll = () => {
    if (wrapper === document.body || wrapper === document.documentElement) {
      const rect = contentElem.getBoundingClientRect();
      const toolbarHeight = (ui && ui.toolbar) ? ui.toolbar.getBoundingClientRect().height : 0;
      const targetY = window.scrollY + rect.top - toolbarHeight - opts.extraGap;
      window.scrollTo({ top: Math.max(0, Math.round(targetY)), behavior: opts.behavior });
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const contentRect = contentElem.getBoundingClientRect();
    const toolbarHeight = (ui && ui.toolbar) ? ui.toolbar.getBoundingClientRect().height : 0;
    const desiredTop = wrapperRect.top + toolbarHeight + opts.extraGap;
    const delta = contentRect.top - wrapperRect.top;
    let newScrollTop = wrapper.scrollTop + Math.round(delta) - (toolbarHeight + opts.extraGap);
    const maxScroll = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
    newScrollTop = Math.max(0, Math.min(maxScroll, newScrollTop));

    if (opts.behavior === 'smooth' && typeof wrapper.scrollTo === 'function') {
      wrapper.scrollTo({ top: newScrollTop, behavior: 'smooth' });
    } else {
      wrapper.scrollTop = newScrollTop;
    }
  };

  if (opts.waitForRender) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { setTimeout(doScroll, 8); });
    });
  } else {
    doScroll();
  }
};
