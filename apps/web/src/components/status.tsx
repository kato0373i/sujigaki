import {
  REVIEW_STATE_LABELS,
  type ReviewState,
  type Violation,
} from "@sujigaki/domain";
import type { ActivityMode } from "../model/business-flow.ts";

/**
 * 確認状態のアイコン（画面設計書 5章、NFR-017）。色だけでなく形でも区別する。
 * withText が false のときは、文字をマウスを重ねたときと読み上げで出す
 */
export function ReviewStateMark({
  state,
  withText = true,
}: {
  state: ReviewState;
  withText?: boolean;
}) {
  const label = REVIEW_STATE_LABELS[state];
  return (
    <span className={`review review-${state}`} title={label}>
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        role="img"
        aria-label={label}
      >
        {state === "unreviewed" && (
          <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" />
        )}
        {state === "needs_check" && (
          <>
            <circle cx="8" cy="8" r="7" />
            <text
              x="8"
              y="12"
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
            >
              ?
            </text>
          </>
        )}
        {state === "needs_fix" && (
          <>
            <path d="M8 1 L15 14 L1 14 Z" />
            <text
              x="8"
              y="13"
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
            >
              !
            </text>
          </>
        )}
        {state === "approved" && (
          <>
            <circle cx="8" cy="8" r="7" />
            <path d="M4.5 8.5 L7 11 L11.5 5.5" fill="none" strokeWidth="2" />
          </>
        )}
      </svg>
      {withText && <span className="review-text">{label}</span>}
    </span>
  );
}

const MODE_LABELS = { manual: "手作業", system: "システム" } as const;

/** 活動の区分（画面設計書 5章）。手作業は手のアイコン、システム利用は画面のアイコン */
export function ModeMark({ mode }: { mode: ActivityMode }) {
  if (mode === null) return null;
  const label = MODE_LABELS[mode];
  return (
    <span className={`mode mode-${mode}`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        {mode === "system" ? (
          <>
            <rect
              x="1.5"
              y="2.5"
              width="13"
              height="9"
              rx="1"
              fill="none"
              strokeWidth="1.5"
            />
            <path d="M5 14 H11" strokeWidth="1.5" />
          </>
        ) : (
          <path
            d="M5 14 V7 a1 1 0 0 1 2 0 V3 a1 1 0 0 1 2 0 V6 a1 1 0 0 1 2 0 V8 a1 1 0 0 1 2 0 V11 a3 3 0 0 1 -3 3 Z"
            fill="none"
            strokeWidth="1.3"
          />
        )}
      </svg>
      <span>{label}</span>
    </span>
  );
}

/** 検証の違反（画面設計書 5章）。三角の注意のアイコンと、違反の内容 */
export function ViolationMark({
  violations,
}: {
  violations: readonly Violation[];
}) {
  if (violations.length === 0) return null;
  const text = violations.map((v) => v.message).join("\n");
  return (
    <span className="violation" title={text}>
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        role="img"
        aria-label={`検証の違反: ${text}`}
      >
        <path d="M8 1 L15 14 L1 14 Z" />
        <text x="8" y="13" textAnchor="middle" fontSize="10" fontWeight="700">
          !
        </text>
      </svg>
    </span>
  );
}
