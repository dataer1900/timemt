const STORAGE_KEY = "time-ledger-entries-md-v1";
const LEGACY_STORAGE_KEY = "time-ledger-entries-v1";
const LEARNING_KEY = "time-ledger-learning-md-v1";
const LEGACY_LEARNING_KEY = "time-ledger-learning-v1";
const AI_SETTINGS_KEY = "time-ledger-ai-settings-v1";
const AI_API_KEY_SESSION_KEY = "time-ledger-ai-api-key-session-v1";

const valueLabels = {
  high: "高价值",
  necessary: "必要消耗",
  low: "低价值",
};

const valueKeys = {
  高价值: "high",
  必要消耗: "necessary",
  低价值: "low",
  high: "high",
  necessary: "necessary",
  low: "low",
};

const allowedCategories = ["工作", "学习", "创作", "生活", "健康", "社交", "娱乐", "低价值消耗", "其他"];

const form = document.querySelector("#entryForm");
const fields = {
  id: document.querySelector("#entryId"),
  title: document.querySelector("#title"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  category: document.querySelector("#category"),
  valueType: document.querySelector("#valueType"),
  note: document.querySelector("#note"),
};
const datePicker = document.querySelector("#datePicker");
const entryList = document.querySelector("#entryList");
const entryListTitle = document.querySelector("#entryListTitle");
const cancelEditButton = document.querySelector("#cancelEditButton");
const smartInput = document.querySelector("#smartInput");
const smartButton = document.querySelector("#smartButton");
const smartPreview = document.querySelector("#smartPreview");
const aiParserEnabled = document.querySelector("#aiParserEnabled");
const aiEndpoint = document.querySelector("#aiEndpoint");
const aiModel = document.querySelector("#aiModel");
const aiApiKey = document.querySelector("#aiApiKey");
const saveAiSettingsButton = document.querySelector("#saveAiSettingsButton");
const aiSettingsStatus = document.querySelector("#aiSettingsStatus");
const dailyTimeline = document.querySelector("#dailyTimeline");
const importButton = document.querySelector("#importButton");
const importFile = document.querySelector("#importFile");

let entries = loadEntries();
let learnedRules = loadLearnedRules();

datePicker.value = todayKey();
setDefaultTimes();
applyAiSettingsToForm();
render();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const startTime = fields.startTime.value;
  const endTime = fields.endTime.value;
  const durationMinutes = calculateDuration(startTime, endTime);

  if (durationMinutes <= 0) {
    alert("结束时间必须晚于开始时间");
    return;
  }

  const existingId = fields.id.value;
  const existingEntry = entries.find((item) => item.id === existingId);
  const entry = normalizeEntry({
    id: existingId || crypto.randomUUID(),
    date: datePicker.value || todayKey(),
    title: fields.title.value.trim(),
    startTime,
    endTime,
    durationMinutes,
    category: fields.category.value,
    valueType: fields.valueType.value,
    note: fields.note.value.trim(),
    source: existingEntry?.source || "manual",
    rawText: existingEntry?.rawText || "",
    createdAt: existingEntry?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (!hasEntryEnded(entry)) {
    alert("只能记录已经发生过的时间，结束时间不能晚于现在。");
    return;
  }

  const overlap = findOverlap(entry, existingId);
  if (overlap) {
    showOverlapMessage(entry, overlap);
    return;
  }

  if (existingId) {
    rememberClassification(existingEntry, entry);
    entries = entries.map((item) => (item.id === existingId ? entry : item));
  } else {
    entries = [...entries, entry];
  }

  saveEntries();
  resetForm();
  render();
});

datePicker.addEventListener("change", render);
fields.category.addEventListener("change", () => {
  fields.valueType.value = defaultValueForCategory(fields.category.value);
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
});

document.querySelector("#fillNowButton").addEventListener("click", () => {
  const now = new Date();
  const end = toTimeValue(now);
  now.setMinutes(now.getMinutes() - 30);
  fields.startTime.value = toTimeValue(now);
  fields.endTime.value = end;
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([entriesToMarkdown(entries)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `time-ledger-${todayKey()}.md`;
  link.click();
  URL.revokeObjectURL(url);
});

importButton.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;

  const imported = markdownToEntries(await file.text());
  importFile.value = "";

  if (!imported.length) {
    alert("没有识别到可导入的 Markdown 时间记录。");
    return;
  }

  entries = mergeEntries(entries, imported);
  saveEntries();
  render();
  alert(`已导入 ${imported.length} 条记录。`);
});

saveAiSettingsButton.addEventListener("click", () => {
  const settings = readAiSettingsFromForm();
  saveAiSettings(settings);
  sessionStorage.setItem(AI_API_KEY_SESSION_KEY, aiApiKey.value.trim());

  if (!settings.enabled) {
    aiSettingsStatus.textContent = "AI 解析已关闭，继续使用本地规则。";
  } else if (!settings.endpoint) {
    aiSettingsStatus.textContent = "AI 解析已开启，但还没有填写接口地址。";
  } else {
    aiSettingsStatus.textContent = "AI 解析已开启。";
  }
});

smartButton.addEventListener("click", createSmartEntry);
smartInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createSmartEntry();
  }
});

document.querySelectorAll("[data-tab-target]").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tabTarget));
});

entryList.addEventListener("click", handleEntryAction);

function handleEntryAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const entry = entries.find((item) => item.id === button.dataset.id);
  if (!entry) return;

  if (button.dataset.action === "edit") {
    startEdit(entry);
    switchTab("manualPage");
  }

  if (button.dataset.action === "delete") {
    entries = entries.filter((item) => item.id !== entry.id);
    saveEntries();
    render();
  }
}

function switchTab(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === pageId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function createSmartEntry() {
  const text = smartInput.value.trim();
  if (!text) {
    smartPreview.textContent = "先输入一句话，例如：刚才学习英语 40 分钟。";
    return;
  }

  const aiRequired = isAiParserEnabled();
  smartButton.disabled = true;
  smartButton.textContent = "解析中...";
  smartPreview.textContent = aiRequired ? "正在尝试 AI 解析..." : "正在使用本地规则解析...";

  try {
    const parsedEntries = await parseQuickEntries(text);
    const acceptedEntries = [];

    parsedEntries.forEach((entry) => {
      if (!hasEntryEnded(entry)) {
        throw new Error("只能记录已经发生过的时间，结束时间不能晚于现在。");
      }

      const overlap = findOverlapIn(entry, [...entries, ...acceptedEntries]);
      if (overlap) {
        throw new Error(`${entry.startTime}-${entry.endTime} 和已有记录“${overlap.title}”重叠，未保存。`);
      }

      acceptedEntries.push(entry);
    });

    entries = [...entries, ...acceptedEntries].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    saveEntries();
    render();
    smartInput.value = "";

    const parserLabel = acceptedEntries.some((entry) => entry.source === "ai_smart_input") ? "AI 解析" : "本地规则";
    const summary = acceptedEntries.map((entry) => `${entry.title} ${entry.startTime}-${entry.endTime}`).join("；");
    smartPreview.textContent = `${parserLabel}：已保存 ${acceptedEntries.length} 条记录：${summary}`;
  } catch (error) {
    const prefix = aiRequired ? "AI 解析失败，未保存" : "未保存";
    smartPreview.textContent = `${prefix}：${error.message || "请检查接口地址、API Key 或网络权限。"}`;
  } finally {
    smartButton.disabled = false;
    smartButton.textContent = "记录";
  }
}

async function parseQuickEntries(transcript) {
  const localEntry = parseSmartEntry(transcript);
  if (!isAiParserEnabled()) return [localEntry];

  const drafts = await parseSmartEntriesWithAi(transcript, localEntry);
  return drafts.map((draft) => buildEntryFromAiDraft(draft, localEntry, transcript));
}

function parseSmartEntry(transcript) {
  const compactText = transcript.replace(/[，。,\.\s]/g, "");
  const range = parseTimeRange(compactText);
  const duration = parseDuration(compactText);
  const now = new Date();
  let startTime;
  let endTime;
  let durationMinutes;

  if (range) {
    startTime = range.startTime;
    endTime = range.endTime;
    durationMinutes = calculateDuration(startTime, endTime);
  } else {
    durationMinutes = duration || 30;
    now.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);
    endTime = toTimeValue(now);
    now.setMinutes(now.getMinutes() - durationMinutes);
    startTime = toTimeValue(now);
  }

  const title = extractSmartTitle(compactText) || "智能记录";
  const inferred = inferEntryMeta(compactText);

  return normalizeEntry({
    id: crypto.randomUUID(),
    date: todayKey(),
    title,
    startTime,
    endTime,
    durationMinutes: Math.max(durationMinutes, 1),
    category: inferred.category,
    valueType: inferred.valueType,
    note: `智能输入：${transcript}`,
    source: "smart_input",
    rawText: transcript,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function parseSmartEntriesWithAi(transcript, localEntry) {
  const settings = readAiSettingsFromForm();
  if (!settings.endpoint) throw new Error("没有配置 AI 接口地址");

  const apiKey = aiApiKey.value.trim() || sessionStorage.getItem(AI_API_KEY_SESSION_KEY) || "";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  const prompt = buildAiParsePrompt(transcript, localEntry);

  try {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.model || "deepseek-chat",
        stream: false,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(await formatAiResponseError(response));

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 没有返回内容，请检查模型名是否支持 chat/completions。");

    return sanitizeAiDrafts(JSON.parse(extractJsonObject(content)));
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI 请求超过 30 秒未返回，可能是网络慢、接口地址不可用或浏览器拦截。");
    if (error instanceof TypeError) throw new Error("网络请求失败，可能是接口不支持浏览器跨域 CORS，或网络无法访问该地址。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function buildAiParsePrompt(transcript, localEntry) {
  return {
    system: [
      "你是时间账本的结构化解析器。",
      "只能输出一个 JSON 对象，不要 Markdown，不要解释。",
      `category 只能从这些值中选择：${allowedCategories.join("、")}。`,
      "valueType 只能从这些值中选择：high、necessary、low。",
      "不能新增分类，不能输出其他价值枚举。",
      "如果原始输入包含多个连续且不重叠的时间段，必须拆成 entries 数组里的多条记录，例如 10:00-11:00 打篮球、11:00-11:20 跑步要返回两条 entries。",
      "同一条记录内只保留一个主任务；如果同一时间段里有同时听歌、边走路边打电话、开会时整理资料等并行活动，把主任务放到 title，把并行活动放到 parallelTasks。",
      "parallelTasks 只能是字符串数组；并行活动不要拆成多条记录，连续时间段才拆成多条记录。",
      "必须根据用户提供的当前设备日期解析相对日期：今天=当前日期，昨天=当前日期前一天，明天=当前日期后一天。",
      "如果文本没有明确日期，date 必须使用当前设备日期；不要猜测其他日期。",
      "只能记录已经发生过的时间段；如果结束时间晚于当前设备时间，不要把它当成已完成记录。",
      "如果文本没有明确字段，优先沿用本地候选值，不要编造。",
    ].join("\n"),
    user: [
      `当前设备日期：${todayKey()}`,
      `当前设备时间：${toTimeValue(new Date())}`,
      `原始输入：${transcript}`,
      "本地候选：",
      JSON.stringify({
        date: localEntry.date,
        startTime: localEntry.startTime,
        endTime: localEntry.endTime,
        durationMinutes: localEntry.durationMinutes,
        title: localEntry.title,
        category: localEntry.category,
        valueType: localEntry.valueType,
        note: localEntry.note,
      }),
      "请只返回 JSON，顶层只能是 entries 数组：{\"entries\":[{date,startTime,endTime,durationMinutes,title,category,valueType,note,parallelTasks}]}。",
      "连续时间段必须拆成多条 entries；同一时间段的并行活动才放 parallelTasks。",
      "parallelTasks 示例：[\"听歌\", \"边走路边打电话\"]；没有并行任务就返回空数组。",
      "示例：'10点到11点打篮球，过程中听歌，然后11点到11点20跑步' 必须返回两条 entries：第一条 title=打篮球 parallelTasks=[\"听歌\"]，第二条 title=跑步 parallelTasks=[]。",
      "时间用 24 小时 HH:mm；日期用 YYYY-MM-DD；durationMinutes 用整数分钟。"
    ].join("\n"),
  };
}

async function formatAiResponseError(response) {
  try {
    const data = await response.json();
    const message = data.error?.message || data.message || JSON.stringify(data);
    return `AI 接口返回 ${response.status}：${message}`;
  } catch {
    return `AI 接口返回 ${response.status}，请检查接口地址、API Key 和模型名。`;
  }
}

function extractJsonObject(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("AI 返回不是 JSON");
  return trimmed.slice(start, end + 1);
}

function sanitizeAiDrafts(payload) {
  const drafts = Array.isArray(payload?.entries) ? payload.entries : Array.isArray(payload) ? payload : [payload];
  const sanitized = drafts.map(sanitizeAiDraft).filter((draft) => draft.title && draft.startTime && draft.endTime);

  if (!sanitized.length) throw new Error("AI 没有返回可保存的时间记录。");
  return sanitized.slice(0, 12);
}

function sanitizeAiDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("AI 返回格式无效");

  return {
    date: isValidDateKey(draft.date) ? draft.date : "",
    startTime: isValidTimeValue(draft.startTime) ? draft.startTime : "",
    endTime: isValidTimeValue(draft.endTime) ? draft.endTime : "",
    durationMinutes: isValidDuration(draft.durationMinutes) ? Number(draft.durationMinutes) : 0,
    title: typeof draft.title === "string" ? draft.title.trim() : "",
    category: allowedCategories.includes(draft.category) ? draft.category : "",
    valueType: valueKeys[draft.valueType] || "",
    note: typeof draft.note === "string" ? draft.note.trim() : "",
    parallelTasks: Array.isArray(draft.parallelTasks)
      ? draft.parallelTasks.map((task) => String(task).trim()).filter(Boolean).slice(0, 6)
      : [],
  };
}

function buildEntryFromAiDraft(draft, localEntry, transcript) {
  let startTime = localEntry.startTime;
  let endTime = localEntry.endTime;
  let durationMinutes = localEntry.durationMinutes;

  if (draft.startTime && draft.endTime && calculateDuration(draft.startTime, draft.endTime) > 0) {
    startTime = draft.startTime;
    endTime = draft.endTime;
    durationMinutes = calculateDuration(startTime, endTime);
  } else if (draft.durationMinutes) {
    durationMinutes = draft.durationMinutes;
  }

  const noteParts = [`智能输入：${transcript}`];
  if (draft.note) noteParts.push(`AI备注：${draft.note}`);
  draft.parallelTasks.forEach((task) => noteParts.push(`附带活动：${task}`));

  return normalizeEntry({
    ...localEntry,
    id: crypto.randomUUID(),
    date: draft.date || localEntry.date,
    startTime,
    endTime,
    durationMinutes,
    title: draft.title || localEntry.title,
    category: draft.category || localEntry.category,
    valueType: draft.valueType || localEntry.valueType,
    note: noteParts.join("\n"),
    source: "ai_smart_input",
    rawText: transcript,
    updatedAt: new Date().toISOString(),
  });
}

function parseTimeRange(text) {
  const match = text.match(/(?:从)?([零〇一二两三四五六七八九十\d]{1,3})点(半|[零〇一二两三四五六七八九十\d]{1,3}分?)?(?:到|至|-)([零〇一二两三四五六七八九十\d]{1,3})点(半|[零〇一二两三四五六七八九十\d]{1,3}分?)?/);
  if (!match) return null;

  const addPm = /下午|晚上|夜里|中午/.test(text);
  const startTime = chineseTimeToValue(match[1], match[2], addPm);
  const endTime = chineseTimeToValue(match[3], match[4], addPm);
  return { startTime, endTime };
}

function chineseTimeToValue(hourText, minuteText, addPm) {
  let hour = chineseNumberToInt(hourText);
  let minute = 0;

  if (minuteText === "半") {
    minute = 30;
  } else if (minuteText) {
    minute = chineseNumberToInt(minuteText.replace("分", ""));
  }

  if (addPm && hour < 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDuration(text) {
  if (/半小时|半个小时/.test(text)) return 30;

  let minutes = 0;
  const hourMatch = text.match(/([零〇一二两三四五六七八九十\d]+)个?半?(小时|钟头)/);
  const minuteMatch = text.match(/([零〇一二两三四五六七八九十\d]+)分钟/);

  if (hourMatch) {
    minutes += chineseNumberToInt(hourMatch[1]) * 60;
    if (hourMatch[0].includes("半")) minutes += 30;
  }

  if (minuteMatch) {
    minutes += chineseNumberToInt(minuteMatch[1]);
  }

  return minutes;
}

function extractSmartTitle(text) {
  return text
    .replace(/(?:从)?[零〇一二两三四五六七八九十\d]{1,3}点(?:半|[零〇一二两三四五六七八九十\d]{1,3}分?)?(?:到|至|-)[零〇一二两三四五六七八九十\d]{1,3}点(?:半|[零〇一二两三四五六七八九十\d]{1,3}分?)?/g, "")
    .replace(/[零〇一二两三四五六七八九十\d]+个?半?(小时|钟头)/g, "")
    .replace(/[零〇一二两三四五六七八九十\d]+分钟/g, "")
    .replace(/半个?小时/g, "")
    .replace(/^(我|刚才|今天|上午|中午|下午|晚上|夜里|了)+/g, "")
    .replace(/(了|一下)$/g, "")
    .trim();
}

function inferEntryMeta(text) {
  const learned = learnedRules.find((rule) => text.includes(rule.keyword));
  if (learned) {
    return { category: learned.category, valueType: learned.valueType };
  }

  const rules = [
    { category: "低价值消耗", valueType: "low", words: ["刷短视频", "抖音", "快手", "小红书", "微博", "摸鱼", "拖延", "发呆"] },
    { category: "学习", valueType: "high", words: ["AI", "人工智能", "编程", "代码", "开发", "调试", "英语", "单词", "口语", "听力", "阅读", "读书", "看书", "文章", "论文", "学习", "课程", "上课", "听课", "研究"] },
    { category: "创作", valueType: "high", words: ["写作", "写文章", "公众号", "文案", "脚本", "剪辑", "做视频", "设计", "拍摄"] },
    { category: "工作", valueType: "high", words: ["工作", "开会", "会议", "邮件", "报告", "客户"] },
    { category: "健康", valueType: "high", words: ["运动", "跑步", "健身", "散步", "游泳", "骑车", "篮球", "足球", "羽毛球", "乒乓球", "网球", "瑜伽"] },
    { category: "健康", valueType: "necessary", words: ["睡觉", "午休", "休息", "冥想"] },
    { category: "生活", valueType: "necessary", words: ["做饭", "洗碗", "打扫", "收拾", "洗衣", "买菜", "吃饭", "洗澡", "通勤", "坐车"] },
    { category: "社交", valueType: "necessary", words: ["聊天", "朋友", "家人", "微信", "电话", "聚餐"] },
    { category: "娱乐", valueType: "low", words: ["游戏", "追剧", "电影", "娱乐", "看视频"] },
  ];

  const matched = rules.find((rule) => rule.words.some((word) => text.includes(word)));
  if (matched) return { category: matched.category, valueType: matched.valueType };
  return { category: "其他", valueType: "necessary" };
}

function chineseNumberToInt(value) {
  if (/^\d+$/.test(value)) return Number(value);

  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tenPart, onePart] = value.split("十");
    const tens = tenPart ? digits[tenPart] : 1;
    const ones = onePart ? digits[onePart] : 0;
    return tens * 10 + ones;
  }

  return digits[value] ?? 0;
}

function render() {
  const selectedDate = datePicker.value || todayKey();
  const selectedEntries = entries
    .filter((entry) => entry.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const todayEntries = entries
    .filter((entry) => entry.date === todayKey())
    .sort((a, b) => b.startTime.localeCompare(a.startTime));

  renderSummary(todayEntries);
  renderDailyTimeline(todayEntries);
  renderEntryList(selectedEntries, selectedDate);
  renderWeeklyReview();
}

function renderSummary(dayEntries) {
  const totals = sumByValueType(dayEntries);
  const totalMinutes = sumMinutes(dayEntries);
  document.querySelector("#todayTotal").textContent = formatMinutes(totalMinutes);
  document.querySelector("#highTotal").textContent = formatMinutes(totals.high);
  document.querySelector("#necessaryTotal").textContent = formatMinutes(totals.necessary);
  document.querySelector("#lowTotal").textContent = formatMinutes(totals.low);
  document.querySelector("#highSegment").style.width = `${percentage(totals.high, totalMinutes)}%`;
  document.querySelector("#necessarySegment").style.width = `${percentage(totals.necessary, totalMinutes)}%`;
  document.querySelector("#lowSegment").style.width = `${percentage(totals.low, totalMinutes)}%`;
}

function renderDailyTimeline(todayEntries) {
  if (!todayEntries.length) {
    dailyTimeline.innerHTML = `<div class="timeline-empty">今天还没有时间块</div>`;
    return;
  }

  dailyTimeline.innerHTML = todayEntries
    .map((entry) => {
      const start = timeToMinutes(entry.startTime);
      const width = Math.max((entry.durationMinutes / 1440) * 100, 0.4);
      const left = Math.min((start / 1440) * 100, 100);
      return `<div class="timeline-block ${entry.valueType}" style="left: ${left}%; width: ${width}%" title="${escapeHtml(entry.startTime)}-${escapeHtml(entry.endTime)} ${escapeHtml(entry.title)}"></div>`;
    })
    .join("");
}

function renderEntryList(dayEntries, selectedDate) {
  entryListTitle.textContent = dayEntries.length ? `${formatDateLabel(selectedDate)} · ${dayEntries.length} 条记录` : "今天还没有记录";

  if (!dayEntries.length) {
    entryList.innerHTML = `<div class="empty-state">记录越真实，复盘越有价值。</div>`;
    return;
  }

  entryList.innerHTML = dayEntries.map(renderEntryCard).join("");
}

function renderEntryCard(entry) {
  return `
    <article class="entry-card">
      <div class="entry-main">
        <div>
          <div class="entry-title">
            ${escapeHtml(entry.title)}
            <span class="badge ${entry.valueType}">${valueLabels[entry.valueType]}</span>
          </div>
          <div class="entry-meta">${entry.category} · ${formatMinutes(entry.durationMinutes)}</div>
          ${entry.rawText ? `<div class="entry-note"><strong>原始语料：</strong>${escapeHtml(entry.rawText)}</div>` : ""}
          ${entry.note ? `<div class="entry-note">${escapeHtml(entry.note)}</div>` : ""}
        </div>
        <div class="entry-time">${entry.startTime} - ${entry.endTime}</div>
      </div>
      <div class="entry-actions">
        <span></span>
        <div>
          <button class="icon-button" type="button" data-action="edit" data-id="${entry.id}">改</button>
          <button class="icon-button danger" type="button" data-action="delete" data-id="${entry.id}">删</button>
        </div>
      </div>
    </article>
  `;
}

function renderWeeklyReview() {
  const days = lastSevenDays();
  const totals = days.map((date) => ({
    date,
    minutes: sumMinutes(entries.filter((entry) => entry.date === date && entry.valueType === "high")),
  }));
  const max = Math.max(...totals.map((day) => day.minutes), 60);

  document.querySelector("#weeklyBars").innerHTML = totals
    .map(
      (day) => `
        <div class="day-bar">
          <span>${shortDateLabel(day.date)}</span>
          <div class="bar-track"><div class="bar-fill" style="width: ${(day.minutes / max) * 100}%"></div></div>
          <strong>${formatMinutes(day.minutes)}</strong>
        </div>
      `
    )
    .join("");

  const categoryRows = categoryTotals()
    .slice(0, 6)
    .map((item) => `<div class="stat-row"><span>${escapeHtml(item.category)}</span><strong>${formatMinutes(item.minutes)}</strong></div>`)
    .join("");

  document.querySelector("#categoryStats").innerHTML = categoryRows || `<div class="stat-row"><span>还没有分类数据</span><strong>0h</strong></div>`;
}

function startEdit(entry) {
  fields.id.value = entry.id;
  fields.title.value = entry.title;
  fields.startTime.value = entry.startTime;
  fields.endTime.value = entry.endTime;
  fields.category.value = entry.category;
  fields.valueType.value = entry.valueType;
  fields.note.value = entry.note || "";
  cancelEditButton.classList.remove("hidden");
  fields.title.focus();
}

function resetForm() {
  form.reset();
  fields.id.value = "";
  fields.category.value = "学习";
  fields.valueType.value = "high";
  cancelEditButton.classList.add("hidden");
  setDefaultTimes();
}

function loadAiSettings() {
  const markdown = localStorage.getItem(AI_SETTINGS_KEY);
  if (!markdown) return defaultAiSettings();

  const cells = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line) && !line.includes("| 启用 |"))
    .map(splitMarkdownRow)[0];

  if (!cells) return defaultAiSettings();

  return {
    enabled: cells[0] === "是",
    endpoint: cells[1] || "",
    model: cells[2] || "deepseek-chat",
  };
}

function saveAiSettings(settings) {
  localStorage.setItem(AI_SETTINGS_KEY, aiSettingsToMarkdown(settings));
}

function defaultAiSettings() {
  return { enabled: false, endpoint: "", model: "deepseek-chat" };
}

function aiSettingsToMarkdown(settings) {
  return [
    "# 时间账本 AI 解析设置",
    "",
    "| 启用 | 接口地址 | 模型 |",
    "| --- | --- | --- |",
    markdownRow([settings.enabled ? "是" : "否", settings.endpoint || "", settings.model || "deepseek-chat"]),
    "",
  ].join("\n");
}

function applyAiSettingsToForm() {
  const settings = loadAiSettings();
  aiParserEnabled.checked = settings.enabled;
  aiEndpoint.value = settings.endpoint || "";
  aiModel.value = settings.model || "deepseek-chat";
  aiApiKey.value = sessionStorage.getItem(AI_API_KEY_SESSION_KEY) || "";
  aiSettingsStatus.textContent = settings.enabled ? "AI 解析已开启。" : "AI 默认关闭。";
}

function readAiSettingsFromForm() {
  return {
    enabled: aiParserEnabled.checked,
    endpoint: aiEndpoint.value.trim(),
    model: aiModel.value.trim() || "deepseek-chat",
  };
}

function isAiParserEnabled() {
  return aiParserEnabled.checked;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function isValidTimeValue(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidDuration(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440;
}

function loadEntries() {
  const markdown = localStorage.getItem(STORAGE_KEY);
  if (markdown) return markdownToEntries(markdown);

  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      const migrated = JSON.parse(legacy).map(normalizeEntry);
      localStorage.setItem(STORAGE_KEY, entriesToMarkdown(migrated));
      return migrated;
    } catch {
      return [];
    }
  }

  return [];
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, entriesToMarkdown(entries));
}

function loadLearnedRules() {
  const markdown = localStorage.getItem(LEARNING_KEY);
  if (markdown) return markdownToLearnedRules(markdown);

  const legacy = localStorage.getItem(LEGACY_LEARNING_KEY);
  if (legacy) {
    try {
      const migrated = JSON.parse(legacy).map((rule) => ({
        keyword: rule.keyword || "",
        category: rule.category || "其他",
        valueType: valueKeys[rule.valueType] || "necessary",
        updatedAt: rule.updatedAt || new Date().toISOString(),
      }));
      localStorage.setItem(LEARNING_KEY, learnedRulesToMarkdown(migrated));
      return migrated;
    } catch {
      return [];
    }
  }

  return [];
}

function saveLearnedRules() {
  localStorage.setItem(LEARNING_KEY, learnedRulesToMarkdown(learnedRules));
}

function rememberClassification(previousEntry, updatedEntry) {
  if (!previousEntry?.rawText) return;

  const changed = previousEntry.category !== updatedEntry.category || previousEntry.valueType !== updatedEntry.valueType;
  if (!changed) return;

  const keyword = extractSmartTitle(previousEntry.rawText) || updatedEntry.title.trim();
  if (!keyword) return;

  const rule = {
    keyword,
    category: updatedEntry.category,
    valueType: updatedEntry.valueType,
    updatedAt: new Date().toISOString(),
  };

  learnedRules = [rule, ...learnedRules.filter((item) => item.keyword !== keyword)].slice(0, 100);
  saveLearnedRules();
}

function hasEntryEnded(entry) {
  const endDateTime = new Date(`${entry.date}T${entry.endTime}:00`);
  return !Number.isNaN(endDateTime.getTime()) && endDateTime <= new Date();
}

function findOverlap(entry, ignoreId = "") {
  return findOverlapIn(entry, entries, ignoreId);
}

function findOverlapIn(entry, items, ignoreId = "") {
  const start = timeToMinutes(entry.startTime);
  const end = timeToMinutes(entry.endTime);

  return items.find((item) => {
    if (item.id === ignoreId || item.date !== entry.date) return false;
    const itemStart = timeToMinutes(item.startTime);
    const itemEnd = timeToMinutes(item.endTime);
    return start < itemEnd && end > itemStart;
  });
}

function showOverlapMessage(entry, overlap) {
  const shouldAppend = window.confirm(
    `这个时间段已有主任务：\n${overlap.startTime} - ${overlap.endTime} ${overlap.title}\n\n按照时间账本规则，同一时间段只保留一个主任务。\n\n是否把“${entry.title}”作为附带活动写入原记录备注？`
  );

  if (!shouldAppend) {
    smartPreview.textContent = "未保存：时间段和已有主任务重叠。可以去记录页编辑原记录。";
    return;
  }

  const addition = `附带活动：${entry.startTime}-${entry.endTime} ${entry.title}`;
  entries = entries.map((item) => {
    if (item.id !== overlap.id) return item;
    return {
      ...item,
      note: item.note ? `${item.note}\n${addition}` : addition,
      updatedAt: new Date().toISOString(),
    };
  });

  saveEntries();
  resetForm();
  render();
  smartInput.value = "";
  smartPreview.textContent = `已写入“${overlap.title}”的备注，没有新增重复主任务。`;
}

function normalizeEntry(entry) {
  const startTime = entry.startTime || "00:00";
  const endTime = entry.endTime || startTime;
  const durationMinutes = Number(entry.durationMinutes) || Math.max(calculateDuration(startTime, endTime), 0);

  return {
    id: entry.id || crypto.randomUUID(),
    date: entry.date || todayKey(),
    title: entry.title || "未命名",
    startTime,
    endTime,
    durationMinutes,
    category: entry.category || "其他",
    valueType: valueKeys[entry.valueType] || "necessary",
    note: entry.note || "",
    source: entry.source || "manual",
    rawText: entry.rawText || "",
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function entriesToMarkdown(items) {
  const rows = items
    .map((entry) => [
      entry.date,
      entry.startTime,
      entry.endTime,
      entry.durationMinutes,
      entry.title,
      entry.category,
      valueLabels[entry.valueType] || entry.valueType,
      entry.note || "",
      entry.source || "manual",
      entry.rawText || "",
      entry.id,
    ])
    .map(markdownRow)
    .join("\n");

  return [
    "# 时间账本",
    "",
    "| 日期 | 开始 | 结束 | 时长分钟 | 事项 | 分类 | 价值 | 备注 | 来源 | 原始语料 | ID |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

function markdownToEntries(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line) && !line.includes("| 日期 |"))
    .map(splitMarkdownRow)
    .filter((cells) => cells.length >= 8)
    .map((cells) => normalizeEntry({
      date: cells[0],
      startTime: cells[1],
      endTime: cells[2],
      durationMinutes: Number(cells[3]),
      title: cells[4],
      category: cells[5],
      valueType: valueKeys[cells[6]] || "necessary",
      note: cells[7],
      source: cells[8] || "import",
      rawText: cells[9] || "",
      id: cells[10] || crypto.randomUUID(),
    }))
    .filter((entry) => entry.date && entry.startTime && entry.endTime && entry.title);
}

function learnedRulesToMarkdown(rules) {
  const rows = rules
    .map((rule) => [rule.keyword, rule.category, valueLabels[rule.valueType] || rule.valueType, rule.updatedAt || ""])
    .map(markdownRow)
    .join("\n");

  return [
    "# 时间账本分类学习规则",
    "",
    "| 关键词 | 分类 | 价值 | 更新时间 |",
    "| --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

function markdownToLearnedRules(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line) && !line.includes("| 关键词 |"))
    .map(splitMarkdownRow)
    .filter((cells) => cells.length >= 3)
    .map((cells) => ({
      keyword: cells[0],
      category: cells[1] || "其他",
      valueType: valueKeys[cells[2]] || "necessary",
      updatedAt: cells[3] || "",
    }))
    .filter((rule) => rule.keyword);
}

function markdownRow(values) {
  return `| ${values.map(markdownCell).join(" | ")} |`;
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|");
}

function splitMarkdownRow(row) {
  const content = row.replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let escaped = false;

  for (const char of content) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(unmarkdownCell(current.trim()));
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(unmarkdownCell(current.trim()));
  return cells;
}

function unmarkdownCell(value) {
  return value.replace(/<br\s*\/?>/gi, "\n");
}

function mergeEntries(current, imported) {
  const map = new Map(current.map((entry) => [entry.id, entry]));
  imported.forEach((entry) => {
    map.set(entry.id, entry);
  });
  return [...map.values()].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

function sumMinutes(items) {
  return items.reduce((total, item) => total + item.durationMinutes, 0);
}

function sumByValueType(items) {
  return items.reduce(
    (totals, item) => {
      totals[item.valueType] += item.durationMinutes;
      return totals;
    },
    { high: 0, necessary: 0, low: 0 }
  );
}

function calculateDuration(startTime, endTime) {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h${rest}m`;
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function defaultValueForCategory(category) {
  const defaults = {
    工作: "high",
    学习: "high",
    创作: "high",
    健康: "high",
    生活: "necessary",
    社交: "necessary",
    娱乐: "low",
    低价值消耗: "low",
    其他: "necessary",
  };
  return defaults[category] || "necessary";
}

function todayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  return date.toLocaleDateString("en-CA");
}

function toTimeValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function setDefaultTimes() {
  const now = new Date();
  const endMinutes = Math.floor(now.getMinutes() / 5) * 5;
  now.setMinutes(endMinutes, 0, 0);
  fields.endTime.value = toTimeValue(now);
  now.setMinutes(now.getMinutes() - 30);
  fields.startTime.value = toTimeValue(now);
  fields.category.value = "学习";
  fields.valueType.value = "high";
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return toDateKey(date);
  });
}

function categoryTotals() {
  const totals = new Map();
  entries.forEach((entry) => {
    totals.set(entry.category, (totals.get(entry.category) || 0) + entry.durationMinutes);
  });
  return [...totals.entries()]
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

function formatDateLabel(dateKey) {
  if (dateKey === todayKey()) return "今天";
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function shortDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
    return entities[char];
  });
}
