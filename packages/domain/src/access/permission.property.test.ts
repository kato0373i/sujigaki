import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, type Permission } from "./permission.ts";
import { hasRoleAtLeast, ROLES } from "./role.ts";

const role = fc.constantFrom(...ROLES);
const permission = fc.constantFrom(
  ...(Object.keys(PERMISSIONS) as Permission[]),
);

describe("FR-081 権限の表の性質", () => {
  it("ロールを強くすると、できる操作は減らない", () => {
    fc.assert(
      fc.property(role, role, permission, (weak, strong, p) => {
        fc.pre(hasRoleAtLeast(strong, weak));
        if (can({ userId: "u1", role: weak }, p)) {
          expect(can({ userId: "u1", role: strong }, p)).toBe(true);
        }
      }),
    );
  });

  it("管理者はすべての操作ができる", () => {
    fc.assert(
      fc.property(permission, (p) => {
        expect(can({ userId: "u1", role: "admin" }, p)).toBe(true);
      }),
    );
  });
});
