// zoom.js
// ズーム制御: RAF バッチ処理、スケール適用、fitWidth/fitPage、ボタン配線

window.wireZoomControls = function wireZoomControls(ui){
  if (!ui) ui = window.__viewer_ui; if (!ui) return;

  let currentScale = 1.0;
  let _pendingScale = null;   // RAF で処理待ちのスケール値
  let _zoomRafId = null;      // 予約済み RAF の ID
  let _zoomEndTimer = null;   // ズーム終了遅延タイマー
  
  // ズーム中に現在ページの前後2ページ以外を非表示にする関数
  function updatePageVisibilityDuringZoom() {
    const pages = Array.from(ui.pagesHolder.querySelectorAll('.page'));
    if (pages.length === 0) return;
    
    // 現在のページインデックスを取得（1-based）
    const currentPageNum = parseInt(ui.pageInput.value || '1', 10);
    const currentIndex = currentPageNum - 1; // 0-based
    
    // 各ページに対して表示/非表示を切り替え
    pages.forEach((page, index) => {
      // 現在のページの前後1ページ以内かチェック
      const distance = Math.abs(index - currentIndex);
      if (distance <= 1) {
        page.classList.remove('zoom-hidden');
      } else {
        page.classList.add('zoom-hidden');
      }
    });
  }
  
  // 全ページを表示する関数
  function showAllPages() {
    const pages = Array.from(ui.pagesHolder.querySelectorAll('.page'));
    pages.forEach(page => {
      page.classList.remove('zoom-hidden');
    });
  }
  
  // ---------- RAF ベースのズーム処理 ----------
  // 呼び出し側は applyScaleToAllPages(scale) を何度呼んでも OK。
  // 同一フレーム内の複数呼び出しは最後の値だけを 1 回の DOM 更新で処理する。
  function applyScaleToAllPages(scale, options = {}){
    _pendingScale = scale;
    window.__viewer_isZooming = true;
    // ズーム終了タイマーをリセット（まだ操作中）
    if (_zoomEndTimer) { clearTimeout(_zoomEndTimer); _zoomEndTimer = null; }
    // まだ RAF が予約されていなければ予約
    if (!_zoomRafId) {
      _zoomRafId = requestAnimationFrame(_flushScale);
    }
  }

  function _flushScale() {
    _zoomRafId = null;
    if (_pendingScale === null) return;

    const scale = _pendingScale;
    _pendingScale = null;
    const wrapper = ui.wrapper;
    const pagesHolder = ui.pagesHolder;

    // === Read phase ===
    const oldScrollTop = wrapper.scrollTop;
    const oldScrollLeft = wrapper.scrollLeft;
    const oldScale = currentScale;
    const ch = wrapper.clientHeight;
    const cw = wrapper.clientWidth;
    const baseH = pagesHolder.scrollHeight;

    // === Compute phase ===
    const ratio = (oldScale > 0) ? (scale / oldScale) : 1;
    const newScrollTop = Math.max(0, (oldScrollTop + ch / 2) * ratio - ch / 2);
    const newScrollLeft = Math.max(0, (oldScrollLeft + cw / 2) * ratio - cw / 2);

    // === Write phase ===
    // transform: scale() はレイアウトをトリガしない（GPU合成のみ）
    // transformOrigin を 'center top' にして中央揃えを維持
    pagesHolder.style.transform = `scale(${scale})`;
    pagesHolder.style.transformOrigin = 'center top';
    // スペーサー div で縦スクロール可能範囲を確保（1要素のみサイズ変更）
    // transform: scale() はレイアウト寸法を変えないため、スペーサーで追加分を補う
    // pagesHolder のレイアウト高 = baseH は既にスクロール領域に含まれるので、
    // スペーサーには scale による「超過分」だけ設定する
    let spacer = wrapper.__zoomSpacer;
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.style.pointerEvents = 'none';
      spacer.style.visibility = 'hidden';
      spacer.style.width = '1px';
      wrapper.appendChild(spacer);
      wrapper.__zoomSpacer = spacer;
    }
    // scale < 1: レイアウト高 > 見た目高 → 負margin で余白を消す
    // scale > 1: レイアウト高 < 見た目高 → スペーサーで不足分を追加
    if (scale < 1) {
      spacer.style.height = '0px';
      pagesHolder.style.marginBottom = (baseH * (scale - 1)) + 'px';
    } else {
      pagesHolder.style.marginBottom = '0px';
      spacer.style.height = Math.max(0, baseH * (scale - 1)) + 'px';
    }

    // 横スクロール: Chrome標準PDFビューアのように、最小限のマージンで横スクロール範囲を制限
    // pagesHolder の実際のレイアウト幅（ページ幅に基づく）を使用し、
    // wrapper のパディング（20px）のみが端のマージンとして機能する
    if (scale > 1) {
      const phActualWidth = pagesHolder.offsetWidth; // 実際のコンテンツ幅（transformの影響を受けない）
      const scaledWidth = phActualWidth * scale;

      if (scaledWidth + 40 > cw) {
        // スケール後のコンテンツがビューポートを超える → 横スクロール有効化
        // justify-content: center はオーバーフロー時に左側がクリップされるため flex-start に切替
        wrapper.style.justifyContent = 'flex-start';
        const halfOverflow = phActualWidth * (scale - 1) / 2;
        pagesHolder.style.marginLeft = halfOverflow + 'px';
        pagesHolder.style.marginRight = halfOverflow + 'px';
      } else {
        // スケール後もビューポートに収まる → 中央揃えを維持
        wrapper.style.justifyContent = 'center';
        pagesHolder.style.marginLeft = '0px';
        pagesHolder.style.marginRight = '0px';
      }
    } else {
      wrapper.style.justifyContent = 'center';
      pagesHolder.style.marginLeft = '0px';
      pagesHolder.style.marginRight = '0px';
    }

    currentScale = scale;
    ui.zoomVal.value = Math.round(scale * 100) + '%';
    wrapper.scrollTop = newScrollTop;
    wrapper.scrollLeft = newScrollLeft;

    // ズーム中は現在ページの前後2ページ以外を非表示にする
    updatePageVisibilityDuringZoom();

    // === 後処理 ===
    if (_zoomEndTimer) clearTimeout(_zoomEndTimer);
    _zoomEndTimer = setTimeout(() => {
      _zoomEndTimer = null;
      window.__viewer_isZooming = false;
      // ズーム終了時に全ページを表示
      showAllPages();
    }, 250);
  }

  function fitWidth(){ const viewportWidth = ui.wrapper.clientWidth - 40; const first = ui.pagesHolder.querySelector('.page'); if (!first) return; const baseW = parseFloat(first.getAttribute('data-base-width') || first.style.width || first.clientWidth); const targetScale = Math.max(0.1, viewportWidth / baseW); applyScaleToAllPages(targetScale); }
  function fitPage(){ const viewportHeight = ui.wrapper.clientHeight - ui.toolbar.clientHeight - 40; const first = ui.pagesHolder.querySelector('.page'); if (!first) return; const baseH = parseFloat(first.getAttribute('data-base-height') || first.style.height || first.clientHeight); const targetScale = Math.max(0.1, viewportHeight / baseH); applyScaleToAllPages(targetScale); }

  // ボタン配線
  ui.btnZoomIn.addEventListener('click', () => { applyScaleToAllPages(Math.min(5, currentScale + 0.1)); });
  ui.btnZoomOut.addEventListener('click', () => { applyScaleToAllPages(Math.max(0.1, currentScale - 0.1)); });
  ui.btnFitWidth.addEventListener('click', fitWidth);
  ui.btnFitPage.addEventListener('click', fitPage);
  ui.zoomVal.addEventListener('change', () => { const raw = ui.zoomVal.value.trim().replace('%',''); const n = parseFloat(raw); if (!isFinite(n) || n <= 0) { ui.zoomVal.value = Math.round(currentScale * 100) + '%'; return; } applyScaleToAllPages(Math.max(0.1, n / 100)); });

  // グローバル公開
  window.__viewer_applyScaleToAllPages = applyScaleToAllPages;
};
