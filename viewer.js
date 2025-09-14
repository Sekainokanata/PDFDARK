// viewer.js (高品質画像反転フロー組み込み済み)
// 前提: pdfjsLib が global に存在すること、viewer-run.js で workerSrc を設定しておくこと

async function startViewer() {
  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  if (!file) {
    document.getElementById('container').textContent = 'No file specified.';
    return;
  }

  // fetch PDF
  let resp;
  try {
    resp = await fetch(file);
    if (!resp.ok) throw new Error('Failed to fetch PDF: ' + resp.status);
  } catch (e) {
    document.getElementById('container').textContent = 'Fetch error: ' + e.message;
    return;
  }
  const arrayBuffer = await resp.arrayBuffer();

  // load doc
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const container = document.getElementById('container');
  container.innerHTML = '';

  // ----------------------------
  // ヘルパー関数群（parse / 色判定 / SVG反転）
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
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
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
    const R = srgbToLinearChannel(rgb.r);
    const G = srgbToLinearChannel(rgb.g);
    const B = srgbToLinearChannel(rgb.b);
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
        if (gradColored) {
          fillColor = { keep: true };
        } else {
          fillColor = null;
        }
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
        // nothing
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
  // 高品質画像反転フロー
  // - 判定は縮小サンプルで軽く
  // - 反転は可能なら元解像度で（アンプレマルチ→反転→再マルチ）
  // - 出力は toBlob + createObjectURL（メモリ効率よし）
  // ----------------------------
  const objectUrlMap = new Map(); // imgEl -> { url, revokeOnNext }

  async function processSvgImagesHighQuality(svgRoot, options = {}) {
    const imageSatThreshold = options.imageSatThreshold ?? 0.08;
    const sampleMax = options.sampleMax ?? 200; // サンプル用最大幅（小さめでサンプリング）
    const sampleStep = options.sampleStep ?? 6;
    const maxFullSizeForInvert = options.maxFullSizeForInvert ?? 2500; // フル処理する最大辺（調整推奨）

    const images = Array.from(svgRoot.querySelectorAll('image'));
    for (const imgEl of images) {
      try {
        // href 取得（xlink 対応）
        let href = imgEl.getAttribute('href') || imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || imgEl.getAttribute('xlink:href');
        if (!href) continue;

        // fetch blob (data: も fetch で OK)
        let blob;
        try {
          const respImg = await fetch(href);
          if (!respImg.ok) { console.warn('image fetch failed', href, respImg.status); continue; }
          blob = await respImg.blob();
        } catch (e) {
          console.warn('image fetch error', e, href);
          continue;
        }

        // createImageBitmap（縮小オプションを使って高品質にリサイズ可能）
        let bitmap;
        try {
          // サンプリング用に縮小ビットマップを作る（高速）
          // まず簡易 bitmap で元サイズ確認
          const tmpBitmap = await createImageBitmap(blob);
          const sampScale = Math.min(1, sampleMax / Math.max(tmpBitmap.width || 1, tmpBitmap.height || 1));
          const sampW = Math.max(1, Math.floor((tmpBitmap.width || 1) * sampScale));
          const sampH = Math.max(1, Math.floor((tmpBitmap.height || 1) * sampScale));
          // 高品質リサイズを使って縮小 bitmap を作る（ブラウザに任せる）
          bitmap = await createImageBitmap(tmpBitmap, { resizeWidth: sampW, resizeHeight: sampH, resizeQuality: 'high' });
          tmpBitmap.close?.();
        } catch (e) {
          console.warn('createImageBitmap(sampling) failed', e);
          continue;
        }

        // サンプリングして平均彩度を計算
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
        let count = 0, sumSat = 0;
        for (let y = 0; y < sH; y += sampleStep) {
          for (let x = 0; x < sW; x += sampleStep) {
            const i = (y * sW + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            const rn = r/255, gn = g/255, bn = b/255;
            const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn);
            const l = (mx + mn)/2;
            const s = (mx === mn) ? 0 : (l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
            sumSat += s;
            count++;
          }
        }
        const avgSat = count > 0 ? (sumSat / count) : 0;
        bitmap.close?.();

        // 色付きなら CSS filter 適用の方が軽い（今回は「無彩色のみ反転」が目的）
        if (avgSat >= imageSatThreshold) {
          // カラフル画像：維持（可能なら以前の objectURL を revoke）
          const prev = objectUrlMap.get(imgEl);
          if (prev && prev.url) {
            // もし以前に object URL を作って置き換えていたら revoke
            if (prev.revokeOnNext && prev.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
            objectUrlMap.delete(imgEl);
          }
          continue;
        }

        // 無彩色判定：**反転処理を元解像度で行う**
        // まず元 bitmap を作る（ただし巨大すぎる場合は上限を設ける）
        let fullBitmap;
        try {
          // 元サイズ取得（再 createImageBitmap）
          const proto = await createImageBitmap(blob);
          const fullW = proto.width || 1, fullH = proto.height || 1;
          // 制限を超える場合はフルサイズ反転を避ける（代わりに CSS filter を使うか縮小反転）
          if (Math.max(fullW, fullH) > maxFullSizeForInvert) {
            // 重いので CSS filter を適用して代替（低コスト・見た目ほぼ同等）
            imgEl.style.filter = 'invert(1)';
            proto.close?.();
            continue;
          }
          // createImageBitmap でフルサイズ bitmap（高品質）
          fullBitmap = await createImageBitmap(proto);
          proto.close?.();
        } catch (e) {
          console.warn('createImageBitmap(full) failed, falling back to CSS filter', e);
          imgEl.style.filter = 'invert(1)';
          continue;
        }

        // フルサイズ canvas に描画して反転（アンプレマルチ→反転→再マルチ）
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
        // アンプレマルチ処理 + 反転 + 再マルチ
        for (let i = 0; i < fdata.length; i += 4) {
          const a = fdata[i+3] / 255;
          if (a === 0) continue;
          // アンプレマルチ (素材がプレマルチなら分離)
          let r = fdata[i] / a;
          let g = fdata[i+1] / a;
          let b = fdata[i+2] / a;
          // 反転（0..255範囲）
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
          // 再プレマルチ
          fdata[i]   = Math.round(r * a);
          fdata[i+1] = Math.round(g * a);
          fdata[i+2] = Math.round(b * a);
          // alpha はそのまま
        }
        fctx.putImageData(fullImgData, 0, 0);

        // toBlob -> objectURL にして置換（メモリ効率良）
        try {
          const blobOut = await new Promise((resolve) => fullCanvas.toBlob(resolve, 'image/png'));
          if (!blobOut) throw new Error('toBlob returned null');
          const objUrl = URL.createObjectURL(blobOut);
          // revoke old url if we created one before
          const prev = objectUrlMap.get(imgEl);
          if (prev && prev.url && prev.revokeOnNext && prev.url.startsWith('blob:')) {
            URL.revokeObjectURL(prev.url);
          }
          // set new href (both href & xlink)
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
    } // images loop
  } // processSvgImagesHighQuality

  // ----------------------------
  // ページ描画ループ
  // ----------------------------
  for (let p = 1; p <= pdf.numPages; p++) {
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const opList = await page.getOperatorList();

      const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
      const svg = await svgGfx.getSVG(opList, viewport);

      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';
      pageDiv.appendChild(svg);
      container.appendChild(pageDiv);

      // テキスト/パスのスマート反転
      invertSvgColorsSmart(svg, { satThreshold: 0.15 });

      // 画像を高品質で処理（重いので await）
      await processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 });

      //////テキスト用デバッガー
        const textContent = await page.getTextContent();
        console.log('Text content items sample:', textContent.items.slice(0,10).map(i => i.str));
        function looksGood(tc) {
          const sample = tc.items.slice(0,20).map(i => i.str).join('');
          // 簡易判定: 英数字or日本語の文字が含まれるか
          return /[0-9A-Za-z\u3000-\u30FF\u4E00-\u9FFF]/.test(sample);
        }
        console.log('looksGood:', looksGood(textContent));

      //////
      
    } catch (err) {
      console.error('Error rendering page', p, err);
      const errDiv = document.createElement('div');
      errDiv.textContent = `Error rendering page ${p}: ${err.message || err}`;
      container.appendChild(errDiv);
    }
    
  }

  // スクロールトップ
  window.scrollTo(0, 0);
}

// export
window.startViewer = startViewer;
