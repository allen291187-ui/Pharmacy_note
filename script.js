let allCases = [];
let currentFiltered = [];
let currentIndex = 0;
let editingCaseId = null;
let preparedImages = [];

const listEl = document.getElementById("caseList");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const resultCount = document.getElementById("resultCount");
const totalCount = document.getElementById("totalCount");
const clearBtn = document.getElementById("clearBtn");
const refreshBtn = document.getElementById("refreshBtn");
const dialog = document.getElementById("caseDialog");
const modalContent = document.getElementById("modalContent");
const closeDialog = document.getElementById("closeDialog");
const addDialog = document.getElementById("addDialog");
const openAddBtn = document.getElementById("openAddBtn");
const closeAddDialog = document.getElementById("closeAddDialog");
const caseForm = document.getElementById("caseForm");
const imagePrepareBox = document.getElementById("imagePrepareBox");

async function loadFromSheet(){
  if(!API_URL || API_URL.includes("PASTE_")){
    listEl.innerHTML = `<div class="case-card">請先在 index.html 填入 Apps Script Web App URL。</div>`;
    resultCount.textContent = "尚未設定";
    return;
  }
  resultCount.textContent = "讀取中...";
  try{
    const res = await fetch(API_URL + "?t=" + Date.now());
    const json = await res.json();
    if(!json.success) throw new Error(json.message || "讀取失敗");
    allCases = json.data.map(normalizeCase);
    refreshCategories();
    render();
  }catch(err){
    listEl.innerHTML = `<div class="case-card">讀取 Google Sheet 失敗：${escapeHtml(err.message)}</div>`;
    resultCount.textContent = "讀取失敗";
  }
}

function normalizeCase(row){
  return {
    rowIndex: row.rowIndex,
    caseId: row["案例ID"] || row["病歷號"] || "",
    id: row["病歷號"] || "",
    title: row["案例摘要"] || "",
    drug: row["主搜尋藥物"] || "",
    fullText: row["原始全文"] || "僅記錄特殊處方用途，無補充內容。",
    imageFiles: parseList(row["圖片檔名"] || row["圖片網址"] || ""),
    refs: row["參考資料"] || "",
    category: row["分類"] || "",
    keywords: parseList(row["關鍵字"])
  };
}

function parseList(value){
  return String(value || "").split(/[\n,，、]+/).map(s=>s.trim()).filter(Boolean);
}

function imageSrc(filename){
  return "images/" + encodeURIComponent(filename).replace(/%2F/g, "/");
}

function searchableText(c){
  return [c.caseId,c.id,c.title,c.drug,c.fullText,c.refs,c.category,...(c.keywords || [])].join(" ").toLowerCase();
}

function refreshCategories(){
  const current = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">全部分類</option>';
  [...new Set(allCases.map(c => c.category).filter(Boolean))].sort().forEach(cat=>{
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });
  categoryFilter.value = current;
}

function render(){
  const q = searchInput.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  currentFiltered = allCases.filter(c=>(!q || searchableText(c).includes(q)) && (!cat || c.category === cat));

  resultCount.textContent = `顯示 ${currentFiltered.length} 筆`;
  totalCount.textContent = allCases.length;
  listEl.innerHTML = "";

  if(currentFiltered.length === 0){
    listEl.innerHTML = `<div class="case-card">目前沒有符合條件的案例。</div>`;
    return;
  }

  currentFiltered.forEach((c, index)=>{
    const card = document.createElement("article");
    card.className = "case-card";
    card.innerHTML = `
      <div class="card-top">
        <div>
          <h3 class="case-title">${escapeHtml(c.title)}</h3>
          <div class="meta">
            <span class="badge brand">${escapeHtml(c.caseId || "未編號")}</span>
            <span class="badge">病歷號 ${escapeHtml(c.id || "無")}</span>
            <span class="badge">${escapeHtml(c.drug)}</span>
            <span class="badge">${escapeHtml(c.category || "未分類")}</span>
            <span class="badge">圖片：${c.imageFiles.length ? c.imageFiles.length + "張" : "無圖"}</span>
          </div>
        </div>
        <div class="card-buttons">
          <button class="primary" data-open="${index}">查看</button>
          <button data-edit="${escapeAttr(c.caseId)}">編輯</button>
          <button class="danger" data-delete="${escapeAttr(c.rowIndex)}">刪除</button>
        </div>
      </div>
      <p class="preview">${escapeHtml(c.fullText)}</p>
      <div class="keywords">${(c.keywords||[]).map(k=>`<span class="keyword" data-keyword="${escapeAttr(k)}">${escapeHtml(k)}</span>`).join("")}</div>
    `;
    card.querySelector("[data-open]").addEventListener("click",()=>openCase(index));
    card.querySelector("[data-edit]").addEventListener("click",()=>openEditCase(c.caseId));
    card.querySelector("[data-delete]").addEventListener("click",()=>deleteCase(c.rowIndex));
    card.querySelectorAll("[data-keyword]").forEach(el => el.addEventListener("click", e => {
      e.stopPropagation();
      searchInput.value = el.dataset.keyword;
      render();
      window.scrollTo({top:0, behavior:"smooth"});
    }));
    listEl.appendChild(card);
  });
}

function makeImageGallery(c){
  if(!c.imageFiles.length) return `<p class="muted">尚未上傳圖片。</p>`;
  return `<div class="image-grid">${c.imageFiles.map((fn, idx)=>`
    <button class="image-thumb" type="button" data-image-src="${escapeAttr(imageSrc(fn))}" data-image-name="${escapeAttr(fn)}">
      <img src="${escapeAttr(imageSrc(fn))}" alt="case image ${idx+1}" loading="lazy">
      <span>${escapeHtml(fn)}</span>
    </button>
  `).join("")}</div>`;
}

function bindImageViewer(container){
  container.querySelectorAll("[data-image-src]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      openImageViewer(btn.dataset.imageSrc, btn.dataset.imageName);
    });
  });
}

function openCase(index){
  currentIndex = index;
  const c = currentFiltered[currentIndex];
  const refHtml = c.refs ? (String(c.refs).startsWith("http") ? `<a href="${escapeAttr(c.refs)}" target="_blank" rel="noopener">${escapeHtml(c.refs)}</a>` : escapeHtml(c.refs)) : "無";

  modalContent.innerHTML = `
    <h2>${escapeHtml(c.title)}</h2>
    <div class="meta">
      <span class="badge brand">${escapeHtml(c.caseId || "未編號")}</span>
      <span class="badge">病歷號 ${escapeHtml(c.id || "無")}</span>
      <span class="badge">${escapeHtml(c.drug)}</span>
      <span class="badge">${escapeHtml(c.category || "未分類")}</span>
    </div>
    <h3>原始全文</h3>
    <div class="full-text">${escapeHtml(c.fullText)}</div>
    <h3>圖片</h3>${makeImageGallery(c)}
    <h3>參考資料</h3><p class="ref">${refHtml}</p>
    <h3>關鍵字</h3>
    <div class="keywords">${(c.keywords||[]).map(k=>`<span class="keyword" data-modal-keyword="${escapeAttr(k)}">${escapeHtml(k)}</span>`).join("")}</div>
    <div class="modal-actions">
      <button class="primary" id="editFromModal">編輯此案例</button>
      <button class="danger" id="deleteFromModal">刪除此案例</button>
    </div>
    <div class="nav-row">
      <button id="prevCase">上一筆</button>
      <button id="nextCase">下一筆</button>
    </div>
  `;
  bindImageViewer(modalContent);
  modalContent.querySelectorAll("[data-modal-keyword]").forEach(el => el.addEventListener("click", () => {
    searchInput.value = el.dataset.modalKeyword;
    dialog.close();
    render();
  }));
  document.getElementById("editFromModal").onclick = () => { dialog.close(); openEditCase(c.caseId); };
  document.getElementById("deleteFromModal").onclick = () => { dialog.close(); deleteCase(c.rowIndex); };
  document.getElementById("prevCase").onclick = () => openCase((currentIndex - 1 + currentFiltered.length) % currentFiltered.length);
  document.getElementById("nextCase").onclick = () => openCase((currentIndex + 1) % currentFiltered.length);
  dialog.showModal();
}

function openImageViewer(src, name){
  const viewer = document.createElement("dialog");
  viewer.className = "image-viewer-dialog";
  viewer.innerHTML = `
    <div class="image-viewer">
      <button class="close image-close" type="button">×</button>
      <div class="image-viewer-toolbar">
        <strong>${escapeHtml(name || "案例圖片")}</strong>
        <a class="download-btn" href="${escapeAttr(src)}" target="_blank" rel="noopener">開啟原圖</a>
      </div>
      <img src="${escapeAttr(src)}" alt="${escapeAttr(name || "case image")}">
    </div>
  `;
  document.body.appendChild(viewer);
  viewer.querySelector(".image-close").addEventListener("click",()=>{viewer.close();viewer.remove();});
  viewer.addEventListener("click", e=>{if(e.target===viewer){viewer.close();viewer.remove();}});
  viewer.showModal();
}

function nextCaseId(){
  let max = 0;
  allCases.forEach(c=>{
    const m = String(c.caseId || "").match(/RX(\d+)/);
    if(m) max = Math.max(max, Number(m[1]));
  });
  return "RX" + String(max + 1).padStart(6, "0");
}

function openEditCase(caseId){
  editingCaseId = caseId;
  const c = allCases.find(x => x.caseId === caseId);
  caseForm.caseId.value = c.caseId || "";
  caseForm.id.value = c.id || "";
  caseForm.title.value = c.title || "";
  caseForm.drug.value = c.drug || "";
  caseForm.fullText.value = c.fullText || "";
  caseForm.refs.value = c.refs || "";
  caseForm.category.value = c.category || "";
  caseForm.keywords.value = (c.keywords || []).join("、");
  caseForm.imageFiles.value = (c.imageFiles || []).join(", ");
  imagePrepareBox.innerHTML = "";
  preparedImages = [];
  addDialog.querySelector("h2").textContent = "編輯案例";
  caseForm.querySelector("button[type='submit']").textContent = "儲存修改";
  addDialog.showModal();
}

function resetForm(){
  editingCaseId = null;
  preparedImages = [];
  caseForm.reset();
  caseForm.caseId.value = nextCaseId();
  imagePrepareBox.innerHTML = "";
  addDialog.querySelector("h2").textContent = "新增案例";
  caseForm.querySelector("button[type='submit']").textContent = "儲存案例";
}

function getExt(file){
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if(["jpg","jpeg","png","gif","webp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if(file.type.includes("png")) return "png";
  if(file.type.includes("webp")) return "webp";
  return "jpg";
}

function prepareImages(){
  const files = Array.from(caseForm.images.files || []);
  const caseId = caseForm.caseId.value.trim() || nextCaseId();
  preparedImages = files.map((file, idx)=>({
    file,
    filename: `${caseId}_${idx+1}.${getExt(file)}`,
    url: URL.createObjectURL(file)
  }));
  if(!preparedImages.length) return;
  const existing = parseList(caseForm.imageFiles.value);
  caseForm.imageFiles.value = [...existing, ...preparedImages.map(x=>x.filename)].join(", ");
  imagePrepareBox.innerHTML = preparedImages.map((x, idx)=>`
    <div class="prepared-image">
      <img src="${escapeAttr(x.url)}" alt="${escapeAttr(x.filename)}">
      <span>${escapeHtml(x.filename)}</span>
      <button type="button" data-download="${idx}">下載此圖片</button>
    </div>
  `).join("") + `<button type="button" class="primary" id="downloadAllImages">下載全部圖片</button>`;
  imagePrepareBox.querySelectorAll("[data-download]").forEach(btn=>{
    btn.addEventListener("click",()=>downloadPrepared(Number(btn.dataset.download)));
  });
  document.getElementById("downloadAllImages").addEventListener("click",()=>{
    preparedImages.forEach((_,i)=>setTimeout(()=>downloadPrepared(i), i*250));
  });
}

function downloadPrepared(i){
  const item = preparedImages[i];
  const a = document.createElement("a");
  a.href = item.url;
  a.download = item.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function submitForm(e){
  e.preventDefault();
  const fd = new FormData(caseForm);
  const payload = {
    apiKey: API_KEY,
    action: editingCaseId ? "update" : "add",
    rowIndex: allCases.find(c=>c.caseId===editingCaseId)?.rowIndex,
    "案例ID": String(fd.get("caseId") || "").trim() || nextCaseId(),
    "病歷號": String(fd.get("id") || "").trim(),
    "案例摘要": String(fd.get("title") || "").trim(),
    "主搜尋藥物": String(fd.get("drug") || "").trim(),
    "原始全文": String(fd.get("fullText") || "").trim() || "僅記錄特殊處方用途，無補充內容。",
    "圖片檔名": String(fd.get("imageFiles") || "").trim(),
    "參考資料": String(fd.get("refs") || "").trim(),
    "分類": String(fd.get("category") || "").trim(),
    "關鍵字": String(fd.get("keywords") || "").trim()
  };

  try{
    caseForm.querySelector("button[type='submit']").disabled = true;
    const res = await fetch(API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(payload)});
    const json = await res.json();
    if(!json.success) throw new Error(json.message || "儲存失敗");
    alert("案例已儲存。若有下載圖片，記得上傳到 GitHub repository 的 images 資料夾。");
    resetForm();
    addDialog.close();
    await loadFromSheet();
  }catch(err){
    alert("儲存失敗：" + err.message);
  }finally{
    caseForm.querySelector("button[type='submit']").disabled = false;
  }
}

async function deleteCase(rowIndex){
  const c = allCases.find(x=>Number(x.rowIndex)===Number(rowIndex));
  if(!confirm(`確定刪除這筆案例？\n\n${c?.caseId || ""}｜${c?.title || ""}`)) return;
  try{
    const res = await fetch(API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({apiKey:API_KEY, action:"delete", rowIndex})});
    const json = await res.json();
    if(!json.success) throw new Error(json.message || "刪除失敗");
    await loadFromSheet();
  }catch(err){
    alert("刪除失敗：" + err.message);
  }
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g,"&quot;"); }

searchInput.addEventListener("input", render);
categoryFilter.addEventListener("change", render);
clearBtn.addEventListener("click",()=>{searchInput.value="";categoryFilter.value="";render();});
refreshBtn.addEventListener("click", loadFromSheet);
closeDialog.addEventListener("click",()=>dialog.close());
openAddBtn.addEventListener("click",()=>{resetForm();addDialog.showModal();});
closeAddDialog.addEventListener("click",()=>{resetForm();addDialog.close();});
caseForm.images.addEventListener("change", prepareImages);
caseForm.addEventListener("submit", submitForm);
loadFromSheet();
