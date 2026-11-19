import { describe, expect, it } from "vitest";
import type { Actor } from "../access/role.ts";
import { elementId } from "./element.ts";
import { Layout } from "./layout.ts";

const at = new Date("2026-11-19T00:00:00Z");
const editor: Actor = { userId: "u1", role: "editor" };
const buc = elementId("buc1");
const a = elementId("a1");

describe("図の配置", () => {
  it("保存するとバージョンが上がり、イベントを出す", () => {
    const result = Layout.empty(buc).save(
      { [a]: { x: 10, y: 20 } },
      editor,
      at,
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.layout.version).toBe(1);
    expect(result.value.layout.positionOf(a)).toEqual({ x: 10, y: 20 });
    expect(result.value.events).toEqual([
      {
        type: "LayoutChanged",
        bucId: buc,
        occurredAt: at.toISOString(),
        actorId: "u1",
      },
    ]);
  });

  it("位置が変わらなければバージョンを上げない", () => {
    const first = Layout.empty(buc).save({ [a]: { x: 1, y: 2 } }, editor, at);
    if (!first.ok) throw new Error(first.error.message);
    const second = first.value.layout.save({ [a]: { x: 1, y: 2 } }, editor, at);
    expect(second).toMatchObject({ ok: true, value: { events: [] } });
    if (second.ok) expect(second.value.layout.version).toBe(1);
  });

  it("数でない位置は保存しない", () => {
    const result = Layout.empty(buc).save(
      { [a]: { x: Number.NaN, y: 0 } },
      editor,
      at,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("閲覧者は配置を変えられない", () => {
    const viewer: Actor = { userId: "u2", role: "viewer" };
    const result = Layout.empty(buc).save({ [a]: { x: 0, y: 0 } }, viewer, at);
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
