import {
  CLIENT_MESSAGE_TYPES,
  SERVER_MESSAGE_TYPES,
  TASK_STATUSES,
  createClientMessage,
  parseServerMessage,
} from "/lib/protocol.mjs";

const STATUS_LABELS = Object.freeze({
  [TASK_STATUSES.COMPLETED]: "成功",
  [TASK_STATUSES.COMPLETED_WITH_ERRORS]: "有错误",
  [TASK_STATUSES.FAILED]: "失败",
});

const inputEl = document.getElementById("inputEl");
const sendBtn = document.getElementById("sendBtn");
const statusBadge = document.getElementById("statusBadge");
const planBody = document.getElementById("planBody");
const planEmpty = document.getElementById("planEmpty");
const planActions = document.getElementById("planActions");
const approveBtn = document.getElementById("approveBtn");
const rejectBtn = document.getElementById("rejectBtn");
const rejectInput = document.getElementById("rejectInput");
const rejectConfirmRow = document.getElementById("rejectConfirmRow");
const execLog = document.getElementById("execLog");
const reflectEmpty = document.getElementById("reflectEmpty");
const reflectContent = document.getElementById("reflectContent");
const historyEmpty = document.getElementById("historyEmpty");
const historyList = document.getElementById("historyList");

let ws = null;
let busy = false;
let currentPlan = null;

window.approvePlan = approvePlan;
window.toggleReject = toggleReject;
window.submitReject = submitReject;
window.sendGoal = sendGoal;

function setStatus(text, isBusy) {
  statusBadge.textContent = text;
  statusBadge.className = `status-badge${isBusy ? " busy" : ""}`;
  busy = isBusy;
  sendBtn.disabled = isBusy;
  inputEl.disabled = isBusy;
}

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen = () => setStatus("已连接", false);
  ws.onclose = () => {
    setStatus("已断开", false);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => setStatus("连接错误", false);
  ws.onmessage = (event) => handleIncomingMessage(event.data);
}

function handleIncomingMessage(rawData) {
  try {
    const message = parseServerMessage(JSON.parse(rawData));
    handleMessage(message);
  } catch (error) {
    addLog("step-failed", "❌ 协议错误", error.message);
  }
}

function send(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function handleMessage(message) {
  switch (message.type) {
    case SERVER_MESSAGE_TYPES.READY:
      setStatus("就绪", false);
      break;
    case SERVER_MESSAGE_TYPES.HISTORY_LOADED:
    case SERVER_MESSAGE_TYPES.HISTORY_UPDATED:
      renderHistory(message.items);
      break;
    case SERVER_MESSAGE_TYPES.PLANNING:
      handlePlanning(message);
      break;
    case SERVER_MESSAGE_TYPES.PLAN_READY:
      currentPlan = message.plan;
      renderPlan(message.plan);
      setStatus("等待确认", true);
      break;
    case SERVER_MESSAGE_TYPES.EXECUTING:
      setStatus("执行中…", true);
      addLog("info", `⚙️ ${message.message}`);
      planActions.style.display = "none";
      break;
    case SERVER_MESSAGE_TYPES.STEP_START:
      updateStepUI(message.stepId, "running");
      addLog("step-start", `▶ 步骤 ${message.stepId}：${message.title}`, message.tool !== "none" ? `工具：${message.tool}` : null);
      break;
    case SERVER_MESSAGE_TYPES.STEP_DONE:
      updateStepUI(message.stepId, "done");
      addLog("step-done", `✓ 步骤 ${message.stepId} 完成`, message.result);
      break;
    case SERVER_MESSAGE_TYPES.STEP_FAILED:
      updateStepUI(message.stepId, "failed");
      addLog("step-failed", `✗ 步骤 ${message.stepId} 失败`, message.error || message.result);
      break;
    case SERVER_MESSAGE_TYPES.REFLECTING:
      setStatus("反思中…", true);
      addLog("info", `💭 ${message.message}`);
      break;
    case SERVER_MESSAGE_TYPES.REFLECT_READY:
      reflectEmpty.style.display = "none";
      reflectContent.style.display = "block";
      reflectContent.textContent = message.reflection;
      setStatus("完成", false);
      addLog("info", "✅ 任务完成");
      currentPlan = null;
      break;
    case SERVER_MESSAGE_TYPES.ERROR:
      setStatus("出错", false);
      addLog("step-failed", "❌ 错误", message.message);
      planActions.style.display = "none";
      currentPlan = null;
      break;
    default:
      addLog("step-failed", "❌ 未知消息", JSON.stringify(message));
  }
}

function handlePlanning(message) {
  setStatus("规划中…", true);
  addLog("info", `🤔 ${message.message}`);
  currentPlan = null;
  planActions.style.display = "none";
  planEmpty.textContent = "正在生成计划…";
  planEmpty.style.display = "block";
  planBody.querySelectorAll(".plan-goal, .step-item").forEach((element) => element.remove());
  reflectEmpty.style.display = "block";
  reflectContent.style.display = "none";
}

function renderPlan(plan) {
  planEmpty.style.display = "none";
  planBody.querySelectorAll(".plan-goal, .step-item").forEach((element) => element.remove());

  const goalEl = document.createElement("div");
  goalEl.className = "plan-goal";
  goalEl.textContent = `目标：${plan.goal}`;
  planBody.appendChild(goalEl);

  for (const step of plan.steps) {
    const el = document.createElement("div");
    el.className = "step-item";
    el.id = `step-${step.id}`;
    el.innerHTML = `
      <div class="step-header">
        <div class="step-num">${step.id}</div>
        <div class="step-title">${escapeHtml(step.title)}</div>
        <div class="step-tool">${escapeHtml(step.tool)}</div>
      </div>
      <div class="step-reason">${escapeHtml(step.reason)}</div>
    `;
    planBody.appendChild(el);
  }

  planActions.style.display = "flex";
  approveBtn.disabled = false;
  rejectBtn.disabled = false;
  hideRejectInput();
}

function renderHistory(items) {
  historyList.innerHTML = "";
  historyEmpty.style.display = items.length === 0 ? "block" : "none";

  for (const item of items) {
    const element = document.createElement("div");
    element.className = `history-item ${item.status}`;
    element.innerHTML = `
      <div class="history-head">
        <div class="history-goal">${escapeHtml(item.goal)}</div>
        <div class="history-status">${escapeHtml(STATUS_LABELS[item.status] ?? item.status)}</div>
      </div>
      <div class="history-meta">完成时间：${escapeHtml(formatTime(item.completedAt || item.createdAt))}</div>
      <div class="history-meta">步骤：${item.stepCount}，失败：${item.failedStepCount}</div>
      ${renderHistoryDetail(item)}
    `;
    historyList.appendChild(element);
  }
}

function renderHistoryDetail(item) {
  const detail = item.error || item.reflectionPreview;
  if (!detail) {
    return "";
  }

  return `<div class="history-preview">${escapeHtml(detail)}</div>`;
}

function updateStepUI(stepId, state) {
  const el = document.getElementById(`step-${stepId}`);
  if (el) {
    el.className = `step-item ${state}`;
  }
}

function addLog(type, label, content) {
  const item = document.createElement("div");
  item.className = `log-item ${type}`;

  const labelEl = document.createElement("div");
  labelEl.className = "log-label";
  labelEl.textContent = label;
  item.appendChild(labelEl);

  if (content) {
    const contentEl = document.createElement("div");
    contentEl.className = "log-content";
    contentEl.textContent = content;
    item.appendChild(contentEl);
  }

  execLog.appendChild(item);
  execLog.parentElement.scrollTop = execLog.parentElement.scrollHeight;
}

function approvePlan() {
  if (!currentPlan) {
    return;
  }

  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  send(createClientMessage(CLIENT_MESSAGE_TYPES.PLAN_APPROVED));
}

function toggleReject() {
  rejectInput.classList.toggle("visible");
  rejectConfirmRow.style.display = rejectInput.classList.contains("visible") ? "flex" : "none";
}

function hideRejectInput() {
  rejectInput.classList.remove("visible");
  rejectConfirmRow.style.display = "none";
  rejectInput.value = "";
}

function submitReject() {
  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  send(createClientMessage(CLIENT_MESSAGE_TYPES.PLAN_REJECTED, { feedback: rejectInput.value }));
  hideRejectInput();
}

function sendGoal() {
  const text = inputEl.value.trim();
  if (!text || busy) {
    return;
  }

  inputEl.value = "";
  inputEl.style.height = "auto";
  execLog.innerHTML = "";
  send(createClientMessage(CLIENT_MESSAGE_TYPES.CHAT, { content: text }));
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendGoal();
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
});

connect();
