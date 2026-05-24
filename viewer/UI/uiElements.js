// uiElements.js
// UI要素の作成関数を集約: ツールバー、ページホルダーなど

/**
 * 左グループ（タイトル）を作成
 */
window.createLeftGroup = function createLeftGroup(pdftitle) {
  const leftGroup = document.createElement('div');
  leftGroup.className = 'viewer-toolbar-group';
  leftGroup.style.display = 'flex';
  leftGroup.style.gap = '6px';
  leftGroup.style.alignItems = 'center';
  leftGroup.style.position = 'absolute';
  leftGroup.style.padding = '0 10px';
  leftGroup.textContent = `${pdftitle || 'PDF'}`;
  return leftGroup;
};

/**
 * 中央グループ（ページ入力、ズーム等）を作成
 */
window.createCenterGroup = function createCenterGroup() {
  const centerGroup = document.createElement('div');
  centerGroup.className = 'viewer-toolbar-group';
  centerGroup.style.display = 'flex';
  centerGroup.style.margin = '0 auto';
  centerGroup.style.gap = '6px';
  centerGroup.style.alignItems = 'center';
  centerGroup.style.background = '#3C3C3C';
  centerGroup.style.zIndex = '1';

  // ページ入力
  const pageInput = document.createElement('input');
  pageInput.type = 'number';
  pageInput.min = 1;
  pageInput.value = 1;
  pageInput.style.width = '20px';
  pageInput.className = 'viewer-tool-btn pageInput';
  pageInput.style.background = '#1E1E1E';
  pageInput.style.textAlign = 'center';
  pageInput.style.border = 'none';

  // ページ総数
  const pageTotal = document.createElement('div');

  // 区切り線
  const verticalSeparator1 = document.createElement('span');
  verticalSeparator1.className = 'vertical-separator';

  // ズームアウト
  const btnZoomOut = document.createElement('button');
  btnZoomOut.className = 'viewer-tool-btn';
  btnZoomOut.textContent = '-';

  // ズーム値
  const zoomVal = document.createElement('input');
  zoomVal.id = 'zoom-value';
  zoomVal.value = '100%';
  zoomVal.style.background = '#1E1E1E';

  // ズームイン
  const btnZoomIn = document.createElement('button');
  btnZoomIn.className = 'viewer-tool-btn';
  btnZoomIn.textContent = '+';

  // 区切り線
  const verticalSeparator2 = document.createElement('span');
  verticalSeparator2.className = 'vertical-separator';

  // 横幅に合わせる
  const btnFitWidth = document.createElement('button');
  btnFitWidth.className = 'viewer-tool-btn';
  btnFitWidth.title = 'ページの横幅に合わせる';
  const fitWidthIcon = document.createElement('img');
  fitWidthIcon.className = 'icons';
  fitWidthIcon.src = 'images/fit_to_width.png';
  fitWidthIcon.alt = 'FW';
  btnFitWidth.appendChild(fitWidthIcon);

  // ページに合わせる
  const btnFitPage = document.createElement('button');
  btnFitPage.className = 'viewer-tool-btn';
  btnFitPage.title = 'ページの高さに合わせる';
  const fitPageIcon = document.createElement('img');
  fitPageIcon.className = 'icons';
  fitPageIcon.src = 'images/fit_to_page.png';
  fitPageIcon.alt = 'FP';
  btnFitPage.appendChild(fitPageIcon);

  // 要素を追加
  centerGroup.appendChild(pageInput);
  centerGroup.appendChild(pageTotal);
  centerGroup.appendChild(verticalSeparator1);
  centerGroup.appendChild(btnZoomOut);
  centerGroup.appendChild(zoomVal);
  centerGroup.appendChild(btnZoomIn);
  centerGroup.appendChild(verticalSeparator2);
  centerGroup.appendChild(btnFitWidth);
  centerGroup.appendChild(btnFitPage);

  return {
    element: centerGroup,
    pageInput,
    pageTotal,
    btnZoomOut,
    zoomVal,
    btnZoomIn,
    btnFitWidth,
    btnFitPage
  };
};

/**
 * 右グループ（ダウンロード、ダークモード、フォント調整、ハイライト）を作成
 */
window.createRightGroup = function createRightGroup() {
  const rightGroup = document.createElement('div');
  rightGroup.className = 'viewer-toolbar-group';
  rightGroup.style.display = 'flex';
  rightGroup.style.gap = '6px';
  rightGroup.style.alignItems = 'center';
  rightGroup.style.position = 'absolute';
  rightGroup.style.right = '1vw';

  // ダウンロード
  const btnDownload = document.createElement('button');
  btnDownload.className = 'viewer-tool-btn';
  btnDownload.title = 'Download';
  const DownloadIcon = document.createElement('img');
  DownloadIcon.className = 'icons';
  DownloadIcon.src = 'images/download.png';
  DownloadIcon.alt = 'D';
  btnDownload.appendChild(DownloadIcon);

  // ダークモード
  const btnDarkmode = document.createElement('button');
  btnDarkmode.className = 'viewer-tool-btn';
  btnDarkmode.title = 'ダークモード化';
  const DarkmodeIcon = document.createElement('img');
  DarkmodeIcon.className = 'icons';
  DarkmodeIcon.src = 'images/darkmode.png';
  DarkmodeIcon.alt = 'D';
  btnDarkmode.appendChild(DarkmodeIcon);

  // フォント調整
  const btnAjustFont = document.createElement('button');
  btnAjustFont.className = 'viewer-tool-btn';
  btnAjustFont.title = 'フォントを調整';
  const ajustFontIcon = document.createElement('img');
  ajustFontIcon.className = 'icons';
  ajustFontIcon.src = 'images/font.png';
  ajustFontIcon.alt = 'フ';
  btnAjustFont.appendChild(ajustFontIcon);

  // ハイライトメニュー
  const btnHighlightToggle = document.createElement('button');
  btnHighlightToggle.id = 'menuToggleButton';
  btnHighlightToggle.className = 'viewer-tool-btn';
  btnHighlightToggle.title = 'ハイライト色の変換/復元';
  const highlightIcon = document.createElement('img');
  highlightIcon.className = 'icons';
  highlightIcon.id = 'highlighticon';
  highlightIcon.src = 'images/highlight.png';
  highlightIcon.alt = 'HL';
  btnHighlightToggle.appendChild(highlightIcon);

  // ハイライトメニュー（カラーボタン）
  const highlightMenu = document.createElement('nav');
  highlightMenu.id = 'menuNavigation';
  highlightMenu.className = 'menu-container';

  const yellowHighlight = document.createElement('button');
  const lightgreenHighlight = document.createElement('button');
  const skyblueHighlight = document.createElement('button');
  const pinkHighlight = document.createElement('button');
  const blueHighlight = document.createElement('button');
  const redHighlight = document.createElement('button');
  const greenHighlight = document.createElement('button');
  const purpleHighlight = document.createElement('button');

  const highlightTop = document.createElement('div');
  highlightTop.className = 'menu-boxes';
  const highlightBottom = document.createElement('div');
  highlightBottom.className = 'menu-boxes';
  const highlightSample = document.createElement('div');
  highlightSample.className = 'highlightSample menu_boxes';
  highlightSample.textContent = 'サンプル';

  // ID と className を設定
  [yellowHighlight, lightgreenHighlight, skyblueHighlight, pinkHighlight, blueHighlight, redHighlight, greenHighlight, purpleHighlight].forEach((btn, idx) => {
    const colors = ['yellow', 'lightgreen', 'skyblue', 'pink', 'blue', 'red', 'green', 'purple'];
    btn.id = colors[idx] + 'Highlight';
    btn.className = 'btnHighlight';
  });

  highlightTop.appendChild(yellowHighlight);
  highlightTop.appendChild(lightgreenHighlight);
  highlightTop.appendChild(skyblueHighlight);
  highlightTop.appendChild(pinkHighlight);
  highlightBottom.appendChild(redHighlight);
  highlightBottom.appendChild(blueHighlight);
  highlightBottom.appendChild(greenHighlight);
  highlightBottom.appendChild(purpleHighlight);
  highlightMenu.appendChild(highlightTop);
  highlightMenu.appendChild(highlightBottom);
  highlightMenu.appendChild(highlightSample);

  // メニュー表示/非表示トグル
  highlightIcon.addEventListener('click', () => {
    highlightMenu.classList.toggle('show');
  });

  // ハイライト色ボタンのビジュアルフィードバック
  const allColors = ['yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple'];
  const colorButtons = [yellowHighlight, lightgreenHighlight, skyblueHighlight, pinkHighlight, redHighlight, blueHighlight, greenHighlight, purpleHighlight];
  colorButtons.forEach((btn, i) => {
    const color = allColors[i];
    const otherColors = allColors.filter(c => c !== color);
    btn.addEventListener('click', () => {
      btn.classList.add('selected');
      highlightSample.classList.add(color);
      highlightSample.classList.remove(...otherColors);
      highlightIcon.classList.add(color);
      highlightIcon.classList.remove(...otherColors);
      colorButtons.forEach((ob, j) => {
        if (j !== i) ob.classList.remove('selected');
      });
    });
  });

  btnHighlightToggle.appendChild(highlightMenu);

  // 要素を追加
  rightGroup.appendChild(btnDownload);
  rightGroup.appendChild(btnDarkmode);
  rightGroup.appendChild(btnAjustFont);
  rightGroup.appendChild(btnHighlightToggle);

  return {
    element: rightGroup,
    btnDownload,
    btnDarkmode,
    btnAjustFont,
    btnHighlightToggle,
    yellowHighlight,
    lightgreenHighlight,
    skyblueHighlight,
    pinkHighlight,
    redHighlight,
    blueHighlight,
    greenHighlight,
    purpleHighlight
  };
};

/**
 * ツールバー全体を作成
 */
window.createToolbar = function createToolbar(pdftitle) {
  const toolbar = document.createElement('div');
  toolbar.id = 'viewer-control-bar';
  Object.assign(toolbar.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0px',
    height: '5vh',
    background: '#3C3C3C',
    borderBottom: '1px solid rgba(241, 18, 18, 0.04)',
    boxShadow: '0 1px 0 rgba(60,60,60,0.02) inset',
    color: '#e6e6e6'
  });

  const leftGroup = window.createLeftGroup(pdftitle);
  const centerGroupObj = window.createCenterGroup();
  const rightGroupObj = window.createRightGroup();

  toolbar.appendChild(leftGroup);
  toolbar.appendChild(centerGroupObj.element);
  toolbar.appendChild(rightGroupObj.element);

  return {
    toolbar,
    pageInput: centerGroupObj.pageInput,
    pageTotal: centerGroupObj.pageTotal,
    btnZoomOut: centerGroupObj.btnZoomOut,
    zoomVal: centerGroupObj.zoomVal,
    btnZoomIn: centerGroupObj.btnZoomIn,
    btnFitWidth: centerGroupObj.btnFitWidth,
    btnFitPage: centerGroupObj.btnFitPage,
    btnDownload: rightGroupObj.btnDownload,
    btnDarkmode: rightGroupObj.btnDarkmode,
    btnAjustFont: rightGroupObj.btnAjustFont,
    btnHighlightToggle: rightGroupObj.btnHighlightToggle,
    yellowHighlight: rightGroupObj.yellowHighlight,
    lightgreenHighlight: rightGroupObj.lightgreenHighlight,
    skyblueHighlight: rightGroupObj.skyblueHighlight,
    pinkHighlight: rightGroupObj.pinkHighlight,
    redHighlight: rightGroupObj.redHighlight,
    blueHighlight: rightGroupObj.blueHighlight,
    greenHighlight: rightGroupObj.greenHighlight,
    purpleHighlight: rightGroupObj.purpleHighlight
  };
};

/**
 * ページホルダーを作成
 */
window.createPageHolder = function createPageHolder() {
  const pagesHolder = document.createElement('div');
  pagesHolder.id = 'viewer-pages';
  pagesHolder.style.display = 'flex';
  pagesHolder.style.flexDirection = 'column';
  pagesHolder.style.gap = '3px';
  pagesHolder.style.alignItems = 'center';
  pagesHolder.style.width = '100%';
  return pagesHolder;
};

/**
 * UI全体を初期化してグローバルに登録
 * @param {string} pdftitle - PDF タイトル
 * @returns {Object} window.__viewer_ui
 */
window.initializeUI = function initializeUI(pdftitle) {
  const toolbarUI = window.createToolbar(pdftitle);
  const pagesHolder = window.createPageHolder();

  // グローバルUIオブジェクトにまとめる
  window.__viewer_ui = {
    toolbar: toolbarUI.toolbar,
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
