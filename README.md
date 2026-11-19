# sujigaki

要求から業務、ユースケース、画面・情報までを一本の筋でつなぎ、業務設計の SSOT として運用するためのツールです。
[RDRA](https://www.rdra.jp/) に準拠したモデルを、ビジネス側とエンジニアの双方が画面上で見て、編集できることを目指しています。

> 現在は実装を始めたところです。

## ドキュメント

- 要件定義書: [docs/requirements/business-design-ssot.md](docs/requirements/business-design-ssot.md)
- 設計書: [docs/design/business-design-ssot.md](docs/design/business-design-ssot.md)
- 画面設計書: [docs/design/screens.md](docs/design/screens.md)
- テスト戦略: [docs/design/test-strategy.md](docs/design/test-strategy.md)

## 開発

開発には Node.js 24 以上が必要です。

```bash
npm ci
npm test
```

依存パッケージを入れてテストを実行します。lint は `npm run lint`、型の検査は `npm run typecheck`、カバレッジの計測は `npm run test:coverage` で実行できます。

ローカルモードは画面をビルドしてから、次のコマンドで起動します。フォルダーにプロジェクトがなければ、フォルダーの名前で作ります。起動したら、表示された URL をブラウザで開いてください。

```bash
npm run build
npm run local -- ./my-project
```

E2E は `npm run test:e2e` で実行できます。初めて実行する前に、`npx playwright install chromium` でブラウザを入れておきます。

## ライセンス

[MIT](LICENSE)
