import { createRoot } from "react-dom/client";
import "../tokens/index.css";
import "../styles/reset.css";
import "../styles/global.css";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
