// login.js
document.addEventListener("DOMContentLoaded", () => {
  const credentials = {
    cahyol: "1234",
    jeha: "1234",
    fatin: "1234",
    admin: "admin123"
  };

  const loginBtn = document.getElementById("loginBtn");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginError = document.getElementById("loginError");

  loginBtn?.addEventListener("click", () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (credentials[username] && credentials[username] === password) {
      // Store username
      localStorage.setItem("mintchaUser", username);

      // Determine and store role
      let role = "cashier"; // default
      if (username === "admin") {
        role = "admin";
      } else if (["cahyol", "jeha", "fatin"].includes(username)) {
        role = "cashier";
      }

      localStorage.setItem("mintchaRole", role);

      // Redirect to dashboard
      window.location.href = "dashboard.html";
    } else {
      loginError.textContent = "Invalid credentials. Please try again.";
    }
  });
});
