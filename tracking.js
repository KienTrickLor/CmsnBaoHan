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
    from: [10.7769, 106.7009],                 // điểm xuất phát (TP.HCM)
    via: [                                     // điểm trung gian, theo thứ tự
      [10.95, 107.25], [10.93, 108.10], [12.24, 109.19], [13.78, 109.22],
      [15.12, 108.80], [16.05, 108.22], [16.46, 107.59], [17.47, 106.62],
      [18.68, 105.68], [19.81, 105.78], [20.43, 106.17]
    ],
    to: [20.8449, 106.6881],                   // điểm đến (Lê Chân, Hải Phòng)
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
        zoomSnap: 0, zoomAnimation: false, inertia: false
      });
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 19, attribution: "© OpenStreetMap · © CARTO"
      }).addTo(map);

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
      const pkg = mk("trk-pkg", '<span class="trk-halo"></span><span class="trk-core">' + GIFT + "</span>", [46, 46], [23, 23], 1000);

      const fit = () => {
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [34, 76], paddingBottomRight: [34, 118], animate: false });
      };
      fit();
      addEventListener("resize", fit);

      /* ---------- Vẽ tuyến đường + trái tim chạy theo ---------- */
      let raf = 0, timer = 0, tick = 0, shown = false, arrived = false;
      const setSeg = (seg) => { glow1.setLatLngs(seg); glow2.setLatLngs(seg); main.setLatLngs(seg); };

      function place(p) {
        const e = at(TOTAL * p);
        setSeg(pts.slice(0, e.idx + 1).concat([e.pt]));
        pkg.setLatLng(e.pt);
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
