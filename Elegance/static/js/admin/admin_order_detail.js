// ─────────────────────────────────────────────
// admin-order-detail.html
// ─────────────────────────────────────────────
let _odCfg = null;

const ORDER_STATUS_BADGE = {
  placed: "info", confirmed: "info", processing: "warning", shipped: "warning",
  out_for_delivery: "warning", delivered: "success", cancelled: "danger", returned: "danger",
};

function AdminOrderDetailInit(config) {
  _odCfg = config;
  document.getElementById("status-update-form").addEventListener("submit", handleStatusUpdate);
  loadOrder();
}

function detailUrl(id) {
  return _odCfg.adminOrderApiUrl.endsWith("/")
    ? `${_odCfg.adminOrderApiUrl}${id}/`
    : `${_odCfg.adminOrderApiUrl}/${id}/`;
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

function renderOrder(order) {
  document.getElementById("order-number-title").textContent = order.order_number;

  const badge = ORDER_STATUS_BADGE[order.order_status] || "muted";
  document.getElementById("order-status-badge").innerHTML =
    `<span class="e-badge ${badge}">${eEscapeHtml(order.order_status_display)}</span>`;

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
    courier_partner: document.getElementById("update-courier").value.trim(),
    tracking_id: document.getElementById("update-tracking-id").value.trim(),
    tracking_url: document.getElementById("update-tracking-url").value.trim(),
  };

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
