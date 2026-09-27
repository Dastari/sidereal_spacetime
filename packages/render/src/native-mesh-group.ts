/** A delimiter-terminated prefix names an exact exported mesh namespace. */
export function nativeMeshInGroup(name: string, prefix: string): boolean {
  return (
    name === prefix ||
    name.startsWith(prefix + "_") ||
    name.startsWith(prefix + ".") ||
    (prefix.endsWith("--") && name.startsWith(prefix))
  );
}
