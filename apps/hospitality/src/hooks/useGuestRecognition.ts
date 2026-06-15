import { useState, useRef, useCallback } from "react";

export interface GuestRecognitionResult {
  firstName: string | null;
  phone: string | null;
  visitCount: number;
  hasPreferences: boolean;
}

export interface UseGuestRecognitionParams {
  venueSlug: string | undefined;
  apiBaseUrl?: string;
}

export interface UseGuestRecognitionReturn {
  result: GuestRecognitionResult | null;
  isLoading: boolean;
  error: Error | null;
  recognize: (email: string) => void;
}

const DEBOUNCE_MS = 300;

export function useGuestRecognition({
  venueSlug,
  apiBaseUrl = "",
}: UseGuestRecognitionParams): UseGuestRecognitionReturn {
  const [result, setResult] = useState<GuestRecognitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recognize = useCallback(
    (email: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (!email || !venueSlug) {
        return;
      }

      timerRef.current = setTimeout(async () => {
        setIsLoading(true);
        setResult(null);
        setError(null);

        try {
          const url = `${apiBaseUrl}/public/v1/venues/${venueSlug}/guests/recognize?email=${encodeURIComponent(email)}`;
          const res = await fetch(url);

          if (!res.ok) {
            throw new Error(`Recognition request failed: ${res.status}`);
          }

          const data = await res.json();

          if (data.recognized) {
            setResult({
              firstName: data.firstName ?? null,
              phone: data.phone ?? null,
              visitCount: data.visitCount ?? 1,
              hasPreferences: data.hasPreferences ?? false,
            });
          } else {
            setResult(null);
          }
        } catch (err) {
          setError(err instanceof Error ? err : new Error("Recognition failed"));
          setResult(null);
        } finally {
          setIsLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [venueSlug, apiBaseUrl]
  );

  return { result, isLoading, error, recognize };
}
