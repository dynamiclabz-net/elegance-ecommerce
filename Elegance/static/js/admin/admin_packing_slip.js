// ─────────────────────────────────────────────
// admin-packing-slip.html
// ─────────────────────────────────────────────
function PackingSlipInit(cfg) {
  document.getElementById("slip-print-btn").addEventListener("click", () => window.print());
  loadSlip(cfg);
}

function slipUrl(cfg) {
  const base = cfg.adminOrderApiUrl.endsWith("/") ? cfg.adminOrderApiUrl : `${cfg.adminOrderApiUrl}/`;
  return `${base}${cfg.orderId}/`;
}

async function loadSlip(cfg) {
  const [success, result] = await callApi("GET", slipUrl(cfg), null, cfg.csrfToken);
  const note = document.getElementById("slip-toolbar-note");
  if (!success || !result.success) {
    note.textContent = eExtractError(result, "Could not load this order.");
    return;
  }
  renderSlip(result.data.order);
  note.textContent = "";
  document.getElementById("slip").hidden = false;
  document.title = `Packing slip ${result.data.order.order_number}`;
}

function renderSlip(order) {
  const shipment = order.shipment && order.shipment.is_active ? order.shipment : null;
  const pickup = shipment ? shipment.pickup_address : null;

  document.getElementById("slip-store").textContent = (pickup && pickup.name) || "Packing slip";
  document.getElementById("slip-order-meta").innerHTML =
    `Order <strong>${eEscapeHtml(order.order_number)}</strong> · ${eFormatDate(order.created_at || order.placed_at)}`;

  const collect = Number(order.amount_to_collect || 0);
  document.getElementById("slip-pay").innerHTML = collect > 0
    ? `<span class="slip-cod">CASH ON DELIVERY</span><strong>Collect ${eFormatCurrency(collect)}</strong>`
    : `<span class="slip-paid">PREPAID</span><strong>Do not collect cash</strong>`;

  document.getElementById("slip-ship-to").innerHTML = `
    <strong>${eEscapeHtml(order.shipping_full_name)}</strong><br>
    ${eEscapeHtml(order.shipping_address_line1)}${order.shipping_address_line2 ? ", " + eEscapeHtml(order.shipping_address_line2) : ""}<br>
    ${eEscapeHtml(order.shipping_city)}, ${eEscapeHtml(order.shipping_state)} ${eEscapeHtml(order.shipping_pincode)}<br>
    Phone: ${eEscapeHtml(order.shipping_mobile)}`;

  document.getElementById("slip-pickup").innerHTML = pickup && pickup.name
    ? `<strong>${eEscapeHtml(pickup.name)}</strong><br>
       ${[pickup.address, pickup.address_2].filter(Boolean).map(eEscapeHtml).join(", ")}<br>
       ${eEscapeHtml(pickup.city || "")}${pickup.state ? ", " + eEscapeHtml(pickup.state) : ""} ${eEscapeHtml(pickup.pincode || "")}
       ${pickup.phone ? `<br>Phone: ${eEscapeHtml(pickup.phone)}` : ""}`
    : `<span class="muted">Not booked yet</span>`;

  document.getElementById("slip-delivery").innerHTML = shipment
    ? `${eEscapeHtml(shipment.provider_display)}${shipment.courier_name ? " · " + eEscapeHtml(shipment.courier_name) : ""}<br>
       ${shipment.awb_code ? `AWB: <strong>${eEscapeHtml(shipment.awb_code)}</strong><br>` : ""}
       ${shipment.pickup_date ? `Pickup: ${eEscapeHtml(shipment.pickup_date)}<br>` : ""}
       ${eEscapeHtml(String(shipment.weight_kg))} kg`
    : `<span class="muted">Not booked yet</span>`;

  document.getElementById("slip-items-body").innerHTML = (order.items || []).map((item) => `
    <tr>
      <td>${eEscapeHtml(item.product_name)}${item.variant_label ? `<div class="muted">${eEscapeHtml(item.variant_label)}</div>` : ""}</td>
      <td>${eEscapeHtml(item.sku)}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${eFormatCurrency(item.unit_price)}</td>
      <td class="num">${eFormatCurrency(item.total_price)}</td>
    </tr>`).join("");

  document.getElementById("slip-totals").innerHTML = `
    <div><span>Subtotal</span><span>${eFormatCurrency(order.subtotal)}</span></div>
    ${Number(order.discount_amount) > 0 ? `<div><span>Discount</span><span>-${eFormatCurrency(order.discount_amount)}</span></div>` : ""}
    <div><span>Shipping</span><span>${eFormatCurrency(order.shipping_charge)}</span></div>
    <div class="grand"><span>Total</span><span>${eFormatCurrency(order.total_amount)}</span></div>`;
}
