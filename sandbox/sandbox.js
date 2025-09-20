(function(){
  // sandbox worker-like page: load tfjs and model, respond to inference requests
  const ctx = self;
  let model = null;
  let backendReady = false;
  async function ensureTfLoaded(){
    if (ctx.tf && typeof ctx.tf.loadLayersModel === 'function') return true;
    // 拡張内の候補
    const cands = [ '../tfjs/tf.min.js', '../vendor/tf.min.js' ];
    for (const rel of cands){
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = rel; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('load fail'));
          document.head.appendChild(s);
        });
        if (ctx.tf && typeof ctx.tf.loadLayersModel === 'function') return true;
      } catch(_) {}
    }
    return !!(ctx.tf && typeof ctx.tf.loadLayersModel === 'function');
  }

  function log(...args){
    // muted in production; uncomment for debugging
    // console.log('[sandbox]', ...args);
  }

  async function ensureBackend() {
    if (backendReady) return true;
    if (!(await ensureTfLoaded())) return false;
    try {
      // Prefer wasm if available; fallback to cpu
      try {
        await tf.setBackend('wasm');
        await tf.ready();
        backendReady = true;
        log('TF backend wasm');
        return true;
      } catch(e) {
        log('wasm backend not available', e);
      }
      try {
        await tf.setBackend('cpu');
        await tf.ready();
        backendReady = true;
        log('TF backend cpu');
        return true;
      } catch(e) { log('cpu backend failed', e); }
    } catch (e) {
      log('ensureBackend error', e);
    }
    return false;
  }

  async function ensureModel(url){
    if (model) return model;
    if (!(await ensureTfLoaded())) throw new Error('tf not loaded');
    await ensureBackend();
    model = await tf.loadLayersModel(url);
    return model;
  }

  // Convert an ImageData (Uint8ClampedArray) to tensor input [1,224,224,3]
  // Pipeline parity:
  //  1) resize to (IMG_SIZE, IMG_SIZE)
  //  2) convert to RGB (drop alpha), to numpy-like array and normalize by 255.0
  //  3) expand dims -> (1, IMG_SIZE, IMG_SIZE, 3)
  function imageDataToInput(imgData) {
    const { data, width, height } = imgData;
    const IMG_SIZE = 224;
    // Draw source ImageData onto an offscreen canvas
    const off = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    off.width = width; off.height = height;
    const ictx = off.getContext('2d');
    const tmp = new ImageData(new Uint8ClampedArray(data), width, height);
    ictx.putImageData(tmp, 0, 0);

    // Resize to IMG_SIZE x IMG_SIZE with smoothing, on white background
    const target = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(IMG_SIZE, IMG_SIZE) : document.createElement('canvas');
    target.width = IMG_SIZE; target.height = IMG_SIZE;
    const tctx = target.getContext('2d');
    tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
    // Fill white background to emulate RGB conversion behavior
    tctx.save();
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
    tctx.drawImage(off, 0, 0, IMG_SIZE, IMG_SIZE);
    tctx.restore();

    const resized = tctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE);
    const arr = new Float32Array(IMG_SIZE * IMG_SIZE * 3);
    let j = 0;
    for (let i = 0; i < resized.data.length; i += 4) {
      const r = resized.data[i] / 255;
      const g = resized.data[i+1] / 255;
      const b = resized.data[i+2] / 255;
      arr[j++] = r; arr[j++] = g; arr[j++] = b;
    }
    const x = tf.tensor4d(arr, [1, IMG_SIZE, IMG_SIZE, 3]);
    return x;
  }
  
  function clampBoxToCanvasPixels(rawBox, w, h) {
    // rawBox: [x, y, w, h] already in absolute pixel coordinates of the original PNG/canvas
    if (!rawBox || rawBox.length < 4) return null;
    let [x, y, bw, bh] = rawBox.map(v => (Number.isFinite(v) ? v : 0));
    // normalize negatives
    if (bw < 0) { x = x + bw; bw = -bw; }
    if (bh < 0) { y = y + bh; bh = -bh; }
    // clamp to canvas bounds
    x = Math.max(0, Math.min(w, x));
    y = Math.max(0, Math.min(h, y));
    bw = Math.max(0, Math.min(w - x, bw));
    bh = Math.max(0, Math.min(h - y, bh));
    // discard tiny/invalid
    if (!(bw > 0 && bh > 0)) return null;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(bw), h: Math.round(bh) };
  }

  // Invert whole image then restore boxes region from original
  function selectiveInvertOutsideBoxes(imgData, boxes) {
    const { data, width, height } = imgData;
    const out = new Uint8ClampedArray(data); // copy original
    // invert all pixels
    for (let i=0;i<out.length;i+=4) {
      out[i] = 255 - out[i];
      out[i+1] = 255 - out[i+1];
      out[i+2] = 255 - out[i+2];
      // preserve alpha
    }
    // restore inside boxes from original
    for (const b of boxes) {
      if (!b) continue;
      const {x,y,w,h} = b;
      for (let row=0; row<h; row++) {
        const srcStart = ((y+row)*width + x) * 4;
        const dstStart = srcStart;
        const len = w * 4;
        out.set(data.subarray(srcStart, srcStart+len), dstStart);
      }
    }
    return new ImageData(out, width, height);
  }

  async function handlePredict(e){
    const msg = e.data || {};
    if (msg.type !== 'predict') return;
    // 送り主のオリジンチェック（iframe 親のみ許可）
    try {
      if (e.source !== parent) return;
    } catch(_) {}
    try {
      const { modelUrl, imageData, canvasWidth, canvasHeight } = msg;
      // 入力として与えられるPNG（キャンバス）の画像サイズをログ出力
      try {
        console.log('入力PNGサイズ:', canvasWidth, 'x', canvasHeight);
      } catch(_) {}
      await ensureModel(modelUrl);
      let boxPx = null;
      let rawArr = null;
      await tf.tidy(() => {
        const x = imageDataToInput(imageData);
        const y = model.predict(x);
        const arr = y.dataSync();
        // 出力された値に224倍したものが「596×842 座標系の絶対値」
        rawArr = Array.isArray(arr) ? Array.from(arr).map(v => v * 224) : Array.from(arr).map(v => v * 224);
        if (rawArr && rawArr.length >= 4) {
          const BASE_W = 596, BASE_H = 842;
          const sx = canvasWidth / BASE_W;
          const sy = canvasHeight / BASE_H;
          // 596×842座標系 → 入力PNGキャンバス座標へスケーリング
          const scaledToCanvas = [
            rawArr[0] * sx,
            rawArr[1] * sy,
            rawArr[2] * sx,
            rawArr[3] * sy
          ];
          const px = clampBoxToCanvasPixels(scaledToCanvas, canvasWidth, canvasHeight);
          if (px && px.w * px.h >= 25) boxPx = px;
        }
      });
      // スケール調整後（キャンバス座標系）の [x,y,w,h] をログ出力
      try {
        console.log('スケール調整後のボックス [x,y,w,h]:', boxPx ? [boxPx.x, boxPx.y, boxPx.w, boxPx.h] : null);
      } catch(_) {}
      let resultImageData = imageData;
      if (boxPx) {
        resultImageData = selectiveInvertOutsideBoxes(imageData, [boxPx]);
      } else {
        // no box => invert everything
        resultImageData = selectiveInvertOutsideBoxes(imageData, []);
      }
  parent.postMessage({ type: 'predictResult', ok: true, box: boxPx, raw: rawArr, imageData: resultImageData }, '*', [resultImageData.data.buffer]);
    } catch (err) {
      parent.postMessage({ type: 'predictResult', ok: false, error: String(err) }, '*');
    }
  }

  ctx.addEventListener('message', handlePredict);
  try { parent.postMessage({ type: 'sandboxReady' }, '*'); } catch(_) {}
})();
