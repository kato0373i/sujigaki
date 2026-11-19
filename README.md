# sujigaki

要求から業務、ユースケース、画面・情報までを一本の筋でつなぎ、業務設計の SSOT として運用するためのツールです。
[RDRA](https://www.rdra.jp/) に準拠したモデルを、ビジネス側とエンジニアの双方が画面上で見て、編集できることを目指しています。

> 現在は実装を始めたところです。

## ドキュメント

- 要件定義書: [docs/requirements/business-design-ssot.md](docs/requirements/business-design-ssot.md)
- 設計書: [docs/design/business-design-ssot.md](docs/design/business-design-ssot.md)
- 画面設計書: [docs/design/screens.md](docs/design/screens.md)

## 開発

開発には Node.js 24 以上が必要です。

```bash
npm ci
npm test
```

依存パッケージを入れてテストを実行します。lint は `npm run lint`、型の検査は `npm run typecheck` で実行できます。

## ライセンス

[MIT](LICENSE)
