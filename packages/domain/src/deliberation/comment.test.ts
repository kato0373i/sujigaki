import { describe, expect, it } from "vitest";
import { elementId } from "../model/element.ts";
import { Comment, commentId } from "./comment.ts";

const at = new Date("2026-11-19T00:00:00Z");
const input = {
  id: commentId("c1"),
  elementId: elementId("a1"),
  body: "締め切りは毎月20日です",
};

describe("US-009 コメントを書く", () => {
  it("閲覧者も書ける", () => {
    const result = Comment.write(input, { userId: "v1", role: "viewer" }, at);
    expect(result.ok && result.value.toSnapshot()).toMatchObject({
      authorId: "v1",
      body: "締め切りは毎月20日です",
    });
  });

  it("ログインしていなければ書けない", () => {
    const result = Comment.write(input, { userId: null, role: "admin" }, at);
    expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
  });

  it("本文が空なら書けない", () => {
    const result = Comment.write(
      { ...input, body: "" },
      { userId: "v1", role: "viewer" },
      at,
    );
    expect(result.ok).toBe(false);
  });
});
