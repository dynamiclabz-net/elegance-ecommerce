// ─────────────────────────────────────────────
// Elegance — shared customer-facing front-end utilities.
// Loaded on every customer page (home, shop, cart, checkout,
// product detail, account, ...), right after api_caller.js.
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
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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

// Extracts a readable error message from a callApi() failure/result payload.
function eExtractError(result, fallback = "Something went wrong. Please try again.") {
  if (!result) return fallback;
  if (typeof result === "string") return result;
  if (result.error) {
    if (typeof result.error === "string") return result.error;
    // DRF serializer error dict -> first message.
    const firstKey = Object.keys(result.error)[0];
    if (firstKey) {
      const val = result.error[firstKey];
      return Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
    }
  }
  if (result.detail) return result.detail;
  return fallback;
}

// Returns the initials (up to 2 letters) used for the profile avatar.
function eInitials(firstName, lastName, fallback) {
  const a = (firstName || "").trim();
  const b = (lastName || "").trim();
  if (a || b) {
    return `${a.charAt(0)}${b.charAt(0)}`.toUpperCase() || a.charAt(0).toUpperCase();
  }
  return (fallback || "?").charAt(0).toUpperCase();
}

// Refreshes the header cart-badge count on every customer-facing page.
// Works for both guests (session cart) and logged-in users.
async function eRefreshCartBadge(cartApiUrl) {
  try {
    const [success, result] = await callApi("GET", cartApiUrl, null, "");
    const badge = document.querySelector(".cart-badge");
    if (!badge) return;
    const count = success && result.success ? result.data.cart.total_items || 0 : 0;
    badge.textContent = count > 0 ? count : "";
    badge.setAttribute("data-count", String(count));
  } catch (err) {
    console.log("[v0] cart badge refresh failed", err);
  }
}
