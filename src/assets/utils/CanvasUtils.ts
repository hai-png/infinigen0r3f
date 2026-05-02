/**
 * SSR-Safe Canvas Utilities
 *
 * Provides a safe way to create HTML Canvas elements that works both
 * in the browser and during Next.js server-side rendering (SSR).
 *
 * During SSR, `document` is not available. These utilities defer canvas
 * creation to runtime and throw a clear error if canvas is needed but
 * the DOM is unavailable.
 */

/**
 * Check if the DOM is available (i.e., we are in a browser environment).
 */
export function isDOMAvailable(): boolean {
  return typeof document !== 'undefined';
}

/**
 * Create an HTML Canvas element safely.
 *
 * In the browser, this creates and returns a real canvas element.
 * During SSR, this throws an error with a clear message, because
 * canvas-based texture generation cannot proceed without a DOM.
 *
 * Callers should ensure this is only invoked inside `generate()` methods
 * that run at browser runtime, not at module initialization time.
 */
export function createCanvas(): HTMLCanvasElement {
  if (!isDOMAvailable()) {
    throw new Error(
      'createCanvas() was called during SSR. ' +
      'Canvas creation must be deferred to browser runtime (e.g., inside a generate() call).'
    );
  }
  return document.createElement('canvas');
}
