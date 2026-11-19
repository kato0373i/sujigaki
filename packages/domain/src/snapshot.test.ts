import { describe, expect, it } from "vitest";
import { invitationId, ProjectMembers } from "./access/project-members.ts";
import { Comment, commentId } from "./deliberation/comment.ts";
import { Decision, decisionId } from "./deliberation/decision.ts";
import { Question, questionId } from "./deliberation/question.ts";
import { Element, elementId, relationId } from "./model/element.ts";
import { Layout } from "./model/layout.ts";
import { Project } from "./model/project.ts";
import { ACTORS, AT, unwrap } from "./testing/index.ts";

/** JSON にして戻す。データベースの jsonb や YAML に保存して読み戻すのと同じ形にする */
function throughJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("集約を保存して読み戻す", () => {
  it("要素", () => {
    const created = unwrap(
      Element.create(
        {
          id: elementId("a1"),
          kind: "activity",
          name: "申込を受け付ける",
          attributes: { mode: "manual", exceptions: ["書類の不足"] },
          authorType: "human",
        },
        ACTORS.editor,
        AT,
      ),
    ).element;
    const element = unwrap(
      created.addRelation(
        relationId("r1"),
        { id: elementId("actor1"), kind: "actor" },
        ACTORS.editor,
        AT,
      ),
    ).element;
    const restored = Element.fromSnapshot(throughJson(element.toSnapshot()));
    expect(restored.toSnapshot()).toEqual(element.toSnapshot());
    expect(restored.id).toBe("a1");
    expect(restored.kind).toBe("activity");
  });

  it("問い・決定記録・コメント", () => {
    const question = unwrap(
      Question.ask(
        {
          id: questionId("q1"),
          elementId: elementId("a1"),
          body: "担当者は誰ですか",
          authorType: "auto",
        },
        ACTORS.editor,
        AT,
      ),
    ).question;
    const decision = unwrap(
      Decision.record(
        {
          id: decisionId("d1"),
          topic: "担当",
          conclusion: "受付担当",
          reason: "窓口と同じ人がよい",
          elementIds: [elementId("a1")],
        },
        ACTORS.owner,
        AT,
      ),
    ).decision;
    const comment = unwrap(
      Comment.write(
        { id: commentId("c1"), elementId: elementId("a1"), body: "確認中" },
        ACTORS.viewer,
        AT,
      ),
    );
    const q = Question.fromSnapshot(throughJson(question.toSnapshot()));
    const d = Decision.fromSnapshot(throughJson(decision.toSnapshot()));
    const c = Comment.fromSnapshot(throughJson(comment.toSnapshot()));
    expect(q.toSnapshot()).toEqual(question.toSnapshot());
    expect(q.id).toBe("q1");
    expect(d.toSnapshot()).toEqual(decision.toSnapshot());
    expect(d.id).toBe("d1");
    expect(c.toSnapshot()).toEqual(comment.toSnapshot());
  });

  it("プロジェクト・図の配置・メンバー構成", () => {
    const project = unwrap(
      Project.create(
        { id: "p1", name: "申込", systemName: "申込システム" },
        AT,
      ),
    );
    const layout = unwrap(
      Layout.empty(elementId("buc1")).save(
        { [elementId("a1")]: { x: 1, y: 2 } },
        ACTORS.editor,
        AT,
      ),
    ).layout;
    const members = unwrap(
      ProjectMembers.start("p1", "admin").invite(
        { id: invitationId("i1"), email: "a@example.com", role: "viewer" },
        ACTORS.admin,
        AT,
      ),
    ).members;
    const p = Project.fromSnapshot(throughJson(project.toSnapshot()));
    const l = Layout.fromSnapshot(throughJson(layout.toSnapshot()));
    const m = ProjectMembers.fromSnapshot(throughJson(members.toSnapshot()));
    expect(p.toSnapshot()).toEqual(project.toSnapshot());
    expect(p.id).toBe("p1");
    expect(l.toSnapshot()).toEqual(layout.toSnapshot());
    expect(m.toSnapshot()).toEqual(members.toSnapshot());
  });
});
