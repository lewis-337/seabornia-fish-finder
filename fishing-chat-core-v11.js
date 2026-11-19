/* Shared, deterministic retrieval. No personal storage or network access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FishingChatCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const normalize = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  function safeURL(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
    } catch { return null; }
  }
  function documents({ knowledge = {}, marina = {}, pack = {}, research = {}, species = [], checkedAt = "" } = {}) {
    const docs = [];
    const add = (d) => docs.push({ ...d, text: String(d.text || "").slice(0, 1800) });
    for (const row of knowledge.entries || []) add({
      id: "term-" + row.id, title: row.title, text: row.answer, text_en: row.answer_en,
      keywords: row.keywords || [], sources: row.sources || [], checkedAt: knowledge.checkedAt, kind: "用語・基礎知識",
    });
    if (marina.id) add({ id: "marina-" + marina.id, title: marina.name + "の利用条件", kind: "保存済みマリーナ情報",
      text: [marina.reason, marina.profile?.summary, marina.profile?.preparation, ...(marina.boats || []).map(b => `${b.name}: エサ釣り ${b.bait || "不明"} / ルアー ${b.lure || "不明"}。${(b.restrictions || []).join("、")}`)].filter(Boolean).join("\n"),
      keywords: [marina.name, marina.shortName, "ルール", "制限", "利用条件", "boat", "rules"],
      sources: [{ title: "Yamaha公式マリーナ情報", url: marina.source }], checkedAt: marina.checkedAt });
    for (const row of research.guides || []) {
      if (!(row.marinaIds || []).includes(marina.id)) continue;
      add({ id: row.research_id, fish: row.fish, title: row.fish + "の釣り方・参考情報", kind: "出典付きガイド",
        text: [row.fish, row.ground, row.depth, row.tackle, row.note, row.months?.length ? "参考月: " + row.months.join("・") : "季節未確認"].filter(Boolean).join("。"),
        keywords: [row.fish, row.tackle, row.ground], sources: [{ title: row.sourceType || "公開ガイド", url: row.source }], checkedAt: research.checkedAt,
        publishedAt: row.publishedAt || "不明" });
    }
    for (const row of pack.reports || []) add({ id: "report-" + row.id, fish: row.fish, title: row.fish + "の公開報告", kind: row.kind === "current" ? "公開釣果（原文確認が必要）" : "公開参考報告",
      text: [row.fish, "釣行日: " + (row.date || "不明"), row.publishedAt ? "投稿日: " + row.publishedAt : "", row.method, row.depth, row.amount, row.detail, row.note, row.location_note].filter(Boolean).join("。"),
      keywords: [row.fish, row.method], sources: [{ title: row.source_name || "報告原文", url: row.source }], checkedAt: pack.last_success || pack.checkedAt || checkedAt });
    for (const row of species) add({ id: "fish-" + row.id, fish: row.name, title: row.name + "の図鑑メモ", kind: "アプリ内の一般参考情報（現地実績ではありません）",
      text: [row.name, row.habitat, row.depth, row.method, row.note, row.months?.length ? "参考月: " + row.months.join("・") : ""].filter(Boolean).join("。"),
      keywords: [row.name, row.method, row.habitat], sources: [], checkedAt });
    return docs;
  }
  const noise = new Set(["what", "does", "the", "and", "how", "about", "this", "that", "with", "fishing", "please", "tips", "釣り", "教えて", "について", "ですか", "とは", "です", "ます"]);
  function tokens(question) {
    const q = normalize(question);
    const out = new Set(q.split(/[\s、。？?！!,.\/・]+/).filter(v => v.length > 1 && !noise.has(v)));
    // Japanese has no word separators; bigrams retrieve names without depending on Intl.Segmenter.
    for (const run of q.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu) || [])
      for (let i = 0; i < run.length - 1; i++) if (!noise.has(run.slice(i, i + 2))) out.add(run.slice(i, i + 2));
    return [...out];
  }
  function retrieve(question, docs, limit = 7) {
    const q = normalize(question), terms = tokens(q);
    const fishNames = [...new Set(docs.map(d => d.fish).filter(Boolean))];
    const fishMatch = name => {
      const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp("(^|[^ァ-ヶー])" + escaped + "(?=$|[^ァ-ヶー])").test(q);
    };
    const namedFish = fishNames.filter(fishMatch);
    return docs.map(d => {
      if (namedFish.length && d.fish && !namedFish.includes(d.fish)) return { ...d, score: 0 };
      if (d.fish && q.includes(normalize(d.fish)) && !fishMatch(d.fish)) return { ...d, score: 0 };
      const title = normalize(d.title), text = normalize(d.text);
      let score = 0;
      for (const k of d.keywords || []) {
        const keyword = normalize(k);
        if (keyword.length > 1 && q.includes(keyword)) score += 20 + keyword.length;
      }
      for (const t of terms) { if (title.includes(t)) score += 5; else if (text.includes(t)) score += 1; }
      if (d.id?.startsWith("term-") && score > 0) score += 8;
      return { ...d, score };
    }).filter(d => d.score >= 5).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  function localAnswer(question, docs, marinaName) {
    const hits = retrieve(question, docs, 4);
    const english = !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(question);
    const intro = english ? "From saved reference material. Live web search is off." : "保存済み資料からの回答です。ライブ検索は行っていません。";
    if (!hits.length) return { text: intro + "\n\n一致する資料が見つかりませんでした。魚種名・釣り方・用語を具体的に入力するか、AI相談を利用してください。", sources: [], kind: "資料検索", hits: [] };
    return { text: intro + "\n\n" + hits.map(d => `${d.title}\n${english && d.text_en ? d.text_en : d.text}\n${english ? "Reference checked" : "情報区分: " + d.kind + " / 確認"}: ${d.checkedAt || "不明"}`).join("\n\n"),
      sources: hits.flatMap(d => (d.sources || []).filter(s => safeURL(s.url))), kind: "資料検索", hits };
  }
  return { normalize, safeURL, documents, tokens, retrieve, localAnswer };
});
