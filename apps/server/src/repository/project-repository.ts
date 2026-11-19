import type {
  DecisionSnapshot,
  ElementId,
  ElementSnapshot,
  LayoutSnapshot,
  ProjectSettings,
  QuestionSnapshot,
  Result,
} from "@sujigaki/domain";
import type { ProjectDocument } from "@sujigaki/interchange";

/** 保存してあるプロジェクトの中身と、プロジェクトのリビジョン */
export interface StoredProject {
  readonly document: ProjectDocument;
  /** 操作の記録の通し番号。変更を取り出すとき（FR-071）の目印にする */
  readonly revision: number;
}

/** 保存する内容と、読み込んだときのバージョン。新しく作る要素は null */
export interface Versioned<T> {
  readonly value: T;
  readonly expectedVersion: number | null;
}

/** 操作の記録（設計書 4章の operations）。ドメインイベントから作る */
export interface OperationRecord {
  readonly type: string;
  readonly targetType:
    | "project"
    | "element"
    | "question"
    | "decision"
    | "layout";
  readonly targetId: string;
  readonly actorId: string | null;
  readonly occurredAt: string;
  readonly before: unknown;
  readonly after: unknown;
}

/**
 * 1つのトランザクションで保存する変更の一式（設計書 3章の「保存先（リポジトリ）」）。
 * 問いと決定記録はバージョンを持たないため、問いは上書きし、決定記録は新しく作るだけにする。
 */
export interface ChangeSet {
  /** 1回の保存や取り込みにまとめて付ける ID */
  readonly batchId: string;
  readonly project?: ProjectSettings;
  readonly elements?: readonly Versioned<ElementSnapshot>[];
  /** 完全に削除する要素 */
  readonly purgedElements?: readonly {
    readonly id: ElementId;
    readonly expectedVersion: number;
  }[];
  readonly questions?: readonly QuestionSnapshot[];
  readonly decisions?: readonly DecisionSnapshot[];
  /** 図の配置。まだ保存していない配置のバージョンは 0 として扱う */
  readonly layouts?: readonly (Versioned<LayoutSnapshot> & {
    readonly expectedVersion: number;
  })[];
  readonly operations: readonly OperationRecord[];
}

/** プロジェクトの中身を読み書きする。保存先ごとに実装を差し替える */
export interface ProjectRepository {
  /** 空のプロジェクトを作る。同じ ID のプロジェクトがあれば失敗する */
  create(
    projectId: string,
    settings: ProjectSettings,
  ): Promise<Result<StoredProject>>;
  /** プロジェクトの中身を返す。なければ null */
  load(projectId: string): Promise<StoredProject | null>;
  /**
   * 変更の一式を保存し、新しいリビジョンを返す。
   * 1件でもバージョンが今のものと違えば VERSION_CONFLICT を返し、何も保存しない
   */
  commit(
    projectId: string,
    changes: ChangeSet,
  ): Promise<Result<{ readonly revision: number }>>;
}
