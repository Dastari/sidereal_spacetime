import { Component, type ReactNode } from "react";
/** A failed route chunk must leave workspace navigation usable. */
export class WorkspaceBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="workspace-loading" role="alert">
        <p>This workspace could not load. Your saved drafts are preserved.</p>
        <button onClick={() => location.reload()}>Reload workspace</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
