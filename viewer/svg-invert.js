// svg-invert.js
// ダークモード用SVG色反転（スマート反転）
// SVG内の非彩色要素（テキスト、パス等）を黒背景に映える色へ置換する

// 背景色に対する前景色を選択（輝度ベース）
window.pickForegroundForBackground = function pickForegroundForBackground(bgRgb) {
  function srgbToLinearChannel(c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function relativeLuminance(rgb) { const R = srgbToLinearChannel(rgb.r), G = srgbToLinearChannel(rgb.g), B = srgbToLinearChannel(rgb.b); return 0.2126 * R + 0.7152 * G + 0.0722 * B; }
  const lum = relativeLuminance(bgRgb);
  return lum > 0.5 ? 'rgba(30, 30, 30, 1)' : 'rgba(224, 224, 224, 1)';
};

// SVGのスマート色反転（彩度の低い要素のみ反転、有彩色は維持）
window.invertSvgColorsSmart = function invertSvgColorsSmart(svg, options = {}) {
  function parseColor(str) {
    if (!str) return null; str = String(str).trim().toLowerCase(); if (str === 'none') return null;
    const hexMatch = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) { let hex = hexMatch[1]; if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); const num = parseInt(hex, 16); return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 }; }
    const rgbMatch = str.match(/^rgba?\(([^)]+)\)$/);
    if (rgbMatch) { const parts = rgbMatch[1].split(',').map(s => s.trim()); const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]); const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1; return { r, g, b, a }; }
    const kw = { black: { r: 30, g: 30, b: 30, a: 1 }, white: { r: 244, g: 244, b: 244, a: 1 }, gray: { r: 128, g: 128, b: 128, a: 1 }, grey: { r: 128, g: 128, b: 128, a: 1 } };
    if (kw[str]) return kw[str]; return null;
  }
  function rgbToHsl(r, g, b) { r/=255; g/=255; b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b); let h=0,s=0,l=(max+min)/2; if(max!==min){ const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min); switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;} h/=6;} return{h,s,l}; }
  function isColored(rgb, options = {}) { if (!rgb) return false; const { s } = rgbToHsl(rgb.r, rgb.g, rgb.b); const satThreshold = options.satThreshold ?? 0.15; return s >= satThreshold; }

  const gradientMap = new Map();
  const gradients = svg.querySelectorAll('linearGradient, radialGradient');
  gradients.forEach(g => { const id = g.id; if (!id) return; const stops = g.querySelectorAll('stop'); let colored = false; stops.forEach(stop => { const sc = stop.getAttribute('stop-color'); const parsed = parseColor(sc); if (parsed && isColored(parsed, options)) colored = true; }); gradientMap.set('#' + id, colored); });

  const selector = 'text, tspan, path, rect, circle, ellipse, line, polyline, polygon, g';
  //gを含めない構造も可能だが、そうすると子要素でいちいち反転する羽目になる為、パフォーマンス的に怪しい。ただし、親にもともとfillを持ってないPDFも普通にあるので、最終的に削除することも検討。
  const nodes = svg.querySelectorAll(selector);
  let textCount = 0, pathCount = 0, invertedCount = 0;
  const tagStats = {};
  nodes.forEach(el => {
    const tag = el.tagName.toLowerCase();
    const baseTag = tag.replace(/^svg:/, ''); // 名前空間を除去
    tagStats[tag] = (tagStats[tag] || 0) + 1;
    if (baseTag === 'text' || baseTag === 'tspan') textCount++;
    if (baseTag === 'path') pathCount++;
    if (baseTag === 'image') return;
    let fillAttr = el.getAttribute('fill'); let fillIsGradient = false; if (fillAttr && fillAttr.trim().startsWith('url(')) fillIsGradient = true;
    let fillColor = null;
    if (!fillIsGradient) {
      // まず属性と style から取得を試みる
      if (fillAttr && fillAttr !== 'currentColor' && fillAttr !== 'none') fillColor = parseColor(fillAttr);
      if (!fillColor && el.style && el.style.fill) fillColor = parseColor(el.style.fill);
      
      // fill属性がない場合（親から継承）はcomputedStyleを使うが、
      // 親要素がすでに処理されている可能性があるため、親に fill 属性があるかチェック
      if (!fillColor) { 
        const cs = window.getComputedStyle(el); 
        if (cs && cs.fill) {
          // 親要素に fill 属性がある場合、親が既に処理済みなのでスキップ
          let hasParentFill = false;
          let parent = el.parentElement;
          while (parent && parent.tagName.toLowerCase().replace(/^svg:/, '') !== 'svg') {
            if (parent.getAttribute('fill')) {
              hasParentFill = true;
              break;
            }
            parent = parent.parentElement;
          }
          // 親に fill がない場合のみ computed を使用
          if (!hasParentFill) {
            fillColor = parseColor(cs.fill);
          }
        }
      }
    }
    
    // LaTeX PDF デバッグ: text/tspan要素で fill が取得できているか確認
    if ((baseTag === 'text' || baseTag === 'tspan') && textCount <= 5) {
      console.log('[DEBUG text]', baseTag, textCount, 'fillAttr:', fillAttr, 'style.fill:', el.style.fill, 'computed:', fillColor ? `rgb(${fillColor.r},${fillColor.g},${fillColor.b})` : 'null');
    }
    
    let strokeAttr = el.getAttribute('stroke'); let strokeColor = null; if (strokeAttr && strokeAttr !== 'currentColor' && strokeAttr !== 'none') strokeColor = parseColor(strokeAttr);
    if (!strokeColor && el.style && el.style.stroke) strokeColor = parseColor(el.style.stroke);
    if (!strokeColor) { const cs = window.getComputedStyle(el); if (cs && cs.stroke) strokeColor = parseColor(cs.stroke); }

    if (fillIsGradient) {
      const urlRef = el.getAttribute('fill').trim(); const gradColored = gradientMap.has(urlRef) ? gradientMap.get(urlRef) : true;
      if (!gradColored) {
        const id = urlRef.replace(/^url\(/, '').replace(/\)$/, ''); const gradElem = svg.querySelector(id);
        if (gradElem) gradElem.querySelectorAll('stop').forEach(stop => { const sc = stop.getAttribute('stop-color'); const parsed = parseColor(sc); if (parsed && !isColored(parsed, options)) {
            if (!stop.hasAttribute('data-dm-original-stop-color')) {
              const oc = stop.getAttribute('stop-color');
              stop.setAttribute('data-dm-original-stop-color', oc !== null ? oc : '__dm__MISSING__');
            }
            stop.setAttribute('stop-color', window.pickForegroundForBackground(parsed));
          } });
      }
    } else if (fillColor && !isColored(fillColor, options)) {
      if (!el.hasAttribute('data-dm-original-fill')) {
        const of = el.getAttribute('fill'); el.setAttribute('data-dm-original-fill', of !== null ? of : '__dm__MISSING__');
      }
      const newFill = window.pickForegroundForBackground(fillColor);
      el.setAttribute('fill', newFill);
      invertedCount++;
      if (invertedCount <= 3) {
        console.log('[INVERTED]', tag, 'from:', `rgb(${fillColor.r},${fillColor.g},${fillColor.b})`, 'to:', newFill);
      }
    }

    if (strokeColor && !isColored(strokeColor, options)) {
      if (!el.hasAttribute('data-dm-original-stroke')) {
        const os = el.getAttribute('stroke'); el.setAttribute('data-dm-original-stroke', os !== null ? os : '__dm__MISSING__');
      }
      el.setAttribute('stroke', window.pickForegroundForBackground(strokeColor));
      invertedCount++;
    }
  });
  console.log('[invertSvgColorsSmart] text/tspan:', textCount, 'path:', pathCount, 'inverted:', invertedCount, 'tags:', tagStats);
  if (!svg.hasAttribute('data-dm-original-background')) {
    const bg = svg.style.background || '';
    svg.setAttribute('data-dm-original-background', bg);
  }
  svg.style.background = '#1E1E1E';
};
