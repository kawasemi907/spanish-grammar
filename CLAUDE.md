# スペイン語文法・読解アプリ（西検4級）— 仕様と作業基準

このファイルはアプリの仕様であり、以降のすべての作業の基準とする。

## 目的
西検4級の文法範囲を学ぶ個人用アプリ。Androidスマホのブラウザで使う。

## 技術
- HTML/CSS/JS（ビルド不要）＋ユニットごとのJSONデータ（`data/unit01.json` …）
- GitHub Pagesで公開、ホーム画面に追加できるPWA
- 学習記録は localStorage、音声は Web Speech API（es-ES）

## 言語
- 文法解説は日本語
- 例文・読み物の訳は英語とフランス語（日本語訳は不要）

## 画面
- **ホーム**：ユニット一覧と進捗（ドリル正答率、読了マーク）
- **ユニット画面**：「解説」「ドリル」「読む」の3タブ
- **活用トレーナー**：動詞と時制を選んでランダム出題
- **復習**：間違えた問題のみ出題
- **設定**：読み上げ速度、訳の言語（英・仏）

## ユニットの中身
- **解説**：日本語で要点（短め）＋「フランス語との比較」欄＋音声付き例文5〜8文（英仏訳はタップで表示）
- **ドリル**：1回10問。活用入力・選択・空所補充・並べ替えを混在。入力欄の上に `á é í ó ú ñ ü ¿ ¡` の補助ボタン。綴りは正確に判定。不正解は解説表示＋復習リストへ登録
- **読む**：そのユニットの文法を使った100〜200語の読み物。全ユニットで同じ登場人物が出る連載形式、ユーモアとスペイン語圏の文化を含める。単語タップで原形＋英仏訳、全文読み上げ（速度調整）、1文ずつ訳表示切替、読後にスペイン語の内容確認クイズ3問

## ユニット一覧（25）
1 名詞の性数と冠詞 / 2 主語代名詞とser / 3 estarとhay / 4 形容詞の一致・指示詞 / 5 直説法現在：規則動詞 / 6 語幹母音変化動詞 / 7 不規則動詞 / 8 所有詞・疑問詞 / 9 目的格代名詞 / 10 gustar型動詞 / 11 再帰動詞 / 12 ir a＋不定詞・現在進行形 / 13 比較級・最上級 / 14 現在完了 / 15 点過去（規則） / 16 点過去（不規則） / 17 線過去と点過去の使い分け / 18 未来形・tú肯定命令 / 19 過去完了 / 20 未来完了・過去未来 / 21 接続法現在の活用 / 22 接続法の用法 / 23 命令法（usted・否定命令） / 24 受身 / 25 関係詞と大きな数字（100万まで）

## 進め方
- 初回：アプリ本体＋ユニット1〜5
- 以降：ユニットを5つずつまとめて追加する

---

## 実装メモ（作業者向け）

### ファイル構成
```
index.html              アプリシェル（ハッシュルーティングのSPA）
css/style.css
js/app.js               画面・ドリル・読み上げ・保存のすべて
sw.js                   Service Worker（オフライン対応）
manifest.webmanifest
icons/                  PWAアイコン（icon.svg から PNG を生成）
data/units.json         25ユニットの一覧（available: true のものだけ開ける）
data/glossary.json      読み物の共通語彙（冠詞・前置詞・登場人物名など）
data/verbs.json         活用トレーナー用の動詞活用表（tools/gen_verbs.py で生成）
data/unitNN.json        各ユニットのデータ
tools/check_data.py     データ検証（必ず実行して OK を確認する）
tools/gen_verbs.py      verbs.json の生成スクリプト
```

### ユニット追加の手順
1. `data/unitNN.json` を作成（形式は下記。既存ユニットを手本にする）
2. `data/units.json` の該当ユニットを `"available": true` にする
3. `sw.js` の `CACHE` のバージョン番号を上げ、`PRECACHE` に新しいJSONを追加
4. `python3 tools/check_data.py` がエラーなしで通ることを確認
5. 活用トレーナーの時制は `verbs.json` の `tenses[].unit` で学習ユニットを表示している。
   新しい動詞を足すときは `tools/gen_verbs.py` を編集して再生成する

### unitNN.json の形式
```jsonc
{
  "id": 1,
  "title": "名詞の性数と冠詞",
  "explain": {
    "sections": [{ "title": "…", "body": "HTML可（<p>, <ul>, <table>, <b>）" }],
    "french": "フランス語との比較（HTML可）",
    "examples": [{ "es": "…", "en": "…", "fr": "…" }]   // 5〜8文
  },
  "drill": [   // 15問以上。1回のドリルでランダムに10問出題
    { "id": "q01", "type": "conj",   "verb": "hablar", "person": "yo", "tense": "直説法現在",
      "sentence": "Yo ___ japonés.", "answer": ["hablo"], "explain": "…" },
    { "id": "q02", "type": "fill",   "prompt": "…", "sentence": "___ casa", "answer": ["la"], "explain": "…" },
    { "id": "q03", "type": "choice", "prompt": "…", "sentence": "…", "options": ["…"], "answer": "…", "explain": "…" },
    { "id": "q04", "type": "order",  "prompt": "…", "words": ["…"], "answer": ["…"], "en": "…", "fr": "…", "explain": "…" }
  ],
  "reading": {
    "title": "…",
    "sentences": [{ "es": "…", "en": "…", "fr": "…", "p": true }],  // p: 段落の始まり
    "glossary": { "語形（小文字）": { "lemma": "原形", "en": "…", "fr": "…", "note": "任意（日本語）" } },
    "quiz": [{ "q": "スペイン語の問い", "options": ["…"], "answer": "…" }]   // 3問
  }
}
```
- 解答判定：前後の空白・大文字小文字・文末の句読点は無視。アクセント記号・ñ・ü は厳密に判定。
  `answer` は配列で、複数の正解を許容できる。
- 読み物の単語は `reading.glossary` → `data/glossary.json` の順で引く。全単語が引けることを `check_data.py` で確認する。

### 読み物の連載設定（全ユニット共通）
- **Yuki**：日本人の留学生。マドリードに来たばかり。まじめで几帳面、スペインの夕食時間に毎回驚く
- **Lucía**：Yukiのルームメイト。マドリード出身、大げさでおしゃべり、フラメンコ好き
- **Diego**：語学学校のクラスメイト。メキシコ（グアダラハラ）出身、サッカーとタコスが大好き
- **Abuela Carmen**：Lucíaの祖母。何でも知っている、料理の達人、Rastroの常連
- **Churro**：アパートの猫。食いしん坊で、いつもどこかに隠れている
- 舞台：マドリードのアパート（Lavapiés地区）。スペイン語圏各地の文化を少しずつ紹介する
- 各ユニットの読み物はそのユニットの文法を中心に使い、未習の文法はなるべく避ける

### 保存データ（localStorage キー `esp4-v1`）
```jsonc
{
  "settings": { "rate": 0.9, "lang": "both" },          // lang: "en" | "fr" | "both"
  "progress": { "1": { "best": 90, "last": 80, "runs": 3, "read": true, "quiz": 3 } },
  "review": [ { "key": "u1:q03", "unit": 1, "qid": "q03", "miss": 2 },
              { "key": "c:hablar:pres:0", "verb": "hablar", "tense": "pres", "person": 0, "miss": 1 } ]
}
```
