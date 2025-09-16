chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openWithInvert",
    title: "Open PDF with Invert Viewer",
    contexts: ["link", "page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let url = info.linkUrl || tab.url;
  if (!url) return;
  // PDFっぽいURLだけ（拡張子やcontent-typeチェックは簡易）
  if (!url.match(/\.pdf(\?|$)/i)) {
    // それでも開きたい？その場合は無条件で開くようにする
  }
  const viewerUrl = chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url);
  chrome.tabs.update({ url: viewerUrl });
});

// ツールバーボタンでも開ける
chrome.action.onClicked.addListener((tab) => {
  const url = tab.url;
  const viewerUrl = chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url);
  chrome.tabs.update({ url: viewerUrl });
});

//======================ここから追加============================================
// タブの情報（URLなど）が更新されたときに発火するイベントリスナー
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // タブの読み込みが完了し、かつURLが変更されたときにチェック
  // "complete"のチェックを入れることで、ページの構築が完了してから非表示処理を行う
  const url = tab.url;
  // PDFっぽいURLだけ（拡張子やcontent-typeチェックは簡易）
  if (!url.match(/\.pdf(\?|$)/i)) {
    // それでも開きたい？その場合は無条件で開くようにする
    return;
  }
  if (changeInfo.status === 'complete' && tab.url) {
    const viewerUrl = chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url);
    chrome.tabs.update({ url: viewerUrl });
  }
});