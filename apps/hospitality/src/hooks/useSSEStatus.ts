/**
 * useSSEStatus
 *
 * Exposes the SSE connection status (isConnected, error) without managing
 * the actual connection. The connection is owned by useReservationQuerySync
 * which runs in DashboardLayoutInner. This hook reads from a module-level
 * ref that useReservationQuerySync updates.
 *
 * This replaces the `isConnected` / `sseError` values previously provided
 * by ReservationDataContext.
 */

import { useState, useEffect } from "react";

type SSEStatusListener = (isConnected: boolean, error: Error | null) => void;

let _isConnected = false;
let _error: Error | null = null;
const _listeners = new Set<SSEStatusListener>();

/** Called by useReservationQuerySync to broadcast status changes. */
export function notifySSEStatus(isConnected: boolean, error: Error | null): void {
  _isConnected = isConnected;
  _error = error;
  for (const listener of _listeners) {
    listener(isConnected, error);
  }
}

/** Subscribe to SSE connection status changes. */
export function useSSEStatus(): { isConnected: boolean; error: Error | null } {
  const [state, setState] = useState<{ isConnected: boolean; error: Error | null }>({
    isConnected: _isConnected,
    error: _error,
  });

  useEffect(() => {
    const listener: SSEStatusListener = (isConnected, error) => {
      setState({ isConnected, error });
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  return state;
}
