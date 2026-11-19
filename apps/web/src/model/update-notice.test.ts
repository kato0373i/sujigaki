import { describe, expect, it } from "vitest";
import { updateNotice } from "./update-notice.ts";

const me = { userId: "u1", role: "editor" } as const;
const local = { userId: null, role: "admin" } as const;
const op = (type: string, actorId: string | null, revision: number) => ({
  type,
  actorId,
  revision,
});

describe("FR-071 更新の通知", () => {
  it("ほかの人の操作だけを数える", () => {
    expect(
      updateNotice(
        10,
        {
          revision: 13,
          operations: [
            op("ElementEdited", "u1", 11),
            op("ElementEdited", "u2", 12),
            op("RelationAdded", "u3", 13),
          ],
        },
        me,
      ),
    ).toEqual({ count: 2 });
  });

  it("自分の操作だけなら知らせない", () => {
    expect(
      updateNotice(
        10,
        { revision: 11, operations: [op("ElementEdited", null, 11)] },
        local,
      ),
    ).toBeNull();
  });

  it("ローカルモードでは、外の変更を数える", () => {
    expect(
      updateNotice(
        10,
        { revision: 11, operations: [op("ExternalChange", null, 11)] },
        local,
      ),
    ).toEqual({ count: 1 });
  });

  it("リビジョンが戻っていれば、件数を出さずに知らせる", () => {
    expect(updateNotice(10, { revision: 2, operations: [] }, local)).toEqual({
      count: null,
    });
  });
});
