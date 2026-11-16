/* ============================================================
   Theo dõi quà: bản đồ tối + tuyến đường phát sáng + hiệu ứng xuất hiện.
   Độc lập với script.js. Chỉnh lộ trình ngay ở TRACK bên dưới.
   Toạ độ dạng [vĩ độ, kinh độ]; "via" là các điểm trung gian để đường cong
   bám theo quốc lộ thay vì đường chim bay.
   ============================================================ */
(() => {
  "use strict";

  const TRACK = {
    text: "Trái tim đang đến",
    btnText: "Nhận trái tim của anh",          // chữ trên nút trước khi bấm
    doneText: "Trái tim đã đến nơi rồi",       // chữ khi đã đi hết quãng đường
    fromName: "Hải Phòng",                     // tên hiện ở điểm đi
    toName: "Gia Lai",                         // tên hiện ở điểm nhận
    from: [20.8449, 106.6881],                 // điểm xuất phát: Hải Phòng
    via: [                                     // điểm trung gian dọc quốc lộ 1 rồi QL19 lên Tây Nguyên
      [20.25, 105.97], [19.81, 105.78], [18.68, 105.68], [17.47, 106.62],
      [16.46, 107.59], [16.05, 108.22], [15.12, 108.80], [14.65, 109.03],
      [13.78, 109.22], [13.95, 108.90], [14.00, 108.65]
    ],
    to: [13.9833, 108.0022],                   // điểm đến: Pleiku, Gia Lai
    days: 4,                                   // trái tim đi hết quãng đường trong bao nhiêu ngày
    startAt: "",                               // mốc xuất phát cố định, vd "2026-11-17T09:00:00+07:00".
                                               // Để trống = tính từ lúc người ấy bấm nút (lưu trong máy họ)
    drawMs: 3800                               // thời gian vẽ tuyến đường lúc mở
  };

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

  const letter = document.querySelector("#letter");
  const anchor = document.querySelector("#musicShowcase") || document.querySelector("#replay");
  const replayBtn = document.querySelector("#replay");
  if (!letter || !anchor) return;

  const HEART_PATH = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
  const HEART = '<svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="' + HEART_PATH + '"/></svg>';
  const GIFT = HEART;   // giữ tên cũ: mọi chỗ từng dùng món quà nay là trái tim

  const PIN = '<svg class="trk-end-pin" viewBox="0 0 40 52" aria-hidden="true">' +
    '<defs><linearGradient id="trkPinG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6C8D3"/><stop offset="1" stop-color="#C8567F"/></linearGradient></defs>' +
    '<path d="M20 51C20 51 3 33 3 19a17 17 0 1 1 34 0C37 33 20 51 20 51z" fill="url(#trkPinG)" stroke="rgba(255,245,238,.85)" stroke-width="1.6"/>' +
    '<path d="M20 27C10.5 20.5 10.5 11.5 16.3 11.5c2.3 0 3.7 1.5 3.7 3.2 0-1.7 1.4-3.2 3.7-3.2C29.5 11.5 29.5 20.5 20 27z" fill="#fff"/></svg>';

  /* ---------- Hình học: đường cong mượt qua các điểm ---------- */
  function spline(P, steps) {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * (
          2 * p1[k] + (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(P[P.length - 1]);
    return out;
  }
  const COS = Math.cos(15 * Math.PI / 180);
  const dist = (a, b) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * COS);

  const pts = spline([TRACK.from, ...TRACK.via, TRACK.to], 18);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const TOTAL = cum[cum.length - 1];

  function at(d) {
    d = Math.max(0, Math.min(TOTAL, d));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const span = cum[i] - cum[i - 1] || 1;
    const k = (d - cum[i - 1]) / span;
    const a = pts[i - 1], b = pts[i];
    return { idx: i - 1, pt: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] };
  }
  const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * k);

  /* ---------- Bản đồ Việt Nam vẽ tay: không cần tile, không cần API key ----------
     Đường viền là bản gần đúng (vẽ từ toạ độ các mốc chính), đủ đẹp cho thẻ nhỏ.
     Muốn sắc nét hơn thì thay VN_MAIN bằng toạ độ từ file GeoJSON thật.
     Toạ độ [vĩ độ, kinh độ]. Vị trí các đảo nhỏ trong 2 quần đảo là minh hoạ. */
  const VN_MAIN = [
    /* biên giới phía Bắc (Trung Quốc), từ Tây sang Đông */
    [22.40, 102.14], [22.78, 102.45], [22.45, 103.00], [22.52, 103.95], [22.85, 104.35],
    [23.05, 104.80], [23.36, 105.32], [23.05, 105.80], [22.85, 106.30], [22.82, 106.75],
    [22.45, 106.65], [22.18, 106.78], [21.97, 106.72], [21.95, 107.20], [21.58, 107.90],
    /* bờ biển phía Đông, từ Bắc xuống Nam */
    [21.50, 108.05], [21.38, 107.95], [21.20, 107.70], [21.05, 107.45], [20.95, 107.10],
    [20.85, 106.90], [20.70, 106.85], [20.45, 106.75], [20.10, 106.55], [20.00, 106.30],
    [19.80, 105.95], [19.30, 105.88], [18.70, 105.82], [18.40, 105.95], [17.95, 106.55],
    [17.45, 106.78], [17.00, 107.25], [16.50, 107.75], [16.05, 108.35], [15.88, 108.45],
    [15.40, 108.85], [15.10, 108.98], [14.65, 109.15], [14.20, 109.15], [13.78, 109.32],
    [13.20, 109.40], [12.85, 109.45], [12.40, 109.28], [11.90, 109.25], [11.50, 109.10],
    [11.35, 109.06], [11.05, 108.55], [10.95, 108.15], [10.60, 107.55], [10.40, 107.10],
    [10.38, 107.00], [10.30, 106.80], [10.00, 106.80], [9.60, 106.65], [9.30, 106.20],
    [9.10, 105.85], [9.05, 105.50], [8.60, 104.85],
    /* bờ biển phía Tây (vịnh Thái Lan) */
    [8.75, 104.80], [9.55, 104.80], [10.00, 105.05], [10.20, 104.85], [10.35, 104.50],
    /* biên giới Campuchia, từ Nam lên Bắc */
    [10.52, 104.45], [10.60, 104.90], [10.85, 105.15], [10.90, 105.55], [11.10, 105.95],
    [11.55, 106.20], [11.75, 106.55], [12.00, 106.90], [12.20, 107.20], [12.55, 107.50],
    [13.00, 107.45], [13.45, 107.50], [14.00, 107.55], [14.50, 107.55], [14.70, 107.60],
    /* biên giới Lào, từ Nam lên Bắc */
    [15.10, 107.45], [15.55, 107.20], [16.10, 107.15], [16.35, 106.90], [16.65, 106.60],
    [17.30, 106.10], [17.75, 105.80], [18.20, 105.35], [18.40, 105.15], [18.75, 105.00],
    [19.05, 104.55], [19.45, 104.12], [19.90, 104.40], [20.40, 104.30], [20.75, 104.00],
    [21.10, 103.70], [21.45, 103.10], [21.80, 102.65], [22.10, 102.20]
  ];
  const VN_ISLANDS = [
    [[10.37, 103.95], [10.30, 104.02], [10.12, 104.05], [9.95, 104.03], [9.90, 103.95], [10.05, 103.88], [10.25, 103.85]], /* Phú Quốc */
    [[8.78, 106.57], [8.72, 106.68], [8.65, 106.62], [8.70, 106.56]],                                                      /* Côn Đảo */
    [[20.85, 106.97], [20.82, 107.08], [20.74, 107.02], [20.78, 106.95]]                                                   /* Cát Bà */
  ];
  /* đảo nhỏ: Bạch Long Vĩ, Cô Tô, Cồn Cỏ, Cù Lao Chàm, Lý Sơn, Phú Quý, Thổ Chu,
     Song Tử Tây, Sinh Tồn, Trường Sa Lớn, Phú Lâm, Hoàng Sa */
  const VN_DOTS = [
    [20.13, 107.72], [21.00, 107.77], [17.16, 107.34], [15.95, 108.52], [15.38, 109.12], [10.52, 108.93],
    [9.28, 103.47], [11.43, 114.33], [9.88, 114.33], [8.64, 111.92], [16.83, 112.33], [16.53, 111.60]
  ];

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function scatter(box, n, seed) {          // box = [vĩ min, vĩ max, kinh min, kinh max]
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) out.push([box[0] + r() * (box[1] - box[0]), box[2] + r() * (box[3] - box[2])]);
    return out;
  }

  function drawVietnam(L, map) {
    const grid = { color: "#F6C8D3", weight: 1, opacity: 0.06, interactive: false };
    for (let la = 8; la <= 24; la += 2) L.polyline([[la, 100], [la, 118]], grid).addTo(map);
    for (let lo = 102; lo <= 116; lo += 2) L.polyline([[5, lo], [25, lo]], grid).addTo(map);

    const land = { color: "#F6C8D3", weight: 1.3, opacity: 0.8, fillColor: "#5A2A5E", fillOpacity: 0.6, lineJoin: "round", interactive: false };
    L.polygon(VN_MAIN, { color: "#EC9FB0", weight: 10, opacity: 0.1, fill: false, lineJoin: "round", interactive: false }).addTo(map);
    L.polygon(VN_MAIN, land).addTo(map);
    VN_ISLANDS.forEach((p) => L.polygon(p, land).addTo(map));

    const dot = { radius: 1.8, color: "#F6C8D3", weight: 0, fillColor: "#F6C8D3", fillOpacity: 0.85, interactive: false };
    VN_DOTS.forEach((p) => L.circleMarker(p, Object.assign({}, dot, { radius: 2.6 })).addTo(map));
    scatter([15.75, 17.15, 111.2, 112.75], 14, 7)           /* Hoàng Sa */
      .concat(scatter([7.5, 11.6, 111.7, 114.6], 34, 11))   /* Trường Sa */
      .forEach((p) => L.circleMarker(p, dot).addTo(map));

    const lbl = (cls, t, ll) => L.marker(ll, {
      icon: L.divIcon({ className: cls, html: t, iconSize: [140, 16], iconAnchor: [70, 8] }),
      interactive: false, keyboard: false
    }).addTo(map);
    lbl("trk-isl", "Quần đảo Hoàng Sa", [17.65, 111.95]);
    lbl("trk-isl", "Quần đảo Trường Sa", [12.15, 113.15]);
    lbl("trk-isl trk-sea", "Biển Đông", [14.1, 113.4]);
  }

  /* ---------- Nạp Leaflet rồi dựng thẻ ---------- */
  function loadLeaflet(done) {
    if (window.L) { done(); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = LEAFLET_JS; js.onload = done;
    js.onerror = () => {};           // mất mạng: bỏ qua, không hiện thẻ hỏng
    document.head.appendChild(js);
  }

  /* ---------- Thời gian: trái tim đi dần trong TRACK.days ngày ---------- */
  const KEY = "trk_start";
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, String(v)); } catch (e) {} }
  };
  const fixedStart = TRACK.startAt ? Date.parse(TRACK.startAt) : NaN;
  function startMs() {
    if (!isNaN(fixedStart)) return fixedStart;
    const v = Number(store.get());
    return v > 0 ? v : null;
  }
  function progressNow() {
    const s = startMs();
    if (s === null) return 0.02;
    const k = (Date.now() - s) / (TRACK.days * 864e5);
    return Math.max(0.02, Math.min(1, k));      // tối thiểu 2% để thấy trái tim đã rời điểm xuất phát
  }
  function etaText(p) {
    if (p >= 1) return "";
    const left = (1 - p) * TRACK.days * 864e5;
    const d = Math.floor(left / 864e5);
    const h = Math.floor((left % 864e5) / 36e5);
    const m = Math.max(1, Math.floor((left % 36e5) / 6e4));
    if (d > 0) return "Còn khoảng " + d + " ngày " + h + " giờ";
    if (h > 0) return "Còn khoảng " + h + " giờ " + m + " phút";
    return "Còn khoảng " + m + " phút";
  }

  /* ---------- Hiệu ứng: trái tim bay lên rồi phóng đi ---------- */
  function launchHeart(fromEl) {
    if (reduce) return;
    const r = fromEl.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const el = document.createElement("div");
    el.className = "trk-fly";
    el.style.left = x0 + "px"; el.style.top = y0 + "px";
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="trkFlyG" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#FF8FA8"/><stop offset="1" stop-color="#C8567F"/></linearGradient></defs>' +
      '<path d="' + HEART_PATH + '" fill="url(#trkFlyG)"/></svg>';
    document.body.appendChild(el);

    const dx = Math.min(innerWidth * 0.42, 220), dy = -(y0 + 160);
    const T = "translate(-50%,-50%) ";
    const anim = el.animate([
      { transform: T + "scale(1) rotate(0deg)", opacity: 1, offset: 0, easing: "cubic-bezier(.2,.8,.3,1)" },
      { transform: T + "translate(0,-46px) scale(2.1) rotate(-10deg)", opacity: 1, offset: 0.28, easing: "ease-in-out" },
      { transform: T + "translate(0,-58px) scale(1.85) rotate(8deg)", opacity: 1, offset: 0.42, easing: "cubic-bezier(.55,0,.9,.4)" },
      { transform: T + "translate(" + (dx * 0.8) + "px," + (dy * 0.8) + "px) scale(.8) rotate(20deg)", opacity: 1, offset: 0.86 },
      { transform: T + "translate(" + dx + "px," + dy + "px) scale(.5) rotate(24deg)", opacity: 0, offset: 1 }
    ], { duration: 1700, fill: "forwards" });

    const trail = setInterval(() => {
      if (anim.currentTime < 640) return;
      const b = el.getBoundingClientRect();
      const sp = document.createElement("i");
      sp.className = "trk-spark";
      sp.style.left = (b.left + b.width / 2 + (Math.random() * 16 - 8)) + "px";
      sp.style.top = (b.top + b.height / 2 + (Math.random() * 16 - 8)) + "px";
      sp.style.setProperty("--s", (0.55 + Math.random() * 0.7).toFixed(2));
      document.body.appendChild(sp);
      sp.animate([
        { transform: "translate(-50%,-50%) scale(var(--s))", opacity: 0.95 },
        { transform: "translate(-50%,calc(-50% + 26px)) scale(0)", opacity: 0 }
      ], { duration: 650, easing: "ease-out" }).onfinish = () => sp.remove();
    }, 45);
    anim.onfinish = () => { clearInterval(trail); el.remove(); };
  }

  /* ---------- Nút "Nhận trái tim của anh" + thẻ bản đồ ---------- */
  function init() {
    const alreadySent = store.get() !== null;   // đã bấm nút từ lần trước
    let sec = null, mount = null;

    const gate = document.createElement("div");
    gate.className = "trk-gate";
    gate.innerHTML =
      '<button class="trk-send" type="button">' +
        '<span class="trk-send-ico">' + HEART + "</span>" +
        '<span class="trk-send-txt"></span>' +
      "</button>";
    anchor.insertAdjacentElement("afterend", gate);
    const btn = gate.querySelector(".trk-send");
    const ico = gate.querySelector(".trk-send-ico");
    const txt = gate.querySelector(".trk-send-txt");

    function markSent() {
      btn.classList.add("sent"); btn.disabled = true;
      txt.textContent = TRACK.text;
    }
    txt.textContent = TRACK.btnText;
    if (alreadySent) markSent();

    /* nút hiện ra khi cuộn tới */
    const gio = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) gate.classList.add("in"); });
    }, { root: letter, threshold: 0.6 });
    gio.observe(gate);

    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      if (store.get() === null) store.set(Date.now());   // mốc "bắt đầu đi" = lúc bấm
      ico.classList.add("gone");
      launchHeart(ico);
      markSent();
      setTimeout(() => ico.classList.remove("gone"), reduce ? 0 : 1300);
      setTimeout(() => {
        mount();
        const r = sec.getBoundingClientRect();
        letter.scrollBy({ top: r.top + r.height / 2 - innerHeight / 2, behavior: reduce ? "auto" : "smooth" });
      }, reduce ? 0 : 1250);
    });

    mount = function () {
      if (sec) return;
      const L = window.L;
      sec = document.createElement("section");
      sec.className = "trk";
      sec.setAttribute("aria-label", TRACK.text);
      sec.style.setProperty("--p", (progressNow() * 100).toFixed(1) + "%");
      sec.style.setProperty("--dur", (TRACK.drawMs / 1000) + "s");

      const words = (t) => t.split(" ").map((w, i) =>
        '<span class="trk-w" style="--i:' + i + '" aria-hidden="true">' + w + "</span>").join(" ");

      sec.innerHTML =
        '<div class="trk-card">' +
          '<div class="trk-map"></div>' +
          '<div class="trk-info">' +
            '<span class="trk-ico">' + GIFT + "</span>" +
            '<div class="trk-txt">' +
              '<p class="trk-line"><span class="trk-sr">' + TRACK.text + "</span><span class=\"trk-words\">" + words(TRACK.text) + "</span>" +
                '<span class="trk-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>' +
              '<div class="trk-bar" aria-hidden="true"><i></i></div>' +
              '<p class="trk-eta"></p>' +
            "</div>" +
          "</div>" +
        "</div>";
      gate.insertAdjacentElement("afterend", sec);

      const lineEl = sec.querySelector(".trk-line");
      const wordsEl = sec.querySelector(".trk-words");
      const srEl = sec.querySelector(".trk-sr");
      const etaEl = sec.querySelector(".trk-eta");

      const map = L.map(sec.querySelector(".trk-map"), {
        zoomControl: false, dragging: false, touchZoom: false, doubleClickZoom: false,
        scrollWheelZoom: false, boxZoom: false, keyboard: false, tap: false,
        zoomSnap: 0, zoomAnimation: false, inertia: false, attributionControl: false
      });
      drawVietnam(L, map);   // nền bản đồ Việt Nam tự vẽ, vẽ trước để tuyến đường nằm đè lên

      const line = (o) => L.polyline([], Object.assign({ lineCap: "round", lineJoin: "round", interactive: false }, o)).addTo(map);
      L.polyline(pts, { color: "#D4B5C5", weight: 2, opacity: 0.55, dashArray: "1 7", lineCap: "round", className: "trk-ghost", interactive: false }).addTo(map);
      const glow1 = line({ color: "#EC9FB0", weight: 15, opacity: 0.1 });
      const glow2 = line({ color: "#EC9FB0", weight: 7, opacity: 0.24 });
      const main = line({ color: "#F6C8D3", weight: 3, opacity: 1 });

      const mk = (cls, html, size, anc, z) => L.marker(cls === "trk-pkg" ? TRACK.from : (cls === "trk-start" ? TRACK.from : TRACK.to), {
        icon: L.divIcon({ className: cls, html, iconSize: size, iconAnchor: anc }),
        interactive: false, keyboard: false, zIndexOffset: z || 0
      }).addTo(map);
      mk("trk-start", "<i></i>", [14, 14], [7, 7]);
      mk("trk-end", '<i class="trk-rip"></i><i class="trk-rip r2"></i>' + PIN, [46, 54], [23, 50]);
      /* nhãn điểm đi / điểm nhận */
      const tag = (cls, html, ll, anc) => L.marker(ll, {
        icon: L.divIcon({ className: cls, html, iconSize: [110, 34], iconAnchor: anc }),
        interactive: false, keyboard: false
      }).addTo(map);
      tag("trk-lbl", "<b>" + TRACK.fromName + "</b><small>Điểm đi</small>", TRACK.from, [-14, 17]);
      tag("trk-lbl end", "<b>" + TRACK.toName + "</b><small>Điểm nhận</small>", TRACK.to, [124, 43]);
      /* tim nhỏ bay ra từ trái tim chính, hướng về điểm đến */
      const MINI = [[0, 52, 0, 1, -14], [0.55, 44, 10, 0.8, 12], [1.1, 58, -10, 0.9, -8], [1.65, 40, 6, 0.7, 16], [2.2, 50, -6, 0.85, -18]]
        .map((m) => '<i class="trk-mini" style="--d:' + m[0] + "s;--far:" + m[1] + "px;--side:" + m[2] + "px;--sc:" + m[3] + ";--r:" + m[4] + 'deg"></i>').join("");
      const pkg = mk("trk-pkg", '<span class="trk-halo"></span>' + MINI + '<span class="trk-core">' + GIFT + "</span>", [46, 46], [23, 23], 1000);

      const VIEW = L.latLngBounds([[7.0, 102.0], [23.6, 115.4]]);   // khung nhìn trọn nước Việt Nam + 2 quần đảo
      const fit = () => {
        map.invalidateSize();
        map.fitBounds(VIEW, { paddingTopLeft: [12, 16], paddingBottomRight: [12, 112], animate: false });
      };
      fit();
      addEventListener("resize", fit);

      /* ---------- Vẽ tuyến đường + trái tim chạy theo ---------- */
      let raf = 0, timer = 0, tick = 0, shown = false, arrived = false;
      const setSeg = (seg) => { glow1.setLatLngs(seg); glow2.setLatLngs(seg); main.setLatLngs(seg); };

      /* hướng đang đi (theo màn hình) để tim nhỏ bay về phía điểm đến */
      function aim(e) {
        const el = pkg.getElement();
        if (!el) return;
        const a = map.latLngToLayerPoint(pts[e.idx]), b = map.latLngToLayerPoint(pts[Math.min(pts.length - 1, e.idx + 1)]);
        let dx = b.x - a.x, dy = b.y - a.y;
        const n = Math.hypot(dx, dy) || 1;
        dx /= n; dy /= n;
        el.style.setProperty("--dx", dx.toFixed(3));
        el.style.setProperty("--dy", dy.toFixed(3));
        el.style.setProperty("--px", (-dy).toFixed(3));
        el.style.setProperty("--py", dx.toFixed(3));
      }

      function place(p) {
        const e = at(TOTAL * p);
        setSeg(pts.slice(0, e.idx + 1).concat([e.pt]));
        pkg.setLatLng(e.pt);
        aim(e);
        return e;
      }

      /* cập nhật theo thời gian thật (mỗi 20 giây khi đang mở trang) */
      function refresh() {
        const p = progressNow();
        sec.style.setProperty("--p", (p * 100).toFixed(1) + "%");
        place(p);
        etaEl.textContent = etaText(p);
        if (p >= 1 && !arrived) {
          arrived = true;
          srEl.textContent = TRACK.doneText;
          wordsEl.innerHTML = words(TRACK.doneText);
          sec.classList.add("trk-arrived");
        }
        if (p >= 1) clearInterval(tick);
      }

      function draw() {
        sec.classList.add("trk-live");
        if (reduce) { refresh(); tick = setInterval(refresh, 20000); return; }
        const target = TOTAL * progressNow(), t0 = performance.now();
        (function step(now) {
          const k = Math.min(1, (now - t0) / TRACK.drawMs);
          const e = at(target * ease(k));
          setSeg(pts.slice(0, e.idx + 1).concat([e.pt]));
          pkg.setLatLng(e.pt);
          aim(e);
          if (k < 1) raf = requestAnimationFrame(step);
          else { refresh(); tick = setInterval(refresh, 20000); }
        })(t0);
      }

      function reveal() {
        if (shown) return;
        shown = true;
        fit();
        etaEl.textContent = etaText(progressNow());
        sec.classList.add("in");
        timer = setTimeout(draw, reduce ? 0 : 1000);
      }

      function reset() {
        shown = false;
        clearTimeout(timer); cancelAnimationFrame(raf); clearInterval(tick);
        sec.classList.add("trk-reset");
        sec.classList.remove("in", "trk-live");
        setSeg([]);
        pkg.setLatLng(TRACK.from);
        aim(at(0));
        void sec.offsetWidth;
        requestAnimationFrame(() => requestAnimationFrame(() => sec.classList.remove("trk-reset")));
      }

      /* xuất hiện khi cuộn tới thẻ (trong khung thư) */
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) reveal(); });
      }, { root: letter, threshold: 0.45 });
      io.observe(sec);

      /* "Thổi nến lại": đặt lại để lần sau hiện hiệu ứng lại từ đầu */
      if (replayBtn) replayBtn.addEventListener("click", () => setTimeout(reset, 650));
    };

    /* "Thổi nến lại": nút cũng ẩn đi để hiện lại khi cuộn tới */
    if (replayBtn) replayBtn.addEventListener("click", () => setTimeout(() => gate.classList.remove("in"), 650));

    /* đã bấm từ trước (mở lại trang): thẻ có sẵn, không cần bấm nữa */
    if (alreadySent) mount();
  }

  loadLeaflet(init);
})();
