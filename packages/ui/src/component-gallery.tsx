import React, { useState, type CSSProperties } from "react";
import {
  GameButton,
  GameCheckbox,
  GameInput,
  GameNotice,
  GamePanel,
  GameTabs,
  HangarShell,
  ItemSlot,
  KeyHint,
  SiderealWordmark,
  StatBar,
} from "./game-components";
import { logicalUiScale, uiThemeCss } from "./theme";

/** Real controls and explicit sample values; this page never connects to world authority. */
export function ComponentGallery({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState("controls");
  const [scale, setScale] = useState(1);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState(false);
  const [check, setCheck] = useState(true);
  const [text, setText] = useState("");
  const [range, setRange] = useState(60);
  return (
    <HangarShell
      className="ui-gallery"
      header={<SiderealWordmark subtitle="Interface library" />}
      footer={
        <>
          <span>Interactive component samples · No world changes</span>
          <GameButton variant="ghost" onClick={onClose}>
            Back to crew access
          </GameButton>
        </>
      }
    >
      <div
        className="ui-gallery__workspace"
        style={{ ...uiThemeCss, "--ui-scale": String(scale) } as CSSProperties}
      >
        <GamePanel
          title="Interface kit"
          eyebrow="Shared HTML & canvas visual contract"
          actions={
            <label className="ui-gallery__scale">
              UI scale
              <select
                value={scale}
                onChange={(e) =>
                  setScale(logicalUiScale(Number(e.target.value)))
                }
              >
                {[0.75, 1, 1.25, 1.5].map((value) => (
                  <option key={value} value={value}>
                    {value * 100}%
                  </option>
                ))}
              </select>
            </label>
          }
        >
          <GameTabs
            label="Library category"
            tabs={[
              { id: "controls", label: "Controls" },
              { id: "frames", label: "Frames & feedback" },
              { id: "inventory", label: "Inventory & HUD" },
            ]}
            selected={tab}
            onSelect={setTab}
          />
        </GamePanel>
        <div className="ui-gallery__grid">
          {tab === "controls" && (
            <>
              <GamePanel title="Buttons" eyebrow="Semantic variants">
                <div className="ui-gallery__buttons">
                  {(
                    [
                      "primary",
                      "secondary",
                      "ghost",
                      "success",
                      "warning",
                      "danger",
                    ] as const
                  ).map((variant) => (
                    <GameButton
                      key={variant}
                      variant={variant}
                      selected={selected}
                      pending={pending}
                    >
                      {variant}
                    </GameButton>
                  ))}
                  <GameButton disabled>Disabled</GameButton>
                </div>
                <div className="ui-gallery__row">
                  <GameCheckbox
                    label="Selected state"
                    checked={selected}
                    onChange={(e) => setSelected(e.target.checked)}
                  />
                  <GameCheckbox
                    label="Pending state"
                    checked={pending}
                    onChange={(e) => setPending(e.target.checked)}
                  />
                </div>
                <p>
                  Tab through controls to review the independent focus ring.
                </p>
              </GamePanel>
              <GamePanel
                title="Native inputs"
                eyebrow="Keyboard · Selection · Clipboard · IME"
              >
                <GameInput
                  label="Crew name"
                  value={text}
                  placeholder="Enter a sample name"
                  onChange={(e) => setText(e.target.value)}
                  description="Sample only. This does not create a character."
                />
                <GameInput
                  label="Invalid field"
                  value=""
                  readOnly
                  error="A name is required."
                />
                <GameCheckbox
                  label="Remember this sample setting"
                  checked={check}
                  onChange={(e) => setCheck(e.target.checked)}
                />
                <label className="ui-gallery__range">
                  Interface intensity · {range}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={range}
                    onChange={(e) => setRange(Number(e.target.value))}
                  />
                </label>
              </GamePanel>
            </>
          )}
          {tab === "frames" && (
            <>
              <GamePanel title="Modular window" eyebrow="Reusable frame">
                <p>
                  Cut corners, cyan edge accents and an opaque reading surface
                  keep the interface clear over bright scenes.
                </p>
                <GamePanel title="Inset card">
                  <p>
                    One frame vocabulary for services, inspections and entry
                    screens.
                  </p>
                </GamePanel>
              </GamePanel>
              <GamePanel title="System feedback" eyebrow="Semantic messages">
                <GameNotice>Information sample</GameNotice>
                <GameNotice kind="success">
                  Operation completed sample
                </GameNotice>
                <GameNotice kind="warning">Low power sample</GameNotice>
                <GameNotice kind="danger">Operation failed sample</GameNotice>
              </GamePanel>
            </>
          )}
          {tab === "inventory" && (
            <>
              <GamePanel
                title="Square inventory slots"
                eyebrow="Empty · Equipped · Disabled"
              >
                <div className="ui-gallery__row">
                  <ItemSlot label="Empty slot" />
                  <ItemSlot label="Selected sample slot" selected>
                    ◇
                  </ItemSlot>
                  <ItemSlot label="Disabled sample slot" disabled>
                    ⌁
                  </ItemSlot>
                </div>
                <p>
                  <KeyHint>E</KeyHint> Interact <KeyHint>Shift</KeyHint> Sprint{" "}
                  <KeyHint>Esc</KeyHint> Menu
                </p>
              </GamePanel>
              <GamePanel title="Status bars" eyebrow="Illustrative values">
                <StatBar label="Hull" value={78} max={100} kind="danger" />
                <StatBar label="Shield" value={256} max={320} />
                <StatBar label="Power" value={108} max={150} kind="warning" />
                <StatBar label="Fuel" value={80} max={100} kind="secondary" />
              </GamePanel>
            </>
          )}
        </div>
      </div>
    </HangarShell>
  );
}
