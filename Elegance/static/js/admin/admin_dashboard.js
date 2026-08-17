// ─────────────────────────────────────────────
// admin-dashboard.html
// ─────────────────────────────────────────────
let _dashCfg = null;

const STATUS_META = {
  placed: { label: "Placed", badge: "info", icon: "bi-bag-check" },
  processing: { label: "Processing", badge: "warning", icon: "bi-gear" },
  out_for_delivery: { label: "Out for Delivery", badge: "info", icon: "bi-truck" },
  delivered: { label: "Delivered", badge: "success", icon: "bi-check-circle" },
  cancelled: { label: "Cancelled", badge: "danger", icon: "bi-x-circle" },
};

function AdminDashboardInit(config) {
  _dashCfg = config;
  loadDashboard();
}

async function loadDashboard() {
  const [success, result] = await callApi(
    "GET",
    _dashCfg.ordersApiUrl + "?page_size=6",
    null,
    _dashCfg.csrfToken
  );

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not load dashboard data."), "danger");
    return;
  }

  const { orders, stats } = result.data;
  renderStatTiles(stats);
  renderPipeline(stats);
  renderRecentOrders(orders);
}

function renderStatTiles(stats) {
  const tiles = [
    { key: "total_orders", label: "Total Orders", icon: "bi-receipt", tint: "var(--e-primary-tint)", color: "var(--e-primary)" },
    { key: "placed", label: "New / Placed", icon: "bi-bag-check", tint: "var(--e-info-tint)", color: "var(--e-info)" },
    { key: "processing", label: "Processing", icon: "bi-gear", tint: "var(--e-warning-tint)", color: "var(--e-warning)" },
    { key: "delivered", label: "Delivered", icon: "bi-check-circle", tint: "var(--e-success-tint)", color: "var(--e-success)" },
  ];

  const html = tiles.map(t => `
    <div class="col-sm-6 col-lg-3">
      <div class="e-stat">
        <div class="icon-wrap" style="background:${t.tint};color:${t.color};">
          <i class="bi ${t.icon}"></i>
        </div>
        <div class="label">${t.label}</div>
        <div class="value">${stats[t.key] ?? 0}</div>
      </div>
    </div>
  `).join("");

  document.getElementById("stat-tiles").innerHTML = html;
}

function renderPipeline(stats) {
  const order = ["placed", "processing", "out_for_delivery", "delivered", "cancelled"];
  const total = order.reduce((sum, key) => sum + (stats[key] || 0), 0) || 1;

  const html = order.map(key => {
    const meta = STATUS_META[key];
    const count = stats[key] || 0;
    const pct = Math.round((count / total) * 100);
    return `
      <div>
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span style="font-size:13px;font-weight:500;"><i class="bi ${meta.icon} me-1"></i>${meta.label}</span>
          <span class="e-badge ${meta.badge}">${count}</span>
        </div>
        <div style="height:6px;border-radius:99px;background:var(--e-surface-muted);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:var(--e-primary);"></div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("order-pipeline").innerHTML = html;
}

function renderRecentOrders(orders) {
  const tbody = document.getElementById("recent-orders-body");

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="e-empty"><i class="bi bi-inbox d-block"></i><p>No orders yet.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(order => {
    const meta = STATUS_META[order.order_status] || { label: order.order_status, badge: "muted" };
    const detailUrl = _dashCfg.orderDetailUrlTemplate.replace("/0/", `/${order.id}/`);
    return `
      <tr style="cursor:pointer;" onclick="window.location.href='${detailUrl}'">
        <td><strong>${eEscapeHtml(order.order_number)}</strong></td>
        <td>${eEscapeHtml(order.shipping_full_name || "—")}</td>
        <td>${eFormatCurrency(order.total_amount)}</td>
        <td><span class="e-badge muted">${eEscapeHtml(order.payment_method || "—")}</span></td>
        <td><span class="e-badge ${meta.badge}">${meta.label}</span></td>
        <td>${eFormatDate(order.placed_at)}</td>
      </tr>
    `;
  }).join("");
}
