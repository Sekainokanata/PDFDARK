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
  function applyScaleToAllPages(scale){
    const pages = ui.pagesHolder.querySelectorAll('.page');
    pages.forEach(pageDiv => {
      const baseW = parseFloat(pageDiv.getAttribute('data-base-width') || pageDiv.style.width || pageDiv.clientWidth) || 0;
      const baseH = parseFloat(pageDiv.getAttribute('data-base-height') || pageDiv.style.height || pageDiv.clientHeight) || 0;
      // ページの外枠サイズを更新
      pageDiv.style.width = (baseW * scale) + 'px';
      pageDiv.style.height = (baseH * scale) + 'px';
      // 紙は transform のみ変更（SVG の幅/高さは初期化時に固定）
      const paper = pageDiv.querySelector('.paper');
      if (paper) {
        paper.style.transform = `scale(${scale})`;
        paper.style.transformOrigin = '0 0';
      }
    });
    currentScale = scale; ui.zoomVal.value = Math.round(scale * 100) + '%';
  }
  function fitWidth(){ const viewportWidth = ui.wrapper.clientWidth - 40; const first = ui.pagesHolder.querySelector('.page'); if (!first) return; const baseW = parseFloat(first.getAttribute('data-base-width') || first.style.width || first.clientWidth); const targetScale = Math.max(0.1, viewportWidth / baseW); applyScaleToAllPages(targetScale); }
  function fitPage(){ const viewportHeight = ui.wrapper.clientHeight - ui.toolbar.clientHeight - 40; const first = ui.pagesHolder.querySelector('.page'); if (!first) return; const baseH = parseFloat(first.getAttribute('data-base-height') || first.style.height || first.clientHeight); const targetScale = Math.max(0.1, viewportHeight / baseH); applyScaleToAllPages(targetScale); }
  function goToPage(n){ const { pagesHolder, ui: ui2 } = window._getWrapperAndPagesHolder(); const pages = Array.from(pagesHolder.querySelectorAll('.page')); if (!pages.length) return; const idx = Math.min(Math.max(1, n), pages.length); if (ui2 && ui2.pageInput) ui2.pageInput.value = idx; window.scrollToPageTopByIndex(n, { behavior: 'smooth', extraGap: -50, waitForRender: true }); }

  ui.btnZoomIn.addEventListener('click', () => { applyScaleToAllPages(Math.min(5, currentScale + 0.1)); });
  ui.btnZoomOut.addEventListener('click', () => { applyScaleToAllPages(Math.max(0.1, currentScale - 0.1)); });
  ui.btnFitWidth.addEventListener('click', fitWidth); ui.btnFitPage.addEventListener('click', fitPage);
  ui.btnNext.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) + 1); });
  ui.btnPrev.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) - 1); });
  ui.pageInput.addEventListener('change', () => { goToPage(parseInt(ui.pageInput.value||'1',10)); });
  ui.btnPrint.addEventListener('click', () => window.print());
  ui.zoomVal.addEventListener('change', () => { const raw = ui.zoomVal.value.trim().replace('%',''); const n = parseFloat(raw); if (!isFinite(n) || n <= 0) { ui.zoomVal.value = Math.round(currentScale * 100) + '%'; return; } applyScaleToAllPages(Math.max(0.1, n / 100)); });

  const STORAGE_KEY = 'viewerTextMode';
  function saveMode(m){ try { localStorage.setItem(STORAGE_KEY, m); } catch(_) {} }
  function loadMode(){ try { return localStorage.getItem(STORAGE_KEY) || 'svg'; } catch(_) { return 'svg'; } }
  function updateButtons(mode){ if (mode === 'overlay') { ui.btnOverlayMode.style.background = '#0a84ff'; ui.btnSvgMode.style.background = '#222'; } else { ui.btnSvgMode.style.background = '#0a84ff'; ui.btnOverlayMode.style.background = '#222'; } }
  function applyModeToAllPages(mode){
    const pages = ui.pagesHolder.querySelectorAll('.page');
    pages.forEach(pageDiv => {
      const svgElem = pageDiv.querySelector('svg'); const textLayer = pageDiv.querySelector('.textLayer');
      if (mode === 'svg') {
        if (svgElem) { svgElem.style.pointerEvents = ''; svgElem.style.userSelect = ''; svgElem.querySelectorAll('text, tspan').forEach(t => { t.style.visibility = ''; t.style.display = ''; t.style.pointerEvents = ''; t.style.userSelect = ''; }); }
        if (textLayer) { textLayer.querySelectorAll('span').forEach(s => { s.style.color = 'transparent'; s.style.WebkitTextFillColor = 'transparent'; s.style.pointerEvents = 'none'; s.style.userSelect = 'none'; s.setAttribute('aria-hidden', 'true'); }); textLayer.style.pointerEvents = 'none'; textLayer.style.userSelect = 'none'; }
      } else {
        if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; t.style.pointerEvents = 'none'; t.style.userSelect = 'none'; }); svgElem.style.pointerEvents = 'none'; svgElem.style.userSelect = 'none'; }
        if (textLayer) { textLayer.querySelectorAll('span').forEach(s => { s.style.color = '#fff'; s.style.WebkitTextFillColor = '#fff'; s.style.pointerEvents = 'auto'; s.style.userSelect = 'text'; s.removeAttribute('aria-hidden'); }); textLayer.style.pointerEvents = 'auto'; textLayer.style.userSelect = 'text'; textLayer.style.zIndex = '3000'; }
      }
    });
    try { localStorage.setItem('viewerTextMode', mode); } catch(_) {}
    updateButtons(mode);
  }

  const initialMode = loadMode(); updateButtons(initialMode); applyModeToAllPages(initialMode);
  ui.btnSvgMode.addEventListener('click', () => { saveMode('svg'); updateButtons('svg'); applyModeToAllPages('svg'); });
  ui.btnOverlayMode.addEventListener('click', () => { saveMode('overlay'); updateButtons('overlay'); applyModeToAllPages('overlay'); });

  window.__viewer_applyScaleToAllPages = applyScaleToAllPages;
  window.__viewer_goToPage = function(n){ goToPage(n); };
  window.__viewer_applyMode = applyModeToAllPages;

  // Download ボタン配線（既に wired ならスキップ）
  try { window.wireDownloadButton(ui); } catch (e) { console.warn('wireDownloadButton failed', e); }
};
