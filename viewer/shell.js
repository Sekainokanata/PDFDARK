// shell.js
// UIシェルの構築: ツールバー、ラッパー、ページホルダーのDOM生成


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
    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0px',height: '5vh',
    background: '#3C3C3C',
    borderBottom: '1px solid rgba(241, 18, 18, 0.04)',
    boxShadow: '0 1px 0 rgba(60,60,60,0.02) inset', color: '#e6e6e6',
  });

  //titleの部分
  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  let pdftitle;
  if (file) {
    try { const urlObj = new URL(file, location.href); const filename = urlObj.pathname.split('/').pop() || 'PDF'; pdftitle = decodeURIComponent(filename); }
    catch (e) { const name = (file.split('/').pop() || 'PDF'); pdftitle = name;}
  }

  // left group
  const leftGroup = document.createElement('div');
  leftGroup.className = 'viewer-toolbar-group';
  leftGroup.style.display = 'flex'; leftGroup.style.gap = '6px'; leftGroup.style.alignItems = 'center'; leftGroup.style.position = 'absolute'; leftGroup.style.padding = '0 10px'; leftGroup.className = "leftGroup";
  leftGroup.textContent = `${pdftitle}`;

  // center group
  const centerGroup = document.createElement('div');
  centerGroup.className = 'viewer-toolbar-group'; centerGroup.style.display = 'flex'; centerGroup.style.margin = '0 auto'; centerGroup.style.gap = '6px'; centerGroup.style.alignItems = 'center'; centerGroup.style.background = '#3C3C3C'; centerGroup.style.zIndex = '1';
  const pageInput = document.createElement('input'); pageInput.type = 'number'; pageInput.min = 1; pageInput.value = 1; pageInput.style.width = '20px'; pageInput.className = 'viewer-tool-btn pageInput'; pageInput.style.background = '#1E1E1E'; pageInput.style.textAlign = 'center'; pageInput.style.border = 'none'
  const pageTotal = document.createElement('div');
  const verticalSeparator1 = document.createElement('span'); verticalSeparator1.className = 'vertical-separator'
  const btnZoomOut = document.createElement('button'); btnZoomOut.className = 'viewer-tool-btn'; btnZoomOut.textContent = '-';
  const zoomVal = document.createElement('input'); zoomVal.id = 'zoom-value'; zoomVal.value = '100%'; zoomVal.style.background = '#1E1E1E';
  const btnZoomIn = document.createElement('button'); btnZoomIn.className = 'viewer-tool-btn'; btnZoomIn.textContent = '+';
  const verticalSeparator2 = document.createElement('span'); verticalSeparator2.className = 'vertical-separator'
  const btnFitWidth = document.createElement('button'); btnFitWidth.className = 'viewer-tool-btn'; btnFitWidth.title = 'ページの横幅に合わせる'
  const fitWidthIcon = document.createElement('img'); fitWidthIcon.className = 'icons'; fitWidthIcon.src = 'images/fit_to_width.png'; fitWidthIcon.alt = 'FW'; 
  btnFitWidth.appendChild(fitWidthIcon);
  const btnFitPage = document.createElement('button'); btnFitPage.className = 'viewer-tool-btn'; btnFitPage.title = 'ページの高さに合わせる'
  const fitPageIcon = document.createElement('img'); fitPageIcon.className = 'icons'; fitPageIcon.src = 'images/fit_to_page.png'; fitPageIcon.alt = 'FP'; 
  btnFitPage.appendChild(fitPageIcon);
  centerGroup.appendChild(pageInput); centerGroup.appendChild(pageTotal); centerGroup.appendChild(verticalSeparator1); centerGroup.appendChild(btnZoomOut); centerGroup.appendChild(zoomVal); centerGroup.appendChild(btnZoomIn); centerGroup.appendChild(verticalSeparator2); centerGroup.appendChild(btnFitWidth); centerGroup.appendChild(btnFitPage);

  // right group
  const rightGroup = document.createElement('div');
  rightGroup.className = 'viewer-toolbar-group'; rightGroup.style.display = 'flex'; rightGroup.style.gap = '6px'; rightGroup.style.alignItems = 'center'; rightGroup.style.position = 'absolute'; rightGroup.style.right = '1vw'
  const btnDownload = document.createElement('button'); btnDownload.className = 'viewer-tool-btn'; btnDownload.title = 'Download';
  const DownloadIcon = document.createElement('img'); DownloadIcon.className = 'icons'; DownloadIcon.src = 'images/download.png'; DownloadIcon.alt = 'D'; 
  btnDownload.appendChild(DownloadIcon);
  // darkmode
  const btnDarkmode = document.createElement('button'); btnDarkmode.className = 'viewer-tool-btn'; btnDarkmode.title = 'ダークモード化'
  const DarkmodeIcon = document.createElement('img'); DarkmodeIcon.className = 'icons'; DarkmodeIcon.src = 'images/darkmode.png'; DarkmodeIcon.alt = 'D'; 
  btnDarkmode.appendChild(DarkmodeIcon);
  //ajustFont
  const btnAjustFont = document.createElement('button'); btnAjustFont.className = 'viewer-tool-btn'; btnAjustFont.title = 'フォントを調整'
  const ajustFontIcon = document.createElement('img'); ajustFontIcon.className = 'icons'; ajustFontIcon.src = 'images/font.png'; ajustFontIcon.alt = 'フ'; 
  btnAjustFont.appendChild(ajustFontIcon);
  //highlight
  const btnHighlightToggle = document.createElement('button');btnHighlightToggle.id = 'menuToggleButton';  btnHighlightToggle.className = 'viewer-tool-btn'; btnHighlightToggle.title = 'ハイライト色の変換/復元';
  const highlightIcon = document.createElement('img'); highlightIcon.className = 'icons';highlightIcon.id = 'highlighticon'; highlightIcon.src = 'images/highlight.png'; highlightIcon.alt = 'HL';
  btnHighlightToggle.appendChild(highlightIcon);
  const highlightMenu = document.createElement('nav'); highlightMenu.id = 'menuNavigation';highlightMenu.className = 'menu-container' ; const yellowHighlight = document.createElement('button');const lightgreenHighlight = document.createElement('button');const skyblueHighlight = document.createElement('button');const pinkHighlight = document.createElement('button');const blueHighlight = document.createElement('button');const redHighlight = document.createElement('button');const greenHighlight = document.createElement('button');const purpleHighlight = document.createElement('button');
  const highlightTop = document.createElement('div'); highlightTop.className = 'menu-boxes'; const highlightBottom = document.createElement('div'); highlightBottom.className = 'menu-boxes';
  const highlightSample = document.createElement('div'); highlightSample.className = 'highlightSample menu_boxes'; highlightSample.textContent = 'サンプル';
  yellowHighlight.id = 'yellowHighlight';yellowHighlight.className = 'btnHighlight';lightgreenHighlight.id = 'lightgreenHighlight';lightgreenHighlight.className = 'btnHighlight';skyblueHighlight.id = 'skyblueHighlight';skyblueHighlight.className = 'btnHighlight';pinkHighlight.id = 'pinkHighlight';pinkHighlight.className = 'btnHighlight';blueHighlight.id = 'blueHighlight';blueHighlight.className = 'btnHighlight';redHighlight.id = 'redHighlight';redHighlight.className = 'btnHighlight';greenHighlight.id = 'greenHighlight';greenHighlight.className = 'btnHighlight';purpleHighlight.id = 'purpleHighlight';purpleHighlight.className = 'btnHighlight';
  highlightTop.appendChild(yellowHighlight);highlightTop.appendChild(lightgreenHighlight);highlightTop.appendChild(skyblueHighlight);highlightTop.appendChild(pinkHighlight);highlightBottom.appendChild(redHighlight);highlightBottom.appendChild(blueHighlight);highlightBottom.appendChild(greenHighlight);highlightBottom.appendChild(purpleHighlight);
  highlightMenu.appendChild(highlightTop);highlightMenu.appendChild(highlightBottom);highlightMenu.appendChild(highlightSample);

  // メニューの表示/非表示トグル
  highlightIcon.addEventListener('click', () => {
    highlightMenu.classList.toggle('show');
  });

  // ハイライト色ボタンのビジュアルフィードバック（選択色をアイコン/サンプルに反映）
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
      colorButtons.forEach((ob, j) => { if (j !== i) ob.classList.remove('selected'); });
    });
  });

  btnHighlightToggle.appendChild(highlightMenu);

  rightGroup.appendChild(btnDownload); rightGroup.appendChild(btnDarkmode); rightGroup.appendChild(btnAjustFont);  rightGroup.appendChild(btnHighlightToggle);

  toolbar.appendChild(leftGroup); toolbar.appendChild(centerGroup); toolbar.appendChild(rightGroup);

  const wrapper = document.createElement('div');
  wrapper.id = 'viewer-container-wrapper';
  Object.assign(wrapper.style, { flex: '1 1 auto', overflowX: 'auto', overflowY: 'auto', display: 'block', padding: '20px', background: '#282828' });

  const pagesHolder = document.createElement('div');
  pagesHolder.id = 'viewer-pages';
  pagesHolder.style.display = 'flex'; pagesHolder.style.flexDirection = 'column'; pagesHolder.style.gap = '3px'; pagesHolder.style.alignItems = 'center';
  pagesHolder.style.width = '100%';

  wrapper.appendChild(pagesHolder);
  shell.appendChild(toolbar); shell.appendChild(wrapper);

  containerParent.replaceChild(shell, origContainer);

  window.__viewer_ui = {
    shell, toolbar, wrapper, pagesHolder, pageTotal,
    pageInput, btnZoomIn, btnZoomOut, zoomVal, btnFitWidth, btnFitPage,
    btnDownload, btnHighlightToggle, btnDarkmode, btnAjustFont, yellowHighlight, lightgreenHighlight, skyblueHighlight, pinkHighlight, redHighlight, blueHighlight, greenHighlight, purpleHighlight, 
    // 互換: 旧コード（toolbar.js）が参照する名称に合わせたエイリアス
    get btnSvgMode(){ return btnDarkmode; },
    get btnOverlayMode(){ return btnAjustFont; }
  };

  return window.__viewer_ui;
};
