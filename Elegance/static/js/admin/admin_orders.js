// ─────────────────────────────────────────────
// admin-orders.html — order listing + filters
// ─────────────────────────────────────────────
let _ordCfg = null;
let _ordState = { page: 1, pageSize: 20, totalCount: 0 };

const ORDER_STATUS_META = {
  placed: { label: "Placed", badge: "info" },
  confirmed: { label: "Confirmed", badge: "info" },
  processing: { label: "Processing", badge: "warning" },
  shipped: { label: "Shipped", badge: "warning" },
  out_for_delivery: { label: "Out for Delivery", badge: "warning" },
  delivered: { label: "Delivered", badge: "success" },
  cancelled: { label: "Cancelled", badge: "danger" },
  returned: { label: "Returned", badge: "danger" },
};

function AdminOrdersInit(config) {
  _ordCfg = config;

  document.getElementById("filter-search").addEventListener("input", debounceOrdersReload);
  document.getElementById("filter-order-status").addEventListener("change", () => reloadOrders(1));
  document.getElementById("filter-payment-method").addEventListener("change", () => reloadOrders(1));
  document.getElementById("filter-clear-btn").addEventListener("click", clearOrderFilters);
  document.getElementById("prev-page-btn").addEventListener("click", () => reloadOrders(_ordState.page - 1));
  document.getElementById("next-page-btn").addEventListener("click", () => reloadOrders(_ordState.page + 1));

  reloadOrders(1);
}

let _ordDebounce = null;
function debounceOrdersReload() {
  clearTimeout(_ordDebounce);
  _ordDebounce = setTimeout(() => reloadOrders(1), 350);
}

function clearOrderFilters() {
  document.getElementById("filter-search").value = "";
  document.getElementById("filter-order-status").value = "";
  document.getElementById("filter-payment-method").value = "";
  reloadOrders(1);
}

async function reloadOrders(page) {
  _ordState.page = Math.max(1, page);

  const params = { page: _ordState.page, page_size: _ordState.pageSize };

  const search = document.getElementById("filter-search").value.trim();
  if (search) params.search = search;

  const orderStatus = document.getElementById("filter-order-status").value;
  if (orderStatus) params.order_status = orderStatus;

  const paymentMethod = document.getElementById("filter-payment-method").value;
  if (paymentMethod) params.payment_method = paymentMethod;

  const url = `${_ordCfg.ordersApiUrl}?${toQueryString(params)}`;
  const tbody = document.getElementById("orders-body");
  tbody.innerHTML = eSkeletonRow(8) + eSkeletonRow(8) + eSkeletonRow(8);

  const [success, result] = await callApi("GET", url, null, _ordCfg.csrfToken);

  if (!success || !result.success) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="e-empty"><p>Could not load orders.</p></div></td></tr>`;
    return;
  }

  const { orders, total_count } = result.data;
  _ordState.totalCount = total_count;
  renderOrders(orders);
  renderOrdersPagination();
}

function renderOrders(orders) {
  const tbody = document.getElementById("orders-body");
  document.getElementById("orders-count").textContent = `${_ordState.totalCount} order${_ordState.totalCount === 1 ? "" : "s"}`;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="e-empty"><i class="bi bi-receipt d-block"></i><p>No orders found.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map((o) => {
    const meta = ORDER_STATUS_META[o.order_status] || { label: o.order_status, badge: "muted" };
    const detailUrl = _ordCfg.orderDetailUrlTemplate.replace("/0/", `/${o.id}/`);
    return `
      <tr style="cursor:pointer;" onclick="window.location.href='${detailUrl}'">
        <td><strong>${eEscapeHtml(o.order_number)}</strong></td>
        <td>
          ${eEscapeHtml(o.customer_name || "—")}
          <div class="text-muted" style="font-size:11.5px;">${eEscapeHtml(o.shipping_mobile || "")}</div>
        </td>
        <td>${o.item_count}</td>
        <td>${eFormatCurrency(o.total_amount)}</td>
        <td><span class="e-badge muted">${eEscapeHtml(o.payment_method_display || o.payment_method)}</span></td>
        <td><span class="e-badge ${meta.badge}">${meta.label}</span></td>
        <td>${eFormatDate(o.placed_at)}</td>
        <td class="text-end"><a class="btn-e-icon" href="${detailUrl}"><i class="bi bi-arrow-right"></i></a></td>
      </tr>
    `;
  }).join("");
}

function renderOrdersPagination() {
  const { page, pageSize, totalCount } = _ordState;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  document.getElementById("pagination-info").textContent =
    totalCount === 0 ? "" : `Showing ${start}–${end} of ${totalCount}`;
  document.getElementById("prev-page-btn").disabled = page <= 1;
  document.getElementById("next-page-btn").disabled = end >= totalCount;
}
