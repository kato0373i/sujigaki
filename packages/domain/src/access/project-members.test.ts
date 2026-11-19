import { describe, expect, it } from "vitest";
import { unwrap } from "../testing/index.ts";
import { invitationId, ProjectMembers } from "./project-members.ts";
import type { Actor } from "./role.ts";

const at = new Date("2026-11-19T00:00:00Z");
const admin: Actor = { userId: "admin", role: "admin" };

function withEditor(): ProjectMembers {
  const start = ProjectMembers.start("p1", "admin");
  const invited = unwrap(
    start.invite(
      { id: invitationId("i1"), email: "Editor@Example.com", role: "editor" },
      admin,
      at,
    ),
  ).members;
  return unwrap(invited.acceptInvitation(invitationId("i1"), "editor", at))
    .members;
}

describe("メンバー構成", () => {
  it("プロジェクトを作った人が最初の管理者になる", () => {
    expect(ProjectMembers.start("p1", "admin").roleOf("admin")).toBe("admin");
  });

  it("招待したメールアドレスの人が、招待のロールでメンバーになる", () => {
    const members = withEditor();
    expect(members.roleOf("editor")).toBe("editor");
    expect(members.toSnapshot().invitations).toEqual([]);
  });

  it("招待のメールアドレスは小文字にして持ち、同じアドレスには重ねて招待しない", () => {
    const start = ProjectMembers.start("p1", "admin");
    const first = unwrap(
      start.invite(
        { id: invitationId("i1"), email: " A@Example.com ", role: "viewer" },
        admin,
        at,
      ),
    );
    expect(first.members.toSnapshot().invitations[0]?.email).toBe(
      "a@example.com",
    );
    const second = first.members.invite(
      { id: invitationId("i2"), email: "a@example.COM", role: "editor" },
      admin,
      at,
    );
    expect(second.ok).toBe(false);
  });

  it("形式の正しくないメールアドレスは招待できない", () => {
    const result = ProjectMembers.start("p1", "admin").invite(
      { id: invitationId("i1"), email: "not-an-email", role: "viewer" },
      admin,
      at,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("招待を取り消せる", () => {
    const start = ProjectMembers.start("p1", "admin");
    const invited = unwrap(
      start.invite(
        { id: invitationId("i1"), email: "a@example.com", role: "viewer" },
        admin,
        at,
      ),
    ).members;
    const cancelled = unwrap(
      invited.cancelInvitation(invitationId("i1"), admin, at),
    );
    expect(cancelled.members.toSnapshot().invitations).toEqual([]);
    expect(cancelled.events[0]?.type).toBe("InvitationCancelled");
  });

  it("管理者でなければメンバーを管理できない", () => {
    const owner: Actor = { userId: "owner", role: "owner" };
    const result = withEditor().changeRole("editor", "viewer", owner, at);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "メンバーを管理できるのは、管理者だけです。",
      },
    });
  });

  it("ロールを変えると、変更前と変更後のロールをイベントに残す", () => {
    const changed = unwrap(
      withEditor().changeRole("editor", "owner", admin, at),
    );
    expect(changed.members.roleOf("editor")).toBe("owner");
    expect(changed.events[0]).toMatchObject({
      type: "MemberRoleChanged",
      from: "editor",
      to: "owner",
    });
  });

  it("最後の管理者はロールを変えられず、除外もできない", () => {
    const members = withEditor();
    const message =
      "管理者が1人以上必要です。先にほかのメンバーを管理者にしてください。";
    expect(members.changeRole("admin", "editor", admin, at)).toEqual({
      ok: false,
      error: { code: "LAST_ADMIN", message },
    });
    expect(members.remove("admin", admin, at)).toMatchObject({
      ok: false,
      error: { code: "LAST_ADMIN" },
    });
  });

  it("管理者がほかにいれば、管理者を外せる", () => {
    const two = unwrap(
      withEditor().changeRole("editor", "admin", admin, at),
    ).members;
    const removed = unwrap(two.remove("admin", admin, at));
    expect(removed.members.roleOf("admin")).toBeNull();
    expect(removed.members.roleOf("editor")).toBe("admin");
  });

  it("メンバーでない人は、ロールを変えられず除外もできない", () => {
    const members = withEditor();
    expect(members.changeRole("nobody", "viewer", admin, at)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(members.remove("nobody", admin, at)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("すでにメンバーの人が招待を受けても、ロールは変わらない", () => {
    const members = withEditor();
    const invited = unwrap(
      members.invite(
        { id: invitationId("i2"), email: "editor@example.com", role: "viewer" },
        admin,
        at,
      ),
    ).members;
    const accepted = unwrap(
      invited.acceptInvitation(invitationId("i2"), "editor", at),
    );
    expect(accepted.members.roleOf("editor")).toBe("editor");
  });

  it("ローカルモードではメンバーを管理できない", () => {
    const local: Actor = { userId: null, role: "admin" };
    const result = ProjectMembers.start("p1", "admin").invite(
      { id: invitationId("i1"), email: "a@example.com", role: "viewer" },
      local,
      at,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("メールアドレスが空なら招待しない", () => {
    const result = ProjectMembers.start("p1", "admin").invite(
      { id: invitationId("i1"), email: " ", role: "viewer" },
      admin,
      at,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "メールアドレスを入力してください。",
      },
    });
  });

  it("ない招待は、取り消すことも受けることもできない", () => {
    const members = ProjectMembers.start("p1", "admin");
    const missing = invitationId("none");
    const notFound = { ok: false, error: { code: "NOT_FOUND" } };
    expect(members.cancelInvitation(missing, admin, at)).toMatchObject(
      notFound,
    );
    expect(members.acceptInvitation(missing, "u1", at)).toMatchObject(notFound);
  });

  it("管理者でなければ、招待も取り消しも除外もできない", () => {
    const owner: Actor = { userId: "owner", role: "owner" };
    const members = withEditor();
    const forbidden = { ok: false, error: { code: "FORBIDDEN" } };
    expect(
      members.invite(
        { id: invitationId("i9"), email: "b@example.com", role: "viewer" },
        owner,
        at,
      ),
    ).toMatchObject(forbidden);
    expect(
      members.cancelInvitation(invitationId("i9"), owner, at),
    ).toMatchObject(forbidden);
    expect(members.remove("editor", owner, at)).toMatchObject(forbidden);
  });

  it("今と同じロールに変えても、イベントを出さない", () => {
    const result = withEditor().changeRole("editor", "editor", admin, at);
    expect(result).toMatchObject({ ok: true, value: { events: [] } });
  });
});
