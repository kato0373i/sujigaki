import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ACTORS, AT } from "../testing/index.ts";
import { invitationId, ProjectMembers } from "./project-members.ts";
import { type Actor, ROLES, type Role } from "./role.ts";

const userId = fc.constantFrom("admin", "u1", "u2", "u3");
const role = fc.constantFrom(...ROLES);

type Operation =
  | { readonly type: "join"; readonly userId: string; readonly role: Role }
  | {
      readonly type: "changeRole";
      readonly userId: string;
      readonly role: Role;
    }
  | { readonly type: "remove"; readonly userId: string };

/** 招待して受ける、ロールを変える、除外する、のどれか */
const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({ type: fc.constant("join" as const), userId, role }),
  fc.record({ type: fc.constant("changeRole" as const), userId, role }),
  fc.record({ type: fc.constant("remove" as const), userId }),
);

/** 操作を1つ当てる。失敗した操作は、メンバー構成を変えない */
function apply(
  members: ProjectMembers,
  op: Operation,
  index: number,
): ProjectMembers {
  // 操作するのは、その時点で管理者のメンバー
  const adminId = members
    .toSnapshot()
    .members.find((m) => m.role === "admin")?.userId;
  const actor: Actor = { ...ACTORS.admin, userId: adminId ?? "admin" };
  if (op.type === "changeRole") {
    const result = members.changeRole(op.userId, op.role, actor, AT);
    return result.ok ? result.value.members : members;
  }
  if (op.type === "remove") {
    const result = members.remove(op.userId, actor, AT);
    return result.ok ? result.value.members : members;
  }
  const id = invitationId(`i${index}`);
  const invited = members.invite(
    { id, email: `${op.userId}@example.com`, role: op.role },
    actor,
    AT,
  );
  if (!invited.ok) return members;
  const accepted = invited.value.members.acceptInvitation(id, op.userId, AT);
  return accepted.ok ? accepted.value.members : invited.value.members;
}

describe("FR-082 メンバー構成の性質", () => {
  it("どの順に操作しても、管理者が0人にならない", () => {
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 30 }), (operations) => {
        let members = ProjectMembers.start("p1", "admin");
        operations.forEach((op, index) => {
          members = apply(members, op, index);
          const admins = members
            .toSnapshot()
            .members.filter((m) => m.role === "admin");
          expect(admins.length).toBeGreaterThanOrEqual(1);
        });
      }),
    );
  });

  it("どの順に操作しても、1人の利用者が持つロールは1つだけ", () => {
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 30 }), (operations) => {
        const members = operations.reduce(
          apply,
          ProjectMembers.start("p1", "admin"),
        );
        const ids = members.toSnapshot().members.map((m) => m.userId);
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });
});
