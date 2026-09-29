import React from "react";
import { createRoot } from "react-dom/client";
import { installCursorTheme } from "@sidereal/canvas-ui/cursors";
import AuthGate from "./AuthGate";
installCursorTheme();
createRoot(document.getElementById("root")!).render(<AuthGate />);
