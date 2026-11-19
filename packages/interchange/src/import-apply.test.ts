import type { ElementSnapshot } from "@sujigaki/domain";
import {
  ACTORS,
  AT,
  elementSnapshot,
  relationTo,
  unwrap,
} from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { applyImport, type ImportOrigin } from "./import-apply.ts";
import { diffElements } from "./import-diff.ts";

const origin: ImportOrigin = {
  authorType: "import",
  source: "YAML の取り込み",
};
const actorA = elementSnapshot("actorA", "actor");
const actorB = elementSnapshot("actorB", "actor");
const check = elementSnapshot("a1", "activity", {
  name: "申込内容を確認する",
  reviewState: "approved",
  relations: [relationTo(actorA, "activity")],
});
const notify = elementSnapshot("a2", "activity", {
  name: "審査結果を通知する",
  reviewState: "approved",
});
const current = [check, notify, actorA, actorB];

function find(elements: readonly ElementSnapshot[], id: string) {
  const element = elements.find((e) => e.id === id);
  if (!element) throw new Error(`${id} がない`);
  return element;
}

describe("FR-050 既存のプロジェクトに取り込む", () => {
  it("担当者を変えた活動だけが未レビューになり、ほかは確認済みのまま", () => {
    const incoming = [
      { ...check, relations: [relationTo(actorB, "activity")] },
      notify,
      actorA,
      actorB,
    ];
    const { changes } = diffElements(current, incoming, {
      removeMissing: false,
    });
    const applied = unwrap(
      applyImport(current, changes, ACTORS.editor, AT, origin),
    );
    expect(find(applied.elements, "a1")).toMatchObject({
      reviewState: "unreviewed",
      relations: [{ to: "actorB" }],
    });
    expect(find(applied.elements, "a2").reviewState).toBe("approved");
  });

  it("外部リンクだけの変更では、確認状態を保つ", () => {
    const link = {
      id: "l1",
      kind: "manual" as const,
      url: "https://example.com",
      label: null,
    };
    const { changes } = diffElements(current, [{ ...notify, links: [link] }], {
      removeMissing: false,
    });
    const applied = unwrap(
      applyImport(current, changes, ACTORS.editor, AT, origin),
    );
    expect(find(applied.elements, "a2")).toMatchObject({
      reviewState: "approved",
      links: [link],
    });
  });

  it("要素を削除すると、その要素へつながる要素も未レビューに戻る", () => {
    const { changes } = diffElements(current, [check, notify, actorB], {
      removeMissing: true,
    });
    const applied = unwrap(
      applyImport(current, changes, ACTORS.editor, AT, origin),
    );
    expect(find(applied.elements, "actorA").deletedAt).not.toBeNull();
    expect(find(applied.elements, "a1").reviewState).toBe("unreviewed");
    expect(find(applied.elements, "a2").reviewState).toBe("approved");
  });

  it("削除済みの要素を取り込むと、復元して内容を変える", () => {
    const deleted = { ...notify, deletedAt: AT.toISOString() };
    const { changes } = diffElements(
      [deleted],
      [{ ...notify, name: "通知する" }],
      {
        removeMissing: false,
      },
    );
    const applied = unwrap(
      applyImport([deleted], changes, ACTORS.editor, AT, origin),
    );
    expect(find(applied.elements, "a2")).toMatchObject({
      deletedAt: null,
      name: "通知する",
      reviewState: "unreviewed",
    });
  });
});

describe("FR-034 AI の提案を取り込む", () => {
  const ai: ImportOrigin = { authorType: "ai", source: "AI 提案" };
  const proposals = ["p1", "p2", "p3"].map((id) =>
    elementSnapshot(id, "activity", {
      name: `活動${id}`,
      reviewState: "approved",
      relations: [relationTo(actorA, "activity")],
    }),
  );

  it("採用した2件だけが、未レビューで作成者の種類を AI として追加される", () => {
    const { changes } = diffElements(current, proposals, {
      removeMissing: false,
    });
    const adopted = changes.slice(0, 2);
    const applied = unwrap(
      applyImport(current, adopted, ACTORS.editor, AT, ai),
    );
    const added = applied.elements.filter((e) => e.id.startsWith("p"));
    expect(
      added.map((e) => [e.id, e.reviewState, e.authorType, e.source]),
    ).toEqual([
      ["p1", "unreviewed", "ai", "AI 提案"],
      ["p2", "unreviewed", "ai", "AI 提案"],
    ]);
    expect(added[0]?.relations.map((r) => r.to)).toEqual(["actorA"]);
  });

  it("差分を出したあとにほかの人が更新した要素は、競合として反映しない", () => {
    const { changes } = diffElements(
      current,
      [{ ...notify, name: "通知する" }],
      {
        removeMissing: false,
      },
    );
    const edited = { ...notify, version: 2 };
    const result = applyImport([check, edited], changes, ACTORS.editor, AT, ai);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "VERSION_CONFLICT",
        message:
          "要素「審査結果を通知する」は、差分を出したあとにほかの人が更新しています。最新の内容と比べてから取り込んでください。",
      },
    });
  });

  it("差分を出したあとに同じ ID の要素が作られていれば、競合として反映しない", () => {
    const { changes } = diffElements([], proposals.slice(0, 1), {
      removeMissing: false,
    });
    const result = applyImport(
      proposals.slice(0, 1),
      changes,
      ACTORS.editor,
      AT,
      ai,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
  });

  it("対象の要素がなくなっていれば、反映しない", () => {
    const { changes } = diffElements(
      current,
      [{ ...notify, name: "通知する" }],
      {
        removeMissing: false,
      },
    );
    const result = applyImport([check], changes, ACTORS.editor, AT, ai);
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("閲覧者は取り込みを反映できない", () => {
    const { changes } = diffElements(current, proposals, {
      removeMissing: false,
    });
    const result = applyImport(current, changes, ACTORS.viewer, AT, ai);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "取り込みを反映できるのは、編集者以上です。",
      },
    });
  });

  it("1件でも当てられなければ、何も反映しない", () => {
    // 活動から要求へは、どちらの向きにもつなげない
    const invalid = elementSnapshot("p9", "activity", {
      relations: [relationTo(elementSnapshot("r1", "requirement"))],
    });
    const { changes } = diffElements(current, [...proposals, invalid], {
      removeMissing: false,
    });
    const result = applyImport(current, changes, ACTORS.editor, AT, ai);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "RELATION_NOT_ALLOWED" },
    });
  });
});
