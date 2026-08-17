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
    return;
  }

  const { products, total_count } = result.data;
  document.getElementById("resultCount").textContent =
    `${total_count} Product${total_count === 1 ? "" : "s"}`;

  if (!products.length) {
    grid.innerHTML = '<div class="empty-shop-state"><i class="fas fa-search"></i><p>No products match your filters.</p></div>';
    renderPagination(0);
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
      <a href="${url}" class="sp-img-wrap">
        <img src="${p.primary_image_url || "/static/images/placeholder-product.png"}" alt="${eEscapeHtml(p.name)}" loading="lazy" />
        <div class="sp-badges">
          ${p.is_featured ? '<span class="sp-badge sp-badge-new">Featured</span>' : ""}
          ${!p.in_stock ? '<span class="sp-badge sp-badge-hot">Out of Stock</span>' : ""}
        </div>
        <div class="sp-hover-actions">
          <button class="sp-add-cart" data-id="${p.id}" ${!p.in_stock ? "disabled" : ""}>
            <i class="fas fa-shopping-bag"></i> ${p.in_stock ? "Add to Cart" : "Sold Out"}
          </button>
        </div>
      </a>
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
      const productId = btn.dataset.id;
      btn.disabled = true;
      const [success, result] = await callApi(
        "POST", shopConfig.cartApiUrl, { product: productId, quantity: 1 }, shopConfig.csrfToken
      );
      btn.disabled = false;
      if (success && result.success) {
        eRefreshCartBadge(shopConfig.cartApiUrl);
        eToast("Added to cart", "success");
      } else {
        eToast(eExtractError(result, "Could not add to cart."), "error");
      }
    });
  });
}

function renderPagination(totalCount) {
  const wrap = document.getElementById("paginationWrap");
  const totalPages = Math.ceil(totalCount / shopState.pageSize);
  if (totalPages <= 1) {
    wrap.innerHTML = "";
    return;
  }
  let html = "";
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === shopState.page ? "page-btn-active" : ""}" data-page="${i}">${i}</button>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll(".page-btn").forEach((btn) => {
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

  function commitPriceRange() {
    let min = parseInt(minSlider.value, 10);
    let max = parseInt(maxSlider.value, 10);
    if (min > max) [min, max] = [max, min];
    shopState.minPrice = min;
    shopState.maxPrice = max;
    minLabel.textContent = eFormatCurrency(min);
    maxLabel.textContent = eFormatCurrency(max);
    shopState.page = 1;
    loadProducts();
  }
  minSlider.addEventListener("change", commitPriceRange);
  maxSlider.addEventListener("change", commitPriceRange);

  document.getElementById("inStockFilter").addEventListener("change", (e) => {
    shopState.inStock = e.target.checked;
    shopState.page = 1;
    loadProducts();
  });
  document.getElementById("featuredFilter").addEventListener("change", (e) => {
    shopState.featured = e.target.checked;
    shopState.page = 1;
    loadProducts();
  });

  document.getElementById("clearAllBtn").addEventListener("click", () => {
    shopState = { ...shopState, category: "", subcategory: "", productType: "", minPrice: 0, maxPrice: 25000, inStock: false, featured: false, sort: "", page: 1 };
    minSlider.value = 0;
    maxSlider.value = 25000;
    minLabel.textContent = eFormatCurrency(0);
    maxLabel.textContent = eFormatCurrency(25000);
    document.getElementById("inStockFilter").checked = false;
    document.getElementById("featuredFilter").checked = false;
    document.getElementById("sortSelect").value = "";
    document.querySelectorAll('.cat-tab').forEach((t) => t.classList.remove("cat-tab-active"));
    document.querySelector('.cat-tab[data-category=""]').classList.add("cat-tab-active");
    document.getElementById("subcategoryFilterBody").innerHTML =
      '<p class="filter-count" style="margin:0;">Select a category above</p>';
    document.querySelectorAll('input[data-type="product_type"]').forEach((i) => (i.checked = false));
    loadProducts();
  });
}

function bindMobileSidebarToggle() {
  const sidebar = document.getElementById("shopSidebar");
  document.getElementById("filterToggleBtn").addEventListener("click", () => sidebar.classList.add("shop-sidebar-open"));
  document.getElementById("sidebarClose").addEventListener("click", () => sidebar.classList.remove("shop-sidebar-open"));
}
