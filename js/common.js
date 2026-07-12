// === Logout ===
// Clears session-related keys and returns to the login page.
function logout() {
  localStorage.removeItem("mintchaUser");
  localStorage.removeItem("mintchaRole");
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