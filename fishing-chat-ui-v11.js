(function (root) {
  "use strict";
  const C = root.FishingChatCore;
  function mount({ getContext }) {
    const $ = id => document.getElementById(id), conversations = new Map();
    let corpus, config = { enabled: false, endpoint: "" }, token = "", controller = null, activeId = "", initialized = false;
    const turn = id => {
      if (!conversations.has(id)) conversations.set(id, { messages: [], draft: "", busy: false });
      return conversations.get(id);
    };
    const current = () => getContext().marinaId;
    const make = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
    function link(source, label) {
      const url = C.safeURL(source.url);
      if (!url) return make("span", label || source.title || "出典未確認");
      const a = make("a", label || source.title || url); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.title = source.title || url; return a;
    }
    function render() {
      const id = current(), data = turn(id), ctx = getContext();
      if (activeId !== id) {
        if (activeId) turn(activeId).draft = $("chatQuestion").value;
        activeId = id; $("chatQuestion").value = data.draft;
      }
      const marina = corpus?.directory.marinas.find(m => m.id === id) || ctx.marina;
      $("chatMarina").textContent = marina?.name || "出港地を確認中";
      $("chatEmpty").hidden = data.messages.length > 0;
      $("chatTranscript").replaceChildren();
      for (const row of data.messages) {
        const article = make("article", "", "chatMessage " + (row.role === "user" ? "chatUser" : "chatAssistant"));
        article.append(make("strong", row.role === "user" ? "あなた" : row.kind || "SFF"));
        const body = make("div", "", "chatText");
        if (row.segments) for (const part of row.segments) body.append(part.url ? link(part, part.text) : document.createTextNode(part.text));
        else body.textContent = row.text;
        article.append(body);
        if (row.role !== "user") {
          if (row.kind === "AI相談") article.append(make("p", row.searched ? "ウェブ検索を実行 · " + new Date(row.checkedAt).toLocaleString("ja-JP") : row.requestedWeb ? "ライブ検索の完了を確認できませんでした。" : "ウェブ検索なし · 保存済み資料と一般知識", "chatMeta"));
          if (row.sources?.length) {
            const details = make("details", "", "chatSources"); details.append(make("summary", "出典を確認"));
            const list = make("ul");
            for (const source of [...new Map(row.sources.map(s => [s.url, s])).values()]) { const li = make("li"); li.append(link(source)); list.append(li); }
            details.append(list); article.append(details);
          }
        }
        $("chatTranscript").append(article);
      }
      $("chatSend").disabled = data.busy || !!controller || !corpus;
      document.querySelectorAll("[data-chat-prompt]").forEach(b => { b.disabled = data.busy || !!controller || !corpus; });
      $("chatQuestion").disabled = data.busy;
      $("chatCancel").hidden = !controller;
      $("chatClear").disabled = !!controller || !data.messages.length;
      $("chatStatus").textContent = data.busy ? "回答を調べています…" : controller ? "別の出港地の回答を処理中…" : !corpus ? "資料を読み込んでいます…" : "";
      $("chatTranscript").setAttribute("aria-busy", String(data.busy));
      const enabled = config.enabled && !!C.safeURL(config.endpoint);
      $("chatModeAI").disabled = !enabled;
      $("chatConnection").hidden = !enabled;
      $("chatAvailability").textContent = enabled ? "AI相談では、質問・この出港地の公開資料・直近の会話をAIサービスへ送ります。アクセスコードはこの画面を閉じるまでだけ保持します。" : "資料検索は無料で使えます。AI相談・ライブ検索は接続準備中です。";
      $("chatWeb").disabled = $("chatMode").value !== "ai" || !enabled;
    }
    async function load() {
      const json = async name => { const r = await fetch("./data/" + name + ".json", { cache: "no-cache" }); if (!r.ok) throw Error("資料を読み込めません。通信状態を確認して再試行してください。"); return r.json(); };
      try {
        const [knowledge, directory, research] = await Promise.all([json("fishing-knowledge-v11"), json("marinas"), json("fishing-research")]);
        corpus = { knowledge, directory, research };
        try { config = await json("chat-config-v11"); } catch { /* Offline reference lookup remains available. */ }
        if (config.enabled && C.safeURL(config.endpoint)) $("chatMode").value = "ai";
        $("chatError").textContent = ""; $("chatReload").hidden = true;
      } catch (e) { $("chatError").textContent = e.message; $("chatReload").hidden = false; }
      render();
    }
    function docs(ctx) {
      return C.documents({ ...ctx, ...corpus, marina: corpus.directory.marinas.find(m => m.id === ctx.marinaId) || ctx.marina });
    }
    async function submit(question) {
      const ctx = getContext(), id = ctx.marinaId, data = turn(id);
      if (!corpus || data.busy || controller) return;
      question = String(question || "").trim(); if (!question) return;
      if (question.length > 1000) { $("chatError").textContent = "質問は1000文字以内で入力してください。"; return; }
      const ai = $("chatMode").value === "ai";
      if (ai && (!config.enabled || !C.safeURL(config.endpoint) || !token)) { $("chatError").textContent = "AI相談には接続済みサービスとアクセスコードが必要です。"; return; }
      $("chatError").textContent = "";
      const history = data.messages.filter(m => m.role === "user" || m.kind === "AI相談").slice(-8).map(m => ({ role: m.role, content: m.text.slice(0, 4000) }));
      data.messages.push({ role: "user", text: question }); data.draft = ""; $("chatQuestion").value = ""; data.busy = true; render();
      let timeout;
      try {
        let result;
        if (ai) {
          controller = new AbortController(); render();
          timeout = setTimeout(() => controller.abort(), 65000);
          const r = await fetch(config.endpoint, { method: "POST", cache: "no-store", credentials: "omit", signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ question, marinaId: id, web: $("chatWeb").checked, history }) });
          const body = await r.json(); if (!r.ok) throw Error(body.error || "AIに接続できません。資料検索をご利用ください。");
          if (!Array.isArray(body.segments) || body.segments.some(s => typeof s.text !== "string") || typeof body.text !== "string") throw Error("回答の形式を確認できません。再試行してください。");
          result = { ...body, sources: Array.isArray(body.sources) ? body.sources : [] };
        } else {
          const last = data.messages.slice(0, -1).filter(m => m.role === "user").at(-1)?.text || "";
          result = C.localAnswer(question, docs(ctx), corpus.directory.marinas.find(m => m.id === id)?.name);
          if (!result.hits.length && last) result = C.localAnswer(last + " " + question, docs(ctx), ctx.marina?.name);
        }
        data.messages.push({ ...result, role: "assistant" });
      } catch (error) {
        data.messages.push({ role: "assistant", kind: "回答を取得できませんでした", text: error.name === "AbortError" ? "回答を中止しました。資料検索も利用できます。" : error.message });
      } finally {
        clearTimeout(timeout); controller = null; data.busy = false; render();
        if (current() === id && $("chatView").classList.contains("active")) $("chatBottom").scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
    $("chatForm").addEventListener("submit", e => { e.preventDefault(); submit($("chatQuestion").value); });
    $("chatQuestion").addEventListener("input", () => { turn(current()).draft = $("chatQuestion").value; });
    $("chatQuestion").addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.isComposing) { e.preventDefault(); submit(e.currentTarget.value); } });
    document.querySelectorAll("[data-chat-prompt]").forEach(b => b.addEventListener("click", () => submit(b.dataset.chatPrompt)));
    $("chatClear").addEventListener("click", () => { if (controller) return; conversations.delete(current()); $("chatQuestion").value = ""; render(); });
    $("chatCancel").addEventListener("click", () => controller?.abort());
    $("chatMode").addEventListener("change", render);
    $("chatToken").addEventListener("input", e => { token = e.currentTarget.value; });
    $("chatReload").addEventListener("click", load);
    document.addEventListener("sff-context-change", () => {
      if (!$("chatView").classList.contains("active")) return;
      render(); if (!initialized) { initialized = true; load(); }
    });
    render();
  }
  root.FishingChatUI = { mount };
})(window);
