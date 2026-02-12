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

        const K = 0.006; // 感度係数（小さく→低感度/大きく→高感度）
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
    pageDiv.style.width = viewport.width + 'px';
    pageDiv.style.height = viewport.height + 'px';
    pageDiv.style.transformOrigin = '0 0';
    pageDiv.style.overflow = 'visible';
    pageDiv.style.display = 'block';
    pageDiv.style.position = 'relative';
    pageDiv.style.background = '#f0f0f0';
    
    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.style.width = viewport.width + 'px';
    paper.style.height = viewport.height + 'px';
    paper.style.transformOrigin = '0 0';
    paper.style.background = '#fff';
    paper.style.display = 'flex';
    paper.style.alignItems = 'center';
    paper.style.justifyContent = 'center';
    paper.style.color = '#999';
    paper.textContent = `Page ${pageNum}`;
    
    const footer = document.createElement('div');
    footer.className = 'page-footer';
    footer.textContent = `Page ${pageNum} / ${pdf.numPages}`;
    
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page-wrapper';
    pageWrapper.style.display = 'flex';
    pageWrapper.style.flexDirection = 'column';
    pageWrapper.style.alignItems = 'center';
    pageWrapper.style.gap = '8px';
    
    pageDiv.appendChild(paper);
    pageWrapper.appendChild(pageDiv);
    pageWrapper.appendChild(footer);
    
    // メタデータ保存
    window.__viewer_pageMetadata.set(pageNum, { viewport, width: viewport.width, height: viewport.height });
    
    // ページオブジェクトを即座にクリーンアップ
    try { page.cleanup(); } catch(_) {}
    
    return pageWrapper;
  }

  // 全ページのプレースホルダーを先に生成
  for (let p = 1; p <= pdf.numPages; p++) {
    const pageWrapper = await createPlaceholderPage(p);
    container.appendChild(pageWrapper);
  }

  // レンダリング済みページを追跡（遅延レンダリングシステム用）
  window.__viewer_renderedPages = new Set();
  
  // 遅延レンダリングシステム（メモリ削減）
  let renderDebounceTimer = null;
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
  
  function updateVisiblePages() {
    if (renderDebounceTimer) {
      clearTimeout(renderDebounceTimer);
    }
    renderDebounceTimer = setTimeout(async () => {
      const wrapper = ui.wrapper;
      const viewportTop = wrapper.scrollTop;
      const viewportBottom = viewportTop + wrapper.clientHeight;
      const RENDER_MARGIN = 5000; // プリレンダリングマージン（ピクセル）
      
      const pages = ui.pagesHolder.querySelectorAll('.page');
      const visiblePages = [];
      
      pages.forEach((pageDiv) => {
        const pageNum = parseInt(pageDiv.getAttribute('data-page-num'));
        if (!pageNum) return;
        
        const rect = pageDiv.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const pageTop = rect.top - wrapperRect.top + viewportTop;
        const pageBottom = pageTop + rect.height;
        
        const isVisible = pageBottom >= viewportTop - RENDER_MARGIN &&
                         pageTop <= viewportBottom + RENDER_MARGIN;
        
        if (isVisible && !window.__viewer_renderedPages.has(pageNum)) {
          visiblePages.push(pageNum);
        }
      });
      
      // 可視範囲のページをレンダリングキューに追加（優先度順）
      visiblePages.sort((a, b) => a - b);
      visiblePages.forEach(pageNum => {
        renderQueue.add(pageNum);
      });
      
      // レンダリングキュー処理開始
      processRenderQueue();
    }, 150); // 150msのデバウンス
  }

  // ページレンダリング関数
  async function renderPageContent(p, pdf, container, allowCopy, curMode) {
    // 既存のプレースホルダーを検索
    const existingPages = container.querySelectorAll('.page');
    let placeholderWrapper = null;
    existingPages.forEach(pageDiv => {
      const pageNum = parseInt(pageDiv.getAttribute('data-page-num'));
      if (pageNum === p) {
        placeholderWrapper = pageDiv.closest('.page-wrapper');
      }
    });
    
    let hadShadingError = false;
    let shadingErrorDetails = null;
    
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const opList = await page.getOperatorList();
      const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
      let svg = null;
      
      try {
        svg = await svgGfx.getSVG(opList, viewport);
      } catch(svgError) {
        // SVGレンダリング中のShadingエラーを検出
        if (svgError && svgError.message && svgError.message.includes('Unknown IR type: Shading')) {
          hadShadingError = true;
          shadingErrorDetails = {
            error: svgError,
            operatorList: opList
          };
          
          // エラー詳細をログ出力
          console.warn(`Page ${p}: Shading rendering failed - attempting fallback`);
          console.warn(`Error details:`, svgError.message);
          
          // オペレーターリストを解析して問題の文字を特定
          try {
            const ops = opList.fnArray || [];
            const args = opList.argsArray || [];
            console.group(`Page ${p}: Operator analysis`);
            
            ops.forEach((op, idx) => {
              const opName = pdfjsLib.OPS ? Object.keys(pdfjsLib.OPS).find(k => pdfjsLib.OPS[k] === op) : op;
              if (opName && (opName.includes('Text') || opName.includes('Font') || opName.includes('Shading'))) {
                console.log(`Op[${idx}]: ${opName}`, args[idx]);
              }
            });
            console.groupEnd();
          } catch(e) {
            console.warn('Could not analyze operator list:', e);
          }
          
          // フォールバック: 空のSVGを作成
          svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          svg.setAttribute('version', '1.1');
        } else {
          throw svgError; // 他のエラーは再スロー
        }
      }

      // まずテキスト有無を判定
      let textContent = null; try { textContent = await page.getTextContent(); } catch(e){ console.warn('getTextContent failed for page', p, e); }
      function looksGoodTextContent(tc){ if (!tc || !tc.items || tc.items.length === 0) return false; const sample = tc.items.slice(0, 20).map(i => i.str).join(''); return /[0-9A-Za-z\u3000-\u30FF\u4E00-\u9E0E0E0]/.test(sample); }
      
      // SVG内のtext/tspanのうち、空白以外の文字があり、かつ0x0でないものを確認
      const svgTextElems = svg.querySelectorAll('text, tspan');
      let svgHasNonEmptyText = false;
      for (const n of svgTextElems) {
        const txt = (n.textContent || '').replace(/\s+/g, '');
        if (txt.length > 0) {
          // svg:textが0x0サイズでないかチェック
          if (n.tagName.toLowerCase().includes('text')) {
            const bbox = n.getBBox ? n.getBBox() : null;
            if (bbox && bbox.width === 0 && bbox.height === 0) {
              continue; // 0x0のtext要素はスキップ
            }
          }
          svgHasNonEmptyText = true;
          break;
        }
      }
      
      // SVG内にpath要素が存在し、かつそれがテキスト用と思われるかチェック
      // (g要素のtransform属性にマイナスのスケールがある場合、テキストの可能性が高い)
      const svgPathElems = svg.querySelectorAll('path');
      let hasSvgPaths = false;
      if (svgPathElems.length > 0) {
        // path要素の親g要素をチェック
        for (const pathElem of svgPathElems) {
          const parentG = pathElem.closest('g');
          if (parentG) {
            const transform = parentG.getAttribute('transform');
            // matrix(a b c d e f)でc(y方向のスケール)が負の場合、テキストの可能性が高い
            if (transform && /matrix\([^)]*-[\d.]+[^)]*\)/.test(transform)) {
              hasSvgPaths = true;
              break;
            }
          }
        }
      }
      
      // テキストレイヤー、SVG内テキスト、またはテキスト用path要素のいずれかがあればSVG描画を使用
      const hasTextContent = !!(textContent && Array.isArray(textContent.items) && textContent.items.length > 0);
      const hasAnyText = hasTextContent || svgHasNonEmptyText || hasSvgPaths;
      // hasText はテキストの存在有無のみで判定（allowCopy はテキストレイヤの表示可否に使う）
      const hasText = looksGoodTextContent(textContent);

      // ページ要素をこの時点で用意
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.setAttribute('data-page-num', p);
      pageDiv.setAttribute('data-base-width', viewport.width);
      pageDiv.setAttribute('data-base-height', viewport.height);
      // Shadingエラーフラグを保存
      if (hadShadingError) {
        pageDiv.setAttribute('data-shading-error', 'true');
      }
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';
      pageDiv.style.transformOrigin = '0 0'; pageDiv.style.overflow = 'visible'; pageDiv.style.display = 'block'; pageDiv.style.position = 'relative';
      const paper = document.createElement('div');
      paper.className = 'paper';
      paper.style.width = viewport.width + 'px';
      paper.style.height = viewport.height + 'px';
      paper.style.transformOrigin = '0 0';
      const footer = document.createElement('div'); footer.className = 'page-footer'; footer.textContent = `Page ${p} / ${pdf.numPages}`;
      
      // ページラッパー（page + footer を含む）
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'page-wrapper';
      pageWrapper.style.display = 'flex';
      pageWrapper.style.flexDirection = 'column';
      pageWrapper.style.alignItems = 'center';
      pageWrapper.style.gap = '8px';

      // 常にSVG描画を使用（allowCopy=false でもベクター表示を維持）
      if (hasAnyText) {
        // 即時描画
        try {
          svg.style.width = viewport.width + 'px';
          svg.style.height = viewport.height + 'px';
          svg.setAttribute('width', viewport.width);
          svg.setAttribute('height', viewport.height);
        } catch(_) {}
        paper.appendChild(svg);
        pageDiv.appendChild(paper);
        pageWrapper.appendChild(pageDiv);
        pageWrapper.appendChild(footer);
        
        // プレースホルダーがあれば置き換え、なければ追加
        if (placeholderWrapper) {
          placeholderWrapper.replaceWith(pageWrapper);
        } else {
          container.appendChild(pageWrapper);
        }

        // ここから描画後の調整（ダークモードON時のみスマート反転）
        if (window.__viewer_darkModeEnabled) {
          window.invertSvgColorsSmart(svg, { satThreshold: 0.15 });
        }
        // テキストレイヤ: textContent があれば常に生成（allowCopy=false でもオーバーレイモードのため必要）
        if (textContent && textContent.items && textContent.items.length > 0) {
          const wantForceVisible = hadShadingError || (curMode === 'overlay');
          const overlayColor = window.__viewer_darkModeEnabled ? '#E0E0E0' : '#222222';
          
          // Shadingエラー時は詳細ログを出力
          if (hadShadingError) {
            console.group(`Page ${p}: Shading fallback - rendering text layer`);
            console.log('Text items:', textContent.items.length);
            textContent.items.slice(0, 10).forEach((item, idx) => {
              console.log(`  [${idx}] "${item.str}" at (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)})`);
            });
            if (textContent.items.length > 10) {
              console.log(`  ... and ${textContent.items.length - 10} more items`);
            }
            console.groupEnd();
          }
          
          // Shadingエラー時はSVGテキストとの重複チェックを無効化(常に表示)
          const makeTransparent = hadShadingError ? false : true;
          window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: makeTransparent, color: overlayColor, allowCopy: allowCopy });
          // ページにallowCopy状態を保存（toolbar.jsで参照）
          pageDiv.setAttribute('data-allow-copy', allowCopy ? 'true' : 'false');
          if (wantForceVisible) { const svgElem = pageDiv.querySelector('svg'); if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; }); } }
        }
        if (window.__viewer_darkModeEnabled && !hadShadingError) {
          // ズーム中は高品質画像処理をスキップしてパフォーマンス優先
          if (!window.__viewer_isZooming) {
            await window.processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 });
            try { console.log('ノーマル反転対象です'); } catch(_) {}
          } else {
            console.log(`Page ${p}: Skipped processSvgImagesHighQuality during zoom`);
          }
        }
              } else {
        // ズーム中はPNG変換をスキップしてパフォーマンス優先
        if (!window.__viewer_isZooming) {
          try {
            await window.convertPageToPng(page, viewport, paper);
          } catch (e) {
            console.warn('convertPageToPng error', e);
          }
        } else {
          console.log(`Page ${p}: Skipped convertPageToPng during zoom`);
        }
        pageDiv.appendChild(paper);
        pageWrapper.appendChild(pageDiv);
        pageWrapper.appendChild(footer);
        
        // プレースホルダーがあれば置き換え、なければ追加
        if (placeholderWrapper) {
          placeholderWrapper.replaceWith(pageWrapper);
        } else {
          container.appendChild(pageWrapper);
        }
      }
      if (hasText && !hadShadingError) {
        const wantForceVisible = (curMode === 'overlay');
        const overlayColor2 = window.__viewer_darkModeEnabled ? '#E0E0E0' : '#222222';
        window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: true, color: overlayColor2, allowCopy: allowCopy });
        // ページにallowCopy状態を保存（toolbar.jsで参照）
        pageDiv.setAttribute('data-allow-copy', allowCopy ? 'true' : 'false');
        if (wantForceVisible) { const svgElem = pageDiv.querySelector('svg'); if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; }); } }
      }

      // レンダリング完了後、ページオブジェクトをクリーンアップ
      try { page.cleanup(); } catch(_) {}

    } catch(err){ 
      console.error(`Error rendering page ${p}`, err);
    }
  }

  // スクロールイベントリスナーを追加
  try {
    ui.wrapper.addEventListener('scroll', updateVisiblePages, { passive: true });
  } catch(e) {
    console.warn('Failed to setup scroll listener:', e);
  }

  // 初期ロード: 現在のビューポート内のページを検出して優先的にレンダリング
  async function performInitialRender() {
    // 次フレームでビューポート計算（DOM配置完了後）
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    
    // 全ページを順次レンダリングしてから表示する（初期遅延レンダリングを無効化）
    // 注: 大きなPDFでは時間がかかりますが、表示の一貫性を優先します
    const pages = Array.from(ui.pagesHolder.querySelectorAll('.page'));
    for (const pageDiv of pages) {
      const pageNum = parseInt(pageDiv.getAttribute('data-page-num'));
      if (!pageNum) continue;
      if (window.__viewer_renderedPages.has(pageNum)) continue;
      try {
        // await して順次レンダリング（CPU負荷を抑えつつ確実に描画）
        await renderPageContent(pageNum, pdf, container, allowCopy, curMode);
        window.__viewer_renderedPages.add(pageNum);
        console.log(`Initial rendered page ${pageNum}`);
      } catch (e) {
        console.error(`Initial render failed for page ${pageNum}:`, e);
      }
    }
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
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
  };
  window.viewerPdf = pdf;

  window.scrollTo(0, 0);
};
