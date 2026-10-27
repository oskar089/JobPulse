import { describe, it, expect } from "vitest";
import { cn, safeExternalUrl } from "./utils";

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

describe("safeExternalUrl", () => {
  it("accepts http and https URLs", () => {
    expect(safeExternalUrl("https://example.com/jobs/1")).toBe("https://example.com/jobs/1");
    expect(safeExternalUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects script and data URLs", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl(" JavaScript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects relative, malformed and empty values", () => {
    expect(safeExternalUrl("/jobs/1")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});