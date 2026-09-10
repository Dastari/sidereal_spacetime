import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { Layers } from "lucide-react";
export function ViewportDeckControl({
  doc,
  deckId,
  onChange,
}: {
  doc: LayoutDocument;
  deckId: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="viewport-deck-control">
      <Layers size={16} />
      <select
        aria-label="Active viewport deck"
        value={deckId}
        onChange={(e) => onChange(e.target.value)}
      >
        {doc.decks.map((deck, i) => (
          <option key={deck.id} value={deck.id}>
            {deck.name} · {i + 1} / {doc.decks.length}
          </option>
        ))}
      </select>
    </label>
  );
}
