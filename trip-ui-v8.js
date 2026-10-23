/* Public conditions UI. Private coordinates are only compared locally. */
window.SeaborniaTripUI = function (api) {
  "use strict";
  const T = SeaborniaTrip,
    $ = (id) => document.getElementById(id),
    BASEKEY = "seabornia-trip-v1";
  let KEY = BASEKEY;
  const esc = api.esc;
  let prefs = {
    speed: null,
    date: T.jstDate(),
    hour: "09:00",
    area: "marina",
    departureDate: "",
    departureTime: "",
    returnDate: "",
    returnTime: "",
  };
  let conditions = null,
    tides = null,
    offline = false,
    loading = false,
    requested = false,
    acknowledged = "";
  const fmt = (v) => api.localTime(v);
  const num = (v, unit = "", digits = 1) =>
    Number.isFinite(v) ? v.toFixed(digits) + unit : "取得なし";
  const allAreas = () => [
    ...api.db().areas,
    { ...api.db().marina, id: "marina" },
  ];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && validPrefs(saved)) prefs = { ...prefs, ...saved };
  } catch {}
  function validPrefs(p, anyArea = false) {
    return (
      p &&
      typeof p === "object" &&
      (p.speed === null || T.speed(p.speed) !== null) &&
      (!p.date || Number.isFinite(T.epoch(p.date))) &&
      (!p.hour || T.validTime(p.hour)) &&
      ["departureDate", "returnDate"].every(
        (k) => !p[k] || Number.isFinite(T.epoch(p[k])),
      ) &&
      ["departureTime", "returnTime"].every(
        (k) => !p[k] || T.validTime(p[k]),
      ) &&
      (!p.area || anyArea || allAreas().some((a) => a.id === p.area))
    );
  }
  function savePrefs(next) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      prefs = next;
      return true;
    } catch {
      api.notify(
        "釣行設定を保存できません。端末の保存容量を確認してください。",
      );
      return false;
    }
  }
  function formMarkup() {
    return `<form id="tripForm" class="tripForm">
      <label class="wide">海域<select id="tripArea">${allAreas()
        .map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)
        .join("")}</select></label>
      <label class="dateTimeField">釣行日（日本時間）<input type="date" id="tripDate" required></label>
      <label class="dateTimeField">確認する時刻（日本時間）<input type="time" id="tripHour" required></label>
      <div class="wide"><details class="tripSettings" id="boatSettings"><summary id="speedSummary">巡航速度を設定</summary><div class="tripForm">
        <label class="wide">巡航速度（kn）<input id="cruiseSpeed" type="number" min="1" max="60" step="0.1" placeholder="未設定・例 15" inputmode="decimal"><small>船に合わせて1〜60 knで入力。空欄で未設定に戻せます。</small></label>
        <label class="dateTimeField">出発日（任意）<input id="departureDate" type="date"></label><label class="dateTimeField">出発時刻（任意・日本時間）<input id="departureTime" type="time"></label>
        <label class="dateTimeField">帰港予定日（任意）<input id="returnDate" type="date"></label><label class="dateTimeField">帰港予定時刻（任意・日本時間）<input id="returnTime" type="time"></label>
      </div><p class="micro">直線移動の目安です。港内減速・迂回・風波で実際の所要時間は変わります。帰港通知はアプリを開いている間のみ。バックグラウンド通知はありません。</p></details></div>
      <div class="wide"><button type="submit" class="primaryButton">釣行設定を保存</button> <button type="button" id="conditionsRefresh" class="ghostButton">海況データを確認</button><p role="status" id="tripSaveStatus"></p></div>
    </form>`;
  }
  function fillForm() {
    const pairs = {
      tripArea: "area",
      tripDate: "date",
      tripHour: "hour",
      cruiseSpeed: "speed",
      departureDate: "departureDate",
      departureTime: "departureTime",
      returnDate: "returnDate",
      returnTime: "returnTime",
    };
    Object.entries(pairs).forEach(
      ([id, key]) => ($(id).value = prefs[key] ?? ""),
    );
    $("speedSummary").textContent = prefs.speed
      ? `巡航速度：${prefs.speed} kn・出発／帰港の設定`
      : "船速を設定・出発／帰港の設定";
  }
  function open(area, date, time) {
    api.nav("plan");
    if (area && allAreas().some((a) => a.id === area))
      $("tripArea").value = area;
    if (date) $("tripDate").value = date;
    if (time) $("tripHour").value = time;
    render();
    $("planView").scrollTop = 0;
  }
  function travel(point, compact = false) {
    const km = T.distance(point, api.db().marina),
      start = T.epoch(prefs.departureDate, prefs.departureTime);
    const result = T.eta(km, prefs.speed, start);
    if (!result)
      return compact
        ? "船速未設定"
        : `<span class="etaText"><button type="button" data-speed-settings>船速を設定</button></span>`;
    return compact
      ? `約${result.minutes}分`
      : `<span class="etaText">直線移動の目安：約${result.minutes}分（${prefs.speed} kn）${result.arrival ? `<br>到着目安 ${esc(fmt(result.arrival))}` : ""}</span>`;
  }
  function tideSummary(date, time) {
    const v = T.tideAt(tides, date, time);
    return v
      ? `${esc(v.name)}${time ? "・" + esc(v.phase || "潮位変化は不明") : "・釣れた時刻不明"}`
      : `潮汐データなし${time ? "" : "・釣れた時刻不明"}`;
  }
  const station = () =>
    tides?.station || api.marina()?.tideStation?.name || "地域の潮汐・未取得";
  let activeTrip = null;
  try {
    activeTrip = JSON.parse(localStorage.getItem("seabornia-active-trip-v1"));
  } catch {}
  if (
    !activeTrip &&
    Number.isFinite(T.epoch(prefs.returnDate, prefs.returnTime))
  )
    activeTrip = {
      marinaId: SeaStyleMarinas.HOME,
      name: "シーボニア",
      at: T.epoch(prefs.returnDate, prefs.returnTime),
    };
  function publicContext(r) {
    return `<div class="tideContext"><button type="button" data-tide-date="${esc(r.date)}">${tideSummary(r.date)}<small>${esc(station())}・当日の地域参考を見る →</small></button></div>`;
  }
  function privateContext(c) {
    const s = c.conditions;
    return `<div class="tideContext"><small>${c.time ? esc(c.time) + " JST" : "釣れた時刻不明"} · ${s?.tide ? esc(s.tide.name) + " / " + esc(s.tide.phase || "潮位変化は不明") : "保存した潮汐条件なし"}${s?.forecast ? "<br>近隣予報：" + esc(s.forecast.area) + " / Open-Meteo・" + esc(fmt(s.forecast.validAt)) : "<br>保存した風・波の予報なし"}</small>${s ? `<button type="button" data-snapshot="${esc(c.id)}">保存した条件・出典を見る</button>` : ""}</div>`;
  }
  const metric = (label, value, detail = "") =>
    `<div class="conditionMetric"><span>${label}</span><b>${value}</b><small>${detail}</small></div>`;
  function freshness(part, status, title) {
    const label = {
      current: "取得済みの予報",
      delayed: "更新遅延・古い予報です",
      expired: "予報期限切れ",
      unavailable: "指定日時の予報なし",
    }[status];
    return `<p class="${status === "current" ? "conditionsSource" : "conditionsStatus"}">${title}：${label}${part?.status === "failed" ? "・前回の更新に失敗" : ""}<br>取得成功 ${part?.fetchedAt ? esc(fmt(part.fetchedAt)) : "未取得"}</p>`;
  }
  function tideMarkup(date, time, id = "trip") {
    const day = tides?.days?.[date],
      v = T.tideAt(tides, date, time);
    if (!day)
      return `<article class="tideCard"><h3>${esc(station())}</h3><p class="empty">この日の潮汐データはありません。近日分と公開釣果の日付を収集しています。</p><p class="conditionsSource"><a href="https://tide736.net/" target="_blank" rel="noopener">tide736で確認 ↗</a></p></article>`;
    const curve = day.curve,
      min = Math.floor(Math.min(...curve.map((p) => p.cm)) / 20) * 20,
      max = Math.ceil(Math.max(...curve.map((p) => p.cm)) / 20) * 20;
    const x = (at) => 45 + ((at - T.epoch(date)) / 86400000) * 485,
      y = (cm) => 145 - ((cm - min) / Math.max(20, max - min)) * 120;
    const points = curve
      .map(
        (p, i) =>
          (i ? "L" : "M") + x(p.at).toFixed(1) + " " + y(p.cm).toFixed(1),
      )
      .join(" ");
    const tick = Number.isFinite(T.epoch(date, time))
      ? T.epoch(date, time)
      : T.epoch(date, "12:00");
    const event = (e) =>
      e
        ? `${T.jstDate(e.at) === date ? "" : T.jstDate(e.at).slice(5) + " "}${T.jstTime(e.at)} · ${num(e.cm, "cm", 0)}`
        : "収録範囲外";
    return `<article class="tideCard"><h3>${esc(day.name)} <small>${esc(station())}</small></h3><svg class="tideChart" role="img" aria-label="${esc(date)}の推算潮位曲線、単位センチメートル" viewBox="0 0 550 180"><text x="3" y="25">${max}</text><text x="3" y="148">${min}</text><path class="tideLine" d="${points}"/><line id="${id}TideCursor" x1="${x(tick)}" x2="${x(tick)}" y1="15" y2="148" stroke="#b26a16" stroke-width="2"/>${[0, 6, 12, 18, 24].map((h) => `<text x="${Math.min(514, 40 + (h / 24) * 485)}" y="170">${h}時</text>`).join("")}</svg>
    <label for="${id}TideSlider">曲線の時刻を動かす（日本時間）</label><input class="tideSlider" id="${id}TideSlider" type="range" min="0" max="1439" step="1" value="${Math.round((tick - T.epoch(date)) / 60000)}"><output class="tideReadout" id="${id}TideReadout"></output>
    <div class="tideEvents"><span>次の満潮 ${event(v?.nextHigh)}</span><span>次の干潮 ${event(v?.nextLow)}</span></div>
    <p class="conditionsSource">${time ? "選択時刻 " + esc(time) + " · " + esc(v?.phase || "潮位変化は不明") : "釣れた時刻不明。曲線は当日の参考で、釣れた時間を示しません。"}<br>潮位の上げ下げは実際の潮流と異なります。満干潮は観測した潮止まりではありません。<br><a href="https://tide736.net/" target="_blank" rel="noopener">tide736（${esc(station())}）↗</a> · 取得 ${esc(fmt(day.fetchedAt))}</p></article>`;
  }
  function bindCurve(date, prefix = "trip") {
    const slider = $(prefix + "TideSlider");
    if (!slider) return;
    const update = () => {
      const minute = +slider.value,
        time =
          String(Math.floor(minute / 60)).padStart(2, "0") +
          ":" +
          String(minute % 60).padStart(2, "0"),
        v = T.tideAt(tides, date, time);
      $(prefix + "TideReadout").textContent =
        `参考時刻 ${time} · ${num(v?.height, "cm", 0)} · ${v?.phase || "潮位変化は不明"}`;
      $(prefix + "TideCursor").setAttribute("x1", 45 + (minute / 1440) * 485);
      $(prefix + "TideCursor").setAttribute("x2", 45 + (minute / 1440) * 485);
    };
    slider.oninput = update;
    update();
  }
  function render() {
    const areaId = $("tripArea").value,
      date = $("tripDate").value,
      time = $("tripHour").value;
    const a = allAreas().find((a) => a.id === areaId),
      area = conditions?.areas?.[areaId],
      f = T.forecast(area, date, time);
    const w = f?.weather,
      m = f?.marine;
    $("tripTravel").innerHTML = a
      ? `<strong>${esc(a.name)}</strong> · 直線 ${T.distance(a, api.db().marina).toFixed(1)}km / ${(T.distance(a, api.db().marina) / 1.852).toFixed(1)}海里${travel(a)}<small>港内減速・迂回・風波で実際の移動時間は変わります。</small>`
      : "";
    $("forecastContent").innerHTML =
      `<article class="conditionsCard"><h3>風と天気</h3>${freshness(area?.weather, f?.weatherStatus || "unavailable", "天気")}<div class="conditionMetrics">${metric("風速", num(w?.wind_speed_10m, " m/s"), T.wind(w?.wind_direction_10m))}${metric("最大瞬間風速（予報）", num(w?.wind_gusts_10m, " m/s"))}${metric("雨", num(w?.precipitation, " mm"), num(w?.precipitation_probability, "%", 0) + " の降水確率")}${metric("気温", num(w?.temperature_2m, "℃"))}</div><p class="conditionsSource">対象 ${esc(date)} ${esc(time)} JST。地域の格子予報です。現地の観測ではありません。<br><a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo Weather（CC BY 4.0）↗</a></p></article>
    <article class="conditionsCard"><h3>波と日照</h3>${freshness(area?.marine, f?.marineStatus || "unavailable", "波")}<div class="conditionMetrics">${metric("有義波高", num(m?.wave_height, " m"), "最大の波高ではありません")}${metric("波の周期", num(m?.wave_period, " 秒"))}${metric("日の出", f?.daylight?.sunrise?.slice(11, 16) || tides?.days?.[date]?.sunrise || "取得なし", "日本時間")}${metric("日の入り", f?.daylight?.sunset?.slice(11, 16) || tides?.days?.[date]?.sunset || "取得なし", "日本時間")}</div><p class="conditionsSource">沿岸の局所的な風波と異なる場合があります。<br><a href="https://open-meteo.com/en/docs/marine-weather-api" target="_blank" rel="noopener">Open-Meteo Marine（CC BY 4.0）↗</a></p></article>`;
    $("tripTide").innerHTML = tideMarkup(date, time);
    bindCurve(date);
    $("conditionsDataStatus").textContent = loading
      ? "海況を確認中…"
      : !conditions
        ? "海況データを取得できません。再確認してください。"
        : `${offline ? "端末の保存済みデータ。" : "公開データを確認。"}収集確認 ${fmt(conditions.checkedAt)}。表示は予報・推算です。`;
    updateReminder();
  }
  function updateReminder() {
    const at = activeTrip?.at,
      r = T.reminder(at);
    $("returnCard").hidden = !r;
    if (!r) return;
    $("returnCountdown").textContent = r.overdue
      ? "帰港予定時刻を過ぎています"
      : `帰港予定まで ${Math.floor(r.minutes / 60)}時間${r.minutes % 60}分`;
    $("returnDetails").textContent =
      `${activeTrip?.name || ""} · ${fmt(at)} · アプリを開いている間のみ確認します。`;
    $("returnCard").classList.toggle("reminderDue", r.due || r.overdue);
    if (
      (r.due || r.overdue) &&
      acknowledged !== String(at) &&
      !document.hidden
    ) {
      acknowledged = String(at);
      api.notify(
        r.overdue
          ? "帰港予定時刻を過ぎています。帰港予定をご確認ください。"
          : "帰港予定まで15分以内です。帰港の準備をご確認ください。",
      );
    }
  }
  async function load(manual = false) {
    if (loading) return;
    loading = true;
    render();
    const contextId = api.marinaId();
    let failed = false;
    offline = false;
    for (const name of ["conditions", "tides"]) {
      try {
        const file =
          contextId === SeaStyleMarinas.HOME
            ? `./data/${name}.json`
            : name === "conditions"
              ? `./data/marinas/${contextId}-conditions.json`
              : api.marina()?.tideStation
                ? `./data/tide-stations/${api.marina().tideStation.id}.json`
                : null;
        if (!file) throw Error("station unavailable");
        const response = await fetch(file + `?ts=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok) throw Error("HTTP");
        const j = await response.json();
        if (contextId !== api.marinaId()) return;
        if (
          j.schema_version !== 1 ||
          !(name === "conditions" ? j.areas : j.days)
        )
          throw Error("data");
        if (name === "conditions") conditions = j;
        else tides = j;
        if (response.headers.get("X-Seabornia-Cache") === "offline")
          offline = true;
      } catch {
        failed = true;
      }
    }
    if (contextId !== api.marinaId()) return;
    loading = false;
    requested = true;
    if (failed) offline = true;
    render();
    api.changed();
    renderExplorer();
    if (manual)
      api.notify(
        failed
          ? "海況の通信に失敗しました。取得済みの情報があれば表示します。取得時刻をご確認ください。"
          : offline
            ? "保存済みの海況です。取得時刻をご確認ください。"
            : "公開海況データを確認しました。収集の取得時刻をご確認ください。",
      );
  }
  function explorerMarkup() {
    $("conditionsExplorer").innerHTML =
      `<div class="comparisonIntro"><h3>どんな条件で記録された？</h3><p>公開報告と個人記録を分けて確認します。件数は記録の標本数です。釣行時間・釣れなかった出船がないため、成功率や「一番釣れる潮」は算出しません。</p><div class="fieldGrid"><label>魚種<select id="compareFish"><option value="">すべて</option></select></label><label class="dateTimeField">開始日<input id="compareStart" type="date"></label><label class="dateTimeField">終了日<input id="compareEnd" type="date"></label></div><button class="ghostButton" type="button" id="clearComparison">条件をクリア</button></div><div id="comparisonResults"></div>`;
    $("conditionsExplorer").addEventListener("input", renderExplorer);
    $("clearComparison").onclick = () => {
      ["compareFish", "compareStart", "compareEnd"].forEach(
        (id) => ($(id).value = ""),
      );
      renderExplorer();
    };
  }
  function renderExplorer() {
    if (!$("compareFish")) return;
    const choice = $("compareFish").value,
      opts = [
        ...new Set([
          ...api.db().reports.map((r) => r.fish),
          ...api.catches().map((c) => c.fish),
        ]),
      ].sort();
    $("compareFish").innerHTML =
      '<option value="">すべて</option>' +
      opts.map((f) => `<option>${esc(f)}</option>`).join("");
    $("compareFish").value = choice;
    const start = $("compareStart").value,
      end = $("compareEnd").value,
      fish = $("compareFish").value;
    const area = api.reportArea();
    const matches = (r) =>
      (!fish || r.fish === fish) &&
      (!start || r.date >= start) &&
      (!end || r.date <= end) &&
      r.date <= T.jstDate();
    const pub = api
        .db()
        .reports.filter((r) => matches(r) && (!area || r.area_id === area.id)),
      mine = api.catches().filter(matches);
    const group = (rows, personal) => {
      const groups = new Map();
      rows.forEach((r) => {
        const key = personal
          ? r.conditions?.tide
            ? r.conditions.tide.name +
              " / " +
              (r.conditions.tide.phase || "変化不明")
            : "潮汐条件なし"
          : (tides?.days?.[r.date]?.name || "潮汐データなし") + " / 時刻不明";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      });
      return (
        [...groups]
          .map(
            ([key, list]) =>
              `<details class="comparisonGroup"><summary>${esc(key)} · ${list.length}件</summary>${list.map((r) => `<div class="comparisonRecord"><b>${esc(r.date)} ${esc(r.fish)}</b><br>${personal ? "記録数量 " + esc(r.count) + " · " + (r.time ? esc(r.time) + " JST" : "釣れた時刻不明") : "報告数量 " + esc(r.amount || "記載なし") + " · 釣れた時刻不明"}<br>${personal ? `<button type="button" class="ghostButton" data-personal-record="${esc(r.id)}">個人記録へ →</button>` : `<a href="${/^https:\/\//.test(r.source || "") ? esc(r.source) : "#"}" target="_blank" rel="noopener">${esc(r.source_name || "元の公開報告")} ↗</a> ${publicContext(r)}`}</div>`).join("")}</details>`,
          )
          .join("") || '<p class="empty">この条件の記録はありません。</p>'
      );
    };
    $("comparisonResults").innerHTML =
      `${start && end && start > end ? '<p class="conditionsStatus">開始日を終了日以前にしてください。</p>' : ""}<section class="comparisonSection"><h3>公開報告 · ${pub.length}件</h3><p class="micro">${esc(station())}の当日参考。釣果地点の潮や釣れた時刻を示しません。数量は報告どおりで合算しません。</p>${group(pub, false)}</section><section class="comparisonSection"><h3>個人記録 · ${mine.length}件</h3><p class="micro">端末に保存した条件のみを使用。未取得の過去条件は不明のままです。</p>${group(mine, true)}</section>`;
  }
  async function showSnapshot(c) {
    const s = c.conditions,
      f = s.forecast,
      t = s.tide;
    const values = f
      ? `<p>近隣の公開予報エリア：${esc(f.area)}（記録位置の観測ではありません）<br>対象 ${esc(fmt(f.validAt))}<br>風 ${num(f.weather?.wind_speed_10m, "m/s")} / 突風 ${num(f.weather?.wind_gusts_10m, "m/s")} / 雨 ${num(f.weather?.precipitation, "mm")}<br>有義波高 ${num(f.marine?.wave_height, "m")} / 周期 ${num(f.marine?.wave_period, "秒")}<br>Open-Meteo · 天気取得 ${esc(fmt(f.weatherFetchedAt))} / 波取得 ${esc(fmt(f.marineFetchedAt))}</p>`
      : "<p>保存した風・波の予報はありません。</p>";
    api.action({
      title: c.date + " " + (c.time || "時刻不明") + " の保存条件",
      content: `<p>保存 ${esc(fmt(s.capturedAt))}</p>${t ? `<p>${esc(t.station)} · ${esc(t.name)} · ${esc(t.phase || "潮位変化は不明")}<br>tide736 · 推算取得 ${esc(fmt(t.fetchedAt))}</p>` : "<p>保存した潮汐条件はありません。</p>"}${values}<p class="micro">予報・潮位推算は実測値や実際の潮流ではありません。</p>`,
      submit: "閉じる",
    });
  }
  function mount() {
    $("conditionsApp").innerHTML =
      `<article class="conditionsCard">${formMarkup()}<p id="conditionsDataStatus" role="status" class="conditionsSource"></p><a href="https://www.jma.go.jp/bosai/map.html?contents=seawarning" target="_blank" rel="noopener">気象庁・海上警報を確認 ↗</a></article><article class="conditionsCard" id="tripTravel"></article><article class="returnCard" id="returnCard" hidden><p id="returnCountdown" role="status" aria-live="off"></p><p id="returnDetails"></p></article><div class="tripForecastGrid" id="forecastContent"></div><div id="tripTide"></div>`;
    fillForm();
    explorerMarkup();
    $("tripForm").onsubmit = async (e) => {
      e.preventDefault();
      const next = {
        speed: T.speed($("cruiseSpeed").value),
        area: $("tripArea").value,
        date: $("tripDate").value,
        hour: $("tripHour").value,
        departureDate: $("departureDate").value,
        departureTime: $("departureTime").value,
        returnDate: $("returnDate").value,
        returnTime: $("returnTime").value,
      };
      if (($("cruiseSpeed").value && !next.speed) || !validPrefs(next)) {
        $("tripSaveStatus").textContent = "船速・日時を確認してください。";
        return;
      }
      if (
        Boolean(next.departureDate) !== Boolean(next.departureTime) ||
        Boolean(next.returnDate) !== Boolean(next.returnTime)
      ) {
        $("tripSaveStatus").textContent =
          "出発・帰港を使う場合は、日付と時刻の両方を入力してください。";
        return;
      }
      const nextAt = T.epoch(next.returnDate, next.returnTime);
      if (
        activeTrip?.marinaId !== api.marinaId() &&
        Number.isFinite(activeTrip?.at) &&
        Number.isFinite(nextAt) &&
        !(await api.confirmReplaceTrip(activeTrip.name))
      )
        return;
      if (savePrefs(next)) {
        if (Number.isFinite(nextAt)) {
          activeTrip = {
            marinaId: api.marinaId(),
            name: api.db().marina.name,
            at: nextAt,
          };
        } else if (activeTrip?.marinaId === api.marinaId()) activeTrip = null;
        try {
          localStorage.setItem(
            "seabornia-active-trip-v1",
            JSON.stringify(activeTrip),
          );
        } catch {
          api.notify("帰港予定を保存できません。");
        }
        fillForm();
        render();
        api.changed();
        $("tripSaveStatus").textContent = "この端末に釣行設定を保存しました。";
      }
    };
    for (const id of ["tripArea", "tripDate", "tripHour"])
      $(id).onchange = render;
    $("conditionsRefresh").onclick = () => load(true);
    $("mapConditions").onclick = () => open(api.selectedArea() || prefs.area);
    document.addEventListener("click", (e) => {
      const b = e.target.closest(
        "[data-speed-settings],[data-open-conditions],[data-tide-date],[data-snapshot],[data-personal-record]",
      );
      if (!b) return;
      if (b.hasAttribute("data-speed-settings")) {
        open();
        $("boatSettings").open = true;
        $("cruiseSpeed").focus();
      }
      if (b.dataset.openConditions) open(b.dataset.openConditions);
      if (b.dataset.tideDate) {
        api.action({
          title: b.dataset.tideDate + " · 公開釣果の参考潮汐",
          content: tideMarkup(b.dataset.tideDate, null, "report"),
          submit: "閉じる",
        });
        bindCurve(b.dataset.tideDate, "report");
      }
      if (b.dataset.snapshot) {
        const c = api.catches().find((c) => c.id === b.dataset.snapshot);
        if (c?.conditions) showSnapshot(c);
      }
      if (b.dataset.personalRecord) {
        api.nav("log");
        const target = document.querySelector(
          `[data-record-id="${CSS.escape(b.dataset.personalRecord)}"]`,
        );
        target?.scrollIntoView({ block: "center" });
        target?.focus({ preventScroll: true });
      }
    });
    render();
    load();
    setInterval(() => {
      if (!document.hidden) updateReminder();
    }, 15000);
    setInterval(() => {
      if (!document.hidden) load();
    }, 600000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        updateReminder();
        if (requested) load();
      }
    });
  }
  mount();
  return {
    load,
    switchMarina: (id) => {
      try {
        activeTrip = JSON.parse(
          localStorage.getItem("seabornia-active-trip-v1"),
        );
      } catch {
        activeTrip = null;
      }
      KEY = id === SeaStyleMarinas.HOME ? BASEKEY : BASEKEY + ":" + id;
      prefs = {
        speed: null,
        date: T.jstDate(),
        hour: "09:00",
        area: "marina",
        departureDate: "",
        departureTime: "",
        returnDate: "",
        returnTime: "",
      };
      try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && validPrefs(saved)) prefs = { ...prefs, ...saved };
      } catch {}
      conditions = null;
      tides = null;
      loading = false;
      requested = false;
      $("tripArea").innerHTML = allAreas()
        .map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)
        .join("");
      fillForm();
      render();
    },
    travel,
    pointConditions: (p) => {
      const a = T.nearby(p, Object.values(conditions?.areas || {}));
      return a
        ? `<p class="conditionsSource">近隣の公開予報：${esc(a.name)}（この地点の観測ではありません）</p><button class="ghostButton" data-open-conditions="${esc(a.id)}">近隣の海況を見る</button>`
        : '<p class="conditionsSource">海況の対象範囲外です。この地点の予報はありません。</p>';
    },
    publicContext,
    privateContext,
    renderExplorer,
    render,
    snapshot: (p, d, t) => T.snapshot(conditions, tides, p, d, t),
    validPrefs,
    preferences: () => ({ ...prefs }),
    importPreferences: (p) => {
      prefs = { ...prefs, ...p };
      fillForm();
      render();
    },
    get key() {
      return KEY;
    },
  };
};
