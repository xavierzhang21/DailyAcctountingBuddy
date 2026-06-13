import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAzwDJXxVprr1eqbk50AIC7xJ4wzlNquP4",
  authDomain: "citywishlist.firebaseapp.com",
  databaseURL: "https://citywishlist-default-rtdb.firebaseio.com",
  projectId: "citywishlist",
  storageBucket: "citywishlist.appspot.com",
  messagingSenderId: "614857649281",
  appId: "1:614857649281:web:b179bae834eb93c8113180",
  measurementId: "G-NWHHNVE49C"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

const usernameKey = "dailyAccountingBuddyUsername";
let currentUsername = "";
let recordsCol = null;
let unsubscribeRecords = null;

let data = [];

// ===== Utils =====
function now() {
  const d = new Date();
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const H = String(d.getHours()).padStart(2, "0");
  const Mi = String(d.getMinutes()).padStart(2, "0");

  return {
    ym: `${Y}-${M}`,
    time: `${Y}-${M}-${D} ${H}:${Mi}`
  };
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ===== DOM (inside DOMContentLoaded) =====
document.addEventListener("DOMContentLoaded", function () {
  const priceEl    = document.getElementById("price");
  const typeEl     = document.getElementById("type");
  const categoryEl = document.getElementById("category");
  const noteEl     = document.getElementById("note");
  const usernameEl = document.getElementById("username");
  const currentUserEl = document.getElementById("currentUser");
  const incomeEl   = document.getElementById("income");
  const expenseEl  = document.getElementById("expense");
  const balanceEl  = document.getElementById("balance");

  function getSavedUsername() {
    return localStorage.getItem(usernameKey) || "";
  }

  function saveUsername(username) {
    localStorage.setItem(usernameKey, username);
  }

  function sanitizeUsername(raw) {
    return raw.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  }

  function updateCurrentUserDisplay(username) {
    if (currentUserEl) {
      currentUserEl.textContent = username ? `Current user: ${username}` : "Current user: not set";
    }
  }

  function getRecordsCollection(username) {
    if (!username) {
      return collection(db, "users", "guest", "records");
    }
    return collection(db, "users", username, "records");
  }

  function bindToUser(username) {
    if (unsubscribeRecords) {
      unsubscribeRecords();
      unsubscribeRecords = null;
    }

    currentUsername = username || "guest";
    recordsCol = getRecordsCollection(currentUsername);
    updateCurrentUserDisplay(currentUsername);

    const recordsQuery = query(recordsCol, orderBy("time", "desc"));
    unsubscribeRecords = onSnapshot(recordsQuery, snapshot => {
      data = snapshot.docs.map(docEntry => ({ id: docEntry.id, ...docEntry.data() }));
      render();
    }, error => {
      console.error("Realtime update failed:", error);
    });
  }

  function setUsername() {
    const raw = usernameEl ? usernameEl.value.trim() : "";
    const username = sanitizeUsername(raw);
    if (!username) {
      alert("Please enter a valid username (letters, numbers, dashes, or underscores).");
      return;
    }

    saveUsername(username);
    bindToUser(username);
  }

  async function add() {
    let val = priceEl.value.trim();
    let price = parseFloat(val);

    if (isNaN(price) || price <= 0) {
      alert("Please enter a valid amount like 10.50");
      priceEl.focus();
      return;
    }

    const type = typeEl.value;
    const cat  = categoryEl.value;
    const note = noteEl.value.trim();
    const t    = now();

    try {
      await addDoc(recordsCol, {
        price,
        type,
        cat,
        note,
        ym: t.ym,
        time: t.time
      });

      priceEl.value = "";
      noteEl.value  = "";
    } catch (error) {
      alert("Failed to save record: " + error.message);
    }
  }

  async function del(id) {
    try {
      await deleteDoc(doc(db, "records", id));
    } catch (error) {
      alert("Failed to delete record: " + error.message);
    }
  }

  async function clearAll() {
    if (!currentUsername) {
      alert("Please set a username before clearing history.");
      return;
    }

    if (!confirm("Clear all history from the app and database? This cannot be undone.")) {
      return;
    }

    try {
      const snapshot = await getDocs(recordsCol);
      const deletePromises = snapshot.docs.map(docEntry => deleteDoc(doc(db, "users", currentUsername, "records", docEntry.id)));
      await Promise.all(deletePromises);
    } catch (error) {
      alert("Failed to clear history: " + error.message);
    }
  }

  function parseCsvLine(line) {
    const fields = [];
    let value = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        fields.push(value);
        value = "";
        continue;
      }

      value += char;
    }

    fields.push(value);
    return fields;
  }

  async function processCsvContent(text) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
      alert("CSV file must contain a header row and at least one record.");
      return;
    }

    const header = parseCsvLine(lines[0]).map(cell => cell.trim().toLowerCase());
    const timeIndex = header.findIndex(h => h === "time" || h === "时间");
    const typeIndex = header.findIndex(h => h === "type" || h === "类型");
    const categoryIndex = header.findIndex(h => h === "category" || h === "分类");
    const amountIndex = header.findIndex(h => h === "amount" || h === "金额");
    const noteIndex = header.findIndex(h => h === "note" || h === "备注");

    if (typeIndex === -1 || categoryIndex === -1 || amountIndex === -1) {
      alert("CSV header must include Type, Category, and Amount columns.");
      return;
    }

    const importPromises = [];
    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const price = parseFloat(fields[amountIndex] || "");
      if (isNaN(price) || price <= 0) continue;

      const type = (fields[typeIndex] || "out").trim();
      const cat = (fields[categoryIndex] || "Other").trim();
      const note = (noteIndex !== -1 ? (fields[noteIndex] || "").trim() : "").trim();
      const time = timeIndex !== -1 && fields[timeIndex] ? fields[timeIndex].trim() : now().time;
      const ym = time ? time.slice(0, 7) : now().ym;

      importPromises.push(addDoc(recordsCol, {
        price,
        type,
        cat,
        note,
        ym,
        time
      }));
      importedCount++;
    }

    try {
      await Promise.all(importPromises);
      alert(`Imported ${importedCount} record${importedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      alert("Failed to import CSV: " + error.message);
    }
  }

  function importCSV() {
    const fileInput = document.getElementById("csvFile");
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
  }

  const csvFileInput = document.getElementById("csvFile");
  if (csvFileInput) {
    csvFileInput.addEventListener("change", event => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        processCsvContent(String(e.target.result));
      };
      reader.onerror = () => {
        alert("Unable to read CSV file.");
      };
      reader.readAsText(file, "UTF-8");
    });
  }

  window.del = del;

  function stats() {
    const currentYm = now().ym;
    let income  = 0;
    let expense = 0;

    data.forEach(r => {
      if (r.ym !== currentYm) return;
      if (r.type === "in") income  += r.price;
      else                  expense += r.price;
    });

    incomeEl.textContent  = income.toFixed(2);
    expenseEl.textContent = expense.toFixed(2);
    balanceEl.textContent = (income - expense).toFixed(2);
  }

  let trendChart;

  function trend() {
    const canvas = document.getElementById("trend");
    if (!canvas) return;

    const map = {};

    data.forEach(r => {
      if (!map[r.ym]) map[r.ym] = 0;
      if (r.type === "out") map[r.ym] += r.price;
    });

    const labels = Object.keys(map).sort();
    const values = labels.map(m => map[m]);
    const ctx = canvas.getContext("2d");

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Monthly Expense",
          data: values,
          borderColor: "#00A395",
          backgroundColor: "rgba(0,163,149,0.1)",
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  let pieChart;

  function pie() {
    const canvas = document.getElementById("pie");
    if (!canvas) return;

    const map = {};

    data.forEach(r => {
      if (r.type !== "out") return;
      if (!map[r.cat]) map[r.cat] = 0;
      map[r.cat] += r.price;
    });

    const labels = Object.keys(map);
    const values = labels.map(k => map[k]);
    const ctx = canvas.getContext("2d");

    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: [
            "#00A395", "#5AC8BE", "#A7F3E7", "#81E9D9", "#4FC9B9",
            "#33B5A7", "#68C2B5", "#9AD3CB", "#BEEAE3", "#D5F3EE", "#A0D9D0"
          ]
        }]
      },
      options: {
        responsive: true
      }
    });
  }

  function list() {
    const box = document.getElementById("records");
    if (!box) return;
    box.innerHTML = "";

    const groups = {};

    data.forEach(r => {
      if (!groups[r.ym]) groups[r.ym] = [];
      groups[r.ym].push(r);
    });

    Object.keys(groups)
      .sort()
      .reverse()
      .forEach(month => {
        const h = document.createElement("div");
        h.className   = "month";
        h.textContent = month;
        box.appendChild(h);

        groups[month]
          .sort((a, b) => b.time.localeCompare(a.time))
          .forEach(r => {
            const div = document.createElement("div");
            div.className = "record";

            const sign = r.type === "in" ? "+" : "-";
            const cls  = r.type === "in" ? "income" : "expense";
            const safeNote = r.note ? "· " + escapeHTML(r.note) : "";
            const safeCat  = escapeHTML(r.cat);
            const safeTime = escapeHTML(r.time);

            div.innerHTML = `
              <div>
                <div>${safeCat}</div>
                <div class="meta">${safeTime} ${safeNote}</div>
              </div>
              <div class="${cls}">
                ${sign}${r.price.toFixed(2)}
                <span class="del" onclick="del('${r.id}')">🗑️</span>
              </div>
            `;

            box.appendChild(div);
          });
      });
  }

  function escapeCsvField(value) {
    const str = String(value == null ? "" : value);
    return `"${str.replace(/"/g, '""')}"`;
  }

  function exportCSV() {
    const rows = [["Time", "Type", "Category", "Amount", "Note"].map(escapeCsvField).join(",")];

    data.forEach(r => {
      rows.push([r.time, r.type, r.cat, r.price, r.note || ""].map(escapeCsvField).join(","));
    });

    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8"
    });

    const a = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "records.csv";
    a.click();
  }

  window.exportCSV = window.exportCSV || exportCSV;

  function render() {
    stats();
    trend();
    pie();
    list();
  }

  priceEl.addEventListener("keypress", e => {
    if (e.key === "Enter") add();
  });

  window.add = add;

  const savedUser = getSavedUsername();
  if (savedUser) {
    usernameEl.value = savedUser;
    bindToUser(savedUser);
  } else {
    bindToUser("guest");
  }

  const setUserButton = document.getElementById("setUsername");
  if (setUserButton) {
    setUserButton.addEventListener("click", setUsername);
  }
}); // end DOMContentLoaded
