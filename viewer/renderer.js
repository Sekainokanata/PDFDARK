// renderer.js
// PDF のロード、ページ描画、オーバーレイ生成、画像反転など

// グローバル関数に依存（viewer が従来の <script> 羅列方式のため）

window.detectCopyPermission = async function detectCopyPermission(pdfDoc) {
  try {
    const perms = await pdfDoc.getPermissions();
    if (perms === null) return { canCopy: true, rawPerms: perms };
    if (Array.isArray(perms) && perms.length > 0 && typeof perms[0] === 'string') {
      const p = perms.map(s => String(s).toLowerCase());
      const copyAllowed = p.includes('copy') || p.includes('extract') || p.includes('extracttext');
      return { canCopy: !!copyAllowed, rawPerms: perms };
    }
    const COPY_BIT_POS = 5;
    const EXTRACT_BIT_POS = 10;
    const copyMask = 1 << (COPY_BIT_POS - 1);
    const extractMask = 1 << (EXTRACT_BIT_POS - 1);
    if (Array.isArray(perms) && perms.length === 1 && typeof perms[0] === 'number') {
      const P = perms[0];
      const copyAllowed = !!(P & copyMask) || !!(P & extractMask);
      return { canCopy: !!copyAllowed, rawPerms: perms };
    }
    if (Array.isArray(perms) && perms.every(x => typeof x === 'number')) {
      const combined = perms.reduce((a, b) => a | b, 0);
      const copyAllowed = !!(combined & copyMask) || !!(combined & extractMask);
      return { canCopy: !!copyAllowed, rawPerms: perms };
    }
    return { canCopy: false, rawPerms: perms };
  } catch (e) {
    console.warn('detectCopyPermission failed, assume copy allowed:', e);
    return { canCopy: true, rawPerms: null };
  }
};

window.installCopyBlockers = function installCopyBlockers(rootEl) {
  rootEl.style.userSelect = 'none'; rootEl.style.webkitUserSelect = 'none'; rootEl.style.MozUserSelect = 'none';
  function onCopy(e) { e.preventDefault(); try { e.clipboardData.setData('text/plain', ''); } catch (_) {} return false; }
  document.addEventListener('copy', onCopy); document.addEventListener('cut', onCopy);
  const onContext = (e) => e.preventDefault();
  rootEl.addEventListener('contextmenu', onContext);
  return () => {
    document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCopy);
    rootEl.removeEventListener('contextmenu', onContext);
    rootEl.style.userSelect = ''; rootEl.style.webkitUserSelect = ''; rootEl.style.MozUserSelect = '';
  };
};

// 色関連（必要最小限）
window.pickForegroundForBackground = function pickForegroundForBackground(bgRgb) {
  function srgbToLinearChannel(c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function relativeLuminance(rgb) { const R = srgbToLinearChannel(rgb.r), G = srgbToLinearChannel(rgb.g), B = srgbToLinearChannel(rgb.b); return 0.2126 * R + 0.7152 * G + 0.0722 * B; }
  const lum = relativeLuminance(bgRgb);
  return lum > 0.5 ? '#000000' : '#ffffff';
};

// 既存のスマート反転（簡略化しつつコピペ）。ここでは svg 内の文字など非彩色要素を黒背景に映える色へ置換
window.invertSvgColorsSmart = function invertSvgColorsSmart(svg, options = {}) {
  function parseColor(str) {
    if (!str) return null; str = String(str).trim().toLowerCase(); if (str === 'none') return null;
    const hexMatch = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) { let hex = hexMatch[1]; if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); const num = parseInt(hex, 16); return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 }; }
    const rgbMatch = str.match(/^rgba?\(([^)]+)\)$/);
    if (rgbMatch) { const parts = rgbMatch[1].split(',').map(s => s.trim()); const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]); const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1; return { r, g, b, a }; }
    const kw = { black: { r: 0, g: 0, b: 0, a: 1 }, white: { r: 255, g: 255, b: 255, a: 1 }, gray: { r: 128, g: 128, b: 128, a: 1 }, grey: { r: 128, g: 128, b: 128, a: 1 } };
    if (kw[str]) return kw[str]; return null;
  }
  function rgbToHsl(r, g, b) { r/=255; g/=255; b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b); let h=0,s=0,l=(max+min)/2; if(max!==min){ const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min); switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;} h/=6;} return{h,s,l}; }
  function isColored(rgb, options = {}) { if (!rgb) return false; const { s } = rgbToHsl(rgb.r, rgb.g, rgb.b); const satThreshold = options.satThreshold ?? 0.15; return s >= satThreshold; }

  const gradientMap = new Map();
  const gradients = svg.querySelectorAll('linearGradient, radialGradient');
  gradients.forEach(g => { const id = g.id; if (!id) return; const stops = g.querySelectorAll('stop'); let colored = false; stops.forEach(stop => { const sc = stop.getAttribute('stop-color'); const parsed = parseColor(sc); if (parsed && isColored(parsed, options)) colored = true; }); gradientMap.set('#' + id, colored); });

  const selector = 'text, tspan, path, rect, circle, ellipse, line, polyline, polygon, g';
  const nodes = svg.querySelectorAll(selector);
  nodes.forEach(el => {
    const tag = el.tagName.toLowerCase(); if (tag === 'image') return;
    let fillAttr = el.getAttribute('fill'); let fillIsGradient = false; if (fillAttr && fillAttr.trim().startsWith('url(')) fillIsGradient = true;
    let fillColor = null;
    if (!fillIsGradient) {
      if (fillAttr && fillAttr !== 'currentColor' && fillAttr !== 'none') fillColor = parseColor(fillAttr);
      if (!fillColor && el.style && el.style.fill) fillColor = parseColor(el.style.fill);
      if (!fillColor) { const cs = window.getComputedStyle(el); if (cs && cs.fill) fillColor = parseColor(cs.fill); }
    }
    let strokeAttr = el.getAttribute('stroke'); let strokeColor = null; if (strokeAttr && strokeAttr !== 'currentColor' && strokeAttr !== 'none') strokeColor = parseColor(strokeAttr);
    if (!strokeColor && el.style && el.style.stroke) strokeColor = parseColor(el.style.stroke);
    if (!strokeColor) { const cs = window.getComputedStyle(el); if (cs && cs.stroke) strokeColor = parseColor(cs.stroke); }

    if (fillIsGradient) {
      const urlRef = el.getAttribute('fill').trim(); const gradColored = gradientMap.has(urlRef) ? gradientMap.get(urlRef) : true;
      if (!gradColored) {
        const id = urlRef.replace(/^url\(/, '').replace(/\)$/, ''); const gradElem = svg.querySelector(id);
        if (gradElem) gradElem.querySelectorAll('stop').forEach(stop => { const sc = stop.getAttribute('stop-color'); const parsed = parseColor(sc); if (parsed && !isColored(parsed, options)) { stop.setAttribute('stop-color', window.pickForegroundForBackground(parsed)); } });
      }
    } else if (fillColor && !isColored(fillColor, options)) {
      el.setAttribute('fill', window.pickForegroundForBackground(fillColor));
    }

    if (strokeColor && !isColored(strokeColor, options)) {
      el.setAttribute('stroke', window.pickForegroundForBackground(strokeColor));
    }
  });
  svg.style.background = '#000';
};

// ハイライトの色変換サポート（バックアップ/復元/マッピング）
window.__highlight_toggle_state = window.__highlight_toggle_state || { enabled: false };
window.backupSvgColors = function backupSvgColors(svg) {
  if (!svg) return; svg.querySelectorAll('*').forEach(el => { ['fill','stroke'].forEach(attr => { const v = el.getAttribute(attr); if (v !== null && v !== undefined) { if (!el.hasAttribute(`data-orig-${attr}`)) el.setAttribute(`data-orig-${attr}`, v); } }); });
};
window.restoreSvgColors = function restoreSvgColors(svg) { if (!svg) return 0; let restored=0; svg.querySelectorAll('*').forEach(el=>{ ['fill','stroke'].forEach(attr=>{ const orig=el.getAttribute(`data-orig-${attr}`); if (orig!==null && orig!==undefined){ el.setAttribute(attr, orig); restored++; } }); }); return restored; };
window.restoreAllPagesHighlights = function restoreAllPagesHighlights(){ let total=0; document.querySelectorAll('.page').forEach(p=>{ const svg=p.querySelector('svg'); if(svg) total+=window.restoreSvgColors(svg); }); return total; };
window.remapHighlightsInSvg = function remapHighlightsInSvg(svg, mapping, tolSq = 2500){
  function parseColorToRgb(str){ if(!str) return null; str=String(str).trim(); if(str==='none'||str==='currentColor') return null; const hex=str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if(hex){ let h=hex[1]; if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255,a:1}; } const m=str.match(/rgba?\(([^)]+)\)/); if(!m) return null; const parts=m[1].split(',').map(s=>parseFloat(s.trim())); return { r:parts[0], g:parts[1], b:parts[2], a: parts[3]!==undefined?parts[3]:1}; }
  function colorDistanceSq(a,b){ if(!a||!b) return Infinity; const dr=a.r-b.r,dg=a.g-b.g,db=a.b-b.b; return dr*dr+dg*dg+db*db; }
  if(!svg) return 0; let changed=0; const els=svg.querySelectorAll('*');
  els.forEach(el=>{ const tag=el.tagName.toLowerCase(); if(tag==='image') return; ['fill','stroke'].forEach(attr=>{ let val=el.getAttribute(attr); let computed=null; if(!val||val==='inherit'||val==='currentColor'){ try{ computed=window.getComputedStyle(el)[attr]; }catch(e){computed=null;} }
    const source=(val&&val!=='none')?val:computed; if(!source) return; const srcRgb=parseColorToRgb(source); if(!srcRgb) return;
    for(const map of mapping){ const srcTarget=typeof map.src==='string'?parseColorToRgb(map.src):map.src; if(!srcTarget) continue; const d=colorDistanceSq(srcRgb, srcTarget); if(d<=tolSq){ const tgt=typeof map.target==='string'?parseColorToRgb(map.target):map.target; if(!tgt) continue; if(srcRgb.a!==undefined && srcRgb.a<1){ el.setAttribute(attr, `rgba(${tgt.r}, ${tgt.g}, ${tgt.b}, ${srcRgb.a})`); } else { el.setAttribute(attr, map.target); } changed++; break; } }
  }); }); return changed; };

window.ensureHighlightToggle = function ensureHighlightToggle(ui){
  const HIGHLIGHT_MAPPING_DEFAULT = [ { src: '#ffff00', target: '#0000ff' }, { src: '#00ff00', target: '#0000ff' }, { src: '#00ffff', target: '#0000ff' } ];
  const HIGHLIGHT_TOL_DEFAULT = 30;

  if (!ui || !ui.toolbar) return;
  if (!ui.btnHighlightToggle) {
    const btn = document.createElement('button'); btn.className = 'viewer-tool-btn'; btn.textContent = 'ハイライト調整'; btn.title = 'ハイライト色を青に変換/元に戻す';
    ui.toolbar.appendChild(btn); ui.btnHighlightToggle = btn;
  } else if (ui.__highlight_toggle_handler) {
    ui.btnHighlightToggle.removeEventListener('click', ui.__highlight_toggle_handler);
  }

  ui.__highlight_toggle_handler = function(){
    const newState = !window.__highlight_toggle_state.enabled;
    if (newState) { ui.btnHighlightToggle.classList.add('active'); ui.btnHighlightToggle.style.background = '#0a84ff'; }
    else { ui.btnHighlightToggle.classList.remove('active'); ui.btnHighlightToggle.style.background = '#222'; }
    try {
      if (newState) {
        document.querySelectorAll('.page').forEach(p => { const svg = p.querySelector('svg'); if (!svg) return; window.backupSvgColors(svg); window.remapHighlightsInSvg(svg, HIGHLIGHT_MAPPING_DEFAULT, Math.pow(HIGHLIGHT_TOL_DEFAULT,2)*3); });
      } else {
        window.restoreAllPagesHighlights();
      }
      window.__highlight_toggle_state.enabled = newState;
    } catch(e){ console.error('Highlight toggle failed', e); }
  };
  ui.btnHighlightToggle.addEventListener('click', ui.__highlight_toggle_handler);
  if (window.__highlight_toggle_state.enabled) { ui.btnHighlightToggle.classList.add('active'); ui.btnHighlightToggle.style.background = '#0a84ff'; }
  else { ui.btnHighlightToggle.classList.remove('active'); ui.btnHighlightToggle.style.background = '#222'; }
};

// ハイライト有効時に、後から追加されるページへも自動適用
window.setupHighlightObserver = function setupHighlightObserver(){
  if (window.__highlight_observer_installed) return;
  const pagesHolder = (window.__viewer_ui && window.__viewer_ui.pagesHolder) || document.getElementById('viewer-pages') || document.body;
  if (!pagesHolder) return;
  const HIGHLIGHT_MAPPING_DEFAULT = [ { src: '#ffff00', target: '#0000ff' }, { src: '#00ff00', target: '#0000ff' }, { src: '#00ffff', target: '#0000ff' } ];
  const HIGHLIGHT_TOL_DEFAULT = 30;
  const mo = new MutationObserver(muts => {
    if (!window.__highlight_toggle_state.enabled) return;
    muts.forEach(m => {
      m.addedNodes && m.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        const svg = node.querySelector ? node.querySelector('svg') : null;
        if (svg) {
          try {
            window.backupSvgColors(svg);
            window.remapHighlightsInSvg(svg, HIGHLIGHT_MAPPING_DEFAULT, Math.pow(HIGHLIGHT_TOL_DEFAULT,2)*3);
          } catch(e){ console.warn('highlight remap on added node failed', e); }
        }
      });
    });
  });
  mo.observe(pagesHolder, { childList: true, subtree: true });
  window.__highlight_observer_installed = true;
};

// テキストレイヤ（paper内に配置）
window.renderTextLayerFromTextContent = function renderTextLayerFromTextContent(textContent, viewport, pageDiv, options = {}) {
  options = Object.assign({ forceVisible: false, makeTransparentIfSvgTextExists: true, color: '#fff', zIndex: 3000, allowCopy: false }, options);
  const paper = pageDiv.querySelector('.paper') || pageDiv; if (getComputedStyle(paper).position === 'static') paper.style.position = 'relative';
  // 既存の textLayer があれば除去（重複生成を防止）
  try { const existing = paper.querySelector('.textLayer'); if (existing) existing.remove(); } catch(_) {}
  const textLayer = document.createElement('div'); textLayer.className = 'textLayer';
  Object.assign(textLayer.style, { position: 'absolute', left: '0', top: '0', width: paper.style.width || pageDiv.style.width || (pageDiv.getAttribute('data-base-width') + 'px'), height: paper.style.height || pageDiv.style.height || (pageDiv.getAttribute('data-base-height') + 'px'), pointerEvents: options.allowCopy ? 'auto' : 'none', overflow: 'visible', zIndex: String(options.zIndex), background: 'transparent', mixBlendMode: 'normal', transformOrigin: '0 0' });
  paper.appendChild(textLayer);

  function multiplyTransform(a,b){ return [ a[0]*b[0] + a[1]*b[2], a[0]*b[1] + a[1]*b[3], a[2]*b[0] + a[3]*b[2], a[2]*b[1] + a[3]*b[3], a[4]*b[0] + a[5]*b[2] + b[4], a[4]*b[1] + a[5]*b[3] + b[5] ]; }
  const vtm = viewport.transform;
  textContent.items.forEach(item => {
    let tx; try { if (window.pdfjsLib && pdfjsLib.Util && typeof pdfjsLib.Util.transform === 'function') tx = pdfjsLib.Util.transform(viewport.transform, item.transform); else tx = multiplyTransform(vtm, item.transform || [1,0,0,1,0,0]); } catch(e) { tx = multiplyTransform(vtm, item.transform || [1,0,0,1,0,0]); }
    const left = tx[4]; const top = tx[5]; const fontHeight = Math.hypot(tx[1], tx[3]) || (item.height || 12);
    const span = document.createElement('span'); span.textContent = item.str;
    Object.assign(span.style, { position: 'absolute', left: `${left}px`, top: `${top - fontHeight}px`, fontSize: `${fontHeight}px`, whiteSpace: 'pre', lineHeight: '1', transformOrigin: '0 0', pointerEvents: options.allowCopy ? 'auto' : 'none', userSelect: options.allowCopy ? 'text' : 'none', WebkitUserSelect: options.allowCopy ? 'text' : 'none', MozUserSelect: options.allowCopy ? 'text' : 'none', msUserSelect: options.allowCopy ? 'text' : 'none', color: options.color, WebkitTextFillColor: options.color });
    textLayer.appendChild(span);
  });

  const svgElem = pageDiv.querySelector('svg');
  const hasSvgText = !!svgElem && !!svgElem.querySelector('text, tspan');
  const shouldBeVisible = options.forceVisible || (!hasSvgText) || !options.makeTransparentIfSvgTextExists;
  textLayer.querySelectorAll('span').forEach(s => {
    if (shouldBeVisible) {
      s.style.color = options.color; s.style.WebkitTextFillColor = options.color;
      if (options.allowCopy) { s.style.pointerEvents = 'auto'; s.style.userSelect = 'text'; s.style.WebkitUserSelect = 'text'; s.style.MozUserSelect = 'text'; s.style.msUserSelect = 'text'; }
      else { s.style.pointerEvents = 'none'; s.style.userSelect = 'none'; s.style.WebkitUserSelect = 'none'; s.style.MozUserSelect = 'none'; s.style.msUserSelect = 'none'; }
    } else {
      s.style.color = 'transparent'; s.style.WebkitTextFillColor = 'transparent';
      if (options.allowCopy) { s.style.pointerEvents = 'auto'; s.style.userSelect = 'text'; s.style.WebkitUserSelect = 'text'; s.style.MozUserSelect = 'text'; s.style.msUserSelect = 'text'; }
      else { s.style.pointerEvents = 'none'; s.style.userSelect = 'none'; s.style.WebkitUserSelect = 'none'; s.style.MozUserSelect = 'none'; s.style.msUserSelect = 'none'; }
    }
  });
  return textLayer;
};

// 画像反転（高品質）
window.objectUrlMap = window.objectUrlMap || new Map();
window.processSvgImagesHighQuality = async function processSvgImagesHighQuality(svgRoot, options = {}) {
  // 防御的: 呼び出し側の不備やレースを考慮し、未定義なら何もしない
  if (!svgRoot) return;
  // 稀に内部で `svg` を参照するコード断片が混入しても落ちないように別名を用意
  const svg = svgRoot;
  const objectUrlMap = window.objectUrlMap;
  const sampleMax = options.sampleMax ?? 200; const photoThresh = { avgSat: options.photoAvgSat ?? 0.05, colorStd: options.photoColorStd ?? 5, entropy: options.photoEntropy ?? 4.0, edgeDensity: options.photoEdgeDensity ?? 0.06 };
  const images = Array.from(svgRoot.querySelectorAll('image'));
  for (const imgEl of images) {
    try {
      let href = imgEl.getAttribute('href') || imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || imgEl.getAttribute('xlink:href');
      if (!href) continue;
      let blob; try { const respImg = await fetch(href); if (!respImg.ok) { console.warn('image fetch failed', href, respImg.status); continue; } blob = await respImg.blob(); } catch(e){ console.warn('image fetch error', e, href); continue; }
      let tmpBitmap; try { tmpBitmap = await createImageBitmap(blob); } catch(e){ console.warn('createImageBitmap failed', e); imgEl.style.filter = 'invert(1)'; continue; }
      const sampScale = Math.min(1, sampleMax / Math.max(tmpBitmap.width || 1, tmpBitmap.height || 1)); const sampW = Math.max(1, Math.floor((tmpBitmap.width || 1) * sampScale)); const sampH = Math.max(1, Math.floor((tmpBitmap.height || 1) * sampScale));
      const sampCanvas = document.createElement('canvas'); sampCanvas.width = sampW; sampCanvas.height = sampH; const sctx = sampCanvas.getContext('2d'); sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high'; sctx.drawImage(tmpBitmap, 0, 0, sampW, sampH); tmpBitmap.close?.();
      let imgData; try { imgData = sctx.getImageData(0, 0, sampW, sampH); } catch(e){ console.warn('getImageData sampling failed', e); imgEl.style.filter = 'invert(1)'; continue; }
      const data = imgData.data; const pixelCount = sampW * sampH; let sumSat = 0, sumR=0,sumG=0,sumB=0; for (let i=0;i<data.length;i+=4){ const r=data[i],g=data[i+1],b=data[i+2]; sumR+=r; sumG+=g; sumB+=b; const rn=r/255, gn=g/255, bn=b/255; const mx=Math.max(rn,gn,bn), mn=Math.min(rn,gn,bn); const l=(mx+mn)/2; const s=(mx===mn)?0:(l>0.5 ? (mx-mn)/(2-mx-mn) : (mx-mn)/(mx+mn)); sumSat+=s; }
      const avgSat = sumSat / pixelCount; const meanR=sumR/pixelCount, meanG=sumG/pixelCount, meanB=sumB/pixelCount; let varSum=0; for(let i=0;i<data.length;i+=4){ const r=data[i],g=data[i+1],b=data[i+2]; const dr=r-meanR,dg=g-meanG,db=b-meanB; const mag=Math.sqrt(dr*dr+dg*dg+db*db); varSum+=mag*mag; } const colorStd=Math.sqrt(varSum/pixelCount);
      const histBins=64; const hist=new Uint32Array(histBins); const lum=new Float32Array(pixelCount); for(let y=0,idx=0;y<sampH;y++){ for(let x=0;x<sampW;x++,idx++){ const i=(y*sampW+x)*4; const r=data[i],g=data[i+1],b=data[i+2]; lum[idx]=(0.2126*r+0.7152*g+0.0722*b)/255; const v=Math.min(histBins-1, Math.floor(lum[idx]*histBins)); hist[v]++; } }
      let entropy=0; for(let b=0;b<histBins;b++){ if (hist[b]===0) continue; const p=hist[b]/pixelCount; entropy -= p * Math.log2(p); }
      let edgeCount=0; for (let y=1; y<sampH-1; y++){ for(let x=1; x<sampW-1; x++){ const idx=y*sampW+x; const gx=( -lum[idx - sampW - 1] + lum[idx - sampW + 1] + -2*lum[idx - 1] + 2*lum[idx + 1] + -1*lum[idx + sampW - 1] + 1*lum[idx + sampW + 1] ); const gy=( -lum[idx - sampW - 1] + -2*lum[idx - sampW] + -1*lum[idx - sampW + 1] + 1*lum[idx + sampW - 1] + 2*lum[idx + sampW] + 1*lum[idx + sampW + 1] ); const g=Math.hypot(gx,gy); if(g>0.2) edgeCount++; } }
      const totalEdgeTest=(sampW-2)*(sampH-2)||1; const edgeDensity=edgeCount/totalEdgeTest;
      const isPhoto = (avgSat >= photoThresh.avgSat && colorStd >= photoThresh.colorStd && entropy >= photoThresh.entropy && edgeDensity >= photoThresh.edgeDensity) || (avgSat >= (photoThresh.avgSat*1.2) && entropy >= (photoThresh.entropy*0.9));
      if (isPhoto) { const prev = objectUrlMap.get(imgEl); if (prev && prev.url && prev.revokeOnNext && prev.url.startsWith('blob:')) URL.revokeObjectURL(prev.url); objectUrlMap.delete(imgEl); continue; }
      let fullBitmap; try { const proto = await createImageBitmap(blob); const fullW = proto.width||1, fullH=proto.height||1; const maxFull = options.maxFullSizeForInvert ?? 2500; if (Math.max(fullW, fullH) > maxFull) { imgEl.style.filter = 'invert(1)'; proto.close?.(); continue; } fullBitmap = await createImageBitmap(proto); proto.close?.(); } catch(e){ console.warn('createImageBitmap(full) failed', e); imgEl.style.filter='invert(1)'; continue; }
      try {
        const fW = fullBitmap.width, fH = fullBitmap.height; const canvas = document.createElement('canvas'); canvas.width = fW; canvas.height = fH; const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(fullBitmap, 0, 0, fW, fH);
        let fullImgData; try { fullImgData = ctx.getImageData(0, 0, fW, fH); } catch(e){ console.warn('getImageData(full) failed', e); fullBitmap.close?.(); imgEl.style.filter = 'invert(1)'; continue; }
        const fdata = fullImgData.data; for (let i=0;i<fdata.length;i+=4){ const a=fdata[i+3]/255; if(a===0) continue; let r=fdata[i]/a, g=fdata[i+1]/a, b=fdata[i+2]/a; r=255-r; g=255-g; b=255-b; fdata[i]=Math.round(r*a); fdata[i+1]=Math.round(g*a); fdata[i+2]=Math.round(b*a); }
        ctx.putImageData(fullImgData, 0, 0); const blobOut = await new Promise(res=>canvas.toBlob(res, 'image/png')); if(!blobOut) throw new Error('toBlob returned null'); const objUrl = URL.createObjectURL(blobOut); const prev = objectUrlMap.get(imgEl); if(prev && prev.url && prev.revokeOnNext && prev.url.startsWith('blob:')) URL.revokeObjectURL(prev.url); imgEl.setAttribute('href', objUrl); imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', objUrl); objectUrlMap.set(imgEl, { url: objUrl, revokeOnNext: true });
      } catch(e){ console.warn('full invert failed', e); imgEl.style.filter='invert(1)'; } finally { fullBitmap.close?.(); }
    } catch(err){ console.warn('processSvgImagesHighQuality error', err); continue; }
  }
};

// ===============================
// PNG 経路（テキストなしページ）: PDF → Canvas → クラシック画像処理で写真領域検出 → 反転除外 → Canvas を paper に配置
// ===============================

// クラシック画像処理による写真領域検出
// 入力: 縮小済みの ImageData (imgDataSmall), 出力: オリジナル座標系での {x,y,w,h} 配列
// ざっくり手順: グレースケール → Sobel でエッジ強度 → エッジ密度をセル集計 → セル連結成分から候補矩形 → 面積/アスペクト比/テクスチャでフィルタ → マージ
window.detectPhotoRegionsClassic = function detectPhotoRegionsClassic(imgDataSmall, origW, origH, options = {}){
  try {
    if (!imgDataSmall || !imgDataSmall.data) return { ok:false, boxes:[], reason:'no image data' };
    const opts = Object.assign({
      cellSize: 16,                // エッジ密度評価のセル解像度
      edgeGradThreshold: 0.2,      // Sobel 正規化勾配の閾値
      cellEdgeDensityMin: 0.06,    // セルの活性判定(エッジ割合)
      minAreaRatio: 0.02,          // ページに対する最小面積比
      maxAreaRatio: 0.90,          // ページに対する最大面積比
      minAspect: 0.2,              // アスペクト比の下限 (細長すぎ回避)
      maxAspect: 5.0,              // アスペクト比の上限
      regionEdgeDensityMin: 0.03,  // 候補矩形全体のエッジ密度最小値
      expandCells: 1               // セル矩形拡張マージン
    }, options);

    const sw = imgDataSmall.width|0, sh = imgDataSmall.height|0; if (!sw || !sh) return { ok:false, boxes:[] };
    const sdata = imgDataSmall.data;
    // 1) グレースケール + 正規化
    const gray = new Float32Array(sw * sh);
    for (let i=0, j=0; i<sdata.length; i+=4, j++) {
      // Rec.709
      const r = sdata[i], g = sdata[i+1], b = sdata[i+2];
      gray[j] = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
    }

    // 2) Sobel で勾配強度
    const grad = new Float32Array(sw * sh);
    for (let y=1; y<sh-1; y++) {
      for (let x=1; x<sw-1; x++) {
        const i = y*sw + x;
        const gxm = -gray[i-sw-1] + gray[i-sw+1] + -2*gray[i-1] + 2*gray[i+1] + -gray[i+sw-1] + gray[i+sw+1];
        const gym = -gray[i-sw-1] + -2*gray[i-sw] + -gray[i-sw+1] + gray[i+sw-1] + 2*gray[i+sw] + gray[i+sw+1];
        const g = Math.hypot(gxm, gym);
        grad[i] = g; // 0..~
      }
    }
    // 簡易正規化（最大値で割る）
    let gmax = 0; for (let i=0;i<grad.length;i++) if (grad[i] > gmax) gmax = grad[i];
    const invGmax = gmax > 0 ? 1/gmax : 1;
    for (let i=0;i<grad.length;i++) grad[i] *= invGmax;

    // 3) エッジ二値化
    const edge = new Uint8Array(sw * sh);
    const gth = opts.edgeGradThreshold;
    for (let i=0;i<grad.length;i++) edge[i] = grad[i] >= gth ? 1 : 0;

    // 4) セル集計（エッジ密度）
    const cs = opts.cellSize|0; const cw = Math.ceil(sw / cs), ch = Math.ceil(sh / cs);
    const cellActive = new Uint8Array(cw * ch);
    for (let cy=0; cy<ch; cy++) {
      for (let cx=0; cx<cw; cx++) {
        const x0 = cx*cs, y0 = cy*cs; const x1 = Math.min(sw, x0+cs), y1 = Math.min(sh, y0+cs);
        let cnt = 0; const area = (x1-x0)*(y1-y0) || 1;
        for (let y=y0; y<y1; y++) {
          let idx = y*sw + x0;
          for (let x=x0; x<x1; x++, idx++) cnt += edge[idx];
        }
        const density = cnt / area;
        cellActive[cy*cw + cx] = density >= opts.cellEdgeDensityMin ? 1 : 0;
      }
    }

    // 5) セルの連結成分ラベリング（4近傍）
    const labels = new Int32Array(cw*ch); labels.fill(-1);
    const comps = []; // {minx,miny,maxx,maxy,count}
    const stack = [];
    let curLabel = 0;
    const push = (x,y)=>stack.push(x,y);
    while (true) {
      let start = -1;
      for (let i=0;i<labels.length;i++) { if (cellActive[i]===1 && labels[i]===-1) { start = i; break; } }
      if (start === -1) break;
      const sx = start % cw, sy = (start / cw) | 0;
      let minx=sx, miny=sy, maxx=sx, maxy=sy, count=0;
      labels[start] = curLabel; push(sx, sy);
      while (stack.length) {
        const y = stack.pop(); const x = stack.pop();
        count++;
        if (x<minx) minx=x; if (x>maxx) maxx=x; if (y<miny) miny=y; if (y>maxy) maxy=y;
        // 4-neigh
        const nbs = [ [x-1,y], [x+1,y], [x,y-1], [x,y+1] ];
        for (const [nx,ny] of nbs) {
          if (nx<0||ny<0||nx>=cw||ny>=ch) continue;
          const idx = ny*cw + nx;
          if (cellActive[idx]===1 && labels[idx]===-1) { labels[idx]=curLabel; push(nx,ny); }
        }
      }
      comps.push({ minx, miny, maxx, maxy, count }); curLabel++;
    }

    // 6) セル矩形 → ピクセル矩形、各種フィルタ
    const scaleX = origW / sw, scaleY = origH / sh;
    const boxes = [];
    for (const c of comps) {
      const ex = opts.expandCells|0;
      const cx0 = Math.max(0, c.minx - ex), cy0 = Math.max(0, c.miny - ex);
      const cx1 = Math.min(cw-1, c.maxx + ex), cy1 = Math.min(ch-1, c.maxy + ex);
      const x0 = Math.floor(cx0 * cs * scaleX);
      const y0 = Math.floor(cy0 * cs * scaleY);
      const x1 = Math.ceil(Math.min(sw, (cx1+1)*cs) * scaleX);
      const y1 = Math.ceil(Math.min(sh, (cy1+1)*cs) * scaleY);
      const bw = Math.max(0, x1 - x0), bh = Math.max(0, y1 - y0);
      if (!(bw>0 && bh>0)) continue;
      const area = bw*bh, pageArea = origW*origH;
      const areaRatio = area / (pageArea||1);
      if (areaRatio < opts.minAreaRatio || areaRatio > opts.maxAreaRatio) continue;
      const ar = bw / bh; if (ar < opts.minAspect || ar > opts.maxAspect) continue;
      // region edge density（元の縮小画像上で評価）
      const sx0 = Math.max(0, Math.floor(x0/scaleX)), sy0 = Math.max(0, Math.floor(y0/scaleY));
      const sx1 = Math.min(sw, Math.ceil(x1/scaleX)), sy1 = Math.min(sh, Math.ceil(y1/scaleY));
      let eCnt=0, eArea=(sx1-sx0)*(sy1-sy0)||1;
      for (let y=sy0; y<sy1; y++) { for (let x=sx0; x<sx1; x++) eCnt += edge[y*sw + x]; }
      const eDen = eCnt / eArea; if (eDen < opts.regionEdgeDensityMin) continue;
      boxes.push({ x:x0, y:y0, w:bw, h:bh, ar:ar, areaRatio, eDen });
    }

    // 7) 矩形のマージ（大きく重なるものは結合）
    const merged = [];
    const overlaps = (a,b)=>{
      const x0=Math.max(a.x,b.x), y0=Math.max(a.y,b.y), x1=Math.min(a.x+a.w,b.x+b.w), y1=Math.min(a.y+a.h,b.y+b.h);
      const iw=Math.max(0,x1-x0), ih=Math.max(0,y1-y0); const inter=iw*ih; if (!inter) return 0;
      const ua=a.w*a.h + b.w*b.h - inter; return inter/(ua||1);
    };
    for (const b of boxes.sort((a,b)=> (b.areaRatio-a.areaRatio))) {
      let mergedTo = null;
      for (const m of merged) {
        if (overlaps(m, b) >= 0.3) { // IoU 0.3 以上
          const x=Math.min(m.x,b.x), y=Math.min(m.y,b.y);
          const r=Math.max(m.x+m.w, b.x+b.w), btm=Math.max(m.y+m.h, b.y+b.h);
          m.x=x; m.y=y; m.w=r-x; m.h=btm-y; mergedTo = m; break;
        }
      }
      if (!mergedTo) merged.push({ x:b.x, y:b.y, w:b.w, h:b.h });
    }

    return { ok:true, boxes: merged };
  } catch (e) {
    console.warn('detectPhotoRegionsClassic failed', e);
    return { ok:false, boxes:[], error:String(e&&e.message||e) };
  }
};

// サンドボックスの用意（単一 iframe を使いまわし）
// 旧: ML サンドボックス。互換のため残すが未使用。
window.__ensureMlSandboxReady = async function __ensureMlSandboxReady(){
  if (window.__mlSandbox && window.__mlSandbox.ready) return window.__mlSandbox;
  const sb = window.__mlSandbox || (window.__mlSandbox = { ready: false, queue: Promise.resolve() });
  if (sb.readyPromise) return sb.readyPromise;

  sb.readyPromise = new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.width = '0'; iframe.height = '0';
    // 拡張内のサンドボックスHTML
    const src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('sandbox/sandbox.html')
      : 'sandbox/sandbox.html';
    iframe.src = src;
    document.body.appendChild(iframe);

    function onMsg(ev){
      try {
        if (ev.source === iframe.contentWindow && ev.data && ev.data.type === 'sandboxReady'){
          window.removeEventListener('message', onMsg);
          sb.iframe = iframe;
          sb.win = iframe.contentWindow;
          sb.ready = true;
          sb.queue = Promise.resolve();
          resolve(sb);
        }
      } catch(_) {}
    }
    window.addEventListener('message', onMsg);
  });
  return sb.readyPromise;
};

// サンドボックスでの推論を直列実行（reqId 不使用のため直列化で競合回避）
window.__predictInSandbox = async function __predictInSandbox(imageData, width, height){
  const sb = await window.__ensureMlSandboxReady();
  // 実行を直列化
  const run = () => new Promise((resolve) => {
    const onMsg = (ev) => {
      try {
        if (ev.source === sb.win && ev.data && ev.data.type === 'predictResult'){
          window.removeEventListener('message', onMsg);
          resolve(ev.data);
        }
      } catch(_) {}
    };
    window.addEventListener('message', onMsg);
    const modelUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('tfjs_multi_bounding_box_model_1/model.json')
      : 'tfjs_multi_bounding_box_model_1/model.json';
    try {
      // 転送（transferables）はブラウザ間での ImageData 構造化と干渉し得るため、常にクローンして安全に送る
      const clone = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      sb.win.postMessage({ type: 'predict', modelUrl, imageData: clone, canvasWidth: width, canvasHeight: height }, '*');
    } catch(_) { window.removeEventListener('message', onMsg); resolve({ ok:false, error: 'postMessage failed' }); }
  });
  sb.queue = sb.queue.then(() => run());
  return sb.queue;
};

// PDF.js ページを Canvas に描画して ML 反転（ボックス外）を適用し、paper に配置
window.convertPageToPng = async function convertPageToPng(page, viewport, paper){
  // Canvas 準備（整数サイズ推奨）
  const w = Math.max(1, Math.round(viewport.width));
  const h = Math.max(1, Math.round(viewport.height));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

  // PDF 描画
  try {
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
  } catch (e) {
    console.warn('page.render to canvas failed; fallback to plain invert', e);
  }

  // ImageData 取得（オリジナル解像度）
  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    console.warn('getImageData failed; fallback to CSS invert', e);
    // 画像としてそのまま配置して CSS invert で代替
    canvas.style.filter = 'invert(1)';
    paper.appendChild(canvas);
    return canvas;
  }

  // 転送最適化: 推論入力は長辺512px程度に縮小して送る
  let imgDataForModel = imgData;
  try {
    const maxSide = 512;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale < 1) {
      const sw = Math.max(1, Math.round(w * scale));
      const sh = Math.max(1, Math.round(h * scale));
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = sw; smallCanvas.height = sh;
      const sctx = smallCanvas.getContext('2d');
      sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(canvas, 0, 0, sw, sh);
      imgDataForModel = sctx.getImageData(0, 0, sw, sh);
    }
  } catch (e) {
    console.warn('downscale for model failed; using original imageData', e);
    imgDataForModel = imgData;
  }

  // クラシック画像処理で写真領域を検出（ボックス外のみ反転）
  let result;
  try {
    result = window.detectPhotoRegionsClassic(imgDataForModel, w, h);
  } catch (e) {
    console.warn('classic detection failed; fallback to full invert', e);
    result = { ok:false };
  }

  // 受け取ったボックス（オリジナル座標）を使って、元のキャンバス上で「ボックス外のみ反転」
  const applySelectiveInvert = (imgDataOriginal, boxesPx) => {
    try {
      const { data, width: W, height: H } = imgDataOriginal;
      const out = new Uint8ClampedArray(data); // コピー
      // ログ用: ボックス情報を整形
      const normBoxes = [];
      if (Array.isArray(boxesPx)) {
        let idx = 0;
        for (const b of boxesPx) {
          if (!b) continue;
          const x = Math.max(0, Math.min(W, Math.round(b.x)));
          const y = Math.max(0, Math.min(H, Math.round(b.y)));
          const bw = Math.max(0, Math.min(W - x, Math.round(b.w)));
          const bh = Math.max(0, Math.min(H - y, Math.round(b.h)));
          if (!(bw > 0 && bh > 0)) continue;
          normBoxes.push({ i: idx, x, y, w: bw, h: bh, area: bw * bh });
          idx++;
        }
      }
      // デバッグ出力（どこを反転させたか）
      try {
        const totalArea = W * H;
        const boxArea = normBoxes.reduce((s, r) => s + r.area, 0);
        const invertedArea = Math.max(0, totalArea - boxArea);
        console.groupCollapsed('[InvertDebug] selective invert (outside boxes)');
        console.log('Canvas (W x H):', W, 'x', H, 'total px:', totalArea);
        if (normBoxes.length) {
          console.table(normBoxes.map(r => ({ index: r.i, x: r.x, y: r.y, w: r.w, h: r.h, area: r.area })));
        } else {
          console.log('No boxes => full-area invert');
        }
        console.log('Approx inverted px:', invertedArea, `(${((invertedArea / (W*H)) * 100).toFixed(1)}%)`);
        console.groupEnd();
      } catch(_) {}
      // いったん全面を反転
      for (let i = 0; i < out.length; i += 4) {
        out[i] = 255 - out[i];
        out[i+1] = 255 - out[i+1];
        out[i+2] = 255 - out[i+2];
        // alphaは維持
      }
      // ボックス内は元画像を復元
      if (normBoxes.length) {
        for (const r of normBoxes) {
          const { x, y, w: bw, h: bh } = r;
          for (let row = 0; row < bh; row++) {
            const srcStart = ((y + row) * W + x) * 4;
            const len = bw * 4;
            out.set(data.subarray(srcStart, srcStart + len), srcStart);
          }
        }
      }
      const outImg = new ImageData(out, W, H);
      ctx.putImageData(outImg, 0, 0);
      return true;
    } catch (e) {
      console.warn('applySelectiveInvert failed', e);
      return false;
    }
  };

  if (result && result.ok) {
    const boxesPx = Array.isArray(result.boxes) ? result.boxes : (result.box ? [result.box] : []);
    if (!applySelectiveInvert(imgData, boxesPx)) {
      // 失敗時は全面反転
      try {
        const d = imgData.data;
        for (let i=0;i<d.length;i+=4){ const a=d[i+3]/255; if(a===0) continue; let r=d[i]/a,g=d[i+1]/a,b=d[i+2]/a; r=255-r; g=255-g; b=255-b; d[i]=Math.round(r*a); d[i+1]=Math.round(g*a); d[i+2]=Math.round(b*a); }
        ctx.putImageData(imgData, 0, 0);
        try { console.log('[InvertDebug] fallback: full invert (applySelectiveInvert failed)'); } catch(_) {}
      } catch(e){ canvas.style.filter = 'invert(1)'; }
    }
  } else {
    // フォールバック: 全反転
    try {
  try { console.warn('[InvertDebug] detection error detail:', result && result.error); } catch(_) {}
      const d = imgData.data;
      for (let i=0;i<d.length;i+=4){ const a=d[i+3]/255; if(a===0) continue; let r=d[i]/a,g=d[i+1]/a,b=d[i+2]/a; r=255-r; g=255-g; b=255-b; d[i]=Math.round(r*a); d[i+1]=Math.round(g*a); d[i+2]=Math.round(b*a); }
      ctx.putImageData(imgData, 0, 0);
      try { console.log('[InvertDebug] fallback: full invert (sandbox predict not ok)'); } catch(_) {}
    } catch(e){ canvas.style.filter = 'invert(1)'; }
  }

  paper.appendChild(canvas);
  try { console.log('クラシック検出の反転(ボックス外)を適用しました'); } catch(_) {}
  return canvas;
};
