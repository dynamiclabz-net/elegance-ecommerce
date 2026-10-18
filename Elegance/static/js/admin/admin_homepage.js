// ─────────────────────────────────────────────
// Admin → Homepage editor
// Previews render inside iframes that load the real storefront stylesheet, so
// they match the live homepage. Ordering is changed inside the preview itself
// (drag, or the small arrows) and the iframe reports the new order to this page.
// ─────────────────────────────────────────────

// Runs INSIDE each preview iframe (serialised with toString()).
function homePreviewOrderScript() {
  var dragEl = null;
  document.addEventListener("click", function (e) {
    if (e.target.closest("a")) e.preventDefault();
  }, true);

  document.querySelectorAll("[data-ord-group]").forEach(function (group) {
    var key = group.getAttribute("data-ord-group");
    var selectable = group.hasAttribute("data-ord-select");

    function items() {
      return Array.prototype.filter.call(group.children, function (c) { return c.hasAttribute("data-ord-id"); });
    }
    function renumber() {
      items().forEach(function (el, i) {
        var n = el.querySelector(":scope > .ord-ctl .ord-n");
        if (n) n.textContent = i + 1;
      });
    }
    function emit() {
      renumber();
      parent.postMessage({
        type: "home-reorder", key: key,
        ids: items().map(function (c) { return c.getAttribute("data-ord-id"); }),
      }, "*");
    }

    items().forEach(function (el) {
      el.setAttribute("draggable", "true");
      var ctl = document.createElement("div");
      ctl.className = "ord-ctl";
      ctl.innerHTML = '<span class="ord-b" data-d="-1" title="Move earlier">&#9664;</span><span class="ord-n"></span><span class="ord-b" data-d="1" title="Move later">&#9654;</span>';
      el.appendChild(ctl);

      ctl.addEventListener("click", function (e) {
        e.stopPropagation(); e.preventDefault();
        var b = e.target.closest(".ord-b");
        if (!b) return;
        var d = Number(b.getAttribute("data-d"));
        var list = items(), i = list.indexOf(el), j = i + d;
        if (j < 0 || j >= list.length) return;
        if (d < 0) group.insertBefore(el, list[j]); else group.insertBefore(list[j], el);
        emit();
      });

      el.addEventListener("click", function () {
        if (selectable) parent.postMessage({ type: "home-select", key: key, id: el.getAttribute("data-ord-id") }, "*");
      });

      el.addEventListener("dragstart", function (e) {
        dragEl = el;
        el.classList.add("ord-drag");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", "x"); } catch (err) {}
      });
      el.addEventListener("dragover", function (e) {
        if (!dragEl || dragEl === el || dragEl.parentNode !== group) return;
        e.preventDefault();
        var r = el.getBoundingClientRect();
        var before = (e.clientX - r.left) < r.width / 2;
        var target = before ? el : el.nextElementSibling;
        if (target !== dragEl && target !== dragEl.nextElementSibling) group.insertBefore(dragEl, target);
      });
      el.addEventListener("dragend", function () {
        el.classList.remove("ord-drag");
        dragEl = null;
        emit();
      });
    });
    renumber();
  });
}

const HOME_PREVIEW_CSS = `
body.hp-preview{background:#fff;min-height:0;overflow-x:hidden}
.hp-empty{padding:56px 20px;text-align:center;font:14px Inter,sans-serif;color:#8a8a8a}
[data-ord-id]{position:relative;cursor:grab}
[data-ord-id].ord-drag{opacity:.35}
[data-ord-id].ord-off{opacity:.45}
.ord-ctl{position:absolute;top:6px;left:6px;z-index:60;display:flex;align-items:center;gap:1px;background:rgba(20,20,20,.85);color:#fff;border-radius:999px;padding:2px 3px;font:600 10px/1 Inter,sans-serif}
.ord-b{cursor:pointer;padding:4px 5px;user-select:none}
.ord-b:hover{color:#d4af6a}
.ord-n{min-width:12px;text-align:center}
.fc-tabs{padding-top:26px}
.fc-tab .ord-ctl{top:-24px;left:0}
.hero-banner{height:620px!important;min-height:0!important}
.bs-track{animation:none!important;transform:none!important;flex-wrap:wrap;width:auto!important;justify-content:center}
.cat-carousel-track{flex-wrap:wrap!important;transform:none!important}
.cat-carousel-track-outer{overflow:visible!important}
.cat-arrow{display:none!important}
`;

function AdminHomepageInit(cfg) {
  const esc = eEscapeHtml;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const heading = (t) => esc(t || "").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");

  const S = {
    tab: "banners",
    cats: [],
    banners: [],
    picks: { new_arrivals: [], bestsellers: [], trending: [] },
    tiles: [],
    sections: [],
    collections: [],
    settings: {},
    selBanner: null,
    selCollection: null,
    edit: { announcements: [], nav_items: [], footer_socials: [], footer_columns: [] },
    removeFlags: {},
  };

  // ───────── API ─────────
  async function api(method, url, body = null, isForm = false) {
    const res = await callApi(method, url, body, getCSRFToken() || cfg.csrfToken || "", isForm);
    if (!res || !res[0]) return { ok: false, error: "Network error. Please try again." };
    const d = res[1];
    if (d && d.success) return { ok: true, data: d.data };
    return { ok: false, error: eExtractError(d) };
  }
  const fail = (r) => eToast(r.error, "error");
  const detailUrl = (base, id) => `${base}${id}/`;

  // ───────── Tabs ─────────
  function showTab(name) {
    S.tab = name;
    $$("#hp-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$(".e-tab-panel").forEach((p) => p.classList.toggle("d-none", p.id !== `tab-${name}`));
    history.replaceState(null, "", `#${name}`);
    renderTab(name);
  }
  $("#hp-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) showTab(b.dataset.tab);
  });

  function renderTab(name) {
    ({
      banners: renderBanners,
      new_arrivals: () => renderPickPreview("new_arrivals"),
      tiles: renderTiles,
      bestsellers: () => renderPickPreview("bestsellers"),
      sections: renderSections,
      collections: renderCollections,
      trending: () => renderPickPreview("trending"),
      copy: renderCopy,
      navbar: renderNavbar,
      footer: renderFooter,
    }[name] || (() => {}))();
  }

  // ───────── Preview frames ─────────
  function frameDoc(inner) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="${cfg.homeCssUrl}">
<style>${HOME_PREVIEW_CSS}</style></head>
<body class="hp-preview">${inner}<script>(${homePreviewOrderScript.toString()})();<\/script></body></html>`;
  }

  function setFrame(id, inner, fixedHeight) {
    const frame = document.getElementById(id);
    if (!frame) return;
    frame.srcdoc = frameDoc(inner);
    const fit = () => {
      try {
        const d = frame.contentDocument;
        if (!d || !d.body) return;
        frame.style.height = (fixedHeight || Math.max(d.documentElement.scrollHeight, 160)) + "px";
      } catch (err) { /* cross-origin guard */ }
    };
    frame.onload = () => { fit(); setTimeout(fit, 500); setTimeout(fit, 1600); };
  }

  const emptyMsg = (text) => `<div class="hp-empty">${esc(text)}</div>`;

  // ───────── Preview markup (mirrors templates/frontend/home.html) ─────────
  function heroHtml() {
    if (!S.banners.length) return emptyMsg("No banners yet. Add your first banner to see it here.");
    const b = S.banners.find((x) => x.id === S.selBanner) || S.banners[0];
    const overlay = b.overlay === "light" ? " hb-overlay-light" : b.overlay === "bottom" ? " hb-overlay-bottom" : "";
    return `<section class="hero-banner">
  <div class="hb-track"><div class="hb-slide hb-slide-active">
    <div class="hb-img" style="background-image:url('${esc(b.image)}')"></div>
    <div class="hb-overlay${overlay}"></div>
    <div class="hb-content hb-content-${esc(b.text_align)}">
      ${b.eyebrow ? `<span class="hb-eyebrow">${esc(b.eyebrow)}</span>` : ""}
      ${b.heading ? `<h1 class="hb-heading">${heading(b.heading)}</h1>` : ""}
      ${b.sub_text ? `<p class="hb-sub">${esc(b.sub_text)}</p>` : ""}
      ${b.btn1_text || b.btn2_text ? `<div class="hb-actions">
        ${b.btn1_text ? `<a href="#" class="hb-btn hb-btn-primary">${esc(b.btn1_text)}</a>` : ""}
        ${b.btn2_text ? `<a href="#" class="hb-btn hb-btn-ghost">${esc(b.btn2_text)}</a>` : ""}</div>` : ""}
    </div></div></div>
  <button class="hb-arrow hb-arrow-prev"><i class="fas fa-chevron-left"></i></button>
  <button class="hb-arrow hb-arrow-next"><i class="fas fa-chevron-right"></i></button>
  <div class="hb-thumbs" data-ord-group="banners" data-ord-select>
    ${S.banners.map((x) => `<div class="hb-thumb${x.id === b.id ? " hb-thumb-active" : ""}${x.is_active ? "" : " ord-off"}" data-ord-id="${x.id}">
      <div class="hb-thumb-img" style="background-image:url('${esc(x.image)}')"></div><span>${esc(x.thumb_label)}</span></div>`).join("")}
  </div>
  <div class="hb-counter"><span>${String(S.banners.indexOf(b) + 1).padStart(2, "0")}</span><span class="hb-counter-sep"></span><span class="hb-counter-total">${String(S.banners.length).padStart(2, "0")}</span></div>
</section>`;
  }

  function naHtml() {
    const list = S.picks.new_arrivals.slice(0, 4);
    const s = S.settings;
    if (!list.length) return emptyMsg("No products selected. Use Select products above.");
    return `<section class="na-section sec-cream">
  <div class="na-header"><h2 class="na-title">${esc(s.na_title)}</h2>
  ${s.na_link_text ? `<a href="#" class="na-shop-all">${esc(s.na_link_text)} <span>&rarr;</span></a>` : ""}</div>
  <div class="na-row" data-ord-group="pick:new_arrivals">
  ${list.map((p, i) => `<article class="na-card${i === 0 ? " is-active" : ""}" data-ord-id="${p.id}">
    <div class="na-media"><img class="na-img na-img-primary" src="${esc(p.image)}" alt=""><img class="na-img na-img-hover" src="${esc(p.hover_image)}" alt="">
    <div class="na-actions"><button type="button" class="na-btn na-btn-ghost">Quick Add</button><button type="button" class="na-btn na-btn-solid">Add to Cart</button></div></div>
    <div class="na-info"><h3 class="na-name">${esc(p.name)}</h3><span class="na-price">₹${esc(p.price)}</span></div></article>`).join("")}
  </div></section>`;
  }

  function tilesHtml() {
    if (!S.tiles.length) return emptyMsg("No category tiles yet. Add one above.");
    const s = S.settings;
    return `<section class="shop-cat-section sec-cream">
  <div class="shop-cat-header">${s.cat_eyebrow ? `<span class="shop-cat-eyebrow">${esc(s.cat_eyebrow)}</span>` : ""}<h2 class="shop-cat-title">${esc(s.cat_title)}</h2></div>
  <div class="shop-cat-grid" data-ord-group="tiles">
  ${S.tiles.map((t) => `<a href="#" class="shop-cat-card${t.is_active ? "" : " ord-off"}" data-ord-id="${t.id}">
    <div class="shop-cat-img"><img src="${esc(t.image)}" alt=""></div>
    <div class="shop-cat-body"><h3>${esc(t.title)}</h3><i class="fas fa-arrow-right shop-cat-arrow"></i></div></a>`).join("")}
  </div>
  ${s.cat_all_text ? `<a href="#" class="shop-cat-all">${esc(s.cat_all_text)} <span>&rarr;</span></a>` : ""}</section>`;
  }

  function bsHtml() {
    const list = S.picks.bestsellers;
    const s = S.settings;
    if (!list.length) return emptyMsg("No products selected. Use Select products above.");
    return `<section class="bs-section sec-white">
  <div class="bs-header">${s.bs_eyebrow ? `<span class="bs-eyebrow">${esc(s.bs_eyebrow)}</span>` : ""}<h2 class="bs-title">${esc(s.bs_title)}</h2></div>
  <div class="bs-marquee"><div class="bs-track" data-ord-group="pick:bestsellers">
  ${list.map((p) => `<a href="#" class="bs-card" data-ord-id="${p.id}">
    <div class="bs-media"><img class="bs-img bs-img-primary" src="${esc(p.image)}" alt=""><img class="bs-img bs-img-hover" src="${esc(p.hover_image)}" alt=""></div>
    <div class="bs-info"><h3 class="bs-name">${esc(p.name)}</h3><span class="bs-price">₹${esc(p.price)}</span></div></a>`).join("")}
  </div></div></section>`;
  }

  function trendHtml() {
    const list = S.picks.trending;
    const s = S.settings;
    if (!list.length) return emptyMsg("No products selected. Use Select products above.");
    return `<section class="product-section sec-ivory">
  <div class="ps-header"><div class="ps-title-row"><h2 class="ps-title">${esc(s.trend_title)}</h2></div>
  ${s.trend_link_text ? `<a href="#" class="ps-view-all">${esc(s.trend_link_text)} <i class="fas fa-arrow-right"></i></a>` : ""}</div>
  <div class="product-scroll-row prod-row-wide" style="flex-wrap:wrap;overflow:visible" data-ord-group="pick:trending">
  ${list.map((p) => `<div class="prod-card prod-card-wide" data-ord-id="${p.id}">
    <div class="prod-img-wrap"><img src="${esc(p.image)}" alt=""><button class="wish-btn"><i class="far fa-heart"></i></button><div class="prod-quick-add">Quick Add</div></div>
    <div class="prod-info">${p.category_name ? `<span class="prod-brand">${esc(p.category_name)}</span>` : ""}<p class="prod-name">${esc(p.name)}</p>
    <div class="prod-price-row"><span class="prod-price">₹${esc(p.price)}</span>${p.mrp ? `<span class="prod-mrp">₹${esc(p.mrp)}</span><span class="prod-discount">${p.discount_pct}% OFF</span>` : ""}</div></div></div>`).join("")}
  </div></section>`;
  }

  function sectionHtml(sec) {
    if (!sec.products.length) return emptyMsg("No products selected for this section yet.");
    return `<section class="cat-carousel-section sec-white">
  <div class="cat-sec-header"><div class="cat-title-divider"><div class="divider-line"></div>
  <div class="divider-title-wrap"><h2 class="cat-sec-title">${esc(sec.title)}</h2><a href="#" class="cat-view-all">Shop All</a></div><div class="divider-line"></div></div></div>
  <div class="cat-carousel-wrap"><div class="cat-carousel-track-outer"><div class="cat-carousel-track" data-ord-group="sec:${sec.id}">
  ${sec.products.map((p) => `<div class="cat-prod-card" data-ord-id="${p.id}"><div class="cat-prod-img"><img src="${esc(p.image)}" alt="">
    ${p.sizes && p.sizes.length ? `<div class="size-chips">${p.sizes.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    <button class="cat-wish-btn"><i class="far fa-heart"></i></button></div>
    <div class="cat-prod-info"><p class="cat-prod-name">${esc(p.name)}</p><p class="cat-prod-price">₹${esc(p.price)}${p.mrp ? ` <span class="cat-mrp">₹${esc(p.mrp)}</span>` : ""}</p></div></div>`).join("")}
  </div></div></div></section>`;
  }

  function collectionHtml(c) {
    const s = S.settings;
    const tabs = S.collections.map((x) => `<button type="button" class="fc-tab${x.id === c.id ? " is-active" : ""}${x.is_active ? "" : " ord-off"}" data-ord-id="${x.id}">${esc(x.tab_label)}</button>`).join("");
    return `<section class="fc-section sec-white">
  <div class="fc-header"><h2 class="fc-title">${esc(s.fc_title)}</h2>${s.fc_link_text ? `<a href="#" class="fc-view-all">${esc(s.fc_link_text)} <span>&rarr;</span></a>` : ""}</div>
  <div class="fc-tabs" data-ord-group="coltabs" data-ord-select>${tabs}</div>
  <div class="fc-panel is-active">
    <div class="fc-banner">${c.banner_image ? `<img class="fc-banner-img" src="${esc(c.banner_image)}" alt="">` : `<div style="background:#eee"></div>`}
    <div class="fc-banner-copy"><h3 class="fc-banner-title">${esc(c.banner_title)}</h3>${c.banner_text ? `<p class="fc-banner-text">${esc(c.banner_text)}</p>` : ""}
    ${c.cta_text ? `<a href="#" class="fc-banner-cta">${esc(c.cta_text)} <span>&rarr;</span></a>` : ""}</div></div>
    <div class="fc-meta"><span>${esc(c.meta_left)}</span><span>${esc(c.meta_right)}</span></div>
    <div class="fc-grid" data-ord-group="col:${c.id}">
    ${c.products.map((p) => `<a href="#" class="fc-card" data-ord-id="${p.id}"><div class="fc-media"><img class="fc-img fc-img-primary" src="${esc(p.image)}" alt=""><img class="fc-img fc-img-hover" src="${esc(p.hover_image)}" alt=""></div>
    <h3 class="fc-name">${esc(p.name)}</h3><span class="fc-price">₹${esc(p.price)}</span></a>`).join("")}
    </div>
  </div></section>`;
  }

  function stitchHtml() {
    const s = S.settings;
    return `<section class="stitch-cta-section"><div class="stitch-cta-bg">${s.stitch_image ? `<img src="${esc(s.stitch_image)}" alt="">` : ""}<div class="stitch-cta-tint"></div></div>
  <div class="stitch-cta-content">${s.stitch_eyebrow ? `<span class="stitch-eyebrow">${esc(s.stitch_eyebrow)}</span>` : ""}
  <h2 class="stitch-heading">${heading(s.stitch_heading)}</h2>${s.stitch_body ? `<p class="stitch-body">${esc(s.stitch_body)}</p>` : ""}
  ${s.stitch_cta_text ? `<a href="#" class="stitch-cta-btn">${esc(s.stitch_cta_text)} <i class="fas fa-arrow-right"></i></a>` : ""}</div></section>`;
  }

  // ───────── Reorder / select messages from previews ─────────
  window.addEventListener("message", async (e) => {
    const m = e.data;
    if (!m || typeof m.type !== "string" || !m.type.startsWith("home-") || e.origin !== window.location.origin) return;
    if (m.type === "home-select") {
      if (m.key === "banners") { S.selBanner = Number(m.id); renderBanners(); }
      if (m.key === "coltabs") { S.selCollection = Number(m.id); renderCollections(); }
      return;
    }
    if (m.type === "home-reorder") await onReorder(m.key, m.ids.map(Number));
  });

  const byIds = (list, ids, idKey = "id") => ids.map((id) => list.find((x) => x[idKey] === id)).filter(Boolean);

  async function onReorder(key, ids) {
    if (key === "banners") {
      S.banners = byIds(S.banners, ids);
      const r = await api("POST", `${cfg.bannerApiUrl}reorder/`, { ids });
      return r.ok ? (eToast("Banner order saved"), renderBannerList()) : fail(r);
    }
    if (key === "tiles") {
      S.tiles = byIds(S.tiles, ids);
      const r = await api("POST", `${cfg.tileApiUrl}reorder/`, { ids });
      return r.ok ? (eToast("Category order saved"), renderTileList()) : fail(r);
    }
    if (key === "coltabs") {
      S.collections = byIds(S.collections, ids);
      const r = await api("POST", `${cfg.collectionApiUrl}reorder/`, { ids });
      return r.ok ? (eToast("Collection order saved"), renderCollectionTabs()) : fail(r);
    }
    if (key.startsWith("pick:")) {
      const section = key.slice(5);
      S.picks[section] = byIds(S.picks[section], ids);
      return savePicks(section, ids, false);
    }
    if (key.startsWith("sec:")) {
      const sec = S.sections.find((x) => x.id === Number(key.slice(4)));
      if (!sec) return;
      sec.products = byIds(sec.products, ids);
      const r = await api("POST", `${detailUrl(cfg.sectionApiUrl, sec.id)}products/`, { product_ids: ids });
      return r.ok ? eToast("Product order saved") : fail(r);
    }
    if (key.startsWith("col:")) {
      const col = S.collections.find((x) => x.id === Number(key.slice(4)));
      if (!col) return;
      col.products = byIds(col.products, ids);
      const r = await api("POST", `${detailUrl(cfg.collectionApiUrl, col.id)}products/`, { product_ids: ids });
      return r.ok ? eToast("Product order saved") : fail(r);
    }
  }

  async function moveEntity(list, id, dir, url, rerender) {
    const i = list.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const r = await api("POST", `${url}reorder/`, { ids: list.map((x) => x.id) });
    if (!r.ok) fail(r);
    rerender();
  }

  // ───────── Banners ─────────
  function renderBanners() {
    renderBannerList();
    setFrame("frame-banners", heroHtml(), 620);
  }

  function renderBannerList() {
    const box = $("#banner-list");
    if (!S.banners.length) {
      box.innerHTML = `<div class="e-empty"><i class="bi bi-images d-block"></i><p>No banners yet. Add your first hero banner.</p></div>`;
      return;
    }
    box.innerHTML = S.banners.map((b, i) => `
      <div class="hp-banner-row${b.id === (S.selBanner || S.banners[0].id) ? " selected" : ""}" data-id="${b.id}">
        <img src="${esc(b.image)}" alt="">
        <div class="hp-banner-meta">
          <strong>${esc((b.heading || "Untitled banner").replace(/\*/g, ""))}</strong>
          <span>${esc(b.eyebrow || "No eyebrow")} · text ${esc(b.text_align)} · ${esc(b.overlay)} overlay</span>
        </div>
        <div class="form-check form-switch m-0" title="Active"><input class="form-check-input" type="checkbox" data-act="toggle" ${b.is_active ? "checked" : ""}></div>
        <div class="hp-row-actions">
          <button class="hp-icon-btn" data-act="up" ${i === 0 ? "disabled" : ""} title="Move up"><i class="bi bi-arrow-up"></i></button>
          <button class="hp-icon-btn" data-act="down" ${i === S.banners.length - 1 ? "disabled" : ""} title="Move down"><i class="bi bi-arrow-down"></i></button>
          <button class="hp-icon-btn" data-act="edit" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="hp-icon-btn danger" data-act="delete" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </div>`).join("");
  }

  $("#banner-list").addEventListener("click", async (e) => {
    const row = e.target.closest(".hp-banner-row");
    if (!row) return;
    const id = Number(row.dataset.id);
    const b = S.banners.find((x) => x.id === id);
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) { S.selBanner = id; return renderBanners(); }
    if (act === "toggle") {
      const fd = new FormData(); fd.append("is_active", e.target.checked ? "true" : "false");
      const r = await api("POST", detailUrl(cfg.bannerApiUrl, id), fd, true);
      if (r.ok) { Object.assign(b, r.data.banner); eToast("Saved"); } else fail(r);
      return renderBanners();
    }
    if (act === "up") return moveEntity(S.banners, id, -1, cfg.bannerApiUrl, renderBanners);
    if (act === "down") return moveEntity(S.banners, id, 1, cfg.bannerApiUrl, renderBanners);
    if (act === "edit") return openBannerModal(b);
    if (act === "delete") {
      if (!eConfirmAction("Delete this banner?")) return;
      const r = await api("DELETE", detailUrl(cfg.bannerApiUrl, id));
      if (!r.ok) return fail(r);
      S.banners = S.banners.filter((x) => x.id !== id);
      eToast("Banner deleted");
      renderBanners();
    }
  });

  const bannerModal = () => bootstrap.Modal.getOrCreateInstance($("#banner-modal"));
  $("#banner-add-btn").addEventListener("click", () => openBannerModal(null));

  function openBannerModal(b) {
    $("#banner-form").reset();
    $("#banner-id").value = b ? b.id : "";
    $("#banner-modal-title").textContent = b ? "Edit banner" : "Add banner";
    $("#banner-image-req").style.display = b ? "none" : "";
    $("#banner-image-current").innerHTML = b ? `<img src="${esc(b.image)}" alt=""> Current image (leave empty to keep)` : "";
    const v = b || { eyebrow: "", heading: "", sub_text: "", btn1_text: "", btn1_url: "", btn2_text: "", btn2_url: "", thumb_label: "", text_align: "left", overlay: "dark", is_active: true };
    $("#banner-eyebrow").value = v.eyebrow; $("#banner-thumb").value = v.thumb_label;
    $("#banner-heading").value = v.heading; $("#banner-sub").value = v.sub_text;
    $("#banner-b1t").value = v.btn1_text; $("#banner-b1u").value = v.btn1_url;
    $("#banner-b2t").value = v.btn2_text; $("#banner-b2u").value = v.btn2_url;
    $("#banner-align").value = v.text_align; $("#banner-overlay").value = v.overlay;
    $("#banner-active").checked = v.is_active;
    bannerModal().show();
  }

  $("#banner-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#banner-id").value;
    const file = $("#banner-image").files[0];
    if (!id && !file) return eToast("Please choose a banner image.", "error");
    const fd = new FormData();
    if (file) fd.append("image", file);
    fd.append("eyebrow", $("#banner-eyebrow").value); fd.append("heading", $("#banner-heading").value);
    fd.append("sub_text", $("#banner-sub").value); fd.append("thumb_label", $("#banner-thumb").value);
    fd.append("btn1_text", $("#banner-b1t").value); fd.append("btn1_url", $("#banner-b1u").value);
    fd.append("btn2_text", $("#banner-b2t").value); fd.append("btn2_url", $("#banner-b2u").value);
    fd.append("text_align", $("#banner-align").value); fd.append("overlay", $("#banner-overlay").value);
    fd.append("is_active", $("#banner-active").checked ? "true" : "false");
    const btn = $("#banner-save"); btn.disabled = true;
    const r = await api("POST", id ? detailUrl(cfg.bannerApiUrl, id) : cfg.bannerApiUrl, fd, true);
    btn.disabled = false;
    if (!r.ok) return fail(r);
    const nb = r.data.banner;
    if (id) S.banners = S.banners.map((x) => (x.id === nb.id ? nb : x)); else { S.banners.push(nb); S.selBanner = nb.id; }
    bannerModal().hide();
    eToast("Banner saved");
    renderBanners();
  });

  // ───────── Product picks (new arrivals / bestsellers / trending) ─────────
  function renderPickPreview(section) {
    populateSettings();
    const html = { new_arrivals: naHtml, bestsellers: bsHtml, trending: trendHtml }[section]();
    setFrame(`frame-${section}`, html);
  }

  async function savePicks(section, ids, rerender = true) {
    const r = await api("POST", cfg.pickApiUrl, { section, product_ids: ids });
    if (!r.ok) return fail(r);
    S.picks[section] = r.data.products;
    eToast("Saved");
    if (rerender) renderPickPreview(section);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick]");
    if (!btn) return;
    const section = btn.dataset.pick;
    openPicker({
      title: { new_arrivals: "New Arrivals", bestsellers: "Bestsellers", trending: "Most Trendy" }[section],
      limit: section === "new_arrivals" ? 4 : null,
      selected: S.picks[section],
      onSave: (ids) => savePicks(section, ids),
    });
  });

  // ───────── Product picker ─────────
  const P = { selected: new Map(), limit: null, onSave: null, page: 1, hasMore: false, timer: null };
  const pickerModal = () => bootstrap.Modal.getOrCreateInstance($("#picker-modal"));

  function openPicker({ title, limit, selected, onSave, categoryId }) {
    P.limit = limit; P.onSave = onSave;
    P.selected = new Map(selected.map((p) => [p.id, p]));
    $("#picker-title").textContent = `Select products — ${title}`;
    $("#picker-sub").textContent = limit ? `Choose up to ${limit} products.` : "Choose any number of products. Active products only appear on the storefront.";
    $("#picker-search").value = "";
    $("#picker-category").value = categoryId ? String(categoryId) : "";
    updatePickerCount();
    pickerModal().show();
    loadPicker(true);
  }

  async function loadPicker(reset) {
    if (reset) { P.page = 1; $("#picker-grid").innerHTML = `<div class="e-skeleton" style="height:120px;grid-column:1/-1"></div>`; }
    const q = new URLSearchParams({ page: P.page, q: $("#picker-search").value.trim() });
    if ($("#picker-category").value) q.set("category", $("#picker-category").value);
    const r = await api("GET", `${cfg.searchApiUrl}?${q}`);
    if (!r.ok) return fail(r);
    const items = r.data.products || [];
    if (reset) $("#picker-grid").innerHTML = "";
    if (reset && !items.length) $("#picker-grid").innerHTML = `<div class="e-empty" style="grid-column:1/-1"><p>No products found.</p></div>`;
    $("#picker-grid").insertAdjacentHTML("beforeend", items.map((p) => {
      P.cache = P.cache || new Map(); P.cache.set(p.id, p);
      return `<div class="hp-pick${P.selected.has(p.id) ? " selected" : ""}" data-id="${p.id}">
        <img src="${esc(p.image)}" alt=""><span class="hp-pick-check"><i class="bi bi-check-lg"></i></span>
        ${p.in_stock ? "" : `<span class="hp-pick-oos">Out of stock</span>`}
        <div class="hp-pick-info"><strong>${esc(p.name)}</strong><span>₹${esc(p.price)}${p.is_active ? "" : " · inactive"}</span></div></div>`;
    }).join(""));
    P.hasMore = !!r.data.has_more;
    $("#picker-more").classList.toggle("d-none", !P.hasMore);
  }

  function updatePickerCount() {
    $("#picker-count").textContent = `${P.selected.size} selected${P.limit ? ` of ${P.limit}` : ""}`;
  }

  $("#picker-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".hp-pick");
    if (!card) return;
    const id = Number(card.dataset.id);
    if (P.selected.has(id)) P.selected.delete(id);
    else {
      if (P.limit && P.selected.size >= P.limit) return eToast(`You can select up to ${P.limit} products here.`, "error");
      P.selected.set(id, (P.cache && P.cache.get(id)) || { id });
    }
    card.classList.toggle("selected", P.selected.has(id));
    updatePickerCount();
  });
  $("#picker-more").addEventListener("click", () => { P.page += 1; loadPicker(false); });
  $("#picker-category").addEventListener("change", () => loadPicker(true));
  $("#picker-search").addEventListener("input", () => { clearTimeout(P.timer); P.timer = setTimeout(() => loadPicker(true), 300); });
  $("#picker-save").addEventListener("click", async () => {
    const ids = Array.from(P.selected.keys());
    pickerModal().hide();
    await P.onSave(ids);
  });

  // ───────── Shop by category tiles ─────────
  function renderTiles() {
    populateSettings();
    const used = new Set(S.tiles.map((t) => t.category_id));
    $("#tile-category").innerHTML = `<option value="">Select category</option>` +
      S.cats.filter((c) => !used.has(c.id)).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    renderTileList();
    setFrame("frame-tiles", tilesHtml());
  }

  function renderTileList() {
    const box = $("#tile-list");
    box.innerHTML = S.tiles.length ? S.tiles.map((t, i) => `
      <div class="hp-tile-row" data-id="${t.id}">
        <img src="${esc(t.image)}" alt="">
        <span class="hp-tile-cat">${esc(t.category_name)}</span>
        <input class="e-input" data-field="title" value="${esc(t.custom_title)}" placeholder="Title (defaults to category)">
        <input type="file" class="e-input hp-tile-file" data-field="image" accept="image/*" title="Change photo">
        <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" data-field="is_active" ${t.is_active ? "checked" : ""}></div>
        <div class="hp-row-actions">
          <button class="hp-icon-btn" data-act="up" ${i === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
          <button class="hp-icon-btn" data-act="down" ${i === S.tiles.length - 1 ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
          <button class="hp-icon-btn danger" data-act="delete"><i class="bi bi-trash"></i></button>
        </div>
      </div>`).join("") : `<div class="e-empty"><p>No tiles yet.</p></div>`;
  }

  $("#tile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cat = $("#tile-category").value;
    if (!cat) return eToast("Choose a category.", "error");
    const fd = new FormData();
    fd.append("category", cat); fd.append("title", $("#tile-title").value);
    const f = $("#tile-image").files[0]; if (f) fd.append("image", f);
    const r = await api("POST", cfg.tileApiUrl, fd, true);
    if (!r.ok) return fail(r);
    S.tiles.push(r.data.tile);
    $("#tile-form").reset();
    eToast("Tile added");
    renderTiles();
  });

  async function updateTile(id, fd) {
    const r = await api("POST", detailUrl(cfg.tileApiUrl, id), fd, true);
    if (!r.ok) return fail(r);
    S.tiles = S.tiles.map((t) => (t.id === id ? r.data.tile : t));
    eToast("Saved");
    renderTiles();
  }

  $("#tile-list").addEventListener("change", (e) => {
    const row = e.target.closest(".hp-tile-row"); const field = e.target.dataset.field;
    if (!row || !field) return;
    const id = Number(row.dataset.id); const fd = new FormData();
    if (field === "image") { if (!e.target.files[0]) return; fd.append("image", e.target.files[0]); }
    else if (field === "is_active") fd.append("is_active", e.target.checked ? "true" : "false");
    else fd.append("title", e.target.value);
    updateTile(id, fd);
  });
  $("#tile-list").addEventListener("click", async (e) => {
    const row = e.target.closest(".hp-tile-row"); const act = e.target.closest("[data-act]")?.dataset.act;
    if (!row || !act) return;
    const id = Number(row.dataset.id);
    if (act === "up") return moveEntity(S.tiles, id, -1, cfg.tileApiUrl, renderTiles);
    if (act === "down") return moveEntity(S.tiles, id, 1, cfg.tileApiUrl, renderTiles);
    if (act === "delete") {
      if (!eConfirmAction("Remove this category tile?")) return;
      const r = await api("DELETE", detailUrl(cfg.tileApiUrl, id));
      if (!r.ok) return fail(r);
      S.tiles = S.tiles.filter((t) => t.id !== id);
      renderTiles();
    }
  });

  // ───────── Category sections ─────────
  function renderSections() {
    populateSettings();
    const used = new Set(S.sections.map((s) => s.category_id));
    $("#section-category").innerHTML = `<option value="">Select category</option>` +
      S.cats.filter((c) => !used.has(c.id)).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    const box = $("#section-list");
    if (!S.sections.length) {
      box.innerHTML = `<div class="e-card mt-3"><div class="e-card-body"><div class="e-empty"><p>No category sections yet.</p></div></div></div>`;
      return;
    }
    box.innerHTML = S.sections.map((sec, i) => `
      <div class="e-card hp-section-card" data-id="${sec.id}">
        <div class="e-card-header">
          <div class="hp-section-head">
            <h2>${esc(sec.category_name)}</h2>
            <input class="e-input" data-field="title" value="${esc(sec.custom_title)}" placeholder="Heading (defaults to category)">
            <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" data-field="is_active" ${sec.is_active ? "checked" : ""}><label class="form-check-label" style="font-size:12.5px">Active</label></div>
          </div>
          <div class="hp-row-actions">
            <button class="hp-icon-btn" data-act="up" ${i === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
            <button class="hp-icon-btn" data-act="down" ${i === S.sections.length - 1 ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
            <button class="btn-e-primary btn-sm" data-act="pick"><i class="bi bi-grid-3x2-gap"></i> Select products (${sec.products.length})</button>
            <button class="hp-icon-btn danger" data-act="delete"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="e-card-body p-0"><iframe class="hp-frame" id="frame-sec-${sec.id}" title="${esc(sec.title)} preview"></iframe></div>
      </div>`).join("");
    S.sections.forEach((sec) => setFrame(`frame-sec-${sec.id}`, sectionHtml(sec)));
  }

  $("#section-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cat = $("#section-category").value;
    if (!cat) return eToast("Choose a category.", "error");
    const r = await api("POST", cfg.sectionApiUrl, { category: Number(cat), title: $("#section-title").value });
    if (!r.ok) return fail(r);
    S.sections.push(r.data.section);
    $("#section-form").reset();
    renderSections();
    eToast("Section added. Now choose its products.");
    openSectionPicker(r.data.section);
  });

  function openSectionPicker(sec) {
    openPicker({
      title: sec.category_name, limit: null, selected: sec.products, categoryId: sec.category_id,
      onSave: async (ids) => {
        const r = await api("POST", `${detailUrl(cfg.sectionApiUrl, sec.id)}products/`, { product_ids: ids });
        if (!r.ok) return fail(r);
        S.sections = S.sections.map((x) => (x.id === sec.id ? r.data.section : x));
        eToast("Saved");
        renderSections();
      },
    });
  }

  $("#section-list").addEventListener("change", async (e) => {
    const card = e.target.closest("[data-id]"); const field = e.target.dataset.field;
    if (!card || !field) return;
    const id = Number(card.dataset.id);
    const body = field === "is_active" ? { is_active: e.target.checked } : { title: e.target.value };
    const r = await api("POST", detailUrl(cfg.sectionApiUrl, id), body);
    if (!r.ok) return fail(r);
    S.sections = S.sections.map((x) => (x.id === id ? r.data.section : x));
    eToast("Saved");
    renderSections();
  });
  $("#section-list").addEventListener("click", async (e) => {
    const card = e.target.closest("[data-id]"); const act = e.target.closest("[data-act]")?.dataset.act;
    if (!card || !act) return;
    const id = Number(card.dataset.id); const sec = S.sections.find((x) => x.id === id);
    if (act === "up") return moveEntity(S.sections, id, -1, cfg.sectionApiUrl, renderSections);
    if (act === "down") return moveEntity(S.sections, id, 1, cfg.sectionApiUrl, renderSections);
    if (act === "pick") return openSectionPicker(sec);
    if (act === "delete") {
      if (!eConfirmAction("Delete this category section?")) return;
      const r = await api("DELETE", detailUrl(cfg.sectionApiUrl, id));
      if (!r.ok) return fail(r);
      S.sections = S.sections.filter((x) => x.id !== id);
      renderSections();
    }
  });

  // ───────── Featured collections ─────────
  function renderCollectionTabs() {
    $("#collection-tabs").innerHTML = S.collections.map((c) =>
      `<button class="hp-col-chip${c.id === S.selCollection ? " active" : ""}${c.is_active ? "" : " off"}" data-id="${c.id}">${esc(c.tab_label)}</button>`).join("");
  }

  function renderCollections() {
    populateSettings();
    if (!S.collections.length) {
      $("#collection-tabs").innerHTML = "";
      $("#collection-editor").innerHTML = `<div class="e-card"><div class="e-card-body"><div class="e-empty"><p>No collections yet. Create one to get started.</p></div></div></div>`;
      return;
    }
    if (!S.collections.some((c) => c.id === S.selCollection)) S.selCollection = S.collections[0].id;
    renderCollectionTabs();
    const c = S.collections.find((x) => x.id === S.selCollection);
    const idx = S.collections.indexOf(c);
    $("#collection-editor").innerHTML = `
      <div class="e-card" data-id="${c.id}">
        <div class="e-card-header">
          <h2>${esc(c.tab_label)}</h2>
          <div class="hp-row-actions">
            <button class="hp-icon-btn" data-act="left" ${idx === 0 ? "disabled" : ""} title="Move tab left"><i class="bi bi-arrow-left"></i></button>
            <button class="hp-icon-btn" data-act="right" ${idx === S.collections.length - 1 ? "disabled" : ""} title="Move tab right"><i class="bi bi-arrow-right"></i></button>
            <button class="btn-e-primary btn-sm" data-act="pick"><i class="bi bi-grid-3x2-gap"></i> Select 4 products (${c.products.length}/4)</button>
            <button class="hp-icon-btn danger" data-act="delete"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="e-card-body">
          <div class="hp-fields">
            <div class="e-field"><label class="e-label">Tab name</label><input class="e-input" data-cf="tab_label" value="${esc(c.tab_label)}"></div>
            <div class="e-field"><label class="e-label">Banner title</label><input class="e-input" data-cf="banner_title" value="${esc(c.custom_banner_title)}" placeholder="Defaults to tab name"></div>
            <div class="e-field hp-wide"><label class="e-label">Banner text</label><textarea class="e-input" rows="2" data-cf="banner_text">${esc(c.banner_text)}</textarea></div>
            <div class="e-field"><label class="e-label">Button text</label><input class="e-input" data-cf="cta_text" value="${esc(c.cta_text)}"></div>
            <div class="e-field"><label class="e-label">Button URL</label><input class="e-input" data-cf="cta_url" value="${esc(c.cta_url)}"></div>
            <div class="e-field"><label class="e-label">Meta line (left)</label><input class="e-input" data-cf="meta_left" value="${esc(c.meta_left)}"></div>
            <div class="e-field"><label class="e-label">Meta line (right)</label><input class="e-input" data-cf="meta_right" value="${esc(c.meta_right)}"></div>
            <div class="e-field"><label class="e-label">Banner image <span class="hp-optional">(1600 &times; 800 px, 2:1)</span></label><input type="file" class="e-input" id="cf-image" accept="image/*">
              <div class="hp-current">${c.banner_image ? `<img src="${esc(c.banner_image)}" alt=""> Current image` : "No image yet"}</div></div>
            <div class="e-field hp-switch"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="cf-active" ${c.is_active ? "checked" : ""}><label class="form-check-label" for="cf-active">Active</label></div></div>
          </div>
          <button class="btn-e-accent btn-sm" data-act="save">Save collection</button>
        </div>
        <div class="e-card-body p-0 border-top"><iframe class="hp-frame" id="frame-collection" title="Collection preview"></iframe></div>
      </div>`;
    setFrame("frame-collection", collectionHtml(c));
  }

  $("#collection-tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".hp-col-chip");
    if (b) { S.selCollection = Number(b.dataset.id); renderCollections(); }
  });

  const collectionModal = () => bootstrap.Modal.getOrCreateInstance($("#collection-modal"));
  $("#collection-add-btn").addEventListener("click", () => { $("#collection-form").reset(); collectionModal().show(); });
  $("#collection-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("tab_label", $("#collection-new-label").value);
    const f = $("#collection-new-image").files[0]; if (f) fd.append("banner_image", f);
    const r = await api("POST", cfg.collectionApiUrl, fd, true);
    if (!r.ok) return fail(r);
    S.collections.push(r.data.collection);
    S.selCollection = r.data.collection.id;
    collectionModal().hide();
    eToast("Collection created. Now choose its 4 products.");
    renderCollections();
  });

  $("#collection-editor").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    const c = S.collections.find((x) => x.id === S.selCollection);
    if (act === "left") return moveEntity(S.collections, c.id, -1, cfg.collectionApiUrl, renderCollections);
    if (act === "right") return moveEntity(S.collections, c.id, 1, cfg.collectionApiUrl, renderCollections);
    if (act === "pick") {
      return openPicker({
        title: c.tab_label, limit: 4, selected: c.products,
        onSave: async (ids) => {
          const r = await api("POST", `${detailUrl(cfg.collectionApiUrl, c.id)}products/`, { product_ids: ids });
          if (!r.ok) return fail(r);
          S.collections = S.collections.map((x) => (x.id === c.id ? r.data.collection : x));
          eToast("Saved");
          renderCollections();
        },
      });
    }
    if (act === "delete") {
      if (!eConfirmAction(`Delete the "${c.tab_label}" collection?`)) return;
      const r = await api("DELETE", detailUrl(cfg.collectionApiUrl, c.id));
      if (!r.ok) return fail(r);
      S.collections = S.collections.filter((x) => x.id !== c.id);
      renderCollections();
    }
    if (act === "save") {
      const fd = new FormData();
      $$("[data-cf]").forEach((el) => fd.append(el.dataset.cf, el.value));
      fd.append("is_active", $("#cf-active").checked ? "true" : "false");
      const f = $("#cf-image").files[0]; if (f) fd.append("banner_image", f);
      const r = await api("POST", detailUrl(cfg.collectionApiUrl, c.id), fd, true);
      if (!r.ok) return fail(r);
      S.collections = S.collections.map((x) => (x.id === c.id ? r.data.collection : x));
      eToast("Collection saved");
      renderCollections();
    }
  });

  // ───────── Settings (section copy, navbar, footer) ─────────
  function populateSettings() {
    $$("[data-setting]").forEach((el) => {
      const v = S.settings[el.dataset.setting];
      if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : v;
    });
  }

  function currentImage(boxId, url, flag) {
    $(boxId).innerHTML = url
      ? `<img src="${esc(url)}" alt=""> <button type="button" class="btn-e-danger-ghost" data-remove="${flag}">Remove</button>`
      : "No image set";
  }

  function renderCopy() {
    populateSettings();
    currentImage("#stitch-image-current", S.settings.stitch_image, "remove_stitch_image");
    setFrame("frame-copy", stitchHtml());
  }

  document.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (!rm) return;
    S.removeFlags[rm.dataset.remove] = true;
    rm.closest(".hp-current").innerHTML = "Will be removed when you save.";
  });

  async function saveSettings() {
    const fd = new FormData();
    $$("[data-setting]").forEach((el) => fd.append(el.dataset.setting, el.type === "checkbox" ? (el.checked ? "true" : "false") : el.value));
    [["stitch-image", "stitch_image"], ["logo-image", "logo"], ["mega-image", "mega_image"]].forEach(([id, name]) => {
      const f = document.getElementById(id).files[0]; if (f) fd.append(name, f);
    });
    Object.keys(S.removeFlags).forEach((k) => fd.append(k, "true"));
    fd.append("announcements", JSON.stringify(S.edit.announcements));
    fd.append("nav_items", JSON.stringify(S.edit.nav_items));
    fd.append("footer_socials", JSON.stringify(S.edit.footer_socials));
    fd.append("footer_columns", JSON.stringify(S.edit.footer_columns));
    const r = await api("POST", cfg.settingsApiUrl, fd, true);
    if (!r.ok) return fail(r);
    S.settings = r.data.settings;
    S.removeFlags = {};
    ["stitch-image", "logo-image", "mega-image"].forEach((id) => { document.getElementById(id).value = ""; });
    syncEditFromSettings();
    eToast("Saved");
    renderTab(S.tab);
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-save-settings]")) saveSettings(); });

  function syncEditFromSettings() {
    ["announcements", "nav_items", "footer_socials", "footer_columns"].forEach((k) => {
      S.edit[k] = JSON.parse(JSON.stringify(S.settings[k] || []));
    });
  }

  // ───────── Repeater editors ─────────
  const getPath = (root, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), root);
  const SOCIAL_ICONS = [
    ["fab fa-instagram", "Instagram"], ["fab fa-facebook-f", "Facebook"], ["fab fa-pinterest-p", "Pinterest"],
    ["fab fa-whatsapp", "WhatsApp"], ["fab fa-youtube", "YouTube"], ["fab fa-x-twitter", "X (Twitter)"],
    ["fab fa-linkedin-in", "LinkedIn"], ["fas fa-envelope", "Email"], ["fas fa-link", "Other link"],
  ];

  const ed = (list, path, val, ph = "") => `<input class="e-input" data-edit="${list}" data-path="${path}" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const delBtn = (list, path) => `<button type="button" class="hp-icon-btn danger" data-rep="remove" data-list="${list}" data-path="${path}" title="Remove"><i class="bi bi-trash"></i></button>`;

  function columnsHtml(list, base, columns) {
    return (columns || []).map((col, ci) => `
      <div class="hp-rep-col">
        <div class="hp-rep-row">${ed(list, `${base}.${ci}.heading`, col.heading, "Column heading")}${delBtn(list, `${base}.${ci}`)}</div>
        ${(col.links || []).map((l, li) => `<div class="hp-rep-row">${ed(list, `${base}.${ci}.links.${li}.label`, l.label, "Link label")}${ed(list, `${base}.${ci}.links.${li}.url`, l.url, "/shop/")}${delBtn(list, `${base}.${ci}.links.${li}`)}</div>`).join("")}
        <button type="button" class="btn-e-outline btn-sm" data-rep="push" data-list="${list}" data-path="${base}.${ci}.links" data-tpl='{"label":"","url":""}'><i class="bi bi-plus"></i> Add link</button>
      </div>`).join("");
  }

  function renderNavbar() {
    populateSettings();
    currentImage("#logo-current", S.settings.logo, "remove_logo");
    currentImage("#mega-current", S.settings.mega_image, "remove_mega_image");
    $("#announce-list").innerHTML = S.edit.announcements.length ? S.edit.announcements.map((a, i) =>
      `<div class="hp-rep-row">${ed("announcements", `${i}.text`, a.text, "Message")}${ed("announcements", `${i}.link_text`, a.link_text, "Link text (optional)")}${ed("announcements", `${i}.link_url`, a.link_url, "Link URL")}${delBtn("announcements", String(i))}</div>`).join("")
      : `<div class="hp-hint">No messages. Add one to show the announcement bar.</div>`;
    $("#nav-list").innerHTML = S.edit.nav_items.map((it, i) => `
      <div class="hp-rep">
        <div class="hp-rep-row">${ed("nav_items", `${i}.label`, it.label, "Menu label")}${ed("nav_items", `${i}.url`, it.url, "/shop/")}
          <label class="hp-sale"><input type="checkbox" data-edit="nav_items" data-path="${i}.style" data-sale ${it.style === "sale" ? "checked" : ""}> Highlight (sale)</label>${delBtn("nav_items", String(i))}</div>
        ${columnsHtml("nav_items", `${i}.columns`, it.columns)}
        <div class="hp-rep-actions"><button type="button" class="btn-e-outline btn-sm" data-rep="push" data-list="nav_items" data-path="${i}.columns" data-tpl='{"heading":"","links":[{"label":"","url":""}]}'><i class="bi bi-plus"></i> Add dropdown column</button></div>
      </div>`).join("");
  }

  function renderFooter() {
    populateSettings();
    $("#social-list").innerHTML = S.edit.footer_socials.map((s, i) => `
      <div class="hp-rep-row"><select class="e-select" data-edit="footer_socials" data-path="${i}.icon">${SOCIAL_ICONS.map(([v, l]) => `<option value="${v}" ${s.icon === v ? "selected" : ""}>${l}</option>`).join("")}${SOCIAL_ICONS.some(([v]) => v === s.icon) ? "" : `<option value="${esc(s.icon)}" selected>${esc(s.icon)}</option>`}</select>
      ${ed("footer_socials", `${i}.label`, s.label, "Label")}${ed("footer_socials", `${i}.url`, s.url, "https://…")}${delBtn("footer_socials", String(i))}</div>`).join("");
    $("#fcol-list").innerHTML = S.edit.footer_columns.map((col, i) => `
      <div class="hp-rep">
        <div class="hp-rep-row">${ed("footer_columns", `${i}.heading`, col.heading, "Column heading")}${delBtn("footer_columns", String(i))}</div>
        ${(col.links || []).map((l, li) => `<div class="hp-rep-row">${ed("footer_columns", `${i}.links.${li}.label`, l.label, "Link label")}${ed("footer_columns", `${i}.links.${li}.url`, l.url, "/shop/")}${delBtn("footer_columns", `${i}.links.${li}`)}</div>`).join("")}
        <button type="button" class="btn-e-outline btn-sm" data-rep="push" data-list="footer_columns" data-path="${i}.links" data-tpl='{"label":"","url":""}'><i class="bi bi-plus"></i> Add link</button>
      </div>`).join("");
  }

  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-edit]");
    if (!el) return;
    const parts = el.dataset.path.split(".");
    const last = parts.pop();
    const target = getPath(S.edit[el.dataset.edit], parts.join(".")) || S.edit[el.dataset.edit];
    target[last] = el.hasAttribute("data-sale") ? (el.checked ? "sale" : "") : el.value;
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-edit]")) e.target.dispatchEvent(new Event("input", { bubbles: true }));
  });

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rep]");
    if (!b) return;
    const list = S.edit[b.dataset.list];
    if (b.dataset.rep === "push") {
      getPath(list, b.dataset.path).push(JSON.parse(b.dataset.tpl));
    } else {
      const parts = b.dataset.path.split(".");
      const idx = Number(parts.pop());
      (parts.length ? getPath(list, parts.join(".")) : list).splice(idx, 1);
    }
    renderTab(S.tab);
  });

  const addTo = (key, item, tab) => () => { S.edit[key].push(item); renderTab(tab); };
  $("#announce-add").addEventListener("click", addTo("announcements", { text: "", link_text: "", link_url: "" }, "navbar"));
  $("#nav-add").addEventListener("click", addTo("nav_items", { label: "", url: "/shop/", style: "", columns: [] }, "navbar"));
  $("#social-add").addEventListener("click", addTo("footer_socials", { icon: "fab fa-instagram", label: "", url: "" }, "footer"));
  $("#fcol-add").addEventListener("click", addTo("footer_columns", { heading: "", links: [{ label: "", url: "" }] }, "footer"));

  // ───────── Initial load ─────────
  async function loadAll() {
    const [cats, banners, na, bs, tr, tiles, secs, cols, settings] = await Promise.all([
      api("GET", `${cfg.categoryApiUrl}?active_only=true`),
      api("GET", cfg.bannerApiUrl),
      api("GET", `${cfg.pickApiUrl}?section=new_arrivals`),
      api("GET", `${cfg.pickApiUrl}?section=bestsellers`),
      api("GET", `${cfg.pickApiUrl}?section=trending`),
      api("GET", cfg.tileApiUrl),
      api("GET", cfg.sectionApiUrl),
      api("GET", cfg.collectionApiUrl),
      api("GET", cfg.settingsApiUrl),
    ]);
    [cats, banners, na, bs, tr, tiles, secs, cols, settings].forEach((r) => { if (!r.ok) fail(r); });
    S.cats = cats.ok ? cats.data.categories : [];
    S.banners = banners.ok ? banners.data.banners : [];
    S.picks.new_arrivals = na.ok ? na.data.products : [];
    S.picks.bestsellers = bs.ok ? bs.data.products : [];
    S.picks.trending = tr.ok ? tr.data.products : [];
    S.tiles = tiles.ok ? tiles.data.tiles : [];
    S.sections = secs.ok ? secs.data.sections : [];
    S.collections = cols.ok ? cols.data.collections : [];
    S.settings = settings.ok ? settings.data.settings : {};
    syncEditFromSettings();
    $("#picker-category").insertAdjacentHTML("beforeend", S.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(""));
    const hash = location.hash.replace("#", "");
    showTab($(`#hp-tabs button[data-tab="${hash}"]`) ? hash : "banners");
  }
  loadAll();
}
