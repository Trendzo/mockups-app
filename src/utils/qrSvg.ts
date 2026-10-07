import qrcode from 'qrcode-generator';

/**
 * QR code as a compact SVG string (pure JS — works in the app and under jest). Dark modules are merged
 * into horizontal runs in ONE <path>, so a label sheet with dozens of codes stays small enough to hand
 * to the print WebView. The viewBox is in modules (quiet zone included); size it with CSS.
 *
 * `margin` is the quiet zone in modules. The spec asks for 4; 2 is the pragmatic floor for a tag only
 * ~25mm tall (phone scanners read it fine), and 4 is available for bigger labels.
 */
export function qrSvg(text: string, opts: { margin?: number } = {}): string {
  const margin = opts.margin ?? 2;
  const qr = qrcode(0, 'M'); // auto version, medium error correction
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const total = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (qr.isDark(r, c)) {
        let len = 1;
        while (c + len < n && qr.isDark(r, c + len)) len++;
        d += `M${c + margin} ${r + margin}h${len}v1h-${len}z`;
        c += len;
      } else {
        c++;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
  );
}
