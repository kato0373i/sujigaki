import { describe, expect, it } from "vitest";
import { hasRoleAtLeast } from "./role.ts";

describe("ロールの比較", () => {
  it("同じロールと、より強いロールを満たす", () => {
    expect(hasRoleAtLeast("owner", "owner")).toBe(true);
    expect(hasRoleAtLeast("admin", "owner")).toBe(true);
  });

  it("より弱いロールは満たさない", () => {
    expect(hasRoleAtLeast("editor", "owner")).toBe(false);
    expect(hasRoleAtLeast("viewer", "editor")).toBe(false);
  });
});
