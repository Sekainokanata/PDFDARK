// main.js
// 旧 viewer.js のエントリーポイント（startViewer）を分離


window.startViewer = async function startViewer(){
  // pdf.worker.js / cmaps のパスを拡張内の URL で設定
  try { 
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.js'); 
  } 
  catch(_) {}

  const cMapUrlForExtension = chrome.runtime.getURL('pdfjs/cmaps/');

  // 旧: MLサンドボックスの事前ウォームアップは廃止

  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  if (file) {
    try { 
      const urlObj = new URL(file, location.href); 
      const filename = urlObj.pathname.split('/').pop() || 'PDF'; 
      document.title = decodeURIComponent(filename); 
    }
    catch (e) { 
      const name = (file.split('/').pop() || 'PDF'); 
      try { 
        document.title = decodeURIComponent(name); 
      } 
      catch(_) { 
        document.title = name; 
      } 
    }
  }

  const origContainer = document.getElementById('container');
  if (!file) { 
    origContainer.textContent = 'No file specified.'; 
    return; 
  }

  let resp; 
  try { 
    resp = await fetch(file); 
    if (!resp.ok) {
      throw new Error('Failed to fetch PDF: ' + resp.status); 
    }
  }
  catch(e){ 
    origContainer.textContent = 'Fetch error: ' + e.message; 
    return; 
  }
  const arrayBuffer = await resp.arrayBuffer();
  // pdfArrayBufferは保持せずメモリ削減（必要時に再フェッチ）
  window.__viewer_pdfUrl = file;

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: cMapUrlForExtension, cMapPacked: true, useWorkerFetch: true });
  const pdf = await loadingTask.promise;
  window.viewerPdf = pdf;

  origContainer.innerHTML = '';
  const ui = window.setupShell(origContainer);

  // ツールバー配線（ボタンやモード等）を先に行ってユーティリティ関数を提供
  window.wireToolbarLogic(file);
  // Ctrl+ホイールでブラウザズームではなく内部ズームに割り当て
  try {
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        let current = 1.0;
        try { 
          const txt = (ui.zoomVal.value || '100%').toString().replace('%',''); 
          const v = parseFloat(txt); 
          if (isFinite(v) && v > 0) {
            current = v / 100; 
          }
        } 
        catch(_) {}

        // マウスホイールとトラックパッドで感度を分離
        // トラックパッド(ピンチ): deltaMode===0 かつ deltaY が小さい連続値
        // マウスホイール: deltaMode===1 または deltaY の絶対値が大きい離散値
        const isTrackpad = (e.deltaMode === 0 && Math.abs(e.deltaY) < 50);
        const K_MOUSE    = 0.002; // マウスホイール用感度（従来値）
        const K_TRACKPAD = 0.008; // トラックパッド用感度
        const K = isTrackpad ? K_TRACKPAD : K_MOUSE;
        const factor = Math.exp(-e.deltaY * K);
        const next = Math.min(5, Math.max(0.1, current * factor));

        if (typeof window.__viewer_applyScaleToAllPages === 'function') {
          window.__viewer_applyScaleToAllPages(next);
        }
      }
    };
    // wrapper にだけ適用（ページ全体にはかけない）
    ui.wrapper.addEventListener('wheel', onWheel, { passive: false });
  } catch(_) {}

  //ページ数反映
  try { 
    if (ui && ui.pageTotal && ui.pageTotal !== null) {
      ui.pageTotal.textContent = `/ ${pdf.numPages}`;
    }
  } catch(_) {}

  // ハイライトトグルボタン追加 + 監視
  try { 
    window.ensureHighlightToggle(ui); 
  } 
  catch(_) {}
  
  try { 
    window.setupHighlightObserver(); 
  } 
  catch(_) {}
  
  // ダークモードトグル（UI配線）
  try { 
    window.ensureDarkModeToggle(ui); 
  } 
  catch(_) {}

  const container = ui.pagesHolder;

  const permInfo = await window.detectCopyPermission(pdf);
  
  const allowCopy = (permInfo.canCopy === null) ? true : !!permInfo; 
  console.log('PDF permission raw:', permInfo.rawPerms, 'allowCopy:', allowCopy);
  let removeCopyBlockers = null;
  if (!allowCopy) {
    removeCopyBlockers = window.installCopyBlockers(container);
  }

  const curMode = (function(){ 
    try { 
      return localStorage.getItem('viewerTextMode') || 'svg'; 
    } 
    catch(_) { 
      return 'svg'; 
    } 
  })();

  // ダークモードの初期状態を先に適用（ページレンダリング前）
  // これにより、初回起動時でもダークモードがONの場合、正しく色反転される
  const shouldApplyDarkModeInitially = window.__viewer_darkModeEnabled;

  // メモリ削減: 初期表示は最初の3ページのみレンダリング，残りは10ページずつレンダリング
  const INITIAL_RENDER_PAGES = 3;
  const RENDER_PAGES = 10;
  
  // ページメタデータを保持（遅延レンダリング用）
  window.__viewer_pageMetadata = new Map();

  // プレースホルダーページを生成する関数
  async function createPlaceholderPage(pageNum) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.setAttribute('data-page-num', pageNum);
    pageDiv.setAttribute('data-base-width', viewport.width);
    pageDiv.setAttribute('data-base-height', viewport.height);
    pageDiv.setAttribute('data-placeholder', 'true');
    // cssTextで一括設定（個別style代入による複数Reflow回避）
    pageDiv.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;transform-origin:0 0;overflow:visible;display:block;position:relative;background:#f0f0f0`;
    
    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;transform-origin:0 0;background:#fff;display:flex;align-items:center;justify-content:center;color:#999`;
    paper.textContent = `Page ${pageNum}`;
    
    const footer = document.createElement('div');
    footer.className = 'page-footer';
    footer.textContent = `Page ${pageNum} / ${pdf.numPages}`;
    
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page-wrapper';
    pageWrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';
    
    pageDiv.appendChild(paper);
    pageWrapper.appendChild(pageDiv);
    pageWrapper.appendChild(footer);
    
    // メタデータ保存
    window.__viewer_pageMetadata.set(pageNum, { viewport, width: viewport.width, height: viewport.height });
    
    // ページオブジェクトを即座にクリーンアップ
    try { page.cleanup(); } catch(_) {}
    
    return pageWrapper;
  }

  // 全ページのプレースホルダーをDocumentFragmentでバッチ生成
  // N回のDOM挿入 → 1回に集約してReflowを最小化
  {
    const fragment = document.createDocumentFragment();
    const PLACEHOLDER_BATCH = 10; // 10ページずつ並列メタデータ取得
    for (let start = 1; start <= pdf.numPages; start += PLACEHOLDER_BATCH) {
      const end = Math.min(start + PLACEHOLDER_BATCH, pdf.numPages + 1);
      const batch = [];
      for (let p = start; p < end; p++) {
        batch.push(createPlaceholderPage(p));
      }
      const wrappers = await Promise.all(batch);
      for (const w of wrappers) fragment.appendChild(w);
    }
    container.appendChild(fragment); // 1回のDOM挿入でReflow最小化
  }

  // レンダリング済みページを追跡（遅延レンダリングシステム用）
  window.__viewer_renderedPages = new Set();
  
  // 遅延レンダリングシステム（メモリ削減）
  const renderQueue = new Set();
  let isRendering = false;
  
  async function processRenderQueue() {
    if (isRendering || renderQueue.size === 0) return;
    // If a user is actively zooming, defer full-page rendering until zoom finishes.
    if (window.__viewer_isZooming) {
      // Retry on next animation frame; this keeps the queue alive but avoids heavy work during zoom.
      requestAnimationFrame(() => processRenderQueue());
      return;
    }
    isRendering = true;
    
    const pageNum = Array.from(renderQueue)[0];
    renderQueue.delete(pageNum);
    
    try {
      await renderPageContent(pageNum, pdf, container, allowCopy, curMode);
      window.__viewer_renderedPages.add(pageNum);
      console.log(`Lazy rendered page ${pageNum}`);
    } catch(e) {
      console.error(`Failed to render page ${pageNum}:`, e);
    }
    
    isRendering = false;
    // 次のページをレンダリング
    if (renderQueue.size > 0) {
      requestAnimationFrame(() => processRenderQueue());
    }
  }

  // ページレンダリング関数は page-render.js に外部化済み
  // window.renderPageContent(p, pdf, container, allowCopy, curMode) を使用
  const renderPageContent = window.renderPageContent;

  // IntersectionObserverによる遅延レンダリング
  // scroll + getBoundingClientRect方式に比べ、強制レイアウト（Reflow）を回避
  let pageObserver = null;
  try {
    pageObserver = new IntersectionObserver((entries) => {
      let hasNewPages = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageDiv = entry.target;
        const pageNum = parseInt(pageDiv.getAttribute('data-page-num'));
        if (!pageNum || window.__viewer_renderedPages.has(pageNum)) continue;
        renderQueue.add(pageNum);
        hasNewPages = true;
      }
      if (hasNewPages) processRenderQueue();
    }, {
      root: ui.wrapper,
      rootMargin: '5000px 0px', // プリレンダリング領域（上下5000px）
      threshold: 0
    });
    
    // 全プレースホルダーページを監視開始
    container.querySelectorAll('.page').forEach(pageDiv => {
      pageObserver.observe(pageDiv);
    });
  } catch(e) {
    console.warn('IntersectionObserver setup failed:', e);
  }

  // 初期ロード: IntersectionObserverが検出したページをレンダリング
  // （全ページ一括ではなく、可視ページのみ優先処理 → 大規模PDF高速化）
  async function performInitialRender() {
    // 次フレームまで待機（DOM配置完了・IO発火を待つ）
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    
    // IOで既にキューにページがあれば処理開始
    if (renderQueue.size > 0) {
      processRenderQueue();
      return;
    }
    
    // IOが未発火の場合のフォールバック: 最初の数ページを手動キュー追加
    const FALLBACK_PAGES = Math.min(5, pdf.numPages);
    for (let p = 1; p <= FALLBACK_PAGES; p++) {
      if (!window.__viewer_renderedPages.has(p)) {
        renderQueue.add(p);
      }
    }
    processRenderQueue();
  }
  
  // 初期レンダリング開始（非同期、次フレームで実行）
  try {
    setTimeout(() => performInitialRender(), 50);
  } catch(e) {
    console.warn('Failed to perform initial render:', e);
  }

  // 配線後に初期スケール/モードを適用
  try { 
    window.__viewer_applyScaleToAllPages(1.0); 
  } catch(_) {}
  try { 
    window.__viewer_applyMode(curMode); 
  } catch(_) {}
  // 初期ダークモード状態適用は不要（ページレンダリング時に既に適用済み）
  // ページレンダリングループ内でshouldApplyDarkModeInitiallyに基づいて処理されている

  window.viewerCleanup = () => { 
    if (pageObserver) { pageObserver.disconnect(); pageObserver = null; }
  };
  window.viewerPdf = pdf;

  window.scrollTo(0, 0);
};
