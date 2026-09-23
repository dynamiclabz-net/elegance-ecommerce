/**
 * shop.js — Elegance shop / catalog page.
 *
 * Follows the same convention as account.js / admin_*.js: the page calls
 * ShopPageInit(config) once, passing the API endpoints and CSRF token.
 * All data access goes through callApi() (api_caller.js).
 */

let shopConfig = null;
let shopState = {
  category: "",
  subcategory: "",
  productType: "",
  minPrice: 0,
  maxPrice: 25000,
  inStock: false,
  featured: false,
  sort: "",
  page: 1,
  pageSize: 12,
  search: "",
};

// Cache of the products currently rendered, keyed by id, so Quick View
// can populate itself from already-fetched data instead of another call.
let shopProductsById = {};
let qvQty = 1;
let qvActiveProduct = null;

function ShopPageInit(config) {
  shopConfig = config;

  const params = new URLSearchParams(window.location.search);
  if (params.get("category")) shopState.category = params.get("category");
  if (params.get("search")) shopState.search = params.get("search");

  loadCategories();
  loadProductTypes();
  loadProducts();
  eRefreshCartBadge(shopConfig.cartApiUrl);

  bindToolbarEvents();
  bindSidebarEvents();
  bindMobileSidebarToggle();
  bindGridToggle();
  bindQuickView();
}

// ─────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────
async function loadCategories() {
  const [success, result] = await callApi("GET", shopConfig.categoryApiUrl, null, "");
  const tabsInner = document.getElementById("catTabsInner");
  if (!success || !result.success) return;

  const categories = result.data.categories || [];
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "cat-tab";
    btn.dataset.category = String(cat.id);
    btn.textContent = cat.name;
    if (String(cat.id) === String(shopState.category)) {
      btn.classList.add("cat-tab-active");
      document.querySelector('.cat-tab[data-category=""]')?.classList.remove("cat-tab-active");
      renderSubcategoryFilters(cat.subcategories || []);
    }
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("cat-tab-active"));
      btn.classList.add("cat-tab-active");
      shopState.category = cat.id;
      shopState.subcategory = "";
      shopState.page = 1;
      renderSubcategoryFilters(cat.subcategories || []);
      loadProducts();
      updateFilterCountBadge();
    });
    tabsInner.appendChild(btn);
  });

  document.querySelector('.cat-tab[data-category=""]').addEventListener("click", (e) => {
    document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("cat-tab-active"));
    e.target.classList.add("cat-tab-active");
    shopState.category = "";
    shopState.subcategory = "";
    shopState.page = 1;
    document.getElementById("subcategoryFilterBody").innerHTML =
      '<p class="filter-count" style="margin:0;">Select a category above</p>';
    loadProducts();
    updateFilterCountBadge();
  });
}

function renderSubcategoryFilters(subcategories) {
  const body = document.getElementById("subcategoryFilterBody");
  if (!subcategories.length) {
    body.innerHTML = '<p class="filter-count" style="margin:0;">No sub-categories</p>';
    return;
  }
  body.innerHTML = subcategories
    .map(
      (sc) => `
      <label class="filter-check">
        <input type="radio" name="subcategory" value="${sc.id}" class="filter-input" data-type="subcategory" />
        ${eEscapeHtml(sc.name)}
      </label>`
    )
    .join("");
  body.querySelectorAll('input[data-type="subcategory"]').forEach((input) => {
    input.addEventListener("change", () => {
      shopState.subcategory = input.value;
      shopState.page = 1;
      loadProducts();
      updateFilterCountBadge();
    });
  });
}

async function loadProductTypes() {
  const [success, result] = await callApi("GET", shopConfig.productTypeApiUrl, null, "");
  const body = document.getElementById("productTypeFilterBody");
  if (!success || !result.success || !result.data.product_types?.length) {
    body.innerHTML = '<p class="filter-count" style="margin:0;">No product types</p>';
    return;
  }
  body.innerHTML = result.data.product_types
    .map(
      (pt) => `
      <label class="filter-check">
        <input type="radio" name="productType" value="${pt.id}" class="filter-input" data-type="product_type" />
        ${eEscapeHtml(pt.name)}
      </label>`
    )
    .join("");
  body.querySelectorAll('input[data-type="product_type"]').forEach((input) => {
    input.addEventListener("change", () => {
      shopState.productType = input.value;
      shopState.page = 1;
      loadProducts();
      updateFilterCountBadge();
    });
  });
}

async function loadProducts() {
  const grid = document.getElementById("productGrid");
  grid.innerHTML = '<div class="empty-shop-state"><i class="fas fa-circle-notch fa-spin"></i><p>Loading products…</p></div>';

  const qs = new URLSearchParams();
  if (shopState.category) qs.set("category", shopState.category);
  if (shopState.subcategory) qs.set("subcategory", shopState.subcategory);
  if (shopState.productType) qs.set("product_type", shopState.productType);
  if (shopState.search) qs.set("search", shopState.search);
  if (shopState.minPrice) qs.set("min_price", shopState.minPrice);
  if (shopState.maxPrice) qs.set("max_price", shopState.maxPrice);
  if (shopState.inStock) qs.set("in_stock", "true");
  if (shopState.featured) qs.set("is_featured", "true");
  if (shopState.sort) qs.set("sort", shopState.sort);
  qs.set("page", shopState.page);
  qs.set("page_size", shopState.pageSize);

  const [success, result] = await callApi("GET", `${shopConfig.productApiUrl}?${qs.toString()}`, null, "");

  if (!success || !result.success) {
    grid.innerHTML = '<div class="empty-shop-state"><p>Could not load products. Please try again.</p></div>';
    document.getElementById("paginationWrap").style.display = "none";
    return;
  }

  const { products, total_count } = result.data;
  document.getElementById("resultCount").textContent =
    `${total_count} Product${total_count === 1 ? "" : "s"}`;

  shopProductsById = {};
  products.forEach((p) => (shopProductsById[p.id] = p));

  if (!products.length) {
    grid.innerHTML = '<div class="empty-shop-state"><i class="fas fa-search"></i><p>No products match your filters.</p></div>';
    document.getElementById("paginationWrap").style.display = "none";
    return;
  }

  grid.innerHTML = products.map(renderProductCard).join("");
  bindProductCardEvents();
  renderPagination(total_count);
}

function renderProductCard(p) {
  const url = shopConfig.productDetailUrlTemplate.replace("__SLUG__", p.slug);
  const hasDiscount = p.discount_percentage > 0;
  return `
    <div class="sp-card" data-id="${p.id}">
      <div class="sp-img-wrap">
        <a href="${url}" aria-label="${eEscapeHtml(p.name)}">
          <img src="${p.primary_image_url || "/static/images/placeholder-product.png"}" alt="${eEscapeHtml(p.name)}" loading="lazy" />
        </a>
        <div class="sp-badges">
          ${p.is_featured ? '<span class="sp-badge sp-badge-featured">Featured</span>' : ""}
          ${!p.in_stock ? '<span class="sp-badge sp-badge-oos">Out of Stock</span>' : ""}
        </div>
        <button class="sp-wish" aria-label="Wishlist" data-id="${p.id}"><i class="far fa-heart"></i></button>
        <div class="sp-hover-actions">
          <button class="sp-quick-view" data-id="${p.id}"><i class="fas fa-eye"></i> Quick View</button>
          <button class="sp-add-cart" data-id="${p.id}" ${!p.in_stock ? "disabled" : ""}>
            <i class="fas fa-shopping-bag"></i> ${p.in_stock ? "Add to Cart" : "Sold Out"}
          </button>
        </div>
      </div>
      <div class="sp-info">
        <p class="sp-category">${eEscapeHtml(p.category_name || "")}</p>
        <a href="${url}"><h3 class="sp-name">${eEscapeHtml(p.name)}</h3></a>
        <div class="sp-price-row">
          <span class="sp-price">${eFormatCurrency(p.effective_price)}</span>
          ${hasDiscount ? `<span class="sp-mrp">${eFormatCurrency(p.price)}</span><span class="sp-off">${p.discount_percentage}% OFF</span>` : ""}
        </div>
      </div>
    </div>`;
}

function bindProductCardEvents() {
  document.querySelectorAll(".sp-add-cart").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      await addToCart(btn.dataset.id, 1, btn);
    });
  });

  document.querySelectorAll(".sp-wish").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleWishIcon(btn);
    });
  });

  document.querySelectorAll(".sp-quick-view").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openQuickView(shopProductsById[btn.dataset.id]);
    });
  });
}

function toggleWishIcon(btn) {
  const icon = btn.querySelector("i");
  btn.classList.toggle("active");
  const isActive = btn.classList.contains("active");
  icon?.classList.toggle("far", !isActive);
  icon?.classList.toggle("fas", isActive);
}

async function addToCart(productId, quantity, triggerBtn) {
  if (triggerBtn) triggerBtn.disabled = true;
  const [success, result] = await callApi(
    "POST", shopConfig.cartApiUrl, { product: productId, quantity }, shopConfig.csrfToken
  );
  if (triggerBtn) triggerBtn.disabled = false;
  if (success && result.success) {
    eRefreshCartBadge(shopConfig.cartApiUrl);
    eToast("Added to cart", "success");
  } else {
    eToast(eExtractError(result, "Could not add to cart."), "error");
  }
  return success && result.success;
}

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────
function renderPagination(totalCount) {
  const wrap = document.getElementById("paginationWrap");
  const totalPages = Math.ceil(totalCount / shopState.pageSize);

  if (totalPages <= 1) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "flex";

  const start = (shopState.page - 1) * shopState.pageSize + 1;
  const end = Math.min(shopState.page * shopState.pageSize, totalCount);
  document.getElementById("paginationInfo").textContent =
    `Showing ${start}–${end} of ${totalCount} products`;

  const pgPrev = document.getElementById("pgPrev");
  const pgNext = document.getElementById("pgNext");
  pgPrev.disabled = shopState.page === 1;
  pgNext.disabled = shopState.page >= totalPages;
  pgPrev.onclick = () => {
    if (shopState.page > 1) {
      shopState.page--;
      loadProducts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  pgNext.onclick = () => {
    if (shopState.page < totalPages) {
      shopState.page++;
      loadProducts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const pages = new Set([1, shopState.page - 1, shopState.page, shopState.page + 1, totalPages]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  let html = "";
  let last = 0;
  sorted.forEach((p) => {
    if (last && p - last > 1) html += `<span class="pg-ellipsis">…</span>`;
    html += `<button class="pg-num${p === shopState.page ? " pg-active" : ""}" data-page="${p}">${p}</button>`;
    last = p;
  });
  const pgNums = document.getElementById("pgNums");
  pgNums.innerHTML = html;
  pgNums.querySelectorAll(".pg-num").forEach((btn) => {
    btn.addEventListener("click", () => {
      shopState.page = parseInt(btn.dataset.page, 10);
      loadProducts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

// ─────────────────────────────────────────────
// Toolbar + sidebar interactions
// ─────────────────────────────────────────────
function bindToolbarEvents() {
  document.getElementById("sortSelect").addEventListener("change", (e) => {
    shopState.sort = e.target.value;
    shopState.page = 1;
    loadProducts();
  });
}

function bindGridToggle() {
  const grid3Btn = document.getElementById("grid3Btn");
  const grid4Btn = document.getElementById("grid4Btn");
  const productGrid = document.getElementById("productGrid");

  grid3Btn?.addEventListener("click", () => {
    productGrid.classList.remove("grid-4");
    productGrid.classList.add("grid-3");
    grid3Btn.classList.add("grid-btn-active");
    grid4Btn?.classList.remove("grid-btn-active");
  });
  grid4Btn?.addEventListener("click", () => {
    productGrid.classList.remove("grid-3");
    productGrid.classList.add("grid-4");
    grid4Btn.classList.add("grid-btn-active");
    grid3Btn?.classList.remove("grid-btn-active");
  });
}

function updateFilterCountBadge() {
  let count = 0;
  if (shopState.category) count++;
  if (shopState.subcategory) count++;
  if (shopState.productType) count++;
  if (shopState.inStock) count++;
  if (shopState.featured) count++;
  if (shopState.minPrice > 0) count++;
  if (shopState.maxPrice < 25000) count++;

  const badge = document.getElementById("filterCountBadge");
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
}

function bindSidebarEvents() {
  document.querySelectorAll(".filter-group-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const body = toggle.nextElementSibling;
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      body.style.display = expanded ? "none" : "";
      toggle.querySelector(".filter-chevron")?.classList.toggle("fa-chevron-up", !expanded);
      toggle.querySelector(".filter-chevron")?.classList.toggle("fa-chevron-down", expanded);
    });
  });

  const minSlider = document.getElementById("priceSliderMin");
  const maxSlider = document.getElementById("priceSliderMax");
  const minLabel = document.getElementById("priceMinLabel");
  const maxLabel = document.getElementById("priceMaxLabel");

  function updatePriceTrack() {
    const min = parseInt(minSlider.value, 10);
    const max = parseInt(maxSlider.value, 10);
    const range = parseInt(minSlider.max, 10) - parseInt(minSlider.min, 10);
    const leftPct = ((min - parseInt(minSlider.min, 10)) / range) * 100;
    const rightPct = 100 - ((max - parseInt(minSlider.min, 10)) / range) * 100;
    minSlider.style.background = `linear-gradient(to right, var(--border-md) ${leftPct}%, var(--gold) ${leftPct}%, var(--gold) ${100 - rightPct}%, var(--border-md) ${100 - rightPct}%)`;
    maxSlider.style.background = "transparent";
  }

  function commitPriceRange() {
    let min = parseInt(minSlider.value, 10);
    let max = parseInt(maxSlider.value, 10);
    if (min > max) [min, max] = [max, min];
    shopState.minPrice = min;
    shopState.maxPrice = max;
    minLabel.textContent = eFormatCurrency(min);
    maxLabel.textContent = eFormatCurrency(max);
    updatePriceTrack();
    shopState.page = 1;
    loadProducts();
    updateFilterCountBadge();
  }
  minSlider.addEventListener("input", updatePriceTrack);
  maxSlider.addEventListener("input", updatePriceTrack);
  minSlider.addEventListener("change", commitPriceRange);
  maxSlider.addEventListener("change", commitPriceRange);
  updatePriceTrack();

  document.getElementById("inStockFilter").addEventListener("change", (e) => {
    shopState.inStock = e.target.checked;
    shopState.page = 1;
    loadProducts();
    updateFilterCountBadge();
  });
  document.getElementById("featuredFilter").addEventListener("change", (e) => {
    shopState.featured = e.target.checked;
    shopState.page = 1;
    loadProducts();
    updateFilterCountBadge();
  });

  document.getElementById("clearAllBtn").addEventListener("click", () => {
    shopState = { ...shopState, category: "", subcategory: "", productType: "", minPrice: 0, maxPrice: 25000, inStock: false, featured: false, sort: "", page: 1 };
    minSlider.value = 0;
    maxSlider.value = 25000;
    minLabel.textContent = eFormatCurrency(0);
    maxLabel.textContent = eFormatCurrency(25000);
    updatePriceTrack();
    document.getElementById("inStockFilter").checked = false;
    document.getElementById("featuredFilter").checked = false;
    document.getElementById("sortSelect").value = "";
    document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("cat-tab-active"));
    document.querySelector('.cat-tab[data-category=""]').classList.add("cat-tab-active");
    document.getElementById("subcategoryFilterBody").innerHTML =
      '<p class="filter-count" style="margin:0;">Select a category above</p>';
    document.querySelectorAll('input[data-type="product_type"]').forEach((i) => (i.checked = false));
    loadProducts();
    updateFilterCountBadge();
  });
}

function bindMobileSidebarToggle() {
  const sidebar = document.getElementById("shopSidebar");
  const backdrop = document.getElementById("filterBackdrop");

  function openSidebar() {
    sidebar.classList.add("shop-sidebar-open");
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeSidebar() {
    sidebar.classList.remove("shop-sidebar-open");
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.getElementById("filterToggleBtn").addEventListener("click", openSidebar);
  document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
  backdrop.addEventListener("click", closeSidebar);
}

// ─────────────────────────────────────────────
// Quick View modal
// ─────────────────────────────────────────────
function openQuickView(product) {
  if (!product) return;
  qvActiveProduct = product;
  qvQty = 1;

  const url = shopConfig.productDetailUrlTemplate.replace("__SLUG__", product.slug);
  const hasDiscount = product.discount_percentage > 0;

  document.getElementById("qvImg").src = product.primary_image_url || "/static/images/placeholder-product.png";
  document.getElementById("qvImg").alt = product.name;
  document.getElementById("qvCat").textContent = product.category_name || "";
  document.getElementById("qvTitle").textContent = product.name;
  document.getElementById("qvPrice").textContent = eFormatCurrency(product.effective_price);
  document.getElementById("qvMrp").textContent = hasDiscount ? eFormatCurrency(product.price) : "";
  document.getElementById("qvOff").textContent = hasDiscount ? `${product.discount_percentage}% OFF` : "";

  const stockEl = document.getElementById("qvStock");
  stockEl.textContent = product.in_stock ? "In Stock" : "Out of Stock";
  stockEl.classList.toggle("in", product.in_stock);
  stockEl.classList.toggle("out", !product.in_stock);

  document.getElementById("qvQtyVal").textContent = qvQty;

  const addCartBtn = document.getElementById("qvAddCart");
  addCartBtn.disabled = !product.in_stock;
  addCartBtn.innerHTML = product.in_stock
    ? '<i class="fas fa-shopping-bag"></i> Add to Cart'
    : '<i class="fas fa-shopping-bag"></i> Sold Out';

  const wishBtn = document.getElementById("qvWish");
  wishBtn.classList.remove("active");
  wishBtn.querySelector("i").className = "far fa-heart";

  document.getElementById("qvFullLink").href = url;

  document.getElementById("qvBackdrop").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeQuickView() {
  document.getElementById("qvBackdrop").classList.remove("open");
  document.body.style.overflow = "";
  qvActiveProduct = null;
}

function bindQuickView() {
  const qvBackdrop = document.getElementById("qvBackdrop");
  document.getElementById("qvClose").addEventListener("click", closeQuickView);
  qvBackdrop.addEventListener("click", (e) => {
    if (e.target === qvBackdrop) closeQuickView();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeQuickView();
  });

  document.getElementById("qvQtyMinus").addEventListener("click", () => {
    if (qvQty > 1) {
      qvQty--;
      document.getElementById("qvQtyVal").textContent = qvQty;
    }
  });
  document.getElementById("qvQtyPlus").addEventListener("click", () => {
    qvQty++;
    document.getElementById("qvQtyVal").textContent = qvQty;
  });

  document.getElementById("qvWish").addEventListener("click", (e) => {
    toggleWishIcon(e.currentTarget);
  });

  document.getElementById("qvAddCart").addEventListener("click", async (e) => {
    if (!qvActiveProduct || e.currentTarget.disabled) return;
    const added = await addToCart(qvActiveProduct.id, qvQty, e.currentTarget);
    if (added) closeQuickView();
  });
}
