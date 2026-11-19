import type { Actor } from "@sujigaki/domain";
import { useEffect, useState } from "react";
import { fetchChanges } from "../api.ts";
import { type UpdateNotice, updateNotice } from "../model/update-notice.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

/** 更新を確かめる間隔（画面設計書 4章） */
const POLL_INTERVAL_MS = 30_000;

/**
 * 読み込んだリビジョンより後の更新を確かめる（FR-071）。
 * タブが表示されているあいだ30秒ごとと、タブに戻ったときに確かめる。読み込み直すと、通知を消す
 */
export function useUpdateNotice(
  projectId: string,
  known: number | null,
  me: Actor,
): UpdateNotice {
  const [notice, setNotice] = useState<UpdateNotice>(null);
  useEffect(() => {
    setNotice(null);
    if (known === null) return;
    let active = true;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      fetchChanges(projectId, known)
        .then((changes) => {
          if (active) setNotice(updateNotice(known, changes, me));
        })
        // 確かめられなくても、次の機会に確かめ直す
        .catch(() => undefined);
    };
    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [projectId, known, me]);
  return notice;
}

/** ヘッダーの更新の通知。保存していない変更があれば、再読み込みの前に確かめる */
export function UpdateBanner({
  notice,
  dirty,
  onReload,
}: {
  notice: NonNullable<UpdateNotice>;
  dirty: boolean;
  onReload: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="update-notice">
      <span role="status">
        {notice.count === null
          ? "更新があります"
          : `${notice.count}件の更新があります`}
      </span>
      <button
        type="button"
        onClick={() => (dirty ? setConfirming(true) : onReload())}
      >
        再読み込み
      </button>
      {confirming && (
        <ConfirmDialog
          title="保存していない変更があります"
          confirmLabel="変更を捨てて再読み込み"
          onConfirm={() => {
            setConfirming(false);
            onReload();
          }}
          onCancel={() => setConfirming(false)}
        >
          <p>
            詳細パネルの変更を保存していません。再読み込みすると、変更は消えます。保存するときは、やめてから保存してください。
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
