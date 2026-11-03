// page-render.js
// 個別ページのレンダリング: SVG生成、テキストレイヤ付与、ダークモード反転、PNG変換

window.renderPageContent = async function renderPageContent(p, pdf, container, allowCopy, curMode) {
    // 二重レンダリング防止
    if (window.__viewer_renderedPages && window.__viewer_renderedPages.has(p)) return;
    
    // 既存のプレースホルダーを検索
    const existingPages = container.querySelectorAll('.page');
    let placeholderWrapper = null;
    existingPages.forEach(pageDiv => {
      const pageNum = parseInt(pageDiv.getAttribute('data-page-num'));
      if (pageNum === p) {
        placeholderWrapper = pageDiv.closest('.page-wrapper');
      }
    });
    
    let hadShadingError = false;
    let shadingErrorDetails = null;
    
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const opList = await page.getOperatorList();
      const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
      let svg = null;
      
      try {
        svg = await svgGfx.getSVG(opList, viewport);
      } catch(svgError) {
        // SVGレンダリング中のShadingエラーを検出
        if (svgError && svgError.message && svgError.message.includes('Unknown IR type: Shading')) {
          hadShadingError = true;
          shadingErrorDetails = {
            error: svgError,
            operatorList: opList
          };
          
          // エラー詳細をログ出力
          console.warn(`Page ${p}: Shading rendering failed - attempting fallback`);
          console.warn(`Error details:`, svgError.message);
          
          // オペレーターリストを解析して問題の文字を特定
          try {
            const ops = opList.fnArray || [];
            const args = opList.argsArray || [];
            console.group(`Page ${p}: Operator analysis`);
            
            ops.forEach((op, idx) => {
              const opName = pdfjsLib.OPS ? Object.keys(pdfjsLib.OPS).find(k => pdfjsLib.OPS[k] === op) : op;
              if (opName && (opName.includes('Text') || opName.includes('Font') || opName.includes('Shading'))) {
                console.log(`Op[${idx}]: ${opName}`, args[idx]);
              }
            });
            console.groupEnd();
          } catch(e) {
            console.warn('Could not analyze operator list:', e);
          }
          
          // フォールバック: 空のSVGを作成
          svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          svg.setAttribute('version', '1.1');
        } else {
          throw svgError; // 他のエラーは再スロー
        }
      }

      // まずテキスト有無を判定
      let textContent = null; try { textContent = await page.getTextContent(); } catch(e){ console.warn('getTextContent failed for page', p, e); }
      function looksGoodTextContent(tc){ if (!tc || !tc.items || tc.items.length === 0) return false; const sample = tc.items.slice(0, 20).map(i => i.str).join(''); return /[0-9A-Za-z\u3000-\u30FF\u4E00-\u9E0E0E0]/.test(sample); }
      
      // SVG内のtext/tspanのうち、空白以外の文字があり、かつ0x0でないものを確認
      const svgTextElems = svg.querySelectorAll('text, tspan');
      let svgHasNonEmptyText = false;
      for (const n of svgTextElems) {
        const txt = (n.textContent || '').replace(/\s+/g, '');
        if (txt.length > 0) {
          // svg:textが0x0サイズでないかチェック
          if (n.tagName.toLowerCase().includes('text')) {
            const bbox = n.getBBox ? n.getBBox() : null;
            if (bbox && bbox.width === 0 && bbox.height === 0) {
              continue; // 0x0のtext要素はスキップ
            }
          }
          svgHasNonEmptyText = true;
          break;
        }
      }
      
      // SVG内にpath要素が存在し、かつそれがテキスト用と思われるかチェック
      // (g要素のtransform属性にマイナスのスケールがある場合、テキストの可能性が高い)
      const svgPathElems = svg.querySelectorAll('path');
      let hasSvgPaths = false;
      if (svgPathElems.length > 0) {
        // path要素の親g要素をチェック
        for (const pathElem of svgPathElems) {
          const parentG = pathElem.closest('g');
          if (parentG) {
            const transform = parentG.getAttribute('transform');
            // matrix(a b c d e f)でc(y方向のスケール)が負の場合、テキストの可能性が高い
            if (transform && /matrix\([^)]*-[\d.]+[^)]*\)/.test(transform)) {
              hasSvgPaths = true;
              break;
            }
          }
        }
      }
      
      // テキストレイヤー、SVG内テキスト、またはテキスト用path要素のいずれかがあればSVG描画を使用
      const hasTextContent = !!(textContent && Array.isArray(textContent.items) && textContent.items.length > 0);
      const hasAnyText = hasTextContent || svgHasNonEmptyText || hasSvgPaths;
      // hasText はテキストの存在有無のみで判定（allowCopy はテキストレイヤの表示可否に使う）
      const hasText = looksGoodTextContent(textContent);

      // ページ要素をこの時点で用意
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.setAttribute('data-page-num', p);
      pageDiv.setAttribute('data-base-width', viewport.width);
      pageDiv.setAttribute('data-base-height', viewport.height);
      // Shadingエラーフラグを保存
      if (hadShadingError) {
        pageDiv.setAttribute('data-shading-error', 'true');
      }
      pageDiv.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;transform-origin:0 0;overflow:visible;display:block;position:relative`;
      const paper = document.createElement('div');
      paper.className = 'paper';
      paper.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;transform-origin:0 0`;
      const footer = document.createElement('div'); footer.className = 'page-footer'; footer.textContent = `Page ${p} / ${pdf.numPages}`;
      
      // ページラッパー（page + footer を含む）
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'page-wrapper';
      pageWrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';

      // 常にSVG描画を使用（allowCopy=false でもベクター表示を維持）
      if (hasAnyText) {
        // 即時描画
        try {
          svg.style.width = viewport.width + 'px';
          svg.style.height = viewport.height + 'px';
          svg.setAttribute('width', viewport.width);
          svg.setAttribute('height', viewport.height);
        } catch(_) {}
        paper.appendChild(svg);
        pageDiv.appendChild(paper);
        pageWrapper.appendChild(pageDiv);
        pageWrapper.appendChild(footer);
        
        // プレースホルダーがあれば置き換え、なければ追加
        if (placeholderWrapper) {
          placeholderWrapper.replaceWith(pageWrapper);
        } else {
          container.appendChild(pageWrapper);
        }

        // ここから描画後の調整（ダークモードON時のみスマート反転）
        if (window.__viewer_darkModeEnabled) {
          window.invertSvgColorsSmart(svg, { satThreshold: 0.15 });
        }
        // テキストレイヤ: textContent があれば常に生成（allowCopy=false でもオーバーレイモードのため必要）
        if (textContent && textContent.items && textContent.items.length > 0) {
          const wantForceVisible = hadShadingError || (curMode === 'overlay');
          const overlayColor = window.__viewer_darkModeEnabled ? '#E0E0E0' : '#222222';
          
          // Shadingエラー時は詳細ログを出力
          if (hadShadingError) {
            console.group(`Page ${p}: Shading fallback - rendering text layer`);
            console.log('Text items:', textContent.items.length);
            textContent.items.slice(0, 10).forEach((item, idx) => {
              console.log(`  [${idx}] "${item.str}" at (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)})`);
            });
            if (textContent.items.length > 10) {
              console.log(`  ... and ${textContent.items.length - 10} more items`);
            }
            console.groupEnd();
          }
          
          // Shadingエラー時はSVGテキストとの重複チェックを無効化(常に表示)
          const makeTransparent = hadShadingError ? false : true;
          window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: makeTransparent, color: overlayColor, allowCopy: allowCopy });
          // ページにallowCopy状態を保存（toolbar.jsで参照）
          pageDiv.setAttribute('data-allow-copy', allowCopy ? 'true' : 'false');
          if (wantForceVisible) { const svgElem = pageDiv.querySelector('svg'); if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; }); } }
        }
        if (window.__viewer_darkModeEnabled && !hadShadingError) {
          // ズーム中は高品質画像処理をスキップしてパフォーマンス優先
          if (!window.__viewer_isZooming) {
            await window.processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 });
            try { console.log('ノーマル反転対象です'); } catch(_) {}
          } else {
            console.log(`Page ${p}: Skipped processSvgImagesHighQuality during zoom`);
          }
        }
              } else {
        // ズーム中はPNG変換をスキップしてパフォーマンス優先
        if (!window.__viewer_isZooming) {
          try {
            await window.convertPageToPng(page, viewport, paper);
          } catch (e) {
            console.warn('convertPageToPng error', e);
          }
        } else {
          console.log(`Page ${p}: Skipped convertPageToPng during zoom`);
        }
        pageDiv.appendChild(paper);
        pageWrapper.appendChild(pageDiv);
        pageWrapper.appendChild(footer);
        
        // プレースホルダーがあれば置き換え、なければ追加
        if (placeholderWrapper) {
          placeholderWrapper.replaceWith(pageWrapper);
        } else {
          container.appendChild(pageWrapper);
        }
      }
      if (hasText && !hadShadingError) {
        const wantForceVisible = (curMode === 'overlay');
        const overlayColor2 = window.__viewer_darkModeEnabled ? '#E0E0E0' : '#222222';
        window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, { forceVisible: wantForceVisible, makeTransparentIfSvgTextExists: true, color: overlayColor2, allowCopy: allowCopy });
        // ページにallowCopy状態を保存（toolbar.jsで参照）
        pageDiv.setAttribute('data-allow-copy', allowCopy ? 'true' : 'false');
        if (wantForceVisible) { const svgElem = pageDiv.querySelector('svg'); if (svgElem) { svgElem.querySelectorAll('text, tspan').forEach(t => { if (!t.hasAttribute('data-original-fill')) { const f = t.getAttribute('fill'); if (f) t.setAttribute('data-original-fill', f); } t.style.visibility = 'hidden'; }); } }
      }

      // レンダリング完了後、ページオブジェクトをクリーンアップ
      try { page.cleanup(); } catch(_) {}

    } catch(err){ 
      console.error(`Error rendering page ${p}`, err);
    }
};
