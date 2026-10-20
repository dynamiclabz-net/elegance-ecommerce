// order-detail.js — customer-facing order detail / tracking page.
// Loaded after api_caller.js + frontend_utils.js. Exposes OrderDetailPageInit(config).

function OrderDetailPageInit(config) {
  const { csrfToken, myOrderApiUrl } = config;

  const STEP_FLOW = ["placed", "confirmed", "shipped", "out_for_delivery", "delivered"];
  const STEP_ICONS = { placed: "fa-file-alt", confirmed: "fa-check", shipped: "fa-box", out_for_delivery: "fa-truck", delivered: "fa-home" };
  const STEP_LABELS = { placed: "Placed", confirmed: "Confirmed", shipped: "Shipped", out_for_delivery: "Out for Delivery", delivered: "Delivered" };

  function money(v) {
    const n = Number(v || 0);
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  function renderTimeline(order) {
    const wrap = document.getElementById("odTimeline");
    if (!wrap) return;

    if (order.order_status === "cancelled" || order.order_status === "returned") {
      wrap.classList.add("is-cancelled");
      wrap.innerHTML = `
        <div class="od-tl-step is-current is-cancel">
          <div class="od-tl-dot"><i class="fas fa-times"></i></div>
          <div class="od-tl-label">${order.order_status === "cancelled" ? "Order Cancelled" : "Order Returned"}</div>
        </div>`;
      return;
    }

    const currentIdx = STEP_FLOW.indexOf(order.order_status);
    wrap.innerHTML = STEP_FLOW.map((step, idx) => {
      const state = idx < currentIdx ? "is-done" : idx === currentIdx ? "is-current" : "";
      const icon = idx <= currentIdx ? `<i class="fas ${STEP_ICONS[step]}"></i>` : idx + 1;
      return `
        <div class="od-tl-step ${state}">
          <div class="od-tl-dot">${icon}</div>
          <div class="od-tl-label">${STEP_LABELS[step]}</div>
        </div>`;
    }).join("");
  }

  function renderItems(order) {
    const wrap = document.getElementById("odItemsList");
    if (!wrap) return;
    wrap.innerHTML = (order.items || []).map((item) => `
      <div class="od-item-row">
        <div class="od-item-img"><img src="${item.image_url || "/static/images/placeholder-product.png"}" alt="${eEscapeHtml(item.product_name)}" crossorigin="anonymous"></div>
        <div class="od-item-info">
          <p class="od-item-name">${eEscapeHtml(item.product_name)}</p>
          <p class="od-item-meta">${item.variant_label ? eEscapeHtml(item.variant_label) + " · " : ""}Qty ${item.quantity}</p>
        </div>
        <div class="od-item-price">${money(item.total_price)}</div>
      </div>
    `).join("");
  }

  function renderAddress(order) {
    const wrap = document.getElementById("odAddressText");
    if (!wrap) return;
    wrap.innerHTML = `
      <strong>${eEscapeHtml(order.shipping_full_name)}</strong><br>
      ${eEscapeHtml(order.shipping_address_line1)}${order.shipping_address_line2 ? ", " + eEscapeHtml(order.shipping_address_line2) : ""}<br>
      ${eEscapeHtml(order.shipping_city)}, ${eEscapeHtml(order.shipping_state)} ${eEscapeHtml(order.shipping_pincode)}<br>
      ${eEscapeHtml(order.shipping_country || "India")}<br>
      Mobile: ${eEscapeHtml(order.shipping_mobile)}
    `;
  }

  function renderTracking(order) {
    const section = document.getElementById("odTrackingSection");
    const text = document.getElementById("odTrackingText");
    if (!section || !text) return;
    const eventsEl = document.getElementById("odTrackingEvents");
    const shipment = order.shipment;
    const closed = ["cancelled", "returned"].includes(order.order_status);

    if (shipment && shipment.status !== "cancelled" && shipment.status !== "failed" && !closed) {
      const courier = shipment.courier_name || shipment.provider_display;
      const eta = shipment.estimated_delivery
        ? new Date(shipment.estimated_delivery).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
        : "";
      const pickup = shipment.pickup_date
        ? new Date(shipment.pickup_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        : "";
      section.style.display = "block";
      text.innerHTML = `
        <strong>${eEscapeHtml(shipment.status_display)}</strong>
        ${shipment.last_status_text && shipment.last_status_text !== shipment.status_display ? ` - ${eEscapeHtml(shipment.last_status_text)}` : ""}<br>
        ${shipment.is_manual ? "Delivered by" : "Courier"}: <strong>${eEscapeHtml(courier)}</strong><br>
        ${shipment.awb_code ? `${shipment.is_manual ? "Reference" : "Tracking No"}: <strong>${eEscapeHtml(shipment.awb_code)}</strong><br>` : ""}
        ${pickup && ["booked", "pickup_scheduled"].includes(shipment.status) ? `Pickup scheduled: ${eEscapeHtml(pickup)}<br>` : ""}
        ${eta ? `Expected delivery: <strong>${eEscapeHtml(eta)}</strong><br>` : ""}
        ${isSafeUrl(shipment.tracking_url) ? `<a href="${eEscapeHtml(shipment.tracking_url)}" target="_blank" rel="noopener">Track on courier site <i class="fas fa-external-link-alt"></i></a>` : ""}
      `;
      eventsEl.innerHTML = (shipment.events || []).map((ev) => `
        <li>
          <span class="od-track-activity">${eEscapeHtml(ev.activity || ev.status_display)}</span>
          <span class="od-track-meta">${new Date(ev.occurred_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${ev.location ? " · " + eEscapeHtml(ev.location) : ""}</span>
        </li>`).join("");
    } else if (order.tracking_id && !closed) {
      section.style.display = "block";
      text.innerHTML = `
        ${order.courier_partner ? `Courier: <strong>${eEscapeHtml(order.courier_partner)}</strong><br>` : ""}
        Tracking No: <strong>${eEscapeHtml(order.tracking_id)}</strong>
        ${isSafeUrl(order.tracking_url) ? `<br><a href="${eEscapeHtml(order.tracking_url)}" target="_blank" rel="noopener">Track Shipment <i class="fas fa-external-link-alt"></i></a>` : ""}
      `;
      eventsEl.innerHTML = "";
    } else {
      section.style.display = "none";
      eventsEl.innerHTML = "";
    }
  }

  function isSafeUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  function row(label, value) {
    return `<div class="cs-row"><span>${label}</span><span>${value}</span></div>`;
  }

  function shippingText(order) {
    return Number(order.shipping_charge) > 0 ? money(order.shipping_charge) : "Free";
  }

  /* Orders placed before GST was captured have no tax split, so they keep the plain breakup. */
  function breakupHtml(order) {
    const s = order.price_summary;
    if (!s || !s.tax_computed) {
      return (
        row("Subtotal", money(order.subtotal)) +
        (Number(order.discount_amount) > 0 ? row("Discount", "-" + money(order.discount_amount)) : "") +
        row("Shipping", shippingText(order))
      );
    }

    const gstRows = s.is_igst
      ? row("IGST", money(s.igst_amount))
      : row("CGST", money(s.cgst_amount)) + row("SGST", money(s.sgst_amount));

    return (
      row("Price (excl. GST)", money(s.basic_value)) +
      (Number(s.discount) > 0 ? row("Discount", "-" + money(s.discount_excl_gst)) : "") +
      row("Taxable value", money(s.taxable_amount)) +
      gstRows +
      row("Shipping", shippingText(order)) +
      (Math.abs(Number(s.round_off)) >= 0.005 ? row("Round off", money(s.round_off)) : "")
    );
  }

  function renderSummary(order) {
    document.getElementById("odBreakup").innerHTML = breakupHtml(order);
    document.getElementById("odTotal").textContent = money(order.total_amount);

    const invoiceLink = document.getElementById("odInvoiceLink");
    if (invoiceLink && order.invoice_url) {
      invoiceLink.href = order.invoice_url;
      invoiceLink.style.display = "flex";
    }

    const advanceRow = document.getElementById("odAdvanceRow");
    const balanceRow = document.getElementById("odBalanceRow");
    if (order.is_cod && Number(order.cod_advance_amount) > 0) {
      advanceRow.style.display = "flex";
      document.getElementById("odAdvance").textContent = money(order.cod_advance_amount);
      balanceRow.style.display = "flex";
      document.getElementById("odBalance").textContent = money(order.cod_balance_amount);
    } else {
      advanceRow.style.display = "none";
      balanceRow.style.display = "none";
    }

    document.getElementById("odPaymentMethod").textContent = order.payment_method_display || (order.is_cod ? "Cash on Delivery" : "Online Payment");
    const payStatus = document.getElementById("odPaymentStatus");
    payStatus.textContent = order.payment_status_display || order.payment_status;
    payStatus.className = "od-payment-status pay-" + order.payment_status;

    const whatsappLink = document.getElementById("odWhatsappLink");
    if (whatsappLink) {
      const productNames = (order.items || []).map((item) => item.product_name).filter(Boolean).join(", ");
      const statusText = order.order_status_display || order.order_status;
      const message = `Hi, I need help with my order #${order.order_number}` +
        (productNames ? ` (${productNames})` : "") +
        ` — current status: ${statusText}.`;
      whatsappLink.href = `https://wa.me/9054413199?text=${encodeURIComponent(message)}`;
      whatsappLink.style.display = "flex";
    }
  }

  const PAYMENT_STATUS_LABELS = { success: "Paid", failed: "Failed", pending: "Pending" };

  function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function paymentItemHtml(payment) {
    const label = PAYMENT_STATUS_LABELS[payment.status] || payment.status_display || payment.status;
    const method = payment.method_detail || payment.method;
    const lines = [];
    if (method) lines.push(`<span>${eEscapeHtml(method)}</span>`);
    if (payment.razorpay_payment_id) lines.push(`<span>Payment ID: ${eEscapeHtml(payment.razorpay_payment_id)}</span>`);
    const when = payment.paid_at || payment.created_at;
    if (when) lines.push(`<span>${eEscapeHtml(formatDateTime(when))}</span>`);
    if (payment.status === "failed" && payment.error_description) {
      lines.push(`<span class="od-pay-error">${eEscapeHtml(payment.error_description)}</span>`);
    }

    return `
      <li class="od-pay-item">
        <div class="od-pay-item-top">
          <strong>${eEscapeHtml(payment.payment_type_display || "Payment")} &middot; ${money(payment.amount)}</strong>
          <span class="od-pay-badge pay-${eEscapeHtml(payment.status)}">${eEscapeHtml(label)}</span>
        </div>
        <div class="od-pay-item-meta">${lines.join("")}</div>
      </li>`;
  }

  async function startPayment() {
    const button = document.getElementById("odPayBtn");
    const text = document.getElementById("odPayBtnText");
    const originalText = text.textContent;
    button.disabled = true;
    text.textContent = "Opening payment…";

    const restore = () => {
      button.disabled = false;
      text.textContent = originalText;
    };

    const [ok, result] = await callApi("POST", config.orderPaymentApiUrl, { order_id: config.orderId }, csrfToken);
    if (!ok || !result.success) {
      restore();
      eToast(eExtractError(result, "Could not start the payment. Please try again."), "error");
      return;
    }

    const opened = await window.EleganceRazorpay.open(result.data.razorpay, { onDismiss: restore });
    if (!opened) restore();
  }

  function renderPayments(order) {
    const payments = order.payments || [];
    const listEl = document.getElementById("odPayments");
    listEl.style.display = payments.length ? "" : "none";
    document.getElementById("odPaymentList").innerHTML = payments.map(paymentItemHtml).join("");

    const due = order.payment_due || {};
    const box = document.getElementById("odPayBox");
    const cancelled = order.order_status === "cancelled";
    if (!due.can_pay || cancelled) {
      box.style.display = "none";
      return;
    }

    box.style.display = "";
    document.getElementById("odPayDue").textContent = order.is_cod
      ? `Advance of ${money(due.amount)} is pending.`
      : `Payment of ${money(due.amount)} is pending.`;
    document.getElementById("odPayBtnText").textContent = `${due.label} ${money(due.amount)}`;
  }

  function renderHeader(order) {
    document.getElementById("odOrderNumber").textContent = "#" + order.order_number;
    document.getElementById("odPlacedDate").textContent = "Placed on " + new Date(order.placed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    const statusBadge = document.getElementById("odStatusBadge");
    statusBadge.textContent = order.order_status_display || order.order_status;
    statusBadge.className = "od-status-badge status-" + order.order_status;
  }

  async function loadOrder() {
    const loadingEl = document.getElementById("odLoadingState");
    const errorEl = document.getElementById("odErrorState");
    const contentEl = document.getElementById("odContent");

    loadingEl.style.display = "block";
    errorEl.style.display = "none";
    contentEl.style.display = "none";

    const [success, result] = await callApi("GET", myOrderApiUrl, null, csrfToken);
    loadingEl.style.display = "none";

    if (!success || !result.success) {
      errorEl.style.display = "block";
      document.getElementById("odErrorMsg").textContent = (result && result.error) || "We couldn't load this order.";
      return;
    }

    const order = result.data.order;
    renderHeader(order);
    renderTimeline(order);
    renderItems(order);
    renderAddress(order);
    renderTracking(order);
    renderSummary(order);
    renderPayments(order);
    contentEl.style.display = "block";
  }

  document.getElementById("odPayBtn").addEventListener("click", startPayment);
  window.EleganceRazorpay.preload().catch(() => {});
  loadOrder();
}
