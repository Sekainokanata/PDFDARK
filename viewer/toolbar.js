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
  let isScaling = false; // 連続拡大縮小の制御フラグ
  let pendingScale = null; // 保留中のスケール値
  let highQualityRenderTimeout = null; // 高品質レンダリング用タイマー
  
  function applyScaleToAllPages(scale, options = {}){
    // 既にスケール処理中の場合、最新の値を保留して終了
    if (isScaling) {
      pendingScale = scale;
      return;
    }
    
    isScaling = true;
    // ズーム中フラグを設定（renderPageContent で重い処理をスキップ）
    window.__viewer_isZooming = true;
    const wrapper = ui.wrapper;
    
    // 現在のスクロール位置とビューポート中心を記録（確定値）
    const oldScrollLeft = wrapper.scrollLeft;
    const oldScrollTop = wrapper.scrollTop;
    const oldScale = currentScale;
    
    // 先に pages を取得して基準幅/高さを得る
    const pages = Array.from(ui.pagesHolder.querySelectorAll('.page'));

    // transform 時の最大スクロール値（DOM座標系）
    const maxScrollLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    const maxScrollTop = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);

    // base 幅/高さを決定（優先: data-base-* 属性、無ければ style/client を oldScale で割って復元）
    let baseW = 0, baseH = 0;
    if (pages[0]) {
      const p0 = pages[0];
      const attrW = p0.getAttribute('data-base-width');
      const attrH = p0.getAttribute('data-base-height');
      if (attrW) baseW = parseFloat(attrW) || 0;
      if (attrH) baseH = parseFloat(attrH) || 0;
      if (!baseW) {
        const styleW = parseFloat(p0.style.width) || p0.clientWidth || 0;
        baseW = oldScale > 0 ? styleW / oldScale : styleW;
      }
      if (!baseH) {
        const styleH = parseFloat(p0.style.height) || p0.clientHeight || 0;
        baseH = oldScale > 0 ? styleH / oldScale : styleH;
      }
    } else {
      baseW = wrapper.scrollWidth || 0;
      baseH = wrapper.scrollHeight || 0;
    }

    // DOM確定時に合わせる式: newScroll = (base * scale / 2) - (viewport / 2)
    const cw = wrapper.clientWidth;
    const ch = wrapper.clientHeight;
    const newScrollLeft = Math.max(0, Math.min(baseW * scale / 2 - cw / 2, maxScrollLeft));
    const newScrollTop = Math.max(0, Math.min(baseH * scale / 2 - ch / 2, maxScrollTop));
    
    // 先読み: baseW/baseH と paper を収集（読み取りをまとめる）
    const metas = pages.map(pageDiv => {
      const baseW = parseFloat(pageDiv.getAttribute('data-base-width') || pageDiv.style.width) || 0;
      const baseH = parseFloat(pageDiv.getAttribute('data-base-height') || pageDiv.style.height) || 0;
      const paper = pageDiv.querySelector('.paper');
      return { pageDiv, baseW, baseH, paper };
    });
    
    // 提案B: ズーム中は transform のみ更新（GPU合成レイヤで高速処理）
    // pageDiv.style.width/height は触らない（レイアウト計算スキップ）
    metas.forEach(m => {
      const { paper } = m;
      if (paper) {
        paper.style.transform = `scale(${scale})`;
        paper.style.transformOrigin = '0 0';
        paper.setAttribute('data-scale', scale);
        paper.setAttribute('data-needs-quality-render', 'true');
      }
    });
    
    // currentScale を即座に更新（次の呼び出しで正しい値を使うため）
    currentScale = scale; 
    ui.zoomVal.value = Math.round(scale * 100) + '%';

    // スクロール位置を即座に適用（transform のスケールを考慮）
    // 安定化のため、ズーム中は横方向を左揃えにする
    if (wrapper && oldScale > 0) {
      // 横は左揃え
      wrapper.scrollLeft = 0;
      // 縦は新しいトップ位置を適用
      wrapper.scrollTop = Math.max(0, newScrollTop);
      
      // レイアウト確定後に微調整と次の処理
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            // 横は左揃えを維持
            wrapper.scrollLeft = 0;
            // 縦のみ適切にクランプ
            const visualMaxScrollTop = Math.max(0, wrapper.scrollHeight * (currentScale / oldScale) - wrapper.clientHeight);
            wrapper.scrollTop = Math.max(0, Math.min(newScrollTop, visualMaxScrollTop));
          } catch(e) {
            console.warn('Scroll position adjustment failed:', e);
          }
          
          // 処理完了、ズーム中フラグを解除
          window.__viewer_isZooming = false;
          isScaling = false;
          if (pendingScale !== null) {
            const nextScale = pendingScale;
            pendingScale = null;
            applyScaleToAllPages(nextScale);
          } else {
            // 操作が落ち着いたら（debounce）実レイアウトを書き込む
            if (highQualityRenderTimeout) clearTimeout(highQualityRenderTimeout);
            highQualityRenderTimeout = setTimeout(() => {
              // 一括書き込みは RAF 内で行う
              requestAnimationFrame(() => {
                try {
                  // 実際のレイアウトサイズを書き込む（これで DOM リフロー）
                  metas.forEach(m => {
                    const { pageDiv, baseW, baseH, paper } = m;
                    pageDiv.style.width = (baseW * currentScale) + 'px';
                    pageDiv.style.height = (baseH * currentScale) + 'px';
                    if (paper && paper.getAttribute('data-needs-quality-render') === 'true') {
                      paper.removeAttribute('data-needs-quality-render');
                      // ここで必要ならCanvasの再レンダリング等を行う（noopで保留）
                    }
                  });
                } catch (e) { console.warn('Batch layout update failed', e); }
              });
            }, 200); // 200ms デバウンスで実行
          }
        });
      });
    } else {
      window.__viewer_isZooming = false;
      isScaling = false;
      if (pendingScale !== null) {
        const nextScale = pendingScale;
        pendingScale = null;
        applyScaleToAllPages(nextScale);
      }
    }
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
  ui.wrapper.addEventListener('scroll', () => {defaultValue = calcPages();ui.pageInput.value = Math.round(defaultValue)+1;})

  
  
  



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


