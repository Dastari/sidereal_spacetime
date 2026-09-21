export type EditorCommand =
  | "select"
  | "direct"
  | "draw"
  | "pan"
  | "undo"
  | "redo"
  | "duplicate"
  | "delete"
  | "save"
  | "cancel"
  | "left"
  | "right"
  | "up"
  | "down";
export interface EditorKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}
export function editorCommand(e: EditorKey): EditorCommand | undefined {
  const key = e.key.toLowerCase(),
    mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return undefined;
  if (mod) {
    if (key === "z") return e.shiftKey ? "redo" : "undo";
    return ({ y: "redo", d: "duplicate", s: "save" } as const)[key as "y"];
  }
  return (
    {
      v: "select",
      a: "direct",
      p: "draw",
      h: "pan",
      delete: "delete",
      backspace: "delete",
      escape: "cancel",
      arrowleft: "left",
      arrowright: "right",
      arrowup: "up",
      arrowdown: "down",
    } as const
  )[key as "v"];
}
/** Use with a focused editor root. Text fields and dialogs own their shortcuts. */
export function editorKeyTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"],dialog',
    )
  );
}
