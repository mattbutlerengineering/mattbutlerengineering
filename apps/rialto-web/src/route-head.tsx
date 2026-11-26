import { Outlet } from "react-router";
import { useRouteHead } from "./use-route-head.js";

/** Pathless parent of the route tree so demos, privacy and the showcase share one head. */
export function RouteHead() {
  useRouteHead();
  return <Outlet />;
}
