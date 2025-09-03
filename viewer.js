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
  function parseColor(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    if (str.startsWith('#')) {
      let hex = str.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
      const num = parseInt(hex,16);
      return { r: (num>>16)&255, g: (num>>8)&255, b: num&255 };
    }
    if (str.startsWith('rgb')) {
      const m = str.match(/rgb[a]?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(',').map(s=>parseInt(s.trim()));
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
    return null;
  }

  // invert color by luminance threshold
  function invertColorStr(colorStr) {
    const c = parseColor(colorStr);
    if (!c) return null;
    const lum = (0.2126*c.r + 0.7152*c.g + 0.0722*c.b) / 255;
    return lum > 0.5 ? '#000000' : '#ffffff';
  }

  for (let p=1; p<=pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 }); // scaleは好みで調整
    const opList = await page.getOperatorList();

    // SVGGraphics を使ってSVG出力
    const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
    const svg = await svgGfx.getSVG(opList, viewport);

    // ページラッパー
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.style.width = viewport.width + 'px';
    pageDiv.style.height = viewport.height + 'px';
    pageDiv.appendChild(svg);
    container.appendChild(pageDiv);

    // SVG内の要素を走査して色を反転（画像は無視）
    const all = svg.querySelectorAll('*');
    all.forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'image') return; // 画像はそのまま
      // fill の反転
      const fillAttr = el.getAttribute('fill');
      const effectiveFill = fillAttr || window.getComputedStyle(el).fill;
      const inv = invertColorStr(effectiveFill);
      if (inv) el.setAttribute('fill', inv);

      // stroke の反転
      const strokeAttr = el.getAttribute('stroke');
      const effectiveStroke = strokeAttr || window.getComputedStyle(el).stroke;
      const invS = invertColorStr(effectiveStroke);
      if (invS) el.setAttribute('stroke', invS);
    });

    // SVG の背景を黒に（もし白矩形で背景が作られているなら既に反転されているはず）
    svg.style.background = '#000';
  }

  // 最後にスクロールトップ等の調整
  window.scrollTo(0,0);
}