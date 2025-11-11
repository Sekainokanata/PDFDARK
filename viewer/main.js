// main.js
// 旧 viewer.js のエントリーポイント（startViewer）を分離


window.startViewer = async function startViewer(){
  // pdf.worker.js / cmaps のパスを拡張内の URL で設定
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.js'); } catch(_) {}
  const cMapUrlForExtension = chrome.runtime.getURL('pdfjs/cmaps/');

  // 旧: MLサンドボックスの事前ウォームアップは廃止

  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  if (file) {
    try { const urlObj = new URL(file, location.href); const filename = urlObj.pathname.split('/').pop() || 'PDF'; document.title = decodeURIComponent(filename); }
    catch (e) { const name = (file.split('/').pop() || 'PDF'); try { document.title = decodeURIComponent(name); } catch(_) { document.title = name; } }
  }

  const origContainer = document.getElementById('container');
  if (!file) { origContainer.textContent = 'No file specified.'; return; }

  let resp; try { resp = await fetch(file); if (!resp.ok) throw new Error('Failed to fetch PDF: ' + resp.status); }
  catch(e){ origContainer.textContent = 'Fetch error: ' + e.message; return; }
  const arrayBuffer = await resp.arrayBuffer();
  window.__viewer_pdfArrayBuffer = arrayBuffer; window.__viewer_pdfUrl = file;

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
        try { const txt = (ui.zoomVal.value || '100%').toString().replace('%',''); const v = parseFloat(txt); if (isFinite(v) && v>0) current = v/100; } catch(_) {}

        const K = 0.008; // 感度係数（小さく→低感度/大きく→高感度）
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
  window.__viewer_ui.pageTotal.textContent = `/ ${pdf.numPages}`;

  // ハイライトトグルボタン追加 + 監視
  try { window.ensureHighlightToggle(ui); } catch(_) {}
  try { window.setupHighlightObserver(); } catch(_) {}
  // ダークモードトグル（UI配線）
  try { window.ensureDarkModeToggle(ui); } catch(_) {}

  const container = ui.pagesHolder;

  const permInfo = await window.detectCopyPermission(pdf);
  const allowCopy = !!permInfo.canCopy; console.log('PDF permission raw:', permInfo.rawPerms, 'allowCopy:', allowCopy);
  let removeCopyBlockers = null;
  if (!allowCopy) {
    removeCopyBlockers = window.installCopyBlockers(container);
  }

  const curMode = (function(){ try { return localStorage.getItem('viewerTextMode') || 'svg'; } catch(_) { return 'svg'; } })();
  // 総ページ数をツールバーに表示（現在ページ入力の右）
  try { if (ui && ui.pageCountDisplay) ui.pageCountDisplay.textContent = `/ ${pdf.numPages}`; } catch(_) {}

  for (let p = 1; p <= pdf.numPages; p++) {
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const opList = await page.getOperatorList();
      const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
      const svg = await svgGfx.getSVG(opList, viewport);

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
      pageDiv.setAttribute('data-base-width', viewport.width);
      pageDiv.setAttribute('data-base-height', viewport.height);
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';
      pageDiv.style.transformOrigin = '0 0'; pageDiv.style.overflow = 'visible'; pageDiv.style.display = 'block'; pageDiv.style.position = 'relative';
      const paper = document.createElement('div');
      paper.className = 'paper';
      paper.style.width = viewport.width + 'px';
      paper.style.height = viewport.height + 'px';
      paper.style.transformOrigin = '0 0';
      const footer = document.createElement('div'); footer.className = 'page-footer'; footer.textContent = `Page ${p} / ${pdf.numPages}`;

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
        pageDiv.appendChild(footer);
        container.appendChild(pageDiv);

        // ここから描画後の調整（ダークモードON時のみスマート反転）
        if (window.__viewer_darkModeEnabled) {
          window.invertSvgColorsSmart(svg, { satThreshold: 0.15 });
        }
        // テキストレイヤ: textContent があれば常に生成（allowCopy=false でもオーバーレイモードのため必要）
        if (textContent && textContent.items && textContent.items.length > 0) {
          const wantForceVisible = (curMode === 'overlay');
          const overlayColor = window.__viewer_darkModeEnabled ? '#E0E0E0' : '#222222';
          window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: true, color: overlayColor, allowCopy: allowCopy });
          if (wantForceVisible) { const svgElem = pageDiv.querySelector('svg'); if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; }); } }
        }
        if (window.__viewer_darkModeEnabled) {
          await window.processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 });
          try { console.log('ノーマル反転対象です'); } catch(_) {}
        }
              } else {
        // ML完了までDOMに追加しない
        try {
          await window.convertPageToPng(page, viewport, paper);
        } catch (e) {
          console.warn('convertPageToPng error', e);
        }
        pageDiv.appendChild(paper);
        pageDiv.appendChild(footer);
        container.appendChild(pageDiv);
      }
      if (hasText) {
        const wantForceVisible = (curMode === 'overlay');
        const overlayColor2 = window.__viewer_darkModeEnabled ? '#E0E0E0' : '#222222';
        window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: true, color: overlayColor2, allowCopy: allowCopy });
        if (wantForceVisible) { const svgElem = pageDiv.querySelector('svg'); if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; }); } }
      }

      // 以降の二重処理を削除（上で分岐済み）

    } catch(err){ console.error('Error rendering page', p, err); const errDiv = document.createElement('div'); errDiv.textContent = `Error rendering page ${p}: ${err.message || err}`; container.appendChild(errDiv); }
  }

  // 配線後に初期スケール/モードを適用
  try { window.__viewer_applyScaleToAllPages(1.0); } catch(_) {}
  try { window.__viewer_applyMode(curMode); } catch(_) {}
  // 初期ダークモード状態適用（OFFなら何もしない/ONなら再適用）
  try { if (typeof window.__viewer_applyDarkMode === 'function') window.__viewer_applyDarkMode(window.__viewer_darkModeEnabled); } catch(_) {}

  window.viewerCleanup = () => { if (removeCopyBlockers) removeCopyBlockers(); for (const v of window.objectUrlMap.values()) { if (v && v.url && v.url.startsWith('blob:')) URL.revokeObjectURL(v.url); } window.objectUrlMap.clear(); };
  window.viewerPdf = pdf;

  window.scrollTo(0, 0);
};
