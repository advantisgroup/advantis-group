import { describe, expect, test } from "bun:test";

process.env.CLERK_SECRET_KEY ??= "sk_test_placeholder";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= `pk_test_${btoa("clerk.example.com$")}`;

const { readItems } = await import("./office.js");

describe("office recognition", () => {
  test("keeps what the model found and cleans up the rest", () => {
    const items = readItems({
      items: [
        { kind: "cable", name: "HDMI-Kabel", spec: "HDMI → HDMI, ca. 2 m", quantity: "4" },
        { kind: "spaceship", name: "Irgendwas", unsure: true, note: "Stecker unklar" },
        { kind: "monitor", name: "" },
        "nonsense",
      ],
    });
    expect(items).toEqual([
      {
        kind: "cable",
        name: "HDMI-Kabel",
        spec: "HDMI → HDMI, ca. 2 m",
        serialNumber: "",
        inventoryNumber: "",
        quantity: 4,
        defective: false,
        unsure: false,
        note: "",
      },
      {
        kind: "other",
        name: "Irgendwas",
        spec: "",
        serialNumber: "",
        inventoryNumber: "",
        quantity: 1,
        defective: false,
        unsure: true,
        note: "Stecker unklar",
      },
    ]);
  });
});
