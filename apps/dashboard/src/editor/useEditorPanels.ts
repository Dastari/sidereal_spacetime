import { useEffect, useState } from "react";
/** Preserve manual choices until a narrower viewport needs the drawing space. */
export function useEditorPanels() {
  const [left, setLeft] = useState(() => innerWidth > 760);
  const [right, setRight] = useState(() => innerWidth > 1100);
  useEffect(() => {
    const compact = matchMedia("(max-width: 760px)");
    const medium = matchMedia("(max-width: 1100px)");
    const collapse = () => {
      if (compact.matches) setLeft(false);
      if (medium.matches) setRight(false);
    };
    compact.addEventListener("change", collapse);
    medium.addEventListener("change", collapse);
    return () => {
      compact.removeEventListener("change", collapse);
      medium.removeEventListener("change", collapse);
    };
  }, []);
  return { left, right, setLeft, setRight };
}
