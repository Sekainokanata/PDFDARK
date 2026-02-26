// copy-control.js
// コピー権限の検出とコピー操作のブロック

window.detectCopyPermission = async function detectCopyPermission(pdfDoc) {
  // 方針: 明確に COPY 権限が検出できた場合のみ true。それ以外（null/取得失敗/未知形式）は false とする（保守的）。
  try {
    const perms = await pdfDoc.getPermissions();
    const Flag = (typeof pdfjsLib !== 'undefined' && pdfjsLib.PermissionFlag) ? pdfjsLib.PermissionFlag : {};
    const COPY_FLAG = (Flag && typeof Flag.COPY === 'number') ? Flag.COPY : 16; // PDF.js 既定値のフォールバック

    if (Array.isArray(perms)) {
      // 数値フラグの配列を想定
      const nums = perms.filter(v => typeof v === 'number');
      if (nums.length > 0) {
        const canCopy = nums.includes(COPY_FLAG);
        return { canCopy, rawPerms: perms };
      }
      // 文字列等のフォーマットは非対応 → 保守的に false
      return { canCopy: false, rawPerms: perms };
    }

    // perms === null（非暗号 or 取得不能）でも true にしない。誤検出を避けるため保守的に false。
    return { canCopy: false, rawPerms: perms };
  } catch (e) {
    console.warn('detectCopyPermission failed; returning canCopy=false', e);
    return { canCopy: false, rawPerms: null, error: e?.message };
  }
};

window.installCopyBlockers = function installCopyBlockers(rootEl) {
  rootEl.style.userSelect = 'none'; rootEl.style.webkitUserSelect = 'none'; rootEl.style.MozUserSelect = 'none';
  function onCopy(e) { e.preventDefault(); try { e.clipboardData.setData('text/plain', ''); } catch (_) {} return false; }
  document.addEventListener('copy', onCopy); document.addEventListener('cut', onCopy);
  const onContext = (e) => e.preventDefault();
  rootEl.addEventListener('contextmenu', onContext);
  return () => {
    document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCopy);
    rootEl.removeEventListener('contextmenu', onContext);
    rootEl.style.userSelect = ''; rootEl.style.webkitUserSelect = ''; rootEl.style.MozUserSelect = '';
  };
};
