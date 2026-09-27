#!/usr/bin/env python3
"""データ検証スクリプト。ユニットを追加・編集したら必ず実行する。

    python3 tools/check_data.py          # すべての公開ユニットを検証
    python3 tools/check_data.py --missing  # 読み物の未登録語を一覧表示

エラーがあれば終了コード1で終わる。
"""
import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
WORD = re.compile(r"[^\W\d_]+")
errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def norm(s):
    s = unicodedata.normalize("NFC", s).lower()
    s = re.sub(r"[.,;:…]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_order(s):
    s = re.sub(r"[¿?¡!\"«»]", " ", norm(s))
    return re.sub(r"\s+", " ", s).strip()


def load(path):
    """JSON を読み込む。同じキーが2回あるとエラーにする（後の値で黙って上書きされるため）"""
    def hook(pairs):
        seen = set()
        for k, _ in pairs:
            if k in seen:
                err(f"{path.name}: キー '{k}' が重複しています")
            seen.add(k)
        return dict(pairs)
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=hook)


def need(obj, keys, where):
    for k in keys:
        if k not in obj or obj[k] in (None, "", []):
            err(f"{where}: '{k}' がありません")


def check_unit(n, common, show_missing):
    path = DATA / f"unit{n:02d}.json"
    if not path.exists():
        err(f"{path.name} がありません")
        return
    u = load(path)
    w = path.name
    if u.get("id") != n:
        err(f"{w}: id が {n} ではありません")
    need(u, ["title", "explain", "drill", "reading"], w)

    ex = u["explain"]
    need(ex, ["sections", "french", "examples"], w + " explain")
    if not 5 <= len(ex["examples"]) <= 8:
        err(f"{w}: 例文は5〜8文（現在 {len(ex['examples'])}）")
    for i, e in enumerate(ex["examples"]):
        need(e, ["es", "en", "fr"], f"{w} examples[{i}]")

    drill = u["drill"]
    if len(drill) < 15:
        err(f"{w}: ドリルは15問以上（現在 {len(drill)}）")
    ids = [q.get("id") for q in drill]
    if len(set(ids)) != len(ids):
        err(f"{w}: ドリルの id が重複しています")
    types = {q.get("type") for q in drill}
    for t in ("fill", "choice", "order"):
        if t not in types:
            warn(f"{w}: ドリルに {t} 型がありません")
    for q in drill:
        where = f"{w} {q.get('id')}"
        t = q.get("type")
        need(q, ["id", "type", "explain"], where)
        if t in ("conj", "fill"):
            need(q, ["answer"], where)
            if not isinstance(q.get("answer"), list):
                err(f"{where}: answer は配列にする")
            if t == "conj":
                need(q, ["verb", "person"], where)
            if t == "fill" and "___" not in q.get("sentence", ""):
                err(f"{where}: fill の sentence に ___ がありません")
            if q.get("sentence") and q["sentence"].count("___") != 1:
                err(f"{where}: ___ は1か所だけにする")
        elif t == "choice":
            need(q, ["options", "answer"], where)
            if q.get("answer") not in q.get("options", []):
                err(f"{where}: answer が options にありません")
            if len(set(q.get("options", []))) != len(q.get("options", [])):
                err(f"{where}: options が重複しています")
        elif t == "order":
            need(q, ["words", "answer"], where)
            words = sorted(norm_order(x) for x in q["words"])
            for a in q["answer"]:
                if sorted(norm_order(a).split(" ")) != words:
                    err(f"{where}: answer「{a}」と words が一致しません")
            if not (q.get("en") or q.get("fr")):
                warn(f"{where}: order 問題に en/fr のヒントがありません")
        else:
            err(f"{where}: 不明な type '{t}'")

    r = u["reading"]
    need(r, ["title", "sentences", "glossary", "quiz"], w + " reading")
    words = 0
    missing = {}
    gl = {k.lower(): v for k, v in r["glossary"].items()}
    for k, v in r["glossary"].items():
        need(v, ["lemma", "en", "fr"], f"{w} glossary '{k}'")
        if k != k.lower():
            err(f"{w} glossary '{k}': キーは小文字にする")
    for i, s in enumerate(r["sentences"]):
        need(s, ["es", "en", "fr"], f"{w} sentences[{i}]")
        for tok in WORD.findall(s["es"]):
            words += 1
            key = tok.lower()
            if key not in gl and key not in common:
                missing.setdefault(key, s["es"])
    for tok in WORD.findall(r["title"]):
        key = tok.lower()
        if key not in gl and key not in common:
            missing.setdefault(key, r["title"])
    if not 100 <= words <= 200:
        err(f"{w}: 読み物は100〜200語（現在 {words}語）")
    if missing:
        err(f"{w}: 辞書にない語 {len(missing)}個: " + ", ".join(sorted(missing)))
        if show_missing:
            for k, s in sorted(missing.items()):
                print(f"   {k:15} … {s}")
    if len(r["quiz"]) != 3:
        err(f"{w}: クイズは3問（現在 {len(r['quiz'])}）")
    for i, q in enumerate(r["quiz"]):
        need(q, ["q", "options", "answer"], f"{w} quiz[{i}]")
        if q.get("answer") not in q.get("options", []):
            err(f"{w} quiz[{i}]: answer が options にありません")
    print(f"  {w}: 例文{len(ex['examples'])} / ドリル{len(drill)}問 / 読み物{words}語 / 語彙{len(gl)}")


def main():
    show_missing = "--missing" in sys.argv
    units = json.loads((DATA / "units.json").read_text(encoding="utf-8"))["units"]
    if len(units) != 25:
        err("units.json は25ユニット")
    common_raw = load(DATA / "glossary.json")
    common = {}
    for k, v in common_raw.items():
        need(v, ["lemma", "en", "fr"], f"glossary.json '{k}'")
        if k != k.lower():
            err(f"glossary.json '{k}': キーは小文字にする")
        common[k.lower()] = v
    json.loads((DATA / "verbs.json").read_text(encoding="utf-8"))
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    for u in units:
        if u.get("available"):
            check_unit(u["id"], common, show_missing)
            if f"data/unit{u['id']:02d}.json" not in sw:
                err(f"sw.js の PRECACHE に data/unit{u['id']:02d}.json がありません")
    for m in warnings:
        print("WARN ", m)
    for m in errors:
        print("ERROR", m)
    print("OK" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
