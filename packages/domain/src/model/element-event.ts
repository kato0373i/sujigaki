import type { ElementId, Relation } from "./element.ts";
import type { ElementKind } from "./element-kind.ts";
import type { ReviewState } from "./review-state.ts";

interface ElementEventBase {
  readonly elementId: ElementId;
  readonly occurredAt: string;
  readonly actorId: string | null;
}

export type EditedField = "name" | "summary" | "attributes" | "links";

export type ElementEvent =
  | (ElementEventBase & {
      readonly type: "ElementCreated";
      readonly kind: ElementKind;
      readonly name: string;
    })
  | (ElementEventBase & {
      readonly type: "ElementEdited";
      readonly fields: readonly EditedField[];
    })
  | (ElementEventBase & {
      readonly type: "RelationAdded";
      readonly relation: Relation;
    })
  | (ElementEventBase & {
      readonly type: "RelationRemoved";
      readonly relation: Relation;
    })
  | (ElementEventBase & {
      readonly type: "ReviewStateChanged";
      readonly from: ReviewState;
      readonly to: ReviewState;
      /** 内容の編集などで自動で戻したとき true（FR-013） */
      readonly automatic: boolean;
    });
