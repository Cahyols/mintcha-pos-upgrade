// === common.js ===

// === Auth guard ===
// Call requireAuth() at the very top of every protected page's script
// (dashboard, order-management, sales-overview, stock-overview, stock-usage,
// menu-recipes, daily-usage-report). Centralizing this here means the check
// only has to be written once instead of copy-pasted into every page.
//
// This is a client-side-only check (no backend exists to verify against),
// so it stops accidental/careless access and casual snooping, not a
// determined attacker with dev tools open. See the note at the top of
// login.js for the honest limitation.
function requireAuth() {
  const user = localStorage.getItem("mintchaUser");
  const sessionAt = localStorage.getItem("mintchaSessionAt");

  if (!user || !sessionAt) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

// === Role guard ===
// Call requireAdmin() on top of requireAuth() for pages/sections that should
// only be reachable by an admin (e.g. if you ever split admin tools onto
// their own page instead of just hiding buttons with CSS).
function requireAdmin() {
  if (!requireAuth()) return false;
  if (localStorage.getItem("mintchaRole") !== "admin") {
    alert("Admins only.");
    window.location.href = "dashboard.html";
    return false;
  }
  return true;
}

// === Logout ===
// Clears session-related keys and returns to the login page.
function logout() {
  localStorage.removeItem("mintchaUser");
  localStorage.removeItem("mintchaRole");
  localStorage.removeItem("mintchaSessionAt");
  window.location.href = "index.html";
}

// === Hamburger sidebar toggle (site-wide, runs on every page) ===
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return; // page has no sidebar, skip

  // Toggle button — matches your existing .hamburger-btn CSS
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "hamburger-btn";
  toggleBtn.setAttribute("aria-label", "Toggle menu");
  toggleBtn.textContent = "☰";
  document.body.prepend(toggleBtn);

  // Dark overlay — matches your existing .sidebar-overlay / .show CSS
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("show");
    toggleBtn.textContent = "✕";
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
    toggleBtn.textContent = "☰";
    document.body.classList.remove("sidebar-open");
  }

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener("click", closeSidebar);

  // Auto-close after tapping a nav link (mobile UX)
  sidebar.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeSidebar);
  });

  // Reset state if resized back to desktop width
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeSidebar();
  });
});