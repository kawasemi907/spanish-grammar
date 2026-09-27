#!/usr/bin/env python3
"""活用トレーナー用の data/verbs.json を生成する。

規則活用をルールで作り、不規則な部分だけ IRREG で上書きする。
動詞を追加するときは VERBS に1行足し、必要なら IRREG に不規則形を書く。
実行: python3 tools/gen_verbs.py
"""
import json
import pathlib

TENSES = [
    {"key": "pres", "label": "直説法現在", "unit": 5},
    {"key": "perf", "label": "現在完了", "unit": 14},
    {"key": "indef", "label": "点過去", "unit": 15},
    {"key": "imperf", "label": "線過去", "unit": 17},
    {"key": "fut", "label": "未来", "unit": 18},
    {"key": "cond", "label": "過去未来", "unit": 20},
    {"key": "subj", "label": "接続法現在", "unit": 21},
]
PERSONS = ["yo", "tú", "él / ella / usted", "nosotros", "vosotros", "ellos / ellas / ustedes"]

# (不定詞, 意味, グループ)  グループ: reg=規則, stem=語幹母音変化, irr=不規則
VERBS = [
    ("hablar", "話す", "reg"), ("estudiar", "勉強する", "reg"), ("trabajar", "働く", "reg"),
    ("tomar", "取る・飲む", "reg"), ("comprar", "買う", "reg"), ("llegar", "着く", "reg"),
    ("buscar", "探す", "reg"), ("bailar", "踊る", "reg"), ("cenar", "夕食をとる", "reg"),
    ("comer", "食べる", "reg"), ("beber", "飲む", "reg"), ("aprender", "学ぶ", "reg"),
    ("leer", "読む", "reg"), ("correr", "走る", "reg"),
    ("vivir", "住む", "reg"), ("escribir", "書く", "reg"), ("abrir", "開ける", "reg"),
    ("recibir", "受け取る", "reg"),
    ("pensar", "考える", "stem"), ("cerrar", "閉める", "stem"), ("empezar", "始める", "stem"),
    ("querer", "欲する・愛する", "stem"), ("volver", "戻る", "stem"), ("poder", "できる", "stem"),
    ("dormir", "眠る", "stem"), ("jugar", "遊ぶ・(競技を)する", "stem"),
    ("preferir", "好む", "stem"), ("entender", "理解する", "stem"), ("encontrar", "見つける", "stem"),
    ("pedir", "頼む", "stem"), ("repetir", "繰り返す", "stem"), ("sentir", "感じる", "stem"),
    ("ser", "〜である", "irr"), ("estar", "〜である・いる", "irr"), ("tener", "持つ", "irr"),
    ("ir", "行く", "irr"), ("hacer", "する・作る", "irr"), ("venir", "来る", "irr"),
    ("decir", "言う", "irr"), ("salir", "出る", "irr"), ("poner", "置く", "irr"),
    ("saber", "知っている", "irr"), ("conocer", "知っている(人・場所)", "irr"),
    ("dar", "与える", "irr"), ("ver", "見る", "irr"), ("traer", "持ってくる", "irr"),
    ("oír", "聞こえる", "irr"), ("conducir", "運転する", "irr"),
]

END = {
    "ar": {
        "pres": ["o", "as", "a", "amos", "áis", "an"],
        "indef": ["é", "aste", "ó", "amos", "asteis", "aron"],
        "imperf": ["aba", "abas", "aba", "ábamos", "abais", "aban"],
        "subj": ["e", "es", "e", "emos", "éis", "en"],
        "part": "ado",
    },
    "er": {
        "pres": ["o", "es", "e", "emos", "éis", "en"],
        "indef": ["í", "iste", "ió", "imos", "isteis", "ieron"],
        "imperf": ["ía", "ías", "ía", "íamos", "íais", "ían"],
        "subj": ["a", "as", "a", "amos", "áis", "an"],
        "part": "ido",
    },
    "ir": {
        "pres": ["o", "es", "e", "imos", "ís", "en"],
        "indef": ["í", "iste", "ió", "imos", "isteis", "ieron"],
        "imperf": ["ía", "ías", "ía", "íamos", "íais", "ían"],
        "subj": ["a", "as", "a", "amos", "áis", "an"],
        "part": "ido",
    },
}
FUT = ["é", "ás", "á", "emos", "éis", "án"]
COND = ["ía", "ías", "ía", "íamos", "íais", "ían"]
HABER = ["he", "has", "ha", "hemos", "habéis", "han"]


def s(text):
    return text.split()


# 不規則形の上書き。"fut_stem" は未来・過去未来の語幹、"part" は過去分詞。
IRREG = {
    "llegar": {"indef": s("llegué llegaste llegó llegamos llegasteis llegaron"),
               "subj": s("llegue llegues llegue lleguemos lleguéis lleguen")},
    "buscar": {"indef": s("busqué buscaste buscó buscamos buscasteis buscaron"),
               "subj": s("busque busques busque busquemos busquéis busquen")},
    "leer": {"indef": s("leí leíste leyó leímos leísteis leyeron"), "part": "leído"},
    "abrir": {"part": "abierto"},
    "escribir": {"part": "escrito"},
    "pensar": {"pres": s("pienso piensas piensa pensamos pensáis piensan"),
               "subj": s("piense pienses piense pensemos penséis piensen")},
    "cerrar": {"pres": s("cierro cierras cierra cerramos cerráis cierran"),
               "subj": s("cierre cierres cierre cerremos cerréis cierren")},
    "empezar": {"pres": s("empiezo empiezas empieza empezamos empezáis empiezan"),
                "indef": s("empecé empezaste empezó empezamos empezasteis empezaron"),
                "subj": s("empiece empieces empiece empecemos empecéis empiecen")},
    "querer": {"pres": s("quiero quieres quiere queremos queréis quieren"),
               "indef": s("quise quisiste quiso quisimos quisisteis quisieron"),
               "fut_stem": "querr",
               "subj": s("quiera quieras quiera queramos queráis quieran")},
    "volver": {"pres": s("vuelvo vuelves vuelve volvemos volvéis vuelven"),
               "subj": s("vuelva vuelvas vuelva volvamos volváis vuelvan"), "part": "vuelto"},
    "poder": {"pres": s("puedo puedes puede podemos podéis pueden"),
              "indef": s("pude pudiste pudo pudimos pudisteis pudieron"),
              "fut_stem": "podr",
              "subj": s("pueda puedas pueda podamos podáis puedan")},
    "dormir": {"pres": s("duermo duermes duerme dormimos dormís duermen"),
               "indef": s("dormí dormiste durmió dormimos dormisteis durmieron"),
               "subj": s("duerma duermas duerma durmamos durmáis duerman")},
    "jugar": {"pres": s("juego juegas juega jugamos jugáis juegan"),
              "indef": s("jugué jugaste jugó jugamos jugasteis jugaron"),
              "subj": s("juegue juegues juegue juguemos juguéis jueguen")},
    "preferir": {"pres": s("prefiero prefieres prefiere preferimos preferís prefieren"),
                 "indef": s("preferí preferiste prefirió preferimos preferisteis prefirieron"),
                 "subj": s("prefiera prefieras prefiera prefiramos prefiráis prefieran")},
    "entender": {"pres": s("entiendo entiendes entiende entendemos entendéis entienden"),
                 "subj": s("entienda entiendas entienda entendamos entendáis entiendan")},
    "encontrar": {"pres": s("encuentro encuentras encuentra encontramos encontráis encuentran"),
                  "subj": s("encuentre encuentres encuentre encontremos encontréis encuentren")},
    "pedir": {"pres": s("pido pides pide pedimos pedís piden"),
              "indef": s("pedí pediste pidió pedimos pedisteis pidieron"),
              "subj": s("pida pidas pida pidamos pidáis pidan")},
    "repetir": {"pres": s("repito repites repite repetimos repetís repiten"),
                "indef": s("repetí repetiste repitió repetimos repetisteis repitieron"),
                "subj": s("repita repitas repita repitamos repitáis repitan")},
    "sentir": {"pres": s("siento sientes siente sentimos sentís sienten"),
               "indef": s("sentí sentiste sintió sentimos sentisteis sintieron"),
               "subj": s("sienta sientas sienta sintamos sintáis sientan")},
    "ser": {"pres": s("soy eres es somos sois son"),
            "indef": s("fui fuiste fue fuimos fuisteis fueron"),
            "imperf": s("era eras era éramos erais eran"),
            "subj": s("sea seas sea seamos seáis sean")},
    "estar": {"pres": s("estoy estás está estamos estáis están"),
              "indef": s("estuve estuviste estuvo estuvimos estuvisteis estuvieron"),
              "subj": s("esté estés esté estemos estéis estén")},
    "tener": {"pres": s("tengo tienes tiene tenemos tenéis tienen"),
              "indef": s("tuve tuviste tuvo tuvimos tuvisteis tuvieron"),
              "fut_stem": "tendr",
              "subj": s("tenga tengas tenga tengamos tengáis tengan")},
    "ir": {"pres": s("voy vas va vamos vais van"),
           "indef": s("fui fuiste fue fuimos fuisteis fueron"),
           "imperf": s("iba ibas iba íbamos ibais iban"),
           "subj": s("vaya vayas vaya vayamos vayáis vayan")},
    "hacer": {"pres": s("hago haces hace hacemos hacéis hacen"),
              "indef": s("hice hiciste hizo hicimos hicisteis hicieron"),
              "fut_stem": "har",
              "subj": s("haga hagas haga hagamos hagáis hagan"), "part": "hecho"},
    "venir": {"pres": s("vengo vienes viene venimos venís vienen"),
              "indef": s("vine viniste vino vinimos vinisteis vinieron"),
              "fut_stem": "vendr",
              "subj": s("venga vengas venga vengamos vengáis vengan")},
    "decir": {"pres": s("digo dices dice decimos decís dicen"),
              "indef": s("dije dijiste dijo dijimos dijisteis dijeron"),
              "fut_stem": "dir",
              "subj": s("diga digas diga digamos digáis digan"), "part": "dicho"},
    "salir": {"pres": s("salgo sales sale salimos salís salen"),
              "fut_stem": "saldr",
              "subj": s("salga salgas salga salgamos salgáis salgan")},
    "poner": {"pres": s("pongo pones pone ponemos ponéis ponen"),
              "indef": s("puse pusiste puso pusimos pusisteis pusieron"),
              "fut_stem": "pondr",
              "subj": s("ponga pongas ponga pongamos pongáis pongan"), "part": "puesto"},
    "saber": {"pres": s("sé sabes sabe sabemos sabéis saben"),
              "indef": s("supe supiste supo supimos supisteis supieron"),
              "fut_stem": "sabr",
              "subj": s("sepa sepas sepa sepamos sepáis sepan")},
    "conocer": {"pres": s("conozco conoces conoce conocemos conocéis conocen"),
                "subj": s("conozca conozcas conozca conozcamos conozcáis conozcan")},
    "dar": {"pres": s("doy das da damos dais dan"),
            "indef": s("di diste dio dimos disteis dieron"),
            "subj": s("dé des dé demos deis den")},
    "ver": {"pres": s("veo ves ve vemos veis ven"),
            "indef": s("vi viste vio vimos visteis vieron"),
            "imperf": s("veía veías veía veíamos veíais veían"),
            "subj": s("vea veas vea veamos veáis vean"), "part": "visto"},
    "traer": {"pres": s("traigo traes trae traemos traéis traen"),
              "indef": s("traje trajiste trajo trajimos trajisteis trajeron"),
              "subj": s("traiga traigas traiga traigamos traigáis traigan"), "part": "traído"},
    "oír": {"pres": s("oigo oyes oye oímos oís oyen"),
            "indef": s("oí oíste oyó oímos oísteis oyeron"),
            "imperf": s("oía oías oía oíamos oíais oían"),
            "fut_stem": "oir",
            "subj": s("oiga oigas oiga oigamos oigáis oigan"), "part": "oído"},
    "conducir": {"pres": s("conduzco conduces conduce conducimos conducís conducen"),
                 "indef": s("conduje condujiste condujo condujimos condujisteis condujeron"),
                 "subj": s("conduzca conduzcas conduzca conduzcamos conduzcáis conduzcan")},
}


def conjugate(inf):
    ending = "ir" if inf == "oír" else inf[-2:]
    stem = inf[:-2]
    e = END[ending]
    ov = IRREG.get(inf, {})
    forms = {}
    for t in ("pres", "indef", "imperf", "subj"):
        forms[t] = ov.get(t) or [stem + x for x in e[t]]
    fut_stem = ov.get("fut_stem", inf)
    forms["fut"] = [fut_stem + x for x in FUT]
    forms["cond"] = [fut_stem + x for x in COND]
    part = ov.get("part", stem + e["part"])
    forms["perf"] = [h + " " + part for h in HABER]
    return forms, part


def main():
    out = {"persons": PERSONS, "tenses": TENSES, "verbs": []}
    for inf, ja, group in VERBS:
        forms, part = conjugate(inf)
        assert all(len(v) == 6 for v in forms.values()), inf
        out["verbs"].append({"inf": inf, "ja": ja, "group": group, "part": part, "forms": forms})
    path = pathlib.Path(__file__).resolve().parent.parent / "data" / "verbs.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {path} ({len(out['verbs'])} verbs)")


if __name__ == "__main__":
    main()
