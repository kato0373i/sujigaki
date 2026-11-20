import { useEffect, useState } from "react";
import { type Item, itemLine, parseItem } from "../model/element-editor.ts";

const parse = (value: string): Item[] =>
  value === "" ? [] : value.split("\n").map(parseItem);
const serialize = (rows: readonly Item[]) =>
  rows.map((item) => itemLine(item)).join("\n");

/**
 * 情報の項目を、項目名と説明の列を持つ表で編集する（#154）。
 * 下書きでは「項目名：説明」の行で持つため、表の行と行の文字列を行き来させる。空の行は保存のときに捨てる
 */
export function ItemsTable({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  // 足したばかりの空の行は文字列では表せないため、行は部品の中で持つ。
  // 保存や読み直しで外から値が変わったときだけ、行を作り直す
  const [rows, setRows] = useState<Item[]>(() => parse(value));
  useEffect(() => {
    setRows((current) =>
      serialize(current) === value ? current : parse(value),
    );
  }, [value]);
  const update = (next: Item[]) => {
    setRows(next);
    onChange(serialize(next));
  };
  const edit = (index: number, change: Partial<Item>) =>
    update(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <fieldset className="items-table" id={id} aria-labelledby={`${id}-label`}>
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col" className="items-head">
                項目名
              </th>
              <th scope="col" className="items-head">
                説明
              </th>
              <th scope="col" className="items-head">
                <span className="visually-hidden">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 項目は名前を書き換えても同じ行のまま編集したいため、行の順を鍵にする
              <tr key={index}>
                <td className="items-cell">
                  <input
                    aria-label={`${index + 1}行目の項目名`}
                    value={row.name}
                    disabled={disabled}
                    // 「：」は項目名と説明の区切りに使うため、項目名には入れない
                    onChange={(e) =>
                      edit(index, {
                        name: e.target.value.replace(/[：:]/g, ""),
                      })
                    }
                  />
                </td>
                <td className="items-cell">
                  <input
                    aria-label={`${index + 1}行目の説明`}
                    value={row.description ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      edit(index, { description: e.target.value })
                    }
                  />
                </td>
                <td className="items-cell">
                  <button
                    type="button"
                    className="link danger"
                    disabled={disabled}
                    aria-label={`${index + 1}行目の項目を消す`}
                    onClick={() => update(rows.filter((_, i) => i !== index))}
                  >
                    消す
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => update([...rows, { name: "" }])}
      >
        ＋ 項目を追加
      </button>
    </fieldset>
  );
}
