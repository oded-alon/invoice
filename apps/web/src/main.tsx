import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AuthGate from "./AuthGate";
import "./index.css";

// Apply saved theme before first render to avoid flash
const savedTheme = localStorage.getItem("theme");
if (
  savedTheme === "dark" ||
  (!savedTheme && window.matchMedia?.("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
}

document.documentElement.lang = "he";
document.documentElement.dir = "rtl";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthGate />
    </BrowserRouter>
  </React.StrictMode>
);
