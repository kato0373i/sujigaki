import {
  type ElementSnapshot,
  type Violation,
  validateModel,
} from "@sujigaki/domain";
import {
  AI_TEMPLATES,
  type AiScope,
  type AiTemplate,
  aiPrompt,
  diffElements,
  type ImportDiff,
  type ProposedQuestion,
  type ReadIssue,
  readProposal,
} from "@sujigaki/interchange";
import { useState } from "react";
import {
  ApiProblem,
  applyChangeSet,
  askQuestion,
  type Snapshot,
} from "../api.ts";
import { ImportDiffView } from "../components/ImportDiffView.tsx";
import { changeSetBody } from "../model/import-review.ts";

type Tab = "prompt" | "proposal";

type Proposal =
  | { readonly state: "none" }
  | { readonly state: "invalid"; readonly issues: readonly ReadIssue[] }
  | {
      readonly state: "ready";
      readonly diff: ImportDiff;
      readonly questions: readonly ProposedQuestion[];
      readonly violations: readonly Violation[];
    };

function parseScope(value: string): AiScope | null {
  const [type, id] = value.split(":");
  if (!id || (type !== "business" && type !== "flow" && type !== "element"))
    return null;
  return { type, id };
}

/** S-08 AI 連携。「AI に渡す」（FR-033）と「提案を取り込む」（FR-034）の2つのタブに分ける */
export function AiExchange({
  projectId,
  snapshot,
  selected,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  selected: ElementSnapshot | undefined;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("prompt");
  return (
    <section className="screen io">
      <h1>AI 連携</h1>
      <div className="tabs" role="tablist" aria-label="AI 連携">
        {(
          [
            ["prompt", "AI に渡す"],
            ["proposal", "提案を取り込む"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "tab active" : "tab"}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "prompt" ? (
        <PromptTab snapshot={snapshot} selected={selected} />
      ) : (
        <ProposalTab
          projectId={projectId}
          snapshot={snapshot}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}

function PromptTab({
  snapshot,
  selected,
}: {
  snapshot: Snapshot;
  selected: ElementSnapshot | undefined;
}) {
  const [scopeValue, setScopeValue] = useState("");
  const [template, setTemplate] = useState<AiTemplate>("gaps");
  const [copied, setCopied] = useState(false);
  const active = snapshot.elements.filter((e) => e.deletedAt === null);
  const scope = parseScope(scopeValue);
  const text = scope
    ? aiPrompt({
        systemName: snapshot.project.systemName,
        elements: snapshot.elements,
        questions: snapshot.questions,
        scope,
        template,
      })
    : "";

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <div className="io-section" role="tabpanel" aria-label="AI に渡す">
      <div className="board-filters">
        <label>
          範囲{" "}
          <select
            value={scopeValue}
            onChange={(e) => {
              setScopeValue(e.target.value);
              setCopied(false);
            }}
          >
            <option value="">選んでください</option>
            {selected && (
              <option value={`element:${selected.id}`}>
                選んでいる要素「{selected.name}」とつながる要素
              </option>
            )}
            <optgroup label="業務">
              {active
                .filter((e) => e.kind === "business")
                .map((e) => (
                  <option key={e.id} value={`business:${e.id}`}>
                    {e.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="業務フロー">
              {active
                .filter((e) => e.kind === "buc")
                .map((e) => (
                  <option key={e.id} value={`flow:${e.id}`}>
                    {e.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <label>
          用途{" "}
          <select
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value as AiTemplate);
              setCopied(false);
            }}
          >
            {(Object.keys(AI_TEMPLATES) as AiTemplate[]).map((t) => (
              <option key={t} value={t}>
                {AI_TEMPLATES[t].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!scope ? (
        <p className="notice" role="status">
          AI に渡す範囲を選んでください。
        </p>
      ) : (
        <>
          <label className="prompt-label" htmlFor="ai-prompt">
            AI に渡すテキスト
          </label>
          <textarea
            id="ai-prompt"
            className="prompt"
            readOnly
            rows={16}
            value={text}
          />
          <div className="prompt-row">
            <span className="muted">
              {text.length}文字（目安のトークン数: およそ
              {Math.ceil(text.length / 1.5)}）
            </span>
            <button type="button" className="primary" onClick={copy}>
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProposalTab({
  projectId,
  snapshot,
  onChanged,
}: {
  projectId: string;
  snapshot: Snapshot;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState("");
  const [proposal, setProposal] = useState<Proposal>({ state: "none" });
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const review = () => {
    setMessage(null);
    const read = readProposal(
      reply,
      snapshot.elements,
      new Date(),
      () => `ai-${crypto.randomUUID()}`,
    );
    if (!read.ok) {
      setProposal({ state: "invalid", issues: read.issues });
      return;
    }
    // 提案を当てたあとのモデルで検証し、提案した要素の違反を反映の前に出す
    const proposedIds = new Set(read.elements.map((e) => e.id as string));
    const merged = [
      ...snapshot.elements.filter((e) => !proposedIds.has(e.id)),
      ...read.elements,
    ];
    const violations = validateModel(merged, {
      summaryMaxLength: snapshot.project.summaryMaxLength,
    }).filter((v) => proposedIds.has(v.elementId));
    setProposal({
      state: "ready",
      diff: diffElements(snapshot.elements, read.elements, {
        removeMissing: false,
      }),
      questions: read.questions,
      violations,
    });
    setChosen(new Set(read.questions.map((_, i) => i)));
  };

  /** 反映したものを提案から外し、残りはそのまま選べるようにする */
  const run = async (
    task: () => Promise<string>,
    done: (p: Proposal) => Proposal,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await task();
      setProposal(done);
      setMessage({ ok: true, text });
      onChanged();
    } catch (problem) {
      const text =
        problem instanceof ApiProblem && problem.code === "VERSION_CONFLICT"
          ? `AI に渡したあとにほかの人が更新した要素があるため、反映しませんでした。最新の内容で、もう一度 AI に渡してください。（${problem.message}）`
          : (problem as Error).message;
      setMessage({ ok: false, text });
    } finally {
      setBusy(false);
    }
  };

  const names = new Map(snapshot.elements.map((e) => [e.id as string, e.name]));

  return (
    <div className="io-section" role="tabpanel" aria-label="提案を取り込む">
      <label className="prompt-label" htmlFor="ai-reply">
        AI の返答
      </label>
      <textarea
        id="ai-reply"
        className="prompt"
        rows={10}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
      />
      <button type="button" disabled={reply.trim() === ""} onClick={review}>
        差分を見る
      </button>

      {message && (
        <p
          className={message.ok ? "success" : "error-inline"}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}

      {proposal.state === "invalid" && (
        <div className="problems" role="alert">
          <p>返答の形式が正しくないため、取り込めません。</p>
          <ul>
            {proposal.issues.map((issue) => (
              <li
                key={`${issue.line}-${issue.path.join(".")}-${issue.message}`}
              >
                {issue.line !== null && `${issue.line}行目: `}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposal.state === "ready" && (
        <>
          {proposal.violations.length > 0 && (
            <div className="problems warning" role="status">
              <p>反映すると、次の検証の違反が残ります。</p>
              <ul>
                {proposal.violations.map((v) => (
                  <li key={`${v.rule}-${v.elementId}`}>
                    {names.get(v.elementId) ?? v.elementId}: {v.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ImportDiffView
            diff={proposal.diff}
            known={snapshot.elements}
            busy={busy}
            onApply={(adopted) =>
              run(
                async () => {
                  await applyChangeSet(
                    projectId,
                    changeSetBody(adopted, {
                      authorType: "ai",
                      source: "AI 提案",
                    }),
                  );
                  return `${adopted.length}件の変更を反映しました。`;
                },
                (p) =>
                  p.state === "ready"
                    ? {
                        ...p,
                        diff: { changes: [], problems: [] },
                        violations: [],
                      }
                    : p,
              )
            }
          />
          {proposal.questions.length > 0 && (
            <div className="ai-questions">
              <h2>提案された問い</h2>
              <ul className="plain">
                {proposal.questions.map((q, index) => {
                  const id = `question-${index}`;
                  return (
                    <li key={id} className="diff-row">
                      <input
                        id={id}
                        type="checkbox"
                        checked={chosen.has(index)}
                        onChange={() => {
                          const next = new Set(chosen);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          setChosen(next);
                        }}
                      />{" "}
                      <label htmlFor={id}>
                        <span className="muted">
                          {names.get(q.elementId) ?? q.elementId}
                        </span>{" "}
                        {q.body}
                        {q.recommendation && `（推奨案: ${q.recommendation}）`}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="primary"
                disabled={busy || chosen.size === 0}
                onClick={() =>
                  run(
                    async () => {
                      const adopted = proposal.questions.filter((_, i) =>
                        chosen.has(i),
                      );
                      for (const q of adopted) {
                        await askQuestion(projectId, {
                          elementId: q.elementId,
                          body: q.body,
                          authorType: "ai",
                          recommendation: q.recommendation,
                        });
                      }
                      return `${adopted.length}件の問いを保存しました。`;
                    },
                    (p) => (p.state === "ready" ? { ...p, questions: [] } : p),
                  )
                }
              >
                選んだ問いを保存（{chosen.size}件）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
