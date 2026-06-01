/**
 * app.js — 主逻辑
 * 负责：任务管理、图片上传、拖拽排序、UI 渲染、事件绑定
 */

(function () {
  "use strict";

  // ============ 状态 ============
  let tasks = []; // 任务列表（内存态，含 dataUrl）
  let activeTaskId = null; // 当前选中的任务 ID
  let sortableInstance = null; // 图片网格 SortableJS 实例
  let taskListSortable = null; // 任务列表 SortableJS 实例

  // ============ DOM 引用 ============
  const $ = (sel) => document.querySelector(sel);
  const btnNewTask = $("#btn-new-task");
  const taskListEl = $("#task-list");
  const noTaskHint = $("#no-task-hint");
  const editorEmpty = $("#editor-empty");
  const editorPanel = $("#editor-panel");
  const taskNameInput = $("#task-name-input");
  const btnExport = $("#btn-export");
  const btnDeleteTask = $("#btn-delete-task");
  const imageGrid = $("#image-grid");
  const uploadArea = $("#upload-area");
  const fileInput = $("#file-input");
  const hoverPreview = $("#hover-preview");
  const hoverPreviewImg = $("#hover-preview-img");
  const imageModal = $("#image-modal");
  const modalImg = $("#modal-img");
  const modalClose = $("#modal-close");
  const toggleHover = $("#toggle-hover");
  const toggleCompress = $("#toggle-compress");
  const btnSidebarToggle = $("#btn-sidebar-toggle");
  const sidebarEl = $(".sidebar");
  const sidebarOverlay = $("#sidebar-overlay");

  // ============ 悬浮预览状态 ============
  let hoverEnabled = true; // 开关
  let hoverTimer = null;   // 延迟显示定时器
  let justDragged = false; // 刚拖拽完的标记，防止误触弹窗

  // ============ 弹窗缩放/拖拽状态 ============
  let modalScale = 1;
  let modalTx = 0, modalTy = 0;
  let isDragging = false, dragMoved = false;
  let dragStartX = 0, dragStartY = 0, dragBaseTx = 0, dragBaseTy = 0;
  let pinchStartDist = 0, pinchStartScale = 1;
  let longPressTimer = null, longPressFired = false;

  // ============ 初始化 ============
  async function init() {
    // 检测依赖库是否加载成功
    if (typeof window.jspdf === "undefined") {
      document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#ff4d4f;font-size:18px;">' +
        '<h2>⚠️ jsPDF 库加载失败</h2>' +
        '<p style="margin-top:12px;color:#666;">请先运行 <b>setup.ps1</b> 下载依赖库，再刷新页面。</p>' +
        '<p style="color:#999;font-size:14px;">右键 setup.ps1 → 使用 PowerShell 运行</p></div>';
      return;
    }
    if (typeof Sortable === "undefined") {
      console.warn("SortableJS 未加载，拖拽排序将不可用，可使用手动输入页码替代。");
    }

    // 从 localStorage 恢复任务元数据
    const saved = Storage.loadTasks();
    tasks = saved.map((t) => ({
      ...t,
      images: t.images.map((img) => ({ ...img, dataUrl: null })),
    }));

    // 从 IndexedDB 恢复图片 dataUrl
    const allImgIds = tasks.flatMap((t) => t.images.map((i) => i.id));
    if (allImgIds.length > 0) {
      const urlMap = await Storage.getImages(allImgIds);
      tasks.forEach((t) => {
        t.images.forEach((img) => {
          if (urlMap[img.id]) img.dataUrl = urlMap[img.id];
        });
      });
    }

    renderTaskList();
    bindEvents();
  }

  // ============ 事件绑定 ============
  function bindEvents() {
    btnNewTask.addEventListener("click", createTask);
    btnExport.addEventListener("click", exportPdf);
    btnDeleteTask.addEventListener("click", deleteTask);

    // 任务名修改
    taskNameInput.addEventListener("input", () => {
      const task = getActiveTask();
      if (!task) return;
      task.name = taskNameInput.value.trim() || "未命名";
      saveAndRenderList();
    });

    // 上传区点击
    uploadArea.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileSelect);

    // 拖拽上传
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("dragover");
    });
    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("dragover");
    });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
      if (files.length > 0) addFiles(files);
    });

    // 悬浮预览开关
    toggleHover.addEventListener("change", () => {
      hoverEnabled = toggleHover.checked;
      if (!hoverEnabled) hideHoverPreview();
    });

    // 弹窗关闭
    modalClose.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // 弹窗点击空白关闭（区分拖拽）
    imageModal.addEventListener("click", (e) => {
      if (dragMoved) return;
      if (e.target === imageModal || e.target === modalImg) closeModal();
    });

    // PC 鼠标拖拽
    modalImg.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    // 弹窗滚轮缩放（PC）
    imageModal.addEventListener("wheel", handleModalWheel, { passive: false });

    // 移动端触摸事件
    modalImg.addEventListener("touchstart", handleModalTouchStart, { passive: false });
    window.addEventListener("touchmove", handleModalTouchMove, { passive: false });
    window.addEventListener("touchend", handleModalTouchEnd);

    // 悬浮预览：事件委托在 imageGrid 上
    imageGrid.addEventListener("mouseover", handleGridMouseOver);
    imageGrid.addEventListener("mouseout", handleGridMouseOut);
    imageGrid.addEventListener("mousemove", handleGridMouseMove);

    // 点击弹窗：事件委托在 imageGrid 上
    imageGrid.addEventListener("click", handleGridClick);

    // 移动端侧栏抽屉
    btnSidebarToggle.addEventListener("click", toggleSidebar);
    sidebarOverlay.addEventListener("click", closeSidebar);

    // Ctrl+V 粘贴图片
    document.addEventListener("paste", handlePaste);
  }

  // ============ 任务管理 ============
  function createTask() {
    const task = {
      id: "task_" + Date.now(),
      name: "新建任务",
      images: [],
      createdAt: Date.now(),
    };
    tasks.push(task);
    activeTaskId = task.id;
    saveAndRenderList();
    renderEditor();
    // 自动聚焦名称输入框
    setTimeout(() => {
      taskNameInput.focus();
      taskNameInput.select();
    }, 50);
  }

  async function deleteTask(taskId) {
    const task = taskId ? tasks.find((t) => t.id === taskId) : getActiveTask();
    if (!task) return;
    if (!confirm(`确定删除任务「${task.name}」吗？`)) return;

    // 从 IndexedDB 删除该任务的所有图片
    const imgIds = task.images.map((img) => img.id);
    await Storage.deleteImages(imgIds);

    tasks = tasks.filter((t) => t.id !== task.id);
    activeTaskId = tasks.length > 0 ? tasks[tasks.length - 1].id : null;
    saveAndRenderList();
    renderEditor();
  }

  function selectTask(taskId) {
    activeTaskId = taskId;
    renderTaskList();
    renderEditor();
    closeSidebar(); // 移动端选择任务后自动关闭侧栏
  }

  function getActiveTask() {
    return tasks.find((t) => t.id === activeTaskId) || null;
  }

  // ============ 图片上传 ============
  function handleFileSelect(e) {
    const files = [...e.target.files].filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) addFiles(files);
    fileInput.value = ""; // 重置，允许重复选择同一文件
  }

  function handlePaste(e) {
    if (!getActiveTask()) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }

  function addFiles(files) {
    const task = getActiveTask();
    if (!task) return;

    const MAX_IMAGES = 50;
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    const remaining = MAX_IMAGES - task.images.length;

    if (remaining <= 0) {
      alert(`最多上传 ${MAX_IMAGES} 张图片。`);
      return;
    }

    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      alert(`已达上限，仅添加前 ${remaining} 张。`);
    }

    let loaded = 0;
    toAdd.forEach((file) => {
      if (file.size > MAX_SIZE) {
        alert(`文件「${file.name}」超过 20MB，已跳过。`);
        loaded++;
        if (loaded === toAdd.length) renderImageGrid();
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const imgId = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        const dataUrl = e.target.result;
        task.images.push({
          id: imgId,
          name: file.name,
          dataUrl: dataUrl,
          order: task.images.length + 1,
        });
        // 持久化到 IndexedDB
        await Storage.saveImage(imgId, dataUrl);
        loaded++;
        if (loaded === toAdd.length) {
          reindexImages(task);
          saveAndRenderList();
          renderImageGrid();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function removeImage(imgId) {
    const task = getActiveTask();
    if (!task) return;
    task.images = task.images.filter((img) => img.id !== imgId);
    reindexImages(task);
    await Storage.deleteImage(imgId);
    saveAndRenderList();
    renderImageGrid();
  }

  function reindexImages(task) {
    task.images.forEach((img, i) => {
      img.order = i + 1;
    });
  }

  // ============ 渲染 ============
  function renderTaskList() {
    taskListEl.innerHTML = "";
    noTaskHint.style.display = tasks.length === 0 ? "block" : "none";

    tasks.forEach((task) => {
      const li = document.createElement("li");
      li.className = task.id === activeTaskId ? "active" : "";
      li.dataset.taskId = task.id;
      li.innerHTML = `
        <span class="task-name">${escapeHtml(task.name)}</span>
        <span class="task-count">${task.images.length} 张</span>
        <span class="task-delete-btn" title="删除任务">&times;</span>
      `;
      li.addEventListener("click", (e) => {
        if (e.target.closest(".task-delete-btn")) {
          e.stopPropagation();
          deleteTask(task.id);
        } else {
          selectTask(task.id);
        }
      });
      taskListEl.appendChild(li);
    });

    initTaskListSortable();
  }

  function renderEditor() {
    const task = getActiveTask();
    if (!task) {
      editorEmpty.style.display = "flex";
      editorPanel.style.display = "none";
      return;
    }

    editorEmpty.style.display = "none";
    editorPanel.style.display = "block";
    taskNameInput.value = task.name;
    renderImageGrid();
  }

  function renderImageGrid() {
    const task = getActiveTask();
    imageGrid.innerHTML = "";

    if (!task || task.images.length === 0) return;

    task.images.forEach((img) => {
      const card = document.createElement("div");
      card.className = "image-card";
      card.dataset.imgId = img.id;

      const src = img.dataUrl || "";
      card.innerHTML = `
        <span class="card-order">${img.order}</span>
        <button class="card-remove" title="移除">&times;</button>
        ${src ? `<img src="${src}" alt="${escapeHtml(img.name)}">` : `<img style="background:#f5f5f5;" alt="需重新上传">`}
        <div class="card-name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
      `;

      // 移除按钮
      card.querySelector(".card-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        removeImage(img.id);
      });

      imageGrid.appendChild(card);
    });

    // 初始化 / 刷新 SortableJS
    initSortable();
  }

  function initSortable() {
    if (sortableInstance) sortableInstance.destroy();
    if (typeof Sortable === "undefined") return;

    sortableInstance = new Sortable(imageGrid, {
      animation: 200,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onUpdate() {
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 200);

        const task = getActiveTask();
        if (!task) return;

        const newOrder = [];
        imageGrid.querySelectorAll(".image-card").forEach((card) => {
          const imgId = card.dataset.imgId;
          const img = task.images.find((i) => i.id === imgId);
          if (img) newOrder.push(img);
        });
        task.images = newOrder;
        reindexImages(task);
        saveAndRenderList();
        renderImageGrid();
      },
    });
  }

  function initTaskListSortable() {
    if (typeof Sortable === "undefined") return;
    taskListSortable = new Sortable(taskListEl, {
      animation: 200,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      // 用 onUpdate 代替 onEnd：移动端 onEnd 在动画结束后才触发，
      // 此时 DOM 可能已被 SortableJS 回退，导致读取到旧顺序
      onUpdate() {
        syncTaskOrder();
      },
    });
  }

  // 从 DOM 顺序同步任务数组并持久化（不重建 DOM）
  function syncTaskOrder() {
    const newTasks = [];
    taskListEl.querySelectorAll("li").forEach((li) => {
      const task = tasks.find((t) => t.id === li.dataset.taskId);
      if (task) newTasks.push(task);
    });
    tasks = newTasks;
    Storage.saveTasks(tasks);
  }

  // ============ 导出 ============
  async function exportPdf() {
    const task = getActiveTask();
    if (!task) return;

    if (task.images.length === 0) {
      alert("当前任务没有图片，无法导出。");
      return;
    }

    // 检查是否有 dataUrl（刷新后可能丢失）
    const missing = task.images.filter((img) => !img.dataUrl);
    if (missing.length > 0) {
      alert(`有 ${missing.length} 张图片数据丢失（页面曾刷新），请重新上传后再导出。`);
      return;
    }

    // 显示加载遮罩
    const overlay = document.createElement("div");
    overlay.className = "export-overlay";
    overlay.innerHTML = '<div class="spinner-box">正在生成 PDF，请稍候…</div>';
    document.body.appendChild(overlay);

    try {
      const compress = toggleCompress.checked;
      await PdfExport.exportTask(task, { compress });
    } catch (err) {
      console.error("导出失败:", err);
      alert("导出失败，请查看控制台日志。");
    } finally {
      overlay.remove();
    }
  }

  // ============ 工具 ============
  function saveAndRenderList() {
    Storage.saveTasks(tasks);
    renderTaskList();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ============ 移动端侧栏 ============
  function isMobile() {
    return window.innerWidth <= 768;
  }

  function toggleSidebar() {
    sidebarEl.classList.toggle("open");
    sidebarOverlay.classList.toggle("open");
  }

  function openSidebar() {
    sidebarEl.classList.add("open");
    sidebarOverlay.classList.add("open");
  }

  function closeSidebar() {
    sidebarEl.classList.remove("open");
    sidebarOverlay.classList.remove("open");
  }

  // ============ 悬浮预览 ============
  function handleGridMouseOver(e) {
    if (!hoverEnabled || isMobile()) return;
    const card = e.target.closest(".image-card");
    if (!card || card.classList.contains("sortable-chosen")) return;
    const imgId = card.dataset.imgId;
    const task = getActiveTask();
    if (!task) return;
    const img = task.images.find((i) => i.id === imgId);
    if (!img || !img.dataUrl) return;

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      hoverPreviewImg.src = img.dataUrl;
      hoverPreview.style.display = "block";
      positionHoverPreview(e);
    }, 300); // 延迟 300ms 防止快速滑过时闪烁
  }

  function handleGridMouseOut(e) {
    const card = e.target.closest(".image-card");
    if (!card) return;
    // 检查 relatedTarget 是否还在同一张卡片内
    const related = e.relatedTarget;
    if (related && card.contains(related)) return;

    clearTimeout(hoverTimer);
    hideHoverPreview();
  }

  function handleGridMouseMove(e) {
    if (!hoverEnabled || isMobile() || hoverPreview.style.display === "none") return;
    positionHoverPreview(e);
  }

  function positionHoverPreview(e) {
    const gap = 16;           // 鼠标与预览框的间距
    const pw = hoverPreview.offsetWidth;
    const ph = hoverPreview.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left, top;

    // 优先放右边，空间不够放左边
    if (e.clientX + gap + pw <= vw) {
      left = e.clientX + gap;
    } else if (e.clientX - gap - pw >= 0) {
      left = e.clientX - gap - pw;
    } else {
      // 两边都不够，居中
      left = Math.max(0, (vw - pw) / 2);
    }

    // 优先放下方，空间不够放上方
    if (e.clientY + gap + ph <= vh) {
      top = e.clientY + gap;
    } else if (e.clientY - gap - ph >= 0) {
      top = e.clientY - gap - ph;
    } else {
      top = Math.max(0, (vh - ph) / 2);
    }

    hoverPreview.style.left = left + "px";
    hoverPreview.style.top = top + "px";
  }

  function hideHoverPreview() {
    hoverPreview.style.display = "none";
    hoverPreviewImg.src = "";
  }

  // ============ 点击弹窗 ============
  function handleGridClick(e) {
    // 忽略移除按钮的点击和拖拽后的误触
    if (e.target.closest(".card-remove") || justDragged) return;

    const card = e.target.closest(".image-card");
    if (!card) return;

    const imgId = card.dataset.imgId;
    const task = getActiveTask();
    if (!task) return;
    const img = task.images.find((i) => i.id === imgId);
    if (!img || !img.dataUrl) return;

    // 隐藏悬浮预览
    hideHoverPreview();

    modalImg.src = img.dataUrl;
    resetModalZoom();
    imageModal.style.display = "flex";
  }

  function closeModal() {
    imageModal.style.display = "none";
    modalImg.src = "";
    resetModalZoom();
    clearTimeout(longPressTimer);
  }

  function resetModalZoom() {
    modalScale = 1;
    modalTx = 0;
    modalTy = 0;
    isDragging = false;
    dragMoved = false;
    applyModalTransform();
    modalImg.style.cursor = "";
  }

  // ============ 弹窗缩放 + 拖拽 ============
  function applyModalTransform() {
    modalImg.style.transform = `translate(${modalTx}px, ${modalTy}px) scale(${modalScale})`;
    modalImg.style.cursor = modalScale > 1 ? "grab" : "";
  }

  function clampTranslate() {
    if (modalScale <= 1) { modalTx = 0; modalTy = 0; return; }
    const rect = modalImg.getBoundingClientRect();
    const imgW = rect.width / modalScale;
    const imgH = rect.height / modalScale;
    const maxTx = (imgW * (modalScale - 1)) / 2;
    const maxTy = (imgH * (modalScale - 1)) / 2;
    modalTx = Math.max(-maxTx, Math.min(modalTx, maxTx));
    modalTy = Math.max(-maxTy, Math.min(modalTy, maxTy));
  }

  // --- PC 滚轮缩放 ---
  function handleModalWheel(e) {
    if (imageModal.style.display === "none") return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    modalScale += delta;
    modalScale = Math.max(1, Math.min(modalScale, 8));
    clampTranslate();
    applyModalTransform();
  }

  // --- PC 鼠标拖拽 ---
  function handleMouseDown(e) {
    if (modalScale <= 1) return;
    e.preventDefault();
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragBaseTx = modalTx;
    dragBaseTy = modalTy;
    modalImg.style.cursor = "grabbing";
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    modalTx = dragBaseTx + dx;
    modalTy = dragBaseTy + dy;
    clampTranslate();
    applyModalTransform();
  }

  function handleMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    modalImg.style.cursor = modalScale > 1 ? "grab" : "";
    setTimeout(() => { dragMoved = false; }, 100);
  }

  // --- 移动端触摸：双指缩放 + 长按拖拽 ---
  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleModalTouchStart(e) {
    if (imageModal.style.display === "none") return;
    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      clearTimeout(longPressTimer);
      pinchStartDist = getTouchDist(e.touches);
      pinchStartScale = modalScale;
    } else if (e.touches.length === 1 && modalScale > 1) {
      const touch = e.touches[0];
      longPressFired = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        isDragging = true;
        dragMoved = false;
        dragStartX = touch.clientX;
        dragStartY = touch.clientY;
        dragBaseTx = modalTx;
        dragBaseTy = modalTy;
      }, 300);
    }
  }

  function handleModalTouchMove(e) {
    if (imageModal.style.display === "none") return;
    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      clearTimeout(longPressTimer);
      const dist = getTouchDist(e.touches);
      modalScale = pinchStartScale * (dist / pinchStartDist);
      modalScale = Math.max(1, Math.min(modalScale, 8));
      clampTranslate();
      applyModalTransform();
    } else if (isDragging && e.touches.length === 1) {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartX;
      const dy = touch.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      modalTx = dragBaseTx + dx;
      modalTy = dragBaseTy + dy;
      clampTranslate();
      applyModalTransform();
    }
  }

  function handleModalTouchEnd(e) {
    if (imageModal.style.display === "none") return;
    clearTimeout(longPressTimer);
    if (e.touches.length < 2) pinchStartDist = 0;
    if (e.touches.length === 0) {
      if (!longPressFired && !dragMoved) {
        // 短按且未拖拽 → 关闭弹窗
        closeModal();
      }
      isDragging = false;
      dragMoved = false;
    }
  }

  // ============ 启动 ============
  init();
})();
