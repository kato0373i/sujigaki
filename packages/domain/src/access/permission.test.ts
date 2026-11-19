import { describe, expect, it } from "vitest";
import { can, checkPermission } from "./permission.ts";
import type { Actor } from "./role.ts";

const viewer: Actor = { userId: "u1", role: "viewer" };
const editor: Actor = { userId: "u2", role: "editor" };
const owner: Actor = { userId: "u3", role: "owner" };
const admin: Actor = { userId: "u4", role: "admin" };

describe("FR-081 権限の表", () => {
  it("閲覧者はコメントと回答ができ、要素は編集できない", () => {
    expect(can(viewer, "writeComment")).toBe(true);
    expect(can(viewer, "answerQuestion")).toBe(true);
    expect(can(viewer, "askQuestion")).toBe(true);
    expect(can(viewer, "editElement")).toBe(false);
  });

  it("確認済みにする操作と決定の記録は、業務責任者以上ができる", () => {
    expect(can(editor, "approveReview")).toBe(false);
    expect(can(editor, "recordDecision")).toBe(false);
    expect(can(owner, "approveReview")).toBe(true);
    expect(can(owner, "recordDecision")).toBe(true);
  });

  it("メンバーの管理は管理者だけができる", () => {
    expect(can(owner, "manageMembers")).toBe(false);
    expect(can(admin, "manageMembers")).toBe(true);
  });

  it("権限がなければ、必要なロールを示して拒否する", () => {
    expect(
      checkPermission(editor, "recordDecision", "決定を記録できる"),
    ).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "決定を記録できるのは、業務責任者以上です。",
      },
    });
    expect(
      checkPermission(owner, "recordDecision", "決定を記録できる").ok,
    ).toBe(true);
  });
});
