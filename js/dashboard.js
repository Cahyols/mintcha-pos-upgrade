console.log("[dashboard.js] v8 loaded — Mala Bistro (no-discount, settles Mon) added alongside Cookiedoh + Shopee/Grab delivery split + servings-based low stock alerts + renamed-item fix tool + auth guard active");

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;

  const lowStockList = document.getElementById("lowStockList");

  // --- Safe Date Parser (DD/MM/YYYY-first, since en-MY locale is day-first) ---
  function parseDateSafe(dateString) {
    if (!dateString) return null;

    const dtMatch = dateString.match(
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ ,T]*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?/
    );
    if (dtMatch) {
      let [, day, month, year, hour, minute, second, ampm] = dtMatch;
      day = parseInt(day, 10);
      month = parseInt(month, 10) - 1;
      year = parseInt(year, 10);
      if (year < 100) year += 2000;

      hour = hour ? parseInt(hour, 10) : 0;
      minute = minute ? parseInt(minute, 10) : 0;
      second = second ? parseInt(second, 10) : 0;

      if (ampm) {
        const up = ampm.toUpperCase();
        if (up === "PM" && hour < 12) hour += 12;
        if (up === "AM" && hour === 12) hour = 0;
      }

      const localDate = new Date(year, month, day, hour, minute, second);
      if (!isNaN(localDate.getTime())) return localDate;
    }

    let d = new Date(dateString);
    if (!isNaN(d.getTime())) return d;

    return null;
  }

  // === Add-on detection ===
  // Add-on items (e.g. "+matcha", "+milk", "+syrup") are stored as their own
  // line in sale.items so pricing/inventory logic can find them, but they are
  // NOT a drink on their own. They should still be LISTED under their
  // category's drink breakdown (so you can see what add-ons sold), but they
  // must never be counted as a "cup" / transaction — otherwise a single
  // 1-cup order with 1 add-on shows up as "2" in Total Transaction.
  function isAddOn(name) {
    return typeof name === "string" && name.trim().startsWith("+");
  }

  // Load stock from localStorage
  function loadStock() {
    return JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
  }

  // Load raw menu items (with ingredients/recipes) from localStorage
  function loadMenuItemsRaw() {
    return JSON.parse(localStorage.getItem("menuItems") || "[]");
  }

  // Load menu items (for category + price lookup) from localStorage
  function loadMenuCategoryMap() {
    const menuItems = loadMenuItemsRaw();
    const map = {};
    menuItems.forEach(item => {
      const dineInPrice = parseFloat(item.price) || 0;
      const deliveryPriceRaw = parseFloat(item.priceDelivery);
      map[item.name] = {
        category: item.category || "uncategorized",
        price: dineInPrice,
        // Falls back to dine-in price if this item never had a separate
        // delivery price set on the Menu Recipes page.
        priceDelivery: !isNaN(deliveryPriceRaw) ? deliveryPriceRaw : dineInPrice
      };
    });
    return map;
  }

  // === Shared: convert a stock item's on-hand quantity into a target unit ===
  // Returns null if no safe conversion is possible (unit mismatch with no
  // matching conversionUnit set on the stock item).
  // NOTE: kept in sync with the identical copy in stock-overview.js.
  function convertStockQtyToUnit(stockItem, targetUnit) {
    const stockUnit = String(stockItem.unit || "").trim().toLowerCase();
    const target = String(targetUnit || "").trim().toLowerCase();
    if (!target) return null;
    if (stockUnit === target) return parseFloat(stockItem.quantity);

    const convUnit = String(stockItem.conversionUnit || "").trim().toLowerCase();
    const convValue = parseFloat(stockItem.conversionValue);
    if (convUnit && convUnit === target && !isNaN(convValue)) {
      return parseFloat(stockItem.quantity) * convValue;
    }
    return null; // units don't match and no usable conversion is set
  }

  // === Shared: for a stock item, find the recipe that would run out FIRST,
  // and how many of that drink could still be made from what's on hand. ===
  // NOTE: kept in sync with the identical copy in stock-overview.js.
  function getServingsInfo(stockItem, menuData) {
    let minServings = null;
    let limitingDrink = null;

    (menuData || []).forEach(drink => {
      (drink.ingredients || []).forEach(ing => {
        if (String(ing.name || "").trim().toLowerCase() !== String(stockItem.name || "").trim().toLowerCase()) return;
        if (!ing.qty || ing.qty <= 0) return;

        const availableQty = convertStockQtyToUnit(stockItem, ing.unit);
        if (availableQty === null) return; // unit mismatch, can't compute for this recipe

        const servings = Math.floor(availableQty / ing.qty);
        if (minServings === null || servings < minServings) {
          minServings = servings;
          limitingDrink = drink.name;
        }
      });
    });

    return { minServings, limitingDrink };
  }

  // === Shared: full low-stock check — quantity threshold OR serving threshold ===
  // NOTE: kept in sync with the identical copy in stock-overview.js.
  function getStockLowInfo(item, menuData) {
    const threshold = parseFloat(item.lowThreshold);
    const qty = parseFloat(item.quantity);
    const qtyLow = !isNaN(threshold) && !isNaN(qty) && qty <= threshold;

    let servingsLow = false;
    let minServings = null;
    let limitingDrink = null;

    const servingThreshold = parseFloat(item.lowServingThreshold);
    if (!isNaN(servingThreshold)) {
      const info = getServingsInfo(item, menuData);
      minServings = info.minServings;
      limitingDrink = info.limitingDrink;
      if (minServings !== null && minServings <= servingThreshold) {
        servingsLow = true;
      }
    }

    return { isLow: qtyLow || servingsLow, qtyLow, servingsLow, minServings, limitingDrink };
  }

  // Reusable function to get low stock items — now flags an item if EITHER
  // its raw quantity is at/below lowThreshold OR the number of drinks it
  // can still make (via recipes in menu-recipes) is at/below
  // lowServingThreshold. Each returned item carries a `_lowInfo` object so
  // the renderer can show which condition(s) tripped.
  function getLowStockItems() {
    const stockList = loadStock();
    const menuData = loadMenuItemsRaw();
    return stockList
      .map(item => ({ ...item, _lowInfo: getStockLowInfo(item, menuData) }))
      .filter(item => item._lowInfo.isLow);
  }

  // === Low Stock / Reorder Alerts ===
  // Sorted most-urgent-first (how far below its own threshold it's fallen,
  // as a ratio — so a "10 cups, threshold 10" item and a "50 cups,
  // threshold 50" item both flag at the same relative urgency, not just
  // by raw quantity). Items at/below zero are marked OUT OF STOCK.
  // Cup-type items get a 🥤 icon instead of ⚠️ so they stand out in a glance
  // when you're scanning for "do I need to order more cups."
  function renderLowStockAlerts() {
    const lowStockItems = getLowStockItems();

    if (!lowStockItems.length) {
      lowStockList.innerHTML = `<li>✅ All stock levels are sufficient.</li>`;
      return;
    }

    const sorted = [...lowStockItems].sort((a, b) => {
      const ratioA = a.lowThreshold > 0 ? a.quantity / a.lowThreshold : 0;
      const ratioB = b.lowThreshold > 0 ? b.quantity / b.lowThreshold : 0;
      return ratioA - ratioB;
    });

    lowStockList.innerHTML = sorted.map(item => {
      const isCup = /cup/i.test(item.name) || /cup/i.test(item.unit || "");
      const icon = isCup ? "🥤" : "⚠️";
      const critical = item.quantity <= 0;
      const info = item._lowInfo;

      const reasons = [];
      if (info.qtyLow) {
        reasons.push(critical ? "OUT OF STOCK — order now!" : `Below ${item.lowThreshold} — order soon`);
      }
      if (info.servingsLow) {
        const drinkLabel = info.limitingDrink ? ` ${info.limitingDrink}` : "";
        reasons.push(`Can only make ${info.minServings}${drinkLabel}${info.minServings === 1 ? "" : "s"} more`);
      }

      return `
        <li class="${critical ? "stock-critical" : "stock-low"}">
          <strong>${icon} ${item.name}</strong> – ${item.quantity} ${item.unit}
          ${item.conversionUnit ? ` (${item.conversionUnit})` : ""}
          <span class="reorder-tag">${reasons.join(" · ")}</span>
        </li>
      `;
    }).join("");
  }

  // ===================================================================
  // === Data Maintenance: Fix Renamed Menu Items (Admin only) ===
  // ===================================================================
  //
  // Problem: when a drink on Menu Recipes gets renamed (e.g. "Mintcha
  // Bloom" -> "Mintcha Bloom (MB)"), sales recorded BEFORE the rename still
  // have the OLD name stored on their line items. The category breakdown
  // above looks up each sale item's category by exact name match against
  // the CURRENT menu (loadMenuCategoryMap), so those older sales silently
  // fall into "Uncategorized" instead of their real category.
  //
  // Fix: derive old name -> new name pairs by stripping a trailing
  // " (CODE)" off each current menu item's name, then rewrite any matching
  // old names found in mintcha_sales to the current name. A backup of
  // mintcha_sales downloads automatically first. Safe to run more than
  // once — items that already match the current name are simply skipped.

  function buildMenuRenameMap() {
    const menu = loadMenuItemsRaw();
    const renameMap = {}; // oldName -> newName
    menu.forEach(item => {
      const oldName = String(item.name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (oldName && oldName !== item.name) {
        renameMap[oldName] = item.name;
      }
    });
    return renameMap;
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fixRenamedItems() {
    const resultEl = document.getElementById("fixRenamedItemsResult");
    const renameMap = buildMenuRenameMap();

    if (!Object.keys(renameMap).length) {
      if (resultEl) {
        resultEl.style.display = "block";
        resultEl.style.color = "#666";
        resultEl.textContent = "No renamed menu items detected (no current menu name has a trailing \"(CODE)\" that differs from a base name).";
      }
      return;
    }

    const sales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");

    // Count first, so the confirm dialog is informative instead of blind
    const counts = {};
    sales.forEach(sale => {
      (sale.items || []).forEach(item => {
        if (renameMap[item.name]) {
          counts[item.name] = (counts[item.name] || 0) + (item.qty || 1);
        }
      });
    });

    const affectedNames = Object.keys(counts);
    if (!affectedNames.length) {
      if (resultEl) {
        resultEl.style.display = "block";
        resultEl.style.color = "#666";
        resultEl.textContent = "Nothing to fix — no past sales use an old (pre-rename) item name.";
      }
      return;
    }

    const summaryLines = affectedNames
      .map(name => `  "${name}" → "${renameMap[name]}"  (${counts[name]} line-item${counts[name] === 1 ? "" : "s"})`)
      .join("\n");

    const confirmed = confirm(
      `This will update the following old item names in your sales history:\n\n${summaryLines}\n\n` +
      `A backup of your current sales data will download automatically first.\n\nProceed?`
    );
    if (!confirmed) return;

    // Backup before touching anything
    downloadJSON(sales, `mintcha_sales_backup_${Date.now()}.json`);

    let changed = 0;
    sales.forEach(sale => {
      (sale.items || []).forEach(item => {
        if (renameMap[item.name]) {
          item.name = renameMap[item.name];
          changed++;
        }
      });
    });

    localStorage.setItem("mintcha_sales", JSON.stringify(sales));

    if (resultEl) {
      resultEl.style.display = "block";
      resultEl.style.color = "#2e7d32";
      resultEl.textContent = `Done — ${changed} line-item${changed === 1 ? "" : "s"} updated. Refreshing dashboard…`;
    }

    // Re-render everything so the fix is visible immediately
    refreshDashboardData();
  }

  function setupDataMaintenance() {
    const role = localStorage.getItem("mintchaRole");
    const card = document.getElementById("dataMaintenanceCard");
    const btn = document.getElementById("fixRenamedItemsBtn");
    if (!card) return;

    if (role === "admin") {
      card.style.display = "block";
    }

    btn?.addEventListener("click", fixRenamedItems);
  }

  // ===================================================================
  // === Sales / Cup Summary (Admin only) — supports Day/Week/Month ===
  // ===================================================================

  let currentViewMode = "day"; // "day" | "week" | "month"
  let hourlyReportOpen = false; // whether the Hourly Report panel is expanded

  function getRangeForMode(mode, refDate) {
    const start = new Date(refDate);
    const end = new Date(refDate);

    if (mode === "day") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (mode === "week") {
      const day = start.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);

      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (mode === "month") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }

    return [start, end];
  }

  function formatRangeLabel(mode, start, end) {
    const opts = { day: "numeric", month: "long", year: "numeric" };
    if (mode === "day") {
      return start.toLocaleDateString("en-MY", { weekday: "long", ...opts });
    }
    if (mode === "week") {
      const startStr = start.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
      const endStr = end.toLocaleDateString("en-MY", opts);
      return `${startStr} – ${endStr}`;
    }
    return start.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  }

  // Renders the small "drink · qty" rows inside a category box.
  // NOTE: this still receives add-on entries (e.g. "+matcha") so they remain
  // visible in the breakdown — they're just excluded from the cup COUNTS
  // upstream (see renderSummaryForRange). Add-on rows get a subtle "add-on"
  // tag so it's clear at a glance they aren't a drink on their own.
  function renderCategoryDrinksList(drinksMap) {
    const entries = Object.entries(drinksMap).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return "";

    return `
      <div class="cat-drink-list">
        ${entries.map(([name, qty]) => `
          <div class="cat-drink-row${isAddOn(name) ? " cat-drink-addon" : ""}">
            <span class="cat-drink-name">${name}${isAddOn(name) ? ` <span class="addon-tag">add-on</span>` : ""}</span>
            <span class="cat-drink-qty">${qty}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  // === Hourly Report helpers ===
  function formatHourLabel(hour) {
    const start = new Date(2000, 0, 1, hour);
    const end = new Date(2000, 0, 1, hour + 1);
    const opts = { hour: "numeric", hour12: true };
    return `${start.toLocaleTimeString("en-MY", opts)} – ${end.toLocaleTimeString("en-MY", opts)}`;
  }

  const CATEGORY_DISPLAY_NAMES = {
    matcha: "Matcha",
    coffee: "Coffee",
    dessert: "Dessert",
    uncategorized: "Uncategorized",
    cookiedoh: "🍪 Cookiedoh",
    // Mala Bistro: second cross-tenant partner, same settlement pattern
    // as Cookiedoh (see isMalaBistroSale below) but this bucket's
    // `discount` total is structurally always 0 — Mala Bistro never
    // appears anywhere a discount can be applied (see
    // order-management.js), so the "-RMx discount" line under its
    // category box is never rendered.
    mala: "🌶️ Mala Bistro",
    shopee: "🛍️ Shopee Food",
    grab: "🚗 Grab Food"
  };

  // A sale is a Cookiedoh sale if Cookiedoh collected the payment for it —
  // see order-management.js's "Cookiedoh (settles Mon)" payment method.
  // Every item on that sale is tallied under the Cookiedoh bucket instead
  // of its usual Matcha/Coffee/Dessert category, so the two don't overlap
  // and this number can be tallied 1:1 against what Cookiedoh reports.
  function isCookiedohSale(sale) {
    return sale.paymentMethod === "Cookiedoh";
  }

  // A sale is a Mala Bistro sale if Mala Bistro collected the payment for
  // it — see order-management.js's "Mala Bistro (settles Mon)" payment
  // method. Same cross-tenant settlement pattern as Cookiedoh: tallied
  // separately here so it can be reconciled 1:1 against what Mala Bistro
  // reports collecting.
  function isMalaBistroSale(sale) {
    return sale.paymentMethod === "Mala Bistro";
  }

  // Delivery sales are paid via one of the two platform-specific payment
  // methods set in order-management.js's Delivery payment options ("Shopee
  // Food" / "Grab Food"). Tracked separately for the same reason as
  // Cookiedoh above — so each platform's cups/revenue can be reconciled
  // against what that platform actually reports/settles, without those
  // drinks also showing up under Matcha/Coffee/Dessert.
  function isShopeeSale(sale) {
    return sale.paymentMethod === "Shopee Food";
  }

  function isGrabSale(sale) {
    return sale.paymentMethod === "Grab Food";
  }

  // Single source of truth for which bucket a sale's items get tallied
  // under. Order matters only in that these are mutually exclusive payment
  // methods, so at most one of these will ever be true for a given sale.
  function getSaleBucket(sale, meta) {
    if (isCookiedohSale(sale)) return "cookiedoh";
    if (isMalaBistroSale(sale)) return "mala";
    if (isShopeeSale(sale)) return "shopee";
    if (isGrabSale(sale)) return "grab";
    return meta.category;
  }

  // Resolve the price to use for a single line item within a sale, for the
  // Dashboard's revenue / discount-split math.
  //
  // Priority:
  //   1. The price actually stored on the sale's line item (item.price).
  //      This is what the customer was really charged at checkout —
  //      order-management.js already resolves Dine In vs Delivery pricing
  //      via getItemPrice() before the sale is saved, so a Shopee/Grab
  //      sale's item.price is already the correct delivery price.
  //   2. Only if that's missing/zero — which happens for older sales
  //      imported via XLSX, since the "Items" column only stores qty × name
  //      and never a price (see sales-overview.js's import) — fall back to
  //      the CURRENT menu price for the CORRECT order type of this sale
  //      (Delivery vs Dine In), instead of always defaulting to dine-in.
  //      Without checking order type here, every Shopee/Grab (and any
  //      Delivery) sale missing a stored price would silently show the
  //      dine-in price instead of the delivery price.
  function resolveLineItemPrice(sale, item, menuCategoryMap) {
    const storedPrice = parseFloat(item.price);
    if (!isNaN(storedPrice) && storedPrice > 0) return storedPrice;

    const meta = menuCategoryMap[item.name];
    if (!meta) return 0;

    const isDeliverySale = sale.orderType === "Delivery" || isShopeeSale(sale) || isGrabSale(sale);
    return isDeliverySale ? (meta.priceDelivery ?? meta.price ?? 0) : (meta.price ?? 0);
  }

  function renderHourlyReport(rangeSales, mode) {
    const card = document.getElementById("hourlyReportCard");
    const content = document.getElementById("hourlyReportContent");
    const toggleBtn = document.getElementById("hourlyToggleBtn");
    if (!card || !content || !toggleBtn) return;

    // Hourly breakdown only makes sense for a single day
    if (mode !== "day") {
      card.style.display = "none";
      toggleBtn.style.display = "none";
      return;
    }
    toggleBtn.style.display = "inline-block";

    if (!hourlyReportOpen) {
      card.style.display = "none";
      toggleBtn.classList.remove("active");
      return;
    }

    toggleBtn.classList.add("active");
    card.style.display = "block";

    const menuCategoryMap = loadMenuCategoryMap();

    const hourly = Array.from({ length: 24 }, () => ({
      revenue: 0,
      transactions: 0,
      discount: 0,
      cups: 0,
      categoryCups: {} // { matcha: 3, coffee: 1, ... } for this hour
    }));

    rangeSales.forEach(sale => {
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate) return;
      const h = saleDate.getHours();
      const bucket = hourly[h];

      bucket.revenue += parseFloat(sale.total || 0);
      bucket.transactions += 1;
      bucket.discount += parseFloat(sale.discountAmount || 0);

      (sale.items || []).forEach(item => {
        // Add-ons aren't a cup — don't count them toward the 🥤 cup tally
        // or the per-category cup counts, even though they're still a
        // valid line item on the sale.
        if (isAddOn(item.name)) return;

        const qty = item.qty || 0;
        bucket.cups += qty;

        const meta = menuCategoryMap[item.name] || { category: "uncategorized" };
        const rawCat = getSaleBucket(sale, meta);
        const cat = CATEGORY_DISPLAY_NAMES[rawCat] ? rawCat : "uncategorized";
        bucket.categoryCups[cat] = (bucket.categoryCups[cat] || 0) + qty;
      });
    });

    const activeHours = hourly
      .map((data, hour) => ({ hour, ...data }))
      .filter(h => h.transactions > 0);

    if (!activeHours.length) {
      content.innerHTML = `<p style="text-align:center; color:#999;">No sales recorded in this period.</p>`;
      return;
    }

    const maxRevenue = Math.max(...activeHours.map(h => h.revenue));
    const peak = activeHours.reduce((a, b) => (b.revenue > a.revenue ? b : a));

    content.innerHTML = `
      <div class="hourly-peak-banner">
        🔥 Peak Hour: <strong>${formatHourLabel(peak.hour)}</strong> — RM${peak.revenue.toFixed(2)} (${peak.transactions} bill${peak.transactions !== 1 ? "s" : ""}, ${peak.cups} cup${peak.cups !== 1 ? "s" : ""})
      </div>
      <div class="hourly-list">
        ${activeHours.map(h => {
          const avgTicket = h.transactions > 0 ? h.revenue / h.transactions : 0;
          const topCatEntry = Object.entries(h.categoryCups).sort((a, b) => b[1] - a[1])[0];
          const topCatLabel = topCatEntry ? CATEGORY_DISPLAY_NAMES[topCatEntry[0]] || topCatEntry[0] : "–";

          return `
          <div class="hourly-row">
            <div class="hourly-row-main">
              <span class="hourly-time">${formatHourLabel(h.hour)}</span>
              <div class="hourly-bar-track">
                <div class="hourly-bar-fill" style="width:${maxRevenue > 0 ? (h.revenue / maxRevenue) * 100 : 0}%"></div>
              </div>
              <span class="hourly-revenue">RM${h.revenue.toFixed(2)}</span>
            </div>
            <div class="hourly-row-meta">
              <span class="hourly-meta-item">🧾 ${h.transactions} bill${h.transactions !== 1 ? "s" : ""}</span>
              <span class="hourly-meta-item">🥤 ${h.cups} cup${h.cups !== 1 ? "s" : ""}</span>
              <span class="hourly-meta-item">💳 Avg RM${avgTicket.toFixed(2)}</span>
              <span class="hourly-meta-item hourly-top-cat">⭐ ${topCatLabel}</span>
              ${h.discount > 0 ? `<span class="hourly-discount">-RM${h.discount.toFixed(2)} discount</span>` : ""}
            </div>
          </div>
        `;
        }).join("")}
      </div>
    `;
  }

  // === Sales & Cup Summary for a given date range ===
  function renderSummaryForRange(startDate, endDate, mode) {
    const role = localStorage.getItem("mintchaRole");
    const summaryCard = document.getElementById("todaySummaryCard");
    const summaryContent = document.getElementById("todaySummaryContent");
    if (!summaryCard || !summaryContent) return;
    if (role !== "admin") return; // stays hidden for non-admins

    summaryCard.style.display = "block";

    const isToday = mode === "day" && startDate.toDateString() === new Date().toDateString();

    const titleEl = document.getElementById("summaryTitle");
    const dateLabel = document.getElementById("todaySummaryDate");
    if (titleEl) {
      titleEl.textContent = isToday
        ? "Today's Summary"
        : mode === "day" ? "Summary" : mode === "week" ? "Weekly Summary" : "Monthly Summary";
    }
    if (dateLabel) dateLabel.textContent = formatRangeLabel(mode, startDate, endDate);

    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");

    const rangeSales = allSales.filter(sale => {
      if (sale.status === "Refunded") return false;
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate) return false;
      return saleDate >= startDate && saleDate <= endDate;
    });

    // Render (or hide) the Hourly Report panel for this range
    renderHourlyReport(rangeSales, mode);

    let totalRevenue = 0;
    let totalSubtotal = 0;
    let paidCups = 0;
    let freeCups = 0;
    let discountedCups = 0;
    let totalDiscountAmount = 0;
    let totalFreeValue = 0;

    // Category breakdown setup (now includes per-drink counts within each category)
    const menuCategoryMap = loadMenuCategoryMap();
    const categoryTotals = {
      matcha:  { cups: 0, revenue: 0, discount: 0, drinks: {} },
      coffee:  { cups: 0, revenue: 0, discount: 0, drinks: {} },
      dessert: { cups: 0, revenue: 0, discount: 0, drinks: {} },
      uncategorized: { cups: 0, revenue: 0, discount: 0, drinks: {} },
      // Sales collected by Cookiedoh (see isCookiedohSale) — kept separate so
      // it can be tallied against what Cookiedoh reports collecting, and so
      // those drinks don't get double-listed under Matcha/Coffee/Dessert too.
      cookiedoh: { cups: 0, revenue: 0, discount: 0, drinks: {} },
      // Sales collected by Mala Bistro (see isMalaBistroSale) — same
      // separate-bucket treatment as Cookiedoh. `discount` is kept here for
      // structural symmetry with the other buckets, but it can never be
      // incremented in practice (see the second pass below), since Mala
      // Bistro sales never carry a discountAmount.
      mala: { cups: 0, revenue: 0, discount: 0, drinks: {} },
      // Delivery sales, split by platform so each can be reconciled against
      // that platform's own settlement report. Never overlaps with the
      // dine-in categories above or with Cookiedoh/Mala Bistro.
      shopee: { cups: 0, revenue: 0, discount: 0, drinks: {} },
      grab: { cups: 0, revenue: 0, discount: 0, drinks: {} }
    };

    rangeSales.forEach(sale => {
      totalRevenue += parseFloat(sale.total || 0);
      totalSubtotal += parseFloat(sale.subtotal || 0);
      totalDiscountAmount += parseFloat(sale.discountAmount || 0);
      // Add-ons (e.g. "+matcha", "+milk") are excluded from the cup count for
      // this sale — a 1-cup order with an add-on is still 1 cup, not 2.
      const cupsInSale = (sale.items || []).reduce((sum, i) => {
        if (isAddOn(i.name)) return sum;
        return sum + (i.qty || 0);
      }, 0);

      if (sale.discountType === "Free") {
        freeCups += cupsInSale;
        totalFreeValue += parseFloat(sale.subtotal || 0);
      } else if (sale.discountType && sale.discountType !== "None") {
        discountedCups += cupsInSale;
      } else {
        paidCups += cupsInSale;
      }

      // === First pass: bucket this sale's actual line totals by category ===
      // Uses resolveLineItemPrice() as the reference price for splitting a
      // sale's subtotal/discount across categories: the price actually
      // stored on the sale line (which already reflects Dine In vs
      // Delivery pricing) if present, otherwise the CURRENT menu price for
      // the matching order type. The menu-price fallback only kicks in for
      // older sales imported via XLSX, since that import's "Items" column
      // only stores qty × name, so item.price is 0 for those — without a
      // fallback, saleCategorySubtotal would come out as 0 for every
      // category on an imported sale, and the proportional discount split
      // below would always divide out to 0 ("-RM0.00 discount" shown even
      // though the sale-level total is correct).
      // (For imported sales this does mean the split uses today's menu
      // price, not the price actually sold at, if it's since changed —
      // acceptable since it's only used to apportion the discount, not to
      // total up revenue.)
      const saleCategorySubtotal = {};
      (sale.items || []).forEach(item => {
        const meta = menuCategoryMap[item.name] || { category: "uncategorized" };
        // Cookiedoh / Mala Bistro / Shopee Food / Grab Food sales are
        // tallied on their own — never split back into
        // Matcha/Coffee/Dessert/Uncategorized, so nothing gets counted twice.
        const rawCat = getSaleBucket(sale, meta);
        const cat = categoryTotals[rawCat] ? rawCat : "uncategorized";
        const qty = item.qty || 0;
        const linePrice = resolveLineItemPrice(sale, item, menuCategoryMap);
        const lineTotal = linePrice * qty;

        // Add-ons still count toward revenue and still get LISTED in the
        // category's drink breakdown (so "+matcha" shows up under Matcha),
        // but they must NOT add to the "cups" count — that's what drives
        // Total Transaction / Full-Price / Discounted / Free upstream.
        if (!isAddOn(item.name)) {
          categoryTotals[cat].cups += qty;
        }
        categoryTotals[cat].revenue += lineTotal;
        categoryTotals[cat].drinks[item.name] = (categoryTotals[cat].drinks[item.name] || 0) + qty;

        saleCategorySubtotal[cat] = (saleCategorySubtotal[cat] || 0) + lineTotal;
      });

      // === Second pass: spread this sale's discount across categories,
      // proportional to how much of the sale's subtotal each category made up ===
      // Mala Bistro sales never reach this branch with a non-zero
      // saleDiscount (there is no way to apply a discount to that payment
      // method — see order-management.js), so categoryTotals.mala.discount
      // stays 0 and its "-RMx discount" line is never rendered below.
      const saleSubtotal = parseFloat(sale.subtotal || 0);
      const saleDiscount = parseFloat(sale.discountAmount || 0);
      const saleCategorySubtotalSum = Object.values(saleCategorySubtotal).reduce((a, b) => a + b, 0);
      if (saleCategorySubtotalSum > 0 && saleDiscount > 0) {
        Object.entries(saleCategorySubtotal).forEach(([cat, catSubtotal]) => {
          const share = (catSubtotal / saleCategorySubtotalSum) * saleDiscount;
          categoryTotals[cat].discount += share;
        });
      }
    });

    const totalCups = paidCups + freeCups + discountedCups;

    // Friendly empty state if no sales happened in the chosen range at all
    if (!rangeSales.length) {
      summaryContent.innerHTML = `
        <div class="summary-hero">
          <div class="hero-main">
            <span class="label">Total Sales</span>
            <span class="value">RM0.00</span>
          </div>
        </div>
        <p style="text-align:center; color:#999; margin: 10px 0 0;">No sales recorded in this period.</p>
      `;
      return;
    }

    summaryContent.innerHTML = `
      <div class="summary-hero">
        <div class="hero-main">
          <span class="label">Total Sales${isToday ? " Today" : ""}</span>
          <span class="value">RM${totalRevenue.toFixed(2)}</span>
        </div>
        <div class="hero-breakdown">
          <div class="hero-row">
            <span>Subtotal (before discounts)</span>
            <span>RM${totalSubtotal.toFixed(2)}</span>
          </div>
          <div class="hero-row">
            <span>Total Discount Given</span>
            <span>-RM${totalDiscountAmount.toFixed(2)}</span>
          </div>
          <div class="hero-row">
            <span>Free Drinks Value</span>
            <span>-RM${totalFreeValue.toFixed(2)}</span>
          </div>
          <div class="hero-row hero-row-total">
            <span>Grand Total</span>
            <span>RM${totalRevenue.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-box total">
         
          <span class="value">${totalCups}</span>
          <span class="label">Total Transaction</span>
        </div>
        <div class="summary-box paid">
  
          <span class="value">${paidCups}</span>
          <span class="label">Full-Price</span>
        </div>
        <div class="summary-box discount">
     
          <span class="value">${discountedCups}</span>
          <span class="label">Discounted</span>
          <span class="sub-label">-RM${totalDiscountAmount.toFixed(2)}</span>
        </div>
        <div class="summary-box free">
        
          <span class="value">${freeCups}</span>
          <span class="label">Free</span>
          <span class="sub-label">worth RM${totalFreeValue.toFixed(2)}</span>
        </div>
      </div>
     <div class="category-grid">
  ${["matcha", "coffee"].map(cat => `
    <div class="category-box cat-${cat}">
      <span class="cat-badge cat-${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
      <span class="category-cups">${categoryTotals[cat].cups}</span>
      <span class="category-sub">RM${categoryTotals[cat].revenue.toFixed(2)}</span>
      ${categoryTotals[cat].discount > 0 ? `<span class="category-discount">-RM${categoryTotals[cat].discount.toFixed(2)} discount</span>` : ""}
      ${renderCategoryDrinksList(categoryTotals[cat].drinks)}
    </div>
  `).join("")}
   ${categoryTotals.dessert.cups > 0 ? `
    <div class="category-box cat-dessert">
      <span class="cat-badge cat-dessert">Dessert</span>
      <span class="category-cups">${categoryTotals.dessert.cups}</span>
      <span class="category-sub">RM${categoryTotals.dessert.revenue.toFixed(2)}</span>
      ${categoryTotals.dessert.discount > 0 ? `<span class="category-discount">-RM${categoryTotals.dessert.discount.toFixed(2)} discount</span>` : ""}
      ${renderCategoryDrinksList(categoryTotals.dessert.drinks)}
    </div>
  ` : ""}
        ${categoryTotals.cookiedoh.cups > 0 ? `
          <div class="category-box cat-cookiedoh">
            <span class="cat-badge cat-cookiedoh">🍪 Cookiedoh</span>
            <span class="category-cups">${categoryTotals.cookiedoh.cups}</span>
            <span class="category-sub">RM${categoryTotals.cookiedoh.revenue.toFixed(2)}</span>
            ${categoryTotals.cookiedoh.discount > 0 ? `<span class="category-discount">-RM${categoryTotals.cookiedoh.discount.toFixed(2)} discount</span>` : ""}
            ${renderCategoryDrinksList(categoryTotals.cookiedoh.drinks)}
          </div>
        ` : ""}
        ${categoryTotals.mala.cups > 0 ? `
          <div class="category-box cat-mala">
            <span class="cat-badge cat-mala">🌶️ Mala Bistro</span>
            <span class="category-cups">${categoryTotals.mala.cups}</span>
            <span class="category-sub">RM${categoryTotals.mala.revenue.toFixed(2)}</span>
            ${renderCategoryDrinksList(categoryTotals.mala.drinks)}
          </div>
        ` : ""}
        ${categoryTotals.shopee.cups > 0 ? `
          <div class="category-box cat-shopee">
            <span class="cat-badge cat-shopee">🛍️ Shopee Food</span>
            <span class="category-cups">${categoryTotals.shopee.cups}</span>
            <span class="category-sub">RM${categoryTotals.shopee.revenue.toFixed(2)}</span>
            ${categoryTotals.shopee.discount > 0 ? `<span class="category-discount">-RM${categoryTotals.shopee.discount.toFixed(2)} discount</span>` : ""}
            ${renderCategoryDrinksList(categoryTotals.shopee.drinks)}
          </div>
        ` : ""}
        ${categoryTotals.grab.cups > 0 ? `
          <div class="category-box cat-grab">
            <span class="cat-badge cat-grab">🚗 Grab Food</span>
            <span class="category-cups">${categoryTotals.grab.cups}</span>
            <span class="category-sub">RM${categoryTotals.grab.revenue.toFixed(2)}</span>
            ${categoryTotals.grab.discount > 0 ? `<span class="category-discount">-RM${categoryTotals.grab.discount.toFixed(2)} discount</span>` : ""}
            ${renderCategoryDrinksList(categoryTotals.grab.drinks)}
          </div>
        ` : ""}
        ${categoryTotals.uncategorized.cups > 0 ? `
          <div class="category-box cat-uncat">
            <span class="cat-badge cat-uncat">Uncategorized</span>
            <span class="category-cups">${categoryTotals.uncategorized.cups}</span>
            <span class="category-sub">RM${categoryTotals.uncategorized.revenue.toFixed(2)}</span>
            ${categoryTotals.uncategorized.discount > 0 ? `<span class="category-discount">-RM${categoryTotals.uncategorized.discount.toFixed(2)} discount</span>` : ""}
            ${renderCategoryDrinksList(categoryTotals.uncategorized.drinks)}
          </div>
        ` : ""}
      </div>
    `;
  }

  function refreshSummary() {
    const datePicker = document.getElementById("summaryDatePicker");
    if (!datePicker || !datePicker.value) return;
    const [y, m, d] = datePicker.value.split("-").map(Number);
    const refDate = new Date(y, m - 1, d);
    const [start, end] = getRangeForMode(currentViewMode, refDate);
    renderSummaryForRange(start, end, currentViewMode);
  }

 function setupSummaryDatePicker() {
    const datePicker = document.getElementById("summaryDatePicker");
    const todayBtn = document.getElementById("summaryTodayBtn");
    const prevBtn = document.getElementById("summaryPrevBtn");
    const nextBtn = document.getElementById("summaryNextBtn");
    const modeButtons = document.querySelectorAll(".view-mode-btn");
    const hourlyToggleBtn = document.getElementById("hourlyToggleBtn");
    if (!datePicker) return;

    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    datePicker.value = isoToday;
    datePicker.max = isoToday; // can't pick a future date

    datePicker.addEventListener("change", refreshSummary);

    todayBtn?.addEventListener("click", () => {
      datePicker.value = isoToday;
      refreshSummary();
    });

    // === Toggle the Hourly Report panel open/closed ===
    hourlyToggleBtn?.addEventListener("click", () => {
      hourlyReportOpen = !hourlyReportOpen;
      refreshSummary();
    });

    // === Step the picker's date backward/forward by one unit of the
    // current view mode (1 day / 1 week / 1 month), then re-render ===
    function shiftRange(direction) {
      if (!datePicker.value) return;
      const [y, m, d] = datePicker.value.split("-").map(Number);
      const refDate = new Date(y, m - 1, d);

      if (currentViewMode === "day") {
        refDate.setDate(refDate.getDate() + direction);
      } else if (currentViewMode === "week") {
        refDate.setDate(refDate.getDate() + direction * 7);
      } else if (currentViewMode === "month") {
        refDate.setMonth(refDate.getMonth() + direction);
      }

      // Don't allow navigating into the future past today
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      if (refDate > todayMidnight) return;

      const isoStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}-${String(refDate.getDate()).padStart(2, "0")}`;
      datePicker.value = isoStr;
      refreshSummary();
    }

    prevBtn?.addEventListener("click", () => shiftRange(-1));
    nextBtn?.addEventListener("click", () => shiftRange(1));

    modeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        modeButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentViewMode = btn.dataset.mode;
        refreshSummary();
      });
    });
  }

  // === Single entry point for "re-check everything and redraw" ===
  // Both the summary/category boxes and the Low Stock Alerts list are pure
  // reads from localStorage, so it's always safe to just recompute both
  // together whenever there's a chance the underlying data changed.
  function refreshDashboardData() {
    refreshSummary();
    renderLowStockAlerts();
  }

  setupSummaryDatePicker();
  setupDataMaintenance();
  refreshDashboardData();

  // === Keep the Dashboard live instead of "correct only at the moment it
  // first loaded" ===
  // Without this, Low Stock Alerts / Today's Summary are computed exactly
  // once, on DOMContentLoaded. That goes stale in two common situations:
  //
  //   1. Another browser TAB writes to localStorage (e.g. a cashier
  //      checks out an order in Order Management, or an admin edits
  //      quantity in Stock Overview) while this Dashboard tab is already
  //      open — the 'storage' event fires in every OTHER tab when that
  //      happens, so we listen for it here and re-render.
  //
  //   2. Navigating back to this tab via the browser's Back/Forward
  //      button can restore the page from bfcache without re-running any
  //      script at all (DOMContentLoaded never fires again) — so it can
  //      keep showing "✅ All stock levels are sufficient" even after a
  //      sale just dropped something below threshold. 'pageshow' with
  //      event.persisted === true catches exactly this case.
  //
  // A visibilitychange listener is added as a cheap extra safety net for
  // same-tab cases the two above don't cover (e.g. switching to this tab
  // after editing stock elsewhere in the same tab's history).
  //
  // NOTE: "menuItems" is included here (not just mintcha_stock /
  // mintcha_sales) because editing a recipe's ingredient quantities on the
  // Menu Recipes page can change a stock item's computed "servings
  // remaining" even though the stock item itself was never touched.
  window.addEventListener("storage", (e) => {
    if (["mintcha_stock", "mintcha_sales", "menuItems"].includes(e.key)) {
      refreshDashboardData();
    }
  });

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) refreshDashboardData();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDashboardData();
  });
});