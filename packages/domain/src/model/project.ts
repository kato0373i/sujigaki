import { checkPermission } from "../access/permission.ts";
import type { Actor } from "../access/role.ts";
import { fail, ok, type Result } from "../shared/result.ts";
import { requiredText } from "../shared/text.ts";

/** 要約の上限の既定値（FR-005） */
export const DEFAULT_SUMMARY_MAX_LENGTH = 100;

export interface ProjectSettings {
  readonly name: string;
  /** RDRA の「システム」の名前。関連データの1行目に書き出す */
  readonly systemName: string;
  readonly summaryMaxLength: number;
}

export interface ProjectSnapshot extends ProjectSettings {
  readonly id: string;
  readonly createdAt: string;
}

export interface ProjectSettingsChanged {
  readonly type: "ProjectSettingsChanged";
  readonly projectId: string;
  readonly fields: readonly (keyof ProjectSettings)[];
  readonly occurredAt: string;
  readonly actorId: string | null;
}

export interface ProjectChange {
  readonly project: Project;
  readonly events: readonly ProjectSettingsChanged[];
}

const SETTING_KEYS = ["name", "systemName", "summaryMaxLength"] as const;

/** プロジェクトと、その設定（FR-005、FR-090） */
export class Project {
  private readonly state: ProjectSnapshot;

  private constructor(state: ProjectSnapshot) {
    this.state = state;
  }

  static fromSnapshot(snapshot: ProjectSnapshot): Project {
    return new Project(snapshot);
  }

  /** プロジェクトを作る。作った人を管理者にするのは、メンバー構成の側で行う */
  static create(
    input: {
      readonly id: string;
      readonly name: string;
      readonly systemName: string;
      readonly summaryMaxLength?: number;
    },
    at: Date,
  ): Result<Project> {
    const settings = parseSettings({
      name: input.name,
      systemName: input.systemName,
      summaryMaxLength: input.summaryMaxLength ?? DEFAULT_SUMMARY_MAX_LENGTH,
    });
    if (!settings.ok) return settings;
    return ok(
      new Project({
        id: input.id,
        ...settings.value,
        createdAt: at.toISOString(),
      }),
    );
  }

  get id(): string {
    return this.state.id;
  }

  get summaryMaxLength(): number {
    return this.state.summaryMaxLength;
  }

  toSnapshot(): ProjectSnapshot {
    return this.state;
  }

  /** 設定を変える。管理者だけができる */
  changeSettings(
    changes: Partial<ProjectSettings>,
    actor: Actor,
    at: Date,
  ): Result<ProjectChange> {
    const allowed = checkPermission(
      actor,
      "configureProject",
      "プロジェクトの設定を変えられる",
    );
    if (!allowed.ok) return allowed;
    const settings = parseSettings({ ...this.state, ...changes });
    if (!settings.ok) return settings;
    const fields = SETTING_KEYS.filter(
      (key) => settings.value[key] !== this.state[key],
    );
    if (fields.length === 0) return ok({ project: this, events: [] });
    return ok({
      project: new Project({ ...this.state, ...settings.value }),
      events: [
        {
          type: "ProjectSettingsChanged",
          projectId: this.state.id,
          fields,
          occurredAt: at.toISOString(),
          actorId: actor.userId,
        },
      ],
    });
  }
}

function parseSettings(input: ProjectSettings): Result<ProjectSettings> {
  const name = requiredText(input.name, "プロジェクトの名前");
  if (!name.ok) return name;
  const systemName = requiredText(input.systemName, "システム名");
  if (!systemName.ok) return systemName;
  const max = input.summaryMaxLength;
  if (!Number.isInteger(max) || max < 1) {
    return fail("VALIDATION_FAILED", "要約の上限は1以上の整数にしてください。");
  }
  return ok({
    name: name.value,
    systemName: systemName.value,
    summaryMaxLength: max,
  });
}
