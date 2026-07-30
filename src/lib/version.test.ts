import { describe, it, expect } from "vitest";
import { APP_NAME, greeting } from "./version";

describe("toolchain smoke", () => {
  it("exposes the app name", () => {
    expect(APP_NAME).toBe("GREENLIGHTHOUSE");
  });

  it("greets", () => {
    expect(greeting("Elena")).toBe("Hello, Elena");
  });
});
