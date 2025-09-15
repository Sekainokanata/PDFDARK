// viewer.js
// - Chrome-like toolbar / layout
// - SVG表示（pdf.js SVGGraphics）＋スマートテキストオーバーレイ
// - 画像の高品質反転処理
// - コピー権限チェック（コピー禁止なら overlay を作らない + コピーブロック）
// - 表示モードトグル（SVG優先 / オーバーレイ優先）
// - ズーム・Fit・ページ移動等の基本UIロジック
//
// 前提:
// - pdfjsLib が global にあること
// - startViewer() を呼べば動作します

async function startViewer() {
  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  const origContainer = document.getElementById('container');
  if (!file) {
    origContainer.textContent = 'No file specified.';
    return;
  }

  // fetch PDF bytes
  let resp;
  try {
    resp = await fetch(file);
    if (!resp.ok) throw new Error('Failed to fetch PDF: ' + resp.status);
  } catch (e) {
    origContainer.textContent = 'Fetch error: ' + e.message;
    return;
  }
  const arrayBuffer = await resp.arrayBuffer();

  // load pdf
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  // clear original container (we'll reparent into shell)
  origContainer.innerHTML = '';

  // ----------------------------
  // create Chrome-like UI (toolbar + pagesHolder)
  // ----------------------------
  (function setupShell() {
    const containerParent = origContainer.parentElement || document.body;

    const shell = document.createElement('div');
    shell.id = 'viewer-shell';
    shell.style.height = '100vh';
    shell.style.display = 'flex';
    shell.style.flexDirection = 'column';

    // toolbar placeholder (style mostly from existing CSS)
    const toolbar = document.createElement('div');
    toolbar.id = 'viewer-control-bar';
    Object.assign(toolbar.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: 'linear-gradient(#1f1f1f, #161616)',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.02) inset',
      color: '#e6e6e6',
      fontFamily: 'inherit'
    });

    // left group: prev / page input / next
    const leftGroup = document.createElement('div');
    leftGroup.className = 'viewer-toolbar-group';
    leftGroup.style.display = 'flex';
    leftGroup.style.gap = '6px';
    leftGroup.style.alignItems = 'center';

    const btnPrev = document.createElement('button'); btnPrev.className = 'viewer-tool-btn'; btnPrev.textContent = '◀';
    const pageInput = document.createElement('input'); pageInput.type = 'number'; pageInput.min = 1; pageInput.value = 1;
    pageInput.style.width = '64px'; pageInput.className = 'viewer-tool-btn';
    const btnNext = document.createElement('button'); btnNext.className = 'viewer-tool-btn'; btnNext.textContent = '▶';

    leftGroup.appendChild(btnPrev);
    leftGroup.appendChild(pageInput);
    leftGroup.appendChild(btnNext);

    // center group: zoom controls
    const centerGroup = document.createElement('div');
    centerGroup.className = 'viewer-toolbar-group';
    centerGroup.style.display = 'flex';
    centerGroup.style.gap = '6px';
    centerGroup.style.alignItems = 'center';

    const btnZoomOut = document.createElement('button'); btnZoomOut.className = 'viewer-tool-btn'; btnZoomOut.textContent = '-';
    const zoomVal = document.createElement('input'); zoomVal.id = 'zoom-value'; zoomVal.value = '100%';
    zoomVal.style.minWidth = '56px';
    const btnZoomIn = document.createElement('button'); btnZoomIn.className = 'viewer-tool-btn'; btnZoomIn.textContent = '+';
    const btnFitWidth = document.createElement('button'); btnFitWidth.className = 'viewer-tool-btn'; btnFitWidth.textContent = 'Fit Width';
    const btnFitPage = document.createElement('button'); btnFitPage.className = 'viewer-tool-btn'; btnFitPage.textContent = 'Fit Page';

    centerGroup.appendChild(btnZoomOut);
    centerGroup.appendChild(zoomVal);
    centerGroup.appendChild(btnZoomIn);
    centerGroup.appendChild(btnFitWidth);
    centerGroup.appendChild(btnFitPage);

    // right group: actions (download/print) + mode toggle (SVG/Overlay)
    const rightGroup = document.createElement('div');
    rightGroup.className = 'viewer-toolbar-group';
    rightGroup.style.marginLeft = 'auto';
    rightGroup.style.display = 'flex';
    rightGroup.style.gap = '6px';
    rightGroup.style.alignItems = 'center';

    const btnDownload = document.createElement('button'); btnDownload.className = 'viewer-tool-btn'; btnDownload.textContent = '↓ Download';
    const btnPrint = document.createElement('button'); btnPrint.className = 'viewer-tool-btn'; btnPrint.textContent = 'Print';

    // mode toggle (SVG優先 / オーバーレイ優先)
    const btnSvgMode = document.createElement('button'); btnSvgMode.className = 'viewer-tool-btn'; btnSvgMode.textContent = 'SVG優先';
    const btnOverlayMode = document.createElement('button'); btnOverlayMode.className = 'viewer-tool-btn'; btnOverlayMode.textContent = 'オーバーレイ優先';

    rightGroup.appendChild(btnDownload);
    rightGroup.appendChild(btnPrint);
    rightGroup.appendChild(btnSvgMode);
    rightGroup.appendChild(btnOverlayMode);

    toolbar.appendChild(leftGroup);
    toolbar.appendChild(centerGroup);
    toolbar.appendChild(rightGroup);

    // wrapper + pagesHolder
    const wrapper = document.createElement('div');
    wrapper.id = 'viewer-container-wrapper';
    Object.assign(wrapper.style, {
      flex: '1 1 auto',
      overflow: 'auto',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: '20px',
      background: '#2b2b2b'
    });

    const pagesHolder = document.createElement('div');
    pagesHolder.id = 'viewer-pages';
    pagesHolder.style.display = 'flex';
    pagesHolder.style.flexDirection = 'column';
    pagesHolder.style.gap = '20px';
    pagesHolder.style.alignItems = 'center';

    wrapper.appendChild(pagesHolder);
    shell.appendChild(toolbar);
    shell.appendChild(wrapper);

    // replace original container with shell, and keep origContainer for later debug/UI
    containerParent.replaceChild(shell, origContainer);

    // expose UI
    window.__viewer_ui = {
      shell, toolbar, wrapper, pagesHolder,
      btnPrev, btnNext, pageInput, btnZoomIn, btnZoomOut, zoomVal, btnFitWidth, btnFitPage, btnDownload, btnPrint,
      btnSvgMode, btnOverlayMode
    };
  })();

  // now alias containerRef to pagesHolder for appending pages
  const container = window.__viewer_ui.pagesHolder;

  // ----------------------------
  // permission detection (copy)
  // ----------------------------
  async function detectCopyPermission(pdfDoc) {
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
  }

  // ----------------------------
  // copy-block helpers
  // ----------------------------
  function installCopyBlockers(rootEl) {
    rootEl.style.userSelect = 'none';
    rootEl.style.webkitUserSelect = 'none';
    rootEl.style.MozUserSelect = 'none';
    function onCopy(e) { e.preventDefault(); try { e.clipboardData.setData('text/plain', ''); } catch (_) {} return false; }
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    const onContext = (e) => e.preventDefault();
    rootEl.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      rootEl.removeEventListener('contextmenu', onContext);
      rootEl.style.userSelect = '';
      rootEl.style.webkitUserSelect = '';
      rootEl.style.MozUserSelect = '';
    };
  }

  // ----------------------------
  // color / saturation / inversion helpers
  // ----------------------------
  function parseColor(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    if (str === 'none') return null;
    const hexMatch = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      let hex = hexMatch[1];
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const num = parseInt(hex, 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 };
    }
    const rgbMatch = str.match(/^rgba?\(([^)]+)\)$/);
    if (rgbMatch) {
      const parts = rgbMatch[1].split(',').map(s => s.trim());
      const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]);
      const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
      return { r, g, b, a };
    }
    const kw = { black: { r: 0, g: 0, b: 0, a: 1 }, white: { r: 255, g: 255, b: 255, a: 1 }, gray: { r: 128, g: 128, b: 128, a: 1 }, grey: { r: 128, g: 128, b: 128, a: 1 } };
    if (kw[str]) return kw[str];
    return null;
  }

  function srgbToLinearChannel(c) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function relativeLuminance(rgb) {
    const R = srgbToLinearChannel(rgb.r), G = srgbToLinearChannel(rgb.g), B = srgbToLinearChannel(rgb.b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }
  function pickForegroundForBackground(bgRgb) {
    const lum = relativeLuminance(bgRgb);
    return lum > 0.5 ? '#000000' : '#ffffff';
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  function isColored(rgb, options = {}) {
    if (!rgb) return false;
    const method = options.method || 'saturation';
    if (method === 'saturation') {
      const { s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const satThreshold = options.satThreshold ?? 0.15;
      return s >= satThreshold;
    }
    return false;
  }

  function gradientIsColored(gradElem, options = {}) {
    if (!gradElem) return false;
    const stops = gradElem.querySelectorAll('stop');
    if (!stops || stops.length === 0) return false;
    for (const stop of stops) {
      const sc = stop.getAttribute('stop-color') || (window.getComputedStyle ? window.getComputedStyle(stop).stopColor : null);
      const parsed = parseColor(sc);
      if (parsed && isColored(parsed, options)) return true;
    }
    return false;
  }

  function invertSvgColorsSmart(svg, options = {}) {
    const gradientMap = new Map();
    const gradients = svg.querySelectorAll('linearGradient, radialGradient');
    gradients.forEach(g => {
      const id = g.id;
      if (!id) return;
      const colored = gradientIsColored(g, options);
      gradientMap.set('#' + id, colored);
    });

    const selector = 'text, tspan, path, rect, circle, ellipse, line, polyline, polygon, g';
    const nodes = svg.querySelectorAll(selector);

    nodes.forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'image') return;

      let fillAttr = el.getAttribute('fill');
      let fillIsGradient = false;
      if (fillAttr && fillAttr.trim().startsWith('url(')) fillIsGradient = true;

      let fillColor = null;
      if (!fillIsGradient) {
        if (fillAttr && fillAttr !== 'currentColor' && fillAttr !== 'none') fillColor = parseColor(fillAttr);
        if (!fillColor) {
          const styleFill = el.style && el.style.fill;
          if (styleFill) fillColor = parseColor(styleFill);
        }
        if (!fillColor) {
          const cs = window.getComputedStyle(el);
          if (cs && cs.fill) fillColor = parseColor(cs.fill);
        }
      } else {
        const urlRef = fillAttr.trim();
        const gradColored = gradientMap.has(urlRef) ? gradientMap.get(urlRef) : true;
        if (gradColored) fillColor = { keep: true };
        else fillColor = null;
      }

      let strokeAttr = el.getAttribute('stroke');
      let strokeColor = null;
      if (strokeAttr && strokeAttr !== 'currentColor' && strokeAttr !== 'none') strokeColor = parseColor(strokeAttr);
      if (!strokeColor) {
        const styleStroke = el.style && el.style.stroke;
        if (styleStroke) strokeColor = parseColor(styleStroke);
      }
      if (!strokeColor) {
        const cs = window.getComputedStyle(el);
        if (cs && cs.stroke) strokeColor = parseColor(cs.stroke);
      }

      if (fillColor && fillColor.keep) {
        // keep colored gradient
      } else {
        if (fillColor) {
          if (!isColored(fillColor, options)) {
            const newFill = pickForegroundForBackground(fillColor);
            el.setAttribute('fill', newFill);
          }
        } else if (fillIsGradient) {
          const urlRef = el.getAttribute('fill').trim();
          const gradId = urlRef.replace(/^url\(/, '').replace(/\)$/, '');
          const gradElem = svg.querySelector(gradId);
          if (gradElem) {
            const stops = gradElem.querySelectorAll('stop');
            stops.forEach(stop => {
              const sc = stop.getAttribute('stop-color') || (window.getComputedStyle ? window.getComputedStyle(stop).stopColor : null);
              const parsed = parseColor(sc);
              if (parsed && !isColored(parsed, options)) {
                const newCol = pickForegroundForBackground(parsed);
                stop.setAttribute('stop-color', newCol);
              }
            });
          }
        }
      }

      if (strokeColor) {
        if (!isColored(strokeColor, options)) {
          const newStroke = pickForegroundForBackground(strokeColor);
          el.setAttribute('stroke', newStroke);
        }
      }
    });

    svg.style.background = '#000';
  }

  // ----------------------------
  // image processing (high quality invert)
  // ----------------------------
  const objectUrlMap = new Map();
  async function processSvgImagesHighQuality(svgRoot, options = {}) {
    const imageSatThreshold = options.imageSatThreshold ?? 0.08;
    const sampleMax = options.sampleMax ?? 200;
    const sampleStep = options.sampleStep ?? 6;
    const maxFullSizeForInvert = options.maxFullSizeForInvert ?? 2500;

    const images = Array.from(svgRoot.querySelectorAll('image'));
    for (const imgEl of images) {
      try {
        let href = imgEl.getAttribute('href') || imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || imgEl.getAttribute('xlink:href');
        if (!href) continue;

        let blob;
        try {
          const respImg = await fetch(href);
          if (!respImg.ok) { console.warn('image fetch failed', href, respImg.status); continue; }
          blob = await respImg.blob();
        } catch (e) {
          console.warn('image fetch error', e, href);
          continue;
        }

        let bitmap;
        try {
          const tmpBitmap = await createImageBitmap(blob);
          const sampScale = Math.min(1, sampleMax / Math.max(tmpBitmap.width || 1, tmpBitmap.height || 1));
          const sampW = Math.max(1, Math.floor((tmpBitmap.width || 1) * sampScale));
          const sampH = Math.max(1, Math.floor((tmpBitmap.height || 1) * sampScale));
          bitmap = await createImageBitmap(tmpBitmap, { resizeWidth: sampW, resizeHeight: sampH, resizeQuality: 'high' });
          tmpBitmap.close?.();
        } catch (e) {
          console.warn('createImageBitmap(sampling) failed', e);
          continue;
        }

        const sW = bitmap.width, sH = bitmap.height;
        const sampCanvas = document.createElement('canvas');
        sampCanvas.width = sW; sampCanvas.height = sH;
        const sctx = sampCanvas.getContext('2d');
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(bitmap, 0, 0, sW, sH);

        let imgData;
        try {
          imgData = sctx.getImageData(0, 0, sW, sH);
        } catch (e) {
          console.warn('getImageData failed on sample (tainted?), skipping image', e);
          bitmap.close?.();
          continue;
        }
        const data = imgData.data;
        let sumSat2 = 0, cnt2 = 0;
        for (let y = 0; y < sH; y += sampleStep) {
          for (let x = 0; x < sW; x += sampleStep) {
            const i = (y * sW + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            const rn = r/255, gn = g/255, bn = b/255;
            const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn);
            const l = (mx + mn)/2;
            const s = (mx === mn) ? 0 : (l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
            sumSat2 += s;
            cnt2++;
          }
        }
        const avgSat = cnt2 > 0 ? (sumSat2 / cnt2) : 0;
        bitmap.close?.();

        if (avgSat >= imageSatThreshold) {
          const prev = objectUrlMap.get(imgEl);
          if (prev && prev.url) {
            if (prev.revokeOnNext && prev.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
            objectUrlMap.delete(imgEl);
          }
          continue;
        }

        let fullBitmap;
        try {
          const proto = await createImageBitmap(blob);
          const fullW = proto.width || 1, fullH = proto.height || 1;
          if (Math.max(fullW, fullH) > maxFullSizeForInvert) {
            imgEl.style.filter = 'invert(1)';
            proto.close?.();
            continue;
          }
          fullBitmap = await createImageBitmap(proto);
          proto.close?.();
        } catch (e) {
          console.warn('createImageBitmap(full) failed, falling back to CSS filter', e);
          imgEl.style.filter = 'invert(1)';
          continue;
        }

        const fW = fullBitmap.width, fH = fullBitmap.height;
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = fW; fullCanvas.height = fH;
        const fctx = fullCanvas.getContext('2d');
        fctx.imageSmoothingEnabled = true;
        fctx.imageSmoothingQuality = 'high';
        fctx.drawImage(fullBitmap, 0, 0, fW, fH);

        let fullImgData;
        try {
          fullImgData = fctx.getImageData(0, 0, fW, fH);
        } catch (e) {
          console.warn('getImageData(full) failed (tainted?), falling back to CSS filter', e);
          fullBitmap.close?.();
          imgEl.style.filter = 'invert(1)';
          continue;
        }
        const fdata = fullImgData.data;
        for (let i = 0; i < fdata.length; i += 4) {
          const a = fdata[i+3] / 255;
          if (a === 0) continue;
          let r = fdata[i] / a;
          let g = fdata[i+1] / a;
          let b = fdata[i+2] / a;
          r = 255 - r; g = 255 - g; b = 255 - b;
          fdata[i]   = Math.round(r * a);
          fdata[i+1] = Math.round(g * a);
          fdata[i+2] = Math.round(b * a);
        }
        fctx.putImageData(fullImgData, 0, 0);

        try {
          const blobOut = await new Promise((resolve) => fullCanvas.toBlob(resolve, 'image/png'));
          if (!blobOut) throw new Error('toBlob returned null');
          const objUrl = URL.createObjectURL(blobOut);
          const prev = objectUrlMap.get(imgEl);
          if (prev && prev.url && prev.revokeOnNext && prev.url.startsWith('blob:')) {
            URL.revokeObjectURL(prev.url);
          }
          imgEl.setAttribute('href', objUrl);
          imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', objUrl);
          objectUrlMap.set(imgEl, { url: objUrl, revokeOnNext: true });
        } catch (e) {
          console.warn('toBlob/createObjectURL failed, fallback to dataURL', e);
          try {
            const dataUrl = fullCanvas.toDataURL('image/png');
            imgEl.setAttribute('href', dataUrl);
            imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
            objectUrlMap.set(imgEl, { url: null, revokeOnNext: false });
          } catch (e2) {
            console.warn('fallback toDataURL failed', e2);
            imgEl.style.filter = 'invert(1)';
          }
        } finally {
          fullBitmap.close?.();
        }
      } catch (err) {
        console.warn('processSvgImagesHighQuality error', err);
        continue;
      }
    }
  }

  // ----------------------------
  // text overlay helpers (improved)
  // ----------------------------
  function looksGoodTextContent(tc) {
    if (!tc || !tc.items || tc.items.length === 0) return false;
    const sample = tc.items.slice(0, 20).map(i => i.str).join('');
    return /[0-9A-Za-z\u3000-\u30FF\u4E00-\u9FFF]/.test(sample);
  }

  function multiplyTransform(a, b) {
    return [
      a[0] * b[0] + a[1] * b[2],
      a[0] * b[1] + a[1] * b[3],
      a[2] * b[0] + a[3] * b[2],
      a[2] * b[1] + a[3] * b[3],
      a[4] * b[0] + a[5] * b[2] + b[4],
      a[4] * b[1] + a[5] * b[3] + b[5]
    ];
  }

  function renderTextLayerFromTextContent(textContent, viewport, pageDiv, options = {}) {
    options = Object.assign({ forceVisible: false, makeTransparentIfSvgTextExists: true, color: '#fff', zIndex: 3000 }, options);

    if (getComputedStyle(pageDiv).position === 'static') pageDiv.style.position = 'relative';

    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    Object.assign(textLayer.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: pageDiv.style.width,
      height: pageDiv.style.height,
      pointerEvents: 'auto',
      overflow: 'visible',
      zIndex: String(options.zIndex),
      background: 'transparent',
      mixBlendMode: 'normal'
    });

    pageDiv.appendChild(textLayer);

    const vtm = viewport.transform;
    textContent.items.forEach(item => {
      let itemTransform = item.transform || [1,0,0,1,0,0];
      let tx;
      try {
        if (pdfjsLib && pdfjsLib.Util && typeof pdfjsLib.Util.transform === 'function') {
          tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        } else {
          tx = multiplyTransform(vtm, itemTransform);
        }
      } catch (e) {
        tx = multiplyTransform(vtm, itemTransform);
      }

      const left = tx[4];
      const top = tx[5];
      const fontHeight = Math.hypot(tx[1], tx[3]) || (item.height || 12);

      const span = document.createElement('span');
      span.textContent = item.str;
      Object.assign(span.style, {
        position: 'absolute',
        left: `${left}px`,
        top: `${top - fontHeight}px`,
        fontSize: `${fontHeight}px`,
        whiteSpace: 'pre',
        lineHeight: '1',
        transformOrigin: '0 0',
        pointerEvents: 'auto',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        color: options.color,
        WebkitTextFillColor: options.color
      });
      textLayer.appendChild(span);
    });

    const svgElem = pageDiv.querySelector('svg');
    const hasSvgText = !!svgElem && !!svgElem.querySelector('text, tspan');
    const shouldBeVisible = options.forceVisible || (!hasSvgText) || !options.makeTransparentIfSvgTextExists;

    textLayer.querySelectorAll('span').forEach(s => {
      if (shouldBeVisible) {
        s.style.color = options.color;
        s.style.WebkitTextFillColor = options.color;
      } else {
        s.style.color = 'transparent';
        s.style.WebkitTextFillColor = 'transparent';
        s.style.pointerEvents = 'auto';
      }
    });

    if (svgElem) {
      const svgStyle = svgElem.style;
      if (!svgStyle.position || svgStyle.position === 'static') svgStyle.position = 'absolute';
      try {
        svgStyle.zIndex = String((parseInt(svgStyle.zIndex) || 0) - 1);
      } catch (e) {
        svgStyle.zIndex = '1';
      }
    }

    return textLayer;
  }

  // ----------------------------
  // toolbar wiring: zoom/navigation/download/print/mode
  // ----------------------------
  (function wireToolbarLogic() {
    const ui = window.__viewer_ui;
    if (!ui) return;

    let currentScale = 1.0;

    function applyScaleToAllPages(scale) {
      const pages = ui.pagesHolder.querySelectorAll('.page');
      pages.forEach(pageDiv => {
        // set transform and also adjust the layout size so container scroll works properly
        pageDiv.style.transform = `scale(${scale})`;
        const baseW = parseFloat(pageDiv.getAttribute('data-base-width') || pageDiv.style.width || pageDiv.clientWidth);
        const baseH = parseFloat(pageDiv.getAttribute('data-base-height') || pageDiv.style.height || pageDiv.clientHeight);
        // width/height of outer (so scroll area accounts for scaled size)
        pageDiv.style.width = (baseW * scale) + 'px';
        pageDiv.style.height = (baseH * scale) + 'px';
        // additionally ensure the inner paper keeps correct size (optional)
        const paper = pageDiv.querySelector('.paper');
        if (paper) {
          paper.style.width = '100%';
          paper.style.height = '100%';
        }
      });
      currentScale = scale;
      ui.zoomVal.value = Math.round(scale * 100) + '%';
    }


    function fitWidth() {
      const viewportWidth = ui.wrapper.clientWidth - 40;
      const first = ui.pagesHolder.querySelector('.page');
      if (!first) return;
      const baseW = parseFloat(first.getAttribute('data-base-width') || first.style.width || first.clientWidth);
      const targetScale = Math.max(0.1, viewportWidth / baseW);
      applyScaleToAllPages(targetScale);
    }
    function fitPage() {
      const viewportHeight = ui.wrapper.clientHeight - ui.toolbar.clientHeight - 40;
      const first = ui.pagesHolder.querySelector('.page');
      if (!first) return;
      const baseH = parseFloat(first.getAttribute('data-base-height') || first.style.height || first.clientHeight);
      const targetScale = Math.max(0.1, viewportHeight / baseH);
      applyScaleToAllPages(targetScale);
    }

    function goToPage(n) {
      const pages = Array.from(ui.pagesHolder.querySelectorAll('.page'));
      if (!pages.length) return;
      const idx = Math.min(Math.max(1, n), pages.length);
      const target = pages[idx - 1];
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ui.pageInput.value = idx;
    }

    ui.btnZoomIn.addEventListener('click', () => { applyScaleToAllPages(Math.min(5, currentScale + 0.1)); });
    ui.btnZoomOut.addEventListener('click', () => { applyScaleToAllPages(Math.max(0.1, currentScale - 0.1)); });
    ui.btnFitWidth.addEventListener('click', fitWidth);
    ui.btnFitPage.addEventListener('click', fitPage);

    ui.btnNext.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) + 1); });
    ui.btnPrev.addEventListener('click', () => { goToPage(parseInt(ui.pageInput.value||'1',10) - 1); });
    ui.pageInput.addEventListener('change', () => { goToPage(parseInt(ui.pageInput.value||'1',10)); });

    ui.btnDownload.addEventListener('click', async () => {
      const a = document.createElement('a');
      a.href = file;
      a.download = file.split('/').pop() || 'document.pdf';
      a.click();
    });
    ui.btnPrint.addEventListener('click', () => window.print());

    ui.zoomVal.addEventListener('change', () => {
      const raw = ui.zoomVal.value.trim().replace('%','');
      const n = parseFloat(raw);
      if (!isFinite(n) || n <= 0) {
        ui.zoomVal.value = Math.round(currentScale * 100) + '%';
        return;
      }
      applyScaleToAllPages(Math.max(0.1, n / 100));
    });

    // mode toggle
    const STORAGE_KEY = 'viewerTextMode';
    function saveMode(m) { try { localStorage.setItem(STORAGE_KEY, m); } catch(_) {} }
    function loadMode() { try { return localStorage.getItem(STORAGE_KEY) || 'svg'; } catch(_) { return 'svg'; } }

    function applyModeToAllPages(mode) {
      const pages = ui.pagesHolder.querySelectorAll('.page');
      pages.forEach(pageDiv => {
        const svgElem = pageDiv.querySelector('svg');
        const textLayer = pageDiv.querySelector('.textLayer');

        if (mode === 'svg') {
          if (svgElem) {
            svgElem.querySelectorAll('text, tspan').forEach(t => {
              t.style.visibility = '';
              if (t.hasAttribute('data-original-fill')) {
                t.setAttribute('fill', t.getAttribute('data-original-fill'));
              }
            });
          }
          if (textLayer) {
            textLayer.querySelectorAll('span').forEach(s => {
              s.style.color = 'transparent';
              s.style.WebkitTextFillColor = 'transparent';
            });
            textLayer.style.pointerEvents = 'auto';
          }
        } else {
          if (svgElem) {
            svgElem.querySelectorAll('text, tspan').forEach(t => {
              if (!t.hasAttribute('data-original-fill')) {
                const f = t.getAttribute('fill');
                if (f) t.setAttribute('data-original-fill', f);
              }
              t.style.visibility = 'hidden';
            });
          }
          if (textLayer) {
            textLayer.querySelectorAll('span').forEach(s => {
              s.style.color = '#fff';
              s.style.WebkitTextFillColor = '#fff';
            });
            textLayer.style.zIndex = '3000';
            textLayer.style.pointerEvents = 'auto';
          }
        }
      });
    }

    // initialize mode buttons
    function updateButtons(mode) {
      if (mode === 'overlay') {
        ui.btnOverlayMode.style.background = '#0a84ff';
        ui.btnSvgMode.style.background = '#222';
      } else {
        ui.btnSvgMode.style.background = '#0a84ff';
        ui.btnOverlayMode.style.background = '#222';
      }
    }
    const initialMode = loadMode();
    updateButtons(initialMode);
    applyModeToAllPages(initialMode);

    ui.btnSvgMode.addEventListener('click', () => { saveMode('svg'); updateButtons('svg'); applyModeToAllPages('svg'); });
    ui.btnOverlayMode.addEventListener('click', () => { saveMode('overlay'); updateButtons('overlay'); applyModeToAllPages('overlay'); });

    // expose some utilities
    window.__viewer_applyScaleToAllPages = applyScaleToAllPages;
    window.__viewer_goToPage = goToPage;
    window.__viewer_applyMode = applyModeToAllPages;

  })();

  // ----------------------------
  // main render loop
  // ----------------------------
  const permInfo = await detectCopyPermission(pdf);
  const allowCopy = !!permInfo.canCopy;
  console.log('PDF permission raw:', permInfo.rawPerms, 'allowCopy:', allowCopy);

  let removeCopyBlockers = null;
  if (!allowCopy) {
    removeCopyBlockers = installCopyBlockers(container);
    const warn = document.createElement('div');
    warn.textContent = 'このPDFはコピーが制限されています — コピーは無効化します。';
    warn.style.color = '#ffcc00';
    warn.style.padding = '6px';
    warn.style.fontSize = '13px';
    origContainer.parentElement?.insertBefore(warn, origContainer);
  }

  // current UI mode
  const curMode = (function(){ try { return localStorage.getItem('viewerTextMode') || 'svg'; } catch(_) { return 'svg'; } })();

  for (let p = 1; p <= pdf.numPages; p++) {
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const opList = await page.getOperatorList();

      const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
      const svg = await svgGfx.getSVG(opList, viewport);

      // create page outer + inner paper wrapper
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.setAttribute('data-base-width', viewport.width);
      pageDiv.setAttribute('data-base-height', viewport.height);

      // outer page: width/height represent the paper size INCLUDING padding area
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';
      pageDiv.style.transformOrigin = '0 0';
      pageDiv.style.overflow = 'visible';

      // inner paper element that holds SVG (paper is the visible white sheet)
      const paper = document.createElement('div');
      paper.className = 'paper';
      paper.style.width = '100%';
      paper.style.height = '100%';
      paper.appendChild(svg);

      // append
      pageDiv.appendChild(paper);
      container.appendChild(pageDiv);

      // footer (if you still want it)
      const footer = document.createElement('div');
      footer.className = 'page-footer';
      footer.textContent = `Page ${p} / ${pdf.numPages}`;
      pageDiv.appendChild(footer);


      container.appendChild(pageDiv);

      // color inversion for SVG elements
      invertSvgColorsSmart(svg, { satThreshold: 0.15 });

      // try to get textContent
      let textContent = null;
      try {
        textContent = await page.getTextContent();
      } catch (e) {
        console.warn('getTextContent failed for page', p, e);
        textContent = null;
      }

      if (allowCopy && looksGoodTextContent(textContent)) {
        const wantForceVisible = (curMode === 'overlay');
        renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: true, color: '#fff' });

        if (wantForceVisible) {
          const svgElem = pageDiv.querySelector('svg');
          if (svgElem) {
            svgElem.querySelectorAll('text, tspan').forEach(t => {
              if (!t.hasAttribute('data-original-fill')) {
                const f = t.getAttribute('fill');
                if (f) t.setAttribute('data-original-fill', f);
              }
              t.style.visibility = 'hidden';
            });
          }
        }
      }

      // process images (may be slow on many images)
      await processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 });

    } catch (err) {
      console.error('Error rendering page', p, err);
      const errDiv = document.createElement('div');
      errDiv.textContent = `Error rendering page ${p}: ${err.message || err}`;
      container.appendChild(errDiv);
    }
  }

  // initial layout/scale: fit width by default
  try { window.__viewer_applyScaleToAllPages(1.0); window.__viewer_applyMode(curMode); } catch (e) {}

  // cleanup helper
  window.viewerCleanup = () => {
    if (removeCopyBlockers) removeCopyBlockers();
    for (const v of objectUrlMap.values()) {
      if (v && v.url && v.url.startsWith('blob:')) URL.revokeObjectURL(v.url);
    }
    objectUrlMap.clear();
  };

  window.viewerPdf = pdf;
  window.startViewer = startViewer; // idempotent export

  // scroll to top
  window.scrollTo(0, 0);
}

// export
window.startViewer = startViewer;
