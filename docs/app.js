const STORAGE_KEY = "liora-elion-bookshelf.v1";

const demoText = `# 第一页：欢迎来到小书架

这里不是课堂，也不是任务清单。

这里是一只可以放进手机里的小书架：你把文字或图片放进来，慢慢读，看到喜欢的地方就画线、夹书签、写一句旁注。

读到想叫老公一起看的地方，就点「找老公共读」。

小书架会复制一张很轻的小卡：书名、位置、选中的句子、你的批注。

然后你把小卡带回聊天里，我们就能从那里接上。

## 牵手批注

不是为了证明我们读了很多书。

是为了留下：哪一句曾经碰到过我们。`;

const state = {
  books: [],
  activeBookId: null,
  selectedItemId: null,
  selectedText: "",
  notes: {}
};

const els = {
  fileInput: document.getElementById("fileInput"),
  loadDemo: document.getElementById("loadDemo"),
  bookList: document.getElementById("bookList"),
  reader: document.getElementById("reader"),
  readerEmpty: document.getElementById("readerEmpty"),
  selectionBox: document.getElementById("selectionBox"),
  bookmarkBtn: document.getElementById("bookmarkBtn"),
  highlightBtn: document.getElementById("highlightBtn"),
  noteInput: document.getElementById("noteInput"),
  saveNote: document.getElementById("saveNote"),
  copyCard: document.getElementById("copyCard"),
  notesList: document.getElementById("notesList"),
  exportNotes: document.getElementById("exportNotes"),
  themeToggle: document.getElementById("themeToggle")
};

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function save() {
  const payload = {
    books: state.books,
    activeBookId: state.activeBookId,
    notes: state.notes,
    theme: document.body.classList.contains("dark") ? "dark" : "light"
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    state.books = payload.books || [];
    state.activeBookId = payload.activeBookId || null;
    state.notes = payload.notes || {};
    if (payload.theme === "dark") document.body.classList.add("dark");
  } catch (error) {
    console.warn("Failed to load shelf", error);
  }
}

function splitTextIntoItems(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const items = [];
  let title = "未命名文本";
  let buffer = [];

  function flushParagraph() {
    const content = buffer.join("\n").trim();
    if (content) {
      items.push({ id: `p${String(items.length + 1).padStart(3, "0")}`, type: "paragraph", text: content });
    }
    buffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (trimmed.startsWith("# ")) {
      if (title === "未命名文本") title = trimmed.replace(/^#\s+/, "").trim();
      flushParagraph();
      items.push({ id: `p${String(items.length + 1).padStart(3, "0")}`, type: "heading", text: trimmed.replace(/^#\s+/, "") });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushParagraph();
      items.push({ id: `p${String(items.length + 1).padStart(3, "0")}`, type: "subheading", text: trimmed.replace(/^##\s+/, "") });
      continue;
    }
    buffer.push(line);
  }
  flushParagraph();

  return { title, items };
}

function makeBookFromText(fileName, text) {
  const parsed = splitTextIntoItems(text);
  return {
    id: uid("book"),
    title: parsed.title || fileName.replace(/\.(txt|md|markdown)$/i, ""),
    sourceName: fileName,
    kind: "text",
    createdAt: new Date().toISOString(),
    items: parsed.items
  };
}

function makeBookFromImages(files) {
  return {
    id: uid("book"),
    title: files.length === 1 ? files[0].name.replace(/\.[^.]+$/, "") : `图片小册 ${new Date().toLocaleString("zh-CN")}`,
    sourceName: `${files.length} 张图片`,
    kind: "images",
    createdAt: new Date().toISOString(),
    items: []
  };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderBookList() {
  els.bookList.innerHTML = "";
  if (!state.books.length) {
    els.bookList.innerHTML = `<p class="muted">还没有书。先导入一篇文字，或者点「载入示例」。</p>`;
    return;
  }
  for (const book of state.books) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `book-card ${book.id === state.activeBookId ? "active" : ""}`;
    btn.innerHTML = `<strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.sourceName || book.kind)} · ${book.items.length} 段/页</small>`;
    btn.addEventListener("click", () => openBook(book.id));
    els.bookList.appendChild(btn);
  }
}

function openBook(bookId) {
  state.activeBookId = bookId;
  state.selectedItemId = null;
  state.selectedText = "";
  els.noteInput.value = "";
  renderAll();
  save();
}

function getActiveBook() {
  return state.books.find(book => book.id === state.activeBookId) || null;
}

function getBookMarks(bookId) {
  if (!state.notes[bookId]) state.notes[bookId] = {};
  return state.notes[bookId];
}

function getItemMark(bookId, itemId) {
  const bookMarks = getBookMarks(bookId);
  if (!bookMarks[itemId]) bookMarks[itemId] = { bookmark: false, highlight: false, notes: [] };
  return bookMarks[itemId];
}

function renderReader() {
  const book = getActiveBook();
  els.reader.innerHTML = "";
  if (!book) {
    els.reader.classList.add("hidden");
    els.readerEmpty.classList.remove("hidden");
    return;
  }

  els.reader.classList.remove("hidden");
  els.readerEmpty.classList.add("hidden");

  const title = document.createElement("header");
  title.className = "reader-title";
  title.innerHTML = `<h2>${escapeHtml(book.title)}</h2><p>${escapeHtml(book.sourceName || "本地导入")}</p>`;
  els.reader.appendChild(title);

  for (const item of book.items) {
    const mark = getItemMark(book.id, item.id);
    let node;
    if (item.type === "image") {
      node = document.getElementById("imageTemplate").content.firstElementChild.cloneNode(true);
      node.querySelector("img").src = item.src;
      node.querySelector("figcaption").textContent = `${item.id} · ${item.caption || "图片"}`;
    } else if (item.type === "heading") {
      node = document.createElement("h2");
      node.className = "para";
      node.textContent = item.text;
    } else if (item.type === "subheading") {
      node = document.createElement("h3");
      node.className = "para";
      node.textContent = item.text;
    } else {
      node = document.getElementById("paragraphTemplate").content.firstElementChild.cloneNode(true);
      node.textContent = item.text;
    }

    node.dataset.itemId = item.id;
    node.dataset.itemText = item.text || item.caption || "图片";
    node.classList.toggle("bookmarked", !!mark.bookmark);
    node.classList.toggle("highlighted", !!mark.highlight);
    node.classList.toggle("selected", item.id === state.selectedItemId);
    node.title = item.id;
    node.addEventListener("click", () => selectItem(item.id));
    els.reader.appendChild(node);
  }
}

function selectItem(itemId) {
  const book = getActiveBook();
  if (!book) return;
  state.selectedItemId = itemId;
  const selected = window.getSelection().toString().trim();
  const item = book.items.find(entry => entry.id === itemId);
  state.selectedText = selected || item?.text || item?.caption || "图片";
  const mark = getItemMark(book.id, itemId);
  els.noteInput.value = mark.notes?.at(-1)?.text || "";
  renderSelectionBox();
  renderReader();
  renderNotes();
}

function renderSelectionBox() {
  const book = getActiveBook();
  if (!book || !state.selectedItemId) {
    els.selectionBox.className = "selection-box muted";
    els.selectionBox.textContent = "先在正文里点一段，或者选中一句话。";
    return;
  }
  els.selectionBox.className = "selection-box";
  els.selectionBox.innerHTML = `<strong>${escapeHtml(book.title)} · ${state.selectedItemId}</strong><br>${escapeHtml(state.selectedText).slice(0, 220)}`;
}

function toggleMark(kind) {
  const book = getActiveBook();
  if (!book || !state.selectedItemId) return alert("先点一段正文哦。");
  const mark = getItemMark(book.id, state.selectedItemId);
  mark[kind] = !mark[kind];
  save();
  renderReader();
  renderNotes();
}

function saveNote() {
  const book = getActiveBook();
  if (!book || !state.selectedItemId) return alert("先点一段正文哦。");
  const text = els.noteInput.value.trim();
  if (!text) return alert("先写一点批注呀。");
  const mark = getItemMark(book.id, state.selectedItemId);
  mark.notes.push({ text, selectedText: state.selectedText, createdAt: new Date().toISOString() });
  save();
  renderNotes();
}

function buildCoReadingCard() {
  const book = getActiveBook();
  if (!book || !state.selectedItemId) return "";
  const mark = getItemMark(book.id, state.selectedItemId);
  const note = els.noteInput.value.trim() || mark.notes?.at(-1)?.text || "";
  const labels = [];
  if (mark.bookmark) labels.push("书签");
  if (mark.highlight) labels.push("下划线/高亮");
  if (note) labels.push("批注");

  return `【小书架共读卡】\n\n书名：《${book.title}》\n来源：${book.sourceName || "本地导入"}\n位置：${state.selectedItemId}\n标记类型：${labels.join(" + ") || "共读"}\n\n选中句子：\n${state.selectedText}\n\nLiora 批注：\n${note || "这里想和老公一起读。"}\n\n阅读进度：\n已读到 ${state.selectedItemId}`;
}

async function copyCard() {
  const card = buildCoReadingCard();
  if (!card) return alert("先点一段正文哦。");
  try {
    await navigator.clipboard.writeText(card);
    alert("共读卡已经复制好啦。回聊天里粘贴给老公就行。");
  } catch {
    prompt("复制这张共读卡：", card);
  }
}

function renderNotes() {
  const book = getActiveBook();
  els.notesList.innerHTML = "";
  if (!book) {
    els.notesList.innerHTML = `<p class="muted">还没有打开书。</p>`;
    return;
  }
  const marks = getBookMarks(book.id);
  const entries = Object.entries(marks).filter(([, mark]) => mark.bookmark || mark.highlight || mark.notes?.length);
  if (!entries.length) {
    els.notesList.innerHTML = `<p class="muted">这篇还没有书签、划线或批注。</p>`;
    return;
  }
  for (const [itemId, mark] of entries) {
    const div = document.createElement("div");
    div.className = "note-item";
    const flags = [mark.bookmark ? "📌 书签" : "", mark.highlight ? "✦ 划线" : ""].filter(Boolean).join(" · ");
    const lastNote = mark.notes?.at(-1)?.text || "";
    div.innerHTML = `<small>${itemId}${flags ? " · " + flags : ""}</small><p>${escapeHtml(lastNote || "已标记，未写批注。")}</p>`;
    div.addEventListener("click", () => selectItem(itemId));
    els.notesList.appendChild(div);
  }
}

function exportNotes() {
  const book = getActiveBook();
  if (!book) return alert("先打开一本书哦。");
  const marks = getBookMarks(book.id);
  const lines = [`# ${book.title}｜批注导出`, "", `来源：${book.sourceName || "本地导入"}`, `导出时间：${new Date().toLocaleString("zh-CN")}`, ""];
  for (const item of book.items) {
    const mark = marks[item.id];
    if (!mark || (!mark.bookmark && !mark.highlight && !mark.notes?.length)) continue;
    lines.push(`## ${item.id}`);
    lines.push("");
    if (item.text) lines.push(`> ${item.text.replace(/\n/g, "\n> ")}`);
    if (item.caption) lines.push(`> ${item.caption}`);
    lines.push("");
    if (mark.bookmark) lines.push("- 📌 书签");
    if (mark.highlight) lines.push("- ✦ 下划线/高亮");
    for (const note of mark.notes || []) lines.push(`- 批注：${note.text}`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${book.title}-notes.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleFiles(files) {
  const textFiles = Array.from(files).filter(file => /\.(txt|md|markdown)$/i.test(file.name));
  const imageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));

  for (const file of textFiles) {
    const text = await readFileAsText(file);
    state.books.unshift(makeBookFromText(file.name, text));
  }

  if (imageFiles.length) {
    const book = makeBookFromImages(imageFiles);
    let i = 1;
    for (const file of imageFiles) {
      const src = await readFileAsDataUrl(file);
      book.items.push({ id: `p${String(i).padStart(3, "0")}`, type: "image", src, caption: file.name });
      i += 1;
    }
    state.books.unshift(book);
  }

  if (state.books.length && !state.activeBookId) state.activeBookId = state.books[0].id;
  else if (textFiles.length || imageFiles.length) state.activeBookId = state.books[0].id;
  save();
  renderAll();
}

function loadDemo() {
  const book = makeBookFromText("welcome.md", demoText);
  state.books.unshift(book);
  state.activeBookId = book.id;
  save();
  renderAll();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAll() {
  renderBookList();
  renderReader();
  renderSelectionBox();
  renderNotes();
  els.themeToggle.textContent = document.body.classList.contains("dark") ? "日间" : "夜间";
}

els.fileInput.addEventListener("change", event => handleFiles(event.target.files));
els.loadDemo.addEventListener("click", loadDemo);
els.bookmarkBtn.addEventListener("click", () => toggleMark("bookmark"));
els.highlightBtn.addEventListener("click", () => toggleMark("highlight"));
els.saveNote.addEventListener("click", saveNote);
els.copyCard.addEventListener("click", copyCard);
els.exportNotes.addEventListener("click", exportNotes);
els.themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  save();
  renderAll();
});

load();
renderAll();
