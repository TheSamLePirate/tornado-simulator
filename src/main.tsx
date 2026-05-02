import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyUrlState } from "./capture/url";

// Apply URL-driven state before first render so the solver's initial
// Burgers-Rott seed and the rendered scene both pick up any params
// passed via query string (used by the capture pipeline).
applyUrlState();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
