// 拡張機能の有効/無効状態を取得
async function isExtensionEnabled() {
  const result = await chrome.storage.local.get(['pdfViewerEnabled']);
  return result.pdfViewerEnabled !== false; // デフォルトはON
}

// アイコンの状態を更新
async function updateIcon() {
  const enabled = await isExtensionEnabled();
  const iconPath = enabled ? "images/darkmode.png" : "images/darkmode.png"; // 必要に応じてOFF用アイコンを別途作成可能
  const title = enabled ? "PDF Dark Viewer (有効)" : "PDF Dark Viewer (無効)";
  
  chrome.action.setIcon({ path: iconPath });
  chrome.action.setTitle({ title: title });
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "openWithInvert",
    title: "Open PDF with Invert Viewer",
    contexts: ["link", "page"]
  });
  
  // 初期状態を設定（デフォルトON）
  const result = await chrome.storage.local.get(['pdfViewerEnabled']);
  if (result.pdfViewerEnabled === undefined) {
    await chrome.storage.local.set({ pdfViewerEnabled: true });
  }
  
  await updateIcon();
});

// ポップアップからの状態変更メッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stateChanged') {
    updateIcon();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url = info.linkUrl || tab.url;
  if (!url) return;
  // PDFっぽいURLだけ（拡張子やcontent-typeチェックは簡易）
  if (!url.match(/\.pdf(\?|$)/i)) {
    // それでも開きたい？その場合は無条件で開くようにする
  }
  const viewerUrl = chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url);
  chrome.tabs.update({ url: viewerUrl });
});

//======================ここから追加============================================
// タブの情報（URLなど）が更新されたときに発火するイベントリスナー
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return; // complete 以外は無視

  const url = tab.url;
  if (!url) return; // url が undefined の場合は何もしない

  if (!url.match(/\.pdf(\?|$)/i)) {
    return; // PDFじゃなければ無視
  }

  // 拡張機能が有効な場合のみビューアーで開く
  const enabled = await isExtensionEnabled();
  if (!enabled) {
    console.log('PDF Dark Viewer is disabled. Skipping auto-conversion.');
    return;
  }

  const viewerUrl = chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url);
  chrome.tabs.update(tabId, { url: viewerUrl });
});
