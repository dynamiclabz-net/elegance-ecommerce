// ─────────────────────────────────────────────
// admin-login.html
// ─────────────────────────────────────────────
let _adminLoginCfg = null;

function AdminLoginInit(config) {
  _adminLoginCfg = config;

  const form = document.getElementById("admin-login-form");
  form.addEventListener("submit", handleAdminLoginSubmit);
}

async function handleAdminLoginSubmit(e) {
  e.preventDefault();

  const alertBox = document.getElementById("login-alert");
  alertBox.style.display = "none";

  const contact_number = document.getElementById("contact_number").value.trim();
  const password = document.getElementById("password").value;

  if (!contact_number || !password) {
    alertBox.textContent = "Please enter both contact number and password.";
    alertBox.style.display = "block";
    return;
  }

  const btn = document.getElementById("login-submit-btn");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Signing in...";

  const [success, result] = await callApi(
    "POST",
    _adminLoginCfg.loginApiUrl,
    { contact_number, password },
    _adminLoginCfg.csrfToken
  );

  btn.disabled = false;
  btn.textContent = originalLabel;

  if (!success || !result.success) {
    alertBox.textContent = eExtractError(result, "Invalid contact number or password.");
    alertBox.style.display = "block";
    return;
  }

  window.location.href = _adminLoginCfg.dashboardUrl;
}
