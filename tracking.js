/* ============================================================
   Theo dõi quà: bản đồ tối + tuyến đường phát sáng + hiệu ứng xuất hiện.
   Độc lập với script.js. Chỉnh lộ trình ngay ở TRACK bên dưới.
   Toạ độ dạng [vĩ độ, kinh độ]; "via" là các điểm trung gian để đường cong
   bám theo quốc lộ thay vì đường chim bay.
   ============================================================ */
(() => {
  "use strict";

  const TRACK = {
    text: "Đang trên đường tới chỗ bạn",
    from: [10.7769, 106.7009],                 // điểm xuất phát (TP.HCM)
    via: [                                     // điểm trung gian, theo thứ tự
      [10.95, 107.25], [10.93, 108.10], [12.24, 109.19], [13.78, 109.22],
      [15.12, 108.80], [16.05, 108.22], [16.46, 107.59], [17.47, 106.62],
      [18.68, 105.68], [19.81, 105.78], [20.43, 106.17]
    ],
    to: [20.8449, 106.6881],                   // điểm đến (Lê Chân, Hải Phòng)
    progress: 0.62,                            // gói quà đã đi được bao nhiêu (0 -> 1)
    drawMs: 3800                               // thời gian vẽ tuyến đường
  };

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

  const letter = document.querySelector("#letter");
  const anchor = document.querySelector("#musicShowcase") || document.querySelector("#replay");
  const replayBtn = document.querySelector("#replay");
  if (!letter || !anchor) return;

  const GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3.5" y="10" width="17" height="10.5" rx="2"/><path d="M2.5 10h19V7.5a1 1 0 0 0-1-1h-17a1 1 0 0 0-1 1z"/>' +
    '<path d="M12 6.5v14"/><path d="M12 6.5C10 3.4 6.6 4.2 7.3 5.9c.4 1 2.6.7 4.7.6zM12 6.5c2-3.1 5.4-2.3 4.7-.6-.4 1-2.6.7-4.7.6z"/></svg>';

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

  function build() {
    const L = window.L;
    const sec = document.createElement("section");
    sec.className = "trk";
    sec.setAttribute("aria-label", TRACK.text);
    sec.style.setProperty("--p", (TRACK.progress * 100).toFixed(1) + "%");
    sec.style.setProperty("--dur", (TRACK.drawMs / 1000) + "s");

    const words = TRACK.text.split(" ").map((w, i) =>
      '<span class="trk-w" style="--i:' + i + '" aria-hidden="true">' + w + "</span>").join(" ");

    sec.innerHTML =
      '<div class="trk-card">' +
        '<div class="trk-map"></div>' +
        '<div class="trk-info">' +
          '<span class="trk-ico">' + GIFT + "</span>" +
          '<div class="trk-txt">' +
            '<p class="trk-line"><span class="trk-sr">' + TRACK.text + "</span>" + words +
              '<span class="trk-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>' +
            '<div class="trk-bar" aria-hidden="true"><i></i></div>' +
          "</div>" +
        "</div>" +
      "</div>";
    anchor.insertAdjacentElement("afterend", sec);

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

    /* ---------- Vẽ tuyến đường + gói quà chạy theo ---------- */
    let raf = 0, timer = 0, shown = false;
    const setSeg = (seg) => { glow1.setLatLngs(seg); glow2.setLatLngs(seg); main.setLatLngs(seg); };

    function showFinal() {
      const e = at(TOTAL * TRACK.progress);
      setSeg(pts.slice(0, e.idx + 1).concat([e.pt]));
      pkg.setLatLng(e.pt);
    }

    function draw() {
      sec.classList.add("trk-live");
      if (reduce) { showFinal(); return; }
      const target = TOTAL * TRACK.progress, t0 = performance.now();
      (function step(now) {
        const k = Math.min(1, (now - t0) / TRACK.drawMs);
        const e = at(target * ease(k));
        setSeg(pts.slice(0, e.idx + 1).concat([e.pt]));
        pkg.setLatLng(e.pt);
        if (k < 1) raf = requestAnimationFrame(step);
      })(t0);
    }

    function reveal() {
      if (shown) return;
      shown = true;
      fit();
      sec.classList.add("in");
      timer = setTimeout(draw, reduce ? 0 : 1000);
    }

    function reset() {
      shown = false;
      clearTimeout(timer); cancelAnimationFrame(raf);
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
  }

  loadLeaflet(build);
})();
