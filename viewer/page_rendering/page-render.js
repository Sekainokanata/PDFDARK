// page-render.js
// 個別ページのレンダリング: SVG生成、テキストレイヤ付与、ダークモード反転、PNG変換

window.renderPageContent = async function renderPageContent(p, pdf, container, allowCopy, curMode) {
    // 二重レンダリング防止
    if (window.__viewer_renderedPages && window.__viewer_renderedPages.has(p)) return 'already-rendered';
    
    // 既存のプレースホルダーを検索
    const placeholderWrapper = container.querySelector(`.page[data-page-num="${p}"]`)?.closest('.page-wrapper');
    
    let hadShadingError = false;
    let shadingErrorDetails = null;
    
    let page;
    let mountedWrapper;
    let preparedSvg;
    let stagingHost;
    const renderDarkMode = window.__viewer_darkModeEnabled;
    try {
      page = await pdf.getPage(p);
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
      preparedSvg = svg;

      // まずテキスト有無を判定
      let textContent = null; try { textContent = await page.getTextContent(); } catch(e){ console.warn('getTextContent failed for page', p, e); }
      
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
      paper.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;transform-origin:0 0;background:${renderDarkMode ? '#1e1e1e' : '#fff'}`;
      const footer = document.createElement('div'); footer.className = 'page-footer'; footer.textContent = `Page ${p} / ${pdf.numPages}`;
      
      // ページラッパー（page + footer を含む）
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'page-wrapper';
      pageWrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';

      function updateTextLayer() {
        let mode = curMode;
        try { mode = localStorage.getItem('viewerTextMode') || curMode; } catch (_) {}
        const forceVisible = hadShadingError || mode === 'overlay';
        window.renderTextLayerFromTextContent(textContent, viewport, pageDiv, {
          forceVisible,
          makeTransparentIfSvgTextExists: !hadShadingError,
          color: window.__viewer_darkModeEnabled ? '#E0E0E0' : '#222222',
          allowCopy,
        });
        pageDiv.setAttribute('data-allow-copy', String(allowCopy));
        if (forceVisible) {
          pageDiv.querySelectorAll('svg text, svg tspan').forEach(t => {
            if (!t.hasAttribute('data-original-fill')) {
              const fill = t.getAttribute('fill');
              if (fill) t.setAttribute('data-original-fill', fill);
            }
            t.style.visibility = 'hidden';
          });
        }
      }

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

        // computedStyle と SVG の寸法計算を使える状態で、画面には見せない。
        stagingHost = document.createElement('div');
        stagingHost.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
        stagingHost.appendChild(pageWrapper);
        document.body.appendChild(stagingHost);

        // 表示する前に色と画像の処理を済ませる。
        if (renderDarkMode) {
          window.invertSvgColorsSmart(svg, { satThreshold: 0.15 });
        }
        if (renderDarkMode && !hadShadingError) {
          if (window.__viewer_isZooming) return 'deferred';
          await window.processSvgImagesHighQuality(svg, { imageSatThreshold: 0.08, sampleMax: 200, sampleStep: 6, maxFullSizeForInvert: 2500 });
        }
      } else {
        if (window.__viewer_isZooming) return 'deferred';
        await window.convertPageToPng(page, viewport, paper);
        if (!paper.querySelector('canvas')) throw new Error('Canvas rendering produced no content');
        pageDiv.appendChild(paper);
        pageWrapper.appendChild(pageDiv);
        pageWrapper.appendChild(footer);
      }
      if (renderDarkMode !== window.__viewer_darkModeEnabled) return 'deferred';
      if (textContent && textContent.items && textContent.items.length > 0) {
        updateTextLayer();
      }
      if (placeholderWrapper) placeholderWrapper.replaceWith(pageWrapper);
      else container.appendChild(pageWrapper);
      mountedWrapper = pageWrapper;
      return 'rendered';
    } catch (err) {
      // 元の監視対象を戻し、部分的なページを残さない。
      if (mountedWrapper && placeholderWrapper) mountedWrapper.replaceWith(placeholderWrapper);
      else if (mountedWrapper) mountedWrapper.remove();
      throw err;
    } finally {
      stagingHost?.remove();
      if (!mountedWrapper && preparedSvg && window.objectUrlMap) {
        preparedSvg.querySelectorAll('image').forEach(image => {
          const processed = window.objectUrlMap.get(image);
          if (processed?.url?.startsWith('blob:')) URL.revokeObjectURL(processed.url);
          window.objectUrlMap.delete(image);
        });
      }
      try { page?.cleanup(); } catch (error) { console.warn('Page cleanup failed', error); }
    }
};
