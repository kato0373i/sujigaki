/** プロジェクトでのロール。`owner` は業務責任者を表す（要件定義書 FR-081） */
export const ROLES = ["viewer", "editor", "owner", "admin"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  viewer: "閲覧者",
  editor: "編集者",
  owner: "業務責任者",
  admin: "管理者",
};

/** role が minimum 以上のロールかを返す。ロールは ROLES の順に強くなる */
export function hasRoleAtLeast(role: Role, minimum: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}

/** 操作した人。ローカルモードではログインしないため、userId は null で、ロールは管理者とする */
export interface Actor {
  readonly userId: string | null;
  readonly role: Role;
}
