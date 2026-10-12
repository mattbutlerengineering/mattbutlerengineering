/**
 * Theme state is owned by `<RialtoProvider persistTheme>` (see main.tsx):
 * rialto holds the storage key and follows the OS live while the stored
 * preference is "system". Re-exported so gen components keep one import site.
 */
export { useTheme } from "@mattbutlerengineering/rialto";
