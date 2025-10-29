# OpenCV.js (WASM) の配置

この拡張は OpenCV.js を同梱してブラウザ内で画像処理を実行します。以下の 2 ファイルを本ディレクトリに配置してください。

- opencv.js
- opencv_js.wasm

入手先（例）:
- OpenCV 公式リリース: https://github.com/opencv/opencv/releases/
  - Assets 内の `opencv.js` と `opencv_js.wasm` を取得（OpenCV 4.8+ 推奨）

注意:
- `opencv_js.wasm` は `opencv.js` と同じフォルダに置いてください（相対パスで読まれます）。
- 本拡張の `manifest.json` は両ファイルを `web_accessible_resources` に登録済みです。
- すでに `viewer.html` で `<script src="vendor/opencv/opencv.js"></script>` を読み込んでいます。配置後は拡張をリロードしてください。
- もし `opencv.js` を置かない場合は、内部のフォールバック（ピュアJS検出）で動作します。
