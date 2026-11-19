import { fail, ok, type Result } from "../shared/result.ts";
import { requiredText } from "../shared/text.ts";
import { checkPermission } from "./permission.ts";
import type { Actor, Role } from "./role.ts";

export type InvitationId = string & { readonly __brand: "InvitationId" };
export const invitationId = (value: string) => value as InvitationId;

export interface Member {
  readonly userId: string;
  readonly role: Role;
}

/** 未受諾の招待。メールアドレスは小文字にして持つ */
export interface Invitation {
  readonly id: InvitationId;
  readonly email: string;
  readonly role: Role;
  readonly invitedBy: string;
  readonly createdAt: string;
}

export interface ProjectMembersSnapshot {
  readonly projectId: string;
  readonly members: readonly Member[];
  readonly invitations: readonly Invitation[];
}

interface MembersEventBase {
  readonly projectId: string;
  readonly occurredAt: string;
  readonly actorId: string | null;
}

export type MembersEvent = MembersEventBase &
  (
    | {
        readonly type: "MemberInvited";
        readonly invitationId: InvitationId;
        readonly email: string;
        readonly role: Role;
      }
    | {
        readonly type: "InvitationCancelled";
        readonly invitationId: InvitationId;
      }
    | {
        readonly type: "InvitationAccepted";
        readonly invitationId: InvitationId;
        readonly userId: string;
        readonly role: Role;
      }
    | {
        readonly type: "MemberRoleChanged";
        readonly userId: string;
        readonly from: Role;
        readonly to: Role;
      }
    | { readonly type: "MemberRemoved"; readonly userId: string }
  );

export interface MembersChange {
  readonly members: ProjectMembers;
  readonly events: readonly MembersEvent[];
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

/**
 * プロジェクトのメンバー構成（FR-082）。
 * 管理者が1人以上いて、1人の利用者が持つロールは1つだけ。
 */
export class ProjectMembers {
  private readonly state: ProjectMembersSnapshot;

  private constructor(state: ProjectMembersSnapshot) {
    this.state = state;
  }

  static fromSnapshot(snapshot: ProjectMembersSnapshot): ProjectMembers {
    return new ProjectMembers(snapshot);
  }

  /** プロジェクトを作った人を、最初の管理者にする（FR-060、FR-090） */
  static start(projectId: string, adminUserId: string): ProjectMembers {
    return new ProjectMembers({
      projectId,
      members: [{ userId: adminUserId, role: "admin" }],
      invitations: [],
    });
  }

  toSnapshot(): ProjectMembersSnapshot {
    return this.state;
  }

  /** 利用者のロールを返す。メンバーでなければ null */
  roleOf(userId: string): Role | null {
    return this.findMember(userId)?.role ?? null;
  }

  invite(
    input: {
      readonly id: InvitationId;
      readonly email: string;
      readonly role: Role;
    },
    actor: Actor,
    at: Date,
  ): Result<MembersChange> {
    const allowed = this.checkManager(actor);
    if (!allowed.ok) return allowed;
    const invitedBy = allowed.value;
    const text = requiredText(input.email, "メールアドレス");
    if (!text.ok) return text;
    const email = text.value.toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      return fail(
        "VALIDATION_FAILED",
        "メールアドレスの形式が正しくありません。",
      );
    }
    if (this.state.invitations.some((i) => i.email === email)) {
      return fail(
        "VALIDATION_FAILED",
        "このメールアドレスにはすでに招待を送っています。",
      );
    }
    const invitation: Invitation = {
      id: input.id,
      email,
      role: input.role,
      invitedBy,
      createdAt: at.toISOString(),
    };
    return ok({
      members: this.with({
        invitations: [...this.state.invitations, invitation],
      }),
      events: [
        {
          ...this.eventBase(actor, at),
          type: "MemberInvited",
          invitationId: invitation.id,
          email,
          role: invitation.role,
        },
      ],
    });
  }

  cancelInvitation(
    id: InvitationId,
    actor: Actor,
    at: Date,
  ): Result<MembersChange> {
    const allowed = this.checkManager(actor);
    if (!allowed.ok) return allowed;
    const invitation = this.findInvitation(id);
    if (!invitation.ok) return invitation;
    return ok({
      members: this.with({
        invitations: this.state.invitations.filter((i) => i.id !== id),
      }),
      events: [
        {
          ...this.eventBase(actor, at),
          type: "InvitationCancelled",
          invitationId: id,
        },
      ],
    });
  }

  /**
   * 招待されたメールアドレスの利用者がログインしたときに、招待のロールでメンバーにする。
   * すでにメンバーなら、ロールは変えずに招待だけを消す。
   */
  acceptInvitation(
    id: InvitationId,
    userId: string,
    at: Date,
  ): Result<MembersChange> {
    const found = this.findInvitation(id);
    if (!found.ok) return found;
    const invitation = found.value;
    const invitations = this.state.invitations.filter((i) => i.id !== id);
    const existing = this.findMember(userId);
    const role = existing?.role ?? invitation.role;
    const members = existing
      ? this.state.members
      : [...this.state.members, { userId, role }];
    return ok({
      members: this.with({ members, invitations }),
      events: [
        {
          ...this.eventBase({ userId, role }, at),
          type: "InvitationAccepted",
          invitationId: id,
          userId,
          role,
        },
      ],
    });
  }

  changeRole(
    userId: string,
    role: Role,
    actor: Actor,
    at: Date,
  ): Result<MembersChange> {
    const allowed = this.checkManager(actor);
    if (!allowed.ok) return allowed;
    const member = this.findMember(userId);
    if (!member) return this.memberNotFound();
    if (member.role === role) return ok({ members: this, events: [] });
    if (member.role === "admin") {
      const last = this.checkNotLastAdmin();
      if (!last.ok) return last;
    }
    return ok({
      members: this.with({
        members: this.state.members.map((m) =>
          m.userId === userId ? { userId, role } : m,
        ),
      }),
      events: [
        {
          ...this.eventBase(actor, at),
          type: "MemberRoleChanged",
          userId,
          from: member.role,
          to: role,
        },
      ],
    });
  }

  remove(userId: string, actor: Actor, at: Date): Result<MembersChange> {
    const allowed = this.checkManager(actor);
    if (!allowed.ok) return allowed;
    const member = this.findMember(userId);
    if (!member) return this.memberNotFound();
    if (member.role === "admin") {
      const last = this.checkNotLastAdmin();
      if (!last.ok) return last;
    }
    return ok({
      members: this.with({
        members: this.state.members.filter((m) => m.userId !== userId),
      }),
      events: [{ ...this.eventBase(actor, at), type: "MemberRemoved", userId }],
    });
  }

  /** メンバーを管理できる人かを確かめ、その人の利用者 ID を返す */
  private checkManager(actor: Actor): Result<string> {
    if (actor.userId === null) {
      return fail(
        "FORBIDDEN",
        "メンバーはログインして使うサーバーモードで管理できます。",
      );
    }
    const allowed = checkPermission(
      actor,
      "manageMembers",
      "メンバーを管理できる",
    );
    if (!allowed.ok) return allowed;
    return ok(actor.userId);
  }

  private checkNotLastAdmin(): Result<void> {
    const admins = this.state.members.filter((m) => m.role === "admin");
    if (admins.length <= 1) {
      return fail(
        "LAST_ADMIN",
        "管理者が1人以上必要です。先にほかのメンバーを管理者にしてください。",
      );
    }
    return ok(undefined);
  }

  private findMember(userId: string): Member | undefined {
    return this.state.members.find((m) => m.userId === userId);
  }

  private findInvitation(id: InvitationId): Result<Invitation> {
    const invitation = this.state.invitations.find((i) => i.id === id);
    if (!invitation) return fail("NOT_FOUND", "招待が見つかりません。");
    return ok(invitation);
  }

  private memberNotFound(): Result<never> {
    return fail("NOT_FOUND", "メンバーが見つかりません。");
  }

  private with(changes: Partial<ProjectMembersSnapshot>): ProjectMembers {
    return new ProjectMembers({ ...this.state, ...changes });
  }

  private eventBase(actor: Actor, at: Date): MembersEventBase {
    return {
      projectId: this.state.projectId,
      occurredAt: at.toISOString(),
      actorId: actor.userId,
    };
  }
}
