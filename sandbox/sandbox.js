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
  function imageDataToInput(imgData) {
    const { data, width, height } = imgData;
    // Resize via Canvas since tf.image.resizeBilinear exists but we don't want heavy ops here.
    const off = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    off.width = width; off.height = height;
    const ictx = off.getContext('2d');
    const tmp = new ImageData(new Uint8ClampedArray(data), width, height);
    ictx.putImageData(tmp, 0, 0);
  const target = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(224, 224) : document.createElement('canvas');
  target.width = 224; target.height = 224;
  const tctx = target.getContext('2d');
    tctx.drawImage(off, 0, 0, 224, 224);
    const resized = tctx.getImageData(0, 0, 224, 224);
    const arr = new Float32Array(224 * 224 * 3);
    let j = 0;
    for (let i = 0; i < resized.data.length; i += 4) {
      const r = resized.data[i] / 255;
      const g = resized.data[i+1] / 255;
      const b = resized.data[i+2] / 255;
      arr[j++] = r; arr[j++] = g; arr[j++] = b;
    }
    const x = tf.tensor4d(arr, [1,224,224,3]);
    return x;
  }

  function normBoxToPixels(box, w, h) {
    // box: [x, y, w, h] normalized (0..1)
    let [x, y, bw, bh] = box;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    bw = Math.max(0, Math.min(1, bw));
    bh = Math.max(0, Math.min(1, bh));
    let px = Math.round(x * w);
    let py = Math.round(y * h);
    let pw = Math.round(bw * w);
    let ph = Math.round(bh * h);
    if (pw <= 0 || ph <= 0) return null;
    // clamp
    if (px + pw > w) pw = w - px;
    if (py + ph > h) ph = h - py;
    if (pw <= 0 || ph <= 0) return null;
    return {x:px, y:py, w:pw, h:ph};
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
      await ensureModel(modelUrl);
      let boxPx = null;
      await tf.tidy(() => {
        const x = imageDataToInput(imageData);
        const y = model.predict(x);
        const arr = y.dataSync();
        if (arr && arr.length >= 4) {
          const box = [arr[0], arr[1], arr[2], arr[3]];
          const px = normBoxToPixels(box, canvasWidth, canvasHeight);
          if (px && px.w * px.h >= 25) {
            boxPx = px;
          }
        }
      });
      let resultImageData = imageData;
      if (boxPx) {
        resultImageData = selectiveInvertOutsideBoxes(imageData, [boxPx]);
      } else {
        // no box => invert everything
        resultImageData = selectiveInvertOutsideBoxes(imageData, []);
      }
      parent.postMessage({ type: 'predictResult', ok: true, box: boxPx, imageData: resultImageData }, '*', [resultImageData.data.buffer]);
    } catch (err) {
      parent.postMessage({ type: 'predictResult', ok: false, error: String(err) }, '*');
    }
  }

  ctx.addEventListener('message', handlePredict);
  try { parent.postMessage({ type: 'sandboxReady' }, '*'); } catch(_) {}
})();
