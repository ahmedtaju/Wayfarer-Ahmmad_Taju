import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { preHydrationAttributeCleanup } from "../lib/pre-hydration";

describe("pre-hydration browser-extension compatibility", () => {
  it("removes only the observed extension markers and keeps application attributes", () => {
    const dom = new JSDOM(`<!doctype html><html><body bis_register="extension-data" cz-shortcut-listen="true" __processed_e0b7f489-e38b-4816-bdc0-b250544e3f8c__="true">
      <div bis_skin_checked="1" class="directory" data-place-count="10"><span bis_skin_checked="1">Wayfarer</span></div>
    </body></html>`, { runScripts: "dangerously" });

    dom.window.eval(preHydrationAttributeCleanup);

    const body = dom.window.document.body;
    const directory = dom.window.document.querySelector(".directory")!;
    expect(body.hasAttribute("bis_register")).toBe(false);
    expect(body.hasAttribute("cz-shortcut-listen")).toBe(false);
    expect(Array.from(body.attributes).some(({ name }) => name.startsWith("__processed_"))).toBe(false);
    expect(directory.hasAttribute("bis_skin_checked")).toBe(false);
    expect(directory.getAttribute("class")).toBe("directory");
    expect(directory.getAttribute("data-place-count")).toBe("10");
    expect(directory.textContent).toBe("Wayfarer");
    dom.window.close();
  });

  it("cleans late extension annotations briefly, then disconnects", async () => {
    const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
      runScripts: "dangerously", pretendToBeVisual: true,
    });
    dom.window.eval(preHydrationAttributeCleanup);
    const lateElement = dom.window.document.createElement("div");
    lateElement.setAttribute("bis_skin_checked", "1");
    dom.window.document.querySelector("main")!.append(lateElement);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(lateElement.hasAttribute("bis_skin_checked")).toBe(false);

    dom.window.dispatchEvent(new dom.window.Event("load"));
    const afterStop = dom.window.document.createElement("div");
    afterStop.setAttribute("bis_skin_checked", "1");
    dom.window.document.querySelector("main")!.append(afterStop);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(afterStop.hasAttribute("bis_skin_checked")).toBe(true);
    dom.window.close();
  });
});
