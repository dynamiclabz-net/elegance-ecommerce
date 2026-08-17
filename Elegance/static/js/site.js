// ─────────────────────────────────────────────
// Elegance — shared header/footer interactions.
// Included on every customer page via frontend/includes/header.html.
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
  /* ── MOBILE MENU TOGGLE ── */
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("navLinks");

  if (hamburger && navLinks) {
    hamburger.addEventListener("click", function () {
      navLinks.classList.toggle("nav-links-open");
    });
  }

  /* ── MOBILE MEGA-MENU TOGGLE ── */
  document.querySelectorAll(".nav-item-dropdown > .nav-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      if (window.innerWidth > 900) return;
      e.preventDefault();
      this.closest(".nav-item-dropdown").classList.toggle("mega-open");
    });
  });

  /* ── SEARCH BAR TOGGLE ── */
  const searchToggle = document.getElementById("searchToggle");
  const searchBar = document.getElementById("searchBar");
  const searchClose = document.getElementById("searchClose");
  const searchInput = document.getElementById("searchInput");

  if (searchToggle && searchBar) {
    searchToggle.addEventListener("click", function () {
      searchBar.classList.toggle("search-bar-open");
      if (searchBar.classList.contains("search-bar-open") && searchInput) {
        searchInput.focus();
      }
    });
  }

  if (searchClose && searchBar) {
    searchClose.addEventListener("click", function () {
      searchBar.classList.remove("search-bar-open");
    });
  }

  /* ── NEWSLETTER FORM (footer) ── */
  const newsletterBtn = document.querySelector(".footer-newsletter button");
  if (newsletterBtn) {
    newsletterBtn.addEventListener("click", function () {
      const input = this.closest(".footer-newsletter").querySelector("input");
      const email = (input.value || "").trim();
      if (!email) {
        eToast("Please enter your email address.", "danger");
        return;
      }
      eToast("Thanks for subscribing!", "success");
      input.value = "";
    });
  }
});
