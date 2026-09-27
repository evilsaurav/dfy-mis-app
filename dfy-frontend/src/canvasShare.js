/**
 * Detects if the current user agent is running on an iOS device (iPhone, iPad, iPod)
 * or modern iPadOS reporting as a Mac with multi-touch.
 */
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

/**
 * Downloads a canvas image or triggers the native Apple Share Sheet on iOS.
 * 
 * On iOS devices:
 * - Uses navigator.share() with a File object so the user can tap "Save Image"
 *   to write directly to the native Camera Roll / Photos library, bypassing
 *   Safari's sandboxed file download manager.
 * - Gracefully handles AbortError (when user dismisses/cancels the share sheet).
 * 
 * On Android, Windows, Mac, or unsupported browsers:
 * - Seamlessly performs a standard <a download> click.
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename - e.g. "DFY_Achievement_Card.png"
 * @param {string} [title="Doctors For You"]
 * @returns {Promise<{ method: 'share'|'download', success: boolean, cancelled?: boolean }>}
 */
export async function downloadOrShareCanvas(canvas, filename, title = 'Doctors For You') {
  if (!canvas) {
    throw new Error('Canvas element is not available.');
  }

  const isIOS = isIOSDevice();

  // 1. Try Native Web Share on iOS devices (or anywhere files can be shared)
  if (isIOS && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const file = new File([blob], filename, { type: 'image/png' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title
          });
          return { method: 'share', success: true };
        }
      }
    } catch (shareErr) {
      // User tapped "Cancel" or dismissed the native share sheet
      if (shareErr.name === 'AbortError') {
        return { method: 'share', success: false, cancelled: true };
      }
      console.warn('Native share failed, falling back to direct download:', shareErr);
    }
  }

  // 2. Standard direct download fallback (Android, PC, Mac, or iOS fallback)
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return { method: 'download', success: true };
}
