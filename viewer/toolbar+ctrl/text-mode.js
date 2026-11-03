// text-mode.js
// テキスト表示モード切替: SVG / overlay モードの状態管理とボタン配線

window.wireTextModeControls = function wireTextModeControls(ui){
  if (!ui) ui = window.__viewer_ui; if (!ui) return;

  const STORAGE_KEY = 'viewerTextMode';
  function saveMode(m){ try { localStorage.setItem(STORAGE_KEY, m); } catch(_) {} }
  function loadMode(){ try { return localStorage.getItem(STORAGE_KEY) || 'svg'; } catch(_) { return 'svg'; } }
  function updateButtons(mode){
    // フォント調整（overlay）ON時のみ青表示。ダークモードボタンはここでは変更しない。
    if (mode === 'overlay') { ui.btnAjustFont.style.background = '#0a84ff'; }
    else { ui.btnAjustFont.style.background = ''; }
  }
  function applyModeToAllPages(mode){
    const pages = ui.pagesHolder.querySelectorAll('.page');
    pages.forEach(pageDiv => {
      const svgElem = pageDiv.querySelector('svg'); const textLayer = pageDiv.querySelector('.textLayer');
      const hasShadingError = pageDiv.hasAttribute('data-shading-error');
      
      // allowCopy 状態を確認（main.jsで設定された値を参照）
      const firstSpan = textLayer ? textLayer.querySelector('span') : null;
      // data-allow-copy属性がなければ、初回のuserSelect状態から推測
      let allowCopy = false;
      if (pageDiv.hasAttribute('data-allow-copy')) {
        allowCopy = pageDiv.getAttribute('data-allow-copy') === 'true';
      } else if (firstSpan) {
        // 初回はtextLayerのspan状態から判定し、属性に保存
        allowCopy = !(firstSpan.style.userSelect === 'none' || getComputedStyle(firstSpan).userSelect === 'none');
        pageDiv.setAttribute('data-allow-copy', allowCopy ? 'true' : 'false');
      }
      
      if (mode === 'svg' && !hasShadingError) {
        // SVGモード: SVG内テキストを表示（選択不可）、textLayerは透明だが選択可能（正しいUnicodeテキスト）
        if (svgElem) { 
          svgElem.style.pointerEvents = 'none'; 
          svgElem.style.userSelect = 'none'; 
          svgElem.querySelectorAll('text, tspan').forEach(t => { 
            t.style.visibility = ''; 
            t.style.display = ''; 
            t.style.pointerEvents = 'none'; 
            t.style.userSelect = 'none'; // SVGテキストは選択不可（グリフコードのため）
          }); 
        }
        if (textLayer) { 
          textLayer.querySelectorAll('span').forEach(s => { 
            s.style.setProperty('color', 'transparent', 'important');
            s.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
            // コピー許可の場合は透明でも選択可能にする
            s.style.pointerEvents = allowCopy ? 'auto' : 'none'; 
            s.style.userSelect = allowCopy ? 'text' : 'none'; 
            s.style.WebkitUserSelect = allowCopy ? 'text' : 'none'; 
            s.style.MozUserSelect = allowCopy ? 'text' : 'none'; 
            if (allowCopy) {
              s.removeAttribute('aria-hidden');
            } else {
              s.setAttribute('aria-hidden', 'true'); 
            }
          }); 
          textLayer.style.pointerEvents = allowCopy ? 'auto' : 'none'; 
          textLayer.style.userSelect = allowCopy ? 'text' : 'none'; 
          textLayer.style.zIndex = '3000'; 
        }
      } else if (mode === 'overlay' || hasShadingError) {
        // オーバーレイモードまたはShadingエラー: SVG内テキストを非表示、テキストレイヤを表示
        if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; t.style.pointerEvents = 'none'; t.style.userSelect = 'none'; }); svgElem.style.pointerEvents = 'none'; svgElem.style.userSelect = 'none'; }
        const overlayColor = (window.__viewer_darkModeEnabled ? '#e0e0e0' : '#222222');
        if (textLayer) { 
          // allowCopy 状態を確認（data 属性などで保持されていれば参照、なければ span の userSelect で判定）
          const firstSpan = textLayer.querySelector('span');
          const allowCopy = firstSpan ? (getComputedStyle(firstSpan).userSelect !== 'none') : false;
          
          console.log('[DEBUG] Overlay mode - allowCopy:', allowCopy, 'color:', overlayColor, 'spans:', textLayer.querySelectorAll('span').length);
          textLayer.querySelectorAll('span').forEach(s => { 
            // 強制的に色を適用（透明を上書き）
            // 3. 10進数のRGB値に変換
            //const currentColor = s.style.getComputedStyle(); <=なぜかここを有効にするとsetPropertyがうまく動かない（エラーはなし）
            //const [r, g, b] = currentColor.match(/\d+/g).map(Number);
            s.style.setProperty('color', overlayColor, 'important');
            s.style.setProperty('-webkit-text-fill-color', overlayColor, 'important');
            /*この部分を有効にすることで色変更が可能に
            if (Math.abs(r-g) <= 3 && Math.abs(g-b) <= 3 && Math.abs(b-r) <= 3) {
              s.style.setProperty('color', overlayColor, 'important');
              s.style.setProperty('-webkit-text-fill-color', overlayColor, 'important');
            }*/
            // allowCopy=true の場合のみ選択可能、false なら表示のみ
            s.style.pointerEvents = allowCopy ? 'auto' : 'none';
            s.style.userSelect = allowCopy ? 'text' : 'none';
            s.removeAttribute('aria-hidden'); 
          }); 
          textLayer.style.pointerEvents = allowCopy ? 'auto' : 'none';
          textLayer.style.userSelect = allowCopy ? 'text' : 'none';
          textLayer.style.zIndex = '3000'; 
          
          console.log('[DEBUG] First span after apply - color:', firstSpan?.style.color, 'computed:', firstSpan ? getComputedStyle(firstSpan).color : 'null');
        }
      }
    });
    try { localStorage.setItem('viewerTextMode', mode); } catch(_) {}
    updateButtons(mode);
  }

  const initialMode = loadMode(); updateButtons(initialMode); applyModeToAllPages(initialMode);
  // フォント調整ボタンをトグル式に（overlay <-> svg）
  ui.btnAjustFont.addEventListener('click', () => {
    const cur = loadMode();
    const next = (cur === 'overlay') ? 'svg' : 'overlay';
    saveMode(next);
    updateButtons(next);
    applyModeToAllPages(next);
  });

  // グローバル公開
  window.__viewer_applyMode = applyModeToAllPages;
};
