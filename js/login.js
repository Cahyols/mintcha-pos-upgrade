// login.js
//
// ⚠️ HONEST LIMITATION: this app has no backend/server, so this can never be
// "real" security — anyone with browser dev tools could still bypass a
// client-side check if they really wanted to (e.g. by typing a command into
// the console). What THIS rewrite fixes is the much easier problem: your old
// version stored every password in plain, readable text right inside this
// file, so literally opening login.js (or view-source) handed out the whole
// password list. Now only SHA-256 hashes are stored, so casually opening the
// file doesn't reveal anyone's actual password.
//
// If you ever want *real* protection (can't be bypassed via dev tools at
// all), that requires a server of some kind to check credentials — happy to
// help set that up later if this app grows to need it.

// To change a password: open any browser console and run
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourNewPassword"))
//     .then(buf => console.log([...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("")))
// then paste the printed hash below.
const USERS = {
  cahyol: { hash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", role: "cashier" },
  jeha:   { hash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", role: "cashier" },
  fatin:  { hash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", role: "cashier" },
  admin:  { hash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9", role: "admin" }
};

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Very small login-attempt throttle so a script can't just hammer the form
// hundreds of times a second. Not a substitute for real security — just
// removes the laziest brute-force path.
let failedAttempts = 0;
let lockoutUntil = 0;

document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginError = document.getElementById("loginError");

  async function attemptLogin() {
    const now = Date.now();
    if (now < lockoutUntil) {
      const secsLeft = Math.ceil((lockoutUntil - now) / 1000);
      loginError.textContent = `Too many attempts. Try again in ${secsLeft}s.`;
      return;
    }

    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    loginError.textContent = "";

    const user = USERS[username];
    const enteredHash = await sha256Hex(password);

    if (user && enteredHash === user.hash) {
      failedAttempts = 0;
      localStorage.setItem("mintchaUser", username);
      localStorage.setItem("mintchaRole", user.role);
      // Session marker checked by requireAuth() in common.js on every
      // protected page, so a bare localStorage.setItem("mintchaUser", "x")
      // typed into a console alone won't get past requireAuth.
      localStorage.setItem("mintchaSessionAt", String(Date.now()));
      window.location.href = "dashboard.html";
    } else {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockoutUntil = Date.now() + 30_000; // 30s cooldown after 5 bad attempts
        loginError.textContent = "Too many failed attempts. Try again in 30s.";
      } else {
        loginError.textContent = "Invalid credentials. Please try again.";
      }
    }
  }

  loginBtn?.addEventListener("click", attemptLogin);

  // Let Enter key submit from either field too
  [usernameInput, passwordInput].forEach(input => {
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") attemptLogin();
    });
  });
});