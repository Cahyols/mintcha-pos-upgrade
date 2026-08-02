// === coffee-traps.js ===
// Settlement/billing page for Coffee Traps (a coffee tenant selling under
// Mintcha). Every Monday, Mintcha pays Coffee Traps their coffee revenue for
// the prior Mon-Sun week, minus cold cup/lid/straw cost (auto-computed from
// sales) and ice cost (manual — no data source for this exists yet). The
// last week of each calendar month also deducts rental/utilities/wifi/pest
// control (manual).
//
// Weeks are REAL Monday-Sunday weeks (not day-of-month blocks) so "next
// Monday's payout" always lines up with what you'd expect — e.g. on Sunday
// 2 Aug, the week Mon 27 Jul - Sun 2 Aug settles the very next day, Mon 3 Aug.

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAdmin()) return; // settlement/financial page — admin only

  // --- Safe Date Parser (same robust version used in sales-overview.js) ---
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
    const d = new Date(Date.UTC(
      dateInfo.getUTCFullYear(), dateInfo.getUTCMonth(), dateInfo.getUTCDate(),
      hours, minutes, seconds
    ));
    return isNaN(d.getTime()) ? null : d;
  }

  function parseDateSafe(dateString) {
    if (!dateString) return null;
    const str = String(dateString).trim();

    const serialGuess = excelSerialToDate(str);
    if (serialGuess) return serialGuess;

    const isoParts = str.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}):?(\d{2})?)?/
    );
    if (isoParts) {
      let [, y, m, d2, h, min, s] = isoParts;
      y = parseInt(y, 10); m = parseInt(m, 10) - 1; d2 = parseInt(d2, 10);
      h = h ? parseInt(h, 10) : 0; min = min ? parseInt(min, 10) : 0; s = s ? parseInt(s, 10) : 0;
      const localDate = new Date(y, m, d2, h, min, s);
      if (!isNaN(localDate.getTime())) return localDate;
    }

    const dtMatch = str.match(
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ ,T]*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?/
    );
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

  function isAddOn(name) {
    return typeof name === "string" && name.trim().startsWith("+");
  }

  // A coffee item is "Hot" if its name starts with the word "Hot" — that's
  // how temperature is encoded on this menu (e.g. "Black Coffee" = default/
  // iced, "Hot Black Coffee" = hot). Hot drinks don't need a cold cup/lid/
  // straw, so they're excluded from the cup charge.
  function isHotDrink(name) {
    return /^hot\b/i.test(String(name || "").trim());
  }

  // Same convention as dashboard.js: a sale is "via Cookiedoh" if that's the
  // payment method — Cookiedoh collected the cash and settles separately.
  // Coffee Traps is still owed for coffee items on that sale though, so this
  // is only used for the DISPLAY split, never to exclude revenue.
  function isCookiedohSale(sale) {
    return sale.paymentMethod === "Cookiedoh";
  }

  function loadMenuCategoryMap() {
    const menuItems = JSON.parse(localStorage.getItem("menuItems") || "[]");
    const map = {};
    menuItems.forEach(item => {
      map[item.name] = { category: item.category || "uncategorized", price: item.price || 0 };
    });
    return map;
  }

  function loadSales() {
    return JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
  }

  // ================= Settings (cup charge rate, RM per cold cup) =================
  const SETTINGS_KEY = "coffeeTraps_settings";
  function loadSettings() {
    return { cupCharge: 0.50, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  }
  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  // ================= Manual per-week entries (ice + last-week extras) =================
  // Keyed by the week's Monday date (YYYY-MM-DD) so the SAME week always maps
  // to the same storage entry whether you view it via the Next Payout banner
  // or by browsing to that week's month below.
  const MANUAL_KEY = "coffeeTraps_manual";
  function loadManualData() {
    return JSON.parse(localStorage.getItem(MANUAL_KEY) || "{}");
  }
  function saveManualEntry(weekKey, field, value) {
    const data = loadManualData();
    if (!data[weekKey]) data[weekKey] = {};
    data[weekKey][field] = value;
    localStorage.setItem(MANUAL_KEY, JSON.stringify(data));
  }

  function isoDate(d) {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ================= Real Monday-Sunday week helpers =================
  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    while (d.getDay() !== 1) d.setDate(d.getDate() - 1); // rewind to Monday
    return d;
  }

  function buildWeek(mondayDate) {
    const start = new Date(mondayDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end, weekKey: isoDate(start) };
  }

  // True if adding 7 days to this week's Monday rolls into a new month —
  // meaning this was the LAST Monday-starting week within that month.
  function isLastWeekOfMonth(weekStart) {
    const month = weekStart.getMonth();
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    return next.getMonth() !== month;
  }

  // All Monday-Sunday weeks whose Monday falls within the given month.
  function getWeeksForMonth(year, month) {
    const weeks = [];
    let d = new Date(year, month, 1);
    d = startOfWeek(d);
    while (d.getFullYear() < year || (d.getFullYear() === year && d.getMonth() <= month)) {
      if (d.getFullYear() === year && d.getMonth() === month) {
        const week = buildWeek(d);
        weeks.push({ ...week, isLastWeek: isLastWeekOfMonth(d) });
      }
      d = new Date(d);
      d.setDate(d.getDate() + 7);
      if (d.getFullYear() > year || (d.getFullYear() === year && d.getMonth() > month)) break;
    }
    return weeks.map((w, idx) => ({ ...w, weekNum: idx + 1 }));
  }

  // The week that settles on the very next Monday (today counts as "next"
  // if today itself is Monday).
  function getNextPayoutWeek() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const payoutMonday = new Date(today);
    while (payoutMonday.getDay() !== 1) payoutMonday.setDate(payoutMonday.getDate() + 1);

    const weekEnd = new Date(payoutMonday);
    weekEnd.setDate(weekEnd.getDate() - 1);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    return {
      start: weekStart,
      end: weekEnd,
      weekKey: isoDate(weekStart),
      isLastWeek: isLastWeekOfMonth(weekStart),
      payoutMonday
    };
  }

  function formatShortDate(d) {
    return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  }
  function formatFullDate(d) {
    return d.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
  }

  // ================= Core: compute coffee totals for a date range =================
  // Ignores the Cookiedoh payment-method reroute that dashboard.js applies —
  // any item whose real menu category is "coffee" counts here, whether it
  // was rung up as a plain Coffee sale or a Cookiedoh sale, because Coffee
  // Traps is owed for that drink either way. The channel split below is for
  // DISPLAY/transparency only (mirrors the Coffee box + Cookiedoh box split
  // you already see on the Dashboard).
  function computeCoffeeTotalsForRange(startDate, endDate, menuCategoryMap) {
    const allSales = loadSales();

    let coffeeSubtotal = 0;   // gross, before any discount
    let coffeeDiscount = 0;   // apportioned discount (RM)
    let coldCups = 0;
    let hotCups = 0;
    const drinkBreakdown = {}; // { "Black Coffee": { qty, subtotal, discount } }
    const channel = {
      direct:    { subtotal: 0, discount: 0 },
      cookiedoh: { subtotal: 0, discount: 0 }
    };

    allSales.forEach(sale => {
      if (sale.status === "Refunded") return;
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate || saleDate < startDate || saleDate > endDate) return;

      const saleCategorySubtotal = {};
      let coffeeLineTotal = 0;
      const coffeeItemsThisSale = [];

      (sale.items || []).forEach(item => {
        const meta = menuCategoryMap[item.name] || { category: "uncategorized", price: 0 };
        const qty = item.qty || 0;
        const unitPrice = meta.price ?? item.price ?? 0;
        const lineTotal = unitPrice * qty;

        const cat = meta.category || "uncategorized";
        saleCategorySubtotal[cat] = (saleCategorySubtotal[cat] || 0) + lineTotal;

        if (cat === "coffee" && !isAddOn(item.name)) {
          coffeeLineTotal += lineTotal;
          coffeeItemsThisSale.push({ name: item.name, qty, lineTotal });

          if (!drinkBreakdown[item.name]) drinkBreakdown[item.name] = { qty: 0, subtotal: 0, discount: 0 };
          drinkBreakdown[item.name].qty += qty;
          drinkBreakdown[item.name].subtotal += lineTotal;

          if (isHotDrink(item.name)) hotCups += qty; else coldCups += qty;
        }
      });

      if (coffeeLineTotal <= 0) return; // nothing coffee-related in this sale

      // Apportion this sale's discount across categories proportional to
      // subtotal share — same method dashboard.js uses. This makes "Free"
      // and "% Off" sales (and the Cookiedoh Combo -RM1) correctly reduce
      // coffee's revenue too.
      const saleDiscount = parseFloat(sale.discountAmount || 0);
      const saleCategorySubtotalSum = Object.values(saleCategorySubtotal).reduce((a, b) => a + b, 0);
      let coffeeShareOfDiscount = 0;
      if (saleCategorySubtotalSum > 0 && saleDiscount > 0) {
        coffeeShareOfDiscount = ((saleCategorySubtotal.coffee || 0) / saleCategorySubtotalSum) * saleDiscount;
      }

      coffeeSubtotal += coffeeLineTotal;
      coffeeDiscount += coffeeShareOfDiscount;

      // Spread this sale's discount share across its coffee drink lines,
      // proportional to each drink's contribution — purely for the per-drink
      // breakdown display.
      coffeeItemsThisSale.forEach(ci => {
        const drinkShare = coffeeLineTotal > 0 ? (ci.lineTotal / coffeeLineTotal) * coffeeShareOfDiscount : 0;
        drinkBreakdown[ci.name].discount += drinkShare;
      });

      const bucket = isCookiedohSale(sale) ? channel.cookiedoh : channel.direct;
      bucket.subtotal += coffeeLineTotal;
      bucket.discount += coffeeShareOfDiscount;
    });

    const coffeeRevenue = coffeeSubtotal - coffeeDiscount;
    channel.direct.revenue = channel.direct.subtotal - channel.direct.discount;
    channel.cookiedoh.revenue = channel.cookiedoh.subtotal - channel.cookiedoh.discount;

    return { coffeeSubtotal, coffeeDiscount, coffeeRevenue, coldCups, hotCups, drinkBreakdown, channel };
  }

  // ================= Shared week-card renderer =================
  // Used for both the Next Payout hero banner and the month-view week list,
  // so the math and layout never drift apart.
  function buildWeekCardHTML(week, opts = {}) {
    const { headingHTML, isNext = false } = opts;
    const settings = loadSettings();
    const manualData = loadManualData();
    const menuCategoryMap = loadMenuCategoryMap();
    const manual = manualData[week.weekKey] || {};
    const ice = parseFloat(manual.ice) || 0;
    const rental = parseFloat(manual.rental) || 0;
    const utilities = parseFloat(manual.utilities) || 0;
    const wifi = parseFloat(manual.wifi) || 0;
    const pestControl = parseFloat(manual.pestControl) || 0;

    const totals = computeCoffeeTotalsForRange(week.start, week.end, menuCategoryMap);
    const { coffeeSubtotal, coffeeDiscount, coffeeRevenue, coldCups, hotCups, drinkBreakdown, channel } = totals;

    const cupChargeTotal = coldCups * settings.cupCharge;
    const extrasTotal = week.isLastWeek ? (rental + utilities + wifi + pestControl) : 0;
    const netPayout = coffeeRevenue - cupChargeTotal - ice - extrasTotal;

    const drinkRows = Object.entries(drinkBreakdown)
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([name, d]) => `
        <div class="ct-drink-row">
          <span>${name}${isHotDrink(name) ? ' <span class="ct-hot-tag">hot</span>' : ""}</span>
          <span>${d.qty} sold — RM${(d.subtotal - d.discount).toFixed(2)}${d.discount > 0.004 ? ` <span style="opacity:.7">(−RM${d.discount.toFixed(2)} disc.)</span>` : ""}</span>
        </div>
      `).join("");

    const channelRows = [];
    if (channel.direct.subtotal > 0.004) {
      channelRows.push(`<div>Direct: RM${channel.direct.subtotal.toFixed(2)} − RM${channel.direct.discount.toFixed(2)} discount = RM${channel.direct.revenue.toFixed(2)}</div>`);
    }
    if (channel.cookiedoh.subtotal > 0.004) {
      channelRows.push(`<div>🍪 Via Cookiedoh: RM${channel.cookiedoh.subtotal.toFixed(2)} − RM${channel.cookiedoh.discount.toFixed(2)} discount = RM${channel.cookiedoh.revenue.toFixed(2)}</div>`);
    }

    return `
      <div class="ct-week-card ${week.isLastWeek ? "ct-last-week" : ""} ${isNext ? "ct-is-next" : ""}">
        ${headingHTML || ""}
        <div class="ct-week-body">
          <div class="ct-line ct-subtotal"><span>☕ Coffee Subtotal (before discount)</span><span>RM${coffeeSubtotal.toFixed(2)}</span></div>
          <div class="ct-line ct-deduct"><span>Discount</span><span>-RM${coffeeDiscount.toFixed(2)}</span></div>
          <div class="ct-line"><span>Net Coffee Revenue (${coldCups + hotCups} drinks)</span><span>RM${coffeeRevenue.toFixed(2)}</span></div>
          ${channelRows.length ? `<div class="ct-channel-breakdown">${channelRows.join("")}</div>` : ""}
          ${drinkRows ? `<div class="ct-drink-list">${drinkRows}</div>` : `<div class="ct-empty-note">No coffee sales this week.</div>`}

          <div class="ct-line ct-deduct"><span>🥤 Cold Cup/Lid/Straw (${coldCups} × RM${settings.cupCharge.toFixed(2)})</span><span>-RM${cupChargeTotal.toFixed(2)}</span></div>

          <div class="ct-line ct-deduct ct-manual-row">
            <span>🧊 Ice</span>
            <span class="ct-manual-input-wrap">-RM <input type="number" min="0" step="0.01" class="ct-manual-input" data-week="${week.weekKey}" data-field="ice" value="${ice.toFixed(2)}" /></span>
          </div>

          ${week.isLastWeek ? `
            <div class="ct-extras-block">
              <div class="ct-extras-title">Month-End Extras</div>
              <div class="ct-line ct-deduct ct-manual-row">
                <span>🏠 Rental</span>
                <span class="ct-manual-input-wrap">-RM <input type="number" min="0" step="0.01" class="ct-manual-input" data-week="${week.weekKey}" data-field="rental" value="${rental.toFixed(2)}" /></span>
              </div>
              <div class="ct-line ct-deduct ct-manual-row">
                <span>⚡ Utilities</span>
                <span class="ct-manual-input-wrap">-RM <input type="number" min="0" step="0.01" class="ct-manual-input" data-week="${week.weekKey}" data-field="utilities" value="${utilities.toFixed(2)}" /></span>
              </div>
              <div class="ct-line ct-deduct ct-manual-row">
                <span>📶 WiFi</span>
                <span class="ct-manual-input-wrap">-RM <input type="number" min="0" step="0.01" class="ct-manual-input" data-week="${week.weekKey}" data-field="wifi" value="${wifi.toFixed(2)}" /></span>
              </div>
              <div class="ct-line ct-deduct ct-manual-row">
                <span>🐜 Pest Control</span>
                <span class="ct-manual-input-wrap">-RM <input type="number" min="0" step="0.01" class="ct-manual-input" data-week="${week.weekKey}" data-field="pestControl" value="${pestControl.toFixed(2)}" /></span>
              </div>
            </div>
          ` : ""}

          <div class="ct-line ct-net-total"><span>Net Payout to Coffee Traps</span><span>RM${netPayout.toFixed(2)}</span></div>
        </div>
      </div>
    `;
  }

  function wireManualInputs(container, onSaved) {
    container.querySelectorAll(".ct-manual-input").forEach(input => {
      input.addEventListener("change", (e) => {
        const weekKey = e.target.dataset.week;
        const field = e.target.dataset.field;
        const value = parseFloat(e.target.value) || 0;
        saveManualEntry(weekKey, field, value);
        onSaved();
      });
    });
  }

  // ================= Next Payout hero banner =================
  function renderNextPayout() {
    const container = document.getElementById("ctNextPayoutContainer");
    if (!container) return;

    const week = getNextPayoutWeek();
    const settings = loadSettings();
    const menuCategoryMap = loadMenuCategoryMap();
    const manualData = loadManualData();
    const manual = manualData[week.weekKey] || {};
    const ice = parseFloat(manual.ice) || 0;
    const rental = parseFloat(manual.rental) || 0;
    const utilities = parseFloat(manual.utilities) || 0;
    const wifi = parseFloat(manual.wifi) || 0;
    const pestControl = parseFloat(manual.pestControl) || 0;

    const totals = computeCoffeeTotalsForRange(week.start, week.end, menuCategoryMap);
    const cupChargeTotal = totals.coldCups * settings.cupCharge;
    const extrasTotal = week.isLastWeek ? (rental + utilities + wifi + pestControl) : 0;
    const netPayout = totals.coffeeRevenue - cupChargeTotal - ice - extrasTotal;

    const isToday = week.payoutMonday.toDateString() === new Date().toDateString();
    const heading = `
      <div class="ct-next-payout-top">
        <div>
          <div class="ct-next-payout-label">${isToday ? "Payout Due Today" : "Next Payout"}</div>
          <div class="ct-next-payout-date">Monday, ${formatFullDate(week.payoutMonday)}</div>
        </div>
        <div class="ct-next-payout-amount">RM${netPayout.toFixed(2)}</div>
      </div>
      <div class="ct-next-payout-range">For the week of ${formatShortDate(week.start)} – ${formatShortDate(week.end)}</div>
    `;

    container.innerHTML = `<div class="ct-next-payout">${buildWeekCardHTML(week, { headingHTML: heading, isNext: true })}</div>`;
    wireManualInputs(container, refreshAll);
  }

  // ================= Rendering: month view =================
  let currentYear, currentMonth; // currentMonth is 0-indexed

  function initDate() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
  }

  function renderMonthLabel() {
    const label = document.getElementById("ctMonthLabel");
    if (label) {
      label.textContent = new Date(currentYear, currentMonth, 1)
        .toLocaleDateString("en-MY", { month: "long", year: "numeric" });
    }
  }

  function renderSettingsBar() {
    const settings = loadSettings();
    const input = document.getElementById("ctCupChargeInput");
    if (input) input.value = settings.cupCharge.toFixed(2);
  }

  function renderWeeks() {
    const container = document.getElementById("ctWeeksContainer");
    if (!container) return;

    const settings = loadSettings();
    const menuCategoryMap = loadMenuCategoryMap();
    const weeks = getWeeksForMonth(currentYear, currentMonth);
    const nextPayoutKey = getNextPayoutWeek().weekKey;

    let monthNetTotal = 0;

    // First pass just to accumulate the month total (buildWeekCardHTML also
    // computes this internally per-card, so re-derive here for the banner).
    weeks.forEach(week => {
      const manual = loadManualData()[week.weekKey] || {};
      const ice = parseFloat(manual.ice) || 0;
      const rental = parseFloat(manual.rental) || 0;
      const utilities = parseFloat(manual.utilities) || 0;
      const wifi = parseFloat(manual.wifi) || 0;
      const pestControl = parseFloat(manual.pestControl) || 0;
      const totals = computeCoffeeTotalsForRange(week.start, week.end, menuCategoryMap);
      const cupChargeTotal = totals.coldCups * settings.cupCharge;
      const extrasTotal = week.isLastWeek ? (rental + utilities + wifi + pestControl) : 0;
      monthNetTotal += totals.coffeeRevenue - cupChargeTotal - ice - extrasTotal;
    });

    container.innerHTML = weeks.map(week => {
      const isNext = week.weekKey === nextPayoutKey;
      const settlementDate = new Date(week.end);
      settlementDate.setDate(settlementDate.getDate() + 1);
      const heading = `
        <div class="ct-week-header">
          <h3>Week ${week.weekNum} <span class="ct-week-range">${formatShortDate(week.start)} – ${formatShortDate(week.end)}</span>${isNext ? '<span class="ct-next-tag">Next Payout</span>' : ""}</h3>
          <span class="ct-settle-tag">Pays out Mon, ${formatFullDate(settlementDate)}</span>
        </div>
      `;
      return buildWeekCardHTML(week, { headingHTML: heading, isNext });
    }).join("");

    const monthTotalEl = document.getElementById("ctMonthTotal");
    if (monthTotalEl) monthTotalEl.textContent = `RM${monthNetTotal.toFixed(2)}`;

    wireManualInputs(container, refreshAll);
  }

  function refreshAll() {
    renderNextPayout();
    renderMonthLabel();
    renderSettingsBar();
    renderWeeks();
  }

  // ================= Init =================
  initDate();
  refreshAll();

  document.getElementById("ctPrevMonthBtn")?.addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    refreshAll();
  });
  document.getElementById("ctNextMonthBtn")?.addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    refreshAll();
  });
  document.getElementById("ctTodayBtn")?.addEventListener("click", () => {
    initDate();
    refreshAll();
  });

  document.getElementById("ctCupChargeInput")?.addEventListener("change", (e) => {
    const value = parseFloat(e.target.value);
    if (isNaN(value) || value < 0) return;
    const settings = loadSettings();
    settings.cupCharge = value;
    saveSettings(settings);
    refreshAll();
  });

  // Keep this page live if sales/menu/settings change in another tab
  window.addEventListener("storage", (e) => {
    if (["mintcha_sales", "menuItems", "coffeeTraps_settings", "coffeeTraps_manual"].includes(e.key)) {
      refreshAll();
    }
  });
});