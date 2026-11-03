# 不具合修正メモ

このドキュメントは、PDFDARK拡張機能で発見・修正した不具合とその解決手法の記録である。

---

## 1. 特定のPDFページで `TypeError: bytes.subarray is not a function` が発生する

### 症状

タイリングパターン(塗りつぶしパターン)を含む図(飛行機の図・配線/ブロック図など)を含むPDFページを開くと、コンソールに以下のエラーが出力され、そのページのレンダリングが失敗する。

```
Error rendering page 2 TypeError: bytes.subarray is not a function
    at encode (pdf.js:16569:28)
    at convertImgDataToPng (pdf.js:16603:14)
    at SVGGraphics.paintInlineImageXObject (pdf.js:17796:22)
    at SVGGraphics.paintImageMaskXObject (pdf.js:17838:12)
    at SVGGraphics.executeOpTree (pdf.js:16982:18)
    at SVGGraphics.group (pdf.js:16762:12)
    at SVGGraphics.executeOpTree (pdf.js:17026:18)
    at SVGGraphics._makeTilingPattern (pdf.js:17413:12)
    at SVGGraphics._makeColorN_Pattern (pdf.js:17369:21)
    at SVGGraphics.setFillColorN (pdf.js:17332:37)
```

### 原因

この拡張機能は同梱の pdf.js 2.16.105 (`pdfjs/pdf.js`) の `SVGGraphics` を使い、各ページをSVGとして描画している(呼び出し元: [viewer/page_rendering/page-render.js:25-29](viewer/page_rendering/page-render.js#L25-L29))。

原因は拡張機能側のコードではなく、pdf.js 内部の `SVGGraphics` の PNG エンコード処理にある。

- 呼び出し経路(すべて pdf.js 内部):
  `setFillColorN → _makeColorN_Pattern → _makeTilingPattern → executeOpTree → group → executeOpTree → paintImageMaskXObject → paintInlineImageXObject → convertImgDataToPng → encode`
- `pdfjs/pdf.js` の `encode()` 関数は `const bytes = imgData.data;` として画像データを取得し、直後に `bytes.subarray(...)` を呼び出す。この処理は `imgData.data` が `Uint8Array`(typed array)であることを前提にしている。
- しかし、タイリングパターン内の画像マスクを処理する経路では、`imgData.data` が通常の `Array`(`subarray` メソッドを持たない)のまま渡ってくるケースがある。ページ2・8のようにパターン塗りつぶしを含む図がこの経路を通るため、例外が発生していた。

拡張機能側の `svgGfx.getSVG()` 呼び出し([viewer/page_rendering/page-render.js:29](viewer/page_rendering/page-render.js#L29))は画像データを一切加工しておらず、原因は完全に pdf.js 側にあることを確認済み。また `pdfjs/pdf.worker.js` 側には同じロジックの重複は存在しない。

### 修正内容

`pdfjs/pdf.js` の `encode()` 関数(16534行目付近)で、`imgData.data` が `subarray` を持たない場合に `Uint8Array` へ変換する防御的な変換を追加した。

```js
function encode(imgData, kind, forceDataSchema, isMask) {
  const width = imgData.width;
  const height = imgData.height;
  let bitDepth, colorType, lineSize;
  // タイリングパターン内の画像マスクでは imgData.data が Array のまま渡ることがあり、
  // subarray() を持たず TypeError になるため Uint8Array に変換する
  const bytes = typeof imgData.data.subarray === "function" ? imgData.data : Uint8Array.from(imgData.data);
  ...
```

- 既に `Uint8Array`/`Uint8ClampedArray` である通常ケース(`subarray` を持つ)は変換されず、従来通りの挙動を維持する。
- `subarray` を持たない場合のみ `Uint8Array.from()` で変換するため、通常のプレーン配列だけでなく `Uint8ClampedArray` のような「`subarray` を持つが `instanceof Uint8Array` は偽になる」型も誤って変換してしまうことがない。

### 検証結果

該当PDFのページ2・8を開いても `Error rendering page` がコンソールに出力されなくなり、パターン塗りつぶし部分も欠落せず正しく表示されることを確認した。

---

## 2. ズームイン後、横スクロールでページ内容を超えた先まで大きくスクロールできてしまう

### 症状

ズーム自体(中央を起点に拡大される挙動)は正常に動作するが、ズームインした状態で横スクロールすると、実際のページ内容を超えた先(何も描画されていない黒い領域)まで大きくスクロールできてしまう。Chrome標準PDFビューアなど一般的なPDFビューアでは、拡大後にスクロールできる範囲はページ端からごく僅かな余白までに制限されるが、この拡張機能ではその制限が効いていなかった。

### 原因

原因はCSSとUI初期化コードの2箇所の不整合だった。

**(1) `#viewer-pages`(pagesHolder)の幅が `100%` に固定されていた**

[viewer/UI/uiElements.js:316](viewer/UI/uiElements.js#L316)(修正前)で `pagesHolder.style.width = '100%'` が設定されていた。これにより `pagesHolder` は常にラッパー(`#viewer-container-wrapper`)の全幅を占有する箱になり、中の `.page`(実際のページ本体、幅はレンダリング時のピクセル固定値)は `align-items:center` でその箱の中に中央寄せされているだけの状態だった。つまり `pagesHolder` 自体のレイアウト上の幅は、実際のページ幅とは無関係に常にビューポート幅相当のまま固定されていた。

**(2) `#viewer-container-wrapper` の `display` がJSで `'block'` に上書きされていた**

CSS([style.css:58-67](style.css#L58-L67))では

```css
#viewer-container-wrapper {
    flex: 1 1 auto;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 20px;
}
```

と定義されていたが、[viewer/UI/shell.js:37-44](viewer/UI/shell.js#L37-L44)(修正前)の `Object.assign(wrapper.style, {...})` がインラインスタイルで `display: 'block'` を設定していた。インラインスタイルはCSSの `#id` セレクタより優先されるため、実際に適用される `display` は `block` になっており、CSS側の `justify-content` はブロックレイアウトでは意味を持たず無効化されていた。

**既存の余白最小化ロジックが機能していなかった**

[viewer/toolbar+ctrl/zoom.js:105-129](viewer/toolbar+ctrl/zoom.js#L105-L129) には、ズームでページがビューポート幅を超えたときに `pagesHolder.offsetWidth` を「実際のコンテンツ幅」として測定し、`wrapper.style.justifyContent` を `'flex-start'`/`'center'` に切り替えつつ、`pagesHolder` に `marginLeft`/`marginRight` を設定して余白を最小化する、Chrome標準ビューアの挙動を模したロジックが既に実装されていた。しかし、

- `pagesHolder.offsetWidth` は原因(1)により常にラッパーの全幅を返してしまい、実際のページ幅とズレた値を元に余白が計算されていた
- `wrapper.style.justifyContent` の切り替えは原因(2)によりそもそも無効化されていた

という2つの理由により、このロジックが正しく機能せず、ズーム後もページ端を大きく超えた領域までスクロール可能な状態が残っていた。

このロジック自体の設計(オーバーフロー時に `justify-content` を切り替えつつ手動でマージンを計算する手法)は、`margin: auto` を使った中央寄せがオーバーフロー時に片側の内容へスクロールで到達できなくなる、というCSSの既知の問題を避けるための正しいアプローチだった。そのため、ロジックを作り直すのではなく、土台となっていた上記2箇所の不整合を修正することで、既存のロジックをそのまま正しく機能させる方針を取った。

### 修正内容

**[viewer/UI/uiElements.js:316](viewer/UI/uiElements.js#L316)**

```js
// 幅を100%固定にするとズーム時の実コンテンツ幅の計測(offsetWidth)が狂うため、内容にフィットさせる
pagesHolder.style.width = 'fit-content';
```

`width: '100%'` を `width: 'fit-content'` に変更。これにより `pagesHolder` のレイアウト幅が中の `.page`(最大幅のページ)にフィットするようになり、`offsetWidth` が実際のページ幅を正しく反映するようになった。

**[viewer/UI/shell.js:37-47](viewer/UI/shell.js#L37-L47)**

```js
// display:'block'だとjustifyContentが無効化され、zoom.js側の余白最小化ロジックが機能しないためflexにする
Object.assign(wrapper.style, {
  flex: '1 1 auto',
  overflowX: 'auto',
  overflowY: 'auto',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '20px',
  background: '#282828'
});
```

`display: 'block'` を `display: 'flex'` に変更し、CSSで意図されていた `justifyContent: 'center'` と `alignItems: 'flex-start'` も明示的にインラインで設定した(このプロジェクトはUI初期化をJS側で一元管理する方針のため、CSSへの依存を避けてJS側で完結させている)。

`zoom.js` 自体には手を加えていない。上記2箇所の修正により、既存の余白最小化ロジック(`offsetWidth` 測定 → `justifyContent` 切替 → `marginLeft`/`marginRight` 設定)が正しい入力値をもとに動作するようになった。

### 検証結果

- ズーム100%の初期表示でページが画面中央に表示されること
- ズームイン時、拡大されたページ周囲の余白が最小限になり、Chrome標準PDFビューアと同様にページ端の少し先までしか横スクロールできなくなったこと
- ズームアウト時も引き続きページが中央寄せされること
- fit-width / fit-page ボタンの挙動に影響がないこと

を確認し、いずれも問題が解消されたことを確認した。
