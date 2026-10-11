import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn utility", () => {
  it("joins class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", true && "bar", false && "baz")).toBe("foo bar");
  });

  it("handles tailwind merge conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
    expect(cn("", false, null, undefined)).toBe("");
  });
});