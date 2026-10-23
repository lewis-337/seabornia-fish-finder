/* Regional discovery is a preview. Only the explicit open action changes workspace. */
window.SeaStyleDestinationUI = function (api) {
  "use strict";
  const M = SeaStyleMarinas,
    $ = (id) => document.getElementById(id),
    esc = api.esc;
  const modal = document.createElement("dialog");
  modal.id = "destinations";
  modal.className = "destinations";
  modal.setAttribute("aria-labelledby", "destinationTitle");
  modal.innerHTML = `<div class="destinationHeader"><div><small>SEA-STYLE · FIELD GUIDE</small><h2 id="destinationTitle">釣りたい魚から、次の海へ。</h2></div><button type="button" id="destinationClose" class="iconBtn" aria-label="行き先を探すを閉じる">×</button></div><div class="destinationBody"><div class="destinationFilters"><div class="regionSwitch" role="group" aria-label="地域"><button data-region="kanto">関東</button><button data-region="okinawa">沖縄</button><button data-region="all">すべて</button></div><div class="destinationFields"><label>狙いたい魚<select id="destinationFish"><option value="">魚種を指定しない</option></select></label><label>月<select id="destinationMonth">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}月</option>`).join("")}</select></label><label>釣り方<select id="destinationMethod"><option value="all">すべて</option><option value="bait">エサ釣り</option><option value="lure">ルアー</option></select></label></div><label class="uncertainToggle"><input type="checkbox" id="destinationUncertain" checked>釣り利用の確認が必要な拠点も表示</label></div><div class="destinationCountRow"><p id="destinationCount" class="destinationCount" role="status"></p><button type="button" class="ghostButton" id="clearDestinationFilters">条件をクリア</button></div><div class="destinationGrid"><div class="destinationMaps" id="destinationMaps"></div><div id="destinationList" class="destinationList"></div></div><section id="destinationPreview" class="destinationPreview" hidden tabindex="-1"></section><details class="directoryAudit"><summary>掲載範囲・34拠点の確認状況</summary><p>関東30・沖縄4拠点を確認。内水面・休止中・現在Jetのみの拠点は釣り候補から除外。現在の艇・航行条件・予約は公式ページで確認してください。</p><div id="directoryAudit"></div></details><section class="offlinePanel"><h3>すべての海を、オフラインでも</h3><p id="offlinePackStatus" role="status">保存状態を確認中…</p><progress id="offlinePackProgress" max="1" value="0" aria-label="全マリーナのオフライン保存"></progress><button type="button" id="retryMarinaPacks" class="ghostButton">保存を再確認</button><small>端末の容量やブラウザによる削除で再取得が必要な場合があります。予報の有効期限は別途確認してください。</small></section></div>`;
  document.body.append(modal);
  let publicDepths = {},
    registry = [],
    coast = [],
    fish = [],
    region = "kanto",
    selected = null,
    previousFocus = null,
    packBusy = false,
    packData = null;
  const extents = {
    kanto: [139.0, 35.0, 140.8, 36.45],
    okinawa: [127.35, 26.05, 128.05, 26.8],
  };
  function open(name) {
    if (!registry.length) {
      api.notify(
        "マリーナ一覧を読み込み中です。しばらくしてから再度お試しください。",
      );
      return;
    }
    if (name) {
      regionBounds.kanto = extents.kanto;
      regionBounds.okinawa = extents.okinawa;
      region = "all";
      $("destinationFish").value = name;
      $("destinationMonth").value = api.month();
    }
    previousFocus = document.activeElement;
    if (!modal.open) modal.showModal();
    render();
    $("destinationClose").focus();
  }
  function close() {
    modal.close();
    previousFocus?.focus({ preventScroll: true });
  }
  $("destinationClose").onclick = close;
  $("destinationBtn").onclick = () => open();
  modal.addEventListener("click", (e) => {
    const r = e.target.closest("[data-region]");
    if (r) {
      region = r.dataset.region;
      selected = null;
      render();
    }
    const marker = e.target.closest("[data-preview-marina]");
    if (marker) preview(marker.dataset.previewMarina);
    const reset = e.target.closest("[data-reset-region]");
    if (reset) {
      regionBounds[reset.dataset.resetRegion] =
        extents[reset.dataset.resetRegion];
      render();
    }
    const cluster = e.target.closest("[data-marina-cluster]");
    if (cluster) {
      const ms = registry.filter((m) =>
          cluster.dataset.marinaCluster.split(",").includes(m.id),
        ),
        which = cluster.dataset.clusterRegion;
      const xs = ms.map((m) => m.lng),
        ys = ms.map((m) => m.lat),
        dx = Math.max(0.0001, (Math.max(...xs) - Math.min(...xs)) * 0.3),
        dy = Math.max(0.0001, (Math.max(...ys) - Math.min(...ys)) * 0.3);
      regionBounds[which] = [
        Math.min(...xs) - dx,
        Math.min(...ys) - dy,
        Math.max(...xs) + dx,
        Math.max(...ys) + dy,
      ];
      render();
    }
  });
  [
    "destinationFish",
    "destinationMonth",
    "destinationMethod",
    "destinationUncertain",
  ].forEach(
    (id) =>
      ($(id).onchange = () => {
        selected = null;
        render();
      }),
  );
  $("clearDestinationFilters").onclick = () => {
    $("destinationFish").value = "";
    $("destinationMethod").value = "all";
    $("destinationMonth").value = api.month();
    $("destinationUncertain").checked = true;
    selected = null;
    render();
  };
  function filters() {
    return {
      region,
      fish: $("destinationFish").value,
      month: +$("destinationMonth").value,
      method: $("destinationMethod").value,
      uncertain: $("destinationUncertain").checked,
    };
  }
  const regionBounds = { ...extents };
  let mapObserver = null;
  function mapMarkup(which, rows) {
    const b = M.bounds(regionBounds[which]);
    const land = M.paths(coast, b)
      .map(
        (d) =>
          `<path d="${d}" fill="#e8eee5" stroke="#8baa9e" stroke-width="1.5"/>`,
      )
      .join("");
    return `<div class="regionalMap"><h3>${which === "kanto" ? "関東" : "沖縄本島"} <small>概略図・非航海用</small><button type="button" class="regionalReset" data-reset-region="${which}" aria-label="${which === "kanto" ? "関東" : "沖縄"}の地域全体を表示">全体 ⛶</button></h3><svg data-region-map="${which}" viewBox="0 0 1050 950" role="group" aria-label="${which === "kanto" ? "関東" : "沖縄"}のマリーナ。近接拠点の数字で拡大、一覧からも選べます"><rect width="1050" height="950" fill="#d5ebe9"/>${land}<g class="regionalPins"></g></svg></div>`;
  }
  function drawRegionalPins(rows) {
    $("destinationMaps")
      .querySelectorAll("svg[data-region-map]")
      .forEach((svg) => {
        const which = svg.dataset.regionMap,
          b = M.bounds(regionBounds[which]),
          r = svg.getBoundingClientRect();
        const scale = Math.max(0.001, Math.min(r.width / 1050, r.height / 950));
        const groups = M.clusters(
          rows.filter((m) => m.region === which),
          (m) => {
            const p = M.project(m, b);
            return { x: p.x * scale, y: p.y * scale };
          },
          54,
        );
        svg.querySelector(".regionalPins").innerHTML = groups
          .map((c) => {
            const attrs =
              c.rows.length > 1
                ? `data-cluster-region="${which}" data-marina-cluster="${c.rows.map((m) => m.id).join(",")}"`
                : `data-preview-marina="${c.rows[0].id}"`;
            return `<g transform="translate(${c.x / scale} ${c.y / scale})" role="button" tabindex="0" aria-label="${esc(c.rows.map((m) => m.shortName).join("・"))}" ${attrs}><circle r="${24 / scale}" fill="transparent"/><circle r="${16 / scale}" fill="${c.rows.some((m) => m.id === selected) ? "#b66c1b" : "#075e62"}" stroke="white" stroke-width="${3 / scale}"/><text y="${5 / scale}" text-anchor="middle" fill="white" font-size="${16 / scale}" font-weight="700">${c.rows.length > 1 ? c.rows.length : "⚓"}</text></g>`;
          })
          .join("");
        svg.querySelectorAll("[role=button]").forEach(
          (el) =>
            (el.onkeydown = (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
              }
            }),
        );
      });
  }

  function render() {
    const f = filters(),
      rows = M.destinations(registry, f);
    modal
      .querySelectorAll("[data-region]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.region === region)),
      );
    $("destinationCount").textContent =
      `${rows.length}拠点 · ${f.fish || "魚種指定なし"} · ${f.month}月${f.fish ? "（時期未掲載の案内も含む）" : ""}`;
    $("destinationMaps").innerHTML = (
      region === "all" ? ["kanto", "okinawa"] : [region]
    )
      .map((r) =>
        mapMarkup(
          r,
          rows.filter((m) => m.region === r),
        ),
      )
      .join("");
    drawRegionalPins(rows);
    mapObserver?.disconnect();
    mapObserver = new ResizeObserver(() => drawRegionalPins(rows));
    $("destinationMaps")
      .querySelectorAll("svg")
      .forEach((svg) => mapObserver.observe(svg));
    $("destinationList").innerHTML =
      rows
        .map(
          (m) =>
            `<article class="destinationCard ${m.id === selected ? "selected" : ""}" data-card="${m.id}"><div><span class="tag ${m.status === "verified" ? "" : "sand"}">${m.status === "verified" ? "釣り利用の案内あり" : "要確認"}</span><small>${m.region === "okinawa" ? "沖縄" : "関東"}</small></div><h3>${esc(m.name)}</h3><p>${m.matches.length ? [...new Set(m.matches.map((e) => e.fish))].map(esc).join("・") : "魚種別の公開情報は不足しています。"}</p><small>${m.matches.length}件の案内・記録（成功率ではありません）${m.matches.some((e) => !e.months?.length) ? " · 時期未掲載を含む" : ""}</small><p class="micro">${esc(m.reason)}</p><p class="micro">${m.matches.some((e) => e.kind === "report") ? "レンタル艇の記録" : m.matches.some((e) => e.kind === "guide") ? "公式の釣り案内" : m.matches.some((e) => e.kind === "reference") ? "周辺の参考記録" : "魚種別情報は要確認"}${
              m.matches.some((e) => e.date)
                ? " · 最新 " +
                  esc(
                    m.matches
                      .map((e) => e.date || "")
                      .sort()
                      .at(-1),
                  )
                : " · 釣行日不明"
            }<br>${m.groundIds.length}海域・水深は詳細で確認${m.boats.some((b) => b.bait === "prohibited") ? " · エサ禁止の艇あり" : ""}</p><a href="${esc(m.proof)}" target="_blank" rel="noopener">利用案内の出典 ↗</a><button class="ghostButton" type="button" data-preview-marina="${m.id}">場所と根拠を見る →</button></article>`,
        )
        .join("") ||
      '<div class="empty">この条件の公開情報がありません。魚種・月・釣り方を変えてお探しください。</div>';
    $("destinationPreview").hidden = true;
  }
  function preview(id) {
    const m = registry.find((m) => m.id === id);
    if (!m) return;
    selected = id;
    render();
    const entries = M.evidence(
      m,
      filters().fish,
      filters().month,
      filters().method,
    );
    const p = $("destinationPreview");
    p.hidden = false;
    p.innerHTML = `<div class="previewHeading"><div><span class="eyebrow">MARINA PREVIEW</span><h3>${esc(m.name)}</h3></div><button type="button" class="ghostButton" id="closeMarinaPreview">閉じる</button></div><p>${esc(m.reason)}</p><p>確認 ${esc(api.localTime(m.checkedAt))} · ${m.lecture ? "利用前講習の案内あり" : "講習条件は公式で確認"}</p><p class="micro">地図の海域は概略代表位置です。現在の航行可否は当日のマリーナ説明を確認してください。</p><button type="button" id="openMarinaWorkspace" class="primaryButton">このマリーナを開く</button><section id="previewGrounds"><h4>海域と参考水深</h4><p>公開海域を確認中…</p></section><div class="previewEvidence"><h4>魚種・時期の根拠</h4>${entries.length ? entries.map((e) => `<article><b>${esc(e.fish)}</b><p>${esc(e.date || "釣行日不明") + " · " + esc({ report: "レンタル釣果", guide: "公式案内", reference: "周辺の公開記録", candidate: "探索候補" }[e.kind] || "公開情報")} · ${e.months?.length ? e.months.map((m) => m + "月").join("・") : "時期未掲載"}</p><p>${esc(e.note || "")}<br><small>釣り方：${{ bait: "エサ釣り", lure: "ルアー", all: "複数の釣り方", unknown: "未掲載・要確認" }[e.method] || "未掲載・要確認"}</small></p><a href="${esc(e.source)}" target="_blank" rel="noopener">元の案内 ↗</a></article>`).join("") : '<p class="empty">魚種ごとの根拠は未確認です。出港地から釣果位置を推定しません。</p>'}</div><details><summary>航行範囲・利用条件</summary>${(m.rules || []).map((r) => `<p><b>${esc(r.scope)}</b><br>${esc(r.summary)}<br><a href="${esc(r.source)}" target="_blank" rel="noopener">公式の利用条件 ↗</a></p>`).join("")}</details><details><summary>クラブ艇別の条件（${m.boats.length}艇）</summary>${m.boats.map((b) => `<p><b>${esc(b.name)}</b><br>${esc(b.restrictions.join("・") || "釣り方の制限は個別確認")}<br><small>エサ：${{ allowed: "可の記載あり", prohibited: "禁止", unknown: "要確認" }[b.bait]} / ルアー：${b.lure === "allowed" ? "可の記載あり" : "要確認"}</small></p>`).join("")}</details><p><a href="${esc(m.source)}" target="_blank" rel="noopener">公式の艇・航行範囲・予約案内 ↗</a></p>`;
    previewGrounds(m).catch(() => {
      if (selected === m.id && $("previewGrounds"))
        $("previewGrounds").innerHTML =
          "<h4>海域と参考水深</h4><p>海域データを取得できません。端末の保存状況をご確認ください。</p>";
    });
    $("closeMarinaPreview").onclick = () => {
      selected = null;
      render();
      const card = $("destinationList").querySelector(
        '[data-card="' + id + '"]',
      );
      card?.scrollIntoView({ block: "center" });
      card?.querySelector("button")?.focus({ preventScroll: true });
    };
    $("openMarinaWorkspace").onclick = async () => {
      const b = $("openMarinaWorkspace");
      b.disabled = true;
      b.textContent = "読み込み中…";
      try {
        await api.switchMarina(m, filters().fish);
        close();
      } catch (e) {
        b.disabled = false;
        b.textContent = "このマリーナを開く";
        api.notify(e.message);
      }
    };
    p.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    p.focus({ preventScroll: true });
  }
  async function previewGrounds(m) {
    const response = await fetch("./data/marinas/" + m.id + ".json");
    if (!response.ok) throw Error("HTTP");
    const pack = await response.json();
    if (selected !== m.id || !modal.open) return;
    if (pack.marinaId !== m.id || !Array.isArray(pack.areas))
      throw Error("pack");
    let speed = null;
    try {
      speed = SeaborniaTrip.speed(
        JSON.parse(
          localStorage.getItem(
            m.id === M.HOME ? "seabornia-trip-v1" : "seabornia-trip-v1:" + m.id,
          ),
        )?.speed,
      );
    } catch {}
    const selectedFish = $("destinationFish").value;
    const areas = pack.areas.filter(
      (a) =>
        !selectedFish ||
        a.target_fish?.includes(selectedFish) ||
        (m.evidence || []).some(
          (e) => e.fish === selectedFish && e.groundId === a.id,
        ),
    );
    $("previewGrounds").innerHTML =
      "<h4>海域と参考水深</h4>" +
      (areas.length
        ? areas
            .map((a) => {
              const distance = SeaborniaTrip.distance(a, m),
                eta = SeaborniaTrip.eta(distance, speed);
              return `<article class="fishAreaRow"><b>${esc(a.name)}</b><p>直線 ${distance.toFixed(1)}km · ${eta ? "約" + eta.minutes + "分（" + speed + " kn）" : "船速未設定"}<br>代表位置付近の参考水深：${esc(SeaborniaDiscovery.depthLabel(publicDepths[a.id]))}</p><small>概略代表位置・非航海用。距離は実際の航走距離ではありません。</small>${a.source ? `<p><a href="${esc(a.source)}" target="_blank" rel="noopener">海域の案内 ↗</a></p>` : ""}</article>`;
            })
            .join("")
        : '<p class="empty">公開情報から釣り海域の位置を特定できていません。出港地から釣果GPSは推定しません。</p>') +
      '<p class="micro">参考水深はGEBCO2026の格子モデル。潮位補正なし・海域全体の水深ではありません。</p>';
  }
  async function packs() {
    if (packBusy || !packData) return;
    packBusy = true;
    const status = $("offlinePackStatus"),
      bar = $("offlinePackProgress");
    if (!("caches" in window)) {
      status.textContent = "このブラウザではオフライン保存を利用できません。";
      packBusy = false;
      return;
    }
    let done = 0,
      failed = 0,
      index = 0;
    bar.max = packData.length;
    bar.value = 0;
    const cache = await caches.open("seabornia-marina-packs-v8");
    async function worker() {
      while (index < packData.length) {
        const file = packData[index++],
          url = new URL(file, location.href).href;
        try {
          const old = await cache.match(url);
          if (!old || file.endsWith(".json")) {
            const controller = new AbortController(),
              timer = setTimeout(() => controller.abort(), 10000);
            let r;
            try {
              r = await fetch(url, {
                cache: "no-cache",
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timer);
            }
            if (!r.ok) throw Error("HTTP");
            if (file.endsWith(".json")) {
              const j = await r.clone().json();
              if (!j || typeof j !== "object") throw Error("JSON");
            }
            await cache.put(url, r);
          }
        } catch {
          failed++;
        }
        done++;
        bar.value = done;
        status.textContent = `保存確認 ${done}/${packData.length}${failed ? " · 未完了 " + failed + "件" : ""}`;
      }
    }
    try {
      await Promise.all([worker(), worker(), worker()]);
      status.textContent = failed
        ? `未完了 ${failed}件。接続・空き容量を確認し、再確認してください。`
        : "全マリーナの地図・公開データを保存済み。予報の期限は海況で確認してください。";
    } finally {
      packBusy = false;
    }
  }
  $("retryMarinaPacks").onclick = () => packs();
  async function load() {
    const results = await Promise.all(
      [
        "marinas",
        "marina-evidence",
        "coast-regions",
        "offline-packs",
        "area_depths",
      ].map(async (n) => {
        const r = await fetch("./data/" + n + ".json");
        if (!r.ok)
          throw Error(
            "マリーナ一覧を取得できません。接続して再読み込みしてください。",
          );
        return r.json();
      }),
    );
    registry = results[0].marinas;
    publicDepths = results[4].areas || {};
    fish = results[1].species;
    coast = results[2].geometries;
    packData = results[3].assets;
    $("destinationMonth").value = api.month();
    const names = [
      ...new Set([
        ...api.speciesNames(fish),
        ...registry.flatMap((m) => (m.evidence || []).map((e) => e.fish)),
      ]),
    ].sort((a, b) => a.localeCompare(b, "ja"));
    $("destinationFish").innerHTML =
      '<option value="">魚種を指定しない</option>' +
      names.map((n) => `<option>${esc(n)}</option>`).join("");
    $("directoryAudit").innerHTML = registry
      .map(
        (m) =>
          `<p><b>${esc(m.name)}</b> · ${{ verified: "釣り案内あり", unconfirmed: "要確認", excluded: "対象外" }[m.status]}<br><small>${esc(m.reason)}</small> <a href="${esc(m.source)}" target="_blank" rel="noopener">公式 ↗</a></p>`,
      )
      .join("");
    api.ready({ registry, extraSpecies: fish, coast });
    packs().catch(() => {
      packBusy = false;
      $("offlinePackStatus").textContent =
        "保存を完了できません。再確認してください。";
    });
  }
  return {
    open,
    load,
    registry: () => registry,
    coast: () => coast,
    refreshOffline: packs,
  };
};
