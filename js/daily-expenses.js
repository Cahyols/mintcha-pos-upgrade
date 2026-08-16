// === js/daily-expenses.js ===
// Debit/Credit expense tracking. Storage: localStorage "mintcha_expenses"
// (array of entries). No server sync — same as the rest of Mintcha.
//
// Entry shape:
// {
//   id, date ("YYYY-MM-DD"), time ("HH:MM"),
//   type: "debit" | "credit",
//   category, description, amount: number,
//   method: "cash" | "qr" | "claim",
//   staffName,                 // from localStorage mintchaUser at submit time
//   status: "pending" | "approved" | "rejected",
//   approvedBy, approvedAt, rejectReason
// }

const EXPENSES_KEY = "mintcha_expenses";

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return; // common.js — redirects to login if not signed in

  const user = localStorage.getItem("mintchaUser");
  const role = localStorage.getItem("mintchaRole");

  const cashierDisplay = document.getElementById("currentCashier");
  if (cashierDisplay) cashierDisplay.textContent = user || "";

  const usageLink = document.getElementById("adminStockUsageLink");
  const approvalsTabBtn = document.getElementById("approvalsTabBtn");
  if (role === "admin") {
    if (usageLink) usageLink.style.display = "list-item";
    if (approvalsTabBtn) approvalsTabBtn.style.display = "block";
  }

  function loadExpenses() {
    try { return JSON.parse(localStorage.getItem(EXPENSES_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveExpenses(list) {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(list));
  }
  function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function nowTimeStr() {
    const d = new Date();
    return d.toTimeString().slice(0, 5);
  }
  function fmtMoney(n) {
    return "RM " + (Number(n) || 0).toFixed(2);
  }
  function uid() {
    return "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }
  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1800);
  }
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  /* ---------- tabs ---------- */
  document.querySelectorAll(".exp-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "approve" && role !== "admin") return;
      document.querySelectorAll(".exp-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".exp-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "list") renderList();
      if (btn.dataset.tab === "approve") renderApprovals();
    });
  });

  /* ---------- pill selects ---------- */
  document.querySelectorAll(".pill").forEach(p => {
    p.addEventListener("click", () => {
      const group = p.querySelector("input").name;
      document.querySelectorAll(`.pill input[name=${group}]`).forEach(inp => {
        inp.closest(".pill").classList.remove("checked");
      });
      p.querySelector("input").checked = true;
      p.classList.add("checked");
    });
  });

  /* ---------- header date ---------- */
  const badge = document.getElementById("todayBadge");
  if (badge) {
    badge.textContent = new Date().toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
  }
  document.getElementById("filterDate").value = todayStr();

  /* ---------- new entry ---------- */
  document.getElementById("entryForm").addEventListener("submit", e => {
    e.preventDefault();
    const type = document.querySelector('input[name=type]:checked').value;
    const method = document.querySelector('input[name=method]:checked').value;
    const category = document.getElementById("category").value;
    const description = document.getElementById("description").value.trim();
    const amount = parseFloat(document.getElementById("amount").value);

    if (!category || !description || !amount || amount <= 0) {
      showToast("Please fill in all fields");
      return;
    }

    const entry = {
      id: uid(),
      date: todayStr(),
      time: nowTimeStr(),
      type, category, description, amount, method,
      staffName: user || "Unknown",
      status: "pending",
      approvedBy: null, approvedAt: null, rejectReason: null
    };

    const list = loadExpenses();
    list.unshift(entry);
    saveExpenses(list);

    e.target.reset();
    document.querySelectorAll(".pill").forEach(p => p.classList.remove("checked"));
    document.querySelector('.pill[data-type=debit]').classList.add("checked");
    document.querySelector('.pill[data-method=cash]').classList.add("checked");
    document.querySelector('input[value=debit]').checked = true;
    document.querySelector('input[value=cash]').checked = true;

    showToast("Entry submitted — waiting for approval");
    refreshSummary();
  });

  /* ---------- today list ---------- */
  document.getElementById("filterStatus").addEventListener("change", renderList);
  document.getElementById("filterDate").addEventListener("change", renderList);

  function renderList() {
    const status = document.getElementById("filterStatus").value;
    const date = document.getElementById("filterDate").value;
    const list = loadExpenses().filter(e => {
      if (date && e.date !== date) return false;
      if (status && e.status !== status) return false;
      return true;
    });

    const c = document.getElementById("listContainer");
    if (!list.length) {
      c.innerHTML = `<div class="exp-empty"><span class="big">🗒️</span>No entries for this filter</div>`;
      return;
    }

    c.innerHTML = list.map(e => `
      <div class="exp-entry">
        <div class="exp-entry-top">
          <div>
            <div class="exp-entry-desc">${escapeHtml(e.description)}</div>
            <div class="exp-entry-meta">${e.time} · ${escapeHtml(e.staffName)}</div>
          </div>
          <div class="exp-entry-amt ${e.type}">${e.type === "debit" ? "-" : "+"}${fmtMoney(e.amount)}</div>
        </div>
        <div class="exp-tags">
          <span class="exp-tag category">${escapeHtml(e.category)}</span>
          <span class="exp-tag method">${e.method.toUpperCase()}</span>
          <span class="exp-tag status-${e.status}">${e.status}</span>
        </div>
        ${e.status === "rejected" && e.rejectReason ? `<div class="exp-entry-meta" style="margin-top:6px;">Reason: ${escapeHtml(e.rejectReason)}</div>` : ""}
        ${e.status === "approved" ? `<div class="exp-entry-meta" style="margin-top:6px;">Approved by ${escapeHtml(e.approvedBy || "-")}</div>` : ""}
        ${(e.status === "pending" && (role === "admin" || e.staffName === user)) ? `<div style="margin-top:10px;"><button class="btn-danger-sm" onclick="window.__deleteExpense('${e.id}')">Delete</button></div>` : ""}
      </div>
    `).join("");
  }

  window.__deleteExpense = function (id) {
    let list = loadExpenses();
    list = list.filter(e => e.id !== id);
    saveExpenses(list);
    renderList();
    refreshSummary();
    showToast("Entry deleted");
  };

  /* ---------- approvals (admin only) ---------- */
  function renderApprovals() {
    if (role !== "admin") return;
    const list = loadExpenses().filter(e => e.status === "pending");
    const c = document.getElementById("approveContainer");
    if (!list.length) {
      c.innerHTML = `<div class="exp-empty"><span class="big">✅</span>No entries waiting for approval</div>`;
      return;
    }
    c.innerHTML = list.map(e => `
      <div class="exp-entry">
        <div class="exp-entry-top">
          <div>
            <div class="exp-entry-desc">${escapeHtml(e.description)}</div>
            <div class="exp-entry-meta">${e.date} ${e.time} · ${escapeHtml(e.staffName)}</div>
          </div>
          <div class="exp-entry-amt ${e.type}">${e.type === "debit" ? "-" : "+"}${fmtMoney(e.amount)}</div>
        </div>
        <div class="exp-tags">
          <span class="exp-tag category">${escapeHtml(e.category)}</span>
          <span class="exp-tag method">${e.method.toUpperCase()}</span>
        </div>
        <div class="exp-approve-row">
          <button class="btn-approve" onclick="window.__approveExpense('${e.id}')">Approve</button>
          <button class="btn-reject" onclick="window.__toggleReject('${e.id}')">Reject</button>
        </div>
        <div class="exp-reject-box" id="reject-${e.id}">
          <input type="text" id="reject-reason-${e.id}" placeholder="Reason for rejection">
          <button class="btn-reject" style="margin-top:8px;width:100%;" onclick="window.__rejectExpense('${e.id}')">Confirm reject</button>
        </div>
      </div>
    `).join("");
  }

  window.__approveExpense = function (id) {
    const list = loadExpenses();
    const e = list.find(x => x.id === id);
    if (!e) return;
    e.status = "approved";
    e.approvedBy = user;
    e.approvedAt = new Date().toISOString();
    saveExpenses(list);
    renderApprovals();
    refreshSummary();
    showToast("Entry approved");
  };

  window.__toggleReject = function (id) {
    document.getElementById("reject-" + id).classList.toggle("show");
  };

  window.__rejectExpense = function (id) {
    const reason = document.getElementById("reject-reason-" + id).value.trim();
    if (!reason) {
      showToast("Enter a reason for rejection");
      return;
    }
    const list = loadExpenses();
    const e = list.find(x => x.id === id);
    if (!e) return;
    e.status = "rejected";
    e.approvedBy = user;
    e.approvedAt = new Date().toISOString();
    e.rejectReason = reason;
    saveExpenses(list);
    renderApprovals();
    refreshSummary();
    showToast("Entry rejected");
  };

  /* ---------- summary ---------- */
  function refreshSummary() {
    const today = todayStr();
    const list = loadExpenses().filter(e => e.date === today);
    const approved = list.filter(e => e.status === "approved");
    const debit = approved.filter(e => e.type === "debit").reduce((s, e) => s + e.amount, 0);
    const credit = approved.filter(e => e.type === "credit").reduce((s, e) => s + e.amount, 0);
    const cashOut = approved.filter(e => e.type === "debit" && e.method === "cash").reduce((s, e) => s + e.amount, 0);
    const pendingCount = list.filter(e => e.status === "pending").length;

    document.getElementById("sumDebit").textContent = fmtMoney(debit);
    document.getElementById("sumCredit").textContent = fmtMoney(credit);
    document.getElementById("sumCashOut").textContent = fmtMoney(cashOut);
    document.getElementById("sumPendingCount").textContent = pendingCount;

    const pendingBadge = document.getElementById("pendingBadge");
    if (pendingBadge) {
      if (pendingCount > 0 && role === "admin") {
        pendingBadge.style.display = "inline-block";
        pendingBadge.textContent = pendingCount;
      } else {
        pendingBadge.style.display = "none";
      }
    }
  }

  // Keep in sync if changed from another tab
  window.addEventListener("storage", (e) => {
    if (e.key === EXPENSES_KEY) {
      refreshSummary();
      renderList();
      if (role === "admin") renderApprovals();
    }
  });

  /* ---------- init ---------- */
  refreshSummary();
  renderList();
  if (role === "admin") renderApprovals();
});