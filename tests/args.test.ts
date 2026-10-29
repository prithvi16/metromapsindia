import { describe, expect, it } from "vitest";
import { getArg, hasFlag, parseArgs } from "../scripts/lib/args";

describe("CLI args", () => {
  it("parses --key=value and --key value", () => {
    expect(getArg(parseArgs(["--city=mumbai"]), "city")).toBe("mumbai");
    expect(getArg(parseArgs(["--city", "delhi"]), "city")).toBe("delhi");
  });

  it("parses repeated values and boolean flags", () => {
    const args = parseArgs(["--city=mumbai", "--city=delhi", "--json"], {
      booleans: ["json"],
    });
    expect(args.values.get("city")).toEqual(["mumbai", "delhi"]);
    expect(hasFlag(args, "json")).toBe(true);
  });

  it("keeps positionals after --", () => {
    const args = parseArgs(["mumbai", "--", "--not-a-flag"]);
    expect(args.positionals).toEqual(["mumbai", "--not-a-flag"]);
  });
});
