import type { ElementSnapshot } from "@sujigaki/domain";
import { elementSnapshot, relationTo } from "@sujigaki/domain/testing";
import type { ProjectDocument } from "@sujigaki/interchange";

/**
 * E2E と画面のキャプチャで使うモデル。画面設計書 S-04 の例（研修の受講申込）をもとにする
 */
function training(): ProjectDocument {
  const applicant = elementSnapshot("actor-applicant", "actor", {
    name: "受講者",
  });
  const manager = elementSnapshot("actor-manager", "actor", { name: "上長" });
  const trainer = elementSnapshot("actor-trainer", "actor", {
    name: "研修担当",
  });
  const usecase = elementSnapshot("uc-apply", "usecase", {
    name: "受講を申し込む",
  });
  const info = elementSnapshot("info-application", "information", {
    name: "受講申込",
  });
  const notify = elementSnapshot("act-notify", "activity", {
    name: "受講案内を送る",
    attributes: { mode: "manual" },
    reviewState: "needs_check",
    relations: [relationTo(trainer, "activity")],
  });
  const approve = elementSnapshot("act-approve", "activity", {
    name: "申込を承認する",
    attributes: { mode: "system" },
    reviewState: "approved",
    relations: [
      relationTo(manager, "activity"),
      relationTo(notify, "activity"),
    ],
  });
  const apply = elementSnapshot("act-apply", "activity", {
    name: "研修に申し込む",
    attributes: { mode: "system" },
    relations: [
      relationTo(applicant, "activity"),
      relationTo(approve, "activity"),
      relationTo(usecase, "activity"),
      relationTo(info, "activity"),
    ],
  });
  const unassigned = elementSnapshot("act-report", "activity", {
    name: "受講結果をまとめる",
    attributes: { mode: "manual" },
  });
  const buc = elementSnapshot("buc-application", "buc", {
    name: "研修の受講申込",
    relations: [apply, approve, notify, unassigned].map((a) =>
      relationTo(a, "buc"),
    ),
  });
  const cancel = elementSnapshot("buc-cancel", "buc", {
    name: "受講の取り消し",
  });
  const business = elementSnapshot("biz-training", "business", {
    name: "研修",
    relations: [relationTo(buc, "business"), relationTo(cancel, "business")],
  });
  const billing = elementSnapshot("biz-billing", "business", { name: "請求" });
  const elements: ElementSnapshot[] = [
    applicant,
    manager,
    trainer,
    usecase,
    info,
    notify,
    approve,
    apply,
    unassigned,
    buc,
    cancel,
    business,
    billing,
  ];
  return {
    project: {
      name: "社内研修",
      systemName: "研修管理システム",
      summaryMaxLength: 100,
    },
    elements,
    questions: [],
    decisions: [],
    layouts: [],
  };
}

export const TRAINING = training();
