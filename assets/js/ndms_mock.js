/* NDMS Linkage Layer (local)
 * - 목적: NDMS 급경사지통합시스템 "연계"가 동작하는 것처럼 보이게 하는 로컬 스토리지 기반 Mock
 * - 제약: 서버/인증/망연계 없음. UI 연출/시연용.
 */
(function () {
  "use strict";

  const KEY = {
    MASTER: "ndms_master_sites_v1",
    EVENTS: "ndms_events_v1",
    MEASUREMENTS: "ndms_measurements_v1",
    SYNC_META: "ndms_sync_meta_v1",
    POLICY: "ndms_policy_v1",
    SEED: "ndms_seed_v1",
    AUTO_META: "ndms_auto_meta_v1",
  };

  function nowIso() {
    const d = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function safeJsonParse(raw, fallback) {
    try {
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  const STORE = (function () {
    // 1) localStorage 우선
    function localOk() {
      try {
        const k = "__ndms_ls_test__";
        localStorage.setItem(k, "1");
        localStorage.removeItem(k);
        return true;
      } catch {
        return false;
      }
    }

    // 2) localStorage가 막힌 환경(iframe/정책 등)에서는 window.name을 사용해 "탭 내 페이지 이동"에서도 유지
    const NAME_PREFIX = "__NDMS_STORE__=";
    function nameOk() {
      try {
        const cur = String(window.name ?? "");
        return cur === "" || cur.startsWith(NAME_PREFIX);
      } catch {
        return false;
      }
    }

    function loadNameMap() {
      try {
        const cur = String(window.name ?? "");
        if (!cur || !cur.startsWith(NAME_PREFIX)) return {};
        const payload = cur.slice(NAME_PREFIX.length);
        const json = decodeURIComponent(payload);
        const m = safeJsonParse(json, {});
        return m && typeof m === "object" ? m : {};
      } catch {
        return {};
      }
    }

    function saveNameMap(map) {
      try {
        const json = JSON.stringify(map || {});
        window.name = NAME_PREFIX + encodeURIComponent(json);
        return true;
      } catch {
        return false;
      }
    }

    // 3) 최후: 메모리(새로고침/페이지 이동 시 유지 불가)
    const mem = {};

    const useLocal = localOk();
    const useName = !useLocal && nameOk();

    return {
      getItem(key) {
        const k = String(key ?? "");
        if (!k) return null;
        if (useLocal) {
          try { return localStorage.getItem(k); } catch { return null; }
        }
        if (useName) {
          const map = loadNameMap();
          return Object.prototype.hasOwnProperty.call(map, k) ? String(map[k]) : null;
        }
        return Object.prototype.hasOwnProperty.call(mem, k) ? String(mem[k]) : null;
      },
      setItem(key, value) {
        const k = String(key ?? "");
        if (!k) return false;
        const v = String(value ?? "");
        if (useLocal) {
          try { localStorage.setItem(k, v); return true; } catch { return false; }
        }
        if (useName) {
          const map = loadNameMap();
          map[k] = v;
          return saveNameMap(map);
        }
        mem[k] = v;
        return true;
      },
    };
  })();

  function safeGet(key, fallback) {
    try {
      const v = STORE.getItem(key);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      return STORE.setItem(key, value);
    } catch {
      return false;
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // deterministic hash (fnv1a32)
  function fnv1a32(str) {
    let h = 0x811c9dc5;
    const s = String(str ?? "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function hash01(str) {
    return (fnv1a32(str) % 1000000) / 1000000;
  }

  function randomId(prefix) {
    const t = Date.now().toString(36);
    const r = Math.floor(Math.random() * 1e9).toString(36);
    return `${prefix || "id"}_${t}_${r}`;
  }

  function ensureSeed() {
    const cur = safeGet(KEY.SEED, "");
    if (cur) return cur;
    const next = randomId("seed");
    safeSet(KEY.SEED, next);
    return next;
  }

  function defaultPolicy() {
    return {
      network: "승인 IP 기반(행정망) 우선",
      roleModel: "관리자/일반 사용자",
      note: "실제 연계 시 IP 허용/보안 정책 준수 필요",
    };
  }

  function ensureInit() {
    ensureSeed();
    const policy = safeJsonParse(safeGet(KEY.POLICY, ""), null);
    if (!policy) safeSet(KEY.POLICY, JSON.stringify(defaultPolicy()));
    const events = safeJsonParse(safeGet(KEY.EVENTS, ""), null);
    if (!Array.isArray(events)) safeSet(KEY.EVENTS, JSON.stringify([]));
    const m = safeJsonParse(safeGet(KEY.MEASUREMENTS, ""), null);
    if (!m || typeof m !== "object") safeSet(KEY.MEASUREMENTS, JSON.stringify({ bySiteId: {} }));
    const meta = safeJsonParse(safeGet(KEY.SYNC_META, ""), null);
    if (!meta) safeSet(KEY.SYNC_META, JSON.stringify({ lastSync: null, masterSource: null }));
    const auto = safeJsonParse(safeGet(KEY.AUTO_META, ""), null);
    if (!auto) safeSet(KEY.AUTO_META, JSON.stringify({ lastTickAt: null, tickIntervalMs: 15000 }));
  }

  function normalizeSite(raw) {
    const id = String(raw?.id ?? raw?.siteId ?? "");
    const name = String(raw?.name ?? raw?.siteName ?? raw?.title ?? "급경사지");
    const address = String(raw?.address ?? raw?.addr ?? "");
    const lat = raw?.lat != null ? Number(raw.lat) : null;
    const lng = raw?.lng != null ? Number(raw.lng) : null;
    const grade5 = raw?.grade5 != null ? Number(raw.grade5) : null;

    const ndmsKey = raw?.ndmsKey ? String(raw.ndmsKey) : (id ? `NDMS-${id.replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase()}` : randomId("NDMS"));
    const sigungu = String(raw?.sigungu ?? raw?.region ?? "");
    const eupmyeondong = String(raw?.eupmyeondong ?? "");
    const ri = String(raw?.ri ?? "");
    const master = {
      id: id || randomId("site"),
      ndmsKey,
      name,
      address,
      sigungu,
      eupmyeondong,
      ri,
      lat,
      lng,
      grade5: Number.isFinite(grade5) ? grade5 : null,
      updatedAt: nowIso(),
    };
    return master;
  }

  function defaultMasterSites() {
    // 최소 기본 세트(어떤 페이지로 들어와도 "가동 중"처럼 보이도록)
    return [
      { id: "a1", name: "정선읍 A구간", address: "강원특별자치도 정선군 정선읍 봉양리", sigungu: "정선군", eupmyeondong: "정선읍", ri: "봉양리", lat: 37.3805, lng: 128.6608, grade5: 5 },
      { id: "a2", name: "신동읍 B구간", address: "강원특별자치도 정선군 신동읍 용탄리", sigungu: "정선군", eupmyeondong: "신동읍", ri: "용탄리", lat: 37.3505, lng: 128.6808, grade5: 4 },
      { id: "a3", name: "화암면 C구간", address: "강원특별자치도 정선군 화암면 덕송리", sigungu: "정선군", eupmyeondong: "화암면", ri: "덕송리", lat: 37.4005, lng: 128.6408, grade5: 3 },
      { id: "b1", name: "여탄리 관측지점", address: "강원특별자치도 정선군 남면 여탄리", sigungu: "정선군", eupmyeondong: "남면", ri: "여탄리", lat: 37.2330, lng: 128.7380, grade5: 2 },
      { id: "c1", name: "덕송리 관측지점", address: "강원특별자치도 정선군 화암면 덕송리", sigungu: "정선군", eupmyeondong: "화암면", ri: "덕송리", lat: 37.2700, lng: 128.6250, grade5: 1 },
    ];
  }

  function getMasterSites() {
    ensureInit();
    const raw = safeJsonParse(safeGet(KEY.MASTER, ""), []);
    return Array.isArray(raw) ? raw : [];
  }

  function setMasterSites(sites, sourceLabel) {
    ensureInit();
    const normalized = (sites || []).map(normalizeSite);
    safeSet(KEY.MASTER, JSON.stringify(normalized));

    const meta = safeJsonParse(safeGet(KEY.SYNC_META, ""), { lastSync: null, masterSource: null });
    meta.lastSync = nowIso();
    meta.masterSource = sourceLabel || "unknown";
    safeSet(KEY.SYNC_META, JSON.stringify(meta));

    // measurements: seed gaps for new sites
    seedMeasurementGaps(normalized);
    return { count: normalized.length, meta };
  }

  function getSyncMeta() {
    ensureInit();
    return safeJsonParse(safeGet(KEY.SYNC_META, ""), { lastSync: null, masterSource: null });
  }

  function getEvents() {
    ensureInit();
    const raw = safeJsonParse(safeGet(KEY.EVENTS, ""), []);
    return Array.isArray(raw) ? raw : [];
  }

  function pushEvent(evt) {
    ensureInit();
    const events = getEvents();
    const e = {
      id: randomId("evt"),
      createdAt: nowIso(),
      source: String(evt?.source ?? "ORBITAL"),
      type: String(evt?.type ?? "경보"),
      level: String(evt?.level ?? "주의"),
      message: String(evt?.message ?? "이상징후 감지"),
      siteId: evt?.siteId ? String(evt.siteId) : null,
      ndmsKey: evt?.ndmsKey ? String(evt.ndmsKey) : null,
      payload: evt?.payload ?? null,
    };
    events.unshift(e);
    safeSet(KEY.EVENTS, JSON.stringify(events.slice(0, 200)));
    return e;
  }

  function getMeasurements() {
    ensureInit();
    const m = safeJsonParse(safeGet(KEY.MEASUREMENTS, ""), { bySiteId: {} });
    if (!m.bySiteId || typeof m.bySiteId !== "object") m.bySiteId = {};
    return m;
  }

  function setMeasurements(m) {
    ensureInit();
    safeSet(KEY.MEASUREMENTS, JSON.stringify(m || { bySiteId: {} }));
  }

  function seedMeasurementGaps(masterSites) {
    const m = getMeasurements();
    const seed = ensureSeed();
    const by = m.bySiteId || {};
    const sites = masterSites || [];

    for (const s of sites) {
      const sid = String(s?.id ?? "");
      if (!sid) continue;
      if (by[sid]) continue;

      // 문서 핵심(계측 미연계 공백)을 "체감"하게 만들기 위해 일부는 미연계로 둔다.
      const p = hash01(`${seed}|gap|${sid}`);
      const hasSensor = p > 0.12; // 약 12% 미연계
      by[sid] = {
        hasSensor,
        cctvLinked: hasSensor ? (hash01(`${seed}|cctv|${sid}`) > 0.35) : false,
        lastReceivedAt: hasSensor ? nowIso() : null,
        latest: hasSensor ? {
          rainMmH: clamp(Math.round(hash01(`${seed}|rain|${sid}`) * 60), 0, 60),
          dispMm: Math.round((hash01(`${seed}|disp|${sid}`) * 18 - 2) * 10) / 10, // -2..16mm
          tiltDeg: Math.round((hash01(`${seed}|tilt|${sid}`) * 2.2) * 100) / 100,
        } : null,
      };
    }
    m.bySiteId = by;
    setMeasurements(m);
  }

  function getGapStats() {
    const master = getMasterSites();
    const m = getMeasurements();
    const by = m.bySiteId || {};
    let gap = 0;
    for (const s of master) {
      const sid = String(s?.id ?? "");
      const row = by[sid];
      if (!row || row.hasSensor !== true) gap += 1;
    }
    return { masterCount: master.length, gapSites: gap };
  }

  function findSite(siteId) {
    const master = getMasterSites();
    const sid = String(siteId ?? "");
    return master.find((s) => String(s?.id ?? "") === sid) || null;
  }

  function getStatusSummary() {
    ensureInit();
    const meta = getSyncMeta();
    const { masterCount, gapSites } = getGapStats();
    const eventCount = getEvents().length;
    return {
      lastSync: meta.lastSync || null,
      masterSource: meta.masterSource || null,
      masterCount,
      gapSites,
      eventCount,
      policy: safeJsonParse(safeGet(KEY.POLICY, ""), defaultPolicy()),
    };
  }

  function bootstrapIfEmpty(builderFn, sourceLabel) {
    ensureInit();
    const master = getMasterSites();
    if (master && master.length) return { bootstrapped: false, count: master.length };
    const built = (typeof builderFn === "function") ? (builderFn() || []) : [];
    const sites = (built && built.length) ? built : defaultMasterSites();
    const res = setMasterSites(sites, sourceLabel || "bootstrap");

    // 최초 기동 시 기본 이벤트 몇 개를 쌓아 "이미 돌고 있다"를 보여준다.
    const seed = ensureSeed();
    pushEvent({
      source: "NDMS",
      type: "동기화",
      level: "정보",
      message: `마스터 동기화 완료 (${res.count}건)`,
      payload: { seed, sourceLabel: sourceLabel || "bootstrap" },
    });
    pushEvent({
      source: "ORBITAL",
      type: "위성변위",
      level: "주의",
      message: "SAR 시계열 분석에서 변위 이상징후 후보지가 자동 생성되었습니다.",
      payload: { module: "m2_satellite" },
    });
    pushEvent({
      source: "ORBITAL",
      type: "드론정밀",
      level: "경계",
      message: "정밀 탐지(드론/LiDAR) 분석 작업이 큐에 등록되었습니다.",
      payload: { module: "m2_scenario" },
    });
    return { bootstrapped: true, count: res.count };
  }

  function getAutoMeta() {
    ensureInit();
    const a = safeJsonParse(safeGet(KEY.AUTO_META, ""), { lastTickAt: null, tickIntervalMs: 15000 });
    if (typeof a.tickIntervalMs !== "number" || !Number.isFinite(a.tickIntervalMs)) a.tickIntervalMs = 15000;
    return a;
  }

  function setAutoMeta(next) {
    ensureInit();
    safeSet(KEY.AUTO_META, JSON.stringify(next || { lastTickAt: null, tickIntervalMs: 15000 }));
  }

  function tickAuto(options) {
    ensureInit();
    const intervalMs = (options && typeof options.intervalMs === "number") ? options.intervalMs : undefined;
    const meta = getAutoMeta();
    const ms = intervalMs ?? meta.tickIntervalMs ?? 15000;
    const now = Date.now();
    const last = meta.lastTickAt ? Date.parse(meta.lastTickAt) : 0;
    if (last && now - last < ms) return { ran: false, reason: "throttled" };

    const master = getMasterSites();
    if (!master.length) return { ran: false, reason: "no-master" };

    // 계측 갱신: 연계된 일부 현장 최신값 갱신
    const m = getMeasurements();
    const by = m.bySiteId || {};
    let updated = 0;
    for (let i = 0; i < master.length && updated < 24; i++) {
      const s = master[i];
      const sid = String(s?.id ?? "");
      const row = by[sid];
      if (!row || row.hasSensor !== true) continue;
      if (Math.random() > 0.18) continue; // 매 tick마다 전부 바뀌면 부자연스러움

      row.lastReceivedAt = new Date().toISOString();
      const prev = row.latest || { rainMmH: 0, dispMm: 0, tiltDeg: 0 };
      const rain = clamp(Number(prev.rainMmH || 0) + (Math.random() < 0.7 ? 0 : 6), 0, 90);
      const disp = Math.round((Number(prev.dispMm || 0) + (Math.random() * 1.2 - 0.15)) * 10) / 10;
      const tilt = Math.round((Number(prev.tiltDeg || 0) + (Math.random() * 0.08)) * 100) / 100;
      row.latest = { rainMmH: rain, dispMm: disp, tiltDeg: tilt };
      updated += 1;
    }
    m.bySiteId = by;
    setMeasurements(m);

    // 이벤트 생성(가끔): 조건 기반으로 0~1건 생성
    if (Math.random() < 0.35) {
      // 연계된 현장 중 하나를 골라 경보/관측 이벤트 생성
      const candidates = master
        .map((s) => ({ s, r: by[String(s?.id ?? "")] }))
        .filter((x) => x.r && x.r.hasSensor === true && x.r.latest);

      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const latest = pick.r.latest || {};
        const rain = Number(latest.rainMmH || 0);
        const disp = Number(latest.dispMm || 0);
        const level = (rain >= 60 || disp >= 16) ? "심각" : (rain >= 45 || disp >= 12) ? "경계" : "주의";
        const type = (level === "심각" || level === "경계") ? "경보" : "관측";
        pushEvent({
          source: "NDMS 게이트웨이",
          type,
          level,
          message: `${pick.s?.name || "급경사지"} 계측 수신: 강우 ${rain}mm/h, 변위 ${disp}mm`,
          siteId: String(pick.s?.id ?? null),
          ndmsKey: String(pick.s?.ndmsKey ?? null),
          payload: { rainMmH: rain, dispMm: disp, tiltDeg: Number(latest.tiltDeg || 0) },
        });
      }
    }

    meta.lastTickAt = new Date(now).toISOString();
    meta.tickIntervalMs = ms;
    setAutoMeta(meta);
    return { ran: true, updatedMeasurements: updated, tickIntervalMs: ms };
  }

  function startAuto(options) {
    ensureInit();
    const intervalMs = (options && typeof options.intervalMs === "number") ? options.intervalMs : 15000;
    if (window.__NDMSMOCK_AUTO_TIMER__) return { started: false, reason: "already-started" };
    // 즉시 1회 실행
    tickAuto({ intervalMs });
    window.__NDMSMOCK_AUTO_TIMER__ = window.setInterval(() => {
      tickAuto({ intervalMs });
    }, Math.max(4000, intervalMs));
    return { started: true, intervalMs };
  }

  // Public API
  window.NDMSMock = {
    ensureInit,
    getStatusSummary,
    getMasterSites,
    setMasterSites,
    getEvents,
    pushEvent,
    getMeasurements,
    seedMeasurementGaps,
    findSite,
    bootstrapIfEmpty,
    tickAuto,
    startAuto,
  };
})();

