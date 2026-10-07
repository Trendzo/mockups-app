/**
 * Thin, crash-proof wrapper over react-native-print (system print dialog: Wi-Fi / Bluetooth / USB
 * printers, "Save as PDF", etc.).
 *
 * The native module may be absent — an older build, a platform without it, or jest. Every entry point
 * checks first and throws `PrintUnavailableError`, which the screens turn into a toast; nothing here can
 * crash the app by touching an unlinked module.
 *
 * react-native-print quirks worth knowing (0.11.0):
 *  - `print()` resolves when the print dialog is DISMISSED, with no hint whether anything was printed.
 *  - `filePath` must be a plain absolute path — a `file://` URI hangs the Android job (it is mistaken
 *    for a URL and fetched without credentials), so `printPdfFile` strips the scheme.
 *  - Android ignores CSS `@page` size: the paper size comes from the print dialog.
 */

export const PRINT_UNAVAILABLE_MESSAGE =
  'Printing isn’t available in this version of the app. Update the app to print.';

export class PrintUnavailableError extends Error {
  constructor() {
    super(PRINT_UNAVAILABLE_MESSAGE);
    this.name = 'PrintUnavailableError';
  }
}

interface PrintModule {
  print(options: { html?: string; filePath?: string; jobName?: string; isLandscape?: boolean }): Promise<unknown>;
}

let injected: PrintModule | null | undefined; // tests

/** For tests: pretend the native module is (or isn't) there. Pass `undefined` to go back to the real one. */
export function __setPrintModuleForTests(m: PrintModule | null | undefined): void {
  injected = m;
}

/** The linked native module, or null. Resolved lazily so a missing package/module never breaks import. */
export function getPrintModule(): PrintModule | null {
  if (injected !== undefined) return injected;
  try {
    const mod = require('react-native-print');
    const impl = mod?.default ?? mod;
    return impl && typeof impl.print === 'function' ? (impl as PrintModule) : null;
  } catch {
    return null;
  }
}

export const isPrintAvailable = (): boolean => getPrintModule() !== null;

function requireModule(): PrintModule {
  const m = getPrintModule();
  if (!m) throw new PrintUnavailableError();
  return m;
}

/** Open the print dialog for an HTML document. */
export async function printHtml(html: string, jobName = 'Trendzo'): Promise<void> {
  await requireModule().print({ html, jobName });
}

/** Open the print dialog for a PDF on disk (`/…` path or `file://` URI). */
export async function printPdfFile(path: string, jobName = 'Trendzo'): Promise<void> {
  await requireModule().print({ filePath: path.replace(/^file:\/\//, ''), jobName });
}

/** Toast copy for a failed print: the "update the app" text for a missing module, else the error. */
export function printFailureMessage(e: unknown, fallback = 'Couldn’t print'): string {
  if (e instanceof PrintUnavailableError) return PRINT_UNAVAILABLE_MESSAGE;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' && m ? m : fallback;
}
