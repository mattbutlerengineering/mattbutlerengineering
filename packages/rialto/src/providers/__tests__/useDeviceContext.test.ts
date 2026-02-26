import { renderHook } from '@testing-library/react';
import { useDeviceContext, type DeviceContext } from '../useDeviceContext';

/* ── Helpers ─────────────────────────────────── */

type ChangeListener = (event: { matches: boolean }) => void;

/**
 * Creates a matchMedia mock that tracks listeners and allows
 * simulating media query changes.
 */
function createMatchMediaMock() {
  const listeners = new Map<string, Set<ChangeListener>>();
  const matches = new Map<string, boolean>();

  const mock = vi.fn().mockImplementation((query: string) => {
    if (!listeners.has(query)) listeners.set(query, new Set());
    return {
      matches: matches.get(query) ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, cb: ChangeListener) => {
        listeners.get(query)!.add(cb);
      }),
      removeEventListener: vi.fn((_: string, cb: ChangeListener) => {
        listeners.get(query)!.delete(cb);
      }),
      dispatchEvent: vi.fn(),
    };
  });

  return {
    mock,
    setMatch(query: string, value: boolean) {
      matches.set(query, value);
    },
    fireChange(query: string, value: boolean) {
      matches.set(query, value);
      listeners.get(query)?.forEach((cb) => cb({ matches: value }));
    },
  };
}

/* ── Reset module state between tests ────────── */

// The hook uses module-level singletons, so we need fresh imports each test
beforeEach(() => {
  vi.resetModules();
});

/* ── Tests ───────────────────────────────────── */

describe('useDeviceContext', () => {
  it('returns SSR-safe defaults', () => {
    const { result } = renderHook(() => useDeviceContext());

    expect(result.current).toEqual<DeviceContext>({
      pointer: 'fine',
      viewport: 'desktop',
      reducedMotion: false,
      colorScheme: 'light',
      saveData: false,
    });
  });

  it('detects coarse pointer', async () => {
    const { mock, setMatch } = createMatchMediaMock();
    setMatch('(pointer: coarse)', true);
    Object.defineProperty(window, 'matchMedia', {
      value: mock,
      writable: true,
    });

    // Re-import to get a fresh module with the new matchMedia
    const { useDeviceContext: freshHook } = await import('../useDeviceContext');
    const { result } = renderHook(() => freshHook());

    expect(result.current.pointer).toBe('coarse');
  });

  it('detects dark color scheme', async () => {
    const { mock, setMatch } = createMatchMediaMock();
    setMatch('(prefers-color-scheme: dark)', true);
    Object.defineProperty(window, 'matchMedia', {
      value: mock,
      writable: true,
    });

    const { useDeviceContext: freshHook } = await import('../useDeviceContext');
    const { result } = renderHook(() => freshHook());

    expect(result.current.colorScheme).toBe('dark');
  });

  it('detects reduced motion', async () => {
    const { mock, setMatch } = createMatchMediaMock();
    setMatch('(prefers-reduced-motion: reduce)', true);
    Object.defineProperty(window, 'matchMedia', {
      value: mock,
      writable: true,
    });

    const { useDeviceContext: freshHook } = await import('../useDeviceContext');
    const { result } = renderHook(() => freshHook());

    expect(result.current.reducedMotion).toBe(true);
  });

  it('detects mobile viewport', async () => {
    const { mock, setMatch } = createMatchMediaMock();
    setMatch('(max-width: 479px)', true);
    Object.defineProperty(window, 'matchMedia', {
      value: mock,
      writable: true,
    });

    const { useDeviceContext: freshHook } = await import('../useDeviceContext');
    const { result } = renderHook(() => freshHook());

    expect(result.current.viewport).toBe('mobile');
  });

  it('detects tablet viewport', async () => {
    const { mock, setMatch } = createMatchMediaMock();
    setMatch('(min-width: 480px) and (max-width: 767px)', true);
    Object.defineProperty(window, 'matchMedia', {
      value: mock,
      writable: true,
    });

    const { useDeviceContext: freshHook } = await import('../useDeviceContext');
    const { result } = renderHook(() => freshHook());

    expect(result.current.viewport).toBe('tablet');
  });
});
