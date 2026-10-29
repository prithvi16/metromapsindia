import { describe, expect, it } from "vitest";
import { stationDisplay, stationKey } from "../scripts/lib/stations";

describe("station names", () => {
  it("strips line suffixes and operator noise", () => {
    expect(stationKey("Anand Vihar (Blue Line)")).toBe("anand vihar");
    expect(stationKey("Vikhroli Station")).toBe("vikhroli");
    expect(stationKey("Andheri L1")).toBe("andheri");
  });

  it("canonicalises known aliases", () => {
    expect(stationKey("CSMT")).toBe("mumbai csmt");
    expect(stationDisplay("Chhatrapati Shivaji Maharaj Terminus")).toBe("Mumbai CSMT");
    expect(stationDisplay("Yeshwantpur")).toBe("Yesvantpur");
  });

  it("keeps names without a suffix intact", () => {
    expect(stationDisplay("DN Nagar")).toBe("DN Nagar");
  });
});
