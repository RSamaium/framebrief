import { beforeAll, expect, it, vi } from "vitest";
import { FramebriefApp } from "../src/app";
import { createProject, ProjectStore } from "../src/store";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

it("keeps the player and prompt intact during project changes; keyboard does not affect typing", async () => {
  localStorage.clear();
  const root = document.createElement("div");
  document.body.append(root);
  const p = createProject();
  p.videos = [
    {
      id: "v",
      kind: "video",
      name: "short.webm",
      duration: 2,
      width: 360,
      height: 640,
      size: 1,
      type: "video/webm",
      lastModified: 1,
      addedAt: p.createdAt,
    },
  ];
  const store = new ProjectStore(p);
  new FramebriefApp(root, store);
  const a = store.saveAnnotation({
    videoId: "v",
    startTime: 1,
    prompt: "Dessiner ici",
    drawings: [{ type: "rectangle", x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
    frameTime: 1,
  });
  const player = root.querySelector("video");
  root.querySelector<HTMLButtonElement>("[data-id]")!.click();
  const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
  input.value = "Texte en cours";
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "r", bubbles: true }),
  );
  expect(
    root.querySelector('[data-mode="select"]')!.classList.contains("chosen"),
  ).toBe(true);
  store.saveAnnotation({ videoId: "v", startTime: 0, prompt: "autre" });
  expect(root.querySelector("video")).toBe(player);
  expect(root.querySelector("textarea")).toBe(input);
  expect(input.value).toBe("Texte en cours");
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
    }),
  );
  expect(
    store.project.annotations.find((item) => item.id === a.id)!.prompt,
  ).toBe("Dessiner ici");
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await vi.waitFor(() =>
    expect(root.querySelector<HTMLElement>(".popover")!.hidden).toBe(true),
  );
  expect(
    store.project.annotations.find((item) => item.id === a.id)!.prompt,
  ).toBe("Texte en cours");
  expect(root.querySelector<HTMLElement>(".popover")!.hidden).toBe(true);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
  );
  expect(
    store.project.annotations.find((item) => item.id === a.id)!.prompt,
  ).toBe("Dessiner ici");
  expect(root.querySelector<HTMLElement>(".rail")!.style.width).toBe("140px");
  const chips = root.querySelectorAll(".annotation-chip");
  expect(chips.length).toBe(2);
  expect(chips[0].textContent).toContain("autre");
  const speed = root.querySelector<HTMLSelectElement>(".speed-control select")!;
  speed.value = "0.5";
  speed.dispatchEvent(new Event("change"));
  expect(player!.playbackRate).toBe(0.5);
  root.querySelector<HTMLButtonElement>(".remove-track")!.click();
  expect(store.project.videos).toHaveLength(0);
  expect(store.project.annotations).toHaveLength(0);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
  );
  expect(store.project.videos).toHaveLength(1);
  expect(root.querySelectorAll(".annotation-chip")).toHaveLength(2);
  expect(root.style.getPropertyValue("--scene-height")).toContain("380px");
  root
    .querySelector(".track-label")!
    .dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1, clientX: 86 }),
    );
  expect(
    root.querySelector<HTMLInputElement>(".playback-progress")!.value,
  ).toBe("1");
  const svg = root.querySelector<SVGSVGElement>(".drawing-layer")!;
  svg.setPointerCapture = vi.fn();
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  } as DOMRect);
  root.querySelector<HTMLButtonElement>('[data-mode="rectangle"]')!.click();
  for (let i = 0; i < 2; i++) {
    svg.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 10 + i * 20,
        clientY: 10,
      }),
    );
    svg.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 30 + i * 20,
        clientY: 30,
      }),
    );
    svg.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 30 + i * 20,
        clientY: 30,
      }),
    );
    expect(root.querySelector<HTMLElement>(".popover")!.hidden).toBe(true);
  }
  expect(svg.querySelectorAll("[data-shape]")).toHaveLength(2);
  root.querySelector<HTMLButtonElement>(".finish-drawing")!.click();
  expect(root.querySelector<HTMLElement>(".popover")!.hidden).toBe(false);
  expect(root.querySelector(".popover-head")!.textContent).toContain(
    "2 tracé(s)",
  );
  root.remove();
});
