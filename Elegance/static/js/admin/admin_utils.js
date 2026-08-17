// ─────────────────────────────────────────────
// Elegance Admin — shared front-end utilities
// Loaded on every admin page, after api_caller.js
// ─────────────────────────────────────────────

function getCSRFToken() {
  const name = "csrftoken";
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.startsWith(name + "=")) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return null;
}

function eToast(message, type = "success") {
  let stack = document.getElementById("e-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "e-toast-stack";
    document.body.appendChild(stack);
  }
  const toast = document.createElement("div");
  toast.className = `e-toast ${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.2s";
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

function eFormatCurrency(value) {
  const num = Number(value || 0);
  return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function eFormatDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function eEscapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function eConfirmAction(message) {
  return window.confirm(message);
}

function eSkeletonRow(cols) {
  let cells = "";
  for (let i = 0; i < cols; i++) {
    cells += `<td><div class="e-skeleton" style="height:14px;width:${60 + Math.random() * 40}%;"></div></td>`;
  }
  return `<tr>${cells}</tr>`;
}

// Extracts a readable error message from a callApi() failure/result payload.
function eExtractError(result, fallback = "Something went wrong. Please try again.") {
  if (!result) return fallback;
  if (typeof result === "string") return result;
  if (result.error) return result.error;
  if (result.detail) return result.detail;
  return fallback;
}

// Global logout wired on every admin page's sidebar footer button.
async function eAdminLogout(logoutUrl, redirectUrl) {
  const csrf = getCSRFToken();
  await callApi("POST", logoutUrl, {}, csrf);
  window.location.href = redirectUrl;
}
