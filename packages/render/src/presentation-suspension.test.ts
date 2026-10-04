import { expect, test, vi } from "vitest";
import { createPresentationFrameGate } from "./presentation-suspension";

test("covered startup completes its usable frame, then suspends only world presentation", () => {
  let covered = true,
    acceptedPose = 0;
  const gate = createPresentationFrameGate(() => covered);
  const render = vi.fn((pose: number) => pose),
    notifyReady = vi.fn();
  let warmup = 2;
  const frame = gate.wrap(() => {
    render(acceptedPose);
    if (--warmup === 0) {
      notifyReady();
      gate.ready();
    }
  });
  const previewFrame = vi.fn();
  frame();
  frame();
  expect(notifyReady).toHaveBeenCalledOnce();
  expect(render).toHaveBeenCalledTimes(2);
  // Authoritative row updates and a separate preview continue during the cover.
  for (let i = 1; i <= 10; i++) {
    acceptedPose = i;
    frame();
    previewFrame();
  }
  expect(render).toHaveBeenCalledTimes(2);
  expect(previewFrame).toHaveBeenCalledTimes(10);
  covered = false;
  frame();
  expect(render).toHaveBeenLastCalledWith(10);
  expect(notifyReady).toHaveBeenCalledOnce();
  // The same owned callback suspends again without allocating another scheduler.
  covered = true;
  frame();
  expect(render).toHaveBeenCalledTimes(3);
});

test("readiness notification can remove the loading cover before eligibility is latched", () => {
  let startup = true,
    inSelection = true;
  const gate = createPresentationFrameGate(() => inSelection && !startup);
  const render = vi.fn();
  const frame = gate.wrap(() => {
    render();
    startup = false;
    gate.ready();
  });
  frame();
  frame();
  expect(render).toHaveBeenCalledOnce();
  inSelection = false;
  frame();
  expect(render).toHaveBeenCalledTimes(2);
});

test("existing callers without a cover callback preserve every frame", () => {
  const gate = createPresentationFrameGate(),
    render = vi.fn(),
    frame = gate.wrap(render);
  frame();
  gate.ready();
  frame();
  frame();
  expect(render).toHaveBeenCalledTimes(3);
});
