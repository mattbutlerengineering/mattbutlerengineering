import { useState, useCallback } from 'react';

/* ── Types ───────────────────────────────────── */

export interface CookiePreferences {
  readonly essential: true;
  readonly analytics: boolean;
  readonly functional: boolean;
  readonly marketing: boolean;
}

interface ConsentState {
  readonly consented: boolean;
  readonly preferences: CookiePreferences;
}

const STORAGE_KEY = 'rialto-cookie-consent';

export const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  functional: false,
  marketing: false,
};

const ALL_ACCEPTED: CookiePreferences = {
  essential: true,
  analytics: true,
  functional: true,
  marketing: true,
};

/* ── Helpers ─────────────────────────────────── */

function readStoredConsent(): ConsentState {
  if (typeof window === 'undefined') {
    return { consented: false, preferences: DEFAULT_PREFERENCES };
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { consented: false, preferences: DEFAULT_PREFERENCES };
  }
  try {
    const parsed = JSON.parse(stored) as ConsentState;
    return {
      consented: parsed.consented,
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...parsed.preferences,
        essential: true,
      },
    };
  } catch {
    return { consented: false, preferences: DEFAULT_PREFERENCES };
  }
}

function persistConsent(state: ConsentState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ── Hook ────────────────────────────────────── */

export function useCookieConsent() {
  const [state, setState] = useState<ConsentState>(readStoredConsent);

  const acceptAll = useCallback(() => {
    const next: ConsentState = { consented: true, preferences: ALL_ACCEPTED };
    persistConsent(next);
    setState(next);
  }, []);

  const rejectAll = useCallback(() => {
    const next: ConsentState = {
      consented: true,
      preferences: DEFAULT_PREFERENCES,
    };
    persistConsent(next);
    setState(next);
  }, []);

  const savePreferences = useCallback(
    (prefs: Omit<CookiePreferences, 'essential'>) => {
      const next: ConsentState = {
        consented: true,
        preferences: { ...prefs, essential: true },
      };
      persistConsent(next);
      setState(next);
    },
    []
  );

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ consented: false, preferences: DEFAULT_PREFERENCES });
  }, []);

  return {
    consented: state.consented,
    preferences: state.preferences,
    acceptAll,
    rejectAll,
    savePreferences,
    reset,
  } as const;
}
