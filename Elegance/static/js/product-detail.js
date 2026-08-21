/**
 * product-detail.js — Elegance product detail page.
 * Called once via ProductDetailPageInit(config) from product-detail.html.
 */

let pdConfig = null;
let pdProduct = null;
let pdAttributeGroups = [];       // [{ id, name, values: [AttributeValue] }]
let pdSelectedValueIds = {};      // { attributeId: valueId }
let pdSelectedVariant = null;
let pdCurrentImg = 0;
let pdQty = 1;

// Common colour-name → hex lookup used to render round swatches instead
// of plain text pills when the attribute is clearly a colour attribute.
const PD_COLOR_HEX = {
  ivory: "#FFFFF0", white: "#FFFFFF", black: "#1C1613", red: "#C0392B",
  maroon: "#800000", pink: "#FFB6C1", "blush pink": "#FFB6C1", peach: "#FFCBA4",
  orange: "#E67E22", yellow: "#F1C40F", mustard: "#D4A843", gold: "#B8860B",
  green: "#27AE60", "mint green": "#98D8C8", olive: "#708238", teal: "#008080",
  blue: "#3498DB", "powder blue": "#B0C4DE", navy: "#1B2A4A", purple: "#8E44AD",
  lavender: "#B497BD", brown: "#795548", beige: "#E8DCC8", grey: "#95A5A6",
  gray: "#95A5A6", magenta: "#C71585", turquoise: "#40E0D0", coral: "#FF7F50",
  cream: "#FAF7F2", champagne: "#F5E6C4", rust: "#B7410E", wine: "#722F37",
};

function ProductDetailPageInit(config) {
  pdConfig = config;
  loadProduct();

  document.getElementById("pdQtyMinus").addEventListener("click", () => setQty(pdQty - 1));
  document.getElementById("pdQtyPlus").addEventListener("click", () => setQty(pdQty + 1));
  document.getElementById("pdAddCart").addEventListener("click", () => addToCart(false));
  document.getElementById("pdBuyNow").addEventListener("click", () => addToCart(true));

  document.querySelectorAll(".pd-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pd-tab-btn").forEach((b) => b.classList.toggle("pd-tab-active", b === btn));
      document.querySelectorAll(".pd-tab-panel").forEach((p) => {
        p.classList.toggle("pd-tab-panel-active", p.id === `tab-${btn.dataset.tab}`);
      });
    });
  });

  document.getElementById("pdShareCopy")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigator.clipboard?.writeText(window.location.href);
    eToast("Link copied to clipboard", "success");
  });

  eRefreshCartBadge(config.cartApiUrl);
}

async function loadProduct() {
  const [success, result] = await callApi(
    "GET", `${pdConfig.productApiUrl}${pdConfig.productSlug}/`, null, ""
  );

  document.getElementById("pdLoadingState").style.display = "none";

  if (!success || !result.success) {
    document.getElementById("pdErrorState").style.display = "";
    document.getElementById("pdErrorMsg").textContent = eExtractError(result, "Product not found.");
    return;
  }

  pdProduct = result.data.product;
  document.getElementById("pdLayout").style.display = "";
  renderProduct();
  loadRelatedProducts();
}

function renderProduct() {
  const p = pdProduct;
  document.title = p.name + " — ELEGANCE";
  document.getElementById("pdBreadcrumbName").textContent = p.name;
  document.getElementById("pdName").textContent = p.name;
  document.getElementById("pdSku").textContent = [p.category_name, p.sku ? `SKU: ${p.sku}` : ""].filter(Boolean).join(" · ");
  document.getElementById("pdShortDesc").textContent = p.short_description || "";

  renderTopBadges();

  renderDescriptionTab();
  renderSpecsTab();
  renderCareTab();
  renderGallery();
  renderPriceRow();
  buildAttributeGroups();
  renderVariantGroups();
  updateVariantMatch();
}

function renderTopBadges() {
  const p = pdProduct;
  const badges = [];
  if (p.is_featured) badges.push('<span class="pd-tag">Bestseller</span>');
  if (!p.in_stock) badges.push('<span class="pd-tag pd-tag-out">Out of Stock</span>');
  else if (p.stock_quantity > 0 && p.stock_quantity <= 5) badges.push('<span class="pd-tag pd-tag-low">Only Few Left</span>');
  document.getElementById("pdTopBadges").innerHTML = badges.join("");
}

/* ══════════════════════════════════════════════════════════════
   GALLERY
══════════════════════════════════════════════════════════════ */
function renderGallery() {
  const images = pdProduct.images && pdProduct.images.length
    ? pdProduct.images.slice().sort((a, b) => (a.is_primary ? -1 : 1))
    : [{ image: "/static/images/placeholder-product.png", alt_text: pdProduct.name }];

  const track = document.getElementById("pdMainTrack");
  const thumbRow = document.getElementById("pdThumbRow");
  const badge = document.getElementById("pdImgBadge");
  const counter = document.getElementById("pdImgCounter");

  track.innerHTML = images
    .map((img, i) => `
      <div class="pd-main-slide ${i === 0 ? "pd-main-active" : ""}">
        <img src="${img.image}" alt="${eEscapeHtml(img.alt_text || pdProduct.name)}" />
      </div>`)
    .join("");

  thumbRow.innerHTML = images
    .map((img, i) => `
      <button class="pd-thumb ${i === 0 ? "pd-thumb-active" : ""}" data-idx="${i}" type="button">
        <img src="${img.image}" alt="" />
      </button>`)
    .join("");

  if (pdProduct.is_featured) {
    badge.textContent = "Bestseller";
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }

  const totalImgs = images.length;
  pdCurrentImg = 0;

  function goToImage(idx) {
    pdCurrentImg = ((idx % totalImgs) + totalImgs) % totalImgs;
    track.style.transform = `translateX(-${pdCurrentImg * 100}%)`;
    thumbRow.querySelectorAll(".pd-thumb").forEach((t, i) => t.classList.toggle("pd-thumb-active", i === pdCurrentImg));
    counter.textContent = `${pdCurrentImg + 1} / ${totalImgs}`;
  }

  thumbRow.querySelectorAll(".pd-thumb").forEach((t) => {
    t.addEventListener("click", () => goToImage(parseInt(t.dataset.idx, 10)));
  });
  document.getElementById("pdImgPrev").addEventListener("click", () => goToImage(pdCurrentImg - 1));
  document.getElementById("pdImgNext").addEventListener("click", () => goToImage(pdCurrentImg + 1));

  if (totalImgs <= 1) {
    document.getElementById("pdImgPrev").style.display = "none";
    document.getElementById("pdImgNext").style.display = "none";
    counter.style.display = "none";
  } else {
    counter.textContent = `1 / ${totalImgs}`;
  }

  initGalleryZoom();
}

/* ══════════════════════════════════════════════════════════════
   PRICE
══════════════════════════════════════════════════════════════ */
function renderPriceRow() {
  const p = pdProduct;
  const effectivePrice = pdSelectedVariant ? pdSelectedVariant.effective_price : p.effective_price;
  const hasDiscount = !pdSelectedVariant && p.discount_percentage > 0;

  let html = `<span class="pd-price">${eFormatCurrency(effectivePrice)}</span>`;
  if (hasDiscount) {
    html += `<span class="pd-mrp">${eFormatCurrency(p.price)}</span>`;
    html += `<span class="pd-off">${p.discount_percentage}% OFF</span>`;
  }
  html += `<p class="pd-tax-note">Inclusive of all taxes. Free shipping above &#8377;2,999.</p>`;
  document.getElementById("pdPriceRow").innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   VARIANTS — grouped by attribute (e.g. Colour, Size)
══════════════════════════════════════════════════════════════ */
function buildAttributeGroups() {
  pdAttributeGroups = [];
  pdSelectedValueIds = {};

  const variants = pdProduct.variants || [];
  const seenAttrs = new Map(); // attrId -> { id, name, values: Map(valueId -> value) }

  variants.forEach((v) => {
    (v.attribute_values_detail || []).forEach((av) => {
      if (!seenAttrs.has(av.attribute)) {
        seenAttrs.set(av.attribute, { id: av.attribute, name: av.attribute_name || "Option", values: new Map() });
      }
      seenAttrs.get(av.attribute).values.set(av.id, av);
    });
  });

  pdAttributeGroups = Array.from(seenAttrs.values()).map((g) => ({
    id: g.id,
    name: g.name,
    values: Array.from(g.values.values()).sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
  }));
}

function isColourAttribute(name) {
  return /colou?r/i.test(name || "");
}

function renderVariantGroups() {
  const wrap = document.getElementById("pdVariantGroups");

  if (!pdAttributeGroups.length) {
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = pdAttributeGroups
    .map((group) => {
      const isColour = isColourAttribute(group.name);
      const optionsHtml = group.values
        .map((val) => {
          const disabled = !valueHasStock(group.id, val.id);
          if (isColour) {
            const hex = PD_COLOR_HEX[String(val.value).toLowerCase()];
            if (hex) {
              return `<button type="button" class="pd-swatch" style="background:${hex}" title="${eEscapeHtml(val.value)}"
                data-attr="${group.id}" data-value="${val.id}" ${disabled ? "disabled" : ""}></button>`;
            }
            return `<button type="button" class="pd-swatch pd-swatch-plain" title="${eEscapeHtml(val.value)}"
              data-attr="${group.id}" data-value="${val.id}" ${disabled ? "disabled" : ""}>${eEscapeHtml(val.value)}</button>`;
          }
          return `<button type="button" class="pd-size-btn" data-attr="${group.id}" data-value="${val.id}" ${disabled ? "disabled" : ""}>
            ${eEscapeHtml(val.value)}
          </button>`;
        })
        .join("");

      return `
        <div class="pd-option-group" data-attr-group="${group.id}">
          <span class="pd-option-label">${eEscapeHtml(group.name)}: <strong data-attr-selected="${group.id}">Select ${eEscapeHtml(group.name)}</strong></span>
          <div class="${isColour ? "pd-swatch-grid" : "pd-size-grid"}">${optionsHtml}</div>
        </div>`;
    })
    .join("");

  wrap.querySelectorAll("button[data-attr]:not(:disabled)").forEach((btn) => {
    btn.addEventListener("click", () => {
      const attrId = btn.dataset.attr;
      const valueId = btn.dataset.value;
      pdSelectedValueIds[attrId] = valueId;

      wrap.querySelectorAll(`button[data-attr="${attrId}"]`).forEach((b) => {
        b.classList.toggle("pd-swatch-active", b === btn && b.classList.contains("pd-swatch"));
        b.classList.toggle("pd-size-active", b === btn && b.classList.contains("pd-size-btn"));
      });

      const group = pdAttributeGroups.find((g) => String(g.id) === attrId);
      const selectedVal = group?.values.find((v) => String(v.id) === valueId);
      const label = wrap.querySelector(`[data-attr-selected="${attrId}"]`);
      if (label && selectedVal) label.textContent = selectedVal.value;

      updateVariantMatch();
    });
  });
}

// Returns true if at least one active variant containing this attribute value
// still has stock, given other currently-selected values (best-effort check).
function valueHasStock(attrId, valueId) {
  const variants = pdProduct.variants || [];
  return variants.some((v) => {
    if (!v.is_active) return false;
    const ids = (v.attribute_values_detail || []).map((av) => String(av.id));
    return ids.includes(String(valueId)) && v.stock_quantity > 0;
  });
}

function updateVariantMatch() {
  const variants = pdProduct.variants || [];
  const groupIds = pdAttributeGroups.map((g) => String(g.id));
  const selectedIds = groupIds.map((id) => pdSelectedValueIds[id]);
  const allSelected = groupIds.length > 0 && selectedIds.every(Boolean);

  pdSelectedVariant = null;
  if (allSelected) {
    pdSelectedVariant = variants.find((v) => {
      const valueIds = (v.attribute_values_detail || []).map((av) => String(av.id));
      return selectedIds.every((sid) => valueIds.includes(String(sid))) && valueIds.length === selectedIds.length;
    }) || null;
  }

  renderPriceRow();
  updateStockNote();
}

function updateStockNote() {
  const note = document.getElementById("pdStockNote");
  const hasGroups = pdAttributeGroups.length > 0;
  const addBtn = document.getElementById("pdAddCart");
  const buyBtn = document.getElementById("pdBuyNow");

  if (hasGroups && !pdSelectedVariant) {
    note.textContent = "Select all options to check availability";
    note.className = "pd-stock-note";
    addBtn.disabled = false;
    buyBtn.disabled = false;
    return;
  }

  const available = pdSelectedVariant ? pdSelectedVariant.stock_quantity : pdProduct.stock_quantity;
  const inStock = pdSelectedVariant ? pdSelectedVariant.stock_quantity > 0 : pdProduct.in_stock;

  if (!inStock) {
    note.textContent = "Out of stock";
    note.className = "pd-stock-note pd-stock-out";
    addBtn.disabled = true;
    buyBtn.disabled = true;
  } else if (available <= 5) {
    note.textContent = `Only ${available} left`;
    note.className = "pd-stock-note pd-stock-low";
    addBtn.disabled = false;
    buyBtn.disabled = false;
  } else {
    note.textContent = "In stock";
    note.className = "pd-stock-note";
    addBtn.disabled = false;
    buyBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   QUANTITY + CART
══════════════════════════════════════════════════════════════ */
function setQty(next) {
  const max = pdSelectedVariant ? pdSelectedVariant.stock_quantity : pdProduct.stock_quantity;
  if (next < 1 || next > Math.max(max, 1)) return;
  pdQty = next;
  document.getElementById("pdQtyVal").textContent = pdQty;
}

async function addToCart(redirectToCheckout) {
  if (pdAttributeGroups.length && !pdSelectedVariant) {
    eToast("Please select all options first", "error");
    document.querySelectorAll(".pd-variant-groups .pd-option-group").forEach((g) => {
      g.style.outline = "2px solid #c0392b";
      g.style.borderRadius = "8px";
      setTimeout(() => { g.style.outline = ""; }, 1500);
    });
    return;
  }

  const btn = redirectToCheckout ? document.getElementById("pdBuyNow") : document.getElementById("pdAddCart");
  btn.disabled = true;

  const payload = { product: pdProduct.id, quantity: pdQty };
  if (pdSelectedVariant) payload.variant = pdSelectedVariant.id;

  const [success, result] = await callApi("POST", pdConfig.cartApiUrl, payload, pdConfig.csrfToken);
  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not add to cart."), "error");
    return;
  }

  eRefreshCartBadge(pdConfig.cartApiUrl);

  if (redirectToCheckout) {
    window.location.href = pdConfig.checkoutUrl;
  } else {
    eToast("Added to your bag!", "success");
  }
}

/* ═══════════════════════════════════════════════════���══════════
   RELATED PRODUCTS
══════════════════════════════════════════════════════════════ */
async function loadRelatedProducts() {
  if (!pdProduct.category) return;
  const qs = new URLSearchParams({ category: pdProduct.category, page_size: 4 });
  const [success, result] = await callApi("GET", `${pdConfig.productApiUrl}?${qs.toString()}`, null, "");
  if (!success || !result.success) return;

  const related = result.data.products.filter((p) => p.id !== pdProduct.id).slice(0, 4);
  if (!related.length) return;

  document.getElementById("pdRelatedSection").style.display = "";
  document.getElementById("pdRelatedGrid").innerHTML = related.map(renderRelatedCard).join("");
}

function renderRelatedCard(p) {
  const url = pdConfig.productDetailUrlTemplate.replace("__SLUG__", p.slug);
  return `
    <a href="${url}" class="pd-rel-card">
      <div class="pd-rel-img-wrap">
        <img src="${p.primary_image_url || "/static/images/placeholder-product.png"}" alt="${eEscapeHtml(p.name)}" loading="lazy" />
      </div>
      <p class="pd-rel-category">${eEscapeHtml(p.category_name || "")}</p>
      <h3 class="pd-rel-name">${eEscapeHtml(p.name)}</h3>
      <div class="pd-rel-price-row">
        <span class="pd-rel-price">${eFormatCurrency(p.effective_price)}</span>
        ${p.discount_percentage > 0 ? `<span class="pd-rel-mrp">${eFormatCurrency(p.price)}</span>` : ""}
      </div>
    </a>`;
}
/* ══════════════════════════════════════════════════════════════
   PRODUCT DETAILS TAB — freeform key/value spec rows
══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   DESCRIPTION TAB — hidden entirely when the product has no description
══════════════════════════════════════════════════════════════ */
function renderDescriptionTab() {
  const btn = document.querySelector('.pd-tab-btn[data-tab="description"]');
  const panel = document.getElementById("tab-description");
  const hasDescription = !!(pdProduct.description && pdProduct.description.trim());

  if (!hasDescription) {
    panel.innerHTML = "";
    if (btn) btn.style.display = "none";
    if (btn?.classList.contains("pd-tab-active") || panel.classList.contains("pd-tab-panel-active")) {
      activateFirstVisibleTab();
    }
    return;
  }

  if (btn) btn.style.display = "";
  panel.innerHTML = pdProduct.description
    .split(/\n+/).filter(Boolean).map((para) => `<p>${eEscapeHtml(para)}</p>`).join("");
}

function activateFirstVisibleTab() {
  const visibleBtns = Array.from(document.querySelectorAll(".pd-tab-btn")).filter((b) => b.style.display !== "none");
  if (!visibleBtns.length) return;
  const active = visibleBtns[0];
  document.querySelectorAll(".pd-tab-btn").forEach((b) => b.classList.toggle("pd-tab-active", b === active));
  document.querySelectorAll(".pd-tab-panel").forEach((p) => {
    p.classList.toggle("pd-tab-panel-active", p.id === `tab-${active.dataset.tab}`);
  });
}

function renderSpecsTab() {
  const panel = document.getElementById("tab-details");
  const specs = pdProduct.specifications || [];

  if (!specs.length) {
    panel.innerHTML = `<p class="pd-empty-note">No additional product details available.</p>`;
    return;
  }

  panel.innerHTML = `
    <div class="pd-specs-table">
      ${specs.map((s) => `
        <div class="pd-specs-row">
          <span class="pd-specs-key">${eEscapeHtml(s.key)}</span>
          <span class="pd-specs-value">${eEscapeHtml(s.value)}</span>
        </div>`).join("")}
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   CARE & FABRIC TAB — icon + title + description cards
══════════════════════════════════════════════════════════════ */
const PD_CARE_ICON_MAP = {
  "hand-wash": "fa-hand-paper",
  "machine-wash": "fa-tshirt",
  "no-bleach": "fa-tint-slash",
  "dry-shade": "fa-cloud-sun",
  "dry-sun": "fa-sun",
  "low-iron": "fa-temperature-low",
  "no-iron": "fa-ban",
  "dry-clean": "fa-tshirt",
  "no-dry-clean": "fa-times-circle",
  "store": "fa-box",
  "delicate": "fa-feather-alt",
  "general": "fa-info-circle",
};

function renderCareTab() {
  const panel = document.getElementById("tab-care");
  const rows = pdProduct.care_instructions || [];

  if (!rows.length) {
    panel.innerHTML = `<p class="pd-empty-note">No care instructions available for this product.</p>`;
    return;
  }

  panel.innerHTML = `
    <div class="pd-care-grid">
      ${rows.map((r) => `
        <div class="pd-care-card">
          <span class="pd-care-icon"><i class="fas ${PD_CARE_ICON_MAP[r.icon] || "fa-info-circle"}"></i></span>
          <h4 class="pd-care-title">${eEscapeHtml(r.title)}</h4>
          ${r.description ? `<p class="pd-care-desc">${eEscapeHtml(r.description)}</p>` : ""}
        </div>`).join("")}
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   IMAGE ZOOM — lens box over the main image + magnified result panel
══════════════════════════════════════════════════════════════ */
const PD_LENS_W = 160, PD_LENS_H = 160, PD_ZOOM_FACTOR = 2.4;

function initGalleryZoom() {
  const mainWrap = document.getElementById("pdMainWrap");
  const track = document.getElementById("pdMainTrack");
  const lens = document.getElementById("pdZoomLens");
  const result = document.getElementById("pdZoomResult");
  if (!mainWrap || !track || !lens || !result) return;

  // Avoid attaching duplicate listeners if renderGallery() runs more than once.
  if (mainWrap.dataset.zoomBound === "true") return;
  mainWrap.dataset.zoomBound = "true";

  function activeImage() {
    const slides = track.querySelectorAll(".pd-main-slide");
    const slide = slides[pdCurrentImg] || slides[0];
    return slide ? slide.querySelector("img") : null;
  }

  function positionLens(clientX, clientY) {
    const img = activeImage();
    if (!img || !img.complete || !img.naturalWidth) return false;

    const wrapRect = mainWrap.getBoundingClientRect();

    let lx = clientX - wrapRect.left - PD_LENS_W / 2;
    let ly = clientY - wrapRect.top - PD_LENS_H / 2;
    lx = Math.max(0, Math.min(lx, wrapRect.width - PD_LENS_W));
    ly = Math.max(0, Math.min(ly, wrapRect.height - PD_LENS_H));

    lens.style.width = PD_LENS_W + "px";
    lens.style.height = PD_LENS_H + "px";
    lens.style.left = lx + "px";
    lens.style.top = ly + "px";
    lens.classList.add("pd-zoom-lens-active");

    const bgW = wrapRect.width * PD_ZOOM_FACTOR;
    const bgH = wrapRect.height * PD_ZOOM_FACTOR;

    result.style.backgroundImage = `url('${img.src}')`;
    result.style.backgroundRepeat = "no-repeat";
    result.style.backgroundSize = `${bgW}px ${bgH}px`;

    const resultW = result.offsetWidth || 380;
    const resultH = result.offsetHeight || 380;
    const rx = (lx / (wrapRect.width - PD_LENS_W)) * (bgW - resultW);
    const ry = (ly / (wrapRect.height - PD_LENS_H)) * (bgH - resultH);
    result.style.backgroundPosition = `-${rx}px -${ry}px`;
    result.classList.add("active");
    return true;
  }

  mainWrap.addEventListener("mousemove", (e) => {
    positionLens(e.clientX, e.clientY);
  });

  mainWrap.addEventListener("mouseleave", () => {
    lens.classList.remove("pd-zoom-lens-active");
    result.classList.remove("active");
  });
}

