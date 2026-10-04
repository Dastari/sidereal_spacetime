import React from "react";
import { createRoot } from "react-dom/client";
import { installCursorTheme } from "@sidereal/canvas-ui/cursors";
import AuthGate from "./AuthGate";
import { ComponentGallery } from "@sidereal/ui/gallery";
import "@sidereal/ui/game-theme.css";
import "@sidereal/ui/service-theme.css";
import { uiThemeCss } from "@sidereal/ui/theme";
for (const [name, value] of Object.entries(uiThemeCss))
  document.documentElement.style.setProperty(name, value);
installCursorTheme();
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("ui") === "gallery" ? (
    <ComponentGallery onClose={() => location.assign(location.pathname)} />
  ) : (
    <AuthGate />
  ),
);
