// ─────────────────────────────────────────────
// admin-product-form.html — create / edit product, images, variants
// ─────────────────────────────────────────────
let _pfCfg = null;
let _pfProductId = null;
let _pfAttributesCache = [];
let _pfSelectedAttrValueIds = new Set();
let _pfActiveAttributeIds = new Set();
let _pfVariantsCache = [];
let _pfEditingVariantId = null;

function AdminProductFormInit(config) {
  _pfCfg = config;
  _pfProductId = config.productId || null;

  document.getElementById("product-basic-form").addEventListener("submit", handleProductSave);
  document.getElementById("pf-category").addEventListener("change", handleCategoryChange);
  document.getElementById("pf-image-input").addEventListener("change", handleImageUpload);
  document.getElementById("variant-form").addEventListener("submit", handleVariantSave);
  document.getElementById("variant-type-select").addEventListener("change", handleVariantTypeSelect);
  document.getElementById("variant-type-new-btn").addEventListener("click", toggleNewTypeForm);
  document.getElementById("variant-new-type-form").addEventListener("submit", handleCreateNewType);
  document.getElementById("variant-add-open-btn").addEventListener("click", () => openVariantModal());
  document.getElementById("spec-add-form").addEventListener("submit", handleSpecAdd);
  document.getElementById("care-add-form").addEventListener("submit", handleCareAdd);
  document.getElementById("care-icon").addEventListener("change", applyCareIconDefaults);

  populateCareIconOptions();

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
  document.getElementById("specs-locked-note").style.display = "none";
  document.getElementById("specs-panel").style.display = "block";
  document.getElementById("care-locked-note").style.display = "none";
  document.getElementById("care-panel").style.display = "block";
}

function lockSubPanels() {
  document.getElementById("images-locked-note").style.display = "block";
  document.getElementById("images-panel").style.display = "none";
  document.getElementById("variants-locked-note").style.display = "block";
  document.getElementById("variants-panel").style.display = "none";
  document.getElementById("specs-locked-note").style.display = "block";
  document.getElementById("specs-panel").style.display = "none";
  document.getElementById("care-locked-note").style.display = "block";
  document.getElementById("care-panel").style.display = "none";
}

/* ───────────── Care icon options (mirrors ProductCareInstruction.ICON_CHOICES) ───────────── */

const PF_CARE_ICON_CHOICES = [
  ["hand-wash", "Hand Wash Only"],
  ["machine-wash", "Machine Washable"],
  ["no-bleach", "Do Not Bleach"],
  ["dry-shade", "Dry in Shade"],
  ["dry-sun", "Dry in Sun"],
  ["low-iron", "Low Iron"],
  ["no-iron", "Do Not Iron"],
  ["dry-clean", "Dry Clean"],
  ["no-dry-clean", "No Dry Clean"],
  ["store", "Store Carefully"],
  ["delicate", "Handle Delicately"],
  ["general", "General Care"],
];

// Default title/description shown for each icon — auto-filled into the
// form fields when the admin picks an icon, and editable afterwards.
const PF_CARE_ICON_DEFAULTS = {
  "hand-wash": {
    title: "Hand Wash Only",
    description: "Gently hand wash in cold water with mild detergent. Do not machine wash.",
  },
  "machine-wash": {
    title: "Machine Washable",
    description: "Machine wash in cold water on a gentle cycle with similar colours.",
  },
  "no-bleach": {
    title: "Do Not Bleach",
    description: "Avoid chlorine bleach or harsh chemicals that may damage embroidery threads.",
  },
  "dry-shade": {
    title: "Dry in Shade",
    description: "Lay flat to dry in a shaded area. Avoid direct sunlight to preserve colour.",
  },
  "dry-sun": {
    title: "Dry in Sun",
    description: "Dry in direct sunlight to help retain shape and freshness.",
  },
  "low-iron": {
    title: "Low Iron",
    description: "Iron on reverse at low heat. Use a pressing cloth over embroidered sections.",
  },
  "no-iron": {
    title: "Do Not Iron",
    description: "Avoid ironing directly on the fabric or embellishments.",
  },
  "dry-clean": {
    title: "Dry Clean",
    description: "Dry clean only for best results and longevity.",
  },
  "no-dry-clean": {
    title: "No Dry Clean",
    description: "We recommend against dry cleaning as solvents may affect the delicate finish.",
  },
  store: {
    title: "Store Carefully",
    description: "Store folded in a cotton bag. Avoid plastic packaging that traps moisture.",
  },
  delicate: {
    title: "Handle Delicately",
    description: "Handle with care to avoid snagging embroidery or delicate trims.",
  },
  general: {
    title: "General Care",
    description: "Follow standard garment care to keep this piece looking its best.",
  },
};

function populateCareIconOptions() {
  const select = document.getElementById("care-icon");
  select.innerHTML = PF_CARE_ICON_CHOICES.map(([val, label]) => `<option value="${val}">${eEscapeHtml(label)}</option>`).join("");
  applyCareIconDefaults();
}

function applyCareIconDefaults() {
  const icon = document.getElementById("care-icon").value;
  const defaults = PF_CARE_ICON_DEFAULTS[icon];
  if (!defaults) return;
  document.getElementById("care-title").value = defaults.title;
  document.getElementById("care-description").value = defaults.description;
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
  renderSpecs(p.specifications || []);
  renderCareInstructions(p.care_instructions || []);
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
    await autoCreateDefaultSpecs(_pfProductId, payload);
    refreshSpecs();
  }
}

/* ───────────── Auto-generated Product Details on create ─────────────
   When a product is first created, seed the "Product Details" tab with
   SKU / Category / Fabric / Type rows pulled straight from the basic
   info fields. Admins can edit or delete these rows afterwards. */
async function autoCreateDefaultSpecs(productId, payload) {
  const rows = [];

  if (payload.sku) rows.push({ key: "SKU", value: payload.sku });

  const categoryText = document.getElementById("pf-category").selectedOptions[0]?.textContent;
  if (payload.category && categoryText) rows.push({ key: "Category", value: categoryText });

  if (payload.fabric) rows.push({ key: "Fabric", value: payload.fabric });

  const typeText = document.getElementById("pf-product-type").selectedOptions[0]?.textContent;
  if (payload.product_type && typeText && typeText !== "None") rows.push({ key: "Type", value: typeText });

  for (const row of rows) {
    await callApi(
      "POST", _pfCfg.productSpecificationApiUrl,
      { product: productId, key: row.key, value: row.value }, _pfCfg.csrfToken
    );
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

/* ═══════════════════════════════════════════════════════════════
   VARIANTS — 2-step admin flow:
   1) pick Variation Types (which attributes this product varies by)
   2) add Values for those types (with hex swatches for color types),
      then create/edit Variants restricted to the chosen types.
═══════════════════════════════════════════════════════════════ */

/* ---------- Step 1: Variation Types ---------- */

async function loadAttributes() {
  const [success, result] = await callApi("GET", _pfCfg.attributeApiUrl, null, _pfCfg.csrfToken);
  if (!success || !result.success) return;
  _pfAttributesCache = result.data.attributes || [];
  renderVariantTypeChips();
  renderVariantValuesArea();
  renderVariantModalAttributeArea();
}

function renderVariantTypeChips() {
  const chipsEl = document.getElementById("variant-type-chips");
  const activeAttrs = _pfAttributesCache.filter((a) => _pfActiveAttributeIds.has(a.id));

  chipsEl.innerHTML = activeAttrs.length
    ? activeAttrs.map((attr) => `
        <span class="pf-type-chip">
          ${eEscapeHtml(attr.name)}${attr.is_color ? " 🎨" : ""}
          <button type="button" title="Remove type" onclick="removeVariantType(${attr.id})">&times;</button>
        </span>
      `).join("")
    : `<span class="text-muted" style="font-size:12.5px;">No variation types selected yet.</span>`;

  const select = document.getElementById("variant-type-select");
  const available = _pfAttributesCache.filter((a) => !_pfActiveAttributeIds.has(a.id));
  select.innerHTML = `<option value="">+ Add existing type…</option>` +
    available.map((a) => `<option value="${a.id}">${eEscapeHtml(a.name)}${a.is_color ? " (color)" : ""}</option>`).join("");
}

function handleVariantTypeSelect(e) {
  const id = Number(e.target.value);
  if (!id) return;
  addVariantType(id);
  e.target.value = "";
}

function addVariantType(attributeId) {
  _pfActiveAttributeIds.add(attributeId);
  renderVariantTypeChips();
  renderVariantValuesArea();
  renderVariantModalAttributeArea();
}

function removeVariantType(attributeId) {
  const usedByVariant = _pfVariantsCache.some((v) =>
    (v.attribute_values_detail || []).some((val) => val.attribute === attributeId)
  );
  if (usedByVariant && !eConfirmAction("Existing variants use this type. Remove it from this form anyway? (Variants themselves are unaffected — edit or delete them separately.)")) {
    return;
  }
  _pfActiveAttributeIds.delete(attributeId);
  renderVariantTypeChips();
  renderVariantValuesArea();
  renderVariantModalAttributeArea();
}

function toggleNewTypeForm() {
  const form = document.getElementById("variant-new-type-form");
  form.style.display = form.style.display === "none" ? "flex" : "none";
}

async function handleCreateNewType(e) {
  e.preventDefault();
  const nameInput = document.getElementById("new-type-name");
  const isColor = document.getElementById("new-type-is-color").checked;
  const name = nameInput.value.trim();
  if (!name) return;

  const [success, result] = await callApi(
    "POST", _pfCfg.attributeApiUrl, { name, is_color: isColor }, _pfCfg.csrfToken
  );
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not add variation type."), "danger");
    return;
  }

  nameInput.value = "";
  document.getElementById("new-type-is-color").checked = false;
  document.getElementById("variant-new-type-form").style.display = "none";
  eToast("Variation type added.", "success");

  await loadAttributes();
  addVariantType(result.data.attribute.id);
}

/* ---------- Step 2: Values per type (with color swatches) ---------- */

function renderVariantValuesArea() {
  const area = document.getElementById("variant-values-area");
  const activeAttrs = _pfAttributesCache.filter((a) => _pfActiveAttributeIds.has(a.id));

  if (!activeAttrs.length) {
    area.innerHTML = "";
    return;
  }

  area.innerHTML = activeAttrs.map((attr) => `
    <div class="pf-variant-step mb-2">
      <div class="pf-variant-step-title" style="margin-bottom:0.4rem;">
        <span class="pf-variant-step-num">•</span> ${eEscapeHtml(attr.name)} values
      </div>
      <div class="d-flex flex-wrap gap-2 mb-2">
        ${(attr.values || []).map((val) => renderValueTag(attr, val)).join("") ||
          `<span class="text-muted" style="font-size:12px;">No values yet — add one below.</span>`}
      </div>
      <div class="d-flex gap-2 align-items-center">
        <input type="text" class="e-input" style="flex:1;" id="value-name-${attr.id}"
          placeholder="${attr.is_color ? "Color name (e.g. Ivory)" : "Value (e.g. M, L, XL)"}">
        ${attr.is_color ? `<input type="color" class="e-input" style="width:48px;padding:2px;" id="value-hex-${attr.id}" value="#c9a15a">` : ""}
        <button type="button" class="btn-e-outline" style="white-space:nowrap;" onclick="handleAddAttributeValue(${attr.id})">+ Add</button>
      </div>
    </div>
  `).join("");
}

function renderValueTag(attr, val) {
  const swatch = attr.is_color && val.hex_code
    ? `<span class="pf-color-swatch" style="background:${eEscapeHtml(val.hex_code)};"></span>`
    : "";
  return `<span class="pf-value-tag">${swatch}${eEscapeHtml(val.value)}</span>`;
}

async function handleAddAttributeValue(attributeId) {
  const attr = _pfAttributesCache.find((a) => a.id === attributeId);
  const nameInput = document.getElementById(`value-name-${attributeId}`);
  const value = nameInput.value.trim();
  if (!value) return;

  const payload = { attribute: attributeId, value };
  if (attr?.is_color) {
    payload.hex_code = document.getElementById(`value-hex-${attributeId}`).value;
  }

  const [success, result] = await callApi("POST", _pfCfg.attributeValueApiUrl, payload, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not add value."), "danger");
    return;
  }

  eToast("Value added.", "success");
  await loadAttributes();
}

/* ---------- Step 3: Variants table (add / edit / delete) ---------- */

function renderVariants(variants) {
  _pfVariantsCache = variants;

  // Derive which attribute types are already in use so re-opening an
  // existing product shows its variation types pre-selected.
  variants.forEach((v) => {
    (v.attribute_values_detail || []).forEach((val) => _pfActiveAttributeIds.add(val.attribute));
  });
  renderVariantTypeChips();
  renderVariantValuesArea();
  renderVariantModalAttributeArea();

  const list = document.getElementById("variants-list");
  if (!variants.length) {
    list.innerHTML = `<div class="e-empty py-3"><p>No variants yet. Choose variation types above, then add a variant.</p></div>`;
    return;
  }

  list.innerHTML = variants.map((v) => {
    const swatches = (v.attribute_values_detail || [])
      .filter((val) => val.hex_code)
      .map((val) => `<span class="pf-color-swatch" style="background:${eEscapeHtml(val.hex_code)};" title="${eEscapeHtml(val.value)}"></span>`)
      .join("");
    return `
      <div class="pf-variant-row ${v.is_active ? "" : "pf-variant-row-inactive"}">
        <div class="d-flex align-items-center gap-2">
          ${swatches}
          <div>
            <div style="font-size:13px;font-weight:600;">${eEscapeHtml(v.variant_label || v.sku)}${v.is_active ? "" : " (inactive)"}</div>
            <div style="font-size:11.5px;color:var(--e-text-muted);">SKU: ${eEscapeHtml(v.sku)} · Stock: ${v.stock_quantity} · ${eFormatCurrency(v.effective_price)}</div>
          </div>
        </div>
        <div class="pf-variant-row-actions">
          <button type="button" class="btn-e-icon" title="Edit" onclick="openVariantModal(${v.id})"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn-e-icon" title="Delete" onclick="deleteVariant(${v.id})"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  }).join("");
}

async function refreshVariants() {
  const url = buildDetailUrlPF(_pfCfg.productApiUrl, _pfProductId);
  const [success, result] = await callApi("GET", url, null, _pfCfg.csrfToken);
  if (success && result.success) renderVariants(result.data.product.variants || []);
}

function renderVariantModalAttributeArea() {
  const area = document.getElementById("variant-attributes-area");
  const activeAttrs = _pfAttributesCache.filter((a) => _pfActiveAttributeIds.has(a.id));

  if (!activeAttrs.length) {
    area.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Select at least one Variation Type above before adding a variant.</p>`;
    return;
  }

  area.innerHTML = activeAttrs.map((attr) => `
    <div class="mb-2">
      <div style="font-size:12px;font-weight:600;color:var(--e-text-muted);margin-bottom:4px;">${eEscapeHtml(attr.name)}</div>
      <div class="d-flex flex-wrap gap-2">
        ${(attr.values || []).map((val) => `
          <label class="pf-variant-checkbox-tag">
            <input type="checkbox" value="${val.id}" data-attr-value onchange="toggleAttrValue(${val.id}, this.checked)">
            ${attr.is_color && val.hex_code ? `<span class="pf-color-swatch" style="background:${eEscapeHtml(val.hex_code)};"></span>` : ""}
            ${eEscapeHtml(val.value)}
          </label>
        `).join("") || `<span class="text-muted" style="font-size:12px;">No values yet — add one in Step 1 above.</span>`}
      </div>
    </div>
  `).join("");

  // Re-apply the current selection (used when re-rendering during edit).
  _pfSelectedAttrValueIds.forEach((id) => {
    const cb = area.querySelector(`[data-attr-value][value="${id}"]`);
    if (cb) cb.checked = true;
  });
}

function toggleAttrValue(valueId, checked) {
  if (checked) _pfSelectedAttrValueIds.add(valueId);
  else _pfSelectedAttrValueIds.delete(valueId);
}

function openVariantModal(variantId) {
  if (!_pfActiveAttributeIds.size) {
    eToast("Choose at least one Variation Type first.", "danger");
    return;
  }

  _pfEditingVariantId = variantId || null;
  document.getElementById("variant-form").reset();
  _pfSelectedAttrValueIds = new Set();

  const titleEl = document.getElementById("variant-modal-title");
  const saveBtn = document.getElementById("variant-save-btn");

  if (_pfEditingVariantId) {
    const variant = _pfVariantsCache.find((v) => v.id === _pfEditingVariantId);
    titleEl.textContent = "Edit Variant";
    saveBtn.textContent = "Save Changes";
    if (variant) {
      document.getElementById("variant-sku").value = variant.sku;
      document.getElementById("variant-price-override").value = variant.price_override ?? "";
      document.getElementById("variant-stock").value = variant.stock_quantity;
      document.getElementById("variant-active").checked = variant.is_active;
      _pfSelectedAttrValueIds = new Set((variant.attribute_values_detail || []).map((v) => v.id));
    }
  } else {
    titleEl.textContent = "Add Variant";
    saveBtn.textContent = "Save Variant";
    document.getElementById("variant-active").checked = true;
  }

  renderVariantModalAttributeArea();

  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("variant-modal"));
  modal.show();
}

async function handleVariantSave(e) {
  e.preventDefault();

  if (!_pfProductId) {
    eToast("Save the product first.", "danger");
    return;
  }
  if (!_pfSelectedAttrValueIds.size) {
    eToast("Select at least one value for this variant's combination.", "danger");
    return;
  }

  const payload = {
    product: _pfProductId,
    sku: document.getElementById("variant-sku").value.trim(),
    price_override: document.getElementById("variant-price-override").value || null,
    stock_quantity: Number(document.getElementById("variant-stock").value || 0),
    is_active: document.getElementById("variant-active").checked,
    attribute_values: Array.from(_pfSelectedAttrValueIds),
  };

  const btn = document.getElementById("variant-save-btn");
  btn.disabled = true;

  let success, result;
  if (_pfEditingVariantId) {
    const url = buildDetailUrlPF(_pfCfg.productVariantApiUrl, _pfEditingVariantId);
    [success, result] = await callApi("PUT", url, payload, _pfCfg.csrfToken);
  } else {
    [success, result] = await callApi("POST", _pfCfg.productVariantApiUrl, payload, _pfCfg.csrfToken);
  }

  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save variant."), "danger");
    return;
  }

  eToast(_pfEditingVariantId ? "Variant updated." : "Variant added.", "success");
  bootstrap.Modal.getInstance(document.getElementById("variant-modal"))?.hide();
  _pfEditingVariantId = null;
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

/* ───────────── Product Details (specifications) ───────────── */

function renderSpecs(specs) {
  const list = document.getElementById("specs-list");
  if (!specs.length) {
    list.innerHTML = `<div class="e-empty py-3"><p>No detail rows yet.</p></div>`;
    return;
  }

  list.innerHTML = specs.map((s) => `
    <div class="d-flex justify-content-between align-items-center border rounded p-2" style="border-color:var(--e-border) !important;">
      <div>
        <div style="font-size:13px;font-weight:600;">${eEscapeHtml(s.key)}</div>
        <div style="font-size:11.5px;color:var(--e-text-muted);">${eEscapeHtml(s.value)}</div>
      </div>
      <button type="button" class="btn-e-icon" onclick="deleteSpec(${s.id})"><i class="bi bi-trash"></i></button>
    </div>
  `).join("");
}

async function refreshSpecs() {
  const url = buildDetailUrlPF(_pfCfg.productApiUrl, _pfProductId);
  const [success, result] = await callApi("GET", url, null, _pfCfg.csrfToken);
  if (success && result.success) renderSpecs(result.data.product.specifications || []);
}

async function handleSpecAdd(e) {
  e.preventDefault();
  if (!_pfProductId) {
    eToast("Save the product first.", "danger");
    return;
  }

  const key = document.getElementById("spec-key").value.trim();
  const value = document.getElementById("spec-value").value.trim();
  if (!key || !value) return;

  const btn = document.getElementById("spec-add-btn");
  btn.disabled = true;

  const [success, result] = await callApi(
    "POST", _pfCfg.productSpecificationApiUrl,
    { product: _pfProductId, key, value }, _pfCfg.csrfToken
  );

  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not add detail row."), "danger");
    return;
  }

  document.getElementById("spec-add-form").reset();
  refreshSpecs();
}

async function deleteSpec(specId) {
  if (!eConfirmAction("Delete this detail row?")) return;
  const url = buildDetailUrlPF(_pfCfg.productSpecificationApiUrl, specId);
  const [success, result] = await callApi("DELETE", url, null, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete detail row."), "danger");
    return;
  }
  refreshSpecs();
}

/* ───────────── Care & Fabric instructions ───────────── */

function careIconLabel(iconValue) {
  const found = PF_CARE_ICON_CHOICES.find(([val]) => val === iconValue);
  return found ? found[1] : iconValue;
}

function renderCareInstructions(rows) {
  const list = document.getElementById("care-list");
  if (!rows.length) {
    list.innerHTML = `<div class="e-empty py-3"><p>No care instructions yet.</p></div>`;
    return;
  }

  list.innerHTML = rows.map((r) => `
    <div class="d-flex justify-content-between align-items-center border rounded p-2" style="border-color:var(--e-border) !important;">
      <div>
        <div style="font-size:13px;font-weight:600;">${eEscapeHtml(r.title)}</div>
        <div style="font-size:11.5px;color:var(--e-text-muted);">${eEscapeHtml(careIconLabel(r.icon))}${r.description ? " · " + eEscapeHtml(r.description) : ""}</div>
      </div>
      <button type="button" class="btn-e-icon" onclick="deleteCareInstruction(${r.id})"><i class="bi bi-trash"></i></button>
    </div>
  `).join("");
}

async function refreshCareInstructions() {
  const url = buildDetailUrlPF(_pfCfg.productApiUrl, _pfProductId);
  const [success, result] = await callApi("GET", url, null, _pfCfg.csrfToken);
  if (success && result.success) renderCareInstructions(result.data.product.care_instructions || []);
}

async function handleCareAdd(e) {
  e.preventDefault();
  if (!_pfProductId) {
    eToast("Save the product first.", "danger");
    return;
  }

  const icon = document.getElementById("care-icon").value;
  const title = document.getElementById("care-title").value.trim();
  const description = document.getElementById("care-description").value.trim();
  if (!title) return;

  const btn = document.getElementById("care-add-btn");
  btn.disabled = true;

  const [success, result] = await callApi(
    "POST", _pfCfg.productCareInstructionApiUrl,
    { product: _pfProductId, icon, title, description }, _pfCfg.csrfToken
  );

  btn.disabled = false;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not add care instruction."), "danger");
    return;
  }

  document.getElementById("care-add-form").reset();
  populateCareIconOptions();
  refreshCareInstructions();
}

async function deleteCareInstruction(rowId) {
  if (!eConfirmAction("Delete this care instruction?")) return;
  const url = buildDetailUrlPF(_pfCfg.productCareInstructionApiUrl, rowId);
  const [success, result] = await callApi("DELETE", url, null, _pfCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete care instruction."), "danger");
    return;
  }
  refreshCareInstructions();
}

/* ───────────── Shared helper ───────────── */
function buildDetailUrlPF(listUrl, id) {
  return listUrl.endsWith("/") ? `${listUrl}${id}/` : `${listUrl}/${id}/`;
}
