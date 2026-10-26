import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AVAILABILITY_CONFIG_QUERY_KEY, AVAILABILITY_DAYS_QUERY_KEY } from "./useAvailability.js";

/**
 * Refetches the availability config and days. A mutation only invalidates on success, so a 409
 * (someone else's change won) calls this to bring the screen to the state that won.
 */
export function useRefreshAvailability(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [AVAILABILITY_CONFIG_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [AVAILABILITY_DAYS_QUERY_KEY] });
  }, [queryClient]);
}
