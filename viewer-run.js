// viewer-run.js
// worker のパスを拡張内のファイルに合わせる
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.js');

// 拡張機能の有効/無効状態をチェック
async function checkExtensionEnabled() {
  try {
    const result = await chrome.storage.local.get(['pdfViewerEnabled']);
    return result.pdfViewerEnabled !== false; // デフォルトはON
  } catch (e) {
    console.warn('Could not check extension state:', e);
    return true; // エラー時はデフォルトON
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 拡張機能が無効の場合、元のPDF URLにリダイレクト
  const enabled = await checkExtensionEnabled();
  if (!enabled) {
    const params = new URLSearchParams(location.search);
    const originalPdfUrl = params.get('file');
    if (originalPdfUrl) {
      console.log('PDF Dark Viewer is disabled. Redirecting to original PDF:', originalPdfUrl);
      // 元のPDF URLにリダイレクト
      location.replace(originalPdfUrl);
      return; // startViewer を実行しない
    }
  }
  
  if (typeof startViewer === 'function') {
    startViewer().catch(e => {
      console.error('startViewer error', e);
      document.getElementById('container').textContent = 'Error: ' + e.message;
    });
  } else {
    console.error('startViewer is not defined (viewer.js が読み込まれていない可能性あり)');
  }
});
