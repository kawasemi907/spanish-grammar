'use strict';

/* =========================================================
   Español 4級 — 西検4級 文法・読解アプリ
   ハッシュルーティングの小さなSPA（ビルド不要）
   ========================================================= */

const KEY = 'esp4-v1';
const ACCENTS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'];
const DRILL_SIZE = 10;
const TYPE_LABEL = { conj: '活用', fill: '空所補充', choice: '選択', order: '並べ替え' };
const ICON_SPEAK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pad2 = n => String(n).padStart(2, '0');

// 判定用の正規化：大文字小文字・前後の空白・「.,;:」は無視。アクセント・ñ・ü・¿¡?! は区別する
function norm(s) {
  return String(s).normalize('NFC').toLocaleLowerCase('es')
    .replace(/[.,;:…]/g, ' ').replace(/\s+/g, ' ').trim();
}
// 並べ替え問題用：記号をすべて無視
function normOrder(s) {
  return norm(s).replace(/[¿?¡!"«»]/g, ' ').replace(/\s+/g, ' ').trim();
}
function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------- storage ---------- */
const Store = {
  d: null,
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }
    if (!d || typeof d !== 'object') d = {};
    this.d = {
      settings: Object.assign({ rate: 0.9, lang: 'both' }, d.settings),
      progress: d.progress && typeof d.progress === 'object' ? d.progress : {},
      review: Array.isArray(d.review) ? d.review : [],
      trainer: Object.assign({ tenses: ['pres'], verbs: null, vos: true }, d.trainer),
    };
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { toast('保存できませんでした'); }
    updateBadge();
  },
  get s() { return this.d.settings; },
  prog(id) { return this.d.progress[id] || (this.d.progress[id] = {}); },
  addReview(item) {
    const ex = this.d.review.find(r => r.key === item.key);
    if (ex) ex.miss = (ex.miss || 1) + 1;
    else this.d.review.push(Object.assign({ miss: 1, at: Date.now() }, item));
    this.save();
  },
  removeReview(key) {
    this.d.review = this.d.review.filter(r => r.key !== key);
    this.save();
  },
};

/* ---------- data ---------- */
const Data = {
  c: {},
  json(path) {
    if (!this.c[path]) {
      this.c[path] = fetch(path, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(`${path} (${r.status})`); return r.json(); })
        .catch(e => { delete this.c[path]; throw e; });
    }
    return this.c[path];
  },
  units() { return this.json('data/units.json').then(d => d.units); },
  unit(id) { return this.json(`data/unit${pad2(id)}.json`); },
  glossary() { return this.json('data/glossary.json'); },
  verbs() { return this.json('data/verbs.json'); },
};

/* ---------- speech (Web Speech API, es-ES) ---------- */
const Speech = {
  ok: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  voice: null,
  token: 0,
  cur: null,
  init() {
    if (!this.ok) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      const lang = v => (v.lang || '').replace('_', '-').toLowerCase();
      this.voice = vs.find(v => lang(v) === 'es-es') || vs.find(v => lang(v).startsWith('es')) || null;
    };
    pick();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', pick);
    else speechSynthesis.onvoiceschanged = pick;
  },
  utter(text, rate, done) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    if (this.voice) u.voice = this.voice;
    u.rate = rate || Store.s.rate;
    u.onend = u.onerror = () => { if (this.cur === u) this.cur = null; if (done) done(); };
    this.cur = u; // GC対策で参照を保持
    speechSynthesis.speak(u);
  },
  speak(text, rate) { this.play([text], 0, null, null, rate); },
  // texts を順番に読み上げる。onIndex(i) は各文の開始時、onDone は最後まで読んだとき
  play(texts, start, onIndex, onDone, rate) {
    if (!this.ok) { toast('この端末では音声読み上げが使えません'); if (onDone) onDone(); return; }
    const t = ++this.token;
    speechSynthesis.cancel();
    const next = i => {
      if (t !== this.token) return;
      if (i >= texts.length) { if (onDone) onDone(); return; }
      if (onIndex) onIndex(i);
      this.utter(texts[i], rate, () => next(i + 1));
    };
    setTimeout(() => next(start || 0), 80);
  },
  stop() {
    this.token++;
    if (this.ok) speechSynthesis.cancel();
  },
};

/* ---------- shared UI parts ---------- */
function speakBtn(text, label = '読み上げ') {
  return h('button', {
    class: 'spk', type: 'button', 'aria-label': label, html: ICON_SPEAK,
    onclick: e => { e.stopPropagation(); Speech.speak(text); },
  });
}

function transEl(o) {
  const lang = Store.s.lang;
  const el = h('div', { class: 'trans' });
  if (lang !== 'fr' && o.en) el.append(h('div', { class: 'tr', lang: 'en' }, h('span', { class: 'tag en' }, 'EN'), o.en));
  if (lang !== 'en' && o.fr) el.append(h('div', { class: 'tr', lang: 'fr' }, h('span', { class: 'tag fr' }, 'FR'), o.fr));
  return el;
}

function insertAtCursor(input, text) {
  const s = input.selectionStart ?? input.value.length;
  const e = input.selectionEnd ?? s;
  input.value = input.value.slice(0, s) + text + input.value.slice(e);
  input.setSelectionRange(s + text.length, s + text.length);
  input.focus();
}

function accentBar(input) {
  const bar = h('div', { class: 'accent-bar' });
  for (const ch of ACCENTS) {
    const b = h('button', { type: 'button', tabindex: '-1' }, ch);
    // フォーカス（キーボード）を入力欄に残したまま挿入する
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => { if (!input.disabled) insertAtCursor(input, ch); });
    bar.append(b);
  }
  return bar;
}

function progressBar(i, n) {
  return h('div', { class: 'progress' },
    h('span', null, `${i + 1} / ${n}`),
    h('div', { class: 'bar' }, h('i', { style: `width:${(i / n) * 100}%` })));
}

function fillSentence(el, sentence, fill, state) {
  el.replaceChildren();
  sentence.split('___').forEach((part, i) => {
    if (i > 0) el.append(h('span', { class: 'blank' + (state ? ' ' + state : '') }, fill || '　'));
    el.append(part);
  });
}

function answerText(q) {
  return q.type === 'choice' ? q.answer : q.answer[0];
}
// 答えを入れた完成文（読み上げ用）
function completedSentence(q) {
  if (q.type === 'order') return answerText(q);
  if (!q.sentence) return answerText(q);
  return q.sentence.split('___').join(answerText(q));
}

/* ---------- question component ----------
   q: { type: conj|fill|choice|order, ... }（CLAUDE.md の形式）
   opts.onResult(ok) は解答した瞬間、opts.onNext() は「次へ」を押したとき */
function mountQuestion(el, q, opts) {
  const { onResult, onNext, nextLabel = '次へ', source } = opts;
  const card = h('div', { class: 'card q-card' });
  card.append(h('div', { class: 'q-top' },
    h('span', { class: 'q-type' }, TYPE_LABEL[q.type] || '問題'),
    source ? h('span', { class: 'q-src' }, source) : null));

  if (q.type === 'conj') {
    card.append(h('div', { class: 'q-conj' },
      h('span', { class: 'verb', lang: 'es' }, q.verb),
      q.ja ? h('span', { class: 'verb-ja' }, q.ja) : null,
      h('span', { class: 'person', lang: 'es' }, q.person),
      q.tense ? h('span', { class: 'tense' }, q.tense) : null));
  }
  if (q.prompt) card.append(h('div', { class: 'q-prompt' }, q.prompt));

  let sentEl = null;
  if (q.sentence) {
    sentEl = h('div', { class: 'q-sentence', lang: 'es' });
    fillSentence(sentEl, q.sentence, null);
    card.append(sentEl);
  }
  if (q.en || q.fr) card.append(h('div', { class: 'q-hint' }, transEl(q)));

  const fb = h('div', { class: 'feedback', hidden: true });
  let answered = false;

  const finish = (ok, given, warn) => {
    if (answered) return;
    answered = true;
    const ans = answerText(q);
    if (sentEl) fillSentence(sentEl, q.sentence, ok ? given.trim() : ans, ok ? 'ok' : 'ng');
    fb.className = 'feedback ' + (ok ? 'ok' : 'ng');
    fb.append(h('div', { class: 'fb-head' }, ok ? '⭕ 正解！' : '❌ 不正解'));
    if (!ok) {
      fb.append(h('div', { class: 'fb-line' }, '正解：', h('b', { lang: 'es' }, ans)));
      if (given) fb.append(h('div', { class: 'fb-line small' }, 'あなたの答え：', h('span', { lang: 'es' }, given)));
      if (warn) fb.append(h('div', { class: 'fb-warn' }, warn));
    }
    if (q.explain) fb.append(h('div', { class: 'fb-exp', html: q.explain }));
    const full = completedSentence(q);
    fb.append(h('div', { class: 'fb-say' }, speakBtn(full), h('span', { lang: 'es' }, full)));
    const next = h('button', { class: 'btn primary', type: 'button', onclick: onNext }, nextLabel);
    fb.append(next);
    fb.hidden = false;
    onResult(ok);
    setTimeout(() => {
      next.focus({ preventScroll: true });
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  if (q.type === 'conj' || q.type === 'fill') {
    const input = h('input', {
      type: 'text', class: 'answer-input', lang: 'es', autocomplete: 'off', autocapitalize: 'off',
      autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', placeholder: '答えを入力',
      'aria-label': '答え',
    });
    const check = h('button', { class: 'btn primary block', type: 'button' }, '答え合わせ');
    const submit = () => {
      const v = input.value;
      if (!v.trim()) { input.focus(); return; }
      const ok = q.answer.some(a => norm(a) === norm(v));
      let warn = null;
      if (!ok && q.answer.some(a => stripAccents(norm(a)) === stripAccents(norm(v)))) {
        warn = 'おしい！アクセント記号・ñ・ü を確認しよう';
      }
      input.disabled = true;
      input.classList.add(ok ? 'ok' : 'ng');
      check.hidden = true;
      finish(ok, v, warn);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    check.addEventListener('click', submit);
    card.append(accentBar(input), input, check);
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  } else if (q.type === 'choice') {
    const box = h('div', { class: 'options' });
    const btns = shuffle(q.options).map(opt => h('button', {
      class: 'option', type: 'button', lang: 'es',
      onclick: () => {
        const ok = opt === q.answer;
        btns.forEach(b => {
          b.disabled = true;
          if (b.textContent === q.answer) b.classList.add('ok');
        });
        if (!ok) btn(opt).classList.add('ng');
        finish(ok, opt);
      },
    }, opt));
    const btn = t => btns.find(b => b.textContent === t);
    box.append(...btns);
    card.append(box);
  } else if (q.type === 'order') {
    const words = q.words.map((t, i) => ({ t, i }));
    let pool = shuffle(words);
    for (let k = 0; k < 5 && pool.length > 1 && normOrder(pool.map(w => w.t).join(' ')) === normOrder(q.answer[0]); k++) {
      pool = shuffle(words);
    }
    const picked = [];
    const ansArea = h('div', { class: 'order-answer', lang: 'es' });
    const poolArea = h('div', { class: 'order-pool', lang: 'es' });
    const check = h('button', { class: 'btn primary', type: 'button', disabled: true }, '答え合わせ');
    const reset = h('button', { class: 'btn', type: 'button' }, 'やり直す');
    const draw = () => {
      ansArea.replaceChildren(...picked.map(w => h('button', {
        class: 'chip', type: 'button',
        onclick: () => { if (answered) return; picked.splice(picked.indexOf(w), 1); draw(); },
      }, w.t)));
      poolArea.replaceChildren(...pool.filter(w => !picked.includes(w)).map(w => h('button', {
        class: 'chip', type: 'button',
        onclick: () => { if (answered) return; picked.push(w); draw(); },
      }, w.t)));
      check.disabled = picked.length !== words.length;
    };
    reset.addEventListener('click', () => { if (answered) return; picked.length = 0; draw(); });
    check.addEventListener('click', () => {
      const s = picked.map(w => w.t).join(' ');
      const ok = q.answer.some(a => normOrder(a) === normOrder(s));
      ansArea.classList.add(ok ? 'ok' : 'ng');
      check.parentNode.hidden = true;
      finish(ok, s);
    });
    draw();
    card.append(ansArea, poolArea, h('div', { class: 'btn-row' }, reset, check));
  }

  card.append(fb);
  el.replaceChildren(card);
}

/* ---------- bottom sheet (word popup) ---------- */
function openSheet(content) {
  const sheet = document.getElementById('sheet');
  sheet.replaceChildren(content);
  sheet.hidden = false;
  document.getElementById('sheet-backdrop').hidden = false;
}
function closeSheet() {
  document.getElementById('sheet').hidden = true;
  document.getElementById('sheet-backdrop').hidden = true;
  document.querySelectorAll('.w.sel').forEach(w => w.classList.remove('sel'));
}

/* ---------- layout / router ---------- */
const view = document.getElementById('view');
let renderToken = 0;

function setTop(title, back) {
  document.getElementById('title').textContent = title;
  const b = document.getElementById('back');
  b.hidden = !back;
  b.onclick = () => { location.hash = back; };
}

function updateBadge() {
  const b = document.getElementById('review-badge');
  const n = Store.d.review.length;
  b.hidden = n === 0;
  b.textContent = n > 99 ? '99+' : String(n);
}

async function render() {
  const token = ++renderToken;
  Speech.stop();
  closeSheet();
  const hash = location.hash || '#/';
  const navKey = hash.startsWith('#/trainer') ? 'trainer'
    : hash.startsWith('#/review') ? 'review'
    : hash.startsWith('#/settings') ? 'settings' : 'home';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));

  let node;
  try {
    let m;
    if ((m = hash.match(/^#\/unit\/(\d+)(?:\/(explain|drill|read))?$/))) node = await UnitView(+m[1], m[2] || 'explain');
    else if (hash === '#/trainer') node = await TrainerView();
    else if (hash === '#/review') node = await ReviewView();
    else if (hash === '#/settings') node = SettingsView();
    else node = await HomeView();
  } catch (e) {
    console.error(e);
    node = h('div', { class: 'card error' }, 'データを読み込めませんでした。', h('br'), h('span', { class: 'small' }, String(e.message || e)));
  }
  if (token !== renderToken) return;
  view.replaceChildren(node);
  window.scrollTo(0, 0);
}

/* ---------- Home ---------- */
async function HomeView() {
  setTop('Español 4級', null);
  const units = await Data.units();
  const P = Store.d.progress;
  const avail = units.filter(u => u.available);
  const done = units.filter(u => P[u.id] && P[u.id].read && (P[u.id].best || 0) >= 80).length;
  const next = avail.find(u => !(P[u.id] && P[u.id].read && (P[u.id].best || 0) >= 80));

  const root = h('div');
  root.append(h('section', { class: 'hero' },
    h('div', { class: 'hero-title' }, '西検4級 文法・読解'),
    h('div', { class: 'hero-sub' }, `完了 ${done} / ${units.length} ユニット（公開中 ${avail.length}）`),
    h('div', { class: 'hero-bar' }, h('i', { style: `width:${(done / units.length) * 100}%` }))));

  root.append(h('div', { class: 'quick' },
    next
      ? h('a', { href: `#/unit/${next.id}` }, h('b', null, `▶ Unit ${next.id}`), h('span', null, next.title))
      : h('a', { href: '#/trainer' }, h('b', null, '⚡ 活用トレーナー'), h('span', null, '動詞と時制を選んで練習')),
    h('a', { href: '#/review' }, h('b', null, `↻ 復習 ${Store.d.review.length}問`), h('span', null, '間違えた問題だけを解く'))));

  root.append(h('div', { class: 'section-title' }, 'ユニット'));
  const list = h('div', { class: 'unit-list' });
  for (const u of units) {
    const p = P[u.id] || {};
    const meta = u.available
      ? h('div', { class: 'unit-meta' },
        h('span', null, p.best != null ? `ドリル ${p.best}%` : 'ドリル —'),
        h('div', { class: 'meter' }, h('i', { style: `width:${p.best || 0}%` })),
        p.read ? h('span', { class: 'read-mark' }, '📖 読了') : null)
      : h('div', { class: 'unit-meta' }, '準備中');
    const inner = [h('div', { class: 'unit-no' }, u.id), h('div', { class: 'unit-body' }, h('div', { class: 'unit-title' }, u.title), meta)];
    list.append(u.available
      ? h('a', { class: 'unit-item', href: `#/unit/${u.id}` }, inner)
      : h('div', { class: 'unit-item locked', 'aria-disabled': 'true' }, inner));
  }
  root.append(list);
  return root;
}

/* ---------- Unit ---------- */
async function UnitView(id, tab) {
  const [u, gl, units] = await Promise.all([Data.unit(id), Data.glossary(), Data.units()]);
  setTop(`Unit ${id}`, '#/');
  const root = h('div');
  root.append(h('div', { class: 'unit-head' }, h('div', { class: 'kicker' }, `UNIT ${id}`), h('h2', null, u.title)));
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const [k, label] of [['explain', '解説'], ['drill', 'ドリル'], ['read', '読む']]) {
    tabs.append(h('button', {
      class: k === tab ? 'active' : '', type: 'button', role: 'tab', 'aria-selected': String(k === tab),
      onclick: () => { if (k !== tab) location.replace(`#/unit/${id}/${k}`); },
    }, label));
  }
  root.append(tabs);
  const content = h('div');
  root.append(content);
  if (tab === 'explain') renderExplain(content, u);
  else if (tab === 'drill') renderDrillStart(content, u);
  else renderReading(content, u, gl, units);
  return root;
}

function renderExplain(el, u) {
  const ex = u.explain;
  for (const sec of ex.sections) {
    el.append(h('div', { class: 'card' }, h('h3', null, sec.title), h('div', { class: 'explain-body', html: sec.body })));
  }
  if (ex.french) {
    el.append(h('div', { class: 'card fr-box' }, h('h3', null, 'フランス語との比較'), h('div', { class: 'explain-body', html: ex.french })));
  }
  const list = h('ul', { class: 'ex-list' });
  const trs = [];
  for (const e of ex.examples) {
    const tr = transEl(e);
    tr.hidden = true;
    trs.push(tr);
    list.append(h('li', null,
      speakBtn(e.es),
      h('div', { class: 'ex-main' },
        h('div', { class: 'ex-es', lang: 'es', onclick: () => { tr.hidden = !tr.hidden; } }, e.es),
        tr)));
  }
  let allOn = false;
  const toggle = h('button', {
    class: 'link-btn', type: 'button',
    onclick: () => { allOn = !allOn; trs.forEach(t => { t.hidden = !allOn; }); toggle.textContent = allOn ? '訳をすべて隠す' : '訳をすべて表示'; },
  }, '訳をすべて表示');
  el.append(h('div', { class: 'card' },
    h('div', { class: 'ex-head' }, h('h3', null, '例文'), toggle),
    h('div', { class: 'ex-hint' }, '文をタップすると英語・フランス語訳を表示'),
    list));
  el.append(h('a', { class: 'btn primary block', href: `#/unit/${u.id}/drill`, onclick: e => { e.preventDefault(); location.replace(`#/unit/${u.id}/drill`); } }, 'ドリルに進む'));
}

function renderDrillStart(el, u) {
  const p = Store.prog(u.id);
  el.replaceChildren(h('div', { class: 'card' },
    h('h3', null, 'ドリル'),
    h('p', { class: 'muted small' }, `1回${DRILL_SIZE}問（全${u.drill.length}問からランダム）。活用入力・選択・空所補充・並べ替えが混ざって出ます。間違えた問題は復習リストに入ります。`),
    h('div', { class: 'stats' },
      h('span', null, '最高 ', h('b', null, p.best != null ? `${p.best}%` : '—')),
      h('span', null, '前回 ', h('b', null, p.last != null ? `${p.last}%` : '—')),
      h('span', null, '挑戦 ', h('b', null, `${p.runs || 0}回`))),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => runDrill(el, u) }, 'スタート')));
}

function runDrill(el, u) {
  const qs = shuffle(u.drill).slice(0, DRILL_SIZE);
  let i = 0;
  let correct = 0;
  const wrong = [];
  const step = () => {
    if (i >= qs.length) { finish(); return; }
    const q = qs[i];
    const box = h('div');
    el.replaceChildren(progressBar(i, qs.length), box);
    mountQuestion(box, q, {
      nextLabel: i === qs.length - 1 ? '結果を見る' : '次へ',
      onResult: ok => {
        if (ok) correct++;
        else { wrong.push(q); Store.addReview({ key: `u${u.id}:${q.id}`, unit: u.id, qid: q.id }); }
      },
      onNext: () => { Speech.stop(); i++; step(); window.scrollTo(0, 0); },
    });
  };
  const finish = () => {
    const pct = Math.round((correct / qs.length) * 100);
    const p = Store.prog(u.id);
    p.last = pct;
    p.best = Math.max(p.best || 0, pct);
    p.runs = (p.runs || 0) + 1;
    Store.save();
    const msg = pct === 100 ? '¡Perfecto! 全問正解！' : pct >= 80 ? '¡Muy bien! よくできました' : pct >= 50 ? '¡Ánimo! もう一度やってみよう' : '解説を読み直してから再挑戦しよう';
    const card = h('div', { class: 'card' },
      h('div', { class: 'result-score' }, `${correct}`, h('small', null, ` / ${qs.length}`)),
      h('div', { class: 'result-msg' }, msg),
      h('div', { class: 'center muted small' }, `正答率 ${pct}%（最高 ${p.best}%）`));
    if (wrong.length) {
      card.append(h('div', { class: 'small muted', style: 'margin-top:12px' }, `間違えた問題（${wrong.length}問を復習リストに追加しました）`));
      card.append(h('ul', { class: 'wrong-list' }, wrong.map(q => h('li', null,
        h('div', { class: 'es', lang: 'es' }, completedSentence(q)),
        q.type === 'conj' ? h('div', { class: 'muted' }, `${q.verb} → ${q.person}`) : null))));
    }
    card.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => location.replace(`#/unit/${u.id}/explain`) }, '解説を見る'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { runDrill(el, u); window.scrollTo(0, 0); } }, 'もう一度')));
    el.replaceChildren(card);
  };
  step();
}

function renderReading(el, u, gl, units) {
  const r = u.reading;
  const p = Store.prog(u.id);
  const texts = r.sentences.map(s => s.es);
  const rows = [];
  const trs = [];
  let playing = false;

  const playBtn = h('button', { class: 'btn primary', type: 'button' }, '▶ 全文');
  const setPlaying = on => {
    playing = on;
    playBtn.textContent = on ? '■ 停止' : '▶ 全文';
    if (!on) rows.forEach(r2 => r2.classList.remove('now'));
  };
  const highlight = i => {
    rows.forEach((row, k) => row.classList.toggle('now', k === i));
    rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const playFrom = i => {
    setPlaying(true);
    Speech.play(texts, i, highlight, () => setPlaying(false));
  };
  playBtn.addEventListener('click', () => {
    if (playing) { Speech.stop(); setPlaying(false); } else playFrom(0);
  });

  const out = h('output', null, Store.s.rate.toFixed(2));
  const slider = h('input', { type: 'range', min: '0.5', max: '1.3', step: '0.05', value: String(Store.s.rate), 'aria-label': '読み上げ速度' });
  slider.addEventListener('input', () => { Store.s.rate = +slider.value; out.textContent = Store.s.rate.toFixed(2); });
  slider.addEventListener('change', () => Store.save());

  let allOn = false;
  const trAll = h('button', { class: 'btn', type: 'button' }, '全訳');
  trAll.addEventListener('click', () => {
    allOn = !allOn;
    trs.forEach(t => { t.el.hidden = !allOn; t.btn.classList.toggle('on', allOn); });
    trAll.textContent = allOn ? '全訳 ✕' : '全訳';
  });

  el.append(h('div', { class: 'reader-controls' }, playBtn, h('label', { class: 'speed' }, '速度', slider, out), trAll));

  const story = h('div', { class: 'card' });
  story.append(h('h2', { class: 'story-title', lang: 'es' }, r.title));
  story.append(h('div', { class: 'story-hint' }, '単語をタップ → 原形と英仏訳 ／ 🔊 その文を再生 ／ 訳 → 1文ずつ訳を表示', p.read ? h('span', null, ' ', h('span', { class: 'read-badge' }, '読了')) : null));

  let para = null;
  r.sentences.forEach((s, i) => {
    if (!para || s.p) { para = h('div', { class: 'para' }); story.append(para); }
    const es = h('div', { class: 'sent-es', lang: 'es' });
    s.es.split(/([\p{L}\p{M}]+)/u).forEach((part, k) => {
      if (k % 2 === 1) {
        es.append(h('span', { class: 'w', onclick: ev => showWord(ev.currentTarget, part, r.glossary, gl) }, part));
      } else if (part) es.append(part);
    });
    const tr = transEl(s);
    tr.hidden = true;
    const trBtn = h('button', { class: 'tr-btn', type: 'button', 'aria-label': '訳を表示' }, '訳');
    trBtn.addEventListener('click', () => { tr.hidden = !tr.hidden; trBtn.classList.toggle('on', !tr.hidden); });
    trs.push({ el: tr, btn: trBtn });
    const sp = h('button', { class: 'spk', type: 'button', 'aria-label': 'この文を再生', html: ICON_SPEAK });
    sp.addEventListener('click', () => { setPlaying(false); Speech.play([s.es], 0, () => highlight(i), () => rows[i].classList.remove('now')); });
    const row = h('div', { class: 'sent' }, h('div', { class: 'sent-main' }, es, tr), h('div', { class: 'sent-tools' }, sp, trBtn));
    rows.push(row);
    para.append(row);
  });
  el.append(story);

  // 内容確認クイズ
  const quiz = h('div', { class: 'card' }, h('h3', null, 'Comprensión'), h('div', { class: 'muted small' }, '内容確認クイズ（3問）'));
  let answered = 0;
  let score = 0;
  const result = h('div', { hidden: true });
  r.quiz.forEach(qz => {
    const box = h('div', { class: 'quiz-q' }, h('p', { lang: 'es' }, qz.q));
    const opts = h('div', { class: 'options' });
    const btns = shuffle(qz.options).map(o => h('button', {
      class: 'option', type: 'button', lang: 'es',
      onclick: ev => {
        const ok = o === qz.answer;
        btns.forEach(b => { b.disabled = true; if (b.textContent === qz.answer) b.classList.add('ok'); });
        if (!ok) ev.currentTarget.classList.add('ng');
        answered++;
        if (ok) score++;
        if (answered === r.quiz.length) {
          p.read = true;
          p.quiz = Math.max(p.quiz || 0, score);
          Store.save();
          const nextUnit = units.find(x => x.id === u.id + 1);
          result.replaceChildren(
            h('div', { class: 'result-msg' }, `${score} / ${r.quiz.length} 正解 — 📖 読了マークをつけました`),
            h('div', { class: 'btn-row' },
              nextUnit && nextUnit.available ? h('a', { class: 'btn primary', href: `#/unit/${nextUnit.id}` }, `Unit ${nextUnit.id} へ`) : h('a', { class: 'btn primary', href: '#/' }, 'ホームへ')));
          result.hidden = false;
        }
      },
    }, o));
    opts.append(...btns);
    box.append(opts);
    quiz.append(box);
  });
  quiz.append(result);
  el.append(quiz);
}

function showWord(span, word, local, common) {
  const key = word.toLocaleLowerCase('es');
  const entry = (local && local[key]) || common[key] || null;
  document.querySelectorAll('.w.sel').forEach(w => w.classList.remove('sel'));
  span.classList.add('sel');
  const body = h('div', null, h('div', { class: 'sheet-word', lang: 'es' }, speakBtn(word), word));
  if (entry) {
    body.append(h('div', { class: 'sheet-lemma' }, '原形：', h('b', { lang: 'es' }, entry.lemma)));
    if (entry.note) body.append(h('div', { class: 'sheet-note' }, entry.note));
    body.append(transEl(entry));
  } else {
    body.append(h('div', { class: 'muted' }, 'この単語の辞書データはありません'));
  }
  body.append(h('button', { class: 'btn block', type: 'button', style: 'margin-top:14px', onclick: closeSheet }, '閉じる'));
  openSheet(body);
}

/* ---------- Conjugation trainer ---------- */
function conjTable(v, tenseKey, persons, hit) {
  // 命令法には yo の形がない（null）ので行ごと省く
  return '<table class="conj-table">' + v.forms[tenseKey].map((f, i) => f == null ? ''
    : `<tr class="${i === hit ? 'hit' : ''}"><td>${persons[i]}</td><td>${f}</td></tr>`).join('') + '</table>';
}

function conjQuestion(V, v, tenseKey, person) {
  const t = V.tenses.find(x => x.key === tenseKey);
  return {
    type: 'conj', verb: v.inf, ja: v.ja, person: V.persons[person], tense: t.label,
    answer: [v.forms[tenseKey][person]],
    explain: `<b>${v.inf}</b>（${t.label}）` + conjTable(v, tenseKey, V.persons, person),
  };
}

async function TrainerView() {
  setTop('活用トレーナー', '#/');
  const V = await Data.verbs();
  const T = Store.d.trainer;
  const allInfs = V.verbs.map(v => v.inf);
  if (!Array.isArray(T.verbs)) T.verbs = allInfs.slice();
  T.verbs = T.verbs.filter(x => allInfs.includes(x));
  T.tenses = T.tenses.filter(k => V.tenses.some(t => t.key === k));
  const root = h('div');

  const setup = () => {
    const tenseChips = h('div', { class: 'chips' });
    const verbBox = h('div');
    const startBtn = h('button', { class: 'btn primary block', type: 'button' }, 'スタート');
    const countEl = h('span', { class: 'muted small' });
    const refresh = () => {
      tenseChips.querySelectorAll('.toggle-chip').forEach(c => c.classList.toggle('on', T.tenses.includes(c.dataset.k)));
      verbBox.querySelectorAll('.toggle-chip').forEach(c => c.classList.toggle('on', T.verbs.includes(c.dataset.k)));
      countEl.textContent = `${T.verbs.length} / ${allInfs.length} 語を選択中`;
      startBtn.disabled = !T.tenses.length || !T.verbs.length;
      Store.save();
    };
    const toggleIn = (arr, k) => { const i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); else arr.push(k); };

    for (const t of V.tenses) {
      tenseChips.append(h('button', {
        class: 'toggle-chip', type: 'button', 'data-k': t.key,
        onclick: () => { toggleIn(T.tenses, t.key); refresh(); },
      }, t.label, h('small', null, `U${t.unit}`)));
    }
    const groups = [['reg', '規則動詞'], ['stem', '語幹母音変化'], ['irr', '不規則動詞']];
    const setVerbs = list => { T.verbs = list; refresh(); };
    verbBox.append(h('div', { class: 'group-btns' },
      h('button', { type: 'button', onclick: () => setVerbs(allInfs.slice()) }, 'すべて'),
      groups.map(([g, label]) => h('button', { type: 'button', onclick: () => setVerbs(V.verbs.filter(v => v.group === g).map(v => v.inf)) }, label + 'のみ')),
      h('button', { type: 'button', onclick: () => setVerbs([]) }, '解除')));
    for (const [g, label] of groups) {
      verbBox.append(h('div', { class: 'verb-group-label' }, label));
      verbBox.append(h('div', { class: 'chips' }, V.verbs.filter(v => v.group === g).map(v => h('button', {
        class: 'toggle-chip', type: 'button', 'data-k': v.inf, lang: 'es', title: v.ja,
        onclick: () => { toggleIn(T.verbs, v.inf); refresh(); },
      }, v.inf))));
    }
    const vos = h('input', { type: 'checkbox', id: 'vos' });
    vos.checked = T.vos;
    vos.addEventListener('change', () => { T.vos = vos.checked; Store.save(); });
    startBtn.addEventListener('click', () => { session(); window.scrollTo(0, 0); });

    root.replaceChildren(
      h('div', { class: 'card' }, h('h3', null, '時制'), h('div', { class: 'muted small', style: 'margin-bottom:8px' }, 'U＝その時制を学ぶユニット'), tenseChips),
      h('div', { class: 'card' }, h('h3', null, '動詞 ', countEl), verbBox,
        h('label', { class: 'check-row', for: 'vos', style: 'margin-top:10px' }, vos, 'vosotros も出題する')),
      startBtn);
    refresh();
  };

  const session = () => {
    const verbs = V.verbs.filter(v => T.verbs.includes(v.inf));
    const persons = [0, 1, 2, 3, 4, 5].filter(p => T.vos || p !== 4);
    let n = 0;
    let ok = 0;
    let streak = 0;
    let last = '';
    const statsEl = h('div', { class: 'stats' });
    const box = h('div');
    const drawStats = () => statsEl.replaceChildren(
      h('span', null, '正解 ', h('b', null, `${ok} / ${n}`)),
      h('span', null, '連続 ', h('b', null, String(streak))),
      h('button', { class: 'link-btn', type: 'button', onclick: () => { Speech.stop(); setup(); } }, '設定に戻る'));
    const next = () => {
      let v, tk, p, key;
      for (let k = 0; k < 10; k++) {
        v = verbs[Math.floor(Math.random() * verbs.length)];
        tk = T.tenses[Math.floor(Math.random() * T.tenses.length)];
        const ps = persons.filter(x => v.forms[tk][x] != null);
        p = ps[Math.floor(Math.random() * ps.length)];
        key = `${v.inf}:${tk}:${p}`;
        if (key !== last) break;
      }
      last = key;
      mountQuestion(box, conjQuestion(V, v, tk, p), {
        onResult: good => {
          n++;
          if (good) { ok++; streak++; } else {
            streak = 0;
            Store.addReview({ key: `c:${key}`, verb: v.inf, tense: tk, person: p });
          }
          drawStats();
        },
        onNext: () => { Speech.stop(); next(); },
      });
    };
    drawStats();
    root.replaceChildren(statsEl, box);
    next();
  };

  setup();
  return root;
}

/* ---------- Review ---------- */
async function ReviewView() {
  setTop('復習', '#/');
  const root = h('div');
  const [units, V] = await Promise.all([Data.units(), Data.verbs()]);

  const resolve = async item => {
    if (item.unit) {
      const u = await Data.unit(item.unit).catch(() => null);
      const q = u && u.drill.find(x => x.id === item.qid);
      return q ? { q, source: `Unit ${item.unit}` } : null;
    }
    const v = V.verbs.find(x => x.inf === item.verb);
    if (!v || !v.forms[item.tense] || v.forms[item.tense][item.person] == null) return null;
    return { q: conjQuestion(V, v, item.tense, item.person), source: '活用トレーナー' };
  };

  const overview = () => {
    const list = Store.d.review;
    if (!list.length) {
      root.replaceChildren(h('div', { class: 'card center' },
        h('div', { style: 'font-size:40px' }, '🎉'),
        h('h3', null, '復習する問題はありません'),
        h('p', { class: 'muted small' }, 'ドリルや活用トレーナーで間違えた問題がここにたまります。'),
        h('a', { class: 'btn primary', href: '#/' }, 'ホームへ')));
      return;
    }
    const byUnit = {};
    let conj = 0;
    for (const it of list) {
      if (it.unit) byUnit[it.unit] = (byUnit[it.unit] || 0) + 1;
      else conj++;
    }
    const sum = h('ul', { class: 'review-sum' });
    for (const u of units) {
      if (byUnit[u.id]) sum.append(h('li', null, h('span', null, `Unit ${u.id} ${u.title}`), h('b', null, `${byUnit[u.id]}問`)));
    }
    if (conj) sum.append(h('li', null, h('span', null, '活用トレーナー'), h('b', null, `${conj}問`)));
    root.replaceChildren(
      h('div', { class: 'card' },
        h('h3', null, `復習リスト ${list.length}問`),
        h('p', { class: 'muted small' }, '1回最大10問。正解した問題はリストから消えます。'),
        sum,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: session }, '復習スタート'))),
      h('button', {
        class: 'link-btn', type: 'button',
        onclick: () => { if (confirm('復習リストを空にしますか？')) { Store.d.review = []; Store.save(); overview(); } },
      }, '復習リストを空にする'));
  };

  const session = async () => {
    const picked = [];
    for (const it of shuffle(Store.d.review)) {
      if (picked.length >= DRILL_SIZE) break;
      const r = await resolve(it);
      if (r) picked.push(Object.assign(r, { item: it }));
      else Store.removeReview(it.key); // データが変わって見つからない問題は削除
    }
    if (!picked.length) { overview(); return; }
    let i = 0;
    let ok = 0;
    const box = h('div');
    const step = () => {
      if (i >= picked.length) {
        root.replaceChildren(h('div', { class: 'card' },
          h('div', { class: 'result-score' }, String(ok), h('small', null, ` / ${picked.length}`)),
          h('div', { class: 'result-msg' }, `残り ${Store.d.review.length} 問`),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn', href: '#/' }, 'ホームへ'),
            Store.d.review.length ? h('button', { class: 'btn primary', type: 'button', onclick: session }, '続ける') : null)));
        window.scrollTo(0, 0);
        return;
      }
      const { q, source, item } = picked[i];
      root.replaceChildren(progressBar(i, picked.length), box);
      mountQuestion(box, q, {
        source,
        nextLabel: i === picked.length - 1 ? '結果を見る' : '次へ',
        onResult: good => {
          if (good) { ok++; Store.removeReview(item.key); } else Store.addReview(item);
        },
        onNext: () => { Speech.stop(); i++; step(); window.scrollTo(0, 0); },
      });
    };
    step();
  };

  overview();
  return root;
}

/* ---------- Settings ---------- */
function SettingsView() {
  setTop('設定', '#/');
  const S = Store.s;

  const out = h('output', null, S.rate.toFixed(2));
  const slider = h('input', { type: 'range', min: '0.5', max: '1.3', step: '0.05', value: String(S.rate), 'aria-label': '読み上げ速度' });
  slider.addEventListener('input', () => { S.rate = +slider.value; out.textContent = S.rate.toFixed(2); });
  slider.addEventListener('change', () => Store.save());

  const seg = h('div', { class: 'seg' });
  const langs = [['en', 'English'], ['fr', 'Français'], ['both', '両方']];
  const drawSeg = () => seg.replaceChildren(...langs.map(([k, label]) => h('button', {
    class: S.lang === k ? 'on' : '', type: 'button',
    onclick: () => { S.lang = k; Store.save(); drawSeg(); },
  }, label)));
  drawSeg();

  const voiceInfo = !Speech.ok ? 'この端末・ブラウザでは読み上げが使えません。'
    : Speech.voice ? `使用する音声：${Speech.voice.name}（${Speech.voice.lang}）`
    : 'スペイン語の音声が見つかりません。端末の「テキスト読み上げ」設定でスペイン語（スペイン）の音声データを追加してください。';

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || typeof d !== 'object' || !('progress' in d)) throw new Error('形式が違います');
      localStorage.setItem(KEY, JSON.stringify(d));
      Store.load();
      updateBadge();
      toast('学習記録を読み込みました');
      render();
    } catch (e) {
      toast('読み込めませんでした：' + e.message);
    }
  });
  const exportData = () => {
    const blob = new Blob([JSON.stringify(Store.d, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `esp4-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return h('div', null,
    h('div', { class: 'card' },
      h('div', { class: 'setting' },
        h('div', { class: 'setting-label' }, '読み上げ速度'),
        h('label', { class: 'speed' }, 'ゆっくり', slider, out),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => Speech.speak('¡Hola! Me llamo Yuki. Vivo en Madrid.') }, '🔊 試しに聞く')),
        h('p', { class: 'muted small' }, voiceInfo)),
      h('div', { class: 'setting' },
        h('div', { class: 'setting-label' }, '訳の言語'),
        seg,
        h('p', { class: 'muted small' }, '例文・読み物・単語の訳に使います。'))),
    h('div', { class: 'card' },
      h('h3', null, '学習記録'),
      h('p', { class: 'muted small' }, '記録はこの端末のブラウザに保存されています。機種変更やデータ消去の前にバックアップしてください。'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: exportData }, '書き出し'),
        h('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, '読み込み')),
      fileIn,
      h('div', { class: 'btn-row' }, h('button', {
        class: 'btn', type: 'button', style: 'color:var(--ng)',
        onclick: () => {
          if (!confirm('ドリルの成績・読了マーク・復習リストをすべて消去しますか？')) return;
          Store.d.progress = {};
          Store.d.review = [];
          Store.save();
          toast('学習記録を消去しました');
        },
      }, '学習記録をリセット'))),
    h('p', { class: 'center muted small' }, 'Español 4級 · 西検4級 文法・読解'));
}

/* ---------- boot ---------- */
Store.load();
Speech.init();
updateBadge();
document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) Speech.stop(); });
window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator) {
  // 新しいバージョンが公開されたら、切り替わった時点で1回だけ再読み込みして最新データを表示する
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
