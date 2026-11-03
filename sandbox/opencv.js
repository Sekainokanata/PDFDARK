(function(){
  // Wait for OpenCV runtime
  function onReady(cb){
    if (self.cv && self.cv.getBuildInformation) return cb();
    const orig = self.cv && self.cv.onRuntimeInitialized;
    self.cv = self.cv || {};
    self.cv.onRuntimeInitialized = function(){
      if (orig) try{orig();}catch(_){/*noop*/}
      cb();
    };
  }

  function detect(imageData, origW, origH, opts){
    const cv = self.cv;
    let src=null, gray=null, th=null, kernel=null, close=null, edges=null;
    const sw = imageData.width|0, sh=imageData.height|0; if(!sw||!sh) return { ok:false, boxes:[], reason:'no image'};
    const scaleX = origW / sw, scaleY = origH / sh;
    const params = Object.assign({
      minAreaRatio: 0.005,
      minBoxWHRatio: 0.08,
      edgeDensityMin: 0.008,
      morphKernel: 9,
      adaptiveBlock: 51,
      adaptiveC: 10,
      tightenToMask: true,
      tightPadding: 6,
      minFillRatio: 0.15,
      nmsIou: 0.45
    }, opts||{});
    try {
      src = cv.matFromImageData(imageData);
      gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      th = new cv.Mat(); cv.adaptiveThreshold(gray, th, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, params.adaptiveBlock|0, params.adaptiveC|0);
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(params.morphKernel|0, params.morphKernel|0));
      close = new cv.Mat(); cv.morphologyEx(th, close, cv.MORPH_CLOSE, kernel);
      const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
      cv.findContours(close, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      edges = new cv.Mat(); cv.Canny(gray, edges, 100, 200);
      const pageArea = sw*sh || 1; const pageEdgeCnt = cv.countNonZero(edges); const pageEdgeDen = pageEdgeCnt/(pageArea||1);
      const hsv = new cv.Mat(); cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB); cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
      const channels = new cv.MatVector(); cv.split(hsv, channels);
      const sat = channels.get(1); const satMean = cv.mean(sat)[0]/255;
      
      // calcHist用のパラメータを正しい形式で作成
      const srcVec = new cv.MatVector();
      srcVec.push_back(gray);
      const histChannels = [0];
      const histSize = [64];
      const ranges = [0, 256];
      const hist = new cv.Mat();
      const mask = new cv.Mat();
      cv.calcHist(srcVec, histChannels, mask, hist, histSize, ranges, false);
      srcVec.delete();
      mask.delete();
      
      let pageEntropy=0; for(let i=0;i<64;i++){ const p=hist.data32F[i]/(pageArea||1); if(p>0) pageEntropy -= p*Math.log2(p); }

      const candidates=[];
      for (let i=0;i<contours.size();i++){
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        const {x,y,width:ww,height:hh} = rect; const area=ww*hh; const areaRatio=area/(pageArea||1);
        if (areaRatio < params.minAreaRatio) { cnt.delete(); continue; }
        if (ww < params.minBoxWHRatio*sw || hh < params.minBoxWHRatio*sh) { cnt.delete(); continue; }
        const roiGray = gray.roi(rect); const roiEdges = new cv.Mat(); cv.Canny(roiGray, roiEdges, 100, 200);
        const edgeRatio = cv.countNonZero(roiEdges)/(area||1); roiEdges.delete(); roiGray.delete();
        if (edgeRatio < params.edgeDensityMin) { cnt.delete(); continue; }
        const roiMask = close.roi(rect); const fillRatio = cv.countNonZero(roiMask)/(area||1); roiMask.delete();
        let nx=x, ny=y, nww=ww, nhh=hh;
        if (params.tightenToMask){ 
          const sub=close.roi(rect); 
          // findNonZeroの代わりに、マスクから直接バウンディングボックスを計算
          let minX=ww, minY=hh, maxX=0, maxY=0;
          let found=false;
          for(let py=0; py<hh; py++){
            for(let px=0; px<ww; px++){
              if(sub.ucharAt(py, px) > 0){
                found=true;
                if(px<minX) minX=px;
                if(px>maxX) maxX=px;
                if(py<minY) minY=py;
                if(py>maxY) maxY=py;
              }
            }
          }
          if(found){
            nx=Math.max(0, x+minX-params.tightPadding); 
            ny=Math.max(0, y+minY-params.tightPadding); 
            nww=Math.min(sw, x+maxX+1+params.tightPadding)-nx; 
            nhh=Math.min(sh, y+maxY+1+params.tightPadding)-ny;
          }
          sub.delete(); 
        }
        if (nww<=4||nhh<=4){ cnt.delete(); continue; }
        const tRect=new cv.Rect(nx,ny,nww,nhh); const tMask=close.roi(tRect); const tightFill=cv.countNonZero(tMask)/((nww*nhh)||1); tMask.delete();
        if (tightFill < params.minFillRatio) { cnt.delete(); continue; }
        const X = Math.floor(nx*scaleX), Y=Math.floor(ny*scaleY); const X1=Math.ceil((nx+nww)*scaleX), Y1=Math.ceil((ny+nhh)*scaleY);
        const BW=Math.max(0,X1-X), BH=Math.max(0,Y1-Y); if (BW>0&&BH>0) candidates.push({ x:X, y:Y, w:BW, h:BH, area:BW*BH, edgeRatio, fillRatio:tightFill });
        cnt.delete();
      }
      const removeContained=(items)=>{ const arr=items.slice().sort((a,b)=>b.area-a.area); const kept=[]; for(const a of arr){ let contained=false; for(const b of kept){ const x0=Math.max(a.x,b.x), y0=Math.max(a.y,b.y), x1=Math.min(a.x+a.w,b.x+b.w), y1=Math.min(a.y+a.h,b.y+b.h); const iw=Math.max(0,x1-x0), ih=Math.max(0,y1-y0); const inter=iw*ih; if(!inter) continue; const cover=inter/(a.w*a.h||1); if(cover>=0.85){ contained=true; break; } } if(!contained) kept.push(a);} return kept; };
      const iou=(a,b)=>{ const x0=Math.max(a.x,b.x), y0=Math.max(a.y,b.y), x1=Math.min(a.x+a.w,b.x+b.w), y1=Math.min(a.y+a.h,b.y+b.h); const iw=Math.max(0,x1-x0), ih=Math.max(0,y1-y0); const inter=iw*ih; if(!inter) return 0; const ua=a.w*a.h + b.w*b.h - inter; return inter/(ua||1); };
      const nms=(items)=>{ const arr=items.slice().sort((a,b)=>b.area-a.area); const kept=[]; while(arr.length){ const cur=arr.shift(); let overlap=false; for(const k of kept){ if(iou(cur,k) >= 0.45){ overlap=true; break; } } if(!overlap) kept.push(cur);} return kept; };
      const pruned = removeContained(candidates); const finalBoxes=nms(pruned).sort((a,b)=>b.area-a.area);
      const top2Avg = finalBoxes.length>=2 ? (finalBoxes[0].area + finalBoxes[1].area)/2 : (finalBoxes[0]?.area||1);
      const filtered = finalBoxes.filter((b,idx)=> idx<2 || (b.fillRatio>=0.35 && b.edgeRatio>=params.edgeDensityMin*1.2 && b.area >= 0.40*top2Avg));
      hist.delete(); channels.delete(); hsv.delete(); hierarchy.delete(); contours.delete();
      return { ok:true, boxes: filtered, page: { edgeDensity: pageEdgeDen, avgSat: satMean, entropy: pageEntropy } };
    } catch(e){
      return { ok:false, error: String(e&&e.message||e) };
    } finally {
      try{src?.delete();}catch(_){} try{gray?.delete();}catch(_){} try{th?.delete();}catch(_){} try{kernel?.delete();}catch(_){} try{close?.delete();}catch(_){} try{edges?.delete();}catch(_){}
    }
  }

  onReady(function(){
    try { self.cv.ready = true; } catch(_) {}
    try { parent.postMessage({ type: 'opencvReady' }, '*'); } catch(_) {}
  });

  self.addEventListener('message', function(ev){
    const d = ev.data||{};
    if (d.type === 'opencvDetect'){
      try {
        const res = detect(d.imageData, d.canvasWidth, d.canvasHeight, d.options||{});
        try { parent.postMessage({ type:'opencvResult', ok: !!res.ok, boxes: res.boxes||[], page: res.page||{}, error: res.error }, '*'); } catch(_) {}
      } catch(e){
        try { parent.postMessage({ type:'opencvResult', ok:false, error: String(e&&e.message||e) }, '*'); } catch(_) {}
      }
    }
  });
})();
