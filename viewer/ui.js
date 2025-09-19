// ui.js
// UI シェル（ツールバー、ページホルダ）の作成と公開

window.setupShell = function setupShell(origContainer) {
  const containerParent = origContainer.parentElement || document.body;

  const shell = document.createElement('div');
  shell.id = 'viewer-shell';
  shell.style.height = '100vh';
  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';

  const toolbar = document.createElement('div');
  toolbar.id = 'viewer-control-bar';
  Object.assign(toolbar.style, {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
    background: 'linear-gradient(#1f1f1f, #161616)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.02) inset', color: '#e6e6e6'
  });

  // left group
  const leftGroup = document.createElement('div');
  leftGroup.className = 'viewer-toolbar-group';
  leftGroup.style.display = 'flex'; leftGroup.style.gap = '6px'; leftGroup.style.alignItems = 'center';
  const btnPrev = document.createElement('button'); btnPrev.className = 'viewer-tool-btn'; btnPrev.textContent = '◀';
  const pageInput = document.createElement('input'); pageInput.type = 'number'; pageInput.min = 1; pageInput.value = 1; pageInput.style.width = '64px'; pageInput.className = 'viewer-tool-btn';
  const pageCountDisplay = document.createElement('div');
  pageCountDisplay.id = 'page-count-display';
  pageCountDisplay.style.minWidth = '48px';
  pageCountDisplay.style.textAlign = 'left';
  pageCountDisplay.style.paddingTop = '2px';
  pageCountDisplay.style.paddingBottom = '2px';
  const btnNext = document.createElement('button'); btnNext.className = 'viewer-tool-btn'; btnNext.textContent = '▶';
  leftGroup.appendChild(btnPrev); leftGroup.appendChild(pageInput); leftGroup.appendChild(pageCountDisplay); leftGroup.appendChild(btnNext);

  // center group
  const centerGroup = document.createElement('div');
  centerGroup.className = 'viewer-toolbar-group'; centerGroup.style.display = 'flex'; centerGroup.style.gap = '6px'; centerGroup.style.alignItems = 'center';
  const btnZoomOut = document.createElement('button'); btnZoomOut.className = 'viewer-tool-btn'; btnZoomOut.textContent = '-';
  const zoomVal = document.createElement('input'); zoomVal.id = 'zoom-value'; zoomVal.value = '100%'; zoomVal.style.minWidth = '56px';
  const btnZoomIn = document.createElement('button'); btnZoomIn.className = 'viewer-tool-btn'; btnZoomIn.textContent = '+';
  const btnFitWidth = document.createElement('button'); btnFitWidth.className = 'viewer-tool-btn'; btnFitWidth.textContent = 'Fit Width';
  const btnFitPage = document.createElement('button'); btnFitPage.className = 'viewer-tool-btn'; btnFitPage.textContent = 'Fit Page';
  centerGroup.appendChild(btnZoomOut); centerGroup.appendChild(zoomVal); centerGroup.appendChild(btnZoomIn); centerGroup.appendChild(btnFitWidth); centerGroup.appendChild(btnFitPage);

  // right group
  const rightGroup = document.createElement('div');
  rightGroup.className = 'viewer-toolbar-group'; rightGroup.style.marginLeft = 'auto'; rightGroup.style.display = 'flex'; rightGroup.style.gap = '6px'; rightGroup.style.alignItems = 'center';
  const btnDownload = document.createElement('button'); btnDownload.className = 'viewer-tool-btn'; btnDownload.textContent = '↓ Download';
  const btnSvgMode = document.createElement('button'); btnSvgMode.className = 'viewer-tool-btn'; btnSvgMode.textContent = 'オリジナル';
  const btnOverlayMode = document.createElement('button'); btnOverlayMode.className = 'viewer-tool-btn'; btnOverlayMode.textContent = 'フォント調整';
  rightGroup.appendChild(btnDownload); rightGroup.appendChild(btnSvgMode); rightGroup.appendChild(btnOverlayMode);

  toolbar.appendChild(leftGroup); toolbar.appendChild(centerGroup); toolbar.appendChild(rightGroup);

  const wrapper = document.createElement('div');
  wrapper.id = 'viewer-container-wrapper';
  Object.assign(wrapper.style, { flex: '1 1 auto', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', background: '#2b2b2b' });

  const pagesHolder = document.createElement('div');
  pagesHolder.id = 'viewer-pages';
  pagesHolder.style.display = 'flex'; pagesHolder.style.flexDirection = 'column'; pagesHolder.style.gap = '3px'; pagesHolder.style.alignItems = 'center';

  wrapper.appendChild(pagesHolder);
  shell.appendChild(toolbar); shell.appendChild(wrapper);

  containerParent.replaceChild(shell, origContainer);

  window.__viewer_ui = {
    shell, toolbar, wrapper, pagesHolder,
    btnPrev, btnNext, pageInput, pageCountDisplay, btnZoomIn, btnZoomOut, zoomVal, btnFitWidth, btnFitPage,
    btnDownload, btnSvgMode, btnOverlayMode
  };

  return window.__viewer_ui;
};
