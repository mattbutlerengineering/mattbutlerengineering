import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { App, CallbackRedirect } from "./App";
import { LoadingPage } from "./pages/LoadingPage";

const PlaygroundPage = lazy(() =>
  import("./pages/PlaygroundPage").then((m) => ({ default: m.PlaygroundPage }))
);
const SharedSpecPage = lazy(() =>
  import("./pages/SharedSpecPage").then((m) => ({ default: m.SharedSpecPage }))
);

/**
 * Uses createBrowserRouter (React Router v7 recommended API) instead of
 * BrowserRouter to ensure basename is correctly applied on deep links.
 */
export const router = createBrowserRouter(
  [
    {
      element: <App />,
      children: [
        { path: "callback", element: <CallbackRedirect /> },
        {
          index: true,
          element: (
            <Suspense fallback={<LoadingPage />}>
              <PlaygroundPage />
            </Suspense>
          ),
        },
        {
          path: "s/:id",
          element: (
            <Suspense fallback={<LoadingPage />}>
              <SharedSpecPage />
            </Suspense>
          ),
        },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: "/gen" }
);
