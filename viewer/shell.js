// shell.js
// UIシェルの構築: ツールバー、ラッパー、ページホルダーのDOM生成


window.setupShell = function setupShell(origContainer) {
  const containerParent = origContainer.parentElement || document.body;

  const shell = document.createElement('div');
  shell.id = 'viewer-shell';
  shell.style.height = '100vh';
  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';

  // PDFタイトルを取得
  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  let pdftitle;
  if (file) {
    try {
      const urlObj = new URL(file, location.href);
      const filename = urlObj.pathname.split('/').pop() || 'PDF';
      pdftitle = decodeURIComponent(filename);
    } catch (e) {
      const name = (file.split('/').pop() || 'PDF');
      pdftitle = name;
    }
  }

  // UI要素を作成（uiElements.js から）
  const toolbarUI = window.createToolbar(pdftitle);
  const pagesHolder = window.createPageHolder();

  // ラッパー（スクロール可能なコンテナ）を作成
  const wrapper = document.createElement('div');
  wrapper.id = 'viewer-container-wrapper';
  Object.assign(wrapper.style, {
    flex: '1 1 auto',
    overflowX: 'auto',
    overflowY: 'auto',
    display: 'block',
    padding: '20px',
    background: '#282828'
  });

  // 要素を組み立て
  wrapper.appendChild(pagesHolder);
  shell.appendChild(toolbarUI.toolbar);
  shell.appendChild(wrapper);

  containerParent.replaceChild(shell, origContainer);

  // グローバルUIオブジェクトにまとめる
  window.__viewer_ui = {
    shell,
    toolbar: toolbarUI.toolbar,
    wrapper,
    pagesHolder,
    pageTotal: toolbarUI.pageTotal,
    pageInput: toolbarUI.pageInput,
    btnZoomIn: toolbarUI.btnZoomIn,
    btnZoomOut: toolbarUI.btnZoomOut,
    zoomVal: toolbarUI.zoomVal,
    btnFitWidth: toolbarUI.btnFitWidth,
    btnFitPage: toolbarUI.btnFitPage,
    btnDownload: toolbarUI.btnDownload,
    btnHighlightToggle: toolbarUI.btnHighlightToggle,
    btnDarkmode: toolbarUI.btnDarkmode,
    btnAjustFont: toolbarUI.btnAjustFont,
    yellowHighlight: toolbarUI.yellowHighlight,
    lightgreenHighlight: toolbarUI.lightgreenHighlight,
    skyblueHighlight: toolbarUI.skyblueHighlight,
    pinkHighlight: toolbarUI.pinkHighlight,
    redHighlight: toolbarUI.redHighlight,
    blueHighlight: toolbarUI.blueHighlight,
    greenHighlight: toolbarUI.greenHighlight,
    purpleHighlight: toolbarUI.purpleHighlight,
    get btnSvgMode(){ return this.btnDarkmode; },
    get btnOverlayMode(){ return this.btnAjustFont; }
  };

  return window.__viewer_ui;
};
