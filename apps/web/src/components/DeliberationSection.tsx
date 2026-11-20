import {
  type Actor,
  can,
  type ElementSnapshot,
  QUESTION_STATE_LABELS,
  type QuestionSnapshot,
} from "@sujigaki/domain";
import { type FormEvent, useState } from "react";
import {
  answerQuestion,
  askQuestion,
  changeQuestionState,
  type Snapshot,
} from "../api.ts";
import { questionActions } from "../model/question-actions.ts";

/**
 * 詳細パネルの問いと決定記録（画面設計書 P-01）。問いを付け、回答・取り下げ・回答の取り消し・解決ができる（FR-031）
 */
export function DeliberationSection({
  projectId,
  element,
  snapshot,
  actor,
  onChanged,
  onError,
}: {
  projectId: string;
  element: ElementSnapshot;
  snapshot: Snapshot;
  actor: Actor;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const questions = snapshot.questions.filter(
    (q) => q.elementId === element.id,
  );
  const decisions = snapshot.decisions.filter((d) =>
    d.elementIds.includes(element.id),
  );

  /** 操作をして読み直す。失敗したら理由を出す */
  const run = async (task: () => Promise<unknown>) => {
    onError(null);
    try {
      await task();
      onChanged();
      return true;
    } catch (problem) {
      onError((problem as Error).message);
      return false;
    }
  };

  return (
    <section aria-labelledby="deliberation-heading">
      <h3 id="deliberation-heading">問いと決定記録</h3>
      {questions.length === 0 && decisions.length === 0 && (
        <p className="muted">問いと決定記録はありません。</p>
      )}
      <ul className="plain questions">
        {questions.map((q) => (
          <QuestionItem
            key={q.id}
            question={q}
            actor={actor}
            onAnswer={(answer) =>
              run(() => answerQuestion(projectId, q.id, answer))
            }
            onChange={(action) =>
              run(() => changeQuestionState(projectId, q.id, action))
            }
          />
        ))}
        {decisions.map((d) => (
          <li key={d.id}>
            <span className="muted">決定</span> {d.topic}: {d.conclusion}
          </li>
        ))}
      </ul>
      {can(actor, "askQuestion") && (
        <AskQuestion
          onAsk={(body, recommendation) =>
            run(() =>
              askQuestion(projectId, {
                elementId: element.id,
                body,
                recommendation,
                authorType: "human",
              }),
            )
          }
        />
      )}
    </section>
  );
}

function QuestionItem({
  question,
  actor,
  onAnswer,
  onChange,
}: {
  question: QuestionSnapshot;
  actor: Actor;
  onAnswer: (answer: string | null) => Promise<boolean>;
  onChange: (action: "retract" | "resolve" | "withdraw") => Promise<boolean>;
}) {
  const actions = questionActions(question, actor);
  const [answer, setAnswer] = useState("");
  const [empty, setEmpty] = useState(false);
  const label = `「${question.body}」`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (answer.trim() === "") {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    if (await onAnswer(answer.trim())) setAnswer("");
  };

  return (
    <li className="question">
      <div>
        <span className="muted">
          問い（{QUESTION_STATE_LABELS[question.state]}）
        </span>{" "}
        {question.body}
      </div>
      {question.recommendation && (
        <div className="muted">推奨案: {question.recommendation}</div>
      )}
      {question.answer && <div>回答: {question.answer}</div>}
      {actions.answer && (
        <form className="question-answer" onSubmit={submit}>
          <input
            aria-label={`${label}への回答`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button type="submit">回答する</button>
        </form>
      )}
      {empty && (
        <p className="error-inline" role="alert">
          回答を入力してください。
        </p>
      )}
      <div className="question-actions">
        {actions.acceptRecommendation && (
          <button type="button" onClick={() => onAnswer(null)}>
            推奨案で回答
          </button>
        )}
        {actions.withdraw && (
          <button
            type="button"
            aria-label={`${label}を取り下げる`}
            onClick={() => onChange("withdraw")}
          >
            取り下げる
          </button>
        )}
        {actions.retract && (
          <button
            type="button"
            aria-label={`${label}の回答を取り消す`}
            onClick={() => onChange("retract")}
          >
            回答を取り消す
          </button>
        )}
        {actions.resolve && (
          <button
            type="button"
            aria-label={`${label}を解決にする`}
            onClick={() => onChange("resolve")}
          >
            解決にする
          </button>
        )}
      </div>
    </li>
  );
}

/** 「＋ 問いを追加」。問いと推奨案（任意）を書いて付ける */
function AskQuestion({
  onAsk,
}: {
  onAsk: (body: string, recommendation: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [recommendation, setRecommendation] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        ＋ 問いを追加
      </button>
    );
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (body.trim() === "") return;
    const ok = await onAsk(body.trim(), recommendation.trim() || null);
    if (ok) {
      setBody("");
      setRecommendation("");
      setOpen(false);
    }
  };
  return (
    <form className="ask-question" onSubmit={submit}>
      <label className="field">
        <span>問い</span>
        <input value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="field">
        <span>推奨案（任意）</span>
        <input
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value)}
        />
      </label>
      <div className="question-actions">
        <button type="submit" disabled={body.trim() === ""}>
          問いを付ける
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}
