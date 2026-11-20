import {
  type ElementSnapshot,
  REVIEW_STATE_LABELS,
  type Violation,
} from "@sujigaki/domain";
import { useState } from "react";
import { answerQuestion, askQuestion, type Snapshot } from "../api.ts";
import { ReviewStateMark } from "../components/status.tsx";
import {
  BOARD_FILTER_LABELS,
  type BoardFilter,
  type BoardQuestion,
  reviewBoardView,
} from "../model/review-board.ts";

/**
 * S-06 確認ボード（FR-024）。業務ごとに、要素を確認状態ごとに並べ、問いと検証の違反も同じ画面に出す
 */
export function ReviewBoard({
  projectId,
  snapshot,
  violations,
  initialFilter,
  onSelect,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  violations: readonly Violation[];
  initialFilter: BoardFilter;
  onSelect: (elementId: string) => void;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<BoardFilter>(initialFilter);
  const [businessId, setBusinessId] = useState<string>("");
  const groups = reviewBoardView(
    snapshot.elements,
    snapshot.questions,
    violations,
    filter,
    businessId === "" ? null : businessId,
  );
  const businesses = snapshot.elements.filter(
    (e) => e.kind === "business" && e.deletedAt === null,
  );

  return (
    <section className="screen">
      <h1>確認ボード</h1>
      <div className="board-filters">
        <label>
          絞り込み{" "}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as BoardFilter)}
          >
            {(Object.keys(BOARD_FILTER_LABELS) as BoardFilter[]).map((f) => (
              <option key={f} value={f}>
                {BOARD_FILTER_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          業務{" "}
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
          >
            <option value="">すべて</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {groups.length === 0 && (
        <p className="empty">確認するものはありません。</p>
      )}
      {groups.map((group) => {
        const title = group.business?.name ?? "業務に属さない要素";
        return (
          <section
            key={group.business?.id ?? "none"}
            className="board-group"
            aria-label={title}
          >
            <h2>{title}</h2>
            <div className="board-columns">
              {group.states.map(({ state, elements }) => (
                <div key={state} className="board-column">
                  <h3>
                    {REVIEW_STATE_LABELS[state]}（{elements.length}）
                  </h3>
                  <ElementList elements={elements} onSelect={onSelect} />
                </div>
              ))}
              {(filter === "mine" || filter === "all") && (
                <div className="board-column">
                  <h3>未回答の問い（{group.questions.length}）</h3>
                  <QuestionList
                    projectId={projectId}
                    questions={group.questions}
                    onSelect={onSelect}
                    onChanged={onChanged}
                  />
                </div>
              )}
              {(filter === "fix" || filter === "all") && (
                <div className="board-column">
                  <h3>検証の違反（{group.violations.length}）</h3>
                  <ul className="plain">
                    {group.violations.map(({ violation, element }) => (
                      <li
                        key={`${violation.rule}-${element.id}-${violation.relationId ?? ""}`}
                      >
                        <button
                          type="button"
                          className="link"
                          onClick={() => onSelect(element.id)}
                        >
                          {element.name}
                        </button>
                        <span className="violation-message">
                          {violation.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </section>
  );
}

function ElementList({
  elements,
  onSelect,
}: {
  elements: readonly ElementSnapshot[];
  onSelect: (elementId: string) => void;
}) {
  return (
    <ul className="plain">
      {elements.map((e) => (
        <li key={e.id}>
          <ReviewStateMark state={e.reviewState} withText={false} />{" "}
          <button type="button" className="link" onClick={() => onSelect(e.id)}>
            {e.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 未回答の問いを、要素ごとにまとめて出す。要素の名前は1回だけ出す */
function QuestionList({
  projectId,
  questions,
  onSelect,
  onChanged,
}: {
  projectId: string;
  questions: readonly BoardQuestion[];
  onSelect: (elementId: string) => void;
  onChanged: () => void;
}) {
  const byElement = new Map<string, BoardQuestion[]>();
  for (const q of questions) {
    byElement.set(q.element.id, [...(byElement.get(q.element.id) ?? []), q]);
  }
  return (
    <ul className="plain">
      {[...byElement.values()].map((items) => {
        const element = items[0]?.element;
        if (!element) return null;
        return (
          <li key={element.id} className="board-question-group">
            <button
              type="button"
              className="link"
              onClick={() => onSelect(element.id)}
            >
              {element.name}
            </button>
            <ul className="plain board-question-list">
              {items.map((q) => (
                <QuestionItem
                  key={q.key}
                  projectId={projectId}
                  question={q}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/** 未回答の問い。推奨案を採用するボタンと回答の欄を置く（FR-031）。閲覧者も回答できる */
function QuestionItem({
  projectId,
  question,
  onChanged,
}: {
  projectId: string;
  question: BoardQuestion;
  onChanged: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (text: string | null) => {
    setError(null);
    try {
      // 空欄から計算しただけの問いは、回答するときに保存する（設計書 3章）
      const saved =
        question.saved ??
        (await askQuestion(projectId, {
          elementId: question.element.id,
          body: question.body,
          authorType: "auto",
        }));
      await answerQuestion(projectId, saved.id, text);
      onChanged();
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const inputId = `answer-${question.key}`;
  return (
    <li className="board-question">
      <div className="question-body">
        {question.body}
        {question.auto && <span className="tag tag-auto">自動</span>}
      </div>
      {question.recommendation && (
        <button type="button" onClick={() => submit(null)}>
          推奨案で回答: {question.recommendation}
        </button>
      )}
      {/* Enter でも送れるよう、回答の欄をフォームにする（#115） */}
      <form
        className="answer-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (answer.trim() !== "") submit(answer);
        }}
      >
        <label htmlFor={inputId} className="visually-hidden">
          「{question.body}」への回答
        </label>
        <input
          id={inputId}
          value={answer}
          placeholder="回答を書く"
          onChange={(e) => setAnswer(e.target.value)}
        />
        <button type="submit" disabled={answer.trim() === ""}>
          回答する
        </button>
      </form>
      {error && (
        <p className="error-inline" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
