import { describe, expect, it } from "vitest";
import { apiResponseSchema } from "@/types/api";
import { fail, ok } from "@/utils/api-response";
import { z } from "zod";

describe("api response helpers", () => {
  it("creates successful responses", () => {
    const response = ok({ id: "1" });

    expect(response).toEqual({ ok: true, data: { id: "1" } });
    expect(apiResponseSchema(z.object({ id: z.string() })).safeParse(response).success).toBe(
      true
    );
  });

  it("creates error responses", () => {
    const response = fail("VALIDATION_ERROR", "Invalid input");

    expect(response.ok).toBe(false);
    expect(apiResponseSchema(z.object({ id: z.string() })).safeParse(response).success).toBe(
      true
    );
  });
});
