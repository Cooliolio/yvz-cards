import { describe, expect, it } from "vitest";
import "../src/index";

// What Home Assistant assigns to every card and editor it creates. If a class has a method of the same name,
// the assignment replaces the method with a value and the card breaks (`this.preview is not a function`).
const ASSIGNED_BY_HA = ["preview", "isPanel", "layout", "editMode", "narrow", "lovelace", "context", "hass"];

// Names that are lifecycle hooks, not members of the DOM that a class could shadow by accident.
const LIFECYCLE = new Set(["constructor", "connectedCallback", "disconnectedCallback", "attributeChangedCallback", "adoptedCallback"]);

const tags = (): string[] => {
  const types = (window.customCards ?? []).map((c) => c.type);
  return types.flatMap((type) => [type, `${type}-editor`]);
};

// The class's own members and its base classes', up to (not including) Lit's.
function members(tag: string): Array<{ owner: string; name: string; descriptor: PropertyDescriptor }> {
  const ctor = customElements.get(tag);
  const out: Array<{ owner: string; name: string; descriptor: PropertyDescriptor }> = [];
  for (let proto = ctor?.prototype; proto && proto.constructor?.name !== "LitElement" && proto !== HTMLElement.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      out.push({ owner: proto.constructor.name, name, descriptor: Object.getOwnPropertyDescriptor(proto, name)! });
    }
  }
  return out;
}

describe("cards and editors in the bundle", () => {
  it("finds the cards", () => {
    expect(tags().filter((t) => customElements.get(t)).length).toBeGreaterThanOrEqual(16);
  });

  for (const tag of tags()) {
    if (!customElements.get(tag)) continue;

    it(`${tag}: no method has the name of a property Home Assistant sets`, () => {
      const clashes = members(tag)
        .filter(({ name, descriptor }) => ASSIGNED_BY_HA.includes(name) && typeof descriptor.value === "function")
        .map(({ owner, name }) => `${owner}.${name}()`);
      expect(clashes).toEqual([]);
    });

    it(`${tag}: no member shadows a built-in element member`, () => {
      const builtIn = new Set<string>();
      for (let proto: object | null = HTMLElement.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
        for (const name of Object.getOwnPropertyNames(proto)) builtIn.add(name);
      }
      const clashes = members(tag)
        .filter(({ name }) => !LIFECYCLE.has(name) && builtIn.has(name))
        .map(({ owner, name }) => `${owner}.${name}`);
      expect(clashes).toEqual([]);
    });
  }
});
