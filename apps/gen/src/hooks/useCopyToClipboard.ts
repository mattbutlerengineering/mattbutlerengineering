import { useState, useRef, useCallback } from "react";

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    let succeeded = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        succeeded = true;
      } else {
        window.prompt("Copy to clipboard:", text);
      }
    } catch {
      window.prompt("Copy to clipboard:", text);
    }

    setCopied(true);
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 2000);

    return succeeded;
  }, []);

  return { copied, copy };
}
