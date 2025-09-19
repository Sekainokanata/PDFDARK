# PDFDARK Viewer 分割構成メモ

本リファクタでは `viewer.js` を以下の複数ファイルに分割し、責務ごとに整理しました。すべて従来どおり `<script>` 羅列で読み込む構成（ES Modules 未使用）です。

- `viewer/scroll.js`: ページスクロールのユーティリティ（`scrollToPageTopByIndex` 等）
- `viewer/ui.js`: ツールバー・ページホルダなど UI シェルの生成（`window.__viewer_ui` を提供）
- `viewer/renderer.js`: PDF 権限チェック、SVGスマート反転、テキストレイヤ、画像高品質反転、ハイライトトグルの実装
- `viewer/toolbar.js`: ズーム/フィット/ページ移動、モード切替（オリジナル/フォント調整）、ダウンロード/印刷の配線
- `viewer/main.js`: 旧 `startViewer` の本体。PDF を fetch -> `pdfjsLib.getDocument` -> UI 構築 -> 各ページ描画 -> 初期スケール/モード適用

`viewer.html` の読み込み順も更新済みです。

## 起動手順

- 拡張の `viewer.html` を開く（`?file=<PDFのURL>` をクエリに指定）。
- `viewer-run.js` が `startViewer()` を自動実行します。
- `manifest.json` では `pdfjs/pdf.worker.js` と `pdfjs/cmaps/*` を `web_accessible_resources` として公開済みです。

## 補足

- 既存のグローバル関数名は極力維持し、DOM 依存部も互換動作するよう配慮しています。
- 画像の反転では大きすぎる画像は CSS filter にフォールバックします。
- ハイライトトグルは新規ページ追加にも自動適用されるよう MutationObserver を導入しました。
- バグに気づいた場合は `viewer/main.js` を起点に、該当モジュールへ辿って修正してください。
