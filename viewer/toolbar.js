// toolbar.js
// ツールバーのイベント配線統括: 各サブモジュールへ委譲 + ページナビゲーション

window.wireToolbarLogic = function wireToolbarLogic(fileUrl){
  const ui = window.__viewer_ui; if (!ui) return;

  // ===== サブモジュールへ委譲 =====
  // ズーム制御（zoom.js）
  try { window.wireZoomControls(ui); } catch (e) { console.warn('wireZoomControls failed', e); }
  // テキスト表示モード（text-mode.js）
  try { window.wireTextModeControls(ui); } catch (e) { console.warn('wireTextModeControls failed', e); }
  // ダウンロードボタン（download.js）
  try { window.wireDownloadButton(ui); } catch (e) { console.warn('wireDownloadButton failed', e); }

  // ===== ページナビゲーション =====
  let defaultValue;
  function calcPages(){
    //ページ数が1以下ならスクロールによる変更はないためページ数１を返す
    const { wrapper, pagesHolder, ui } = window._getWrapperAndPagesHolder();
    const pages = Array.from(pagesHolder.querySelectorAll('.page'));
    // ページが2つ未満の場合は計算不可、1を返す
    if(pages.length < 2 || ui.pageTotal <= 1){return 1;}
    const pageDiv1 = pages[0];
    if (!pageDiv1) return 1;
    let contentElem1 = pageDiv1.querySelector('.paper') || pageDiv1.querySelector('svg') || pageDiv1;
    const contentRect1 = contentElem1.getBoundingClientRect();
    const pageDiv2 = pages[1];
    if (!pageDiv2) return 1;
    let contentElem2 = pageDiv2.querySelector('.paper') || pageDiv2.querySelector('svg') || pageDiv2;
    const contentRect2 = contentElem2.getBoundingClientRect();
    const gap = contentRect2.top - contentRect1.top;
    if (gap === 0) return 1; // 0除算防止
    const defaultValue = wrapper.scrollTop / gap - 0.5;
    //console.log(defaultValue);
    return defaultValue;
  }
  ui.wrapper.addEventListener('scroll', () => {
    // ズーム中は強制レイアウトを避けるためスキップ
    if (window.__viewer_isZooming) return;
    defaultValue = calcPages();
    ui.pageInput.value = Math.round(defaultValue)+1;
  })

  function goToPage(n){ const { pagesHolder, ui: ui2 } = window._getWrapperAndPagesHolder(); const pages = Array.from(pagesHolder.querySelectorAll('.page')); if (!pages.length) return; const idx = Math.min(Math.max(1, n), pages.length); if (ui2 && ui2.pageInput) ui2.pageInput.value = idx; window.scrollToPageTopByIndex(idx, {extraGap: -50, waitForRender: true }); }

  //ui.btnNext.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) + 1); });
  //ui.btnPrev.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) - 1); });
  ui.pageInput.addEventListener('change', () => { goToPage(parseInt(ui.pageInput.value||'1',10)); });

  window.__viewer_goToPage = function(n){ goToPage(n); };
};

