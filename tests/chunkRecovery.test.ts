import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "../src/lib/chunkRecovery";

describe("chunk recovery", () => {
  it("recognises a missing lazy chunk in each browser's wording", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Failed to fetch dynamically imported module: https://metromapsindia.netlify.app/assets/all-C8ld_96X.js",
        ),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(
        new Error(
          "error loading dynamically imported module: https://metromapsindia.netlify.app/assets/mumbai-123.js",
        ),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError("Loading chunk 42 failed.")).toBe(true);
  });

  it("leaves data and generic network errors alone", () => {
    expect(isChunkLoadError(new Error('No data shard for "mumbai"'))).toBe(false);
    expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
