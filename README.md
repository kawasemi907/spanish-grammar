# Español 4級 — 西検4級 文法・読解

西検4級の文法範囲を学ぶ個人用スペイン語学習アプリ（PWA）。Android の Chrome で「ホーム画面に追加」して使う。

- 解説（日本語＋フランス語との比較）・ドリル・読み物の3本立て、全25ユニット（順次追加）
- 活用トレーナー、間違えた問題だけの復習、読み上げ（es-ES）
- ビルド不要。仕様と作業手順は [CLAUDE.md](CLAUDE.md) を参照

## ローカルで動かす
```
python3 -m http.server 8000   # → http://localhost:8000/
python3 tools/check_data.py   # データ検証
```

## 公開（GitHub Pages）
リポジトリの Settings → Pages で、公開したいブランチのルート（`/`）を選ぶ。
