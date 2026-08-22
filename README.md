# Loop Station

ブラウザで録音して、その場でループ再生するシンプルな音楽用ルーパーです。

## ローカルで確認

```bash
npm start
```

マイクを使うため、`localhost` または HTTPS で開いてください。

## Vercelへ公開

1. GitHubで `loop-station` という新しいリポジトリを作る
2. このフォルダでGitを初期化してpushする
3. Vercelで「Add New Project」からそのGitHubリポジトリをImportする
4. Framework Presetは `Other`、Build Commandは空欄、Output Directoryは `.` のままDeployする

録音データはアップロードせず、ブラウザ内でのみ処理します。
