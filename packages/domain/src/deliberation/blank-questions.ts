import type { ElementId, ElementSnapshot } from "../model/element.ts";
import type { ElementKind } from "../model/element-kind.ts";
import type { QuestionSnapshot } from "./question.ts";

/** 空欄から作る問い（FR-035）。保存せず、モデルから毎回計算する */
export interface BlankQuestion {
  /** 要素と空欄の組で決まる識別子。画面の一覧のキーに使う */
  readonly key: string;
  readonly elementId: ElementId;
  /** 空欄の名前。属性のキーか、つながりの先の種類 */
  readonly blank: string;
  readonly body: string;
}

interface BlankRule {
  readonly kind: ElementKind;
  readonly blank: string;
  readonly isBlank: (
    element: ElementSnapshot,
    isActive: (id: ElementId) => boolean,
  ) => boolean;
  readonly body: string;
}

const hasAttribute = (element: ElementSnapshot, key: string) =>
  element.attributes[key] !== undefined;

/**
 * どの空欄から問いを作るか（設計書 3章）。
 * 業務の流れを読むのに欠かせない項目に絞り、手順の概要や例外のような補足の項目は含めない。
 */
export const BLANK_RULES: readonly BlankRule[] = [
  {
    kind: "activity",
    blank: "actor",
    isBlank: (e, isActive) =>
      !e.relations.some((r) => r.toKind === "actor" && isActive(r.to)),
    body: "担当者は誰ですか",
  },
  {
    kind: "activity",
    blank: "mode",
    isBlank: (e) => !hasAttribute(e, "mode"),
    body: "この活動は手作業ですか、システムを使いますか",
  },
  {
    kind: "activity",
    blank: "trigger",
    isBlank: (e) => !hasAttribute(e, "trigger"),
    body: "この活動は何をきっかけに始まりますか",
  },
  {
    kind: "activity",
    blank: "outcome",
    isBlank: (e) => !hasAttribute(e, "outcome"),
    body: "この活動が終わったとき、どういう状態になっていますか",
  },
  {
    kind: "requirement",
    blank: "rationale",
    isBlank: (e) => !hasAttribute(e, "rationale"),
    body: "この要求の根拠は何ですか",
  },
];

/**
 * 空欄から問いを計算する。削除済みの要素は対象にしない。
 * 削除済みの要素へのつながりは、空欄として扱う。
 * 同じ要素に同じ本文の問いがすでに保存されていれば、状態にかかわらず出さない。
 * 回答済みや取り下げの問いを、空欄のままだからといって何度も出さないためである。
 */
export function blankQuestions(
  elements: readonly ElementSnapshot[],
  savedQuestions: readonly QuestionSnapshot[],
): BlankQuestion[] {
  const saved = new Set(savedQuestions.map((q) => `${q.elementId}\n${q.body}`));
  const active = elements.filter((e) => e.deletedAt === null);
  const activeIds = new Set(active.map((e) => e.id));
  const isActive = (id: ElementId) => activeIds.has(id);
  return active.flatMap((element) =>
    BLANK_RULES.filter(
      (rule) =>
        rule.kind === element.kind &&
        rule.isBlank(element, isActive) &&
        !saved.has(`${element.id}\n${rule.body}`),
    ).map((rule) => ({
      key: `${element.id}:${rule.blank}`,
      elementId: element.id,
      blank: rule.blank,
      body: rule.body,
    })),
  );
}
