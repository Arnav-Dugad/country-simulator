/**
 * Test environment shims.
 *
 * jsdom does not implement the layout and media APIs that framer-motion and
 * recharts reach for. Without these the UI smoke tests fail on the environment
 * rather than on the code under test.
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }

  if (!('IntersectionObserver' in window)) {
    class IntersectionObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): [] {
        return [];
      }
    }
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IntersectionObserverStub;
  }

  if (!window.scrollTo) {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
  }

  // Recharts measures its container; jsdom reports zero for everything.
  // Give charts a non-zero box so they render instead of bailing out.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 900 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 480 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 480 });
}
