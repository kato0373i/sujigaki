import { REVIEW_STATES } from "@sujigaki/domain";
import { ReviewStateMark } from "../components/status.tsx";
import type { BusinessRow } from "../model/business-list.ts";
import { hrefOf } from "../route.ts";

/** S-03 業務一覧。業務ごとに業務フローと、確認状態ごとの要素の数を出す */
export function BusinessList({ rows }: { rows: readonly BusinessRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="screen">
        <h1>業務一覧</h1>
        <p className="empty">まだ業務がありません。</p>
      </section>
    );
  }
  return (
    <section className="screen">
      <h1>業務一覧</h1>
      <ul className="business-list">
        {rows.map((row) => (
          <li key={row.business?.id ?? "unassigned"} className="business-row">
            <div className="business-head">
              <h2>{row.business?.name ?? "業務に属さない業務フロー"}</h2>
              <ul className="counts" aria-label="確認状態ごとの要素の数">
                {REVIEW_STATES.map((state) => (
                  <li key={state}>
                    <ReviewStateMark state={state} />
                    <span className="count">{row.counts[state]}</span>
                  </li>
                ))}
              </ul>
            </div>
            {row.flows.length === 0 ? (
              <p className="empty">業務フローがありません。</p>
            ) : (
              <ul className="flows">
                {row.flows.map((flow) => (
                  <li key={flow.id}>
                    <a href={hrefOf({ screen: "flow", bucId: flow.id })}>
                      {flow.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
