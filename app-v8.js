(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    S = JSON.parse($("seed").textContent),
    COAST = JSON.parse($("coast").textContent);
  const M = SeaStyleMarinas;
  let db = S,
    marinaId = M.HOME,
    activeMarina = null,
    destinationUI = null,
    extraSpecies = [],
    regionalCoast = [],
    draftPhoto = "",
    switching = false;
  let workspaces = {
    schema_version: 1,
    activeMarinaId: M.HOME,
    workspaces: {},
  };
  try {
    const v = JSON.parse(localStorage.getItem(M.KEY));
    if (v?.schema_version === 1 && v.workspaces) workspaces = v;
  } catch {}
  let contextWritable = workspaces.activeMarinaId === M.HOME;
  const mapBounds = () =>
    M.bounds(activeMarina?.bounds || [139.51, 35.07, 139.72, 35.29]);
  const EXTRAKEY = "seabornia-marina-records-v1";
  function extraRecords() {
    try {
      const v = JSON.parse(localStorage.getItem(EXTRAKEY));
      if (v && Array.isArray(v.waypoints) && Array.isArray(v.catches)) return v;
    } catch {}
    return { waypoints: [], catches: [] };
  }
  const pointRows = () => [...readLocal(MEMKEY), ...extraRecords().waypoints],
    catchRows = () => [...readLocal(CATCHKEY), ...extraRecords().catches];
  const workspace = () =>
    workspaces.workspaces[marinaId] || M.defaultWorkspace();
  let workspaceTimer;
  function deferWorkspace() {
    clearTimeout(workspaceTimer);
    workspaceTimer = setTimeout(() => saveWorkspace(), 350);
  }
  function saveWorkspace() {
    if (switching || !contextWritable) return true;
    const fields = {};
    document
      .querySelectorAll(
        "#logView input:not([type=file]),#logView textarea,#logView select,#conditionsApp input,#conditionsApp select,#conditionsExplorer input,#conditionsExplorer select",
      )
      .forEach((e) => {
        if (e.id) fields[e.id] = e.value;
      });
    const scroll = {};
    document
      .querySelectorAll(".scrollScreen")
      .forEach((e) => (scroll[e.id] = e.scrollTop));
    const next = {
      ...workspaces,
      activeMarinaId: marinaId,
      workspaces: {
        ...workspaces.workspaces,
        [marinaId]: {
          state: { ...state, loading: false, area: null },
          view: mapCamera?.viewBox(),
          favs: [...favs],
          fields,
          scroll,
          draftPhoto,
          trip: tripUI?.preferences(),
        },
      },
    };
    try {
      localStorage.setItem(M.KEY, JSON.stringify(next));
      workspaces = next;
      return true;
    } catch {
      notify("画面・下書きを保存できません。空き容量を確認してください。");
      return false;
    }
  }
  function restoreWorkspace() {
    const w = workspace();
    if (w.state) {
      for (const k of [
        "year",
        "month",
        "group",
        "q",
        "squid",
        "nov",
        "range",
        "layer",
        "areaFilter",
        "reportArea",
        "reportMode",
      ])
        if (k in w.state)
          state[k] =
            k === "range" && w.state[k] === null ? Infinity : w.state[k];
    }
    favs = new Set(marinaId === M.HOME ? readLocal(FAVKEY) : w.favs || []);
    draftPhoto = w.draftPhoto || "";
    for (const [id, value] of Object.entries(w.fields || {})) {
      const e = $(id);
      if (e && e.type !== "file") e.value = value;
    }
    for (const id of ["year", "mobileYear"]) $(id).value = state.year;
    for (const id of ["month", "mobileMonth"]) $(id).value = state.month;
    $("groupFilter").value = state.group;
    $("mobileGroup").value = state.group;
    $("speciesSearch").value = state.q;
    $("squidOnly").setAttribute("aria-pressed", String(state.squid));
    $("novOnly").setAttribute("aria-pressed", String(state.nov));
    $("novOnly").textContent = state.month + "月の候補";
    if (w.view?.every(Number.isFinite)) {
      state.view = w.view;
      constrain();
      redrawMap();
    } else fitMap();
    for (const [id, top] of Object.entries(w.scroll || {}))
      if ($(id)) $(id).scrollTop = top;
    updateDraftPhoto();
  }
  function updateDraftPhoto() {
    let el = $("draftPhotoStatus");
    if (!el) {
      el = document.createElement("p");
      el.id = "draftPhotoStatus";
      el.className = "micro";
      $("catchPhoto").after(el);
    }
    el.textContent = draftPhoto
      ? "写真の下書きを保持しています。別の写真を選ぶと置き換えます。"
      : "";
  }
  function drawCoast() {
    if (!regionalCoast.length) return;
    $("coastPaths").innerHTML = "";
    const paths =
      marinaId === M.HOME
        ? COAST.map((d) =>
            d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => {
              const p = M.project(
                {
                  lng: 139.51 + (+x / 1050) * 0.21,
                  lat: 35.29 - (+y / 950) * 0.22,
                },
                mapBounds(),
              );
              return p.x.toFixed(2) + " " + p.y.toFixed(2);
            }),
          )
        : M.paths(regionalCoast, mapBounds());
    for (const d of paths)
      se(
        "path",
        { d, class: "landPath", "fill-rule": "evenodd" },
        $("coastPaths"),
      );
    $("mapDecor").innerHTML = "";
    $("oceanSVG").setAttribute(
      "aria-label",
      (activeMarina?.name || "シーボニア") +
        "周辺の概略地図。航海用ではありません",
    );
  }
  async function switchMarina(m, fishName) {
    if (switching) return;
    if ($("catchForm").querySelector("[type=submit]").disabled)
      throw Error("釣果の保存が完了してから切り替えてください。");
    if (!saveWorkspace())
      throw Error("現在の下書きを保存できないため切り替えを中断しました。");
    const response = await fetch("./data/marinas/" + m.id + ".json", {
      cache: "no-cache",
    });
    if (!response.ok)
      throw Error(
        "このマリーナを読み込めません。接続・保存状況を確認してください。",
      );
    const pack = await response.json();
    if (
      pack.marinaId !== m.id ||
      !Array.isArray(pack.areas) ||
      !Array.isArray(pack.reports)
    )
      throw Error("マリーナデータを確認できません。");
    switching = true;
    closeModal();
    closeSheet();
    closeMapPanels();
    setMarking(false);
    gpsNow = null;
    marinaId = m.id;
    activeMarina = m;
    db =
      m.id === M.HOME
        ? {
            ...S,
            marina: { ...S.marina, name: m.name, lat: m.lat, lng: m.lng },
            species: [...S.species, ...extraSpecies],
          }
        : {
            ...S,
            marina: { id: "marina", name: m.name, lat: m.lat, lng: m.lng },
            species: [...S.species, ...extraSpecies],
            areas: pack.areas,
            reports: pack.reports,
            last_success: pack.last_success,
            source_status: pack.source_status || [],
          };
    if (m.id === M.HOME) {
      try {
        const r = await fetch("./data/latest.json");
        if (r.ok) {
          const j = await r.json();
          if (validData(j))
            db = {
              ...db,
              ...j,
              marina: db.marina,
              species: [...S.species, ...extraSpecies],
            };
        }
      } catch {}
    }
    myPoints = M.mine(pointRows(), marinaId);
    myCatches = M.mine(catchRows(), marinaId);
    Object.assign(state, {
      area: null,
      areaFilter: null,
      reportArea: null,
      q: "",
      squid: false,
      nov: false,
      group: "all",
      layer: "spots",
      reportMode: "recent",
    });
    $("catchForm").reset();
    $("catchDate").value = dateJst();
    for (const id of ["pointTitle", "pointLat", "pointLon"]) $(id).value = "";
    $("activeMarinaName").textContent =
      m.id === M.HOME ? "シーボニア" : m.shortName;
    $("destinationBtn").setAttribute(
      "aria-label",
      "行き先を探す・出港地を変更：" + m.name,
    );
    document
      .querySelectorAll('#planView a[href*="/marinacd/J14-0170"]')
      .forEach((a) => (a.href = m.source));
    $("recordMarina").textContent = "記録先：" + m.name;
    document.querySelector(".sideFoot p").textContent =
      m.name + " · 各海域までの距離は直線参考値です。";
    $("gebcoImageGroup").innerHTML = "";
    bathyAttempt++;
    bathyOk = false;
    bathyTried = false;
    drawCoast();
    refreshAreaMenu();
    renderUserLogs();
    tripUI?.switchMarina(marinaId);
    restoreWorkspace();
    if (fishName) {
      state.q = fishName;
      $("speciesSearch").value = fishName;
    }
    renderSpecies();
    renderReports();
    renderPlan();
    drawSpots();
    setLayer(state.layer);
    nav("map");
    if (!db.areas.length)
      message(
        "公開釣り海域は未確認です。保存ポイントはこのマリーナ専用に登録できます。",
      );
    switching = false;
    contextWritable = true;
    saveWorkspace();
    tripUI?.load();
  }

  let tripUI = null;
  let areaDepths = { areas: {} },
    fishAreas = { links: [] },
    areaPicker = null,
    activeFish = null;
  const discovery = () => SeaborniaDiscovery.associations(db, fishAreas);
  const areaFishIds = (id) =>
    new Set(
      discovery()
        .filter((r) => r.areaId === id)
        .map((r) => r.fishId),
    );
  function depthText(id) {
    return SeaborniaDiscovery.depthLabel(areaDepths.areas?.[id]);
  }
  function depthHTML(id) {
    const row = areaDepths.areas?.[id];
    return `<div class="areaDepth"><b>代表位置付近の参考水深：${depthText(id)}</b><small>GEBCO2026・約400〜500m格子のモデル値。海域全体の水深・実測値ではありません。潮位補正なし・航海用不可。</small><details><summary>水深の出典・採用位置</summary><p>${row ? `格子中心 ${row.sample_lat.toFixed(5)}, ${row.sample_lng.toFixed(5)} ／ 取得 ${esc(localTime(row.fetched_at))}` : "水深データを取得できていません。"}</p><a href="https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid" target="_blank" rel="noopener">GEBCO2026・出典 ↗</a></details></div>`;
  }
  async function loadDiscovery() {
    await Promise.allSettled(
      [
        [
          "area_depths",
          (v) => {
            if (
              v.release === "GEBCO2026" &&
              v.areas &&
              typeof v.areas === "object"
            ) {
              const valid = Object.fromEntries(
                Object.entries(v.areas).filter(
                  ([id, r]) =>
                    r &&
                    [r.elevation_m, r.sample_lat, r.sample_lng].every(
                      (n) => typeof n === "number" && Number.isFinite(n),
                    ) &&
                    Math.abs(r.sample_lat) <= 90 &&
                    Math.abs(r.sample_lng) <= 180,
                ),
              );
              areaDepths = { ...v, areas: { ...areaDepths.areas, ...valid } };
            }
          },
        ],
        [
          "fish_areas",
          (v) => {
            if (Array.isArray(v.links)) fishAreas = v;
          },
        ],
      ].map(async ([name, save]) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const response = await fetch(`./data/${name}.json`, {
              cache: "no-cache",
              signal: controller.signal,
            });
            if (response.ok) save(await response.json());
          } finally {
            clearTimeout(timer);
          }
        } catch {}
      }),
    );
    refreshAreaMenu();
    renderSpecies();
    if (activeFish && !$("modal").hidden) renderFishAreas(activeFish);
    if (state.area && !areaPicker && !$("selectedSheet").hidden) {
      const depth = $("selectedSheet").querySelector("[data-area-depth]");
      if (depth) depth.innerHTML = depthHTML(state.area);
    }
  }
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const dateJst = () =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  let today = dateJst();
  const year = Number(today.slice(0, 4)),
    month = Number(today.slice(5, 7));
  const state = {
    year,
    month,
    areaFilter: null,
    reportArea: null,
    reportMode: "recent",
    tab: "map",
    group: "all",
    q: "",
    squid: false,
    nov: false,
    range: 30,
    layer: "spots",
    area: null,
    view: [0, 0, 1050, 950],
    loading: false,
  };
  const FAVKEY = "seabornia-favs-v3";
  let favs = new Set();
  try {
    favs = new Set(JSON.parse(localStorage.getItem(FAVKEY) || "[]"));
  } catch {}
  const NS = "http://www.w3.org/2000/svg";
  function se(tag, attrs = {}, parent) {
    const x = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, v);
    if (parent) parent.append(x);
    return x;
  }
  function km(a) {
    const b = db.marina,
      R = Math.PI / 180,
      dlat = (a.lat - b.lat) * R,
      dlng = (a.lng - b.lng) * R,
      z =
        Math.sin(dlat / 2) ** 2 +
        Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dlng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z));
  }
  function proj(a) {
    return M.project(a, mapBounds());
  }
  const matchedGroup = (f) =>
    state.group === "all" ||
    (state.group === "イカ" ? f.group === "イカ" : state.group === f.group);
  const recent = (r) => /^20\d\d-\d\d-\d\d$/.test(r.date || "");
  function daysAgo(r) {
    return (
      (Date.parse(today + "T12:00:00+09:00") -
        Date.parse(r.date + "T12:00:00+09:00")) /
      86400000
    );
  }
  const reports = () =>
    [...db.reports].filter(recent).sort((a, b) => b.date.localeCompare(a.date));
  function nav(tab) {
    if (areaPicker && tab !== "map") finishAreaPicker(false, false);
    state.tab = tab;
    if (tab !== "map") $("mapMessage").hidden = true;
    document
      .querySelectorAll(".screen")
      .forEach((s) => s.classList.toggle("active", s.id === tab + "View"));
    document.querySelectorAll(".nav").forEach((n) => {
      n.classList.toggle("active", n.dataset.tab === tab);
      if (n.dataset.tab === tab) n.setAttribute("aria-current", "page");
      else n.removeAttribute("aria-current");
    });
    document.querySelector(".mobileFilters").hidden = ![
      "species",
      "latest",
    ].includes(tab);
    $("app").dataset.screen = tab;
    if (tab === "map") requestAnimationFrame(() => resizeMap());
    if (tab === "plan") tripUI?.render();
    if (tab === "latest") tripUI?.renderExplorer();
  }

  function initControls() {
    const yy = $("year"),
      my = $("mobileYear");
    for (let y = 2024; y <= year + 1; y++)
      for (const sel of [yy, my])
        sel.insertAdjacentHTML(
          "beforeend",
          `<option value="${y}">${y}年</option>`,
        );
    const mm = $("month"),
      mmob = $("mobileMonth");
    for (let m = 1; m <= 12; m++)
      for (const sel of [mm, mmob])
        sel.insertAdjacentHTML(
          "beforeend",
          `<option value="${m}">${m}月</option>`,
        );
    function setPeriod(y, m) {
      state.year = +y;
      state.month = +m;
      if (state.tab === "latest") state.reportMode = "month";
      try {
        localStorage.setItem(
          "seabornia-period-v1",
          JSON.stringify({ year: state.year, month: state.month }),
        );
      } catch {}
      $("novOnly").textContent = state.month + "月の候補";
      for (const sel of [yy, my]) sel.value = String(state.year);
      for (const sel of [mm, mmob]) sel.value = String(state.month);
      renderReports();
      renderSpecies();
    }
    setPeriod(state.year, state.month);
    for (const sel of [yy, my])
      sel.addEventListener("change", () => setPeriod(sel.value, state.month));
    for (const sel of [mm, mmob])
      sel.addEventListener("change", () => setPeriod(state.year, sel.value));
    for (const id of ["groupFilter", "mobileGroup"])
      $(id).addEventListener("change", (e) => {
        state.group = e.target.value;
        for (const key of ["groupFilter", "mobileGroup"])
          $(key).value = state.group;
        renderSpecies();
        renderReports();
        drawSpots();
      });
    document
      .querySelectorAll(".nav")
      .forEach((b) => b.addEventListener("click", () => nav(b.dataset.tab)));
    $("speciesSearch").addEventListener("input", (e) => {
      state.q = e.target.value.trim().toLowerCase();
      renderSpecies();
    });
    $("clearAreaFilter").onclick = () => {
      state.areaFilter = null;
      renderSpecies();
    };
    $("speciesArea").onchange = (e) => {
      state.areaFilter = e.target.value || null;
      renderSpecies();
    };
    $("pickSpeciesArea").onclick = beginAreaPicker;
    $("squidOnly").onclick = () => {
      state.squid = !state.squid;
      $("squidOnly").classList.toggle("active", state.squid);
      $("squidOnly").setAttribute("aria-pressed", String(state.squid));
      renderSpecies();
    };
    $("novOnly").onclick = () => {
      state.nov = !state.nov;
      $("novOnly").classList.toggle("active", state.nov);
      $("novOnly").setAttribute("aria-pressed", String(state.nov));
      renderSpecies();
    };
    document.querySelectorAll(".rangeBtn").forEach((b) =>
      b.addEventListener("click", () => {
        state.range =
          b.dataset.days === "all" ? Infinity : Number(b.dataset.days);
        document.querySelectorAll(".rangeBtn").forEach((x) => {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        });
        renderReports();
      }),
    );
    document
      .querySelectorAll(".layer")
      .forEach((b) =>
        b.addEventListener("click", () => setLayer(b.dataset.layer)),
      );
    $("refreshBtn").onclick = () => updateData(true);
    $("checkUpdate").onclick = () => updateData(true);
    $("modalClose").onclick = () => closeModal();
    $("modal").onclick = (e) => {
      if (e.target === $("modal")) closeModal();
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && areaPicker) {
        finishAreaPicker(false);
        return;
      }
      if (
        e.key === "Escape" &&
        !$("modal").hidden &&
        !$("photoViewer").open &&
        !$("actionDialog").open
      )
        closeModal();
    });
  }
  function seasonMonths(f) {
    if (marinaId === M.HOME) return f.months;
    return [
      ...new Set(
        (activeMarina?.evidence || [])
          .filter((e) => e.fish === f.name)
          .flatMap((e) => e.months || []),
      ),
    ];
  }
  function filteredFish() {
    const allowed = state.areaFilter ? areaFishIds(state.areaFilter) : null;
    return db.species
      .filter(
        (f) =>
          (!allowed || allowed.has(f.id)) &&
          matchedGroup(f) &&
          (!state.squid || f.group === "イカ") &&
          (!state.nov || seasonMonths(f).includes(state.month)) &&
          (!state.q ||
            [f.name, f.aliases || "", f.habitat, f.method]
              .join(" ")
              .toLowerCase()
              .includes(state.q)),
      )
      .sort((a, b) => {
        const am = seasonMonths(a).includes(state.month) ? 1 : 0,
          bm = seasonMonths(b).includes(state.month) ? 1 : 0;
        return bm - am || Number(a.id) - Number(b.id);
      });
  }
  function renderSpecies() {
    const banner = $("areaFilterBanner");
    banner.hidden = !state.areaFilter;
    const area = db.areas.find((a) => a.id === state.areaFilter);
    if (area)
      $("areaFilterText").textContent =
        area.name + "の魚種（公開記録・探索候補）";
    $("speciesArea").innerHTML =
      '<option value="">すべての海域</option>' +
      db.areas
        .map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)
        .join("");
    $("speciesArea").value = area?.id || "";
    let list = filteredFish();
    if (activeMarina && marinaId !== M.HOME) {
      const names = new Set((activeMarina.evidence || []).map((e) => e.fish));
      list = list.filter(
        (f) =>
          names.has(f.name) ||
          SeaborniaDiscovery.associations(db, fishAreas).some(
            (a) => a.fishId === f.id,
          ),
      );
    }
    $("speciesCount").textContent = list.length + "項目";
    $("fishGrid").innerHTML =
      list
        .map(
          (f) =>
            `<button class="fishCard" data-id="${f.id}" aria-label="${esc(f.name)}の詳細"><div class="fishImg"><div class="fishFallback">${f.icon}</div><img data-photo="${f.id}" alt="${esc(f.name)}の参考写真" loading="lazy" hidden>${seasonMonths(f).includes(state.month) ? '<span class="monthBadge">' + state.month + "月候補</span>" : ""}</div><div class="fishCardBody"><strong>${esc(f.name)}</strong><small>${esc(f.group)} ／ ${esc(f.depth)}</small><p>${esc(f.habitat)}</p></div></button>`,
        )
        .join("") || '<div class="empty">一致する魚種がありません。</div>';
    $("fishGrid")
      .querySelectorAll(".fishCard")
      .forEach((b) =>
        b.addEventListener("click", () =>
          openFish(db.species.find((f) => f.id === b.dataset.id)),
        ),
      );
    injectPhotos($("fishGrid"));
    photoStatusText();
  }
  function openFish(f) {
    activeFish = f;
    const records = reports().filter((r) => {
      const ids = SeaborniaDiscovery.speciesIn(r.fish, db.species);
      return (
        ids.includes(f.id) ||
        (f.name === "カンパチ" &&
          ids.includes(db.species.find((x) => x.name === "ショゴ")?.id))
      );
    });
    $("modalContent").innerHTML =
      `<button class="modalHero" type="button" aria-label="参考写真を拡大"><div>${f.icon}</div><img data-photo="${f.id}" alt="${esc(f.name)}の参考写真" hidden></button><div class="modalBody"><span class="eyebrow">SPECIES ${esc(f.group)}</span><h2>${esc(f.name)}</h2><div class="sheetTags"><span class="tag">${state.month}月 ${seasonMonths(f).includes(state.month) ? "狙い目候補" : "地域の時期は未確認"}</span><span class="tag">登録釣果 ${records.length}件</span></div><section id="fishAreas" class="fishAreas" aria-label="この魚を探せる海域"></section><div class="modalKv"><div><small>主な水深帯の目安</small><b>${esc(f.depth)}</b></div><div><small>底質・地形</small><b>${esc(f.habitat)}</b></div><div><small>釣り方</small><b>${esc(f.method)}</b></div><div><small>目安の月</small><b>${seasonMonths(
        f,
      )
        .map((m) => m + "月")
        .join("・")}</b></div></div><p>${esc(f.note)}</p><p>関連釣果：${
        records.length
          ? records
              .slice(0, 4)
              .map((r) => esc(r.date + " " + r.source_name))
              .join(" / ")
          : "掲載済みの個別釣果なし"
      }</p><div class="sheetButtons"><a class="ghostButton" href="https://ja.wikipedia.org/wiki/${encodeURIComponent(f.wiki)}" target="_blank" rel="noopener">魚の写真・資料 ↗</a></div><p class="sourceLine">魚の写真はオンライン配信。写真の個体は現地釣果ではありません。画像権利は各出典に帰属します。水深帯は一般的目安です。</p></div>`;
    appendPhotoCredit(f);
    showFishModal();
    injectPhotos($("modalContent"));
    renderFishAreas(f);
  }
  function renderFishAreas(f) {
    const rows = discovery()
      .filter((r) => r.fishId === f.id)
      .map((r) => ({ ...r, area: db.areas.find((a) => a.id === r.areaId) }))
      .sort((a, b) => km(a.area) - km(b.area));
    $("fishAreas").innerHTML =
      `<h3>このマリーナから狙える場所</h3><p>${esc(db.marina.name)}から近い順。公開記録は過去の実績、探索候補は釣果の保証ではありません。</p><button type="button" class="ghostButton" id="otherMarinasForFish">ほかのマリーナから探す →</button>` +
      (rows.length
        ? rows
            .map((r) => {
              const evidence = [...r.evidence].sort(
                (a, b) => (b.kind === "report") - (a.kind === "report"),
              );
              return `<article class="fishAreaRow"><div><strong>${esc(r.area.name)}</strong><span class="tag ${evidence[0].kind === "report" ? "" : "sand"}">${evidence[0].kind === "report" ? "公開記録あり" : "探索候補"}</span></div><p>直線 ${km(r.area).toFixed(1)}km · ${tripUI?.travel(r.area, true) || "船速未設定"}</p><p>代表位置付近の参考水深：${depthText(r.areaId)}</p><button class="primaryButton" data-fish-area="${esc(r.areaId)}">地図で見る</button><details><summary>根拠・出典を見る</summary>${evidence.map((e) => `<p>${e.date ? esc(e.date) + " ／ " : e.period ? esc(e.period) + "掲載対象月（釣行日不明） ／ " : ""}${esc(e.rationale || e.label)}${e.depth && /[0-9０-９]/.test(e.depth) ? "<br>記録に記載の水深：" + esc(e.depth) + "（代表位置のモデル値とは別）" : ""}${e.source ? `<br><a href="${esc(e.source)}" target="_blank" rel="noopener">${esc(e.label || "公開元")} ↗</a>` : ""}</p>`).join("")}</details></article>`;
            })
            .join("")
        : '<div class="empty">海域未確認。このマリーナの海域に結び付く公開情報をまだ確認できていません。出港した港から釣れた場所は推定しません。</div>') +
      '<p class="sourceLine">参考水深はGEBCO2026の格子モデル。魚の一般的な生息水深や釣果記載の水深とは異なります。</p>';
    $("otherMarinasForFish").onclick = () => {
      closeModal();
      destinationUI?.open(f.name);
    };
    $("fishAreas")
      .querySelectorAll("[data-fish-area]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            closeModal();
            nav("map");
            setLayer("spots");
            selectArea(b.dataset.fishArea);
          }),
      );
  }
  function closeModal() {
    hideFishModal();
  }
  let mapCamera = null,
    mapBinding = null,
    mapResize = null,
    sheetFocus = null;
  function makeMap() {
    const base = $("coastPaths");
    COAST.forEach((d) => se("path", { d, class: "landPath" }, base));
    const dec = $("mapDecor");
    for (const [text, x, y, cls] of [
      ["SAGAMI BAY", 168, 500, "seaText"],
      ["三浦半島", 760, 250, "landText"],
      ["諸磯", 685, 603, "landText"],
      ["城ヶ島", 527, 725, "landText"],
    ]) {
      se("text", { x, y, class: cls }, dec).textContent = text;
    }
    const svg = $("oceanSVG"),
      r = svg.getBoundingClientRect();
    mapCamera = new SeaborniaGestures.Camera(r.width, r.height);
    mapBinding = SeaborniaGestures.bind(svg, mapCamera, {
      render: redrawMap,
      tap: (p, target) => {
        if (areaPicker && !target.closest("[data-area]")) return;
        if (markingMode) {
          const v = mapCamera.point(p.x, p.y);
          if (v.x < 0 || v.x > 1050 || v.y < 0 || v.y > 950) return;
          beginWaypoint({
            ...M.unproject(v, mapBounds()),
            precision: "概略図からの手動指定・実測GPSではない",
          });
          return;
        }
        if (target.closest("[data-area]")) {
          selectArea(target.closest("[data-area]").dataset.area);
          return;
        }
        if (target.closest("[data-point]")) {
          const wp = myPoints.find(
            (w) => w.id === target.closest("[data-point]").dataset.point,
          );
          if (wp) openPoint(wp);
          return;
        }
      },
      doubleTap: (p) => {
        if (markingMode) {
          const v = mapCamera.point(p.x, p.y);
          if (
            v.x >= 0 &&
            v.x <= 1050 &&
            v.y >= 0 &&
            v.y <= 950 &&
            !$("actionDialog").open
          )
            beginWaypoint({
              ...M.unproject(v, mapBounds()),
              precision: "概略図からの手動指定・実測GPSではない",
            });
          return;
        }
        if (!markingMode) {
          mapCamera.zoom(0.5, p.x, p.y);
          redrawMap();
        }
      },
    });
    $("zoomIn").onclick = () => zoom(0.7);
    $("zoomOut").onclick = () => zoom(1 / 0.7);
    $("zoomHome").onclick = fitMap;
    mapResize = new ResizeObserver(() => {
      if (state.tab === "map") resizeMap();
    });
    mapResize.observe(svg);
    fitMap();
    drawSpots();
  }
  function sizeMapSheet() {
    const shell = document.querySelector(".mapShell"),
      r = $("oceanSVG").getBoundingClientRect();
    const controls = [
      document.querySelector(".mapToolbar"),
      document.querySelector(".maptools"),
    ].map((e) => e.getBoundingClientRect());
    shell.style.setProperty(
      "--sheet-space",
      Math.max(
        120,
        r.bottom - Math.max(...controls.map((b) => b.bottom)) - 56,
      ) + "px",
    );
  }
  function resizeMap() {
    if (!mapCamera) return;
    const r = $("oceanSVG").getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    mapCamera.resize(r.width, r.height);
    sizeMapSheet();
    redrawMap();
    if (sheetFocus && !$("selectedSheet").hidden) sheetFocus();
  }
  function fitMap() {
    if (!mapCamera) return;
    resizeMap();
    const controls = document
      .querySelector(".mapToolbar")
      .getBoundingClientRect();
    const top =
      controls.bottom - $("oceanSVG").getBoundingClientRect().top + 28;
    mapCamera.fit([...db.areas, db.marina].map(proj), {
      top: Math.min(mapCamera.height * 0.45, Math.max(105, top)),
      right: 80,
      bottom: Math.min(
        mapCamera.height * 0.35,
        Math.max(
          85,
          mapCamera.height -
            (document.querySelector(".mapBottom").getBoundingClientRect().top -
              $("oceanSVG").getBoundingClientRect().top) +
            24,
        ),
      ),
      left: 45,
    });
    redrawMap();
  }
  function constrain() {
    if (!mapCamera) return;
    const v = state.view;
    mapCamera.x = v[0];
    mapCamera.y = v[1];
    mapCamera.scale = v[2] / mapCamera.width;
    mapCamera.constrain();
    state.view = mapCamera.viewBox();
  }
  function redrawMap() {
    if (!mapCamera) return;
    state.view = mapCamera.viewBox();
    $("oceanSVG").setAttribute("viewBox", state.view.join(" "));
    document
      .querySelectorAll("#spots [data-world-x]")
      .forEach((g) =>
        g.setAttribute(
          "transform",
          `translate(${g.dataset.worldX} ${g.dataset.worldY}) scale(${mapCamera.scale})`,
        ),
      );
    const draft = $("draftPin");
    if (draft) draft.setAttribute("r", 12 * mapCamera.scale);
  }
  function zoom(f) {
    if (!mapCamera) return;
    mapCamera.zoom(f);
    redrawMap();
  }
  function drawSpots() {
    const el = $("spots");
    el.innerHTML = "";
    const overlay = $("habitatOverlay");
    overlay.innerHTML = "";
    if (state.layer === "habitat")
      for (const a of db.areas) {
        const p = proj(a),
          rock = /岩礁|根/.test(a.seabed || ""),
          c = rock ? "#a86a36" : "#b59640";
        se(
          "circle",
          { cx: p.x, cy: p.y, r: 45, fill: c, opacity: 0.22 },
          overlay,
        );
        se(
          "circle",
          {
            cx: p.x,
            cy: p.y,
            r: 52,
            fill: "none",
            stroke: c,
            class: "guideRing",
          },
          overlay,
        );
      }
    function pin(p, attrs) {
      const z = proj(p);
      return se(
        "g",
        {
          "data-world-x": z.x,
          "data-world-y": z.y,
          transform: `translate(${z.x} ${z.y}) scale(${mapCamera?.scale || 1})`,
          ...attrs,
        },
        el,
      );
    }
    db.areas.forEach((a, i) => {
      const g = pin(a, {
        class: "mapSpot",
        role: "button",
        tabindex: "0",
        "aria-label": a.name,
        "data-area": a.id,
      });
      se("circle", { r: 22, fill: "transparent" }, g);
      if (state.area === a.id)
        se(
          "circle",
          { r: 20, fill: "#d7f3ec", stroke: "#075c61", "stroke-width": 2 },
          g,
        );
      se(
        "circle",
        { r: 14, fill: a.squid ? "#ab592b" : "#08747c", class: "dot" },
        g,
      );
      se("text", { x: 0, y: 1, class: "numPin" }, g).textContent = i + 1;
      se("title", {}, g).textContent =
        a.name + " / 直線" + km(a).toFixed(1) + "km";
      g.onclick = (e) => {
        if (e.detail === 0) selectArea(a.id);
      };
      g.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectArea(a.id);
        }
      };
    });
    const mp = pin(db.marina, { "aria-label": db.marina.name });
    se(
      "rect",
      { x: -12, y: -12, width: 24, height: 24, rx: 7, class: "marinaMarker" },
      mp,
    );
    se(
      "text",
      { x: 0, y: 32, "text-anchor": "end", class: "marinaLabel" },
      mp,
    ).textContent = activeMarina?.shortName || "シーボニア";
    for (const p of myPoints) {
      const z = proj(p);
      if (z.x < 0 || z.x > 1050 || z.y < 0 || z.y > 950) continue;
      const g = pin(p, {
        role: "button",
        tabindex: "0",
        "aria-label": "保存ポイント " + p.name,
        "data-point": p.id,
      });
      se("circle", { r: 22, fill: "transparent" }, g);
      se("circle", { r: 13, class: "savedPin" }, g);
      se(
        "text",
        { x: 0, y: 5, "text-anchor": "middle", fill: "#fff", "font-size": 16 },
        g,
      ).textContent = "★";
      g.onclick = (e) => {
        if (e.detail === 0) openPoint(p);
      };
      g.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPoint(p);
        }
      };
    }
    if (gpsNow) {
      const z = proj(gpsNow);
      if (z.x >= 0 && z.x <= 1050 && z.y >= 0 && z.y <= 950) {
        const g = pin(gpsNow, { "aria-label": "現在地" });
        se("circle", { r: 10, class: "currentGps" }, g);
      }
    }
  }

  function selectArea(id) {
    const a = db.areas.find((a) => a.id === id);
    if (!a) return;
    if (areaPicker) {
      previewArea(id);
      return;
    }
    state.area = id;
    drawSpots();
    const records = reports().filter((r) => r.area_id === id);
    $("selectedSheet").innerHTML =
      `<button class="sheetHandle" aria-expanded="false" aria-label="詳細を広げる"><span></span></button><button class="sheetClose" aria-label="海域の詳細を閉じる">×</button><h3>${esc(a.name)}</h3><div class="sheetTags"><span class="tag">直線 ${km(a).toFixed(1)}km / ${(km(a) / 1.852).toFixed(1)}海里</span><span class="tag sand">参考：${esc(a.seabed)}</span></div><div data-travel-id="${esc(a.id)}">${tripUI?.travel(a) || ""}</div><div data-area-depth>${depthHTML(a.id)}</div><div class="sheetButtons"><button class="primaryButton" id="areaFish">魚種を見る</button><button class="ghostButton" id="areaReports">釣果 ${records.length}件</button><button class="ghostButton" id="areaFav" aria-label="海域をお気に入りに保存" aria-pressed="${favs.has(id)}">${favs.has(id) ? "★" : "☆"}</button></div><div class="sheetBody"><button class="ghostButton" data-open-conditions="${esc(a.id)}">この海域の海況を見る</button><p><b>地形：</b>${esc(a.slope)}</p><p><b>候補の魚：</b>${a.target_fish.map(esc).join("・")}</p><p><b>情報区分：</b>${esc(a.seabed_confidence)}。精密な水深・底質位置は未測量です。</p><p>海域の概略代表位置です。直線距離は航行距離ではありません。</p><button id="userAddArea" class="ghostButton">この海域をポイントに保存</button></div>`;
    presentSheet(a);
    $("areaFish").onclick = () => {
      state.areaFilter = a.id;
      renderSpecies();
      nav("species");
    };
    $("areaReports").onclick = () => {
      state.reportArea = a;
      state.reportMode = "recent";
      state.group = "all";
      for (const id of ["groupFilter", "mobileGroup"]) $(id).value = "all";
      state.range = Infinity;
      document.querySelectorAll(".rangeBtn").forEach((b) => {
        b.classList.toggle("active", b.dataset.days === "all");
        b.setAttribute("aria-pressed", String(b.dataset.days === "all"));
      });
      renderReports();
      nav("latest");
      $("latestView").scrollTop = 0;
    };
    $("areaFav").onclick = () => {
      const next = new Set(favs);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        if (marinaId === M.HOME)
          localStorage.setItem(FAVKEY, JSON.stringify([...next]));
        else {
          const w = {
            ...workspaces,
            workspaces: {
              ...workspaces.workspaces,
              [marinaId]: { ...workspace(), favs: [...next] },
            },
          };
          localStorage.setItem(M.KEY, JSON.stringify(w));
          workspaces = w;
        }
        favs = next;
        $("areaFav").textContent = favs.has(id) ? "★" : "☆";
        $("areaFav").setAttribute("aria-pressed", String(favs.has(id)));
        renderPlan();
      } catch {
        notify(
          "お気に入りを保存できません。端末の保存容量を確認してください。",
        );
      }
    };
    $("userAddArea").onclick = () =>
      beginWaypoint({
        ...a,
        precision: "公開海域の概略代表位置・GPS点ではない",
      });
  }
  function setLayer(layer) {
    state.layer = layer;
    document.querySelectorAll(".layer").forEach((b) => {
      b.classList.toggle("active", b.dataset.layer === layer);
      b.setAttribute("aria-pressed", String(b.dataset.layer === layer));
    });
    closeSheet();
    state.area = null;
    $("gebcoImageGroup").toggleAttribute("hidden", layer !== "depth");
    if (layer === "depth") bathyLayer();
    else {
      hideOnline();
      $("mapKey").innerHTML =
        layer === "habitat"
          ? "<b>底質・地形ガイド</b><p>茶色：岩礁・根の候補<br>黄色：砂泥底の候補<br>推定エリアです。実測境界ではありません。</p>"
          : "<b>公開釣果の海域</b><p>番号は海域の代表位置です。実測GPS地点ではありません。<br>■ " +
            esc(db.marina.name) +
            "</p>";
    }
    drawSpots();
  }
  function message(text) {
    $("mapMessage").hidden = false;
    $("mapMessage").innerHTML = text;
  }
  function hideOnline() {
    $("onlineMap").hidden = true;
    $("mapMessage").hidden = true;
    $("oceanSVG").hidden = false;
  }

  function makeReport(r) {
    const a = db.areas.find((x) => x.id === r.area_id),
      txt = a?.name || "釣果位置は非公開";
    return `<article class="reportCard"><div class="reportTop"><span>${esc(r.date_label || r.date)}</span><span class="tag">${esc(r.kind === "candidate" ? "探索候補" : "公開釣果")}</span></div><h3>${esc(r.fish)} ${esc(r.amount || "")}</h3><p>${esc(txt)} ｜ ${esc(r.source_name || "公開情報")}</p><div class="sheetTags">${r.size ? '<span class="tag">' + esc(r.size) + "</span>" : ""}${r.depth ? '<span class="tag sand">' + esc(r.depth) + "</span>" : ""}</div><p>${esc(r.detail || "")}</p>${tripUI?.publicContext(r) || ""}<div class="reportBottom"><a href="${/^https:\/\//.test(r.source || "") ? esc(r.source) : "#"}" rel="noopener" target="_blank">元の釣果 ↗</a>${a ? `<button data-maparea="${esc(a.id)}">地図へ →</button>` : ""}</div></article>`;
  }
  function localTime(value) {
    if (!value) return "未確認";
    const d = new Date(value);
    return Number.isNaN(+d)
      ? String(value)
      : new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(d) + " JST";
  }
  function renderReports() {
    const banner = $("reportAreaBanner");
    banner.hidden = !state.reportArea;
    if (state.reportArea)
      $("reportAreaText").textContent = state.reportArea.name + "の釣果";
    const list = reports().filter(
      (r) =>
        r.date <= today &&
        (!state.reportArea || r.area_id === state.reportArea.id),
    );
    const filtered = list.filter(
      (r) =>
        state.group === "all" ||
        db.species.some((f) => matchedGroup(f) && r.fish.includes(f.name)),
    );
    const range = filtered.filter((r) => daysAgo(r) <= state.range),
      monthly = filtered.filter((r) =>
        r.date.startsWith(
          state.year + "-" + String(state.month).padStart(2, "0"),
        ),
      );
    const monthlyMode = state.reportMode === "month",
      conditionsMode = state.reportMode === "conditions";
    $("conditionsMode").setAttribute("aria-pressed", String(conditionsMode));
    $("conditionsExplorer").hidden = !conditionsMode;
    $("latestSummary").hidden = conditionsMode;
    tripUI?.renderExplorer();
    $("recentMode").setAttribute(
      "aria-pressed",
      String(!monthlyMode && !conditionsMode),
    );
    $("monthlyMode").setAttribute("aria-pressed", String(monthlyMode));
    $("reportList").hidden = monthlyMode || conditionsMode;
    document.querySelector(".latestControls").hidden =
      monthlyMode || conditionsMode;
    $("monthReports").hidden = !monthlyMode;
    $("monthHint").parentElement.hidden = !monthlyMode;
    $("latestSummary").innerHTML =
      `<div><small>${monthlyMode ? state.year + "年" + state.month + "月" : state.range === Infinity ? "登録済み" : "直近" + state.range + "日"}の記録</small><b>${monthlyMode ? monthly.length : range.length}<span> 件</span></b><small>公開情報の履歴です</small></div><div><small>収集の最終成功</small><strong>${esc(localTime(db.last_success))}</strong><small>履歴基準 ${esc(marinaId === M.HOME ? db.verified_as_of || "未確認" : db.last_success ? localTime(db.last_success) : "未取得")}</small></div>`;
    if (marinaId !== M.HOME && (db.source_status || []).some((s) => !s.ok))
      $("latestSummary").insertAdjacentHTML(
        "beforeend",
        '<p class="conditionsStatus">公開釣果の収集元に接続できないものがあります。取得済みの記録は保持しています。魚種の案内は「行き先」から確認できます。</p>',
      );
    $("reportList").innerHTML = range.length
      ? range.map(makeReport).join("")
      : '<div class="empty">この条件の釣果記録はありません。釣れないことを意味しません。</div>';
    $("monthHint").textContent =
      `${state.year}年${state.month}月 ${monthly.length}件`;
    $("monthReports").innerHTML = monthly.length
      ? monthly.map(makeReport).join("")
      : '<div class="empty">この月の登録実績はまだありません。</div>';
    document.querySelectorAll("[data-maparea]").forEach(
      (b) =>
        (b.onclick = () => {
          nav("map");
          setLayer("spots");
          selectArea(b.dataset.maparea);
        }),
    );
  }
  function renderPlan() {
    const names = [...favs]
        .map((id) => db.areas.find((a) => a.id === id))
        .filter(Boolean),
      box = $("favoritesBox");
    box.innerHTML = names.length
      ? "<b>保存した海域</b><div>" +
        names
          .map(
            (a) =>
              `<button data-open-fav="${esc(a.id)}">${esc(a.name)} →</button>`,
          )
          .join("") +
        "</div>"
      : "<b>お気に入り海域</b><p>地図で海域を選び、☆を押すとここに保存されます。</p>";
    box.querySelectorAll("[data-open-fav]").forEach(
      (b) =>
        (b.onclick = () => {
          nav("map");
          setLayer("spots");
          selectArea(b.dataset.openFav);
        }),
    );
    $("syncInfo").textContent =
      "収集の最終成功：" +
      localTime(db.last_success) +
      "。通信できない時は保存済みの履歴を表示します。";
  }

  async function refreshMarinaPack(manual = false) {
    const id = marinaId;
    try {
      const r = await fetch("./data/marinas/" + id + ".json?ts=" + Date.now(), {
        cache: "no-store",
      });
      if (!r.ok) throw Error("HTTP");
      const j = await r.json();
      if (id !== marinaId) return;
      if (j.marinaId !== id || !Array.isArray(j.reports)) throw Error("data");
      db = {
        ...db,
        reports: j.reports,
        areas: j.areas,
        last_success: j.last_success,
        source_status: j.source_status || [],
      };
      $("syncLabel").textContent =
        r.headers.get("X-Seabornia-Cache") === "offline"
          ? "保存済み履歴"
          : "履歴を確認済み";
      renderReports();
      renderPlan();
      renderSpecies();
      drawSpots();
      if (manual)
        notify("公開データを確認しました。取得成功日時をご確認ください。");
    } catch {
      if (id === marinaId) {
        $("syncLabel").textContent = "保存済み履歴";
        if (manual) notify("通信できません。保存済みの履歴を表示しています。");
      }
    }
  }
  function validData(j) {
    return (
      j &&
      Array.isArray(j.reports) &&
      Array.isArray(j.areas) &&
      j.reports.length > 10 &&
      j.schema_version === 2
    );
  }
  async function updateData(manual = false) {
    if (state.loading) return;
    if (marinaId !== M.HOME) {
      await refreshMarinaPack(manual);
      return;
    }
    if (!/^https?:$/.test(location.protocol)) {
      if (manual) {
        nav("plan");
        $("syncInfo").textContent =
          "単体デモは履歴表示のみです。公開版を設置すると、サーバーが収集したデータを反映できます。";
      }
      return;
    }
    state.loading = true;
    $("syncLabel").textContent = "更新確認中";
    try {
      const r = await fetch("./data/latest.json?ts=" + Date.now(), {
        cache: "no-store",
      });
      if (!r.ok) throw Error("HTTP " + r.status);
      const j = await r.json();
      if (!validData(j)) throw Error("data invalid");
      if (marinaId !== M.HOME) return;
      db = {
        ...S,
        ...j,
        species: [...S.species, ...extraSpecies],
        marina: activeMarina
          ? {
              ...j.marina,
              name: activeMarina.name,
              lat: activeMarina.lat,
              lng: activeMarina.lng,
            }
          : j.marina,
        areas: S.areas.map((a) => ({
          ...a,
          ...j.areas.find((x) => x.id === a.id),
        })),
      };
      $("syncLabel").textContent =
        r.headers.get("X-Seabornia-Cache") === "offline"
          ? "保存済み履歴"
          : db.last_success
            ? "履歴を確認済み"
            : "収集成功は未確認";
      renderSpecies();
      renderReports();
      renderPlan();
      drawSpots();
      if (manual)
        notify(
          r.headers.get("X-Seabornia-Cache") === "offline"
            ? "通信できません。保存済みの履歴を表示しています。"
            : "最新の釣果データを確認しました",
        );
    } catch (e) {
      $("syncLabel").textContent = "保存済み履歴";
      if (manual) notify("通信できません。保存済みの履歴を表示しています。");
    } finally {
      state.loading = false;
    }
  }
  function setup() {
    setupUX();
    photoManifestReady = loadPhotoManifest();
    initControls();
    makeMap();
    redrawMap();
    renderSpecies();
    renderReports();
    renderPlan();
    if (location.protocol !== "file:") {
      updateData();
      setInterval(() => {
        if (!document.hidden) updateData();
      }, 600000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) updateData();
      });
      if ("serviceWorker" in navigator && window.isSecureContext)
        navigator.serviceWorker.register("./sw.js").catch(() => {});
    } else $("syncLabel").textContent = "オフライン見本";
    setupUserLogs();
    tripUI = SeaborniaTripUI({
      db: () => db,
      marinaId: () => marinaId,
      marina: () => activeMarina,
      confirmReplaceTrip: (name) =>
        confirmAction(
          "帰港予定を置き換えますか？",
          name + "の帰港リマインダーを現在のマリーナの予定で置き換えます。",
          "置き換える",
        ),
      catches: () => myCatches,
      selectedArea: () => state.area,
      reportArea: () => state.reportArea,
      esc,
      localTime,
      nav,
      notify,
      action,
      changed: refreshTripLinks,
    });
    refreshTripLinks();
    loadDiscovery();
    $("auditAllPhotos").onclick = auditAllPhotos;
    photoStatusText();
    drawSpots();
    nav("map");
    document.addEventListener("input", (e) => {
      if (e.target.closest("#logView,#conditionsApp,#conditionsExplorer"))
        deferWorkspace();
    });
    document.addEventListener("change", deferWorkspace);
    window.addEventListener("pagehide", saveWorkspace);
    $("activeMarinaName").textContent = "シーボニア";
    $("recordMarina").textContent = "記録先：リビエラシーボニアマリーナ";
    destinationUI = SeaStyleDestinationUI({
      esc,
      localTime,
      month: () => state.month,
      speciesNames: (extras) => [...S.species, ...extras].map((f) => f.name),
      notify,
      switchMarina,
      ready: async ({ registry, extraSpecies: extra, coast }) => {
        extraSpecies = extra;
        regionalCoast = coast;
        const saved = workspaces.activeMarinaId;
        const home = registry.find((m) => m.id === M.HOME);
        activeMarina = home;
        db.species = [...S.species, ...extra];
        db.marina = {
          ...db.marina,
          name: home.name,
          lat: home.lat,
          lng: home.lng,
        };
        drawCoast();
        $("catchFish").innerHTML = db.species
          .map((f) => `<option value="${esc(f.name)}">${esc(f.name)}</option>`)
          .join("");
        restoreWorkspace();
        renderSpecies();
        renderReports();
        drawSpots();
        const last = registry.find(
          (m) => m.id === saved && m.status !== "excluded",
        );
        if (last && saved !== M.HOME) {
          try {
            await switchMarina(last);
          } catch (e) {
            notify(e.message);
          }
        }
      },
    });
    destinationUI.load().catch((e) => notify(e.message));
  }

  // V4 additions — all saved data stays on device unless user exports it.
  const MEMKEY = "seabornia-v4-points",
    CATCHKEY = "seabornia-v4-catches";
  function readLocal(key) {
    try {
      const x = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  }
  let myPoints = M.mine(readLocal(MEMKEY), marinaId),
    myCatches = M.mine(readLocal(CATCHKEY), marinaId),
    gpsNow = null,
    markingMode = false,
    gpsBusy = false;
  function persist(key, items) {
    try {
      if ((key === MEMKEY || key === CATCHKEY) && marinaId !== M.HOME) {
        const extra = extraRecords(),
          kind = key === MEMKEY ? "waypoints" : "catches";
        extra[kind] = M.merge(extra[kind], items, marinaId);
        localStorage.setItem(EXTRAKEY, JSON.stringify(extra));
      } else localStorage.setItem(key, JSON.stringify(items));
      return true;
    } catch {
      notify(
        "保存容量が不足しています。写真を減らすか、JSONバックアップを取ってください。",
      );
      return false;
    }
  }
  function position(lat, lng) {
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }
  async function getGps() {
    if (gpsBusy) return null;
    if (!navigator.geolocation || !window.isSecureContext) {
      notify(
        "この環境ではGPSを利用できません。緯度・経度から手動で登録できます。",
      );
      return null;
    }
    gpsBusy = true;
    for (const id of ["locateBtn", "gpsFromLog", "saveMyLocation"])
      $(id).disabled = true;
    $("positionInfo").textContent = "現在地を取得しています…";
    return new Promise((resolve) => {
      function finish(value) {
        gpsBusy = false;
        for (const id of ["locateBtn", "gpsFromLog", "saveMyLocation"])
          $(id).disabled = false;
        resolve(value);
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          gpsNow = {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
          };
          $("positionInfo").textContent =
            position(gpsNow.lat, gpsNow.lng) +
            " / 推定精度 ±" +
            Math.round(gpsNow.accuracy) +
            "m";
          $("pointLat").value = gpsNow.lat.toFixed(6);
          $("pointLon").value = gpsNow.lng.toFixed(6);
          const inRange =
            gpsNow.lat >= 35.07 &&
            gpsNow.lat <= 35.29 &&
            gpsNow.lng >= 139.51 &&
            gpsNow.lng <= 139.72;
          if (inRange && mapCamera) {
            const z = proj(gpsNow);
            mapCamera.x = z.x - (mapCamera.width * mapCamera.scale) / 2;
            mapCamera.y = z.y - (mapCamera.height * mapCamera.scale) / 2;
            mapCamera.constrain();
            redrawMap();
          }
          notify(
            inRange
              ? "現在地を取得しました。推定精度 ±" +
                  Math.round(gpsNow.accuracy) +
                  "m"
              : "現在地を取得しました。地図の表示範囲外です。",
          );
          renderUserLogs();
          drawSpots();
          finish(gpsNow);
        },
        (err) => {
          const message =
            err.code === 1
              ? "位置情報が許可されていません。Safariのサイト設定から許可するか、手動で登録できます。"
              : err.code === 3
                ? "GPSの取得が時間切れになりました。もう一度お試しください。"
                : "現在地を取得できません。電波状況を確認するか、手動で登録してください。";
          $("positionInfo").textContent = message;
          notify(message);
          finish(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }
  function validWaypoint(p) {
    return (
      p &&
      String(p.name || "").trim() &&
      p.lat !== "" &&
      p.lng !== "" &&
      p.lat != null &&
      p.lng != null &&
      Number.isFinite(+p.lat) &&
      Number.isFinite(+p.lng) &&
      Math.abs(+p.lat) <= 90 &&
      Math.abs(+p.lng) <= 180
    );
  }
  function saveWaypoint(p) {
    if (!validWaypoint(p)) {
      notify("ポイント名と有効な緯度・経度を入力してください。");
      return false;
    }
    const wp = {
      id: "wp" + Date.now() + Math.random().toString(36).slice(2, 6),
      marinaId,
      name: String(p.name).trim().slice(0, 75),
      lat: +p.lat,
      lng: +p.lng,
      precision: p.precision || "ユーザー手動登録",
      saved_at: new Date().toISOString(),
    };
    const next = [wp, ...myPoints];
    if (!persist(MEMKEY, next)) return false;
    myPoints = next;
    renderUserLogs();
    drawSpots();
    notify("「" + wp.name + "」をこの端末に保存しました");
    return true;
  }
  async function beginWaypoint(p) {
    const z = proj(p);
    $("draftPin")?.remove();
    if (z.x >= 0 && z.x <= 1050 && z.y >= 0 && z.y <= 950)
      se(
        "circle",
        {
          id: "draftPin",
          cx: z.x,
          cy: z.y,
          r: 12 * (mapCamera?.scale || 1),
          fill: "#f1b55d",
          stroke: "#073b43",
          "stroke-width": 3 * (mapCamera?.scale || 1),
        },
        $("oceanSVG"),
      );
    const result = await action({
      title: "ポイントを保存",
      content: `<p>${esc(position(p.lat, p.lng))}</p><p>${esc(p.precision || "概略代表位置")}</p><label>ポイント名<input name="name" maxlength="75" value="${esc(p.name || "")}" placeholder="例：沖のかけ上がり" required autofocus></label>`,
      submit: "保存",
      validate: (form) =>
        form.get("name").trim() ? null : "ポイント名を入力してください。",
      save: (form) => saveWaypoint({ ...p, name: form.get("name") }),
    });
    $("draftPin")?.remove();
    setMarking(false);
    return result;
  }
  function setMarking(value) {
    if (areaPicker && value) return;
    markingMode = value;
    $("markMapBtn").setAttribute("aria-pressed", String(value));
    $("markMapBtn").textContent = value
      ? "追加をキャンセル"
      : "＋ ポイントを追加";
    $("gpsNotice").hidden = !value;
    $("gpsNotice").textContent =
      "地図をタップして位置を選び、名前を付けて保存します。ピンチ・ドラッグでは保存されません。";
  }
  function openPoint(p) {
    if (areaPicker) return;
    $("selectedSheet").innerHTML =
      `<button class="sheetHandle" aria-expanded="false" aria-label="詳細を広げる"><span></span></button><button class="sheetClose" aria-label="ポイントの詳細を閉じる">×</button><h3>${esc(p.name)}</h3><div class="sheetTags"><span class="tag">直線 ${km(p).toFixed(1)}km / ${(km(p) / 1.852).toFixed(1)}海里</span></div><div data-travel-id="${esc(p.id)}">${tripUI?.travel(p) || ""}</div><div class="sheetButtons"><button class="primaryButton" id="toLog">記録を見る</button></div><div class="sheetBody"><p>${position(p.lat, p.lng)}</p><p>${esc(p.precision)}</p>${tripUI?.pointConditions(p) || ""}</div>`;
    presentSheet(p);
    const z = proj(p);
    if (z.x < 0 || z.x > 1050 || z.y < 0 || z.y > 950)
      message(
        "このポイントは地図の表示海域外です。詳細の緯度・経度をご確認ください。",
      );
    $("toLog").onclick = () => nav("log");
  }
  function refreshTripLinks() {
    refreshAreaMenu();
    renderReports();
    renderUserLogs();
    document.querySelectorAll("[data-travel-id]").forEach((node) => {
      const p = [...db.areas, ...myPoints].find(
        (p) => p.id === node.dataset.travelId,
      );
      if (p) node.innerHTML = tripUI?.travel(p) || "";
    });
  }
  function refreshAreaMenu() {
    $("areaList").innerHTML =
      `<h2>海域を選ぶ</h2><p>距離・時間は${esc(db.marina.name)}からの直線移動の目安。港内減速・迂回・風波で変わります。</p><button type="button" class="ghostButton" data-speed-settings>船速を設定</button>` +
      db.areas
        .map(
          (a, i) =>
            `<button data-area-open="${esc(a.id)}"><span class="listNumber">${i + 1}</span><span>${esc(a.name)}<small>${km(a).toFixed(1)}km · ${tripUI?.travel(a, true) || "船速未設定"} / ${esc(a.seabed)}<br>代表位置付近の参考水深：${depthText(a.id)}</small></span><span>›</span></button>`,
        )
        .join("");
    $("areaList")
      .querySelectorAll("[data-area-open]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            nav("map");
            setLayer("spots");
            selectArea(b.dataset.areaOpen);
            closeMapPanels();
          }),
      );
  }
  function renderUserLogs() {
    const choice = $("catchWaypoint").value;
    $("waypointCount").textContent = myPoints.length + "件";
    $("waypointList").innerHTML =
      myPoints
        .map(
          (p) =>
            `<article class="savedItem"><button data-remove-point="${esc(p.id)}" aria-label="${esc(p.name)}を削除">削除</button><strong>★ ${esc(p.name)}</strong><small>${position(p.lat, p.lng)}<br>${esc(p.precision)}<br>マリーナから直線 ${km(p).toFixed(1)}km / ${(km(p) / 1.852).toFixed(1)}海里</small>${tripUI?.travel(p) || ""}<button class="ghostButton" data-open-point="${esc(p.id)}">地図で見る</button></article>`,
        )
        .join("") ||
      '<div class="empty">保存したポイントはここに表示されます。地図の「ポイントを追加」から登録できます。</div>';
    $("waypointList")
      .querySelectorAll("[data-remove-point]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            if (
              !(await confirmAction(
                "ポイントを削除しますか？",
                "この端末の保存ポイントを削除します。",
                "削除",
              ))
            )
              return;
            const next = myPoints.filter((p) => p.id !== b.dataset.removePoint);
            if (persist(MEMKEY, next)) {
              myPoints = next;
              renderUserLogs();
              drawSpots();
              notify("ポイントを削除しました");
            }
          }),
      );
    $("waypointList")
      .querySelectorAll("[data-open-point]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const p = myPoints.find((x) => x.id === b.dataset.openPoint);
            nav("map");
            setLayer("spots");
            openPoint(p);
          }),
      );
    $("catchWaypoint").innerHTML =
      '<option value="">位置なし</option>' +
      (gpsNow ? '<option value="GPS_NOW">現在地GPS（取得済み）</option>' : "") +
      myPoints
        .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
        .join("");
    if ([...$("catchWaypoint").options].some((o) => o.value === choice))
      $("catchWaypoint").value = choice;
    $("personalCatchCount").textContent = myCatches.length + "件";
    $("myCatches").innerHTML =
      myCatches
        .map(
          (c) =>
            `<article class="savedItem" tabindex="-1" data-record-id="${esc(c.id)}"><button data-remove-catch="${esc(c.id)}" aria-label="${esc(c.fish)}の記録を削除">削除</button><strong>${esc(c.date)} ${esc(c.fish)} × ${esc(c.count)}</strong><small>${c.size ? esc(c.size) + "cm / " : ""}${c.depth ? esc(c.depth) + "m / " : ""}${esc(c.pointName || "地点未指定")}</small>${safePhoto(c.photo) ? `<button class="catchPhotoButton" data-catch-photo="${esc(c.id)}" aria-label="${esc(c.fish)}の写真を拡大"><img src="${esc(c.photo)}" alt="${esc(c.fish)}の釣果写真"></button>` : ""}<p>${esc(c.memo || "")}</p>${tripUI?.privateContext(c) || ""}</article>`,
        )
        .join("") ||
      '<div class="empty">保存した釣果はここに表示されます。</div>';
    $("myCatches")
      .querySelectorAll("[data-remove-catch]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            if (
              !(await confirmAction(
                "釣果を削除しますか？",
                "写真を含むこの記録を削除します。",
                "削除",
              ))
            )
              return;
            const next = myCatches.filter(
              (c) => c.id !== b.dataset.removeCatch,
            );
            if (persist(CATCHKEY, next)) {
              myCatches = next;
              renderUserLogs();
              notify("釣果を削除しました");
            }
          }),
      );
    $("myCatches")
      .querySelectorAll("[data-catch-photo]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const c = myCatches.find((c) => c.id === b.dataset.catchPhoto);
            openPhoto(c.photo, c.fish + " / " + c.date);
          }),
      );
  }
  function safePhoto(value) {
    return (
      typeof value === "string" &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value)
    );
  }
  function photoCompress(file) {
    return new Promise((res, rej) => {
      if (!file) return res("");
      if (!file.type.startsWith("image/"))
        return rej(Error("写真を選択してください"));
      if (file.size > 20000000)
        return rej(Error("写真は20MB以内にしてください"));
      const rd = new FileReader();
      rd.onerror = () => rej(Error("写真を読み込めません"));
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 520 / img.width, 520 / img.height),
            c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", 0.55));
        };
        img.onerror = () =>
          rej(Error("この写真形式を開けません。JPEG・PNGなどをお試しください"));
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
  function saveFile(filename, data, mime) {
    const a = document.createElement("a"),
      url = URL.createObjectURL(new Blob([data], { type: mime }));
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function validateBackup(obj) {
    if (
      !obj ||
      !Array.isArray(obj.waypoints) ||
      !Array.isArray(obj.catches) ||
      obj.waypoints.length > 5000 ||
      obj.catches.length > 5000
    )
      throw Error("バックアップ形式ではありません");
    if (
      obj.waypoints.some((p) => !validWaypoint(p) || typeof p.id !== "string")
    )
      throw Error("ポイントの座標・名前を確認してください");
    if (
      obj.catches.some(
        (c) =>
          !c ||
          typeof c.id !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(c.date) ||
          typeof c.fish !== "string" ||
          !Number.isFinite(+c.count) ||
          +c.count < 0 ||
          (c.time && !SeaborniaTrip.validTime(c.time)) ||
          (c.conditions && !validSnapshot(c.conditions)) ||
          (c.photo && !safePhoto(c.photo)),
      )
    )
      throw Error("釣果記録の形式を確認してください");
    if (![undefined, 4, 5, 6].includes(obj.version))
      throw Error("未対応のバックアップです");
    if (obj.version === 6) {
      if (
        !obj.workspaces ||
        obj.workspaces.schema_version !== 1 ||
        !obj.workspaces.workspaces ||
        !M.validId(obj.workspaces.activeMarinaId) ||
        Object.keys(obj.workspaces.workspaces).length > 150 ||
        Object.entries(obj.workspaces.workspaces).some(
          ([id, w]) =>
            !M.validId(id) ||
            !M.validWorkspace(w) ||
            (w.draftPhoto && !safePhoto(w.draftPhoto)) ||
            (w.trip && !tripUI.validPrefs(w.trip, true)),
        ) ||
        !Array.isArray(obj.favourites) ||
        obj.favourites.some((v) => typeof v !== "string") ||
        [...obj.waypoints, ...obj.catches].some(
          (r) => !M.validId(r.marinaId || M.HOME),
        )
      )
        throw Error("マリーナ別のバックアップ形式を確認してください");
      if (
        obj.activeTrip &&
        (!M.validId(obj.activeTrip.marinaId) ||
          !Number.isFinite(obj.activeTrip.at))
      )
        throw Error("帰港予定の形式を確認してください");
    }
    if (
      obj.tripSettings &&
      (!tripUI || !tripUI.validPrefs(obj.tripSettings, true))
    )
      throw Error("釣行設定の形式を確認してください");
    return obj;
  }
  function validSnapshot(s) {
    return (
      s &&
      s.version === 1 &&
      Number.isFinite(Date.parse(s.capturedAt)) &&
      (!s.tide ||
        (typeof s.tide.name === "string" &&
          typeof s.tide.source === "string" &&
          (!s.tide.phase || typeof s.tide.phase === "string"))) &&
      (!s.forecast ||
        (typeof s.forecast.area === "string" &&
          Number.isFinite(Date.parse(s.forecast.validAt))))
    );
  }
  function exportBackup() {
    saveWorkspace();
    return {
      version: 6,
      exportedAt: new Date().toISOString(),
      waypoints: pointRows(),
      catches: catchRows(),
      workspaces,
      favourites: readLocal(FAVKEY),
      tripSettings: JSON.parse(
        localStorage.getItem("seabornia-trip-v1") || "null",
      ),
      activeTrip: JSON.parse(
        localStorage.getItem("seabornia-active-trip-v1") || "null",
      ),
    };
  }
  async function replaceBackup(obj) {
    const records = M.backupRecords(obj, pointRows(), catchRows()),
      values = {
        [MEMKEY]: JSON.stringify(M.mine(records.points, M.HOME)),
        [CATCHKEY]: JSON.stringify(M.mine(records.catches, M.HOME)),
      };
    if (obj.version === 6)
      values[EXTRAKEY] = JSON.stringify({
        waypoints: records.points.filter((r) => M.owner(r) !== M.HOME),
        catches: records.catches.filter((r) => M.owner(r) !== M.HOME),
      });
    if (obj.version === 6) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("seabornia-trip-v1:")) values[k] = null;
      }
      values[M.KEY] = JSON.stringify(obj.workspaces);
      values[FAVKEY] = JSON.stringify(obj.favourites || []);
      values["seabornia-active-trip-v1"] = JSON.stringify(
        obj.activeTrip || null,
      );
      for (const [id, w] of Object.entries(obj.workspaces.workspaces)) {
        if (w.trip)
          values[
            id === M.HOME ? "seabornia-trip-v1" : "seabornia-trip-v1:" + id
          ] = JSON.stringify(w.trip);
      }
    }
    if (obj.tripSettings)
      values["seabornia-trip-v1"] = JSON.stringify(obj.tripSettings);
    try {
      M.storageTransaction(localStorage, values);
    } catch {
      throw Error(
        "保存容量不足のため読み込みを中断し、元の記録を復元しました。",
      );
    }
    if (obj.version === 6) workspaces = obj.workspaces;
    $("catchForm").reset();
    $("catchDate").value = dateJst();
    draftPhoto = "";
    myPoints = M.mine(records.points, marinaId);
    myCatches = M.mine(records.catches, marinaId);
    tripUI?.switchMarina(marinaId);
    restoreWorkspace();
    refreshTripLinks();
    drawSpots();
    if (obj.version === 6) {
      const last = destinationUI
        ?.registry()
        .find(
          (m) => m.id === workspaces.activeMarinaId && m.status !== "excluded",
        );
      if (last && last.id !== marinaId) await switchMarina(last);
    }
    tripUI?.load();
  }
  function setupUserLogs() {
    for (const f of db.species)
      $("catchFish").insertAdjacentHTML(
        "beforeend",
        `<option value="${esc(f.name)}">${esc(f.name)}</option>`,
      );
    $("catchPhoto").addEventListener("change", async () => {
      const id = marinaId;
      try {
        const value = await photoCompress($("catchPhoto").files[0]);
        if (id === marinaId) {
          draftPhoto = value;
          updateDraftPhoto();
          deferWorkspace();
        }
      } catch (e) {
        notify(e.message);
      }
    });
    $("catchDate").value = dateJst();
    $("locateBtn").onclick = getGps;
    $("gpsFromLog").onclick = getGps;
    $("saveMyLocation").onclick = async () => {
      const p = gpsNow || (await getGps());
      if (p)
        beginWaypoint({
          ...p,
          name: "GPS " + dateJst(),
          precision: "GPS取得時の推定精度 ±" + Math.round(p.accuracy) + "m",
        });
    };
    $("savePoint").onclick = () => {
      if (
        saveWaypoint({
          name: $("pointTitle").value,
          lat: $("pointLat").value,
          lng: $("pointLon").value,
        })
      )
        $("pointTitle").value = "";
    };
    $("markMapBtn").onclick = () => {
      closeSheet();
      closeMapPanels();
      setMarking(!markingMode);
    };
    $("areaMenuBtn").onclick = () => toggleMapPanel("areaList", "areaMenuBtn");
    $("layersBtn").onclick = () => toggleMapPanel("layersPanel", "layersBtn");
    refreshAreaMenu();
    $("catchForm").onsubmit = async (e) => {
      e.preventDefault();
      const button = $("catchForm").querySelector("[type=submit]");
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "保存しています…";
      try {
        const photo =
            draftPhoto || (await photoCompress($("catchPhoto").files[0])),
          loc = $("catchWaypoint").value,
          p =
            myPoints.find((w) => w.id === loc) ||
            (loc === "GPS_NOW" ? gpsNow : null);
        const rec = {
          id: "cr" + Date.now() + Math.random().toString(36).slice(2, 5),
          marinaId,
          date: $("catchDate").value,
          time: $("catchTime").value || undefined,
          conditions:
            tripUI?.snapshot(p, $("catchDate").value, $("catchTime").value) ||
            undefined,
          fish: $("catchFish").value,
          count: $("catchCount").value,
          size: $("catchSize").value,
          depth: $("catchDepth").value,
          memo: $("catchMemo").value,
          pointId: p?.id || "",
          pointName: p?.name || (loc === "GPS_NOW" ? "GPS取得点" : ""),
          lat: p?.lat ?? null,
          lng: p?.lng ?? null,
          photo,
        };
        const next = [rec, ...myCatches];
        if (!persist(CATCHKEY, next)) return;
        myCatches = next;
        draftPhoto = "";
        updateDraftPhoto();
        $("catchForm").reset();
        $("catchDate").value = dateJst();
        renderUserLogs();
        notify("釣果をこの端末に保存しました");
      } catch (error) {
        notify("写真エラー：" + error.message);
      } finally {
        button.disabled = false;
        button.textContent = "釣果を保存";
      }
    };
    $("backupBtn").onclick = () =>
      saveFile(
        "seabornia-fishing-backup-" + dateJst() + ".json",
        JSON.stringify(exportBackup(), null, 2),
        "application/json",
      );
    $("csvBtn").onclick = () => {
      const cols = [
        "marinaId",
        "date",
        "time",
        "fish",
        "count",
        "size",
        "depth",
        "pointName",
        "memo",
      ];
      const cell = (v) => {
        let t = String(v ?? "");
        if (/^[=+@-]/.test(t)) t = "'" + t;
        return '"' + t.replaceAll('"', '""') + '"';
      };
      saveFile(
        "seastyle-" + marinaId + "-catches.csv",
        "\ufeff" +
          [
            cols.join(","),
            ...myCatches.map((c) =>
              cols
                .map((k) => cell(k === "marinaId" ? M.owner(c) : c[k]))
                .join(","),
            ),
          ].join("\r\n"),
        "text/csv;charset=utf-8",
      );
    };
    $("importJson").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (file.size > 30000000)
          throw Error("ファイルは30MB以内にしてください");
        const obj = validateBackup(JSON.parse(await file.text()));
        saveWorkspace();
        if (
          !(await confirmAction(
            "バックアップを読み込みますか？",
            `ポイント ${obj.waypoints.length}件・釣果 ${obj.catches.length}件で、${obj.version === 6 ? "全マリーナ" : "シーボニアのみ"}の記録を置き換えます。必要なら先にJSONバックアップを保存してください。`,
            "置き換えて読み込む",
          ))
        )
          return;
        await replaceBackup(obj);
        notify("バックアップを読み込みました");
      } catch (error) {
        notify("読み込みできません：" + error.message);
      } finally {
        e.target.value = "";
      }
    };
    renderUserLogs();
  }

  // Photos: verify actual onload, retry two encyclopedias and Commons search.
  const photoMemo = new Map(),
    photoAudit = { ok: new Set(), bad: new Set(), loading: new Set() };
  function photoStatusText() {
    const total = db.species.filter((f) => !f.noPhoto).length;
    const pending = total - photoAudit.ok.size - photoAudit.bad.size;
    $("photoAuditStatus").textContent =
      `写真の実表示確認：${photoAudit.ok.size}/${total}件 OK ｜ 未取得 ${photoAudit.bad.size}件 ｜ 未チェック ${Math.max(0, pending)}件`;
  }
  function testPhoto(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      const im = new Image();
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => finish(false), 11000);
      im.onload = () => finish(im.naturalWidth > 50 && im.naturalHeight > 35);
      im.onerror = () => finish(false);
      im.referrerPolicy = "no-referrer";
      im.src = url;
    });
  }
  const serverPhotos = new Map();
  let photoManifestReady = Promise.resolve();
  async function loadPhotoManifest() {
    if (
      location.protocol !== "https:" &&
      location.hostname !== "localhost" &&
      location.hostname !== "127.0.0.1"
    )
      return;
    try {
      const r = await fetch("./data/photo_manifest.json?v=" + Date.now(), {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = await r.json();
      for (const [id, row] of Object.entries(j.images || {})) {
        if (row.ok && row.local && row.license) serverPhotos.set(id, row);
      }
      photoMemo.clear();
      renderSpecies();
    } catch {}
  }
  async function verifiedPhoto(f) {
    if (photoMemo.has(f.id)) return photoMemo.get(f.id);
    const promise = (async () => {
      await photoManifestReady;
      const row = serverPhotos.get(f.id);
      if (!row) return "";
      const url = "./" + row.local;
      return (await testPhoto(url)) ? url : "";
    })();
    photoMemo.set(f.id, promise);
    return promise;
  }
  async function showPhoto(img) {
    const f = db.species.find((x) => x.id === img.dataset.photo);
    if (!f || !img.isConnected) return;
    photoAudit.loading.add(f.id);
    photoStatusText();
    const u = await verifiedPhoto(f);
    if (!img.isConnected) return;
    if (u) {
      photoAudit.ok.add(f.id);
      photoAudit.bad.delete(f.id);
      img.src = u;
      img.hidden = false;
      img.onload = () => (img.style.opacity = "1");
      img.onerror = () => {
        img.hidden = true;
        photoAudit.ok.delete(f.id);
        photoAudit.bad.add(f.id);
        photoMemo.delete(f.id);
        photoStatusText();
      };
    } else {
      photoAudit.bad.add(f.id);
      photoAudit.ok.delete(f.id);
      img.hidden = true;
      const fb = img.parentElement?.querySelector(".fishFallback");
      if (fb) fb.textContent = "写真未取得";
    }
    photoAudit.loading.delete(f.id);
    photoStatusText();
  }
  const photoObserver = window.IntersectionObserver
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              photoObserver.unobserve(e.target);
              e.target.querySelectorAll("[data-photo]").forEach(showPhoto);
            }
          });
        },
        { rootMargin: "180px" },
      )
    : null;
  function injectPhotos(scope) {
    scope.querySelectorAll("[data-photo]").forEach((img) => {
      if (db.species.find((f) => f.id === img.dataset.photo)?.noPhoto) {
        const fb = img.parentElement.querySelector(".fishFallback");
        if (fb) fb.textContent = "地域名・資料写真なし";
        return;
      }
      const card = img.closest(".fishCard");
      if (card && photoObserver) photoObserver.observe(card);
      else showPhoto(img);
    });
  }
  async function auditAllPhotos() {
    const b = $("auditAllPhotos");
    b.disabled = true;
    const originals = b.textContent;
    let i = 0;
    let pool = db.species.filter((f) => !f.noPhoto);
    for (const id of photoAudit.bad) photoMemo.delete(id);
    const workers = Array.from({ length: 3 }, async () => {
      while (pool.length) {
        const f = pool.shift();
        if (!f) break;
        const url = await verifiedPhoto(f);
        if (url) {
          photoAudit.ok.add(f.id);
          photoAudit.bad.delete(f.id);
        } else {
          photoAudit.bad.add(f.id);
          photoAudit.ok.delete(f.id);
        }
        i++;
        b.textContent = `画像確認 ${i}/${db.species.length}`;
        photoStatusText();
      }
    });
    await Promise.all(workers);
    b.textContent = originals;
    b.disabled = false;
    renderSpecies();
    if (photoAudit.bad.size)
      notify(
        "写真を取得できなかった魚種：" +
          [...photoAudit.bad]
            .map((id) => db.species.find((f) => f.id === id)?.name)
            .join("、") +
          "。オンライン接続を確認してください。",
      );
  }
  // Online GEBCO 2026 WMS image; positioned over same lat/lon bbox as vector map.
  const BATHY_URL =
    "https://wms.gebco.net/2026/mapserv?service=WMS&request=GetMap&version=1.3.0&layers=GEBCO_2026&styles=&format=image%2Fjpeg&crs=EPSG%3A4326&bbox=35.07%2C139.51%2C35.29%2C139.72&width=1050&height=950";
  let bathyTried = false,
    bathyOk = false;
  let bathyAttempt = 0;
  function bathyLayer() {
    const group = $("gebcoImageGroup");
    group.removeAttribute("hidden");
    $("oceanSVG").hidden = false;
    $("onlineMap").hidden = true;
    $("mapKey").hidden = false;
    $("mapKey").innerHTML =
      "<b>GEBCO 2026 海底陰影</b><p>広域の海底地形モデルです。砂・岩などの底質は判別できません。細いかけ上がりの解像度は不足する可能性があります。非航海用。</p>";
    if (bathyOk) {
      $("mapMessage").hidden = true;
      return;
    }
    if (bathyTried) {
      message("海底画像を読み込み中です…");
      return;
    }
    bathyTried = true;
    const attempt = ++bathyAttempt;
    group.innerHTML = "";
    const img = se(
      "image",
      {
        x: 0,
        y: 0,
        width: 1050,
        height: 950,
        preserveAspectRatio: "none",
        href: activeMarina ? "./images/maps/" + marinaId + ".jpg" : BATHY_URL,
      },
      group,
    );
    const timer = setTimeout(failed, 12000);
    function failed() {
      if (attempt !== bathyAttempt) return;
      clearTimeout(timer);
      bathyTried = false;
      group.setAttribute("hidden", "");
      img.remove();
      if (state.layer !== "depth") return;
      message(
        '海底地形画像を読み込めません。概略地図は引き続き使えます。<br><button id="retryBathy" class="ghostButton">再読み込み</button> <a href="https://www.gebco.net/data-products/gebco-web-services/web-map-service" target="_blank" rel="noopener">GEBCO公式 ↗</a>',
      );
      $("retryBathy").onclick = bathyLayer;
    }
    img.addEventListener("load", () => {
      if (attempt !== bathyAttempt) return;
      clearTimeout(timer);
      bathyOk = true;
      if (state.layer === "depth") $("mapMessage").hidden = true;
    });
    img.addEventListener("error", failed);
    message(
      "GEBCO海底図を読み込み中です。ネット接続が必要です。航海用ではありません。",
    );
  }
  function appendPhotoCredit(f) {
    const meta = serverPhotos.get(f.id);
    if (meta) {
      const target = $("modalContent").querySelector(".modalBody");
      const p = document.createElement("p");
      p.className = "sourceLine";
      const a = document.createElement("a");
      a.href = meta.source;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "写真提供元・ライセンス(" + meta.license + ") ↗";
      const credit = new DOMParser()
        .parseFromString(meta.artist_html || "", "text/html")
        .body.textContent.trim();
      p.append(
        document.createTextNode(
          (credit ? "写真：" + credit + " / " : "") + "縮小・JPEG変換 / ",
        ),
        a,
      );
      target.append(p);
    }
  }
  let modalOpener = null,
    photoBinding = null,
    photoCamera = null;
  function notify(text) {
    const n = $("notice");
    n.querySelector("span").textContent = text;
    n.hidden = false;
    if ($("actionDialog").open) $("actionError").textContent = text;
  }
  function action({
    title,
    content,
    submit = "保存",
    validate = () => null,
    save = () => true,
  }) {
    if ($("actionDialog").open) return Promise.resolve(false);
    const d = $("actionDialog");
    $("actionTitle").textContent = title;
    $("actionContent").innerHTML = content;
    $("actionSubmit").textContent = submit;
    $("actionError").textContent = "";
    return new Promise((resolve) => {
      let finished = false;
      function finish(value) {
        if (finished) return;
        finished = true;
        d.close();
        $("actionForm").onsubmit = null;
        d.oncancel = null;
        resolve(value);
      }
      $("actionCancel").onclick = () => finish(false);
      d.oncancel = (e) => {
        e.preventDefault();
        finish(false);
      };
      $("actionForm").onsubmit = async (e) => {
        e.preventDefault();
        const data = new FormData(e.target),
          error = validate(data);
        if (error) {
          $("actionError").textContent = error;
          return;
        }
        if ((await save(data)) === false) {
          if (!$("actionError").textContent)
            $("actionError").textContent =
              "保存できませんでした。入力と保存容量を確認してください。";
          return;
        }
        finish(true);
      };
      d.showModal();
      requestAnimationFrame(() => {
        const f = d.querySelector("[autofocus],input,button");
        f?.focus();
      });
    });
  }
  function confirmAction(title, description, submit) {
    return action({ title, content: `<p>${esc(description)}</p>`, submit });
  }
  function closeMapPanels() {
    for (const id of ["areaList", "layersPanel"]) $(id).hidden = true;
    for (const id of ["areaMenuBtn", "layersBtn"])
      $(id).setAttribute("aria-expanded", "false");
  }
  function toggleMapPanel(panel, button) {
    const open = $(panel).hidden;
    closeMapPanels();
    if (open) {
      $(panel).hidden = false;
      const shell = document.querySelector(".mapShell").getBoundingClientRect();
      const top = $(button).getBoundingClientRect().bottom - shell.top + 8;
      $(panel).style.top = top + "px";
      $(panel).style.maxHeight = Math.max(80, shell.height - top - 12) + "px";
      $(button).setAttribute("aria-expanded", "true");
    }
  }
  function beginAreaPicker() {
    if (areaPicker) return;
    const sh = $("selectedSheet");
    areaPicker = {
      chosen: state.areaFilter,
      area: state.area,
      layer: state.layer,
      x: mapCamera.x,
      y: mapCamera.y,
      scale: mapCamera.scale,
      sheetNodes: [...sh.childNodes],
      hidden: sh.hidden,
      classes: sh.className,
      scroll: sh.scrollTop,
      focus: sheetFocus,
      opener: document.activeElement,
    };
    setMarking(false);
    closeSheet();
    nav("map");
    setLayer("spots");
    document.querySelector(".mapShell").classList.add("pickingArea");
    $("areaPicker").hidden = false;
    sizeMapSheet();
    $("pickerCancel").onclick = () => finishAreaPicker(false);
    $("pickerConfirm").onclick = () => finishAreaPicker(true);
    previewArea(areaPicker.chosen);
    $("pickerCancel").focus({ preventScroll: true });
  }
  function previewArea(id) {
    if (!areaPicker) return;
    const area = db.areas.find((a) => a.id === id);
    areaPicker.chosen = area?.id || null;
    state.area = areaPicker.chosen;
    drawSpots();
    $("pickerPreview").textContent = area
      ? `${area.name} ／ ${depthText(area.id)}`
      : "海域の番号をタップしてください";
    $("pickerConfirm").disabled = !area;
    if (area)
      requestAnimationFrame(() => keepWorldPointVisible(area, $("areaPicker")));
  }

  function finishAreaPicker(confirm, navigate = true) {
    if (!areaPicker) return;
    const saved = areaPicker;
    areaPicker = null;
    if (confirm && saved.chosen) state.areaFilter = saved.chosen;
    $("areaPicker").hidden = true;
    document.querySelector(".mapShell").classList.remove("pickingArea");
    setLayer(saved.layer);
    closeMapPanels();
    state.area = saved.area;
    const sh = $("selectedSheet");
    sh.replaceChildren(...saved.sheetNodes);
    sh.hidden = saved.hidden;
    sh.className = saved.classes;
    sh.scrollTop = saved.scroll;
    document
      .querySelector(".mapShell")
      .classList.toggle("hasSheet", !saved.hidden);
    sheetFocus = saved.focus;
    mapCamera.x = saved.x;
    mapCamera.y = saved.y;
    mapCamera.scale = saved.scale;
    mapCamera.constrain();
    drawSpots();
    redrawMap();
    renderSpecies();
    if (navigate) {
      nav("species");
      saved.opener?.focus({ preventScroll: true });
    }
  }
  function closeSheet() {
    sheetFocus = null;
    const sh = $("selectedSheet");
    sh.hidden = true;
    sh.classList.remove("expanded");
    document.querySelector(".mapShell").classList.remove("hasSheet");
    state.area = null;
    if (mapCamera) drawSpots();
  }
  function keepWorldPointVisible(point, panel) {
    if (!mapCamera) return;
    const r = $("oceanSVG").getBoundingClientRect(),
      p = proj(point);
    const obstacles = [
      ...document.querySelectorAll(".mapToolbar,.maptools"),
      panel,
    ]
      .filter(
        (e) => e && !e.hidden && getComputedStyle(e).visibility !== "hidden",
      )
      .map((e) => {
        const b = e.getBoundingClientRect();
        return {
          left: b.left - r.left,
          right: b.right - r.left,
          top: b.top - r.top,
          bottom: b.bottom - r.top,
        };
      });
    const target = M.freePosition(
      mapCamera.width,
      mapCamera.height,
      obstacles,
      {
        x: (p.x - mapCamera.x) / mapCamera.scale,
        y: (p.y - mapCamera.y) / mapCamera.scale,
      },
    );
    if (!target) return;
    const { x: tx, y: ty } = target,
      limits = [
        p.x / Math.max(1, tx),
        (1050 - p.x) / Math.max(1, mapCamera.width - tx),
        p.y / Math.max(1, ty),
        (950 - p.y) / Math.max(1, mapCamera.height - ty),
      ];
    mapCamera.scale = Math.max(
      mapCamera.minScale,
      Math.min(mapCamera.scale, ...limits.map((v) => v * 0.98)),
    );
    mapCamera.x = p.x - tx * mapCamera.scale;
    mapCamera.y = p.y - ty * mapCamera.scale;
    mapCamera.constrain();
    redrawMap();
  }
  function presentSheet(point) {
    closeMapPanels();
    setMarking(false);
    const sh = $("selectedSheet");
    sh.hidden = false;
    sh.classList.remove("expanded");
    document.querySelector(".mapShell").classList.add("hasSheet");
    sh.scrollTop = 0;
    sizeMapSheet();
    const handle = sh.querySelector(".sheetHandle");
    let start = null,
      suppress = false;
    function expand(value) {
      sh.classList.toggle("expanded", value);
      handle.setAttribute("aria-expanded", String(value));
      handle.setAttribute(
        "aria-label",
        value ? "詳細をたたむ" : "詳細を広げる",
      );
      requestAnimationFrame(keepPointVisible);
    }
    handle.onclick = () => {
      if (suppress) {
        suppress = false;
        return;
      }
      expand(!sh.classList.contains("expanded"));
    };
    handle.onpointerdown = (e) => {
      start = e.clientY;
      handle.setPointerCapture(e.pointerId);
    };
    handle.onpointerup = (e) => {
      if (start != null && Math.abs(e.clientY - start) > 25) {
        suppress = true;
        expand(e.clientY < start);
      }
      start = null;
    };
    handle.onpointercancel = () => (start = null);
    sh.querySelector(".sheetClose").onclick = closeSheet;
    function keepPointVisible() {
      if (!sh.hidden) keepWorldPointVisible(point, sh);
    }
    sheetFocus = keepPointVisible;
    requestAnimationFrame(keepPointVisible);
  }
  function showFishModal() {
    modalOpener = document.activeElement;
    $("modal").hidden = false;
    for (const node of $("app").children)
      if (node !== $("modal")) node.inert = true;
    $("modalClose").focus();
  }
  function hideFishModal() {
    $("modal").hidden = true;
    for (const node of $("app").children) node.inert = false;
    if (modalOpener?.isConnected) modalOpener.focus({ preventScroll: true });
    else $("speciesSearch").focus({ preventScroll: true });
  }
  async function openPhoto(src, caption) {
    const d = $("photoViewer"),
      image = $("photoImage");
    $("photoCaption").textContent = caption;
    const probe = new Image();
    probe.src = src;
    try {
      await probe.decode();
    } catch {
      notify("写真を読み込めません。通信状況を確認してください。");
      return;
    }
    if (d.open) return;
    image.setAttribute("href", src);
    image.setAttribute("width", probe.naturalWidth);
    image.setAttribute("height", probe.naturalHeight);
    d.showModal();
    const stage = $("photoStage"),
      r = stage.getBoundingClientRect();
    photoCamera = new SeaborniaGestures.Camera(r.width, r.height, {
      width: probe.naturalWidth,
      height: probe.naturalHeight,
    });
    const render = () =>
      stage.setAttribute("viewBox", photoCamera.viewBox().join(" "));
    photoBinding = SeaborniaGestures.bind(stage, photoCamera, {
      render,
      doubleTap: () => {
        photoCamera.reset();
        render();
      },
    });
    $("photoZoomIn").onclick = () => {
      photoCamera.zoom(0.7);
      render();
    };
    $("photoZoomOut").onclick = () => {
      photoCamera.zoom(1 / 0.7);
      render();
    };
    $("photoReset").onclick = () => {
      photoCamera.reset();
      render();
    };
    render();
    $("photoClose").focus();
  }
  function closePhoto() {
    if ($("photoViewer").open) $("photoViewer").close();
    photoBinding?.destroy();
    photoBinding = null;
    photoCamera = null;
  }
  function setupUX() {
    try {
      const p = JSON.parse(localStorage.getItem("seabornia-period-v1"));
      if (
        p &&
        Number.isInteger(p.year) &&
        p.year >= 2024 &&
        p.year <= year + 1 &&
        Number.isInteger(p.month) &&
        p.month >= 1 &&
        p.month <= 12
      ) {
        state.year = p.year;
        state.month = p.month;
      }
    } catch {}
    const group = document.createElement("label");
    group.className = "mobileGroupLabel";
    group.innerHTML =
      '魚種<select id="mobileGroup" aria-label="魚種グループ">' +
      $("groupFilter").innerHTML +
      "</select>";
    document.querySelector(".mobileFilters").append(group);
    for (const b of document.querySelectorAll(".rangeBtn,.layer"))
      b.setAttribute("aria-pressed", String(b.classList.contains("active")));
    $("squidOnly").setAttribute("aria-pressed", "false");
    $("clearReportArea").onclick = () => {
      state.reportArea = null;
      renderReports();
    };
    $("conditionsMode").onclick = () => {
      state.reportMode = "conditions";
      renderReports();
    };
    $("recentMode").onclick = () => {
      state.reportMode = "recent";
      renderReports();
    };
    $("monthlyMode").onclick = () => {
      state.reportMode = "month";
      renderReports();
    };
    $("notice").querySelector("button").onclick = () =>
      ($("notice").hidden = true);
    $("modalContent").addEventListener("click", (e) => {
      const hero = e.target.closest(".modalHero");
      if (hero) {
        const image = hero.querySelector("img");
        if (image && !image.hidden && image.currentSrc)
          openPhoto(image.currentSrc, image.alt);
      }
    });
    $("photoClose").onclick = closePhoto;
    $("photoViewer").addEventListener("close", () => {
      photoBinding?.destroy();
      photoBinding = null;
      photoCamera = null;
    });
    window.addEventListener("resize", () => {
      if (photoCamera && $("photoViewer").open) {
        const r = $("photoStage").getBoundingClientRect();
        photoCamera.resize(r.width, r.height);
        $("photoStage").setAttribute(
          "viewBox",
          photoCamera.viewBox().join(" "),
        );
      }
    });
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        !$("actionDialog").open &&
        !$("photoViewer").open
      ) {
        closeMapPanels();
        if (!$("selectedSheet").hidden) closeSheet();
        if (markingMode) setMarking(false);
      }
      if (
        e.key === "Tab" &&
        !$("modal").hidden &&
        !$("photoViewer").open &&
        !$("actionDialog").open
      ) {
        const nodes = [
            ...$("modal").querySelectorAll(
              'button,a[href],input,select,[tabindex="0"]',
            ),
          ].filter((n) => !n.disabled && !n.hidden),
          first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".mapToolbar,.areaList,.layersPanel"))
        closeMapPanels();
    });
    if (window.visualViewport) {
      const update = () => {
        const keyboard =
          document.activeElement?.matches("input,textarea,select") &&
          window.visualViewport.height < window.innerHeight * 0.78;
        document.body.classList.toggle("keyboardOpen", !!keyboard);
      };
      window.visualViewport.addEventListener("resize", update);
      document.addEventListener("focusout", () =>
        requestAnimationFrame(update),
      );
    }
  }

  setup();
})();
