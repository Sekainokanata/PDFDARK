// highlight.js
// ハイライト色の検出・変換・復元、トグルボタン配線、新規ページ自動適用

// ========= ハイライト色トグル =========
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
    if (colorflag != 1){
      try {
        colorflag = 1;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.yellowHighlight.classList.remove('selected');
      } catch(_) {}
    }
  });
  ui.lightgreenHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    if (colorflag != 2){
      try {
        colorflag = 2;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.lightgreenHighlight.classList.remove('selected');
      } catch(_) {}
    }
  });
  ui.skyblueHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    if (colorflag != 3){
      try {
        colorflag = 3;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.skyblueHighlight.classList.remove('selected');
      } catch(_) {}
    }
  });
  ui.pinkHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    if (colorflag != 4){
      try {
        colorflag = 4;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.pinkHighlight.classList.remove('selected');
      } catch(_) {}
    }
  });
  ui.redHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    /*
    try {
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}*/
    if (colorflag != 5){
      try {
        colorflag = 5;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.redHighlight.classList.remove('selected');
      } catch(_) {}
    }
  });
  ui.blueHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    if (colorflag != 6){
      try {
        colorflag = 6;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.blueHighlight.classList.remove('selected');
      } catch(_) {}
    }
  });
  ui.greenHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    if (colorflag != 7){
      try {
        colorflag = 7;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.greenHighlight.classList.remove('selected');
      } catch(_) {}
    }
  });
  ui.purpleHighlight.addEventListener('click', () => {
    window.__viewer_highlightEnabled = !window.__viewer_highlightEnabled;
    if (colorflag != 8){
      try {
        colorflag = 8;
        const holder = ui.pagesHolder || document.getElementById('viewer-pages') || document; const svgs = holder.querySelectorAll('svg');
        svgs.forEach(svg => { try { window.remapHighlightsInSvg(svg); } catch(_){} });
      } catch(_) {}
    } else {
      try { 
        window.restoreAllPagesHighlights(); 
        colorflag=0;
        // アイコンとサンプルの色をリセット
        const highlightIcon = document.getElementById('highlighticon');
        const highlightSample = document.querySelector('.highlightSample');
        if (highlightIcon) highlightIcon.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        if (highlightSample) highlightSample.classList.remove('yellow', 'lightgreen', 'skyblue', 'pink', 'red', 'blue', 'green', 'purple');
        ui.purpleHighlight.classList.remove('selected');
      } catch(_) {}
    }
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
