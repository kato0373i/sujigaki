import type { ElementSnapshot } from "@sujigaki/domain";
import { useSyncExternalStore } from "react";
import { UNDO_LIMIT, type UndoChange, type UndoEntry } from "./model/undo.ts";

/**
 * 元に戻せる操作の記録（FR-014）。このタブで自分が行った操作だけを、新しいものを最後にして持つ。
 * 読み直すと消える
 */
let stack: readonly UndoEntry[] = [];
const listeners = new Set<() => void>();
/** 記録した回数。新しい操作をしたら、前の「元に戻しました」の表示を消すために使う */
let pushes = 0;
/** まとめて記録している操作。undoable の中で行った操作を1つにする */
let group: { label: string | null; changes: UndoChange[] } | null = null;
/** 最後に読んだ要素。変更の一式の反映では、操作の前の要素をここから取る */
let known = new Map<string, ElementSnapshot>();

const notify = () => {
  for (const listener of listeners) listener();
};

const push = (entry: UndoEntry) => {
  stack = [...stack, entry].slice(-UNDO_LIMIT);
  pushes++;
  notify();
};

/** 読み込んだ要素を覚える。App がスナップショットを読むたびに呼ぶ */
export function rememberElements(elements: readonly ElementSnapshot[]) {
  known = new Map(elements.map((e) => [e.id as string, e]));
}

/** 最後に読んだ要素から、操作の前の要素を返す。なければ null */
export function knownElement(id: string): ElementSnapshot | null {
  return known.get(id) ?? null;
}

/** 操作を記録する。api.ts の要素を変える関数から呼ぶ */
export function recordChange(label: string, changes: readonly UndoChange[]) {
  for (const c of changes) known.set(c.after.id, c.after);
  if (group) {
    group.label ??= label;
    group.changes.push(...changes);
    return;
  }
  push({ label, changes });
}

/**
 * task の中で行った操作を、1回の操作としてまとめて記録する。
 * 説明は label を渡せばそれに、渡さなければ最初の操作のものにする
 */
export async function undoable<T>(
  task: () => Promise<T>,
  label?: string,
): Promise<T> {
  if (group) return task();
  group = { label: label ?? null, changes: [] };
  const current = group;
  try {
    return await task();
  } finally {
    group = null;
    if (current.changes.length > 0)
      push({ label: current.label ?? "", changes: current.changes });
  }
}

/** いちばん新しい操作を記録から外す */
export function dropLatest(entry: UndoEntry) {
  stack = stack.filter((e) => e !== entry);
  notify();
}

/** テストのために記録を空にする */
export function clearUndo() {
  stack = [];
  group = null;
  known = new Map();
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 記録した回数 */
export function useUndoPushes(): number {
  return useSyncExternalStore(subscribe, () => pushes);
}

/** 元に戻せるいちばん新しい操作。なければ null */
export function useLatestUndo(): UndoEntry | null {
  return useSyncExternalStore(subscribe, () => stack.at(-1) ?? null);
}
