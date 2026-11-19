import {
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
import { describe, expect, it } from "vitest";
import { aiPrompt, scopeElements } from "./ai-prompt.ts";
import { readProposal } from "./ai-proposal.ts";

const actor = elementSnapshot("actor1", "actor", { name: "審査担当" });
const usecase = elementSnapshot("uc1", "usecase", { name: "申込を登録する" });
const activity = elementSnapshot("act1", "activity", {
  name: "申込内容を確認する",
  attributes: { mode: "manual" },
  relations: [relationTo(actor, "activity"), relationTo(usecase, "activity")],
});
const flow = elementSnapshot("buc1", "buc", {
  name: "申込受付",
  relations: [relationTo(activity, "buc")],
});
const business = elementSnapshot("biz1", "business", {
  name: "申込",
  relations: [relationTo(flow, "business")],
});
const requirement = elementSnapshot("req1", "requirement", {
  name: "早く申し込みたい",
  relations: [relationTo(business, "requirement")],
});
const other = elementSnapshot("biz2", "business", { name: "請求" });
const elements = [actor, usecase, activity, flow, business, requirement, other];

describe("FR-033 AI に渡すテキスト", () => {
  it("業務を範囲にすると、業務と業務フロー・活動と、それらに直接つながる要素を含める", () => {
    expect(
      scopeElements(elements, { type: "business", id: "biz1" }).map(
        (e) => e.id,
      ),
    ).toEqual(["act1", "actor1", "biz1", "buc1", "req1", "uc1"]);
  });

  it("業務フローや要素を範囲にでき、ない要素は空にする", () => {
    expect(
      scopeElements(elements, { type: "element", id: "uc1" }).map((e) => e.id),
    ).toEqual(["act1", "uc1"]);
    expect(scopeElements(elements, { type: "flow", id: "none" })).toEqual([]);
  });

  it("依頼・規則・範囲の要素・未解決の問い・返答の形式を、1つのテキストにまとめる", () => {
    const text = aiPrompt({
      systemName: "申込システム",
      elements,
      questions: [questionSnapshot("act1", { body: "締め切りはいつですか" })],
      scope: { type: "business", id: "biz1" },
      template: "gaps",
    });
    for (const heading of [
      "# 依頼",
      "# 規則",
      "# 範囲の要素",
      "# 未解決の問い",
      "# 返答の形式",
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("つながりや属性の抜け漏れを見つけてください");
    expect(text).toContain("activity-actor: 活動 から 登場人物 へ");
    expect(text).toContain("name: 申込内容を確認する");
    expect(text).not.toContain("請求");
    expect(text).toContain("締め切りはいつですか[申込内容を確認する]");
    // 空欄から計算した問いも含める
    expect(text).toContain(
      "この活動は何をきっかけに始まりますか[申込内容を確認する]",
    );
    expect(text).toContain("format: sujigaki-proposal");
  });

  it("返答の形式の例は、そのまま読める", () => {
    const text = aiPrompt({
      systemName: "申込システム",
      elements,
      questions: [],
      scope: { type: "element", id: "act1" },
      template: "draft",
    });
    const example = text.slice(text.indexOf("# 返答の形式"));
    const result = readProposal(example, [], new Date("2026-11-20T00:00:00Z"));
    expect(result.ok).toBe(true);
  });
});
