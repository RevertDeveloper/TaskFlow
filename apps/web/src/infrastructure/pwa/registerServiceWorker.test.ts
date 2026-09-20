import { afterEach, describe, expect, it, vi } from "vitest";

import { registerServiceWorker } from "./registerServiceWorker";

type ServiceWorkerMock = {
  register: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  controller: object | null;
};

describe("registerServiceWorker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("absorbs registration failures without creating an unhandled rejection", async () => {
    const serviceWorker: ServiceWorkerMock = {
      register: vi.fn().mockRejectedValue(new Error("service workers unavailable")),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      controller: null,
    };
    setServiceWorker(serviceWorker);

    const cleanup = registerServiceWorker();
    await Promise.resolve();

    expect(cleanup).toEqual(expect.any(Function));
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does not publish an update after cleanup", async () => {
    let updateFoundHandler: (() => void) | undefined;
    let stateChangeHandler: (() => void) | undefined;
    const worker = {
      state: "installed",
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        stateChangeHandler = handler;
      }),
    };
    const registration = {
      installing: worker,
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        updateFoundHandler = handler;
      }),
    };
    const serviceWorker: ServiceWorkerMock = {
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      controller: {},
    };
    setServiceWorker(serviceWorker);
    const onUpdate = vi.fn();

    const cleanup = registerServiceWorker(onUpdate);
    await Promise.resolve();
    updateFoundHandler?.();
    cleanup();
    stateChangeHandler?.();

    expect(onUpdate).not.toHaveBeenCalled();
  });
});

function setServiceWorker(serviceWorker: ServiceWorkerMock): void {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker,
  });
}