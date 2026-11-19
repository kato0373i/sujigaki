import type { Actor } from "../access/role.ts";
import type { ElementId } from "../model/element.ts";
import { fail, ok, type Result } from "../shared/result.ts";
import { requiredText } from "../shared/text.ts";

export type CommentId = string & { readonly __brand: "CommentId" };
export const commentId = (value: string) => value as CommentId;

export interface CommentSnapshot {
  readonly id: CommentId;
  readonly elementId: ElementId;
  readonly body: string;
  readonly authorId: string;
  readonly createdAt: string;
}

/**
 * 要素へのコメント（US-009）。閲覧者も書ける。
 * 書いた人を必ず残すため、ログインしていない操作（ローカルモード）では書けない。
 */
export class Comment {
  private readonly state: CommentSnapshot;

  private constructor(state: CommentSnapshot) {
    this.state = state;
  }

  static fromSnapshot(snapshot: CommentSnapshot): Comment {
    return new Comment(snapshot);
  }

  static write(
    input: {
      readonly id: CommentId;
      readonly elementId: ElementId;
      readonly body: string;
    },
    actor: Actor,
    at: Date,
  ): Result<Comment> {
    if (actor.userId === null) {
      return fail(
        "FORBIDDEN",
        "コメントはログインして使うサーバーモードで書けます。",
      );
    }
    const body = requiredText(input.body, "コメント");
    if (!body.ok) return body;
    return ok(
      new Comment({
        id: input.id,
        elementId: input.elementId,
        body: body.value,
        authorId: actor.userId,
        createdAt: at.toISOString(),
      }),
    );
  }

  toSnapshot(): CommentSnapshot {
    return this.state;
  }
}
