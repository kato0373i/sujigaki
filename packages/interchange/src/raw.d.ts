/** テストで、ファイルの中身を文字列として読み込む（Vite の `?raw`） */
declare module "*?raw" {
  const content: string;
  export default content;
}
