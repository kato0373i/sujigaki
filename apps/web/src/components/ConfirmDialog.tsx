import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * 取り消しにくい操作の前に開く確認のダイアログ（D-02 など）。
 * Esc で閉じたときは、やめたものとして扱う
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  children,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby={titleId}
      onCancel={onCancel}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="dialog-actions">
        <button type="button" className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          やめる
        </button>
      </div>
    </dialog>
  );
}
