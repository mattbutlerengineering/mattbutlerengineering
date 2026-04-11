import { createBrowserRouter, Navigate } from "react-router-dom";
import { App, CallbackRedirect } from "./App";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { SharedSpecPage } from "./pages/SharedSpecPage";

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
          element: <PlaygroundPage />,
        },
        { path: "s/:id", element: <SharedSpecPage /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: "/gen" }
);
