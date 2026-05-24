// text-layer.js
// テキストレイヤーの生成と配置（PDF.jsのテキストコンテンツからHTML spanを生成）

window.renderTextLayerFromTextContent = function renderTextLayerFromTextContent(textContent, viewport, pageDiv, options = {}) {
  options = Object.assign({ forceVisible: false, makeTransparentIfSvgTextExists: true, color: '#E0E0E0', zIndex: 3000, allowCopy: false }, options);
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
      // 表示モード: 色を設定（allowCopy は選択可否のみを制御）
      s.style.color = options.color; s.style.WebkitTextFillColor = options.color;
      s.style.pointerEvents = options.allowCopy ? 'auto' : 'none';
      s.style.userSelect = options.allowCopy ? 'text' : 'none';
      s.style.WebkitUserSelect = options.allowCopy ? 'text' : 'none';
      s.style.MozUserSelect = options.allowCopy ? 'text' : 'none';
      s.style.msUserSelect = options.allowCopy ? 'text' : 'none';
      s.removeAttribute('aria-hidden');
    } else {
      // 非表示モード: 透明（allowCopy 問わず選択不可）
      s.style.color = 'transparent'; s.style.WebkitTextFillColor = 'transparent';
      s.style.pointerEvents = 'none';
      s.style.userSelect = 'none';
      s.style.WebkitUserSelect = 'none';
      s.style.MozUserSelect = 'none';
      s.style.msUserSelect = 'none';
      s.setAttribute('aria-hidden', 'true');
    }
  });
  return textLayer;
};
