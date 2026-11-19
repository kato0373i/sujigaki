import type { Actor } from "../access/role.ts";
import { type JsonValue, jsonEqual } from "../shared/json.ts";
import { fail, ok, type Result } from "../shared/result.ts";
import type { EditedField, ElementEvent } from "./element-event.ts";
import { ELEMENT_KIND_LABELS, type ElementKind } from "./element-kind.ts";
import { findRelationType, resolveRelation } from "./relation-rule.ts";
import { checkReviewTransition, type ReviewState } from "./review-state.ts";

export type ElementId = string & { readonly __brand: "ElementId" };
export type RelationId = string & { readonly __brand: "RelationId" };

export const elementId = (value: string) => value as ElementId;
export const relationId = (value: string) => value as RelationId;

export type AuthorType = "human" | "ai" | "import";

export type Attributes = { readonly [key: string]: JsonValue };

export const EXTERNAL_LINK_KINDS = [
  "manual",
  "spec",
  "design",
  "ticket",
  "other",
] as const;

export type ExternalLinkKind = (typeof EXTERNAL_LINK_KINDS)[number];

export interface ExternalLink {
  readonly id: string;
  readonly kind: ExternalLinkKind;
  readonly url: string;
  readonly label: string | null;
}

/** 元の要素が持つつながり。先の要素は ID と種類で参照する（設計書 ADR-004） */
export interface Relation {
  readonly id: RelationId;
  readonly typeId: string;
  readonly to: ElementId;
  readonly toKind: ElementKind;
}

export interface ElementSnapshot {
  readonly id: ElementId;
  readonly kind: ElementKind;
  readonly name: string;
  readonly summary: string;
  readonly attributes: Attributes;
  readonly reviewState: ReviewState;
  readonly authorType: AuthorType;
  readonly source: string | null;
  readonly version: number;
  readonly deletedAt: string | null;
  readonly links: readonly ExternalLink[];
  readonly relations: readonly Relation[];
  readonly createdAt: string;
  readonly createdBy: string | null;
  readonly updatedAt: string;
  readonly updatedBy: string | null;
}

export interface ElementChange {
  readonly element: Element;
  readonly events: readonly ElementEvent[];
}

export interface NewElement {
  readonly id: ElementId;
  readonly kind: ElementKind;
  readonly name: string;
  readonly summary?: string;
  readonly attributes?: Attributes;
  readonly authorType: AuthorType;
  readonly source?: string | null;
}

export interface ContentChanges {
  readonly name?: string;
  readonly summary?: string;
  readonly attributes?: Attributes;
}

const NAME_MAX_LENGTH = 200;

function validateName(name: string): Result<string> {
  const trimmed = name.trim();
  if (trimmed.length === 0)
    return fail("VALIDATION_FAILED", "名前を入力してください。");
  if (trimmed.length > NAME_MAX_LENGTH) {
    return fail(
      "VALIDATION_FAILED",
      `名前は${NAME_MAX_LENGTH}文字以内にしてください。`,
    );
  }
  return ok(trimmed);
}

function validateLinks(links: readonly ExternalLink[]): Result<void> {
  for (const link of links) {
    if (!/^https?:\/\//.test(link.url)) {
      return fail(
        "VALIDATION_FAILED",
        "リンクの URL は http:// か https:// で始めてください。",
      );
    }
  }
  return ok(undefined);
}

/**
 * 要素の集約。つながり（元として持つもの）と外部リンクを含む。
 * 変更の操作は新しい Element とドメインイベントを返し、自身は変えない。
 */
export class Element {
  private readonly state: ElementSnapshot;

  private constructor(state: ElementSnapshot) {
    this.state = state;
  }

  static fromSnapshot(snapshot: ElementSnapshot): Element {
    return new Element(snapshot);
  }

  static create(
    input: NewElement,
    actor: Actor,
    at: Date,
  ): Result<ElementChange> {
    const name = validateName(input.name);
    if (!name.ok) return name;
    const now = at.toISOString();
    const element = new Element({
      id: input.id,
      kind: input.kind,
      name: name.value,
      summary: input.summary ?? "",
      attributes: input.attributes ?? {},
      reviewState: "unreviewed",
      authorType: input.authorType,
      source: input.source ?? null,
      version: 1,
      deletedAt: null,
      links: [],
      relations: [],
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    });
    return ok({
      element,
      events: [
        {
          type: "ElementCreated",
          elementId: input.id,
          occurredAt: now,
          actorId: actor.userId,
          kind: input.kind,
          name: name.value,
        },
      ],
    });
  }

  get id(): ElementId {
    return this.state.id;
  }

  get kind(): ElementKind {
    return this.state.kind;
  }

  get reviewState(): ReviewState {
    return this.state.reviewState;
  }

  get version(): number {
    return this.state.version;
  }

  get isDeleted(): boolean {
    return this.state.deletedAt !== null;
  }

  get relations(): readonly Relation[] {
    return this.state.relations;
  }

  toSnapshot(): ElementSnapshot {
    return this.state;
  }

  /**
   * 名前・要約・属性を変える。内容が変われば確認状態を未レビューに戻す（FR-013）。
   * 値が今と同じ項目は、変更として扱わない。
   */
  edit(changes: ContentChanges, actor: Actor, at: Date): Result<ElementChange> {
    const deleted = this.ensureNotDeleted();
    if (!deleted.ok) return deleted;

    const next: {
      -readonly [K in keyof ElementSnapshot]?: ElementSnapshot[K];
    } = {};
    const fields: EditedField[] = [];
    if (changes.name !== undefined) {
      const name = validateName(changes.name);
      if (!name.ok) return name;
      if (name.value !== this.state.name) {
        next.name = name.value;
        fields.push("name");
      }
    }
    if (
      changes.summary !== undefined &&
      changes.summary !== this.state.summary
    ) {
      next.summary = changes.summary;
      fields.push("summary");
    }
    if (
      changes.attributes !== undefined &&
      !jsonEqual(changes.attributes, this.state.attributes)
    ) {
      next.attributes = changes.attributes;
      fields.push("attributes");
    }
    if (fields.length === 0) return ok({ element: this, events: [] });

    return ok(
      this.apply(next, actor, at, [this.editedEvent(fields, actor, at)], true),
    );
  }

  /** 外部リンクを置き換える。設計の中身ではないため、確認状態は変えない（FR-013） */
  replaceLinks(
    links: readonly ExternalLink[],
    actor: Actor,
    at: Date,
  ): Result<ElementChange> {
    const deleted = this.ensureNotDeleted();
    if (!deleted.ok) return deleted;
    const valid = validateLinks(links);
    if (!valid.ok) return valid;
    if (
      jsonEqual(
        links as unknown as JsonValue,
        this.state.links as unknown as JsonValue,
      )
    ) {
      return ok({ element: this, events: [] });
    }
    return ok(
      this.apply(
        { links },
        actor,
        at,
        [this.editedEvent(["links"], actor, at)],
        false,
      ),
    );
  }

  /**
   * つながりを追加する。この要素がつながりの元になる組だけを受け付ける。
   * つながりは内容の一部なので、確認状態を未レビューに戻す（FR-001、FR-013）。
   */
  addRelation(
    id: RelationId,
    target: { readonly id: ElementId; readonly kind: ElementKind },
    actor: Actor,
    at: Date,
  ): Result<ElementChange> {
    const deleted = this.ensureNotDeleted();
    if (!deleted.ok) return deleted;
    const type = findRelationType(this.state.kind, target.kind);
    if (!type) {
      const resolved = resolveRelation(this.state.kind, target.kind);
      if (!resolved.ok) return fail(resolved.code, resolved.message);
      const origin = ELEMENT_KIND_LABELS[resolved.type.from];
      return fail(
        "RELATION_NOT_ALLOWED",
        `このつながりは「${origin}」の側で持ちます。「${origin}」の要素からつないでください。`,
      );
    }
    if (
      this.state.relations.some(
        (r) => r.typeId === type.id && r.to === target.id,
      )
    ) {
      return fail("RELATION_EXISTS", "同じつながりがすでにあります。");
    }
    const relation: Relation = {
      id,
      typeId: type.id,
      to: target.id,
      toKind: target.kind,
    };
    return ok(
      this.apply(
        { relations: [...this.state.relations, relation] },
        actor,
        at,
        [this.relationEvent("RelationAdded", relation, actor, at)],
        true,
      ),
    );
  }

  /** つながりを削除する。確認状態を未レビューに戻す（FR-013） */
  removeRelation(
    id: RelationId,
    actor: Actor,
    at: Date,
  ): Result<ElementChange> {
    const deleted = this.ensureNotDeleted();
    if (!deleted.ok) return deleted;
    const relation = this.state.relations.find((r) => r.id === id);
    if (!relation) return fail("NOT_FOUND", "つながりが見つかりません。");
    return ok(
      this.apply(
        { relations: this.state.relations.filter((r) => r.id !== id) },
        actor,
        at,
        [this.relationEvent("RelationRemoved", relation, actor, at)],
        true,
      ),
    );
  }

  /** 確認状態を変える。遷移とロールは要件定義書 7.1 節に従う（FR-030） */
  changeReviewState(
    to: ReviewState,
    actor: Actor,
    at: Date,
  ): Result<ElementChange> {
    const deleted = this.ensureNotDeleted();
    if (!deleted.ok) return deleted;
    const allowed = checkReviewTransition(this.state.reviewState, to, actor);
    if (!allowed.ok) return allowed;
    const event: ElementEvent = {
      type: "ReviewStateChanged",
      elementId: this.state.id,
      occurredAt: at.toISOString(),
      actorId: actor.userId,
      from: this.state.reviewState,
      to,
      automatic: false,
    };
    return ok(this.apply({ reviewState: to }, actor, at, [event], false));
  }

  private relationEvent(
    type: "RelationAdded" | "RelationRemoved",
    relation: Relation,
    actor: Actor,
    at: Date,
  ): ElementEvent {
    return {
      type,
      elementId: this.state.id,
      occurredAt: at.toISOString(),
      actorId: actor.userId,
      relation,
    };
  }

  private ensureNotDeleted(): Result<void> {
    if (this.isDeleted) {
      return fail(
        "ELEMENT_DELETED",
        "削除済みの要素は編集できません。復元してから編集してください。",
      );
    }
    return ok(undefined);
  }

  private editedEvent(
    fields: EditedField[],
    actor: Actor,
    at: Date,
  ): ElementEvent {
    return {
      type: "ElementEdited",
      elementId: this.state.id,
      occurredAt: at.toISOString(),
      actorId: actor.userId,
      fields,
    };
  }

  /**
   * 変更を反映し、バージョンと更新の情報を進める。
   * resetReview が true で未レビュー以外なら、未レビューに戻すイベントも足す。
   */
  private apply(
    next: Partial<ElementSnapshot>,
    actor: Actor,
    at: Date,
    events: ElementEvent[],
    resetReview: boolean,
  ): ElementChange {
    const now = at.toISOString();
    const allEvents = [...events];
    let reviewState = next.reviewState ?? this.state.reviewState;
    if (resetReview && this.state.reviewState !== "unreviewed") {
      reviewState = "unreviewed";
      allEvents.push({
        type: "ReviewStateChanged",
        elementId: this.state.id,
        occurredAt: now,
        actorId: actor.userId,
        from: this.state.reviewState,
        to: "unreviewed",
        automatic: true,
      });
    }
    const element = new Element({
      ...this.state,
      ...next,
      reviewState,
      version: this.state.version + 1,
      updatedAt: now,
      updatedBy: actor.userId,
    });
    return { element, events: allEvents };
  }
}
