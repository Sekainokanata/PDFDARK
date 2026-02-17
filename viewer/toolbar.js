// toolbar.js
// ツールバーのイベント配線とモード管理

// ダウンロードヘルパ
window.filenameFromContentDisposition = function filenameFromContentDisposition(cd){
  if (!cd) return null; let m = cd.match(/filename\*\s*=\s*([^;]+)/i); if (m && m[1]) { let val = m[1].trim(); val = val.replace(/^UTF-8''/i, '').replace(/^['"]|['"]$/g, ''); try { return decodeURIComponent(val); } catch (e) { return val; } }
  m = cd.match(/filename\s*=\s*["']?([^"';]+)["']?/i); if (m && m[1]) return m[1]; return null;
};

window.downloadOriginalPdf = async function downloadOriginalPdf(fileUrl, existingArrayBuffer = null){
  if (!fileUrl) { console.warn('No file URL to download'); return; }
  let arrayBuffer = existingArrayBuffer; let filename = null;
  if (!arrayBuffer) {
    try {
      const resp = await fetch(fileUrl, { credentials: 'include' }); if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
      const cd = resp.headers.get('content-disposition'); filename = window.filenameFromContentDisposition(cd); arrayBuffer = await resp.arrayBuffer();
    } catch (err) {
      console.error('Failed to fetch original PDF for download:', err);
      try { window.open(fileUrl, '_blank'); } catch (e) { alert('ダウンロードに失敗しました。外部で開いて保存してください。'); }
      return;
    }
  }
  if (!filename) { try { const u = new URL(fileUrl); const base = u.pathname.split('/').pop() || ''; filename = base || 'download.pdf'; } catch(e){ filename = 'download.pdf'; } }
  try { const blob = new Blob([arrayBuffer], { type: 'application/pdf' }); const blobUrl = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1500); }
  catch (err){ console.error('Download failed:', err); alert('ダウンロード中にエラーが発生しました。'); }
};

window.wireDownloadButton = function wireDownloadButton(ui){
  if (!ui) ui = window.__viewer_ui; if (!ui || !ui.btnDownload) return; if (ui.btnDownload.__download_wired) return;
  ui.btnDownload.addEventListener('click', async () => { const arr = window.__viewer_pdfArrayBuffer || null; const url = window.__viewer_pdfUrl || (new URLSearchParams(location.search)).get('file'); await window.downloadOriginalPdf(url, arr); });
  ui.btnDownload.__download_wired = true;
};

window.wireToolbarLogic = function wireToolbarLogic(fileUrl){
  const ui = window.__viewer_ui; if (!ui) return;
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
      // 現在のページの前後2ページ以内かチェック
      const distance = Math.abs(index - currentIndex);
      if (distance <= 2) {
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
    // 横スクロール用: 実際のページコンテンツ幅を取得
    const firstPage = pagesHolder.querySelector('.page');
    const pageBaseWidth = firstPage ? parseFloat(firstPage.getAttribute('data-base-width') || '0') : 0;

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

    // 横スクロール: ページコンテンツがビューポートを超える場合にマージンを追加
    const contentVisualWidth = pageBaseWidth * scale;
    const viewportWidth = cw - 40; // wrapper の padding(左右20px)を除いた幅
    if (pageBaseWidth > 0 && contentVisualWidth > viewportWidth) {
      const extraHalf = (contentVisualWidth - viewportWidth) / 2;
      pagesHolder.style.marginLeft = extraHalf + 'px';
      pagesHolder.style.marginRight = extraHalf + 'px';
    } else {
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

  
  
  



  function fitWidth(){ const viewportWidth = ui.wrapper.clientWidth - 40; const first = ui.pagesHolder.querySelector('.page'); if (!first) return; const baseW = parseFloat(first.getAttribute('data-base-width') || first.style.width || first.clientWidth); const targetScale = Math.max(0.1, viewportWidth / baseW); applyScaleToAllPages(targetScale); }
  function fitPage(){ const viewportHeight = ui.wrapper.clientHeight - ui.toolbar.clientHeight - 40; const first = ui.pagesHolder.querySelector('.page'); if (!first) return; const baseH = parseFloat(first.getAttribute('data-base-height') || first.style.height || first.clientHeight); const targetScale = Math.max(0.1, viewportHeight / baseH); applyScaleToAllPages(targetScale); }
  function goToPage(n){ const { pagesHolder, ui: ui2 } = window._getWrapperAndPagesHolder(); const pages = Array.from(pagesHolder.querySelectorAll('.page')); if (!pages.length) return; const idx = Math.min(Math.max(1, n), pages.length); if (ui2 && ui2.pageInput) ui2.pageInput.value = idx; window.scrollToPageTopByIndex(idx, {extraGap: -50, waitForRender: true }); }

  ui.btnZoomIn.addEventListener('click', () => { applyScaleToAllPages(Math.min(5, currentScale + 0.1)); });
  ui.btnZoomOut.addEventListener('click', () => { applyScaleToAllPages(Math.max(0.1, currentScale - 0.1)); });
  ui.btnFitWidth.addEventListener('click', fitWidth); ui.btnFitPage.addEventListener('click', fitPage);
  //ui.btnNext.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) + 1); });
  //ui.btnPrev.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) - 1); });

  ui.pageInput.addEventListener('change', () => { goToPage(parseInt(ui.pageInput.value||'1',10)); });
  // Print button removed
  ui.zoomVal.addEventListener('change', () => { const raw = ui.zoomVal.value.trim().replace('%',''); const n = parseFloat(raw); if (!isFinite(n) || n <= 0) { ui.zoomVal.value = Math.round(currentScale * 100) + '%'; return; } applyScaleToAllPages(Math.max(0.1, n / 100)); });

  const STORAGE_KEY = 'viewerTextMode';
  function saveMode(m){ try { localStorage.setItem(STORAGE_KEY, m); } catch(_) {} }
  function loadMode(){ try { return localStorage.getItem(STORAGE_KEY) || 'svg'; } catch(_) { return 'svg'; } }
  function updateButtons(mode){
    // フォント調整（overlay）ON時のみ青表示。ダークモードボタンはここでは変更しない。
    if (mode === 'overlay') { ui.btnAjustFont.style.background = '#0a84ff'; }
    else { ui.btnAjustFont.style.background = ''; }
  }
  function applyModeToAllPages(mode){
    const pages = ui.pagesHolder.querySelectorAll('.page');
    pages.forEach(pageDiv => {
      const svgElem = pageDiv.querySelector('svg'); const textLayer = pageDiv.querySelector('.textLayer');
      const hasShadingError = pageDiv.hasAttribute('data-shading-error');
      
      // allowCopy 状態を確認（main.jsで設定された値を参照）
      const firstSpan = textLayer ? textLayer.querySelector('span') : null;
      // data-allow-copy属性がなければ、初回のuserSelect状態から推測
      let allowCopy = false;
      if (pageDiv.hasAttribute('data-allow-copy')) {
        allowCopy = pageDiv.getAttribute('data-allow-copy') === 'true';
      } else if (firstSpan) {
        // 初回はtextLayerのspan状態から判定し、属性に保存
        allowCopy = !(firstSpan.style.userSelect === 'none' || getComputedStyle(firstSpan).userSelect === 'none');
        pageDiv.setAttribute('data-allow-copy', allowCopy ? 'true' : 'false');
      }
      
      if (mode === 'svg' && !hasShadingError) {
        // SVGモード: SVG内テキストを表示（選択不可）、textLayerは透明だが選択可能（正しいUnicodeテキスト）
        if (svgElem) { 
          svgElem.style.pointerEvents = 'none'; 
          svgElem.style.userSelect = 'none'; 
          svgElem.querySelectorAll('text, tspan').forEach(t => { 
            t.style.visibility = ''; 
            t.style.display = ''; 
            t.style.pointerEvents = 'none'; 
            t.style.userSelect = 'none'; // SVGテキストは選択不可（グリフコードのため）
          }); 
        }
        if (textLayer) { 
          textLayer.querySelectorAll('span').forEach(s => { 
            s.style.setProperty('color', 'transparent', 'important');
            s.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
            // コピー許可の場合は透明でも選択可能にする
            s.style.pointerEvents = allowCopy ? 'auto' : 'none'; 
            s.style.userSelect = allowCopy ? 'text' : 'none'; 
            s.style.WebkitUserSelect = allowCopy ? 'text' : 'none'; 
            s.style.MozUserSelect = allowCopy ? 'text' : 'none'; 
            if (allowCopy) {
              s.removeAttribute('aria-hidden');
            } else {
              s.setAttribute('aria-hidden', 'true'); 
            }
          }); 
          textLayer.style.pointerEvents = allowCopy ? 'auto' : 'none'; 
          textLayer.style.userSelect = allowCopy ? 'text' : 'none'; 
          textLayer.style.zIndex = '3000'; 
        }
      } else if (mode === 'overlay' || hasShadingError) {
        // オーバーレイモードまたはShadingエラー: SVG内テキストを非表示、テキストレイヤを表示
        if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; t.style.pointerEvents = 'none'; t.style.userSelect = 'none'; }); svgElem.style.pointerEvents = 'none'; svgElem.style.userSelect = 'none'; }
        const overlayColor = (window.__viewer_darkModeEnabled ? '#e0e0e0' : '#222222');
        if (textLayer) { 
          // allowCopy 状態を確認（data 属性などで保持されていれば参照、なければ span の userSelect で判定）
          const firstSpan = textLayer.querySelector('span');
          const allowCopy = firstSpan ? (getComputedStyle(firstSpan).userSelect !== 'none') : false;
          
          console.log('[DEBUG] Overlay mode - allowCopy:', allowCopy, 'color:', overlayColor, 'spans:', textLayer.querySelectorAll('span').length);
          textLayer.querySelectorAll('span').forEach(s => { 
            // 強制的に色を適用（透明を上書き）
            // 3. 10進数のRGB値に変換
            //const currentColor = s.style.getComputedStyle(); <=なぜかここを有効にするとsetPropertyがうまく動かない（エラーはなし）
            //const [r, g, b] = currentColor.match(/\d+/g).map(Number);
            s.style.setProperty('color', overlayColor, 'important');
            s.style.setProperty('-webkit-text-fill-color', overlayColor, 'important');
            /*この部分を有効にすることで色変更が可能に
            if (Math.abs(r-g) <= 3 && Math.abs(g-b) <= 3 && Math.abs(b-r) <= 3) {
              s.style.setProperty('color', overlayColor, 'important');
              s.style.setProperty('-webkit-text-fill-color', overlayColor, 'important');
            }*/
            // allowCopy=true の場合のみ選択可能、false なら表示のみ
            s.style.pointerEvents = allowCopy ? 'auto' : 'none';
            s.style.userSelect = allowCopy ? 'text' : 'none';
            s.removeAttribute('aria-hidden'); 
          }); 
          textLayer.style.pointerEvents = allowCopy ? 'auto' : 'none';
          textLayer.style.userSelect = allowCopy ? 'text' : 'none';
          textLayer.style.zIndex = '3000'; 
          
          console.log('[DEBUG] First span after apply - color:', firstSpan?.style.color, 'computed:', firstSpan ? getComputedStyle(firstSpan).color : 'null');
        }
      }
    });
    try { localStorage.setItem('viewerTextMode', mode); } catch(_) {}
    updateButtons(mode);
  }

  const initialMode = loadMode(); updateButtons(initialMode); applyModeToAllPages(initialMode);
  // ダークモードボタンは ui.ensureDarkModeToggle 側で配線済み。ここでは何もしない。
  // フォント調整ボタンをトグル式に（overlay <-> svg）
  ui.btnAjustFont.addEventListener('click', () => {
    const cur = loadMode();
    const next = (cur === 'overlay') ? 'svg' : 'overlay';
    saveMode(next);
    updateButtons(next);
    applyModeToAllPages(next);
  });

  window.__viewer_applyScaleToAllPages = applyScaleToAllPages;
  window.__viewer_goToPage = function(n){ goToPage(n); };
  window.__viewer_applyMode = applyModeToAllPages;

  // Download ボタン配線（既に wired ならスキップ）
  try { window.wireDownloadButton(ui); } catch (e) { console.warn('wireDownloadButton failed', e); }
};


