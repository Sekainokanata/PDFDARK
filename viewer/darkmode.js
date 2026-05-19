// darkmode.js
// ダークモード: 状態管理、トグルボタン配線、既存ページへの適用/解除

// ========= ダークモード トグル =========
// グローバル状態（既定: ON、localStorageから復元）
if (typeof window.__viewer_darkModeEnabled === 'undefined') {
  // localStorageから読み込み（初回起動時はON）
  try {
    const saved = localStorage.getItem('viewerDarkMode');
    if (saved !== null) {
      window.__viewer_darkModeEnabled = saved === 'true';
    } else {
      // 初回起動時はデフォルトON
      window.__viewer_darkModeEnabled = true;
    }
  } catch(_) {
    window.__viewer_darkModeEnabled = true; // localStorageが使えない場合もON
  }
}

// ボタン配線（ON でダークモード適用、OFF で元に戻す）
window.ensureDarkModeToggle = function ensureDarkModeToggle(ui){
  ui = ui || window.__viewer_ui; if (!ui || !ui.btnDarkmode) return;
  const btn = ui.btnDarkmode;
  if (btn.__dm_wired) return;
  const updateUi = () => {
    btn.title = window.__viewer_darkModeEnabled ? 'ダークモード: ON' : 'ダークモード: OFF';
    // ON のとき他のトグル同様に青く表示
    btn.style.background = window.__viewer_darkModeEnabled ? '#0a84ff' : '';
  };
  btn.addEventListener('click', () => {
    // 状態を反転しlocalStorageに保存
    window.__viewer_darkModeEnabled = !window.__viewer_darkModeEnabled;
    try {
      localStorage.setItem('viewerDarkMode', window.__viewer_darkModeEnabled);
    } catch(_) {}
    
    // ダークモードを適用
    try { if (typeof window.__viewer_applyDarkMode === 'function') { window.__viewer_applyDarkMode(window.__viewer_darkModeEnabled); } } catch(_) {}
    updateUi();
  });
  updateUi();
  btn.__dm_wired = true;
};

// ===== 既存ページに対するダークモード再適用/解除ヘルパ =====
// enabled=true なら再反転処理（まだ処理していない PNG Canvas を selective invert）
// enabled=false なら保存済みオリジナルへ復元（SVG は restore、PNG は original ImageData）
window.__viewer_applyDarkMode = async function __viewer_applyDarkMode(enabled){
  try {
    const holder = (window.__viewer_ui && window.__viewer_ui.pagesHolder) || document.getElementById('viewer-pages');
    if (!holder) return;
    const pages = holder.querySelectorAll('.page');
    
    // 現在のモード（overlay/svg）を取得
    let currentMode = 'svg';
    try { 
      currentMode = localStorage.getItem('viewerTextMode') || 'svg'; 
    } 
    catch(_) {}
    
    pages.forEach(pageDiv => {
      const paper = pageDiv.querySelector('.paper');
      if (!paper) return;
      const svg = paper.querySelector('svg');
      const canvases = paper.querySelectorAll('canvas');
      const textLayer = pageDiv.querySelector('.textLayer');
      const hasShadingError = pageDiv.hasAttribute('data-shading-error');
      
      // オーバーレイモードまたはShadingエラーページの場合、テキストレイヤーの色を更新
      if ((currentMode === 'overlay' || hasShadingError) && textLayer) {
        const overlayColor = enabled ? '#e0e0e0' : '#222222';
        textLayer.querySelectorAll('span').forEach(s => {
          //const currentColor = s.style.getComputedStyle('color');
          //const [r, g, b] = currentColor.match(/\d+/g).map(Number);
          s.style.setProperty('color', overlayColor, 'important');
          s.style.setProperty('-webkit-text-fill-color', overlayColor, 'important');
          /*この部分を変更することで色変更が可能に
          if (Math.abs(r-g) <= 3 && Math.abs(g-b) <= 3 && Math.abs(b-r) <= 3) {
              s.style.setProperty('color', overlayColor, 'important');
              s.style.setProperty('-webkit-text-fill-color', overlayColor, 'important');
          }*/
        });
      }
      
      if (enabled) {
        // ON: SVG にスマート反転（背景黒化）を再適用。既存で処理済みならスキップ。
        if (svg && !svg.__darkApplied) {
          try { window.invertSvgColorsSmart(svg, { satThreshold: 0.15 }); svg.__darkApplied = true; } catch(_) {}
          try { window.processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 }); } catch(_) {}
        }
        // PNG Canvas: 未処理なら再描画せずその場で selective invert
        canvases.forEach(cv => { (async () => {
          if (cv.__darkProcessed) return; // 既に暗転済み
          let imgData = cv.__originalImageData;
          try {
            const ctx2 = cv.getContext('2d');
            if (!imgData) { imgData = ctx2.getImageData(0, 0, cv.width, cv.height); cv.__originalImageData = imgData; }
            // 縮小して検出
            let imgSmall = imgData; let sw = imgData.width, sh = imgData.height; const maxSide = 1024; const scale = Math.min(1, maxSide / Math.max(sw, sh));
            if (scale < 1) {
              const sW = Math.max(1, Math.round(sw * scale)); const sH = Math.max(1, Math.round(sh * scale));
              const tmp = document.createElement('canvas'); tmp.width = sW; tmp.height = sH; const tctx = tmp.getContext('2d');
              const src = document.createElement('canvas'); src.width = sw; src.height = sh; const sctx = src.getContext('2d'); sctx.putImageData(imgData, 0, 0);
              tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high'; tctx.drawImage(src, 0, 0, sW, sH);
              imgSmall = tctx.getImageData(0, 0, sW, sH);
              sw = sW; sh = sH;
            }
            // OpenCV sandbox 優先 → フォールバック: ピュアJS
            let det = null;
            try { det = null; const cvRes = await window.__opencvDetectInSandbox(imgSmall, imgData.width, imgData.height, {}); if (cvRes && cvRes.ok) det = cvRes; } catch(_) {}
            if (!det || !det.ok) det = window.detectPhotoRegionsPythonStyle(imgSmall, imgData.width, imgData.height);
            // 反転（ボックス外のみ）
            const boxesPx = Array.isArray(det.boxes) ? det.boxes : (det.box ? [det.box] : []);
            const data = new Uint8ClampedArray(imgData.data);
            // まず全体を反転
            for (let i=0;i<data.length;i+=4){ data[i]=30+(255-data[i])*214/255; data[i+1]=30+(255-data[i+1])*214/255; data[i+2]=30+(255-data[i+2])*214/255; }
            if (boxesPx.length) {
              const W = imgData.width, H = imgData.height;
              for (const b of boxesPx) {
                if (!b) continue; const x=Math.max(0,Math.min(W,Math.round(b.x))), y=Math.max(0,Math.min(H,Math.round(b.y)));
                const bw=Math.max(0,Math.min(W-x,Math.round(b.w))), bh=Math.max(0,Math.min(H-y,Math.round(b.h))); if (!(bw>0 && bh>0)) continue;
                for (let row=0; row<bh; row++){
                  const start=((y+row)*W + x)*4; const len=bw*4; data.set(imgData.data.subarray(start, start+len), start);
                }
              }
            }
            const out = new ImageData(data, imgData.width, imgData.height); ctx2.putImageData(out, 0, 0); cv.__darkProcessed = true;
          } catch(_){ }
        })(); });
      } else {
        // OFF: SVG を可能なら元の色へ戻す（背景も）
        if (svg) {
          try {
            // 背景を初期化（dark適用時に #1E1E1E を設定、元の背景は data-dm-original-background）
            const bg = svg.getAttribute('data-dm-original-background');
            if (bg !== null) {
              if (bg === '') svg.style.background = ''; else svg.style.background = bg;
              svg.removeAttribute('data-dm-original-background');
            } else {
              svg.style.background = '';
            }
            // 塗り/線の復元（ダークモード専用のバックアップ属性から）
            svg.querySelectorAll('[data-dm-original-fill]').forEach(el => {
              const of = el.getAttribute('data-dm-original-fill');
              if (of === null || of === '' || of === '__dm__MISSING__') el.removeAttribute('fill'); else el.setAttribute('fill', of);
              el.removeAttribute('data-dm-original-fill');
            });
            svg.querySelectorAll('[data-dm-original-stroke]').forEach(el => {
              const os = el.getAttribute('data-dm-original-stroke');
              if (os === null || os === '' || os === '__dm__MISSING__') el.removeAttribute('stroke'); else el.setAttribute('stroke', os);
              el.removeAttribute('data-dm-original-stroke');
            });
            // グラデーション stop の復元
            svg.querySelectorAll('stop[data-dm-original-stop-color]').forEach(stop => {
              const oc = stop.getAttribute('data-dm-original-stop-color');
              if (oc === null || oc === '__dm__MISSING__') stop.removeAttribute('stop-color'); else stop.setAttribute('stop-color', oc);
              stop.removeAttribute('data-dm-original-stop-color');
            });
            // 画像の復元（href/フィルタ）
            svg.querySelectorAll('image').forEach(imgEl => {
              try {
                const orig = imgEl.getAttribute('data-dm-original-href');
                if (orig !== null) {
                  // 置換に使用した blob を解放
                  const m = window.objectUrlMap && window.objectUrlMap.get(imgEl);
                  if (m && m.url && m.url.startsWith('blob:')) { try { URL.revokeObjectURL(m.url); } catch(_){} }
                  if (window.objectUrlMap) window.objectUrlMap.delete(imgEl);
                  imgEl.setAttribute('href', orig);
                  imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', orig);
                  imgEl.removeAttribute('data-dm-original-href');
                }
                if (imgEl.getAttribute('data-dm-image-inverted') === '1') {
                  imgEl.style.filter = '';
                  imgEl.removeAttribute('data-dm-image-inverted');
                }
              } catch(_){ }
            });
            svg.__darkApplied = false;
          } catch(_) {}
        }
        // PNG Canvas: 保存してあるオリジナル ImageData へ復元
        canvases.forEach(cv => {
          if (!cv.__darkProcessed) return; // そもそも暗転されていない
          const orig = cv.__originalImageData; if (!orig) return;
          try { const ctx2 = cv.getContext('2d'); ctx2.putImageData(orig, 0, 0); cv.__darkProcessed = false; } catch(_) {}
        });
      }
    });
  } catch(e){ console.warn('__viewer_applyDarkMode failed', e); }
};
