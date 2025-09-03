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
  } catch(e) {
    document.getElementById('container').textContent = 'Fetch error: ' + e.message;
    return;
  }
  const arrayBuffer = await resp.arrayBuffer();

  // load doc
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const container = document.getElementById('container');
  container.innerHTML = '';

  // helper: parse hex/rgb string to {r,g,b}
    // --- ここから差し替え用のヘルパー関数群 ---

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
    const kw = { black: {r:0,g:0,b:0,a:1}, white: {r:255,g:255,b:255,a:1}, gray: {r:128,g:128,b:128,a:1}, grey: {r:128,g:128,b:128,a:1} };
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
    r/=255; g/=255; b/=255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h=0, s=0, l=(max+min)/2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max) {
        case r: h = (g - b)/d + (g < b ? 6 : 0); break;
        case g: h = (b - r)/d + 2; break;
        case b: h = (r - g)/d + 4; break;
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
    // (将来的に Lab ベースも実装可)
    return false;
  }

  // グラデーション（stop）を見て「色付きか」を判定
  function gradientIsColored(gradElem, options = {}) {
    if (!gradElem) return false;
    const stops = gradElem.querySelectorAll('stop');
    if (!stops || stops.length === 0) return false;
    for (const stop of stops) {
      // stop-color 属性か style 経由で取得
      const sc = stop.getAttribute('stop-color') || (window.getComputedStyle ? window.getComputedStyle(stop).stopColor : null);
      const parsed = parseColor(sc);
      if (parsed && isColored(parsed, options)) return true;
    }
    return false;
  }

  // --- 実際の SVG 走査＋反転関数（元ループの置き換え） ---
  // options: { satThreshold: 0.15, method: 'saturation' }
  function invertSvgColorsSmart(svg, options = {}) {
    // まずグラデ要素をマップ化（id -> colored boolean）
    const gradientMap = new Map();
    const gradients = svg.querySelectorAll('linearGradient, radialGradient');
    gradients.forEach(g => {
      const id = g.id;
      if (!id) return;
      const colored = gradientIsColored(g, options);
      gradientMap.set('#' + id, colored); // fill="url(#id)" の形式に合わせる
    });

    // 対象ノードを限定して走査（全要素より軽い）
    const selector = 'text, tspan, path, rect, circle, ellipse, line, polyline, polygon, g';
    const nodes = svg.querySelectorAll(selector);

    nodes.forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'image') return; // 画像はスキップ

      // ---------- fill の取得と判定 ----------
      let fillAttr = el.getAttribute('fill');
      let fillIsGradient = false;
      if (fillAttr && fillAttr.trim().startsWith('url(')) {
        fillIsGradient = true;
      }

      let fillColor = null;
      if (!fillIsGradient) {
        // 普通の色指定を優先して解析
        if (fillAttr && fillAttr !== 'currentColor' && fillAttr !== 'none') fillColor = parseColor(fillAttr);
        if (!fillColor) {
          // style 属性
          const styleFill = el.style && el.style.fill;
          if (styleFill) fillColor = parseColor(styleFill);
        }
        if (!fillColor) {
          // computed style にフォールバック
          const cs = window.getComputedStyle(el);
          if (cs && cs.fill) fillColor = parseColor(cs.fill);
        }
      } else {
        // グラデ参照なら map を見て判定（登録されていなければ保守的に「色付き」とみなす）
        const urlRef = fillAttr.trim();
        const gradColored = gradientMap.has(urlRef) ? gradientMap.get(urlRef) : true;
        if (gradColored) {
          // 色付きグラデはそのまま維持（skip inversion）
          fillColor = { keep: true };
        } else {
          // 無彩色グラデなら stops を個別に反転する処理を下で行う
          fillColor = null;
        }
      }

      // ---------- stroke の取得と判定 ----------
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

      // ---------- 適用ルール ----------
      // fill が {keep:true} のときは何もしない（グラデが色付き）
      if (fillColor && fillColor.keep) {
        // nothing
      } else {
        // fillColor が存在して色付きなら維持、無彩色なら反転
        if (fillColor) {
          if (!isColored(fillColor, options)) {
            const newFill = pickForegroundForBackground(fillColor);
            el.setAttribute('fill', newFill);
          } // else カラフル -> そのまま
        } else if (fillIsGradient) {
          // 無彩色グラデの stops を反転
          const urlRef = el.getAttribute('fill').trim(); // e.g. url(#g1)
          const gradId = urlRef.replace(/^url\(/,'').replace(/\)$/,'');
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
        } else {
          // fillColor が null (例えば currentColor / complex / none の場合) -> Defensive: try computed again or skip
        }
      }

      // stroke の処理（fill と同様のルールだが gradient を想定しないケースが多い）
      if (strokeColor) {
        if (!isColored(strokeColor, options)) {
          const newStroke = pickForegroundForBackground(strokeColor);
          el.setAttribute('stroke', newStroke);
        }
      }

    }); // nodes.forEach

    // SVG 全体の背景を黒に
    svg.style.background = '#000';
  }

  // --- ここまでヘルパー関数群 ---
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 }); // scaleは好みで調整
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

    // 差し替えたスマート反転関数をここで呼ぶ
    invertSvgColorsSmart(svg, { satThreshold: 0.15 });
  }

  // スクロールを先頭に戻す
  window.scrollTo(0, 0);

}