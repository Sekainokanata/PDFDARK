// popup.js - ポップアップメニューのロジック

// 現在の有効/無効状態を取得
async function getExtensionState() {
  const result = await chrome.storage.local.get(['pdfViewerEnabled']);
  // デフォルトはON
  return result.pdfViewerEnabled !== false;
}

// 状態を保存
async function setExtensionState(enabled) {
  await chrome.storage.local.set({ pdfViewerEnabled: enabled });
}

// UI更新
function updateUI(enabled) {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const statusText = document.getElementById('statusText');
  
  if (enabled) {
    toggleSwitch.classList.add('active');
    statusText.textContent = '有効 - PDFを自動変換します';
    statusText.className = 'status-text enabled';
  } else {
    toggleSwitch.classList.remove('active');
    statusText.textContent = '無効 - 通常のPDFビューアーを使用します';
    statusText.className = 'status-text disabled';
  }
}

// トグル処理
async function toggleExtension() {
  const currentState = await getExtensionState();
  const newState = !currentState;
  await setExtensionState(newState);
  updateUI(newState);
  
  // バックグラウンドスクリプトに通知（アイコン更新用）
  chrome.runtime.sendMessage({ 
    action: 'stateChanged', 
    enabled: newState 
  });
}

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  const enabled = await getExtensionState();
  updateUI(enabled);
  
  // クリックイベント
  document.getElementById('toggleBtn').addEventListener('click', toggleExtension);
});
