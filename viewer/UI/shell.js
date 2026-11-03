// shell.js
// UIシェルの構築: ツールバー、ラッパー、ページホルダーのDOM生成
// UI要素作成と初期化は uiElements.js に分割


window.setupShell = function setupShell(origContainer) {
  const containerParent = origContainer.parentElement || document.body;

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

  // UI初期化（uiElements.js）- グローバル登録も含む
  const ui = window.initializeUI(pdftitle);

  // DOM構築
  const shell = document.createElement('div');
  shell.id = 'viewer-shell';
  shell.style.height = '100vh';
  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';

  // ラッパー（スクロール可能なコンテナ）
  const wrapper = document.createElement('div');
  wrapper.id = 'viewer-container-wrapper';
  // display:'block'だとjustifyContentが無効化され、zoom.js側の余白最小化ロジックが機能しないためflexにする
  Object.assign(wrapper.style, {
    flex: '1 1 auto',
    overflowX: 'auto',
    overflowY: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '20px',
    background: '#282828'
  });

  // 要素を組み立て
  wrapper.appendChild(ui.pagesHolder);
  shell.appendChild(ui.toolbar);
  shell.appendChild(wrapper);

  // DOM置換
  containerParent.replaceChild(shell, origContainer);

  // グローバルUIにシェル情報を追加
  ui.shell = shell;
  ui.wrapper = wrapper;

  return ui;
};
