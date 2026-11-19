import { checkPermission } from "../access/permission.ts";
import type { Actor } from "../access/role.ts";
import { fail, ok, type Result } from "../shared/result.ts";
import type { ElementId } from "./element.ts";

export interface Position {
  readonly x: number;
  readonly y: number;
}

export type Positions = Readonly<Record<ElementId, Position>>;

export interface LayoutSnapshot {
  /** 図を描く業務フロー（種類が buc の要素） */
  readonly bucId: ElementId;
  readonly positions: Positions;
  /** 保存した回数。まだ保存していない配置は 0 */
  readonly version: number;
  readonly updatedAt: string | null;
}

export interface LayoutChanged {
  readonly type: "LayoutChanged";
  readonly bucId: ElementId;
  readonly occurredAt: string;
  readonly actorId: string | null;
}

export interface LayoutChange {
  readonly layout: Layout;
  readonly events: readonly LayoutChanged[];
}

/**
 * 業務フローの図の配置。要素とは別の集約にしているため、
 * 位置を動かしても要素のバージョンと確認状態は変わらない。
 */
export class Layout {
  private readonly state: LayoutSnapshot;

  private constructor(state: LayoutSnapshot) {
    this.state = state;
  }

  static fromSnapshot(snapshot: LayoutSnapshot): Layout {
    return new Layout(snapshot);
  }

  /** まだ配置を保存していない業務フローの、空の配置 */
  static empty(bucId: ElementId): Layout {
    return new Layout({ bucId, positions: {}, version: 0, updatedAt: null });
  }

  get version(): number {
    return this.state.version;
  }

  positionOf(elementId: ElementId): Position | undefined {
    return this.state.positions[elementId];
  }

  toSnapshot(): LayoutSnapshot {
    return this.state;
  }

  /** 配置をまるごと置き換えて保存する。編集者以上ができる */
  save(positions: Positions, actor: Actor, at: Date): Result<LayoutChange> {
    const allowed = checkPermission(
      actor,
      "editElement",
      "図の配置を変えられる",
    );
    if (!allowed.ok) return allowed;
    const invalid = Object.values(positions).some(
      (p) => !Number.isFinite(p.x) || !Number.isFinite(p.y),
    );
    if (invalid) {
      return fail("VALIDATION_FAILED", "要素の位置が正しくありません。");
    }
    if (samePositions(this.state.positions, positions)) {
      return ok({ layout: this, events: [] });
    }
    const layout = new Layout({
      ...this.state,
      positions,
      version: this.state.version + 1,
      updatedAt: at.toISOString(),
    });
    return ok({
      layout,
      events: [
        {
          type: "LayoutChanged",
          bucId: this.state.bucId,
          occurredAt: at.toISOString(),
          actorId: actor.userId,
        },
      ],
    });
  }
}

function samePositions(a: Positions, b: Positions): boolean {
  const keys = Object.keys(a) as ElementId[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const p = a[key];
    const q = b[key];
    return p !== undefined && q !== undefined && p.x === q.x && p.y === q.y;
  });
}
