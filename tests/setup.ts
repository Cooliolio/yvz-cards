// The little that cards use and the test DOM doesn't have.
class Observer {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, { IntersectionObserver: Observer, ResizeObserver: Observer });

if (!("escape" in CSS)) Object.assign(CSS, { escape: (value: string) => value.replace(/[^\w-]/g, "\\$&") });
