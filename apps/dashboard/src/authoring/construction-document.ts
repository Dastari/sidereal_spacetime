import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { ConstructionDocument } from "@sidereal/content/construction";
import { bindConstructionLayout } from "@sidereal/sim/construction-layout";
import { readConstructionDraft } from "@sidereal/sim/construction-transactions";

const key = (id: string) => `sidereal:construction-source:v1:${id}`;
/** Preserve the complete qualified wrapper; edits must still pass its validators. */
export function constructionForLayout(
  layout: LayoutDocument,
  source?: ConstructionDocument,
): ConstructionDocument {
  const bound = bindConstructionLayout(layout);
  if (source && source.layout.id !== layout.id)
    throw Error("Construction source belongs to another draft");
  return { ...(source ? structuredClone(source) : {}), ...bound.document };
}
export function rememberConstructionSource(
  raw: string,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  const source = JSON.parse(
    readConstructionDraft(raw).canonical,
  ) as ConstructionDocument;
  storage.setItem(key(source.layout.id), JSON.stringify(source));
  return source;
}
export function storedConstructionSource(
  id: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): ConstructionDocument | undefined {
  const raw = storage.getItem(key(id));
  return raw
    ? (JSON.parse(readConstructionDraft(raw).canonical) as ConstructionDocument)
    : undefined;
}
export function copyConstructionSource(
  from: string,
  to: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  const source = storedConstructionSource(from, storage);
  if (!source) return;
  source.layout.id = to;
  storage.setItem(key(to), JSON.stringify(source));
}

/** Import into a fresh identity without reading or overwriting another local source. */
export function importConstructionSource(
  raw: string,
  expectedId: string,
  newId: string,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  const source = JSON.parse(
    readConstructionDraft(raw).canonical,
  ) as ConstructionDocument;
  if (source.layout.id !== expectedId)
    throw Error("Construction source does not match the imported draft");
  source.layout.id = newId;
  storage.setItem(key(newId), JSON.stringify(source));
  return source;
}
