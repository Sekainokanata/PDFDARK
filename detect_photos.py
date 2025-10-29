# detect_photos.py  (tight 化 + 小カーネル適用バージョン)
# 使い方は従来通り:
# python detect_photos.py /path/to/file.pdf
# python detect_photos.py /path/to/folder/ --out /path/to/outdir

import os
import glob
import io
import argparse
from pathlib import Path
import fitz  # PyMuPDF
from PIL import Image
import numpy as np
import cv2

# --- パラメータ（必要に応じて調整してね） ---
RASTERIZE_SCALE = 4.0        # 解像度倍率（上げると精度↑だが重くなる）
MIN_AREA_RATIO = 0.005       # 画像全体に対する最小面積 (候補の除外閾値)
MIN_BOX_WH_RATIO = 0.08      # 幅・高さが画像に対して最低何割か
EDGE_DENSITY_THRESH = 0.008  # バウンディングボックス内のエッジ密度の閾値
MORPH_KERNEL_SIZE = (9,9)    # クロージングのカーネル（小さめにして過剰結合を抑える）
ADAPTIVE_THRESH_BLOCK = 51
ADAPTIVE_THRESH_C = 10

# Tighten 関連
TIGHTEN_TO_MASK = True       # 輪郭->マスクの非ゼロ領域で tight bbox にするか
TIGHT_PADDING = 6            # tight bbox に付ける余白(ピクセル)
MIN_FILL_RATIO = 0.15        # tight bbox 内のマスク被覆率がこれ未満なら除外

# デフォルトの出力ディレクトリ名
DEFAULT_OUT_DIR_NAME = "outputs"

# --- ヘルパー ---
def pil_from_pixmap(pix):
    """fitz.Pixmap -> PIL.Image"""
    fmt = "png"
    img_bytes = pix.tobytes(fmt)
    return Image.open(io.BytesIO(img_bytes))

def ensure_outdir(out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)

def safe_imwrite(path: Path, image: np.ndarray) -> bool:
    """cv2.imwrite が失敗する環境対策のセーフセーブ"""
    try:
        ok = cv2.imwrite(str(path), image)
        if ok:
            return True
    except Exception:
        pass
    ext = path.suffix.lower()
    ext = ".png" if ext == "" else ext
    success, buf = cv2.imencode(ext, image)
    if not success:
        return False
    try:
        with open(path, "wb") as f:
            f.write(buf.tobytes())
        return True
    except Exception:
        return False

def detect_photo_candidates(cv_img):
    """
    画像（BGR）を受け取って、写真っぽい領域の候補（x,y,w,h,edge_ratio,fill_ratio）リストを返す
    （tighten して返す）
    """
    h, w = cv_img.shape[:2]
    img_area = h * w

    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

    # 適応二値化（文字は細かく、写真は塊になることを利用）
    th = cv2.adaptiveThreshold(gray, 255,
                               cv2.ADAPTIVE_THRESH_MEAN_C,
                               cv2.THRESH_BINARY_INV,
                               ADAPTIVE_THRESH_BLOCK, ADAPTIVE_THRESH_C)

    # モルフォロジーで塊化（kernelは小さめ）
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, MORPH_KERNEL_SIZE)
    close = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel)

    # 輪郭抽出
    cnts, _ = cv2.findContours(close, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for c in cnts:
        x,y,ww,hh = cv2.boundingRect(c)
        area = ww*hh
        if area < MIN_AREA_RATIO * img_area:
            continue
        if ww < MIN_BOX_WH_RATIO * w or hh < MIN_BOX_WH_RATIO * h:
            continue

        # エッジ密度（写真はテクスチャが多い）
        roi_gray = gray[y:y+hh, x:x+ww]
        if roi_gray.size == 0:
            continue
        edges = cv2.Canny(roi_gray, 100, 200)
        edge_ratio = (edges > 0).sum() / (ww*hh + 1e-9)
        if edge_ratio < EDGE_DENSITY_THRESH:
            # エッジが少ない -> 写真じゃない可能性が高いので除外
            continue

        # マスク領域（close の該当部分）で fill ratio を計算
        roi_mask = close[y:y+hh, x:x+ww]
        fill_ratio = (roi_mask > 0).sum() / (ww*hh + 1e-9)

        # Tighten: マスク内の非ゼロピクセルの tight bbox を作る
        if TIGHTEN_TO_MASK:
            ys, xs = np.where(roi_mask > 0)
            if len(xs) > 0 and len(ys) > 0:
                minx = int(xs.min()); maxx = int(xs.max())
                miny = int(ys.min()); maxy = int(ys.max())
                # グローバル座標に変換して padding を追加
                nx = max(0, x + minx - TIGHT_PADDING)
                ny = max(0, y + miny - TIGHT_PADDING)
                nxx = min(w, x + maxx + 1 + TIGHT_PADDING)
                nyy = min(h, y + maxy + 1 + TIGHT_PADDING)
                nww = nxx - nx
                nhh = nyy - ny
                if nww <= 4 or nhh <= 4:
                    continue
                tight_roi_mask = close[ny:ny+nhh, nx:nx+nww]
                tight_fill_ratio = (tight_roi_mask > 0).sum() / (nww*nhh + 1e-9)
                if tight_fill_ratio < MIN_FILL_RATIO:
                    # tight bbox の被覆率が小さければ除外
                    continue
                # tight bbox を追加
                candidates.append((nx, ny, nww, nhh, edge_ratio, tight_fill_ratio))
                continue

        # TIGHTEN_TO_MASK = False の場合の通常追加
        if fill_ratio < MIN_FILL_RATIO:
            continue
        candidates.append((x, y, ww, hh, edge_ratio, fill_ratio))

    # 面積の大きい順に
    candidates.sort(key=lambda t: t[2]*t[3], reverse=True)
    return candidates, close

def process_pdf(path_pdf: str, out_dir: Path):
    print(f"Processing: {path_pdf}")
    doc = fitz.open(path_pdf)
    base_name = Path(path_pdf).stem

    for p in range(len(doc)):
        page = doc.load_page(p)
        mat = fitz.Matrix(RASTERIZE_SCALE, RASTERIZE_SCALE)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pil_img = pil_from_pixmap(pix)
        cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        h, w = cv_img.shape[:2]

        candidates, mask_close = detect_photo_candidates(cv_img)

        # 描画用コピー
        out_img = cv_img.copy()

        # 赤色で矩形を描画（BGR: (0,0,255)）
        for idx, (x,y,ww,hh,edge_ratio,fill_ratio) in enumerate(candidates):
            cv2.rectangle(out_img, (x,y), (x+ww, y+hh), (0,0,255), 3)
            # デバッグで数値を出す（欲しくなければコメントアウト）
            cv2.putText(out_img, f"{idx+1}:{edge_ratio:.3f}/{fill_ratio:.2f}", (x+6, y+16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,0,255), 1, cv2.LINE_AA)

        # 保存
        ensure_outdir(out_dir)
        out_fname = f"{base_name}_page{p+1}_detected_tight.png"
        out_path = out_dir / out_fname
        if safe_imwrite(out_path, out_img):
            print(f"  saved: {out_path.resolve()}  (candidates: {len(candidates)})")
        else:
            print(f"  FAILED to save: {out_path.resolve()}  (candidates: {len(candidates)})")

        # 切り出しも保存
        for idx, (x,y,ww,hh,edge_ratio,fill_ratio) in enumerate(candidates):
            crop = cv_img[y:y+hh, x:x+ww]
            crop_fname = f"{base_name}_page{p+1}_crop_tight{idx+1}.png"
            crop_path = out_dir / crop_fname
            if not safe_imwrite(crop_path, crop):
                print(f"  FAILED to save crop: {crop_path.resolve()}")
        pil_img.close()

def collect_pdf_paths_from_args(paths):
    """引数で受け取ったパス群から処理対象のPDFパスリストを作る"""
    pdf_paths = []
    for p in paths:
        ppath = Path(p)
        if ppath.is_file() and ppath.suffix.lower() == ".pdf":
            pdf_paths.append(str(ppath))
        elif ppath.is_dir():
            for f in sorted(ppath.glob("*.pdf")):
                pdf_paths.append(str(f))
        else:
            matched = glob.glob(p)
            for m in matched:
                mp = Path(m)
                if mp.is_file() and mp.suffix.lower() == ".pdf":
                    pdf_paths.append(str(mp))
    # 重複除去
    seen = []
    for x in pdf_paths:
        if x not in seen:
            seen.append(x)
    return seen

def main():
    parser = argparse.ArgumentParser(description="PDFのページ画像から写真領域を推定して赤枠で保存 (tight版)")
    parser.add_argument("paths", nargs="+", help="処理するPDFのパス（ファイルまたはフォルダ）。ワイルドカードや複数指定可。")
    parser.add_argument("--out", dest="out_dir", default=None,
                        help="出力先ディレクトリ（指定しない場合は各PDFファイルと同じフォルダ内の 'outputs' に保存）")
    args = parser.parse_args()

    pdfs = collect_pdf_paths_from_args(args.paths)
    if not pdfs:
        print("指定されたパスからPDFが見つかりません。ファイル名やディレクトリを確認してね。")
        return

    for pdf in pdfs:
        try:
            if args.out_dir is not None:
                out_dir = Path(args.out_dir)
            else:
                out_dir = Path(pdf).parent / DEFAULT_OUT_DIR_NAME
            print(f"Output directory: {out_dir.resolve()}")
            process_pdf(pdf, out_dir)
        except Exception as e:
            print(f"Error processing {pdf}: {e}")

if __name__ == "__main__":
    main()
