import { useState } from "react";
import type { LayoutPanelContext } from "./panel-context";
import { createRoomFromTiles } from "./room-tiles";
import { uuid } from "./useLayout";

const ROOM_TYPES = [
  "Bridge",
  "Crew quarters",
  "Galley",
  "Lounge",
  "Medbay",
  "Workshop",
  "Storage",
  "Utility",
  "Cargo",
  "Corridor",
  "Custom",
];

export function RoomAssignmentPanel({
  doc,
  view,
  selection,
  select,
  tool,
  setTool,
  roomType,
  setRoomType,
  blocked,
  commit,
  editor,
}: LayoutPanelContext) {
  const [name, setName] = useState("");
  const chosen =
    doc?.tiles.filter(
      (tile) => tile.deckId === view.deckId && selection.includes(tile.id),
    ) ?? [];
  return (
    <div className="layout-room-fields">
      <button
        className="layout-wide"
        disabled={blocked}
        aria-pressed={tool === "room"}
        onClick={() => setTool("room")}
      >
        Select room tiles
      </button>
      <p className="layout-note">
        {chosen.length
          ? `${chosen.length} floor tiles selected`
          : "Click tiles to select them, or drag a selection box."}
      </p>
      <label>
        Room name
        <input
          aria-label="New room name"
          placeholder={roomType}
          value={name}
          maxLength={160}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Room type
        <select
          aria-label="New room type"
          value={roomType}
          onChange={(event) => setRoomType(event.target.value)}
        >
          {ROOM_TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <button
        className="layout-wide"
        disabled={blocked || !chosen.length}
        onClick={() => {
          if (!doc) return;
          try {
            const id = uuid();
            const next = createRoomFromTiles(
              doc,
              view.deckId,
              chosen.map((tile) => tile.id),
              id,
              name || roomType,
              roomType,
            );
            commit(() => next);
            select([id]);
            setTool("select");
            setName("");
          } catch (error) {
            editor.setError(String(error));
          }
        }}
      >
        Create room from selection
      </button>
      {doc?.rooms
        .filter((room) => room.deckId === view.deckId)
        .map((room) => (
          <button
            key={room.id}
            className="layout-wide"
            aria-pressed={selection.includes(room.id)}
            onClick={() => {
              select([room.id]);
              setTool("select");
            }}
          >
            {room.name}
          </button>
        ))}
    </div>
  );
}
