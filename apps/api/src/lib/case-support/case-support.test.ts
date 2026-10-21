import { describe, expect, test } from "bun:test";

import * as shared from "@advantis/types/case-support";

import { CASES } from "./cases.js";
import { SUPPORT_ENTRIES } from "./support.js";

describe("case-support copy", () => {
  test("matches packages/types (edit both or run the copy again)", () => {
    expect(CASES).toEqual(shared.CASES);
    expect(SUPPORT_ENTRIES).toEqual(shared.SUPPORT_ENTRIES);
  });
});
