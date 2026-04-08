/* ── Config ─────────────────────────────────────────────────────────────── */
const IS_LOCAL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.protocol === "file:";

const RENDER_BACKEND_URL = "https://your-backend-name.onrender.com";
const API = IS_LOCAL ? "http://localhost:8080" : RENDER_BACKEND_URL;

let selectedPriority = "ROUTINE";

/* ── Clock ──────────────────────────────────────────────────────────────── */
function tick() {
  document.getElementById("clock").textContent = new Date().toLocaleTimeString(
    "en-US",
    { hour12: false },
  );
}
tick();
setInterval(tick, 1000);

/* ── Priority pills ─────────────────────────────────────────────────────── */
document.querySelectorAll(".pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document
      .querySelectorAll(".pill")
      .forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    selectedPriority = pill.dataset.p;
  });
});

/* ── Tabs ───────────────────────────────────────────────────────────────── */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});
function switchTab(name) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}

/* ── Button wiring ──────────────────────────────────────────────────────── */
document.getElementById("btn-submit").addEventListener("click", submitOrder);
document.getElementById("btn-claim").addEventListener("click", claimNext);
document.getElementById("btn-undo").addEventListener("click", undoLast);
document
  .getElementById("btn-triage")
  .addEventListener("click", applyTriageStrategy);

/* ── Notification toggles ───────────────────────────────────────────────── */
document
  .getElementById("ch-console")
  .addEventListener("change", (e) =>
    setNotifChannel("console", e.target.checked),
  );
document
  .getElementById("ch-inapp")
  .addEventListener("change", (e) =>
    setNotifChannel("inapp", e.target.checked),
  );
document
  .getElementById("ch-email")
  .addEventListener("change", (e) =>
    setNotifChannel("email", e.target.checked),
  );

/* ── Notification panel store ───────────────────────────────────────────── */
const notifMessages = [];

function addNotification(order, event) {
  notifMessages.unshift({
    title: `${event} — ${order.type || ""} #${(order.id || "").slice(0, 8)}`,
    body: `Patient: ${order.patientName || "—"}  ·  Priority: ${order.priority || "—"}`,
    time: new Date().toLocaleTimeString("en-US", { hour12: false }),
  });
  if (notifMessages.length > 50) notifMessages.pop(); // cap at 50
  renderNotifPanel();
}

function renderNotifPanel() {
  const list = document.getElementById("notif-list");
  if (!notifMessages.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = notifMessages
    .map(
      (n) => `
    <div class="notif-item">
      <div class="notif-item-title">
        <span>${n.title}</span>
        <span class="notif-item-time">${n.time}</span>
      </div>
      <div class="notif-item-body">${n.body}</div>
    </div>`,
    )
    .join("");
}

/* ── Badge / panel toggle ───────────────────────────────────────────────── */
document.getElementById("badge-wrap").addEventListener("click", async (e) => {
  const panel = document.getElementById("notif-panel");
  const isOpen = panel.classList.contains("open");
  if (isOpen) {
    panel.classList.remove("open");
    // reset badge when closing
    await apiFetch("/api/notifications/badge/reset", { method: "POST" }).catch(
      () => {},
    );
    updateBadge(0);
  } else {
    panel.classList.add("open");
  }
});

// Close panel when clicking outside
document.addEventListener("click", (e) => {
  if (!document.getElementById("badge-wrap").contains(e.target)) {
    document.getElementById("notif-panel").classList.remove("open");
  }
});

document.getElementById("notif-clear").addEventListener("click", async (e) => {
  e.stopPropagation();
  notifMessages.length = 0;
  renderNotifPanel();
  await apiFetch("/api/notifications/badge/reset", { method: "POST" }).catch(
    () => {},
  );
  updateBadge(0);
  document.getElementById("notif-panel").classList.remove("open");
});

/* ── API helpers ────────────────────────────────────────────────────────── */
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ── Submit Order ───────────────────────────────────────────────────────── */
async function submitOrder() {
  const patient = document.getElementById("f-patient").value.trim();
  const clinician = document.getElementById("f-clinician").value.trim();
  const type = document.getElementById("f-type").value;
  const desc = document.getElementById("f-desc").value.trim();
  if (!patient || !clinician || !desc) {
    toast("Please fill in all fields.", "error");
    return;
  }
  try {
    await apiFetch("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        orderType: type,
        patientName: patient,
        clinician,
        description: desc,
        priority: selectedPriority,
      }),
    });
    document.getElementById("f-patient").value = "";
    document.getElementById("f-desc").value = "";
    toast("Order submitted.", "success");
    refresh();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Claim Next ─────────────────────────────────────────────────────────── */
async function claimNext() {
  const staff = document.getElementById("staff-name").value.trim();
  if (!staff) {
    toast("Enter your staff name first.", "error");
    return;
  }
  try {
    const o = await apiFetch("/api/orders/claim", {
      method: "POST",
      body: JSON.stringify({ staffMember: staff }),
    });
    toast(`Claimed order ${o.id} (${o.type}).`, "success");
    refresh();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Complete ───────────────────────────────────────────────────────────── */
async function completeOrder(id) {
  const staff = document.getElementById("staff-name").value.trim();
  if (!staff) {
    toast("Enter your staff name first.", "error");
    return;
  }
  try {
    await apiFetch(`/api/orders/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ staffMember: staff }),
    });
    toast(`Order ${id} completed.`, "success");
    refresh();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Cancel ─────────────────────────────────────────────────────────────── */
async function cancelOrder(id) {
  const actor = document.getElementById("staff-name").value.trim() || "System";
  if (!confirm(`Cancel order ${id}?`)) return;
  try {
    await apiFetch(`/api/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ actor }),
    });
    toast(`Order ${id} cancelled.`, "success");
    refresh();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Undo (Change 3) ────────────────────────────────────────────────────── */
async function undoLast() {
  try {
    await apiFetch("/api/commands/undo", { method: "POST" });
    toast("Last action undone.", "success");
    refresh();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Replay (Change 3) ──────────────────────────────────────────────────── */
async function replayCommand(orderId, commandType) {
  if (!confirm(`Replay ${commandType} on order ${orderId}?`)) return;
  try {
    await apiFetch("/api/commands/replay", {
      method: "POST",
      body: JSON.stringify({ orderId, commandType }),
    });
    toast(`Replayed ${commandType} on ${orderId}.`, "success");
    refresh();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Triage Strategy (Change 1) ─────────────────────────────────────────── */
async function applyTriageStrategy() {
  const strategy = document.getElementById("triage-select").value;
  try {
    const res = await apiFetch("/api/triage/strategy", {
      method: "POST",
      body: JSON.stringify({ strategy }),
    });
    toast(`Triage strategy: ${res.active}`, "success");
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Notification Channel Toggle (Change 2a) ────────────────────────────── */
async function setNotifChannel(channel, enabled) {
  try {
    await apiFetch("/api/notifications/preferences", {
      method: "POST",
      body: JSON.stringify({ channel, enabled }),
    });
    toast(
      `${channel} notifications ${enabled ? "enabled" : "disabled"}.`,
      "success",
    );
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ── Badge counter ──────────────────────────────────────────────────────── */
function updateBadge(count) {
  const el = document.getElementById("badge-count");
  if (count > 0) {
    el.textContent = count;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

/* ── Undo button state ──────────────────────────────────────────────────── */
async function syncUndoButton() {
  try {
    const res = await apiFetch("/api/commands/undo/available");
    document.getElementById("btn-undo").disabled = !res.canUndo;
  } catch (_) {}
}

/* ── Rendering helpers ──────────────────────────────────────────────────── */
function priorityBadge(p) {
  return `<span class="badge badge-${p}">${p}</span>`;
}
function statusDot(s) {
  return `<span class="status-dot"><span class="dot dot-${s}"></span>${s.replace("_", " ")}</span>`;
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/* ── Render: Queue tab ──────────────────────────────────────────────────── */
function renderQueue(orders) {
  const tbody = document.getElementById("queue-body");
  const empty = document.getElementById("queue-empty");
  const pending = orders.filter((o) => o.status === "PENDING");

  document.getElementById("queue-count").textContent =
    `${pending.length} order${pending.length !== 1 ? "s" : ""} pending`;
  document.getElementById("s-pending").textContent = pending.length;
  document.getElementById("s-progress").textContent = orders.filter(
    (o) => o.status === "IN_PROGRESS",
  ).length;
  document.getElementById("s-done").textContent = orders.filter(
    (o) => o.status === "COMPLETED",
  ).length;

  if (!pending.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  tbody.innerHTML = pending
    .map(
      (o, i) => `
    <tr>
      <td style="color:var(--grey-3)">${i + 1}</td>
      <td style="font-weight:500;color:var(--grey-5)">${o.id}</td>
      <td>${o.type}</td>
      <td>${o.patientName}</td>
      <td>${o.clinician}</td>
      <td>${priorityBadge(o.priority)}</td>
      <td style="color:var(--grey-4)">${fmtTime(o.submittedAt)}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-danger" onclick="cancelOrder('${o.id}')">Cancel</button>
      </div></td>
    </tr>`,
    )
    .join("");
}

/* ── Render: All Orders tab ─────────────────────────────────────────────── */
function renderAll(orders) {
  const tbody = document.getElementById("all-body");
  const empty = document.getElementById("all-empty");
  const sorted = [...orders].sort(
    (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt),
  );

  if (!sorted.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  tbody.innerHTML = sorted
    .map((o) => {
      const actions = [];
      if (o.status === "IN_PROGRESS")
        actions.push(
          `<button class="btn btn-sm btn-ok" onclick="completeOrder('${o.id}')">Complete</button>`,
        );
      if (o.status === "PENDING")
        actions.push(
          `<button class="btn btn-sm btn-danger" onclick="cancelOrder('${o.id}')">Cancel</button>`,
        );
      if (o.status === "CANCELLED")
        actions.push(
          `<button class="btn btn-sm btn-replay" onclick="replayCommand('${o.id}','SUBMIT')">↺ Re-submit</button>`,
        );
      return `<tr>
      <td style="font-weight:500;color:var(--grey-5)">${o.id}</td>
      <td>${o.type}</td><td>${o.patientName}</td><td>${o.clinician}</td>
      <td>${priorityBadge(o.priority)}</td>
      <td>${statusDot(o.status)}</td>
      <td style="color:var(--grey-4)">${o.claimedBy || "—"}</td>
      <td><div class="actions">${actions.join("")}</div></td>
    </tr>`;
    })
    .join("");
}

/* ── Render: Audit Trail tab ────────────────────────────────────────────── */
function renderAudit(log) {
  const list = document.getElementById("audit-list");
  const empty = document.getElementById("audit-empty");
  const reversed = [...log].reverse();
  if (!reversed.length) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.innerHTML = reversed
    .map(
      (e) => `
    <div class="log-entry">
      <span class="log-type lt-${e.commandType.split("_")[0]}">${e.commandType}</span>
      <span class="log-detail">Order <strong>${e.orderId}</strong> · ${e.actor}</span>
      <span class="log-time">${fmtTime(e.timestamp)}</span>
    </div>`,
    )
    .join("");
}

/* ── Refresh ────────────────────────────────────────────────────────────── */
async function refresh() {
  try {
    const [orders, auditLog, notifPrefs] = await Promise.all([
      apiFetch("/api/orders"),
      apiFetch("/api/audit"),
      apiFetch("/api/notifications/preferences"),
    ]);
    detectAndNotify(orders);
    renderQueue(orders);
    renderAll(orders);
    renderAudit(auditLog);

    // Sync badge count
    if (notifPrefs.badgeCount !== undefined) updateBadge(notifPrefs.badgeCount);

    // Sync notification checkboxes
    if (notifPrefs.console !== undefined) {
      document.getElementById("ch-console").checked = notifPrefs.console;
      document.getElementById("ch-inapp").checked = notifPrefs.inApp;
      document.getElementById("ch-email").checked = notifPrefs.email;
    }

    syncUndoButton();
  } catch (_) {}
}

/* ── Toast ──────────────────────────────────────────────────────────────── */
function toast(msg, type = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ── Order state tracker for notifications ──────────────────────────────── */
let prevOrderStates = {};

function detectAndNotify(orders) {
  const inapp = document.getElementById("ch-inapp").checked;
  if (!inapp) return;
  orders.forEach((o) => {
    const prev = prevOrderStates[o.id];
    if (prev && prev !== o.status) {
      addNotification(o, `${prev} → ${o.status}`);
    } else if (!prev) {
      // new order appeared
      addNotification(o, "SUBMITTED");
    }
    prevOrderStates[o.id] = o.status;
  });
}

/* ── Boot ───────────────────────────────────────────────────────────────── */
refresh();
setInterval(refresh, 3000);
