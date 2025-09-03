// viewer-run.js
// worker のパスを拡張内のファイルに合わせる
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.js');

document.addEventListener('DOMContentLoaded', () => {
  if (typeof startViewer === 'function') {
    startViewer().catch(e => {
      console.error('startViewer error', e);
      document.getElementById('container').textContent = 'Error: ' + e.message;
    });
  } else {
    console.error('startViewer is not defined (viewer.js が読み込まれていない可能性あり)');
  }
});
