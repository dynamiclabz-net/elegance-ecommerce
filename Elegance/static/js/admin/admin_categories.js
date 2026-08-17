// ─────────────────────────────────────────────
// admin-categories.html — Category / SubCategory / ProductType CRUD
// ─────────────────────────────────────────────
let _catCfg = null;
let _categoriesCache = [];

function AdminCategoriesInit(config) {
  _catCfg = config;

  document.querySelectorAll(".e-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("category-form").addEventListener("submit", handleCategorySubmit);
  document.getElementById("subcategory-form").addEventListener("submit", handleSubCategorySubmit);
  document.getElementById("product-type-form").addEventListener("submit", handleProductTypeSubmit);

  loadCategories();
  loadSubCategories();
  loadProductTypes();
}

function switchTab(tab) {
  document.querySelectorAll(".e-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".e-tab-panel").forEach((p) => p.classList.add("d-none"));
  document.getElementById(`tab-${tab}`).classList.remove("d-none");
}

/* ───────────── Categories ───────────── */

async function loadCategories() {
  const [success, result] = await callApi("GET", _catCfg.categoryApiUrl, null, _catCfg.csrfToken);
  const tbody = document.getElementById("categories-body");

  if (!success || !result.success) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="e-empty"><p>Could not load categories.</p></div></td></tr>`;
    return;
  }

  _categoriesCache = result.data.categories || [];
  populateCategorySelect();

  if (_categoriesCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="e-empty"><i class="bi bi-diagram-3 d-block"></i><p>No categories yet. Create your first one.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = _categoriesCache.map((cat) => `
    <tr>
      <td>${cat.image ? `<img class="e-thumb" src="${cat.image}" alt="${eEscapeHtml(cat.name)}">` : `<div class="e-thumb"></div>`}</td>
      <td><strong>${eEscapeHtml(cat.name)}</strong></td>
      <td class="text-muted">${eEscapeHtml(cat.slug)}</td>
      <td>${(cat.subcategories || []).length}</td>
      <td>${cat.is_active ? '<span class="e-badge success">Active</span>' : '<span class="e-badge muted">Inactive</span>'}</td>
      <td class="text-end">
        <button class="btn-e-icon" onclick='editCategory(${cat.id})' title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn-e-icon" onclick="deleteCategory(${cat.id})" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join("");
}

function populateCategorySelect() {
  const select = document.getElementById("subcategory-category");
  select.innerHTML = _categoriesCache.map((c) => `<option value="${c.id}">${eEscapeHtml(c.name)}</option>`).join("");
}

function openCategoryModal() {
  document.getElementById("category-modal-title").textContent = "New Category";
  document.getElementById("category-form").reset();
  document.getElementById("category-id").value = "";
  document.getElementById("category-is-active").checked = true;
}

function editCategory(id) {
  const cat = _categoriesCache.find((c) => c.id === id);
  if (!cat) return;
  document.getElementById("category-modal-title").textContent = "Edit Category";
  document.getElementById("category-id").value = cat.id;
  document.getElementById("category-name").value = cat.name;
  document.getElementById("category-description").value = cat.description || "";
  document.getElementById("category-is-active").checked = cat.is_active;
  new bootstrap.Modal(document.getElementById("category-modal")).show();
}

async function handleCategorySubmit(e) {
  e.preventDefault();
  const id = document.getElementById("category-id").value;
  const btn = document.getElementById("category-save-btn");
  btn.disabled = true;

  const formData = new FormData();
  formData.append("name", document.getElementById("category-name").value.trim());
  formData.append("description", document.getElementById("category-description").value.trim());
  formData.append("is_active", document.getElementById("category-is-active").checked);
  const imageFile = document.getElementById("category-image").files[0];
  if (imageFile) formData.append("image", imageFile);

  const url = id ? buildDetailUrl(_catCfg.categoryApiUrl, id) : _catCfg.categoryApiUrl;
  const [success, result] = await callApi(id ? "PUT" : "POST", url, formData, _catCfg.csrfToken, true);

  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save category."), "danger");
    return;
  }

  eToast(id ? "Category updated." : "Category created.", "success");
  bootstrap.Modal.getInstance(document.getElementById("category-modal"))?.hide();
  loadCategories();
}

async function deleteCategory(id) {
  if (!eConfirmAction("Delete this category? Sub-categories and products under it will be affected.")) return;
  const [success, result] = await callApi("DELETE", buildDetailUrl(_catCfg.categoryApiUrl, id), null, _catCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete category."), "danger");
    return;
  }
  eToast("Category deleted.", "success");
  loadCategories();
}

/* ───────────── Sub-Categories ───────────── */

let _subcategoriesCache = [];

async function loadSubCategories() {
  const [success, result] = await callApi("GET", _catCfg.subcategoryApiUrl, null, _catCfg.csrfToken);
  const tbody = document.getElementById("subcategories-body");

  if (!success || !result.success) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="e-empty"><p>Could not load sub-categories.</p></div></td></tr>`;
    return;
  }

  _subcategoriesCache = result.data.subcategories || [];

  if (_subcategoriesCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="e-empty"><i class="bi bi-diagram-3 d-block"></i><p>No sub-categories yet.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = _subcategoriesCache.map((sub) => `
    <tr>
      <td><strong>${eEscapeHtml(sub.name)}</strong></td>
      <td>${eEscapeHtml(sub.category_name || "—")}</td>
      <td class="text-muted">${eEscapeHtml(sub.slug)}</td>
      <td>${sub.is_active ? '<span class="e-badge success">Active</span>' : '<span class="e-badge muted">Inactive</span>'}</td>
      <td class="text-end">
        <button class="btn-e-icon" onclick='editSubCategory(${sub.id})' title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn-e-icon" onclick="deleteSubCategory(${sub.id})" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join("");
}

function openSubCategoryModal() {
  document.getElementById("subcategory-modal-title").textContent = "New Sub-Category";
  document.getElementById("subcategory-form").reset();
  document.getElementById("subcategory-id").value = "";
  document.getElementById("subcategory-is-active").checked = true;
}

function editSubCategory(id) {
  const sub = _subcategoriesCache.find((s) => s.id === id);
  if (!sub) return;
  document.getElementById("subcategory-modal-title").textContent = "Edit Sub-Category";
  document.getElementById("subcategory-id").value = sub.id;
  document.getElementById("subcategory-category").value = sub.category;
  document.getElementById("subcategory-name").value = sub.name;
  document.getElementById("subcategory-is-active").checked = sub.is_active;
  new bootstrap.Modal(document.getElementById("subcategory-modal")).show();
}

async function handleSubCategorySubmit(e) {
  e.preventDefault();
  const id = document.getElementById("subcategory-id").value;
  const btn = document.getElementById("subcategory-save-btn");
  btn.disabled = true;

  const formData = new FormData();
  formData.append("category", document.getElementById("subcategory-category").value);
  formData.append("name", document.getElementById("subcategory-name").value.trim());
  formData.append("is_active", document.getElementById("subcategory-is-active").checked);
  const imageFile = document.getElementById("subcategory-image").files[0];
  if (imageFile) formData.append("image", imageFile);

  const url = id ? buildDetailUrl(_catCfg.subcategoryApiUrl, id) : _catCfg.subcategoryApiUrl;
  const [success, result] = await callApi(id ? "PUT" : "POST", url, formData, _catCfg.csrfToken, true);

  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save sub-category."), "danger");
    return;
  }

  eToast(id ? "Sub-category updated." : "Sub-category created.", "success");
  bootstrap.Modal.getInstance(document.getElementById("subcategory-modal"))?.hide();
  loadSubCategories();
  loadCategories();
}

async function deleteSubCategory(id) {
  if (!eConfirmAction("Delete this sub-category?")) return;
  const [success, result] = await callApi("DELETE", buildDetailUrl(_catCfg.subcategoryApiUrl, id), null, _catCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete sub-category."), "danger");
    return;
  }
  eToast("Sub-category deleted.", "success");
  loadSubCategories();
}

/* ───────────── Product Types ───────────── */

let _productTypesCache = [];

async function loadProductTypes() {
  const [success, result] = await callApi("GET", _catCfg.productTypeApiUrl, null, _catCfg.csrfToken);
  const tbody = document.getElementById("product-types-body");

  if (!success || !result.success) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="e-empty"><p>Could not load product types.</p></div></td></tr>`;
    return;
  }

  _productTypesCache = result.data.product_types || [];

  if (_productTypesCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="e-empty"><i class="bi bi-tags d-block"></i><p>No product types yet.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = _productTypesCache.map((pt) => `
    <tr>
      <td><strong>${eEscapeHtml(pt.name)}</strong></td>
      <td class="text-muted">${eEscapeHtml(pt.slug)}</td>
      <td>${pt.is_active ? '<span class="e-badge success">Active</span>' : '<span class="e-badge muted">Inactive</span>'}</td>
      <td class="text-end">
        <button class="btn-e-icon" onclick='editProductType(${pt.id})' title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn-e-icon" onclick="deleteProductType(${pt.id})" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join("");
}

function openProductTypeModal() {
  document.getElementById("product-type-modal-title").textContent = "New Product Type";
  document.getElementById("product-type-form").reset();
  document.getElementById("product-type-id").value = "";
  document.getElementById("product-type-is-active").checked = true;
}

function editProductType(id) {
  const pt = _productTypesCache.find((p) => p.id === id);
  if (!pt) return;
  document.getElementById("product-type-modal-title").textContent = "Edit Product Type";
  document.getElementById("product-type-id").value = pt.id;
  document.getElementById("product-type-name").value = pt.name;
  document.getElementById("product-type-description").value = pt.description || "";
  document.getElementById("product-type-is-active").checked = pt.is_active;
  new bootstrap.Modal(document.getElementById("product-type-modal")).show();
}

async function handleProductTypeSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("product-type-id").value;
  const btn = document.getElementById("product-type-save-btn");
  btn.disabled = true;

  const payload = {
    name: document.getElementById("product-type-name").value.trim(),
    description: document.getElementById("product-type-description").value.trim(),
    is_active: document.getElementById("product-type-is-active").checked,
  };

  const url = id ? buildDetailUrl(_catCfg.productTypeApiUrl, id) : _catCfg.productTypeApiUrl;
  const [success, result] = await callApi(id ? "PUT" : "POST", url, payload, _catCfg.csrfToken);

  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save product type."), "danger");
    return;
  }

  eToast(id ? "Product type updated." : "Product type created.", "success");
  bootstrap.Modal.getInstance(document.getElementById("product-type-modal"))?.hide();
  loadProductTypes();
}

async function deleteProductType(id) {
  if (!eConfirmAction("Delete this product type?")) return;
  const [success, result] = await callApi("DELETE", buildDetailUrl(_catCfg.productTypeApiUrl, id), null, _catCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete product type."), "danger");
    return;
  }
  eToast("Product type deleted.", "success");
  loadProductTypes();
}

/* ───────────── Shared helper ───────────── */
// DRF list URLs end with a trailing slash, e.g. ".../category-api/" -> detail is ".../category-api/{id}/"
function buildDetailUrl(listUrl, id) {
  return listUrl.endsWith("/") ? `${listUrl}${id}/` : `${listUrl}/${id}/`;
}
