import { describe, expect, it } from "vitest";
import { createId, createSecureSlug } from "@/utils/id";
import { toMysqlDateTime } from "@/utils/time";

describe("id and time utilities", () => {
  it("creates unique UUID ids", () => {
    expect(createId()).not.toBe(createId());
  });

  it("creates a 128-bit slug by default", () => {
    expect(createSecureSlug()).toHaveLength(22);
  });

  it("formats UTC dates for MySQL datetime fields", () => {
    expect(toMysqlDateTime(new Date("2026-06-03T12:34:56.000Z"))).toBe(
      "2026-06-03 12:34:56"
    );
  });
});
