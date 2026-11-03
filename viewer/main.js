// main.js
// 旧 viewer.js のエントリーポイント（startViewer）を分離


window.startViewer = async function startViewer(){
  window.performance?.mark?.('pdfdark:start');
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

  window.__viewer_pdfUrl = file;
  const documentOptions = { cMapUrl: cMapUrlForExtension, cMapPacked: true, useWorkerFetch: true };
  let pdf;
  try {
    if (/^https?:\/\//i.test(file)) {
      // PDF.js が Range/streaming に対応したサーバーから必要部分を取得する。
      const task = pdfjsLib.getDocument({ ...documentOptions, url: file });
      try {
        pdf = await task.promise;
      } catch (urlError) {
        try { await task.destroy(); } catch (_) {}
        console.warn('URL loading failed; retrying with fetch:', urlError);
      }
    }
    if (!pdf) {
      const response = await fetch(file);
      if (!response.ok) throw new Error('Failed to fetch PDF: ' + response.status);
      const data = await response.arrayBuffer();
      pdf = await pdfjsLib.getDocument({ ...documentOptions, data }).promise;
    }
  } catch (error) {
    origContainer.textContent = 'PDF loading error: ' + error.message;
    return;
  }
  window.performance?.mark?.('pdfdark:document-ready');
  window.performance?.measure?.('pdfdark:document-load', 'pdfdark:start', 'pdfdark:document-ready');
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

  // ページメタデータを保持（遅延レンダリング用）
  window.__viewer_pageMetadata = new Map();

  // プレースホルダーページを生成する関数
  async function createPlaceholderPage(pageNum) {
    let page;
    let viewport;
    try {
      page = await pdf.getPage(pageNum);
      viewport = page.getViewport({ scale: 1.5 });
    } catch (error) {
      if (pageNum === 1) throw error;
      console.warn(`Could not read page ${pageNum} size; using first page size:`, error);
      viewport = window.__viewer_pageMetadata.get(1).viewport;
    }
    
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.setAttribute('data-page-num', pageNum);
    pageDiv.setAttribute('data-base-width', viewport.width);
    pageDiv.setAttribute('data-base-height', viewport.height);
    pageDiv.setAttribute('data-placeholder', 'true');
    // cssTextで一括設定（個別style代入による複数Reflow回避）
    pageDiv.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;transform-origin:0 0;overflow:visible;display:block;position:relative`;
    
    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;transform-origin:0 0;background:${window.__viewer_darkModeEnabled ? '#1e1e1e' : '#fff'};display:flex;align-items:center;justify-content:center;color:#999`;
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
    try { page?.cleanup(); } catch(_) {}
    
    return pageWrapper;
  }

  // 先頭ページだけ用意し、残りのページ枠は初回描画と並行して追加する。
  container.appendChild(await createPlaceholderPage(1));

  // レンダリング済みページを追跡（遅延レンダリングシステム用）
  window.__viewer_renderedPages = new Set();
  
  // 遅延レンダリングシステム（メモリ削減）
  const renderQueue = new Set();
  const failedPages = new Set();
  let isRendering = false;
  let firstPageMeasured = false;

  function nextPageToRender() {
    const viewport = ui.wrapper.getBoundingClientRect();
    let bestPage = null;
    let bestDistance = Infinity;
    for (const pageNum of renderQueue) {
      const page = container.querySelector(`.page[data-page-num="${pageNum}"]`);
      if (!page) continue;
      const rect = page.getBoundingClientRect();
      const distance = rect.bottom < viewport.top ? viewport.top - rect.bottom
        : rect.top > viewport.bottom ? rect.top - viewport.bottom : 0;
      if (distance < bestDistance) {
        bestPage = pageNum;
        bestDistance = distance;
      }
    }
    return bestPage;
  }
  
  async function processRenderQueue() {
    if (isRendering || renderQueue.size === 0) return;
    // If a user is actively zooming, defer full-page rendering until zoom finishes.
    if (window.__viewer_isZooming) {
      // Retry on next animation frame; this keeps the queue alive but avoids heavy work during zoom.
      requestAnimationFrame(() => processRenderQueue());
      return;
    }
    isRendering = true;
    
    const pageNum = nextPageToRender();
    if (pageNum === null) {
      isRendering = false;
      return;
    }
    renderQueue.delete(pageNum);
    
    try {
      const result = await renderPageContent(pageNum, pdf, container, allowCopy, curMode);
      if (result === 'deferred') {
        renderQueue.add(pageNum);
        return;
      }
      window.__viewer_renderedPages.add(pageNum);
      if (pageNum === 1 && !firstPageMeasured) {
        firstPageMeasured = true;
        window.performance?.mark?.('pdfdark:first-page-ready');
        window.performance?.measure?.('pdfdark:first-page', 'pdfdark:start', 'pdfdark:first-page-ready');
      }
      console.log(`Lazy rendered page ${pageNum}`);
    } catch(e) {
      console.error(`Failed to render page ${pageNum}:`, e);
      const pageDiv = container.querySelector(`[data-page-num="${pageNum}"]`);
      const paper = pageDiv?.querySelector('.paper');
      if (paper) {
        paper.replaceChildren();
        const message = document.createElement('span');
        message.textContent = `ページ ${pageNum} の描画に失敗しました。`;
        const retry = document.createElement('button');
        retry.textContent = '再試行';
        retry.addEventListener('click', () => {
          retry.disabled = true;
          failedPages.delete(pageNum);
          renderQueue.add(pageNum);
          processRenderQueue();
        });
        paper.append(message, retry);
      }
      failedPages.add(pageNum);
    } finally {
      isRendering = false;
      if (renderQueue.size > 0) requestAnimationFrame(() => processRenderQueue());
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
        if (!pageNum || failedPages.has(pageNum) || window.__viewer_renderedPages.has(pageNum)) continue;
        renderQueue.add(pageNum);
        hasNewPages = true;
      }
      if (hasNewPages) processRenderQueue();
    }, {
      root: ui.wrapper,
      rootMargin: `${Math.max(400, ui.wrapper.clientHeight)}px 0px`,
      threshold: 0
    });
    
    // 全プレースホルダーページを監視開始
    container.querySelectorAll('.page').forEach(pageDiv => {
      pageObserver.observe(pageDiv);
      pageDiv.__viewer_observed = true;
    });
  } catch(e) {
    console.warn('IntersectionObserver setup failed:', e);
  }

  // 先頭ページは IntersectionObserver の通知を待たずに描画する。
  renderQueue.add(1);
  const firstPageRender = processRenderQueue();

  let createdThrough = 1;
  let requestedThrough = 1;
  let buildingPlaceholders = false;
  const pageWaiters = [];

  async function buildPlaceholders() {
    if (buildingPlaceholders) return;
    buildingPlaceholders = true;
    try {
      while (createdThrough < requestedThrough) {
        const end = Math.min(createdThrough + 10, requestedThrough);
        const batch = [];
        for (let p = createdThrough + 1; p <= end; p++) batch.push(createPlaceholderPage(p));
        const wrappers = await Promise.all(batch);
        const fragment = document.createDocumentFragment();
        for (const pageWrapper of wrappers) fragment.appendChild(pageWrapper);
        container.appendChild(fragment);
        createdThrough = end;
        if (pageObserver) {
          for (const pageWrapper of wrappers) {
            const page = pageWrapper.querySelector('.page');
            pageObserver.observe(page);
            page.__viewer_observed = true;
          }
        }
        for (let i = pageWaiters.length - 1; i >= 0; i--) {
          if (pageWaiters[i].page <= createdThrough) {
            pageWaiters[i].resolve();
            pageWaiters.splice(i, 1);
          }
        }
        // DOMを描画できるよう、ページ枠の追加をフレームごとに区切る。
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } catch (error) {
      console.error('Could not create page placeholders:', error);
      for (const waiter of pageWaiters.splice(0)) waiter.reject(error);
    } finally {
      buildingPlaceholders = false;
    }
  }

  window.__viewer_ensurePage = function ensurePage(pageNumber) {
    const target = Math.min(pdf.numPages, Math.max(1, Math.trunc(pageNumber)));
    if (!Number.isFinite(target)) return Promise.reject(new Error('Invalid page number'));
    if (target <= createdThrough) return Promise.resolve();
    requestedThrough = Math.max(requestedThrough, target);
    return new Promise((resolve, reject) => {
      pageWaiters.push({ page: target, resolve, reject });
      buildPlaceholders();
    });
  };

  // 先頭ページの描画を優先し、その後に残りのページ枠を埋める。
  setTimeout(() => {
    firstPageRender.finally(() => window.__viewer_ensurePage(pdf.numPages)).catch(console.error);
  }, 0);

  // 初期倍率は1倍なのでズーム処理を起動しない。
  try { 
    window.__viewer_applyMode(curMode); 
  } catch(_) {}

  window.viewerCleanup = () => { 
    if (pageObserver) { pageObserver.disconnect(); pageObserver = null; }
  };
  window.viewerPdf = pdf;

  window.scrollTo(0, 0);
};
