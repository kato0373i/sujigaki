import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { Project } from "./project.ts";

const at = new Date("2026-11-19T00:00:00Z");
const admin: Actor = { userId: "admin", role: "admin" };

function create(): Project {
  const result = Project.create(
    { id: "p1", name: " 申込管理 ", systemName: "申込システム" },
    at,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("FR-005 FR-090 プロジェクト", () => {
  it("要約の上限を指定しなければ、既定の100字にする", () => {
    const project = create();
    expect(project.summaryMaxLength).toBe(100);
    expect(project.toSnapshot().name).toBe("申込管理");
  });

  it("システム名がなければ作れない", () => {
    const result = Project.create(
      { id: "p1", name: "申込管理", systemName: " " },
      at,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "システム名を入力してください。",
      },
    });
  });

  it("要約の上限は1以上の整数にする", () => {
    const project = create();
    for (const summaryMaxLength of [0, -1, 1.5]) {
      expect(
        project.changeSettings({ summaryMaxLength }, admin, at),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    }
  });

  it("設定を変えると、変えた項目をイベントに残す", () => {
    const result = create().changeSettings(
      { summaryMaxLength: 200, name: "申込管理" },
      admin,
      at,
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.project.summaryMaxLength).toBe(200);
    expect(result.value.events[0]?.fields).toEqual(["summaryMaxLength"]);
  });

  it("何も変わらなければイベントを出さない", () => {
    const result = create().changeSettings({ name: "申込管理" }, admin, at);
    expect(result).toMatchObject({ ok: true, value: { events: [] } });
  });

  it("設定を変えられるのは管理者だけ", () => {
    const owner: Actor = { userId: "owner", role: "owner" };
    expect(
      create().changeSettings({ summaryMaxLength: 200 }, owner, at),
    ).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "プロジェクトの設定を変えられるのは、管理者だけです。",
      },
    });
  });
});
