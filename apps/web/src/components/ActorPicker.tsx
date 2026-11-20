import type { ElementSnapshot } from "@sujigaki/domain";
import { useState } from "react";
import { addRelation, removeRelation } from "../api.ts";
import { undoable } from "../undo-store.ts";

/** 担当者を外すときの選択肢の値 */
const NONE = "";

/**
 * 活動の担当者を選び直す欄（#148）。今の担当者とのつながりを外し、選んだ担当者とつなぐ。
 * 2つの操作は、まとめて元に戻せるようにする（FR-014）
 */
export function ActorPicker({
  projectId,
  element,
  elements,
  canEdit,
  onChanged,
  onError,
}: {
  projectId: string;
  element: ElementSnapshot;
  elements: readonly ElementSnapshot[];
  canEdit: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const actors = elements
    .filter((e) => e.kind === "actor" && e.deletedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const current = element.relations.filter((r) => r.toKind === "actor");
  const chosen = current[0]?.to ?? NONE;

  const choose = async (actorId: string) => {
    if (actorId === chosen) return;
    onError(null);
    setBusy(true);
    try {
      await undoable(async () => {
        let owner = element;
        for (const r of current) {
          owner = await removeRelation(projectId, owner, r.id);
        }
        if (actorId !== NONE) await addRelation(projectId, owner, actorId);
      }, `「${element.name}」の担当者の変更`);
    } catch (problem) {
      onError((problem as Error).message);
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  return (
    <label className="panel-actor">
      担当者{" "}
      <select
        value={chosen}
        disabled={!canEdit || busy}
        onChange={(e) => void choose(e.target.value)}
      >
        <option value={NONE}>担当者が未設定</option>
        {actors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}
