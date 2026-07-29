// === js/backup.js ===
// Full-data backup/restore for Mintcha POS.
//
// Why this exists: with Firebase removed, everything lives only in this
// browser's localStorage on this one computer. There is no cloud copy.
// A browser cache clear, OS reinstall, or "reset this browser profile"
// wipes ALL sales/stock/menu history with no warning and no undo.
//
// This gives you one JSON file that captures everything, a one-click
// restore, and a reminder banner so backing up doesn't rely on remembering.

const BACKUP_KEYS = [
  "mintcha_sales",
  "menuItems",
  "mintcha_stock",
  "mintcha_usage",
  "mintcha_order_counter",
  "users"
];

const LAST_BACKUP_KEY = "mintcha_last_backup_at";
const SNOOZE_KEY = "mintcha_backup_snooze_until";
const REMINDER_AFTER_DAYS = 3;

// === Collect everything into one object ===
function collectBackupData() {
  const data = {};
  BACKUP_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try {
        data[key] = JSON.parse(raw);
      } catch (err) {
        // Store the raw string if it wasn't JSON for some reason —
        // better to keep it than silently drop it from the backup.
        data[key] = raw;
      }
    }
  });
  return data;
}

// === Download a full backup as a .json file ===
function downloadBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "Mintcha POS",
    data: collectBackupData()
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `mintcha_backup_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  localStorage.removeItem(SNOOZE_KEY);
  refreshBackupUI();
}

// === Restore from a previously-downloaded backup file ===
function restoreBackupFromFile(file) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    let parsed;
    try {
      parsed = JSON.parse(evt.target.result);
    } catch (err) {
      alert("❌ That file isn't a valid backup (couldn't parse JSON).");
      return;
    }

    const data = parsed.data || parsed; // tolerate a raw data object too
    const foundKeys = BACKUP_KEYS.filter(k => data[k] !== undefined);

    if (!foundKeys.length) {
      alert("❌ This file doesn't look like a Mintcha backup — no recognizable data found.");
      return;
    }

    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : "an unknown time";
    const confirmed = confirm(
      `⚠️ This will REPLACE your current sales, stock, menu, and usage data with the backup taken on ${when}.\n\n` +
      `Anything entered since that backup will be lost. This cannot be undone.\n\n` +
      `Continue?`
    );
    if (!confirmed) return;

    foundKeys.forEach(key => {
      localStorage.setItem(key, JSON.stringify(data[key]));
    });

    alert(`✅ Restored ${foundKeys.length} data set(s) from backup. The page will now reload.`);
    location.reload();
  };
  reader.readAsText(file);
}

// === Reminder banner logic ===
function getDaysSinceLastBackup() {
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  if (!last) return Infinity; // never backed up
  const diffMs = Date.now() - new Date(last).getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function isSnoozed() {
  const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
  return snoozeUntil && Date.now() < new Date(snoozeUntil).getTime();
}

function snoozeBackupReminder(days = 1) {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  localStorage.setItem(SNOOZE_KEY, until.toISOString());
  refreshBackupUI();
}

// === Render/refresh the Dashboard backup card ===
function refreshBackupUI() {
  const card = document.getElementById("backupCard");
  const lastText = document.getElementById("lastBackupText");
  const banner = document.getElementById("backupReminderBanner");
  if (!card) return; // not on a page with the backup card

  const role = localStorage.getItem("mintchaRole");
  if (role !== "admin") {
    card.style.display = "none";
    if (banner) banner.style.display = "none";
    return;
  }
  card.style.display = "block";

  const last = localStorage.getItem(LAST_BACKUP_KEY);
  if (lastText) {
    lastText.textContent = last
      ? `Last backup: ${new Date(last).toLocaleString()}`
      : "Last backup: never — please back up now.";
  }

  const daysSince = getDaysSinceLastBackup();
  const overdue = daysSince >= REMINDER_AFTER_DAYS;

  if (banner) {
    banner.style.display = (overdue && !isSnoozed()) ? "flex" : "none";
  }
}

function initBackupUI() {
  const downloadBtn = document.getElementById("downloadBackupBtn");
  const restoreInput = document.getElementById("restoreBackupInput");
  const restoreTriggerBtn = document.getElementById("restoreBackupTriggerBtn");
  const snoozeBtn = document.getElementById("snoozeBackupBtn");
  const bannerDownloadBtn = document.getElementById("bannerDownloadBackupBtn");

  downloadBtn?.addEventListener("click", downloadBackup);
  bannerDownloadBtn?.addEventListener("click", downloadBackup);

  restoreTriggerBtn?.addEventListener("click", () => restoreInput?.click());
  restoreInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) restoreBackupFromFile(file);
    e.target.value = ""; // allow re-selecting the same file later
  });

  snoozeBtn?.addEventListener("click", () => snoozeBackupReminder(1));

  refreshBackupUI();
}

document.addEventListener("DOMContentLoaded", initBackupUI);