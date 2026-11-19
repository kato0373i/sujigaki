import {
  type Actor,
  can,
  ELEMENT_KIND_LABELS,
  type ElementSnapshot,
  PERMISSIONS,
  ROLE_LABELS,
} from "@sujigaki/domain";
import { useCallback, useEffect, useState } from "react";
import {
  ApiProblem,
  fetchDeletedElements,
  purgeElement,
  restoreElement,
} from "../api.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";

const dateTime = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "ready"; readonly elements: readonly ElementSnapshot[] };

/**
 * S-10 削除済みの要素（FR-012）。復元と、管理者だけが行える完全な削除を置く。
 * ローカルモードには利用者がいないため、削除した人の列を出さない
 */
export function DeletedElements({
  projectId,
  actor,
  onChanged,
}: {
  projectId: string;
  actor: Actor;
  onChanged: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [purging, setPurging] = useState<ElementSnapshot | null>(null);
  const canRestore = can(actor, "editElement");
  const canPurge = can(actor, "purgeElement");
  const showsDeletedBy = actor.userId !== null;

  const load = useCallback(() => {
    fetchDeletedElements(projectId)
      .then((elements) => setLoaded({ state: "ready", elements }))
      .catch((error: Error) =>
        setLoaded({ state: "failed", message: error.message }),
      );
  }, [projectId]);
  useEffect(load, [load]);

  /** 操作をして、一覧とモデルを読み直す。失敗したら理由を出す */
  const run = async (task: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await task();
      setMessage({ ok: true, text: done });
      onChanged();
    } catch (problem) {
      setMessage({
        ok: false,
        text:
          problem instanceof ApiProblem && problem.code === "VERSION_CONFLICT"
            ? "ほかの人が先に更新しました。一覧を読み直したので、もう一度操作してください。"
            : (problem as Error).message,
      });
    } finally {
      load();
    }
  };

  const purge = (element: ElementSnapshot) => {
    setPurging(null);
    void run(
      () => purgeElement(projectId, element),
      `「${element.name}」を完全に削除しました。`,
    );
  };

  return (
    <section className="screen deleted">
      <h1>削除済みの要素</h1>
      {message && (
        <p
          className={message.ok ? "success" : "error-inline"}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
      {loaded.state === "loading" && <p className="empty">読み込んでいます…</p>}
      {loaded.state === "failed" && (
        <p className="error" role="alert">
          {loaded.message}
        </p>
      )}
      {loaded.state === "ready" && loaded.elements.length === 0 && (
        <p className="empty">削除済みの要素はありません。</p>
      )}
      {loaded.state === "ready" && loaded.elements.length > 0 && (
        <table className="deleted-table">
          <thead>
            <tr>
              <th scope="col">種類</th>
              <th scope="col">名前</th>
              <th scope="col">削除した日時</th>
              {showsDeletedBy && <th scope="col">削除した人</th>}
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {loaded.elements.map((element) => (
              <tr key={element.id}>
                <td>{ELEMENT_KIND_LABELS[element.kind]}</td>
                <th scope="row">{element.name}</th>
                <td>
                  {element.deletedAt &&
                    dateTime.format(new Date(element.deletedAt))}
                </td>
                {showsDeletedBy && <td>{element.deletedBy ?? ""}</td>}
                <td>
                  <div className="deleted-actions">
                    <button
                      type="button"
                      disabled={!canRestore}
                      title={
                        canRestore
                          ? undefined
                          : `${ROLE_LABELS[PERMISSIONS.editElement]}以上が操作できます`
                      }
                      aria-label={`「${element.name}」を復元`}
                      onClick={() =>
                        run(
                          () => restoreElement(projectId, element),
                          `「${element.name}」を復元しました。`,
                        )
                      }
                    >
                      復元
                    </button>
                    {canPurge && (
                      <button
                        type="button"
                        className="danger"
                        aria-label={`「${element.name}」を完全に削除`}
                        onClick={() => setPurging(element)}
                      >
                        完全に削除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {purging && (
        <ConfirmDialog
          title={`「${purging.name}」を完全に削除しますか`}
          confirmLabel="完全に削除する"
          onConfirm={() => purge(purging)}
          onCancel={() => setPurging(null)}
        >
          <p>完全に削除すると、元に戻せません。</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
