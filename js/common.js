// common.js
document.addEventListener("DOMContentLoaded", () => {
  const user = localStorage.getItem("mintchaUser");
  const loggedUserSpan = document.getElementById("loggedUser");

  if (!user && window.location.pathname !== "/index.html") {
    window.location.href = "index.html";
  }

  if (loggedUserSpan) {
    loggedUserSpan.textContent = user;
  }

  window.logout = function () {
    localStorage.removeItem("mintchaUser");
    window.location.href = "index.html";
  };
});

