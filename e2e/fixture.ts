import type { ElementSnapshot } from "@sujigaki/domain";
import { questionId } from "@sujigaki/domain";
import {
  elementSnapshot,
  questionSnapshot,
  relationTo,
} from "@sujigaki/domain/testing";
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
  // 編集の E2E で書き換える活動。ほかの E2E が確かめる業務フローとは分けておく
  const accept = elementSnapshot("act-accept-cancel", "activity", {
    name: "取り消しを受け付ける",
    attributes: { mode: "manual" },
    relations: [relationTo(trainer, "activity")],
  });
  const request = elementSnapshot("act-request-cancel", "activity", {
    name: "取り消しを申し出る",
    attributes: { mode: "system" },
    reviewState: "approved",
    relations: [
      relationTo(applicant, "activity"),
      relationTo(accept, "activity"),
    ],
  });
  const cancel = elementSnapshot("buc-cancel", "buc", {
    name: "受講の取り消し",
    relations: [relationTo(request, "buc"), relationTo(accept, "buc")],
  });
  const business = elementSnapshot("biz-training", "business", {
    name: "研修",
    relations: [relationTo(buc, "business"), relationTo(cancel, "business")],
  });
  const billing = elementSnapshot("biz-billing", "business", { name: "請求" });
  const requirement = elementSnapshot("req-easy-apply", "requirement", {
    name: "研修の申込をかんたんにしたい",
    attributes: {
      rationale: "紙の申込書の回収に手間がかかっている",
      priority: "must",
    },
    relations: [relationTo(business, "requirement")],
  });
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
    request,
    accept,
    cancel,
    business,
    billing,
    requirement,
  ];
  return {
    project: {
      name: "社内研修",
      systemName: "研修管理システム",
      summaryMaxLength: 100,
    },
    elements,
    questions: [
      questionSnapshot("act-apply", {
        id: questionId("q-deadline"),
        body: "申込の締め切りはいつですか",
        recommendation: "開講の2週間前",
        authorType: "human",
      }),
    ],
    decisions: [],
    layouts: [],
  };
}

export const TRAINING = training();
