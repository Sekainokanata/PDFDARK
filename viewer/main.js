// main.js
// 旧 viewer.js のエントリーポイント（startViewer）を分離

window.startViewer = async function startViewer(){
  // pdf.worker.js / cmaps のパスを拡張内の URL で設定
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.js'); } catch(_) {}
  const cMapUrlForExtension = chrome.runtime.getURL('pdfjs/cmaps/');

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

  // ハイライトトグルボタン追加 + 監視
  try { window.ensureHighlightToggle(ui); } catch(_) {}
  try { window.setupHighlightObserver(); } catch(_) {}

  const container = ui.pagesHolder;

  const permInfo = await window.detectCopyPermission(pdf);
  const allowCopy = !!permInfo.canCopy; console.log('PDF permission raw:', permInfo.rawPerms, 'allowCopy:', allowCopy);
  let removeCopyBlockers = null;
  if (!allowCopy) {
    removeCopyBlockers = window.installCopyBlockers(container);
    const warn = document.createElement('div');
    warn.textContent = 'このPDFはコピーが制限されています — コピーは無効化します。';
    warn.style.color = '#ffcc00'; warn.style.padding = '6px'; warn.style.fontSize = '13px';
    // ツールバー先頭に警告を表示
    if (ui && ui.toolbar) {
      ui.toolbar.insertBefore(warn, ui.toolbar.firstChild);
    }
  }

  const curMode = (function(){ try { return localStorage.getItem('viewerTextMode') || 'svg'; } catch(_) { return 'svg'; } })();

  for (let p = 1; p <= pdf.numPages; p++) {
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const opList = await page.getOperatorList();
      const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
      const svg = await svgGfx.getSVG(opList, viewport);

      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.setAttribute('data-base-width', viewport.width);
      pageDiv.setAttribute('data-base-height', viewport.height);
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';
      pageDiv.style.transformOrigin = '0 0'; pageDiv.style.overflow = 'visible'; pageDiv.style.display = 'block'; pageDiv.style.position = 'relative';
      const paper = document.createElement('div'); paper.className = 'paper'; paper.style.width = viewport.width + 'px'; paper.style.height = viewport.height + 'px'; paper.style.transformOrigin = '0 0';
      paper.appendChild(svg);
      pageDiv.appendChild(paper);
      const footer = document.createElement('div'); footer.className = 'page-footer'; footer.textContent = `Page ${p} / ${pdf.numPages}`; pageDiv.appendChild(footer);
      container.appendChild(pageDiv);

      window.invertSvgColorsSmart(svg, { satThreshold: 0.15 });

      let textContent = null; try { textContent = await page.getTextContent(); } catch(e){ console.warn('getTextContent failed for page', p, e); }
      function looksGoodTextContent(tc){ if (!tc || !tc.items || tc.items.length === 0) return false; const sample = tc.items.slice(0, 20).map(i => i.str).join(''); return /[0-9A-Za-z\u3000-\u30FF\u4E00-\u9FFF]/.test(sample); }
      if (allowCopy && looksGoodTextContent(textContent)) {
        const wantForceVisible = (curMode === 'overlay');
        window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: true, color: '#fff' });
        if (wantForceVisible) { const svgElem = pageDiv.querySelector('svg'); if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; }); } }
      }

      await window.processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 });

    } catch(err){ console.error('Error rendering page', p, err); const errDiv = document.createElement('div'); errDiv.textContent = `Error rendering page ${p}: ${err.message || err}`; container.appendChild(errDiv); }
  }

  // 配線後に初期スケール/モードを適用
  try { window.__viewer_applyScaleToAllPages(1.0); } catch(_) {}
  try { window.__viewer_applyMode(curMode); } catch(_) {}

  window.viewerCleanup = () => { if (removeCopyBlockers) removeCopyBlockers(); for (const v of window.objectUrlMap.values()) { if (v && v.url && v.url.startsWith('blob:')) URL.revokeObjectURL(v.url); } window.objectUrlMap.clear(); };
  window.viewerPdf = pdf;

  window.scrollTo(0, 0);
};
