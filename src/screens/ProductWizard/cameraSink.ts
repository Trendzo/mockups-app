/**
 * One-shot hand-off so screens outside the mockup flow (e.g. the variant card)
 * can reuse the styled in-app Capture screen. The caller registers a sink,
 * navigates to Capture with `sink: 'custom'`, and the captured photo's local
 * uri is delivered here instead of the capture draft.
 */
let handler: ((uri: string) => void) | null = null;

export function setCameraSink(h: (uri: string) => void): void {
  handler = h;
}

/** Returns and clears the registered sink (one-shot). */
export function takeCameraSink(): ((uri: string) => void) | null {
  const h = handler;
  handler = null;
  return h;
}
