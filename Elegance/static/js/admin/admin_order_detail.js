// ─────────────────────────────────────────────
// admin-order-detail.html
// ─────────────────────────────────────────────
let _odCfg = null;
let _currentOrder = null;
let _shipOptions = null;
let _shipLocations = [];
let _shipModal = null;

const ORDER_STATUS_BADGE = {
  placed: "info", confirmed: "info", processing: "warning", shipped: "warning",
  out_for_delivery: "warning", delivered: "success", cancelled: "danger", returned: "danger",
};

const SHIPMENT_STATUS_BADGE = {
  pending: "muted", booked: "info", pickup_scheduled: "info", picked_up: "warning", in_transit: "warning",
  out_for_delivery: "warning", delivered: "success", undelivered: "danger", rto_initiated: "danger",
  rto_delivered: "danger", cancelled: "muted", failed: "danger",
};

const MANUAL_STATUS_OPTIONS = [
  ["picked_up", "Picked up"],
  ["in_transit", "In transit"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
  ["undelivered", "Delivery attempt failed"],
  ["rto_initiated", "Returning to seller"],
  ["rto_delivered", "Returned to seller"],
];

function AdminOrderDetailInit(config) {
  _odCfg = config;
  document.getElementById("status-update-form").addEventListener("submit", handleStatusUpdate);
  document.getElementById("fulfilment-body").addEventListener("click", handleFulfilmentClick);
  document.getElementById("ship-submit-btn").addEventListener("click", submitShipment);
  document.getElementById("ship-rates-btn").addEventListener("click", loadCourierRates);
  document.getElementById("ship-pickup-location").addEventListener("change", onPickupLocationChange);
  _shipModal = new bootstrap.Modal(document.getElementById("ship-modal"));
  loadOrder();
}

function detailUrl(id) {
  return _odCfg.adminOrderApiUrl.endsWith("/")
    ? `${_odCfg.adminOrderApiUrl}${id}/`
    : `${_odCfg.adminOrderApiUrl}/${id}/`;
}

function listUrl(path) {
  const base = _odCfg.adminOrderApiUrl.endsWith("/") ? _odCfg.adminOrderApiUrl : `${_odCfg.adminOrderApiUrl}/`;
  return `${base}${path}`;
}

function actionUrl(path) {
  return `${detailUrl(_odCfg.orderId)}${path}`;
}

async function loadOrder() {
  const [success, result] = await callApi("GET", detailUrl(_odCfg.orderId), null, _odCfg.csrfToken);

  if (!success || !result.success) {
    document.getElementById("order-detail-loading").innerHTML =
      `<p>${eEscapeHtml(eExtractError(result, "Could not load order."))}</p>`;
    return;
  }

  renderOrder(result.data.order);
  document.getElementById("order-detail-loading").style.display = "none";
  document.getElementById("order-detail-content").style.display = "block";
}

function fmtDay(value) {
  if (!value) return "-";
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ── fulfilment card ─────────────────────────────────────────────────────
function pickupAddressHtml(addr) {
  if (!addr || !addr.name) return `<span class="text-muted">-</span>`;
  const lines = [addr.address, addr.address_2].filter(Boolean).map(eEscapeHtml).join(", ");
  return `
    <strong>${eEscapeHtml(addr.name)}</strong>${addr.contact_name && addr.contact_name !== addr.name ? ` (${eEscapeHtml(addr.contact_name)})` : ""}<br>
    ${lines}<br>
    ${eEscapeHtml(addr.city || "")}${addr.state ? ", " + eEscapeHtml(addr.state) : ""} ${eEscapeHtml(addr.pincode || "")}
    ${addr.phone ? `<br>${eEscapeHtml(addr.phone)}` : ""}
  `;
}

function renderFulfilment(order) {
  const body = document.getElementById("fulfilment-body");
  const badge = document.getElementById("fulfilment-badge");
  const shipment = order.shipment;
  const active = shipment && shipment.is_active ? shipment : null;

  badge.innerHTML = shipment
    ? `<span class="e-badge ${SHIPMENT_STATUS_BADGE[shipment.status] || "muted"}">${eEscapeHtml(shipment.status_display)}</span>`
    : order.is_approved ? `<span class="e-badge info">Approved</span>` : `<span class="e-badge muted">Awaiting approval</span>`;

  const closed = ["cancelled", "returned"].includes(order.order_status);

  if (closed && !active) {
    body.innerHTML = `<p class="mb-0 text-muted">This order is ${eEscapeHtml(order.order_status_display.toLowerCase())}. No further fulfilment is needed.</p>${lastShipmentNote(shipment)}`;
    return;
  }

  if (!order.is_approved) {
    const paid = ["paid", "partial"].includes(order.payment_status);
    body.innerHTML = `
      <div class="fulfil-step">
        <div>
          <strong>Step 1 - Review &amp; approve</strong>
          <p class="text-muted mb-2" style="font-size:13px;">
            Check the items and address, then approve to confirm the order. After approval you choose a delivery partner and pickup day.
          </p>
          <div class="e-field-help mb-3">
            Payment: <strong>${eEscapeHtml(order.payment_status_display || order.payment_status)}</strong>
            ${paid ? "" : " - the order can be approved once payment is received."}
          </div>
        </div>
        <button type="button" class="btn-e-primary" data-action="approve">Approve order</button>
      </div>`;
    return;
  }

  if (!active) {
    body.innerHTML = `
      <div class="fulfil-step">
        <div>
          <strong>Step 2 - Book a delivery partner</strong>
          <p class="text-muted mb-2" style="font-size:13px;">
            Approved ${order.approved_at ? eFormatDate(order.approved_at) : ""}. Choose Shiprocket, or arrange delivery yourself, and pick the day the delivery person will collect the parcel.
          </p>
          ${order.amount_to_collect > 0 ? `<div class="e-field-help mb-3">Collect on delivery: <strong>${eFormatCurrency(order.amount_to_collect)}</strong></div>` : ""}
        </div>
        <button type="button" class="btn-e-primary" data-action="ship">Ship this order</button>
      </div>
      ${lastShipmentNote(shipment)}`;
    return;
  }

  body.innerHTML = shipmentHtml(active, order);
}

function lastShipmentNote(shipment) {
  if (!shipment || shipment.is_active) return "";
  const label = shipment.status === "cancelled" ? "cancelled" : shipment.status_display.toLowerCase();
  return `<div class="e-field-help mt-3">Previous booking with ${eEscapeHtml(shipment.provider_display)} was ${eEscapeHtml(label)}${shipment.error_message ? ": " + eEscapeHtml(shipment.error_message) : ""}.</div>`;
}

function docLink(url, label, icon) {
  return url
    ? `<a class="btn-e-outline" href="${eEscapeHtml(url)}" target="_blank" rel="noopener"><i class="bi ${icon}"></i> ${label}</a>`
    : "";
}

function shipmentHtml(s, order) {
  const failed = s.status === "failed" || (s.error_message && !s.awb_code);
  const manual = s.provider === "manual";
  const api = s.is_api_provider;

  const docs = [
    docLink(s.label_url, "Shipping label", "bi-tag"),
    docLink(s.invoice_url, "Invoice", "bi-receipt"),
    docLink(s.manifest_url, "Manifest", "bi-file-earmark-text"),
    `<a class="btn-e-outline" href="${eEscapeHtml(_odCfg.packingSlipUrl)}" target="_blank" rel="noopener"><i class="bi bi-printer"></i> Packing slip</a>`,
  ].join("");

  const events = (s.events || []).map((ev) => `
    <li>
      <div class="ship-event-title">${eEscapeHtml(ev.activity || ev.status_display)}</div>
      <div class="text-muted" style="font-size:11.5px;">${eFormatDate(ev.occurred_at)}${ev.location ? " · " + eEscapeHtml(ev.location) : ""}</div>
    </li>`).join("");

  const canCancel = !s.is_final;

  return `
    ${failed ? `<div class="ship-alert danger"><strong>Booking needs attention.</strong> ${eEscapeHtml(s.error_message || "The booking did not complete.")}</div>` : ""}
    <div class="ship-grid">
      <div><div class="ship-k">Delivery partner</div><div>${eEscapeHtml(s.provider_display)}</div></div>
      <div><div class="ship-k">Courier</div><div>${eEscapeHtml(s.courier_name || "-")}</div></div>
      <div><div class="ship-k">${manual ? "Reference" : "AWB / Tracking no."}</div><div>${eEscapeHtml(s.awb_code || "-")}</div></div>
      <div><div class="ship-k">Pickup day</div><div>${fmtDay(s.pickup_date)}${api ? (s.pickup_requested ? ' <span class="e-badge success">Requested</span>' : ' <span class="e-badge warning">Not requested</span>') : ""}</div></div>
      <div><div class="ship-k">Parcel</div><div>${eEscapeHtml(String(s.weight_kg))} kg · ${eEscapeHtml(String(s.length_cm))}×${eEscapeHtml(String(s.breadth_cm))}×${eEscapeHtml(String(s.height_cm))} cm</div></div>
      <div><div class="ship-k">Collect on delivery</div><div>${Number(s.cod_amount) > 0 ? eFormatCurrency(s.cod_amount) : "Prepaid"}</div></div>
      ${Number(s.shipping_cost) > 0 ? `<div><div class="ship-k">Courier charge</div><div>${eFormatCurrency(s.shipping_cost)}</div></div>` : ""}
      ${s.estimated_delivery ? `<div><div class="ship-k">Expected delivery</div><div>${eFormatDate(s.estimated_delivery)}</div></div>` : ""}
    </div>

    <div class="ship-k mt-3">Pickup address</div>
    <div class="ship-address">${pickupAddressHtml(s.pickup_address)}</div>

    <div class="ship-k mt-3">Documents</div>
    <div class="d-flex flex-wrap gap-2 mb-1">${docs}</div>

    <hr>
    <div class="d-flex flex-wrap gap-2">
      ${failed ? `<button type="button" class="btn-e-primary" data-action="retry">Retry booking</button>` : ""}
      ${api && !failed ? `<button type="button" class="btn-e-outline" data-action="sync">Refresh tracking</button>` : ""}
      ${api ? `<button type="button" class="btn-e-outline" data-action="refresh_documents">Refresh documents</button>` : ""}
      ${s.tracking_url ? `<a class="btn-e-outline" href="${eEscapeHtml(s.tracking_url)}" target="_blank" rel="noopener">Open tracking page</a>` : ""}
      ${canCancel ? `<button type="button" class="btn-e-danger-ghost" data-action="cancel">Cancel shipment</button>` : ""}
    </div>

    ${manual && !s.is_final ? `
      <div class="ship-manual-box mt-3">
        <div class="ship-k mb-2">Update delivery progress (you manage this shipment)</div>
        <div class="row g-2">
          <div class="col-md-4">
            <select class="e-select" id="manual-status" aria-label="New delivery status">
              ${MANUAL_STATUS_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === s.status ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-5"><input type="text" class="e-input" id="manual-note" placeholder="Note shown to the customer (optional)" maxlength="300" aria-label="Note"></div>
          <div class="col-md-3"><button type="button" class="btn-e-primary w-100" data-action="set_status">Update</button></div>
        </div>
        <div class="row g-2 mt-1">
          <div class="col-md-4"><input type="date" class="e-input" id="manual-pickup-date" value="${eEscapeHtml(s.pickup_date || "")}" aria-label="Pickup day"></div>
          <div class="col-md-3"><button type="button" class="btn-e-outline w-100" data-action="reschedule">Change pickup day</button></div>
        </div>
      </div>` : ""}

    ${events ? `<div class="ship-k mt-3">Tracking timeline</div><ul class="ship-timeline">${events}</ul>` : ""}
    ${s.last_synced_at ? `<div class="e-field-help mt-2">Last synced ${eFormatDate(s.last_synced_at)}</div>` : ""}
  `;
}

async function handleFulfilmentClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "ship") return openShipModal();

  if (action === "approve") {
    if (!(await eConfirmAction("Approve this order and move it to processing?"))) return;
    return runOrderAction(btn, "POST", actionUrl("approve/"), {}, "Order approved.");
  }

  const shipmentActions = {
    retry: "Booking retried.",
    sync: "Tracking refreshed.",
    refresh_documents: "Documents refreshed.",
    cancel: "Shipment cancelled.",
    set_status: "Delivery status updated.",
    reschedule: "Pickup day updated.",
  };
  if (!(action in shipmentActions)) return;

  const payload = { action };
  if (action === "cancel") {
    if (!(await eConfirmAction("Cancel this shipment? The booking will be cancelled with the delivery partner."))) return;
  }
  if (action === "set_status") {
    payload.status = document.getElementById("manual-status").value;
    payload.note = document.getElementById("manual-note").value.trim();
  }
  if (action === "reschedule") {
    payload.pickup_date = document.getElementById("manual-pickup-date").value;
  }
  runOrderAction(btn, "POST", actionUrl("shipment-action/"), payload, shipmentActions[action]);
}

async function runOrderAction(btn, method, url, payload, successMessage) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Working...";
  const [success, result] = await callApi(method, url, payload, _odCfg.csrfToken);
  btn.disabled = false;
  btn.innerHTML = original;

  if (!success || !result.success) {
    eToast(eExtractError(result, "That action could not be completed."), "danger");
    return false;
  }
  showWarnings(result);
  eToast(successMessage, "success");
  renderOrder(result.data.order);
  return true;
}

function showWarnings(result) {
  (result.data && result.data.warnings || []).forEach((w) => eToast(w, "danger"));
}

// ── ship modal ──────────────────────────────────────────────────────────
function currentProvider() {
  const checked = document.querySelector('input[name="ship-provider"]:checked');
  return checked ? checked.value : "";
}

async function openShipModal() {
  document.getElementById("ship-form").style.display = "none";
  document.getElementById("ship-modal-loading").style.display = "block";
  document.getElementById("ship-modal-loading").innerHTML = "<p>Loading delivery options...</p>";
  document.getElementById("ship-submit-btn").disabled = true;
  document.getElementById("ship-error").style.display = "none";
  _shipModal.show();

  const [success, result] = await callApi("GET", actionUrl("shipping-options/"), null, _odCfg.csrfToken);
  if (!success || !result.success) {
    document.getElementById("ship-modal-loading").innerHTML = `<p>${eEscapeHtml(eExtractError(result, "Could not load delivery options."))}</p>`;
    return;
  }
  _shipOptions = result.data;
  renderShipForm();
}

function renderShipForm() {
  const o = _shipOptions;
  document.getElementById("ship-env-note").innerHTML = o.environment === "production"
    ? ""
    : `<span class="e-badge warning">Test mode</span> Bookings are made against the partner's <strong>${eEscapeHtml(o.environment)}</strong> environment.`;

  const firstAvailable = o.providers.find((p) => p.available);
  document.getElementById("ship-providers").innerHTML = o.providers.map((p) => `
    <label class="ship-provider ${p.available ? "" : "disabled"}">
      <input type="radio" name="ship-provider" value="${eEscapeHtml(p.key)}" ${p.available ? "" : "disabled"} ${firstAvailable && firstAvailable.key === p.key ? "checked" : ""}>
      <span>
        <strong>${eEscapeHtml(p.label)}</strong>
        <small>${p.available ? (p.api_based ? "Automatic booking, label and tracking" : "You deliver or book it yourself") : eEscapeHtml(p.reason || "Unavailable")}</small>
      </span>
    </label>`).join("");

  document.querySelectorAll('input[name="ship-provider"]').forEach((el) => el.addEventListener("change", onProviderChange));

  document.getElementById("ship-pickup-date").innerHTML = o.pickup_dates
    .map((d) => `<option value="${d}">${fmtDay(d)}</option>`).join("");

  document.getElementById("ship-weight").value = o.parcel.weight_kg;
  document.getElementById("ship-length").value = o.parcel.length_cm;
  document.getElementById("ship-breadth").value = o.parcel.breadth_cm;
  document.getElementById("ship-height").value = o.parcel.height_cm;

  ["ship-courier-name", "ship-manual-cost", "ship-manual-ref", "ship-manual-url"].forEach((id) => { document.getElementById(id).value = ""; });

  const cod = Number(o.amount_to_collect);
  const codNote = document.getElementById("ship-cod-note");
  codNote.style.display = "block";
  codNote.innerHTML = cod > 0
    ? `Cash to collect from the customer on delivery: <strong>${eFormatCurrency(cod)}</strong>`
    : "This order is fully paid. Nothing to collect on delivery.";

  document.getElementById("ship-modal-loading").style.display = "none";
  document.getElementById("ship-form").style.display = "block";
  onProviderChange();
}

async function onProviderChange() {
  const provider = currentProvider();
  const manual = provider === "manual";
  document.getElementById("ship-api-section").style.display = manual || !provider ? "none" : "block";
  document.getElementById("ship-manual-section").style.display = manual ? "block" : "none";
  document.getElementById("ship-rates").innerHTML =
    `<div class="e-field-help">Optional. Leave unselected to let the partner auto-assign the recommended courier.</div>`;
  document.getElementById("ship-submit-btn").disabled = true;
  document.getElementById("ship-error").style.display = "none";

  const select = document.getElementById("ship-pickup-location");
  if (!provider) {
    select.innerHTML = "";
    return;
  }
  select.innerHTML = `<option>Loading...</option>`;
  const [success, result] = await callApi("GET", `${listUrl("pickup-locations/")}?provider=${encodeURIComponent(provider)}`, null, _odCfg.csrfToken);
  if (!success || !result.success) {
    _shipLocations = [];
    select.innerHTML = "";
    showShipError(eExtractError(result, "Could not load pickup addresses."));
    return;
  }
  _shipLocations = result.data.locations || [];
  if (!_shipLocations.length) {
    select.innerHTML = "";
    showShipError("No pickup addresses found. Add one in your Shiprocket dashboard first.");
    return;
  }
  const def = _shipLocations.find((l) => l.is_default) || _shipLocations[0];
  select.innerHTML = _shipLocations
    .map((l) => `<option value="${eEscapeHtml(l.name)}" ${l.name === def.name ? "selected" : ""}>${eEscapeHtml(l.name)} - ${eEscapeHtml(l.city || "")} ${eEscapeHtml(l.pincode || "")}${l.verified === false ? " (not verified)" : ""}</option>`)
    .join("");
  onPickupLocationChange();
  document.getElementById("ship-submit-btn").disabled = false;
}

function selectedLocation() {
  const name = document.getElementById("ship-pickup-location").value;
  return _shipLocations.find((l) => l.name === name);
}

function onPickupLocationChange() {
  const loc = selectedLocation();
  document.getElementById("ship-pickup-preview").innerHTML = loc
    ? `${eEscapeHtml([loc.address, loc.address_2].filter(Boolean).join(", "))}, ${eEscapeHtml(loc.city || "")}, ${eEscapeHtml(loc.state || "")} ${eEscapeHtml(loc.pincode || "")}${loc.phone ? " · " + eEscapeHtml(loc.phone) : ""}`
    : "";
  // A rate quote depends on the pickup pincode, so a previous quote is stale.
  if (currentProvider() && currentProvider() !== "manual") {
    document.getElementById("ship-rates").innerHTML =
      `<div class="e-field-help">Optional. Leave unselected to let the partner auto-assign the recommended courier.</div>`;
  }
}

function showShipError(message) {
  const el = document.getElementById("ship-error");
  el.textContent = message;
  el.style.display = "block";
}

async function loadCourierRates() {
  const loc = selectedLocation();
  if (!loc) return showShipError("Choose a pickup address first.");
  const btn = document.getElementById("ship-rates-btn");
  btn.disabled = true;
  btn.textContent = "Checking...";
  document.getElementById("ship-error").style.display = "none";

  const params = new URLSearchParams({
    provider: currentProvider(),
    pickup_pincode: loc.pincode,
    weight_kg: document.getElementById("ship-weight").value,
  });
  const [success, result] = await callApi("GET", `${actionUrl("courier-rates/")}?${params}`, null, _odCfg.csrfToken);
  btn.disabled = false;
  btn.textContent = "Check courier rates";

  if (!success || !result.success) {
    showShipError(eExtractError(result, "Could not fetch courier rates."));
    return;
  }
  const couriers = result.data.couriers || [];
  document.getElementById("ship-rates").innerHTML = couriers.length
    ? couriers.map((c, i) => `
        <label class="ship-rate">
          <input type="radio" name="ship-courier" value="${eEscapeHtml(c.id)}" data-rate="${c.rate}" data-name="${eEscapeHtml(c.name)}" ${c.recommended ? "checked" : ""}>
          <span class="ship-rate-name">${eEscapeHtml(c.name)} ${c.recommended ? '<span class="e-badge success">Recommended</span>' : ""}</span>
          <span class="text-muted">${c.etd ? "Delivery by " + eEscapeHtml(c.etd) : (c.etd_days ? c.etd_days + " days" : "")}</span>
          <strong>${eFormatCurrency(c.rate)}</strong>
        </label>`).join("")
    : `<div class="e-field-help">No couriers service this route. Try another partner or deliver manually.</div>`;
}

async function submitShipment() {
  const provider = currentProvider();
  const loc = selectedLocation();
  if (!provider) return showShipError("Choose a delivery partner.");
  if (!loc) return showShipError("Choose a pickup address.");

  const payload = {
    provider,
    pickup_location: loc.name,
    pickup_date: document.getElementById("ship-pickup-date").value,
    weight_kg: document.getElementById("ship-weight").value,
    length_cm: document.getElementById("ship-length").value,
    breadth_cm: document.getElementById("ship-breadth").value,
    height_cm: document.getElementById("ship-height").value,
  };

  if (provider === "manual") {
    payload.courier_name = document.getElementById("ship-courier-name").value.trim();
    payload.shipping_cost = document.getElementById("ship-manual-cost").value || 0;
    payload.awb_code = document.getElementById("ship-manual-ref").value.trim();
    payload.tracking_url = document.getElementById("ship-manual-url").value.trim();
    if (!payload.courier_name) return showShipError("Enter who will deliver this order.");
  } else {
    const chosen = document.querySelector('input[name="ship-courier"]:checked');
    if (chosen) {
      payload.courier_id = chosen.value;
      payload.shipping_cost = chosen.dataset.rate;
    }
  }

  document.getElementById("ship-error").style.display = "none";
  const btn = document.getElementById("ship-submit-btn");
  btn.disabled = true;
  btn.textContent = "Booking...";
  const [success, result] = await callApi("POST", actionUrl("ship/"), payload, _odCfg.csrfToken);
  btn.disabled = false;
  btn.innerHTML = "Book &amp; schedule pickup";

  if (!success || !result.success) {
    showShipError(eExtractError(result, "Booking failed."));
    // A partial booking is saved server-side; reload so the card shows the retry option.
    loadOrder();
    return;
  }
  _shipModal.hide();
  showWarnings(result);
  eToast(provider === "manual" ? "Delivery recorded." : "Shipment booked.", "success");
  renderOrder(result.data.order);
}

// ── order rendering ─────────────────────────────────────────────────────
function renderOrder(order) {
  _currentOrder = order;
  document.getElementById("order-number-title").textContent = order.order_number;

  const badge = ORDER_STATUS_BADGE[order.order_status] || "muted";
  document.getElementById("order-status-badge").innerHTML =
    `<span class="e-badge ${badge}">${eEscapeHtml(order.order_status_display)}</span>`;

  renderFulfilment(order);

  document.getElementById("order-items-body").innerHTML = (order.items || []).map((item) => `
    <tr>
      <td>
        <strong>${eEscapeHtml(item.product_name)}</strong>
        ${item.variant_label ? `<div class="text-muted" style="font-size:11.5px;">${eEscapeHtml(item.variant_label)}</div>` : ""}
      </td>
      <td class="text-muted">${eEscapeHtml(item.sku)}</td>
      <td>${eFormatCurrency(item.unit_price)}</td>
      <td>${item.quantity}</td>
      <td>${eFormatCurrency(item.total_price)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5"><div class="e-empty"><p>No items.</p></div></td></tr>`;

  document.getElementById("status-history-list").innerHTML = (order.status_history || []).slice().reverse().map((h) => `
    <div class="d-flex gap-3">
      <div class="e-badge ${ORDER_STATUS_BADGE[h.status] || "muted"}" style="height:fit-content;">${eEscapeHtml(h.status_display)}</div>
      <div>
        <div style="font-size:13px;">${eEscapeHtml(h.note || "Status updated")}</div>
        <div class="text-muted" style="font-size:11.5px;">${eFormatDate(h.changed_at)} ${h.changed_by_name ? "· " + eEscapeHtml(h.changed_by_name) : ""}</div>
      </div>
    </div>
  `).join("") || `<div class="e-empty py-2"><p>No history yet.</p></div>`;

  document.getElementById("order-payments-body").innerHTML = (order.payments || []).map((p) => `
    <tr>
      <td>${eEscapeHtml(p.payment_type_display)}</td>
      <td>${eFormatCurrency(p.amount)}</td>
      <td><span class="e-badge ${p.status === "success" ? "success" : p.status === "failed" ? "danger" : "muted"}">${eEscapeHtml(p.status_display)}</span></td>
      <td>${eFormatDate(p.paid_at)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4"><div class="e-empty"><p>No payments recorded.</p></div></td></tr>`;

  document.getElementById("shipping-details").innerHTML = `
    <div style="font-size:13.5px;line-height:1.7;">
      <strong>${eEscapeHtml(order.shipping_full_name)}</strong><br>
      ${eEscapeHtml(order.shipping_mobile)}<br>
      ${eEscapeHtml(order.shipping_address_line1)}${order.shipping_address_line2 ? ", " + eEscapeHtml(order.shipping_address_line2) : ""}<br>
      ${eEscapeHtml(order.shipping_city)}, ${eEscapeHtml(order.shipping_state)} ${eEscapeHtml(order.shipping_pincode)}<br>
      ${eEscapeHtml(order.shipping_country)}
    </div>
  `;

  document.getElementById("order-summary").innerHTML = `
    <div class="d-flex justify-content-between mb-2" style="font-size:13.5px;">
      <span class="text-muted">Subtotal</span><span>${eFormatCurrency(order.subtotal)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2" style="font-size:13.5px;">
      <span class="text-muted">Discount</span><span>-${eFormatCurrency(order.discount_amount)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2" style="font-size:13.5px;">
      <span class="text-muted">Shipping</span><span>${eFormatCurrency(order.shipping_charge)}</span>
    </div>
    <hr>
    <div class="d-flex justify-content-between mb-2" style="font-size:15px;font-weight:600;">
      <span>Total</span><span>${eFormatCurrency(order.total_amount)}</span>
    </div>
    ${order.is_cod ? `
      <div class="d-flex justify-content-between mb-1" style="font-size:12.5px;color:var(--e-text-muted);">
        <span>COD Advance (${order.cod_advance_percentage}%)</span><span>${eFormatCurrency(order.cod_advance_amount)}</span>
      </div>
      <div class="d-flex justify-content-between" style="font-size:12.5px;color:var(--e-text-muted);">
        <span>Balance on Delivery</span><span>${eFormatCurrency(order.cod_balance_amount)}</span>
      </div>
    ` : ""}
  `;

  const hasActiveShipment = !!(order.shipment && order.shipment.is_active);
  document.getElementById("manual-tracking-fields").style.display = hasActiveShipment ? "none" : "block";
  document.getElementById("status-managed-note").style.display = hasActiveShipment ? "block" : "none";

  document.getElementById("update-order-status").value = order.order_status;
  document.getElementById("update-courier").value = order.courier_partner || "";
  document.getElementById("update-tracking-id").value = order.tracking_id || "";
  document.getElementById("update-tracking-url").value = order.tracking_url || "";
}

async function handleStatusUpdate(e) {
  e.preventDefault();

  const payload = {
    order_status: document.getElementById("update-order-status").value,
    note: document.getElementById("update-note").value.trim(),
  };
  const hasActiveShipment = !!(_currentOrder && _currentOrder.shipment && _currentOrder.shipment.is_active);
  if (!hasActiveShipment) {
    payload.courier_partner = document.getElementById("update-courier").value.trim();
    payload.tracking_id = document.getElementById("update-tracking-id").value.trim();
    payload.tracking_url = document.getElementById("update-tracking-url").value.trim();
  }

  const btn = document.getElementById("status-update-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  const [success, result] = await callApi("PUT", detailUrl(_odCfg.orderId), payload, _odCfg.csrfToken);

  btn.disabled = false;
  btn.textContent = "Save Changes";

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not update order."), "danger");
    return;
  }

  eToast("Order updated.", "success");
  document.getElementById("update-note").value = "";
  renderOrder(result.data.order);
}
