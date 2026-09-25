export function WallFitNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <details className="wall-fit-notes">
      <summary>
        Native fit · {notes.length} {notes.length === 1 ? "note" : "notes"}
      </summary>
      <ul>
        {notes.map((note, i) => (
          <li key={`${i}:${note}`}>{note}</li>
        ))}
      </ul>
    </details>
  );
}
