// ui.js
// UI シェル（ツールバー、ページホルダ）の作成と公開


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
  console.log(file);
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
  //const btnPrev = document.createElement('button'); btnPrev.className = 'viewer-tool-btn'; btnPrev.textContent = '◀';
  
  //const btnNext = document.createElement('button'); btnNext.className = 'viewer-tool-btn'; btnNext.textContent = '▶';
  //leftGroup.appendChild(btnPrev); 
  //leftGroup.appendChild(pageInput); leftGroup.appendChild(pageTotal);
  //leftGroup.appendChild(btnNext);
  

  // center group
  const centerGroup = document.createElement('div');
  centerGroup.className = 'viewer-toolbar-group'; centerGroup.style.display = 'flex'; centerGroup.style.margin = '0 auto'; centerGroup.style.gap = '6px'; centerGroup.style.alignItems = 'center'; centerGroup.style.background = '#3C3C3C'; centerGroup.style.zIndex = '1';
  const pageInput = document.createElement('input'); pageInput.type = 'number'; pageInput.min = 1; pageInput.value = 1; pageInput.style.width = '20px'; pageInput.className = 'viewer-tool-btn pageInput'; pageInput.style.background = '#1E1E1E'; pageInput.style.textAlign = 'center'; pageInput.style.border = 'none'
  const pageTotal = document.createElement('div'); pageTotal.textContent = `/ ${2}`
  const verticalSeparator1 = document.createElement('span'); verticalSeparator1.className = 'vertical-separator'
  const btnZoomOut = document.createElement('button'); btnZoomOut.className = 'viewer-tool-btn'; btnZoomOut.textContent = '-';
  //zoomの数字について画面の横幅一定以下で取消
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
  yellowHighlight.id = 'yellowHighlight';yellowHighlight.className = 'btnHighlight';lightgreenHighlight.id = 'lightgreenHighlight';lightgreenHighlight.className = 'btnHighlight';skyblueHighlight.id = 'skyblueHighlight';skyblueHighlight.className = 'btnHighlight';pinkHighlight.id = 'pinkHighlight';pinkHighlight.className = 'btnHighlight';blueHighlight.id = 'blueHighlight';blueHighlight.className = 'btnHighlight';redHighlight.id = 'redHighlight';redHighlight.className = 'btnHighlight';greenHighlight.id = 'greenHighlight';greenHighlight.className = 'btnHighlight';purpleHighlight.id = 'purpleHighlight';purpleHighlight.className = 'btnHighlight';
  highlightMenu.appendChild(yellowHighlight);highlightMenu.appendChild(lightgreenHighlight);highlightMenu.appendChild(skyblueHighlight);highlightMenu.appendChild(pinkHighlight);highlightMenu.appendChild(redHighlight);highlightMenu.appendChild(blueHighlight);highlightMenu.appendChild(greenHighlight);highlightMenu.appendChild(purpleHighlight);
  //メニューの出力
  highlightIcon.addEventListener('click', () => {
    highlightMenu.classList.toggle('show');
  });
  //yellow
  yellowHighlight.addEventListener('click', () => {colorflag = 1;highlightIcon.classList.add('yellow');highlightIcon.classList.remove('lightgreen');highlightIcon.classList.remove('skyblue');highlightIcon.classList.remove('pink');highlightIcon.classList.remove('red');highlightIcon.classList.remove('blue');highlightIcon.classList.remove('green');highlightIcon.classList.remove('purple');})

  //lightgreen
  lightgreenHighlight.addEventListener('click', () => {colorflag = 2;highlightIcon.classList.add('lightgreen');highlightIcon.classList.remove('yellow');highlightIcon.classList.remove('skyblue');highlightIcon.classList.remove('pink');highlightIcon.classList.remove('red');highlightIcon.classList.remove('blue');highlightIcon.classList.remove('green');highlightIcon.classList.remove('purple');})

  //skyblue
  skyblueHighlight.addEventListener('click', () => {colorflag = 3;highlightIcon.classList.add('skyblue');highlightIcon.classList.remove('yellow');highlightIcon.classList.remove('lightgreen');highlightIcon.classList.remove('pink');highlightIcon.classList.remove('red');highlightIcon.classList.remove('blue');highlightIcon.classList.remove('green');highlightIcon.classList.remove('purple');})

  //pink
  pinkHighlight.addEventListener('click', () => {colorflag = 4;highlightIcon.classList.add('pink');highlightIcon.classList.remove('yellow');highlightIcon.classList.remove('lightgreen');highlightIcon.classList.remove('skyblue');highlightIcon.classList.remove('red');highlightIcon.classList.remove('blue');highlightIcon.classList.remove('green');highlightIcon.classList.remove('purple');})

  //red
  redHighlight.addEventListener('click', () => {colorflag = 5;highlightIcon.classList.add('red');highlightIcon.classList.remove('yellow');highlightIcon.classList.remove('lightgreen');highlightIcon.classList.remove('skyblue');highlightIcon.classList.remove('pink');highlightIcon.classList.remove('blue');highlightIcon.classList.remove('green');highlightIcon.classList.remove('purple');})

  //blue
  blueHighlight.addEventListener('click', () => {colorflag = 6;highlightIcon.classList.add('blue');highlightIcon.classList.remove('yellow');highlightIcon.classList.remove('lightgreen');highlightIcon.classList.remove('skyblue');highlightIcon.classList.remove('pink');highlightIcon.classList.remove('red');highlightIcon.classList.remove('green');highlightIcon.classList.remove('purple');})

  //green
  greenHighlight.addEventListener('click', () => {colorflag = 7;highlightIcon.classList.add('green');highlightIcon.classList.remove('yellow');highlightIcon.classList.remove('lightgreen');highlightIcon.classList.remove('skyblue');highlightIcon.classList.remove('pink');highlightIcon.classList.remove('red');highlightIcon.classList.remove('blue');highlightIcon.classList.remove('purple');})

  //purple
  purpleHighlight.addEventListener('click', () => {colorflag = 8;highlightIcon.classList.add('purple');highlightIcon.classList.remove('yellow');highlightIcon.classList.remove('lightgreen');highlightIcon.classList.remove('skyblue');highlightIcon.classList.remove('pink');highlightIcon.classList.remove('red');highlightIcon.classList.remove('blue');highlightIcon.classList.remove('green');})


  
  btnHighlightToggle.appendChild(highlightMenu);

  rightGroup.appendChild(btnDownload); rightGroup.appendChild(btnDarkmode); rightGroup.appendChild(btnAjustFont);  rightGroup.appendChild(btnHighlightToggle);

  toolbar.appendChild(leftGroup); toolbar.appendChild(centerGroup); toolbar.appendChild(rightGroup);

  const wrapper = document.createElement('div');
  wrapper.id = 'viewer-container-wrapper';
  Object.assign(wrapper.style, { flex: '1 1 auto', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', background: '#282828' });

  const pagesHolder = document.createElement('div');
  pagesHolder.id = 'viewer-pages';
  pagesHolder.style.display = 'flex'; pagesHolder.style.flexDirection = 'column'; pagesHolder.style.gap = '3px'; pagesHolder.style.alignItems = 'center';

  wrapper.appendChild(pagesHolder);
  shell.appendChild(toolbar); shell.appendChild(wrapper);

  containerParent.replaceChild(shell, origContainer);

  window.__viewer_ui = {
    shell, toolbar, wrapper, pagesHolder,
    pageInput, btnZoomIn, btnZoomOut, zoomVal, btnFitWidth, btnFitPage,
    btnDownload, btnHighlightToggle, btnDarkmode, btnAjustFont, yellowHighlight, lightgreenHighlight, skyblueHighlight, pinkHighlight, redHighlight, blueHighlight, greenHighlight, purpleHighlight, 
    // 互換: 旧コード（toolbar.js）が参照する名称に合わせたエイリアス
    get btnSvgMode(){ return btnDarkmode; },
    get btnOverlayMode(){ return btnAjustFont; }
    //,btnPrev, btnNext
  };

  return window.__viewer_ui;
};

// ========= ハイライト色トグル（ui.jsで実装） =========
// 状態フラグ
window.__viewer_highlightEnabled = false;

// 色文字列 → {r,g,b,a} に解析
function __parseColorToRgba(str){
  if (!str) return null;
  const s = String(str).trim();
  const named = { yellow:[255,255,0,1], gold:[255,215,0,1], orange:[255,165,0,1] };
  if (named[s]) { const [r,g,b,a]=named[s]; return {r,g,b,a}; }
  if (s[0]==='#'){
    let hex=s.slice(1);
    if (hex.length===3){ const r=parseInt(hex[0]+hex[0],16), g=parseInt(hex[1]+hex[1],16), b=parseInt(hex[2]+hex[2],16); return {r,g,b,a:1}; }
    if (hex.length>=6){ const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16); return {r,g,b,a:1}; }
    return null;
  }
  const m = s.match(/^rgba?\(([^)]+)\)/i);
  if (m){ const parts=m[1].split(',').map(x=>x.trim()); const r=parseFloat(parts[0]), g=parseFloat(parts[1]), b=parseFloat(parts[2]); const a=parts[3]!==undefined?parseFloat(parts[3]):1; if([r,g,b].every(v=>isFinite(v))) return { r:Math.max(0,Math.min(255,r)), g:Math.max(0,Math.min(255,g)), b:Math.max(0,Math.min(255,b)), a:isFinite(a)?Math.max(0,Math.min(1,a)):1}; }
  return null;
}

var colorflag = 0;

function __looksLikeHighlight(r,g,b){
  //const bright = (r+g+b)/3 >= 160;
  //const yellowish = (r>170 && g>170 && b<140) || (r>200 && g>180 && b<160);
  const yellowish = (r>240 && g>240 && b<15);
  const lightgreenwish = (r<15 && g>240 && b<15);
  const skybluewish = (r<15 && g>240 && b>240);
  const pinkwish = (r>240 && g<15 && b>240);
  const redwish = (r>240 && g<15 && b<15);
  const bluewish = (r<15 && g<15 && b>240);
  const greenwish = (r<15 && g>120 && g<136 && b<15);
  const purplewish = (r>120 && r<136 && g<15 && b>120 && b<136);
  return (yellowish || lightgreenwish || skybluewish || pinkwish || redwish || bluewish || greenwish || purplewish);
}

function __mapToBlue(r,g,b){
  if(colorflag == 1){return { r:255, g:255, b:0};}
  if(colorflag == 2){return { r:0, g:255, b:0};}   
  if(colorflag == 3){return { r:0, g:255, b:255};}
  if(colorflag == 4){return { r:255, g:0, b:255};}   
  if(colorflag == 5){return { r:255, g:0, b:0};}
  if(colorflag == 6){return { r:0, g:0, b:255};}   
  if(colorflag == 7){return { r:0, g:128, b:0};}
  if(colorflag == 8){return { r:128, g:0, b:128};}   
}

function __getElementFillColor(elem){
  let fillAttr = elem.getAttribute && elem.getAttribute('fill');
  if (fillAttr && fillAttr !== 'none') return __parseColorToRgba(fillAttr);
  try { const cs = getComputedStyle(elem); if (cs && cs.fill && cs.fill !== 'none') return __parseColorToRgba(cs.fill); } catch(_) {}
  return null;
}

// SVG内のハイライト色を変換
window.remapHighlightsInSvg = function remapHighlightsInSvg(svg){
  if (!svg) return 0;
  //const targets = svg.querySelectorAll('rect, path, polygon, text, tspan, polyline, ellipse, circle');
  const targets = svg.querySelectorAll('path');
  let changed = 0;
  targets.forEach(el => {
    const c = __getElementFillColor(el);
    if (!c) return;
    if (!el.hasAttribute('data-original-fill')){
        const f = el.getAttribute('fill'); if (f) el.setAttribute('data-original-fill', f); else el.setAttribute('data-original-fill', 'none');
        const fo = el.getAttribute('fill-opacity'); if (fo!==null) el.setAttribute('data-original-fill-opacity', fo);
        const op = el.getAttribute('opacity'); if (op!==null) el.setAttribute('data-original-opacity', op);
      }
    if (__looksLikeHighlight(c.r,c.g,c.b)){
      const nb = __mapToBlue(c.r,c.g,c.b);
      el.setAttribute('fill', `rgb(${nb.r}, ${nb.g}, ${nb.b})`);
      if (!el.hasAttribute('data-original-fill-opacity')) el.setAttribute('fill-opacity', '0.6');
      changed++;
    }
  });
  return changed;
};

// すべてのページのSVGについて復元
window.restoreAllPagesHighlights = function restoreAllPagesHighlights(){
  const holder = (window.__viewer_ui && window.__viewer_ui.pagesHolder) || document.getElementById('viewer-pages') || document;
  const svgs = holder.querySelectorAll('svg');
  svgs.forEach(svg => {
    const nodes = svg.querySelectorAll('[data-original-fill], [data-original-fill-opacity], [data-original-opacity]');
    nodes.forEach(el => {
      const of = el.getAttribute('data-original-fill');
      if (of !== null){ if (of==='none') el.removeAttribute('fill'); else el.setAttribute('fill', of); el.removeAttribute('data-original-fill'); }
      const ofo = el.getAttribute('data-original-fill-opacity'); if (ofo!==null){ if (ofo==='') el.removeAttribute('fill-opacity'); else el.setAttribute('fill-opacity', ofo); el.removeAttribute('data-original-fill-opacity'); }
      const oop = el.getAttribute('data-original-opacity'); if (oop!==null){ if (oop==='') el.removeAttribute('opacity'); else el.setAttribute('opacity', oop); el.removeAttribute('data-original-opacity'); }
    });
  });
};

// ボタン配線
window.ensureHighlightToggle = function ensureHighlightToggle(ui){
  ui = ui || window.__viewer_ui; if (!ui || !ui.yellowHighlight) return;
  if (ui.yellowHighlight.__wired) return;
  ui = ui || window.__viewer_ui; if (!ui || !ui.lightgreenHighlight) return;
  if (ui.lightgreenHighlight.__wired) return;
  ui = ui || window.__viewer_ui; if (!ui || !ui.skyblueHighlight) return;
  if (ui.skyblueHighlight.__wired) return;
  ui = ui || window.__viewer_ui; if (!ui || !ui.pinkHighlight) return;
  if (ui.pinkHighlight.__wired) return;
  ui = ui || window.__viewer_ui; if (!ui || !ui.redHighlight) return;
  if (ui.redHighlight.__wired) return;
  ui = ui || window.__viewer_ui; if (!ui || !ui.blueHighlight) return;
  if (ui.blueHighlight.__wired) return;
  ui = ui || window.__viewer_ui; if (!ui || !ui.greenHighlight) return;
  if (ui.greenHighlight.__wired) return;
  ui = ui || window.__viewer_ui; if (!ui || !ui.purpleHighlight) return;
  if (ui.purpleHighlight.__wired) return;
  ui.yellowHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
  });
  ui.lightgreenHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
  });
  ui.skyblueHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
  });
  ui.pinkHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
  });
  ui.redHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    /*
    if (window.__viewer_highlightEnabled){
      try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { window.restoreAllPagesHighlights(); } catch(_) {}
    }*/
  });
  ui.blueHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
  });
  ui.greenHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
  });
  ui.purpleHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
  });
  ui.btnHighlightToggle.__wired = true;
};

// 新規ページにも自動適用
window.setupHighlightObserver = function setupHighlightObserver(){
  try {
    const ui = window.__viewer_ui || {}; const holder = ui.pagesHolder || document.getElementById('viewer-pages'); if (!holder) return;
    if (holder.__hlObserver) return;
    const obs = new MutationObserver((mutList) => {
      if (!window.__viewer_highlightEnabled) return;
      for (const m of mutList){
        m.addedNodes && m.addedNodes.forEach(node => {
          try {
            if (node && node.querySelector){
              const svgs = node.matches && node.matches('svg') ? [node] : node.querySelectorAll ? node.querySelectorAll('svg') : [];
              svgs && svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
            }
          } catch(_){}
        });
      }
    });
    obs.observe(holder, { childList: true, subtree: true });
    holder.__hlObserver = obs;
  } catch(_) {}
};
