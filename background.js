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
  if (changeInfo.status !== 'complete') return; // complete 以外は無視

  const url = tab.url;
  if (!url) return; // url が undefined の場合は何もしない

  if (!url.match(/\.pdf(\?|$)/i)) {
    return; // PDFじゃなければ無視
  }

  const viewerUrl = chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url);
  chrome.tabs.update(tabId, { url: viewerUrl });
});
