import { useState, useRef, useCallback } from "react";
import type { BookingWidgetApiClient } from "../components/booking-widget/PaymentStep.js";

export interface GuestRecognitionResult {
  firstName: string | null;
  visitCount: number;
  hasPreferences: boolean;
}

export interface UseGuestRecognitionParams {
  venueSlug: string | undefined;
  api: BookingWidgetApiClient;
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
  api,
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
          const recognition = await api.guests.recognize(venueSlug, email);

          if (recognition.recognized) {
            setResult({
              firstName: recognition.firstName,
              visitCount: recognition.visitCount,
              hasPreferences: recognition.hasPreferences,
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
    [venueSlug, api]
  );

  return { result, isLoading, error, recognize };
}
