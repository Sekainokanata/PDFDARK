// detect_python_style.js
// ピュアJS（Python式）写真領域検出ロジックを分離

window.detectPhotoRegionsPythonStyle = function detectPhotoRegionsPythonStyle(imgDataSmall, origW, origH, options = {}){
  try {
    if (!imgDataSmall || !imgDataSmall.data) return { ok:false, boxes:[], reason:'no image data' };
    const params = Object.assign({
      adaptiveBlock: 51,
      adaptiveC: 10,
      morphKernel: 9,
      minAreaRatio: 0.005,
      minBoxWHRatio: 0.08,
      edgeDensityMin: 0.008,
      tightenToMask: true,
      tightPadding: 4,
      minFillRatio: 0.30,
      sobelThresh: 0.18,
      // 追加の領域フィルタ（Python式を保ちつつ誤検出削減）
      minAspect: 0.3,
      maxAspect: 3.5,
      maxAreaRatio: 0.85,
      regionEntropyMin: 3.4,
      regionStdMin: 0.085,
      regionSatMin: 0.06,
      regionMinSignals: 2
    }, options);

    const sw = imgDataSmall.width|0, sh = imgDataSmall.height|0; if (!sw || !sh) return { ok:false, boxes:[] };
    const sdata = imgDataSmall.data;

    // 1) グレースケール 0..255
    const gray = new Uint8ClampedArray(sw * sh);
    for (let i=0, j=0; i<sdata.length; i+=4, j++) {
      const r = sdata[i], g = sdata[i+1], b = sdata[i+2];
      gray[j] = Math.min(255, Math.max(0, Math.round(0.2126*r + 0.7152*g + 0.0722*b)));
    }

    // 2) 適応二値化 (Mean) with integral image, THRESH_BINARY_INV
    const block = Math.max(3, (params.adaptiveBlock|0) | 1); // odd
    const half = (block - 1) >> 1;
    const integ = new Float64Array((sw+1)*(sh+1));
    for (let y=1; y<=sh; y++){
      let rowSum=0; let off = (y-1)*sw; let io = y*(sw+1);
      for (let x=1; x<=sw; x++){
        rowSum += gray[off + (x-1)];
        integ[io + x] = integ[(y-1)*(sw+1) + x] + rowSum;
      }
    }
    const bin = new Uint8Array(sw * sh);
    const areaOf = (x0,y0,x1,y1)=>{ const w=x1-x0+1, h=y1-y0+1; return w>0&&h>0? w*h:1; };
    const sumRect = (x0,y0,x1,y1)=>{
      // clamp to [0..sw-1], [0..sh-1]
      x0 = x0<0?0:(x0>sw-1?sw-1:x0); y0 = y0<0?0:(y0>sh-1?sh-1:y0);
      x1 = x1<0?0:(x1>sw-1?sw-1:x1); y1 = y1<0?0:(y1>sh-1?sh-1:y1);
      if (x1<x0||y1<y0) return 0;
      const X0=x0, Y0=y0, X1=x1, Y1=y1;
      const a = integ[Y0*(sw+1)+X0];
      const b = integ[Y0*(sw+1)+X1+1];
      const c = integ[(Y1+1)*(sw+1)+X0];
      const d = integ[(Y1+1)*(sw+1)+X1+1];
      return d - b - c + a;
    };
    for (let y=0; y<sh; y++){
      const y0 = y - half, y1 = y + half;
      for (let x=0; x<sw; x++){
        const x0 = x - half, x1 = x + half;
        const area = areaOf(x0,y0,x1,y1);
        const s = sumRect(x0,y0,x1,y1);
        const mean = s / area;
        const th = mean - params.adaptiveC;
        const g = gray[y*sw + x];
        bin[y*sw + x] = (g < th) ? 1 : 0; // INV
      }
    }

    // 3) クロージング（9x9矩形）を積分画像で高速実装
    const k = Math.max(1, (params.morphKernel|0));
    const kh = (k-1)>>1;
    const integBin = new Int32Array((sw+1)*(sh+1));
    for (let y=1; y<=sh; y++){
      let row=0; let io=y*(sw+1), ib=(y-1)*sw;
      for (let x=1; x<=sw; x++){
        row += bin[ib + (x-1)];
        integBin[io + x] = integBin[(y-1)*(sw+1) + x] + row;
      }
    }
    const winSum = (x0,y0,x1,y1)=>{
      x0 = Math.max(0,x0); y0 = Math.max(0,y0); x1 = Math.min(sw-1,x1); y1 = Math.min(sh-1,y1);
      if (x1<x0||y1<y0) return 0;
      const a = integBin[y0*(sw+1)+x0];
      const b = integBin[y0*(sw+1)+x1+1];
      const c = integBin[(y1+1)*(sw+1)+x0];
      const d = integBin[(y1+1)*(sw+1)+x1+1];
      return d - b - c + a;
    };
    // dilation: sum>0
    const dil = new Uint8Array(sw*sh);
    for (let y=0;y<sh;y++){
      const y0=y-kh, y1=y+kh;
      for (let x=0;x<sw;x++){
        const x0=x-kh, x1=x+kh;
        dil[y*sw+x] = winSum(x0,y0,x1,y1) > 0 ? 1 : 0;
      }
    }
    // erosion on dilated: sum == area
    const integDil = new Int32Array((sw+1)*(sh+1));
    for (let y=1; y<=sh; y++){
      let row=0; let io=y*(sw+1), ib=(y-1)*sw;
      for (let x=1; x<=sw; x++){
        row += dil[ib + (x-1)];
        integDil[io + x] = integDil[(y-1)*(sw+1) + x] + row;
      }
    }
    const close = new Uint8Array(sw*sh);
    for (let y=0;y<sh;y++){
      const y0=y-kh, y1=y+kh; const ah = Math.min(sh-1,y1) - Math.max(0,y0) + 1;
      for (let x=0;x<sw;x++){
        const x0=x-kh, x1=x+kh; const aw = Math.min(sw-1,x1) - Math.max(0,x0) + 1;
        const s = (function(){
          const xx0=Math.max(0,x0), yy0=Math.max(0,y0), xx1=Math.min(sw-1,x1), yy1=Math.min(sh-1,y1);
          const a = integDil[yy0*(sw+1)+xx0];
          const b = integDil[yy0*(sw+1)+xx1+1];
          const c = integDil[(yy1+1)*(sw+1)+xx0];
          const d = integDil[(yy1+1)*(sw+1)+xx1+1];
          return d - b - c + a;
        })();
        close[y*sw+x] = (s === aw*ah) ? 1 : 0;
      }
    }

    // 4) Sobelエッジ（Canny代替）と二値化
    const grad = new Float32Array(sw*sh);
    for (let y=1;y<sh-1;y++){
      for (let x=1;x<sw-1;x++){
        const i=y*sw+x;
        const gxm = -gray[i-sw-1] + gray[i-sw+1] + -2*gray[i-1] + 2*gray[i+1] + -gray[i+sw-1] + gray[i+sw+1];
        const gym = -gray[i-sw-1] + -2*gray[i-sw] + -gray[i-sw+1] + gray[i+sw-1] + 2*gray[i+sw] + gray[i+sw+1];
        grad[i] = Math.hypot(gxm, gym);
      }
    }
    let gmax=0; for (let i=0;i<grad.length;i++) if (grad[i]>gmax) gmax=grad[i]; const inv = gmax>0?1/gmax:1;
    for (let i=0;i<grad.length;i++) grad[i]*=inv;
    const edge = new Uint8Array(sw*sh);
    const gth = params.sobelThresh; for (let i=0;i<grad.length;i++) edge[i] = grad[i] >= gth ? 1 : 0;

    // 5) 連結成分（close==1）→ 外接 bbox
    const labels = new Int32Array(sw*sh); labels.fill(-1);
    const boxesSmall = [];
    let cur=0; const stack=[]; const push=(x,y)=>stack.push(x,y);
    const nei = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let sy=0; sy<sh; sy++){
      for (let sx=0; sx<sw; sx++){
        const idx = sy*sw+sx; if (close[idx]!==1 || labels[idx]!==-1) continue;
        let minx=sx, miny=sy, maxx=sx, maxy=sy; labels[idx]=cur; push(sx,sy);
        while (stack.length){ const y=stack.pop(); const x=stack.pop();
          for (const [dx,dy] of nei){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=sw||ny>=sh) continue; const j=ny*sw+nx; if(close[j]===1 && labels[j]===-1){ labels[j]=cur; push(nx,ny); if(nx<minx)minx=nx; if(nx>maxx)maxx=nx; if(ny<miny)miny=ny; if(ny>maxy)maxy=ny; } }
        }
        boxesSmall.push({ x:minx, y:miny, w:(maxx-minx+1), h:(maxy-miny+1) }); cur++;
      }
    }

    // 6) 候補フィルタと tight 化
    const pageAreaSmall = sw*sh;
    const scaleX = origW / sw, scaleY = origH / sh;
    const candidates = [];
    // precompute page metrics for fallback
    let pageEdgeCnt = 0, pageSatSum=0; const hist = new Uint32Array(64);
    for (let i=0;i<edge.length;i++) pageEdgeCnt += edge[i];
    for (let i=0,px=0;i<sdata.length;i+=4,px++){
      const r=sdata[i]/255, g=sdata[i+1]/255, b=sdata[i+2]/255; const max=Math.max(r,g,b), min=Math.min(r,g,b); const l=(max+min)/2; const s=(max===min)?0:(l>0.5?(max-min)/(2-max-min):(max-min)/(max+min)); pageSatSum += s;
      const gv = gray[px]/255; const binIdx = Math.min(63, (gv*64)|0); hist[binIdx]++;
    }
    const pageEdgeDen = pageEdgeCnt/(pageAreaSmall||1);
    const pageAvgSat = pageSatSum/(pageAreaSmall||1);
    let pageEntropy = 0; for (let b=0;b<hist.length;b++){ if(!hist[b]) continue; const p=hist[b]/(pageAreaSmall||1); pageEntropy -= p*Math.log2(p); }

    const sumCloseInRect = (x0,y0,x1,y1)=>{
      let s=0; x0=Math.max(0,x0); y0=Math.max(0,y0); x1=Math.min(sw-1,x1); y1=Math.min(sh-1,y1);
      for (let y=y0;y<=y1;y++){ let off=y*sw; for (let x=x0;x<=x1;x++){ s += close[off+x]; } }
      return s;
    };
    for (const bb of boxesSmall){
      const {x,y,w,h} = bb; const area = w*h; const areaRatio = area/(pageAreaSmall||1);
      if (areaRatio < params.minAreaRatio) continue;
      if (w < params.minBoxWHRatio*sw || h < params.minBoxWHRatio*sh) continue;
      const ar = w/(h||1); if (ar < params.minAspect || ar > params.maxAspect) continue;
      if (areaRatio > params.maxAreaRatio) continue;

      // ROIエッジ密度（Sobel閾2値の比率）
      let eCnt=0; for (let yy=y; yy<y+h; yy++){ let o=yy*sw; for (let xx=x; xx<x+w; xx++){ eCnt += edge[o+xx]; } }
      const edgeRatio = eCnt/(area||1);
      if (edgeRatio < params.edgeDensityMin) continue;

      // fill ratio（close マスク）
      const fillRatio = sumCloseInRect(x,y,x+w-1,y+h-1)/(area||1);

      // tighten: close>0 の最小外接矩形 + padding
      let nx=x, ny=y, nxx=x+w, nyy=y+h; let tightFill=fillRatio;
      if (params.tightenToMask){
        let minx=sw, miny=sh, maxx=-1, maxy=-1; let has=false;
        for (let yy=ny; yy<nyy; yy++){ let o=yy*sw; for (let xx=nx; xx<nxx; xx++){ if(close[o+xx]){ if(xx<minx)minx=xx; if(xx>maxx)maxx=xx; if(yy<miny)miny=yy; if(yy>maxy)maxy=yy; has=true; } } }
        if (has){
          nx = Math.max(0, minx - params.tightPadding);
          ny = Math.max(0, miny - params.tightPadding);
          nxx = Math.min(sw, maxx + 1 + params.tightPadding);
          nyy = Math.min(sh, maxy + 1 + params.tightPadding);
          // 追加: オーバーサイズ対策の内側スナップ（マスク/エッジで境界を内側へ寄せる）
          (function shrink(){
            let sx0=nx, sy0=ny, sx1=nxx, sy1=nyy; const maskMin=0.70; const edgeMax=0.28;
            let changed=true, guard=0;
            while (changed && guard++<200){
              changed=false; const height=Math.max(1, sy1-sy0), width=Math.max(1, sx1-sx0);
              // 左端
              if (sx0+1 < sx1){ let m=0,e=0; for(let yy=sy0;yy<sy1;yy++){ const i=yy*sw+sx0; m+=close[i]; e+=edge[i]; } const mDen=m/height, eDen=e/height; if (mDen < maskMin || eDen > edgeMax){ sx0++; changed=true; } }
              // 右端
              if (sx1-1 > sx0){ const x=sx1-1; let m=0,e=0; for(let yy=sy0;yy<sy1;yy++){ const i=yy*sw+x; m+=close[i]; e+=edge[i]; } const mDen=m/height, eDen=e/height; if (mDen < maskMin || eDen > edgeMax){ sx1--; changed=true; } }
              // 上端
              if (sy0+1 < sy1){ let m=0,e=0; let off=sy0*sw; for(let xx=sx0;xx<sx1;xx++){ const i=off+xx; m+=close[i]; e+=edge[i]; } const mDen=m/width, eDen=e/width; if (mDen < maskMin || eDen > edgeMax){ sy0++; changed=true; } }
              // 下端
              if (sy1-1 > sy0){ let m=0,e=0; let off=(sy1-1)*sw; for(let xx=sx0;xx<sx1;xx++){ const i=off+xx; m+=close[i]; e+=edge[i]; } const mDen=m/width, eDen=e/width; if (mDen < maskMin || eDen > edgeMax){ sy1--; changed=true; } }
            }
            nx=sx0; ny=sy0; nxx=sx1; nyy=sy1;
          })();
          const tw = Math.max(0, nxx-nx), th = Math.max(0, nyy-ny);
          if (tw>4 && th>4){ tightFill = sumCloseInRect(nx,ny,nxx-1,nyy-1)/((tw*th)||1); }
        }
      }
      if (tightFill < params.minFillRatio) continue;

      // 領域のテクスチャ/色指標（tight後の領域で測定）
      const sx0 = nx, sy0 = ny, sx1 = nxx, sy1 = nyy; const a2 = Math.max(1, (sx1-sx0)*(sy1-sy0));
      let sum=0, sum2=0, satSum=0; const bins=32; const hist2 = new Uint32Array(bins);
      for (let yy=sy0; yy<sy1; yy++){
        let off=yy*sw;
        for (let xx=sx0; xx<sx1; xx++){
          const pi = off+xx; const g = gray[pi]; sum += g; sum2 += g*g; const binI = Math.min(bins-1, ((g/255)*bins)|0); hist2[binI]++;
          const k = pi*4; const r=sdata[k]/255, gg=sdata[k+1]/255, bb=sdata[k+2]/255; const mx=Math.max(r,gg,bb), mn=Math.min(r,gg,bb); const l=(mx+mn)/2; const s=(mx===mn)?0:(l>0.5?(mx-mn)/(2-mx-mn):(mx-mn)/(mx+mn)); satSum += s;
        }
      }
      const mean = sum/a2; const std = Math.sqrt(Math.max(0, (sum2/a2) - mean*mean))/255;
      let entropy=0; for (let b=0;b<bins;b++){ if(!hist2[b]) continue; const p=hist2[b]/a2; entropy -= p*Math.log2(p); }
      const satMean = satSum/a2;
      const photoScore = (entropy >= params.regionEntropyMin ? 1:0) + (std >= params.regionStdMin ? 1:0) + (satMean >= params.regionSatMin ? 1:0);
      if (photoScore < (params.regionMinSignals|0)) continue;

      // スケールして返却
      const X = Math.floor(nx*scaleX), Y = Math.floor(ny*scaleY);
      const X1 = Math.ceil(nxx*scaleX), Y1 = Math.ceil(nyy*scaleY);
      const BW = Math.max(0, X1-X), BH = Math.max(0, Y1-Y);
      if (BW>0 && BH>0) {
        const aR = (BW*BH)/((origW*origH)||1);
        candidates.push({ x:X, y:Y, w:BW, h:BH, area:BW*BH, areaRatio:aR, sat:satMean, entropy, stdv:std });
      }
    }

    // 7) 先に包含除去: ほぼ内包される小矩形を落とす
    const removeContained = (items)=>{
      const arr = items.slice().sort((a,b)=> b.area - a.area);
      const kept=[];
      for (let i=0;i<arr.length;i++){
        const a = arr[i]; let contained=false;
        for (let j=0;j<kept.length;j++){
          const b = kept[j];
          const x0=Math.max(a.x,b.x), y0=Math.max(a.y,b.y), x1=Math.min(a.x+a.w,b.x+b.w), y1=Math.min(a.y+a.h,b.y+b.h);
          const iw=Math.max(0,x1-x0), ih=Math.max(0,y1-y0); const inter=iw*ih; if(!inter) continue;
          const cover = inter / (a.w*a.h || 1);
          if (cover >= 0.85) { contained=true; break; }
        }
        if (!contained) kept.push(a);
      }
      return kept;
    };
    let pruned = removeContained(candidates);

    // 8) 重複抑制（NMS）: IoU が高いものを統合し、大きい方を残す
    const nms = (items)=>{
      const arr = items.slice().sort((a,b)=> (b.area - a.area));
      const kept=[];
      const iou=(a,b)=>{ const x0=Math.max(a.x,b.x), y0=Math.max(a.y,b.y), x1=Math.min(a.x+a.w,b.x+b.w), y1=Math.min(a.y+a.h,b.y+b.h); const iw=Math.max(0,x1-x0), ih=Math.max(0,y1-y0); const inter=iw*ih; if(!inter) return 0; const ua=a.w*a.h + b.w*b.h - inter; return inter/(ua||1); };
      while(arr.length){ const cur=arr.shift(); let overlapped=false; for(const k of kept){ if(iou(cur,k) >= 0.45){ overlapped=true; break; } } if(!overlapped) kept.push(cur); }
      return kept;
    };
    const afterNms = nms(pruned);
    afterNms.sort((a,b)=>b.area-a.area);

    // 9) 余剰ボックスに厳しめの基準を適用（上位2つ以外は強い確信がないと残さない）
    let filtered = [];
    const top2Avg = afterNms.length>=2 ? (afterNms[0].area + afterNms[1].area)/2 : (afterNms[0]?.area||1);
    for (let i=0;i<afterNms.length;i++){
      const b = afterNms[i];
      if (i < 2) { filtered.push(b); continue; }
      const wR = b.w / (origW||1), hR = b.h / (origH||1), aR = b.area / ((origW*origH)||1);
      const strongSignals = ( (b.entropy>=params.regionEntropyMin) && (b.stdv>=params.regionStdMin) && (b.sat>=params.regionSatMin) );
      const largeEnough = (aR>=0.06 || wR>=0.30 || hR>=0.30);
      const notTinyVsTop2 = b.area >= 0.40 * top2Avg;
      if (strongSignals && largeEnough && notTinyVsTop2) filtered.push(b);
    }

    return { ok:true, boxes: filtered, page: { edgeDensity: pageEdgeDen, avgSat: pageAvgSat, entropy: pageEntropy } };
  } catch(e){
    console.warn('detectPhotoRegionsPythonStyle failed', e);
    return { ok:false, boxes:[], error:String(e&&e.message||e) };
  }
};
