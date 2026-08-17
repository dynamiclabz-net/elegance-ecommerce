// ─────────────────────────────────────────────
// admin-products.html — product listing + filters
// ─────────────────────────────────────────────
let _prodCfg = null;
let _prodState = { page: 1, pageSize: 20, totalCount: 0 };

function AdminProductsInit(config) {
  _prodCfg = config;

  document.getElementById("filter-search").addEventListener("input", debounceReload);
  document.getElementById("filter-category").addEventListener("change", () => reloadProducts(1));
  document.getElementById("filter-status").addEventListener("change", () => reloadProducts(1));
  document.getElementById("filter-clear-btn").addEventListener("click", clearFilters);
  document.getElementById("prev-page-btn").addEventListener("click", () => reloadProducts(_prodState.page - 1));
  document.getElementById("next-page-btn").addEventListener("click", () => reloadProducts(_prodState.page + 1));

  loadCategoryFilterOptions();
  reloadProducts(1);
}

let _debounceTimer = null;
function debounceReload() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => reloadProducts(1), 350);
}

function clearFilters() {
  document.getElementById("filter-search").value = "";
  document.getElementById("filter-category").value = "";
  document.getElementById("filter-status").value = "";
  reloadProducts(1);
}

async function loadCategoryFilterOptions() {
  const [success, result] = await callApi("GET", _prodCfg.categoryApiUrl, null, _prodCfg.csrfToken);
  if (!success || !result.success) return;
  const select = document.getElementById("filter-category");
  (result.data.categories || []).forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });
}

async function reloadProducts(page) {
  _prodState.page = Math.max(1, page);

  const params = {
    page: _prodState.page,
    page_size: _prodState.pageSize,
    active_only: "false", // admin sees active + inactive products
  };

  const search = document.getElementById("filter-search").value.trim();
  if (search) params.search = search;

  const category = document.getElementById("filter-category").value;
  if (category) params.category = category;

  const statusVal = document.getElementById("filter-status").value;
  if (statusVal) params.is_active = statusVal;

  const url = `${_prodCfg.productApiUrl}?${toQueryString(params)}`;
  const tbody = document.getElementById("products-body");
  tbody.innerHTML = eSkeletonRow(8) + eSkeletonRow(8) + eSkeletonRow(8);

  const [success, result] = await callApi("GET", url, null, _prodCfg.csrfToken);

  if (!success || !result.success) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="e-empty"><p>Could not load products.</p></div></td></tr>`;
    return;
  }

  const { products, total_count } = result.data;
  _prodState.totalCount = total_count;
  renderProducts(products);
  renderPaginationInfo();
}

function renderProducts(products) {
  const tbody = document.getElementById("products-body");
  document.getElementById("products-count").textContent = `${_prodState.totalCount} product${_prodState.totalCount === 1 ? "" : "s"}`;

  if (!products || products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="e-empty"><i class="bi bi-bag d-block"></i><p>No products found.</p><a href="${_prodCfg.newProductUrl}" class="btn-e-primary">Add your first product</a></div></td></tr>`;
    return;
  }

  tbody.innerHTML = products.map((p) => {
    const editUrl = _prodCfg.productFormUrlTemplate.replace("/0/", `/${p.id}/`);
    const priceHtml = p.discount_price
      ? `<span class="text-decoration-line-through text-muted me-1">${eFormatCurrency(p.price)}</span>${eFormatCurrency(p.effective_price)}`
      : eFormatCurrency(p.price);

    return `
      <tr>
        <td>${p.primary_image_url ? `<img class="e-thumb" src="${p.primary_image_url}" alt="${eEscapeHtml(p.name)}">` : `<div class="e-thumb"></div>`}</td>
        <td>
          <a href="${editUrl}" class="text-decoration-none" style="color:var(--e-text);font-weight:600;">${eEscapeHtml(p.name)}</a>
          ${p.is_featured ? '<span class="e-badge info ms-2">Featured</span>' : ""}
        </td>
        <td class="text-muted">${eEscapeHtml(p.sku)}</td>
        <td>${eEscapeHtml(p.category_name || "—")}</td>
        <td>${priceHtml}</td>
        <td>${p.in_stock ? p.stock_quantity : '<span class="e-badge danger">Out of stock</span>'}</td>
        <td>${p.is_active ? '<span class="e-badge success">Active</span>' : '<span class="e-badge muted">Inactive</span>'}</td>
        <td class="text-end">
          <a class="btn-e-icon" href="${editUrl}" title="Edit"><i class="bi bi-pencil"></i></a>
          <button class="btn-e-icon" onclick="deleteProduct(${p.id})" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderPaginationInfo() {
  const { page, pageSize, totalCount } = _prodState;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  document.getElementById("pagination-info").textContent =
    totalCount === 0 ? "" : `Showing ${start}–${end} of ${totalCount}`;
  document.getElementById("prev-page-btn").disabled = page <= 1;
  document.getElementById("next-page-btn").disabled = end >= totalCount;
}

async function deleteProduct(id) {
  if (!eConfirmAction("Delete this product? This cannot be undone.")) return;
  const detailUrl = `${_prodCfg.productApiUrl}${id}/`;
  const [success, result] = await callApi("DELETE", detailUrl, null, _prodCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete product."), "danger");
    return;
  }
  eToast("Product deleted.", "success");
  reloadProducts(_prodState.page);
}
