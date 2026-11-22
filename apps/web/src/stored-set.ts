/**
 * ブラウザに覚えておく文字列の集まり。畳んだ節や業務など、画面の開閉の状態を覚えるのに使う。
 * 読み書きできないとき（シークレットモードなど）は空として扱い、開閉はその場だけにする
 */
export function readStoredSet(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeStoredSet(key: string, item: string, included: boolean) {
  try {
    const others = readStoredSet(key).filter((s) => s !== item);
    localStorage.setItem(
      key,
      JSON.stringify(included ? [...others, item] : others),
    );
  } catch {
    // 覚えられないときは、開閉はその場だけにする
  }
}
