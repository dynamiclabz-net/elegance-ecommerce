// ─────────────────────────────────────────────
// admin-product-form.html — create / edit product, images, variants
// ─────────────────────────────────────────────
let _pfCfg = null;
let _pfProductId = null;
let _pfAttributesCache = [];
let _pfSelectedAttrValueIds = new Set();

function AdminProductFormInit(config) {
  _pfCfg = config;
  _pfProductId = config.productId || null;

  document.getElementById("product-basic-form").addEventListener("submit", handleProductSave);
  document.getElementById("pf-category").addEventListener("change", handleCategoryChange);
  document.getElementById("pf-image-input").addEventListener("change", handleImageUpload);
  document.getElementById("variant-form").addEventListener("submit", handleVariantSave);
  document.getElementById("add-attribute-btn").addEventListener("click", handleAddAttribute);

  loadCategories();
  loadProductTypes();
  loadAttributes();

  if (_pfProductId) {
    unlockSubPanels();
    loadExistingProduct();
  } else {
    lockSubPanels();
  }
}

function unlockSubPanels() {
  document.getElementById("images-locked-note").style.display = "none";
  document.getElementById("images-panel").style.display = "block";
  document.getElementById("variants-locked-note").style.display = "none";
  document.getElementById("variants-panel").style.display = "block";
}

function lockSubPanels() {
  document.getElementById("images-locked-note").style.display = "block";
  document.getElementById("images-panel").style.display = "none";
  document.getElementById("variants-locked-note").style.display = "block";
  document.getElementById("variants-panel").style.display = "none";
}

/* ───────────── Reference data ───────────── */

let _pfCategories = [];

async function loadCategories() {
  const [success, result] = await callApi("GET", _pfCfg.categoryApiUrl, null, _pfCfg.csrfToken);
  if (!success || !result.success) return;
  _pfCategories = result.data.categories || [];
  const select = document.getElementById("pf-category");
  select.innerHTML = `<option value="">Select category</option>` +
    _pfCategories.map((c) => `<option value="${c.id}">${eEscapeHtml(c.name)}</option>`).join("");
}

async function handleCategoryChange() {
  const categoryId = document.getElementById("pf-category").value;
  const subSelect = document.getElementById("pf-subcategory");
  subSelect.innerHTML = `<option value="">None</option>`;
  if (!categoryId) return;

  const [success, result] = await callApi(
    "GET", `${_pfCfg.subcategoryApiUrl}?category=${categoryId}`, null, _pfCfg.csrfToken
  );
  if (!success || !result.success) return;
  (result.data.subcategories || []).forEach((sub) => {
    const opt = document.createElement("option");
    opt.value = sub.id;
    opt.textContent = sub.name;
    subSelect.appendChild(opt);
  });
}

async function loadProductTypes() {
  const [success, result] = await callApi("GET", _pfCfg.productTypeApiUrl, null, _pfCfg.csrfToken);
  if (!success || !result.success) return;
  const select = document.getElementById("pf-product-type");
  select.innerHTML = `<option value="">None</option>` +
    (result.data.product_types || []).map((pt) => `<option value="${pt.id}">${eEscapeHtml(pt.name)}</option>`).join("");
}

/* ───────────── Load existing product (edit mode) ───────────── */

async function loadExistingProduct() {
  const url = buildDetailUrlPF(_pfCfg.productApiUrl, _pfProductId);
  const [success, result] = await callApi("GET", url, null, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not load product."), "danger");
    return;
  }

  const p = result.data.product;
  document.getElementById("pf-name").value = p.name;
  document.getElementById("pf-sku").value = p.sku;
  document.getElementById("pf-fabric").value = p.fabric || "";
  document.getElementById("pf-stock").value = p.stock_quantity;
  document.getElementById("pf-price").value = p.price;
  document.getElementById("pf-discount-price").value = p.discount_price || "";
  document.getElementById("pf-short-description").value = p.short_description || "";
  document.getElementById("pf-description").value = p.description || "";
  document.getElementById("pf-is-active").checked = p.is_active;
  document.getElementById("pf-is-featured").checked = p.is_featured;

  document.getElementById("pf-category").value = p.category;
  await handleCategoryChange();
  if (p.subcategory) document.getElementById("pf-subcategory").value = p.subcategory;
  if (p.product_type) document.getElementById("pf-product-type").value = p.product_type;

  renderImages(p.images || []);
  renderVariants(p.variants || []);
}

/* ───────────── Save basic product info ───────────── */

async function handleProductSave(e) {
  e.preventDefault();

  const payload = {
    name: document.getElementById("pf-name").value.trim(),
    sku: document.getElementById("pf-sku").value.trim(),
    category: document.getElementById("pf-category").value,
    subcategory: document.getElementById("pf-subcategory").value || null,
    product_type: document.getElementById("pf-product-type").value || null,
    fabric: document.getElementById("pf-fabric").value.trim(),
    stock_quantity: Number(document.getElementById("pf-stock").value || 0),
    price: document.getElementById("pf-price").value,
    discount_price: document.getElementById("pf-discount-price").value || null,
    short_description: document.getElementById("pf-short-description").value.trim(),
    description: document.getElementById("pf-description").value.trim(),
    is_active: document.getElementById("pf-is-active").checked,
    is_featured: document.getElementById("pf-is-featured").checked,
  };

  if (!payload.category) {
    eToast("Please select a category.", "danger");
    return;
  }

  const btn = document.getElementById("pf-save-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  let success, result;
  if (_pfProductId) {
    [success, result] = await callApi(
      "PUT", buildDetailUrlPF(_pfCfg.productApiUrl, _pfProductId), payload, _pfCfg.csrfToken
    );
  } else {
    [success, result] = await callApi("POST", _pfCfg.productApiUrl, payload, _pfCfg.csrfToken);
  }

  btn.disabled = false;
  btn.textContent = "Save Product";

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save product."), "danger");
    return;
  }

  eToast("Product saved.", "success");

  if (!_pfProductId) {
    _pfProductId = result.data.product.id;
    const newUrl = _pfCfg.editUrlTemplate.replace("/0/", `/${_pfProductId}/`);
    window.history.replaceState({}, "", newUrl);
    unlockSubPanels();
  }
}

/* ───────────── Images ───────────── */

function renderImages(images) {
  const grid = document.getElementById("images-grid");
  if (!images.length) {
    grid.innerHTML = `<div class="col-12"><div class="e-empty py-3"><p>No images uploaded yet.</p></div></div>`;
    return;
  }

  grid.innerHTML = images.map((img) => `
    <div class="col-6">
      <div style="position:relative;border:1px solid var(--e-border);border-radius:8px;overflow:hidden;">
        <img src="${img.image}" style="width:100%;height:90px;object-fit:cover;display:block;">
        ${img.is_primary ? '<span class="e-badge success" style="position:absolute;top:4px;left:4px;">Primary</span>' : ""}
        <div style="display:flex;gap:4px;padding:4px;">
          ${!img.is_primary ? `<button type="button" class="btn-e-outline flex-fill" style="font-size:11px;padding:2px 4px;" onclick="setPrimaryImage(${img.id})">Set primary</button>` : ""}
          <button type="button" class="btn-e-icon" onclick="deleteImage(${img.id})"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    </div>
  `).join("");
}

async function handleImageUpload(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length || !_pfProductId) return;

  for (const file of files) {
    const formData = new FormData();
    formData.append("product", _pfProductId);
    formData.append("image", file);
    const [success, result] = await callApi("POST", _pfCfg.productImageApiUrl, formData, _pfCfg.csrfToken, true);
    if (!success || !result.success) {
      eToast(eExtractError(result, `Could not upload ${file.name}.`), "danger");
    }
  }

  e.target.value = "";
  refreshImages();
}

async function refreshImages() {
  const url = buildDetailUrlPF(_pfCfg.productApiUrl, _pfProductId);
  const [success, result] = await callApi("GET", url, null, _pfCfg.csrfToken);
  if (success && result.success) renderImages(result.data.product.images || []);
}

async function setPrimaryImage(imageId) {
  const url = buildDetailUrlPF(_pfCfg.productImageApiUrl, imageId);
  const [success, result] = await callApi("PUT", url, { is_primary: true }, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not set primary image."), "danger");
    return;
  }
  refreshImages();
}

async function deleteImage(imageId) {
  if (!eConfirmAction("Delete this image?")) return;
  const url = buildDetailUrlPF(_pfCfg.productImageApiUrl, imageId);
  const [success, result] = await callApi("DELETE", url, null, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete image."), "danger");
    return;
  }
  refreshImages();
}

/* ───────────── Variants ───────────── */

function renderVariants(variants) {
  const list = document.getElementById("variants-list");
  if (!variants.length) {
    list.innerHTML = `<div class="e-empty py-3"><p>No variants yet.</p></div>`;
    return;
  }

  list.innerHTML = variants.map((v) => `
    <div class="d-flex justify-content-between align-items-center border rounded p-2" style="border-color:var(--e-border) !important;">
      <div>
        <div style="font-size:13px;font-weight:600;">${eEscapeHtml(v.variant_label || v.sku)}</div>
        <div style="font-size:11.5px;color:var(--e-text-muted);">SKU: ${eEscapeHtml(v.sku)} · Stock: ${v.stock_quantity} · ${eFormatCurrency(v.effective_price)}</div>
      </div>
      <button type="button" class="btn-e-icon" onclick="deleteVariant(${v.id})"><i class="bi bi-trash"></i></button>
    </div>
  `).join("");
}

async function refreshVariants() {
  const url = buildDetailUrlPF(_pfCfg.productApiUrl, _pfProductId);
  const [success, result] = await callApi("GET", url, null, _pfCfg.csrfToken);
  if (success && result.success) renderVariants(result.data.product.variants || []);
}

async function loadAttributes() {
  const [success, result] = await callApi("GET", _pfCfg.attributeApiUrl, null, _pfCfg.csrfToken);
  if (!success || !result.success) return;
  _pfAttributesCache = result.data.attributes || [];
  renderAttributeArea();
}

function renderAttributeArea() {
  const area = document.getElementById("variant-attributes-area");
  if (!_pfAttributesCache.length) {
    area.innerHTML = `<p class="text-muted" style="font-size:12.5px;">No attributes yet — add one below (e.g. Color, Size).</p>`;
    return;
  }

  area.innerHTML = _pfAttributesCache.map((attr) => `
    <div class="e-field">
      <label class="e-label">${eEscapeHtml(attr.name)}</label>
      <div class="d-flex flex-wrap gap-2">
        ${(attr.values || []).map((val) => `
          <label style="display:flex;align-items:center;gap:4px;font-size:12.5px;border:1px solid var(--e-border);border-radius:6px;padding:4px 8px;cursor:pointer;">
            <input type="checkbox" value="${val.id}" data-attr-value onchange="toggleAttrValue(${val.id}, this.checked)">
            ${eEscapeHtml(val.value)}
          </label>
        `).join("")}
        <button type="button" class="btn-e-outline" style="font-size:11.5px;padding:3px 8px;" onclick="quickAddAttributeValue(${attr.id})">+ value</button>
      </div>
    </div>
  `).join("");
}

function toggleAttrValue(valueId, checked) {
  if (checked) _pfSelectedAttrValueIds.add(valueId);
  else _pfSelectedAttrValueIds.delete(valueId);
}

async function handleAddAttribute() {
  const input = document.getElementById("new-attribute-name");
  const name = input.value.trim();
  if (!name) return;

  const [success, result] = await callApi("POST", _pfCfg.attributeApiUrl, { name }, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not add attribute."), "danger");
    return;
  }
  input.value = "";
  eToast("Attribute added.", "success");
  await loadAttributes();
}

async function quickAddAttributeValue(attributeId) {
  const value = window.prompt("New value (e.g. Red, XL):");
  if (!value) return;

  const [success, result] = await callApi(
    "POST", _pfCfg.attributeValueApiUrl, { attribute: attributeId, value }, _pfCfg.csrfToken
  );
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not add value."), "danger");
    return;
  }
  await loadAttributes();
}

function openVariantModal() {
  document.getElementById("variant-form").reset();
  _pfSelectedAttrValueIds = new Set();
  document.querySelectorAll("[data-attr-value]").forEach((cb) => (cb.checked = false));
}

async function handleVariantSave(e) {
  e.preventDefault();

  if (!_pfProductId) {
    eToast("Save the product first.", "danger");
    return;
  }

  const payload = {
    product: _pfProductId,
    sku: document.getElementById("variant-sku").value.trim(),
    price_override: document.getElementById("variant-price-override").value || null,
    stock_quantity: Number(document.getElementById("variant-stock").value || 0),
    attribute_values: Array.from(_pfSelectedAttrValueIds),
  };

  const btn = document.getElementById("variant-save-btn");
  btn.disabled = true;

  const [success, result] = await callApi("POST", _pfCfg.productVariantApiUrl, payload, _pfCfg.csrfToken);

  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save variant."), "danger");
    return;
  }

  eToast("Variant added.", "success");
  bootstrap.Modal.getInstance(document.getElementById("variant-modal"))?.hide();
  refreshVariants();
}

async function deleteVariant(variantId) {
  if (!eConfirmAction("Delete this variant?")) return;
  const url = buildDetailUrlPF(_pfCfg.productVariantApiUrl, variantId);
  const [success, result] = await callApi("DELETE", url, null, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete variant."), "danger");
    return;
  }
  refreshVariants();
}

/* ───────────── Shared helper ───────────── */
function buildDetailUrlPF(listUrl, id) {
  return listUrl.endsWith("/") ? `${listUrl}${id}/` : `${listUrl}/${id}/`;
}
