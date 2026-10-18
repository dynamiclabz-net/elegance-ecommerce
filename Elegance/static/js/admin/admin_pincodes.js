// ─────────────────────────────────────────────
// admin-pincodes.html — pincode range delivery pricing
// ─────────────────────────────────────────────
let _pinCfg = null;
let _pinRanges = [];
let _pinPage = 1;
let _pinTotal = 0;
const PIN_PAGE_SIZE = 25;

function AdminPincodesInit(config) {
  _pinCfg = config;

  document.getElementById("range-form").addEventListener("submit", handleRangeSubmit);

  let searchTimer = null;
  document.getElementById("filter-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { _pinPage = 1; loadRanges(); }, 300);
  });
  ["filter-state", "filter-active"].forEach((id) =>
    document.getElementById(id).addEventListener("change", () => { _pinPage = 1; loadRanges(); })
  );

  document.getElementById("pager-prev").addEventListener("click", () => { _pinPage -= 1; loadRanges(); });
  document.getElementById("pager-next").addEventListener("click", () => { _pinPage += 1; loadRanges(); });

  // Pincode inputs: digits only, then re-check overlap as the admin types.
  let validateTimer = null;
  ["range-start", "range-end"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
      clearTimeout(validateTimer);
      validateTimer = setTimeout(runLiveValidation, 350);
    });
  });

  loadRanges();
}

/* ───────────── List ───────────── */

async function loadRanges() {
  const params = new URLSearchParams({ page: _pinPage, page_size: PIN_PAGE_SIZE });
  const search = document.getElementById("filter-search").value.trim();
  const state = document.getElementById("filter-state").value;
  const active = document.getElementById("filter-active").value;
  if (search) params.set("search", search);
  if (state) params.set("state", state);
  if (active) params.set("is_active", active);

  const tbody = document.getElementById("ranges-body");
  const [success, result] = await callApi("GET", `${_pinCfg.apiUrl}?${params}`, null, _pinCfg.csrfToken);

  if (!success || !result.success) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="e-empty"><p>Could not load pincode ranges.</p></div></td></tr>`;
    return;
  }

  const data = result.data;
  _pinRanges = data.ranges || [];
  _pinTotal = data.total_count || 0;

  renderStats(data.stats);
  renderStateOptions(data.states || []);
  renderRows();
  renderPager();
}

function renderStats(stats) {
  document.getElementById("stat-total").textContent = stats.total_ranges;
  document.getElementById("stat-active").textContent = stats.active_ranges;
  document.getElementById("stat-states").textContent = stats.states_covered;
  document.getElementById("stat-band").textContent = stats.min_price === null
    ? "\u2014"
    : (Number(stats.min_price) === Number(stats.max_price)
        ? `\u20B9${Number(stats.min_price)}`
        : `\u20B9${Number(stats.min_price)} \u2013 \u20B9${Number(stats.max_price)}`);
}

function renderStateOptions(states) {
  const filter = document.getElementById("filter-state");
  const selected = filter.value;
  filter.innerHTML = `<option value="">All states</option>` +
    states.map((s) => `<option value="${eEscapeHtml(s)}">${eEscapeHtml(s)}</option>`).join("");
  filter.value = selected;

  document.getElementById("state-options").innerHTML =
    states.map((s) => `<option value="${eEscapeHtml(s)}"></option>`).join("");
}

function renderRows() {
  const tbody = document.getElementById("ranges-body");

  if (_pinRanges.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="e-empty"><i class="bi bi-truck d-block"></i><p>No pincode ranges found. Add one, or run the Excel import script.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = _pinRanges.map((r) => `
    <tr>
      <td><strong>${eEscapeHtml(r.state)}</strong></td>
      <td>${formatPinRange(r.pincode_start, r.pincode_end)}</td>
      <td>&#8377;${Number(r.price)}</td>
      <td>${r.is_active ? '<span class="e-badge success">Active</span>' : '<span class="e-badge muted">Inactive</span>'}</td>
      <td class="text-end">
        <button class="btn-e-icon" onclick="editRange(${r.id})" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn-e-icon" onclick="deleteRange(${r.id})" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join("");
}

function renderPager() {
  const first = _pinTotal === 0 ? 0 : (_pinPage - 1) * PIN_PAGE_SIZE + 1;
  const last = Math.min(_pinPage * PIN_PAGE_SIZE, _pinTotal);
  document.getElementById("pager-summary").textContent = `Showing ${first}\u2013${last} of ${_pinTotal}`;
  document.getElementById("pager-prev").disabled = _pinPage <= 1;
  document.getElementById("pager-next").disabled = last >= _pinTotal;
}

function formatPinRange(start, end) {
  return start === end ? `${start}` : `${start} \u2013 ${end}`;
}

/* ───────────── Modal + live validation ───────────── */

function openRangeModal() {
  document.getElementById("range-modal-title").textContent = "New Pincode Range";
  document.getElementById("range-form").reset();
  document.getElementById("range-id").value = "";
  document.getElementById("range-is-active").checked = true;
  showValidation(null);
  new bootstrap.Modal(document.getElementById("range-modal")).show();
}

function editRange(id) {
  const range = _pinRanges.find((r) => r.id === id);
  if (!range) return;
  document.getElementById("range-modal-title").textContent = "Edit Pincode Range";
  document.getElementById("range-id").value = range.id;
  document.getElementById("range-state").value = range.state;
  document.getElementById("range-start").value = range.pincode_start;
  document.getElementById("range-end").value = range.pincode_end;
  document.getElementById("range-price").value = Number(range.price);
  document.getElementById("range-is-active").checked = range.is_active;
  showValidation(null);
  new bootstrap.Modal(document.getElementById("range-modal")).show();
}

// Cheap client-side checks first; the server is still the source of truth.
function localRangeError(start, end) {
  if (!/^\d{6}$/.test(start) || !/^\d{6}$/.test(end)) return "Pincodes must be exactly 6 digits.";
  if (Number(start) < 100000) return "Pincodes cannot start with 0.";
  if (Number(start) > Number(end)) return "'From' pincode cannot be greater than 'To' pincode.";
  return null;
}

function showValidation(state) {
  const box = document.getElementById("range-validation");
  const saveBtn = document.getElementById("range-save-btn");

  if (!state) {
    box.innerHTML = "";
    saveBtn.disabled = false;
    return;
  }

  const conflictRows = (state.conflicts || []).map((c) =>
    `<li><strong>${formatPinRange(c.pincode_start, c.pincode_end)}</strong> &middot; ${eEscapeHtml(c.state)} &middot; &#8377;${Number(c.price)}</li>`
  ).join("");

  box.innerHTML = state.valid
    ? `<div class="e-badge success" style="display:inline-flex;gap:.4rem;"><i class="bi bi-check-circle"></i> No overlap with existing ranges</div>`
    : `<div style="background:var(--e-danger-tint);color:var(--e-danger);border-radius:8px;padding:.75rem .9rem;font-size:13px;">
         ${(state.errors || []).map((e) => `<div>${eEscapeHtml(e)}</div>`).join("")}
         ${conflictRows ? `<ul class="mb-0 mt-2 ps-3">${conflictRows}</ul>` : ""}
       </div>`;

  saveBtn.disabled = !state.valid;
}

async function runLiveValidation() {
  const start = document.getElementById("range-start").value.trim();
  const end = document.getElementById("range-end").value.trim();

  if (start.length < 6 || end.length < 6) { showValidation(null); return; }

  const localError = localRangeError(start, end);
  if (localError) { showValidation({ valid: false, errors: [localError], conflicts: [] }); return; }

  const [success, result] = await callApi("POST", _pinCfg.validateUrl, {
    pincode_start: start,
    pincode_end: end,
    id: document.getElementById("range-id").value || null,
  }, _pinCfg.csrfToken);

  // Ignore stale responses if the admin kept typing.
  if (start !== document.getElementById("range-start").value.trim() ||
      end !== document.getElementById("range-end").value.trim()) return;

  if (!success || !result.success) { showValidation(null); return; }
  showValidation(result.data);
}

/* ───────────── Save / delete ───────────── */

async function handleRangeSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("range-id").value;
  const btn = document.getElementById("range-save-btn");

  const state = document.getElementById("range-state").value.trim();
  const start = document.getElementById("range-start").value.trim();
  const end = document.getElementById("range-end").value.trim();
  const price = document.getElementById("range-price").value;

  if (!state) { eToast("State is required.", "danger"); return; }
  const localError = localRangeError(start, end);
  if (localError) { showValidation({ valid: false, errors: [localError], conflicts: [] }); return; }
  if (price === "" || Number(price) < 0) { eToast("Enter a delivery price of 0 or more.", "danger"); return; }

  btn.disabled = true;
  const payload = {
    state,
    pincode_start: Number(start),
    pincode_end: Number(end),
    price: Number(price),
    is_active: document.getElementById("range-is-active").checked,
  };

  const url = id ? buildDetailUrl(_pinCfg.apiUrl, id) : _pinCfg.apiUrl;
  const [success, result] = await callApi(id ? "PUT" : "POST", url, payload, _pinCfg.csrfToken);
  btn.disabled = false;

  if (!success || !result.success) {
    const details = result && result.data;
    if (details && details.errors && details.errors.pincode_range) {
      showValidation({ valid: false, errors: details.errors.pincode_range, conflicts: details.conflicts || [] });
    }
    eToast(eExtractError(result, "Could not save pincode range."), "danger");
    return;
  }

  eToast(id ? "Pincode range updated." : "Pincode range created.", "success");
  bootstrap.Modal.getInstance(document.getElementById("range-modal"))?.hide();
  loadRanges();
}

async function deleteRange(id) {
  const range = _pinRanges.find((r) => r.id === id);
  const label = range ? `${formatPinRange(range.pincode_start, range.pincode_end)} (${range.state})` : "this range";
  if (!eConfirmAction(`Delete ${label}? Customers will no longer be able to order to these pincodes.`)) return;

  const [success, result] = await callApi("DELETE", buildDetailUrl(_pinCfg.apiUrl, id), null, _pinCfg.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete pincode range."), "danger");
    return;
  }
  eToast("Pincode range deleted.", "success");
  if (_pinRanges.length === 1 && _pinPage > 1) _pinPage -= 1;
  loadRanges();
}

// DRF list URLs end with a trailing slash -> detail is ".../{id}/"
function buildDetailUrl(listUrl, id) {
  return listUrl.endsWith("/") ? `${listUrl}${id}/` : `${listUrl}/${id}/`;
}
