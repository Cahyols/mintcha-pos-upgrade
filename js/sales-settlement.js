// === js/sales-settlement.js ===
// Reads:  localStorage "mintcha_sales"     (written by order-management.js / sales-overview.js)
//         localStorage "mintcha_expenses"  (written by daily-expenses.js)
// Writes: localStorage "mintcha_settlements" (array of settlement records)
// Financial/closing page — admin only (same convention as coffee-traps.html).

const SALES_KEY = "mintcha_sales";
const EXPENSES_KEY = "mintcha_expenses";
const SETTLEMENTS_KEY = "mintcha_settlements";

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAdmin()) return; // common.js — admin-only, like Coffee Traps settlement

  const user = localStorage.getItem("mintchaUser");
  const cashierDisplay = document.getElementById("currentCashier");
  if (cashierDisplay) cashierDisplay.textContent = user || "";

  const usageLink = document.getElementById("adminStockUsageLink");
  if (usageLink) usageLink.style.display = "list-item";

  function loadSales() {
    try { return JSON.parse(localStorage.getItem(SALES_KEY)) || []; }
    catch (e) { return []; }
  }
  function loadExpenses() {
    try { return JSON.parse(localStorage.getItem(EXPENSES_KEY)) || []; }
    catch (e) { return []; }
  }
  function loadSettlements() {
    try { return JSON.parse(localStorage.getItem(SETTLEMENTS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveSettlements(list) {
    localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(list));
  }
  function fmtMoney(n) {
    return "RM " + (Number(n) || 0).toFixed(2);
  }
  function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1800);
  }
  function n(id) {
    return parseFloat(document.getElementById(id).value) || 0;
  }
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // === Same day-first-aware date parser used across the rest of Mintcha
  // (sales-overview.js / dashboard.js), trimmed to what this page needs ===
  function excelSerialToDate(value) {
    const num = typeof value === "number" ? value : parseFloat(value);
    if (isNaN(num)) return null;
    if (num < 20000 || num > 60000) return null;
    const utcDays = Math.floor(num - 25569);
    const utcMs = utcDays * 86400 * 1000;
    const dateInfo = new Date(utcMs);
    const fractionalDay = num - Math.floor(num) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const d = new Date(Date.UTC(dateInfo.getUTCFullYear(), dateInfo.getUTCMonth(), dateInfo.getUTCDate(), hours, minutes, seconds));
    return isNaN(d.getTime()) ? null : d;
  }
  function parseDateSafe(dateString) {
    if (!dateString) return null;
    const str = String(dateString).trim();
    const serialGuess = excelSerialToDate(str);
    if (serialGuess) return serialGuess;
    const dtMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ ,T]*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?/);
    if (dtMatch) {
      let [, day, month, year, hour, minute, second, ampm] = dtMatch;
      day = parseInt(day, 10); month = parseInt(month, 10) - 1; year = parseInt(year, 10);
      if (year < 100) year += 2000;
      hour = hour ? parseInt(hour, 10) : 0; minute = minute ? parseInt(minute, 10) : 0; second = second ? parseInt(second, 10) : 0;
      if (ampm) {
        const up = ampm.toUpperCase();
        if (up === "PM" && hour < 12) hour += 12;
        if (up === "AM" && hour === 12) hour = 0;
      }
      const localDate = new Date(year, month, day, hour, minute, second);
      if (!isNaN(localDate.getTime())) return localDate;
    }
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    return null;
  }
  function isoDateOf(d) {
    const pad = x => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // === Payment-method bucketing ===
  // Covers both live checkout methods (order-management.js: "Cash",
  // "QR Code", "TNG eWallet", "Card", "Cookiedoh", "Mala Bistro", "Shopee
  // Food", "Grab Food") and the Add Sale manual-entry method names
  // (sales-overview.js: "Cash", "QR", "Ewallet", "Card") — the two use
  // slightly different labels for the same tender, so this matches by
  // keyword rather than exact string.
  //
  // Mala Bistro is matched here purely for cash-drawer reconciliation
  // purposes (same as Cookiedoh/Shopee/Grab) — it never carries a
  // discount, so there's nothing else to special-case for it on this page.
  function bucketForMethod(method) {
    const m = String(method || "").toLowerCase();
    if (m.includes("cookiedoh") || m.includes("mala") || m.includes("shopee") || m.includes("grab")) return "others";
    if (m.includes("cash")) return "cash";
    if (m.includes("card")) return "card";
    if (m.includes("qr") || m.includes("ewallet") || m.includes("e-wallet")) return "qr";
    return "others";
  }

  // === System sales for a given date, split by tender ===
  function computeSystemSalesForDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const sales = loadSales().filter(sale => {
      if (sale.status === "Refunded") return false;
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate) return false;
      return saleDate.getFullYear() === y && (saleDate.getMonth() + 1) === m && saleDate.getDate() === d;
    });

    const buckets = { cash: 0, card: 0, qr: 0, others: 0 };
    const byMethod = {}; // raw method name -> { total, count }

    sales.forEach(sale => {
      const total = parseFloat(sale.total || 0);
      const bucket = bucketForMethod(sale.paymentMethod);
      buckets[bucket] += total;

      const label = sale.paymentMethod || "(no method)";
      if (!byMethod[label]) byMethod[label] = { total: 0, count: 0 };
      byMethod[label].total += total;
      byMethod[label].count += 1;
    });

    return { buckets, byMethod, saleCount: sales.length };
  }

  function cashExpensesForDate(date) {
    return loadExpenses()
      .filter(e => e.date === date && e.status === "approved" && e.type === "debit" && e.method === "cash")
      .reduce((s, e) => s + e.amount, 0);
  }

  const dateInput = document.getElementById("settleDate");
  dateInput.value = todayStr();
  dateInput.addEventListener("change", loadDay);

  ["actCash", "actCard", "actQr", "actOthers", "notes"].forEach(id => {
    document.getElementById(id).addEventListener("input", recalc);
  });

  function recalc() {
    const date = dateInput.value;
    const { buckets, byMethod, saleCount } = computeSystemSalesForDate(date);

    document.getElementById("sysCash").textContent = fmtMoney(buckets.cash);
    document.getElementById("sysCard").textContent = fmtMoney(buckets.card);
    document.getElementById("sysQr").textContent = fmtMoney(buckets.qr);
    document.getElementById("sysOthers").textContent = fmtMoney(buckets.others);
    const sysTotal = buckets.cash + buckets.card + buckets.qr + buckets.others;
    document.getElementById("sysTotal").textContent = fmtMoney(sysTotal);

    const breakdownEl = document.getElementById("methodBreakdown");
    if (!saleCount) {
      breakdownEl.innerHTML = `<div>No sales recorded for this date.</div>`;
    } else {
      breakdownEl.innerHTML = Object.entries(byMethod)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([label, info]) => `<div><span>${escapeHtml(label)} (${info.count})</span><span>${fmtMoney(info.total)}</span></div>`)
        .join("");
    }

    const cashExp = cashExpensesForDate(date);
    document.getElementById("cashExpenseTotal").textContent = fmtMoney(cashExp);

    const expCash = buckets.cash - cashExp;
    const expCard = buckets.card, expQr = buckets.qr, expOthers = buckets.others;
    document.getElementById("expCash").textContent = fmtMoney(expCash);
    document.getElementById("expCard").textContent = fmtMoney(expCard);
    document.getElementById("expQr").textContent = fmtMoney(expQr);
    document.getElementById("expOthers").textContent = fmtMoney(expOthers);
    const expTotal = expCash + expCard + expQr + expOthers;
    document.getElementById("expTotal").textContent = fmtMoney(expTotal);

    const actCash = n("actCash"), actCard = n("actCard"), actQr = n("actQr"), actOthers = n("actOthers");
    const actTotal = actCash + actCard + actQr + actOthers;
    document.getElementById("actTotal").textContent = fmtMoney(actTotal);

    setDiff("diffCash", actCash - expCash);
    setDiff("diffCard", actCard - expCard);
    setDiff("diffQr", actQr - expQr);
    setDiff("diffOthers", actOthers - expOthers);
    setDiff("diffTotal", actTotal - expTotal);

    return { sysCash: buckets.cash, sysCard: buckets.card, sysQr: buckets.qr, sysOthers: buckets.others, cashExp, expTotal, actCash, actCard, actQr, actOthers, actTotal };
  }

  function setDiff(id, val) {
    const el = document.getElementById(id);
    const rounded = Math.round(val * 100) / 100;
    el.textContent = (rounded > 0 ? "+" : "") + fmtMoney(rounded);
    el.classList.remove("diff-zero", "diff-pos", "diff-neg");
    if (Math.abs(rounded) < 0.005) el.classList.add("diff-zero");
    else if (rounded > 0) el.classList.add("diff-pos");
    else el.classList.add("diff-neg");
  }

  function loadDay() {
    const date = dateInput.value;
    const settlements = loadSettlements();
    const existing = settlements.find(s => s.date === date);

    if (existing) {
      document.getElementById("actCash").value = existing.actCash;
      document.getElementById("actCard").value = existing.actCard;
      document.getElementById("actQr").value = existing.actQr;
      document.getElementById("actOthers").value = existing.actOthers;
      document.getElementById("notes").value = existing.notes || "";
      setLocked(true);
      const banner = document.getElementById("statusBanner");
      banner.className = "status-banner closed";
      banner.textContent = `Closed by ${existing.closedBy} at ${new Date(existing.closedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      ["actCash", "actCard", "actQr", "actOthers"].forEach(id => document.getElementById(id).value = "");
      document.getElementById("notes").value = "";
      setLocked(false);
      const banner = document.getElementById("statusBanner");
      banner.className = "status-banner open";
      banner.textContent = "Day is open — not yet closed";
    }
    recalc();
  }

  function setLocked(locked) {
    ["actCash", "actCard", "actQr", "actOthers", "notes"].forEach(id => {
      document.getElementById(id).disabled = locked;
    });
    document.getElementById("closeBtn").style.display = locked ? "none" : "block";
    document.getElementById("reopenBtn").style.display = locked ? "block" : "none";
  }

  document.getElementById("closeBtn").addEventListener("click", () => {
    const date = dateInput.value;
    const vals = recalc();
    const record = {
      date,
      sysCash: vals.sysCash, sysCard: vals.sysCard, sysQr: vals.sysQr, sysOthers: vals.sysOthers,
      cashExpenseTotal: vals.cashExp,
      actCash: vals.actCash, actCard: vals.actCard, actQr: vals.actQr, actOthers: vals.actOthers,
      notes: document.getElementById("notes").value.trim(),
      closedBy: user, closedAt: new Date().toISOString()
    };
    let settlements = loadSettlements();
    settlements = settlements.filter(s => s.date !== date);
    settlements.unshift(record);
    saveSettlements(settlements);
    showToast("Day closed and saved");
    loadDay();
    renderHistory();
  });

  document.getElementById("reopenBtn").addEventListener("click", () => {
    const date = dateInput.value;
    let settlements = loadSettlements();
    settlements = settlements.filter(s => s.date !== date);
    saveSettlements(settlements);
    showToast("Day reopened for editing");
    loadDay();
    renderHistory();
  });

  function renderHistory() {
    const settlements = loadSettlements().slice(0, 14);
    const c = document.getElementById("historyContainer");
    if (!settlements.length) {
      c.innerHTML = `<div style="text-align:center;padding:20px;color:#888;font-size:13.5px;">No settlements saved yet</div>`;
      return;
    }
    c.innerHTML = settlements.map(s => {
      const expTotal = (s.sysCash - s.cashExpenseTotal) + s.sysCard + s.sysQr + s.sysOthers;
      const actTotal = s.actCash + s.actCard + s.actQr + s.actOthers;
      const diff = Math.round((actTotal - expTotal) * 100) / 100;
      const balanced = Math.abs(diff) < 0.005;
      return `
        <div class="history-item" onclick="document.getElementById('settleDate').value='${s.date}';window.__loadDay();window.scrollTo({top:0,behavior:'smooth'});">
          <div>
            <div class="d">${s.date}</div>
            <div class="s">Closed by ${escapeHtml(s.closedBy)}</div>
          </div>
          <span class="history-badge ${balanced ? "balanced" : "off"}">${balanced ? "Balanced" : (diff > 0 ? "+" : "") + fmtMoney(diff)}</span>
        </div>`;
    }).join("");
  }
  window.__loadDay = loadDay; // exposed for the inline onclick above

  /* ---------- init ---------- */
  loadDay();
  renderHistory();
});