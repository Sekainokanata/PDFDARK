// viewer.js
// 必須: pdf.js (UMD) を viewer.html で先に読み込んでおくこと。
// Expects: pdfjsLib global exists, viewer-run.js will call startViewer().

async function startViewer() {
  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  if (!file) {
    document.getElementById('container').textContent = 'No file specified.';
    return;
  }

  // fetch PDF (拡張の host_permissions が必要)
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
  // ヘルパー関数群
  // ----------------------------

  // parseColor: '#fff', '#ffffff', 'rgb(...)', 'rgba(...)', 'black','white' を扱う
  function parseColor(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    if (str === 'none') return null;
    // hex
    const hexMatch = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      let hex = hexMatch[1];
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const num = parseInt(hex, 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 };
    }
    // rgb(a)
    const rgbMatch = str.match(/^rgba?\(([^)]+)\)$/);
    if (rgbMatch) {
      const parts = rgbMatch[1].split(',').map(s => s.trim());
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
      return { r, g, b, a };
    }
    // keywords (最小限)
    const kw = {
      black: { r: 0, g: 0, b: 0, a: 1 },
      white: { r: 255, g: 255, b: 255, a: 1 },
      gray: { r: 128, g: 128, b: 128, a: 1 },
      grey: { r: 128, g: 128, b: 128, a: 1 }
    };
    if (kw[str]) return kw[str];
    // それ以外（currentColor, url(...), gradientなど）は null を返す（処理で補う）
    return null;
  }

  // sRGB -> linear conversion for luminance
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

  // rgb -> hsl (for saturation)
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

  // isColored: 彩度ベース判定（デフォルト閾値 satThreshold = 0.15）
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

  // グラデーション（stop）を見て「色付きか」を判定
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

  // スマートな SVG 色反転（テキストやパスを対象、グラデはstop単位で判断）
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

      // fill の判定
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

      // stroke の判定
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

      // 適用ルール
      if (fillColor && fillColor.keep) {
        // グラデが色付きなので何もしない
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

    // SVG 全体の背景を黒に
    svg.style.background = '#000';
  }

  // ----------------------------
  // 画像処理：低彩度画像は反転する
  // ----------------------------
  // options:
  //  imageSatThreshold: 彩度閾値（例 0.08）
  //  sampleStep: サンプリング間隔（大きいほど軽い）
  //  maxSize: キャンバス最大辺サイズ（縮小して処理）
  async function processSvgImages(svgRoot, options = {}) {
    const imageSatThreshold = options.imageSatThreshold ?? 0.08;
    const sampleStep = options.sampleStep ?? 6;
    const maxSize = options.maxSize ?? 800;

    const images = Array.from(svgRoot.querySelectorAll('image'));
    for (const imgEl of images) {
      try {
        let href = imgEl.getAttribute('href') || imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || imgEl.getAttribute('xlink:href');
        if (!href) continue;

        // fetch blob (data: も fetch で処理できる)
        let blob;
        try {
          const respImg = await fetch(href);
          if (!respImg.ok) { console.warn('image fetch failed', href, respImg.status); continue; }
          blob = await respImg.blob();
        } catch (e) {
          console.warn('image fetch error', e, href);
          continue;
        }

        // createImageBitmap で取り扱い
        let bitmap;
        try {
          bitmap = await createImageBitmap(blob);
        } catch (e) {
          console.warn('createImageBitmap failed (CORS/format?)', e);
          continue;
        }

        // 縮小してキャンバスに描画
        const scale = Math.min(1, maxSize / Math.max(bitmap.width || 1, bitmap.height || 1));
        const w = Math.max(1, Math.floor((bitmap.width || 1) * scale));
        const h = Math.max(1, Math.floor((bitmap.height || 1) * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, w, h);

        // getImageData（CORSでtaintedの可能性あり）
        let imgData;
        try {
          imgData = ctx.getImageData(0, 0, w, h);
        } catch (e) {
          console.warn('getImageData failed (tainted canvas?), skipping image:', e);
          bitmap.close?.();
          continue;
        }
        const data = imgData.data;
        let count = 0, sumSat = 0;
        for (let y = 0; y < h; y += sampleStep) {
          for (let x = 0; x < w; x += sampleStep) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const s = (() => {
              const rn = r / 255, gn = g / 255, bn = b / 255;
              const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn);
              const l = (mx + mn) / 2;
              if (mx === mn) return 0;
              const d = mx - mn;
              return l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            })();
            sumSat += s;
            count++;
          }
        }
        const avgSat = count > 0 ? (sumSat / count) : 0;

        if (avgSat < imageSatThreshold) {
          // 反転: RGB -> 255 - RGB
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
            // alphaはそのまま
          }
          ctx.putImageData(imgData, 0, 0);
          const newDataUrl = canvas.toDataURL('image/png');
          imgEl.setAttribute('href', newDataUrl);
          imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', newDataUrl);
        }

        bitmap.close?.();
      } catch (err) {
        console.warn('processSvgImages error', err);
        continue;
      }
    }
  }

  // ----------------------------
  // ページ描画ループ（元のロジックを復活）
  // ----------------------------
  for (let p = 1; p <= pdf.numPages; p++) {
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 }); // 必要に応じて scale 調整
      const opList = await page.getOperatorList();

      const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
      const svg = await svgGfx.getSVG(opList, viewport);

      // ページラッパー
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';
      pageDiv.appendChild(svg);
      container.appendChild(pageDiv);

      // テキスト/パスのスマート反転
      invertSvgColorsSmart(svg, { satThreshold: 0.15 });

      // 画像は条件付きで反転（重いので await）
      await processSvgImages(svg, { imageSatThreshold: 0.08, sampleStep: 6, maxSize: 800 });
    } catch (err) {
      console.error('Error rendering page', p, err);
      // エラーが出ても次ページへ進む
      const errDiv = document.createElement('div');
      errDiv.textContent = `Error rendering page ${p}: ${err.message || err}`;
      container.appendChild(errDiv);
    }
  }

  // 最後にスクロールトップ等の調整
  window.scrollTo(0, 0);
}

// export グローバル（viewer-run.js から呼ぶ想定）
window.startViewer = startViewer;
