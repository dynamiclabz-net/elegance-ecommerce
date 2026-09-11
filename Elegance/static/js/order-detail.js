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
    if (order.tracking_id) {
      section.style.display = "block";
      text.innerHTML = `
        ${order.courier_partner ? `Courier: <strong>${eEscapeHtml(order.courier_partner)}</strong><br>` : ""}
        Tracking No: <strong>${eEscapeHtml(order.tracking_id)}</strong>
        ${order.tracking_url ? `<br><a href="${order.tracking_url}" target="_blank" rel="noopener">Track Shipment <i class="fas fa-external-link-alt"></i></a>` : ""}
      `;
    } else {
      section.style.display = "none";
    }
  }

  function renderSummary(order) {
    document.getElementById("odSubtotal").textContent = money(order.subtotal);
    document.getElementById("odShipping").textContent = Number(order.shipping_charge) > 0 ? money(order.shipping_charge) : "Free";
    document.getElementById("odTotal").textContent = money(order.total_amount);

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
    contentEl.style.display = "block";
  }

  loadOrder();
}
