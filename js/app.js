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
  const modalPageInfo = $("#modal-page-info");
  const modalSwapPrev = $("#modal-swap-prev");
  const modalSwapNext = $("#modal-swap-next");
  const toggleHover = $("#toggle-hover");
  const toggleCompress = $("#toggle-compress");
  const btnSidebarToggle = $("#btn-sidebar-toggle");
  const sidebarEl = $(".sidebar");
  const sidebarOverlay = $("#sidebar-overlay");

  // ============ 悬浮预览状态 ============
  let hoverEnabled = true; // 开关
  let hoverTimer = null; // 延迟显示定时器
  let justDragged = false; // 刚拖拽完的标记，防止误触弹窗

  // ============ 弹窗缩放/拖拽状态 ============
  let modalScale = 1;
  let modalTx = 0,
    modalTy = 0;
  let isDragging = false;
  let isPinching = false;

  // 触摸起点与位移追踪
  let touchStartX = 0,
    touchStartY = 0;
  let touchCurrentX = 0,
    touchCurrentY = 0;
  let pinchStartDist = 0,
    pinchStartScale = 1;

  // 弹窗内当前图片索引
  let modalCurrentIdx = -1;

  // ============ 初始化 ============
  async function init() {
    // 检测依赖库是否加载成功
    if (typeof window.jspdf === "undefined") {
      document.body.innerHTML =
        '<div style="padding:40px;text-align:center;color:#ff4d4f;font-size:18px;">' +
        "<h2>⚠️ jsPDF 库加载失败</h2>" +
        '<p style="margin-top:12px;color:#666;">请先运行 <b>setup.ps1</b> 下载依赖库，再刷新页面。</p>' +
        '<p style="color:#999;font-size:14px;">右键 setup.ps1 → 使用 PowerShell 运行</p></div>';
      return;
    }
    if (typeof Sortable === "undefined") {
      console.warn(
        "SortableJS 未加载，拖拽排序将不可用，可使用手动输入页码替代。",
      );
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

    // 恢复上次选中的任务
    const savedActiveId = localStorage.getItem("img2pdf_activeTaskId");
    if (savedActiveId && tasks.some((t) => t.id === savedActiveId)) {
      activeTaskId = savedActiveId;
    } else if (tasks.length > 0) {
      activeTaskId = tasks[tasks.length - 1].id;
    }

    renderTaskList();
    renderEditor();
    bindEvents();
  }

  // ============ 事件绑定 ============
  function bindEvents() {
    btnNewTask.addEventListener("click", createTask);
    btnExport.addEventListener("click", exportPdf);
    btnDeleteTask.addEventListener("click", () => deleteTask());

    // 任务名修改：实时检测重名（红框提示）
    taskNameInput.addEventListener("input", () => {
      const task = getActiveTask();
      if (!task) return;
      const newName = taskNameInput.value.trim() || "未命名";
      const isDuplicate = tasks.some(
        (t) => t.id !== task.id && t.name === newName
      );
      if (isDuplicate) {
        taskNameInput.style.borderColor = "#e74c3c";
        return;
      }
      taskNameInput.style.borderColor = "";
      task.name = newName;
      saveAndRenderList();
    });

    // 失焦时：如果仍是重名，弹提示并还原为原名
    taskNameInput.addEventListener("blur", () => {
      const task = getActiveTask();
      if (!task) return;
      const newName = taskNameInput.value.trim() || "未命名";
      const isDuplicate = tasks.some(
        (t) => t.id !== task.id && t.name === newName
      );
      if (isDuplicate) {
        showToast("任务名重复，请换一个名称");
        taskNameInput.value = task.name;
        taskNameInput.style.borderColor = "";
      }
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
      const files = [...e.dataTransfer.files].filter((f) =>
        f.type.startsWith("image/"),
      );
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

    // 弹窗内交换顺序
    modalSwapPrev.addEventListener("click", () => swapWithPrev());
    modalSwapNext.addEventListener("click", () => swapWithNext());

    // PC 鼠标拖拽（只绑定 mousedown，mousemove/mouseup 动态管理）
    modalImg.addEventListener("mousedown", handleMouseDown);

    // 弹窗滚轮缩放（PC）
    imageModal.addEventListener("wheel", handleModalWheel, { passive: false });

    // 移动端触摸事件（绑定在整个弹窗上，空白区域也能触发滑动/缩放/拖拽）
    imageModal.addEventListener("touchstart", handleModalTouchStart, {
      passive: false,
    });

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
  function generateUniqueName(baseName) {
    const existing = tasks.map((t) => t.name);
    if (!existing.includes(baseName)) return baseName;
    let i = 1;
    while (existing.includes(`${baseName}(${i})`)) i++;
    return `${baseName}(${i})`;
  }

  function createTask() {
    const task = {
      id: "task_" + Date.now(),
      name: generateUniqueName("新建任务"),
      images: [],
      createdAt: Date.now(),
    };
    tasks.push(task);
    activeTaskId = task.id;
    localStorage.setItem("img2pdf_activeTaskId", activeTaskId);
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
    localStorage.setItem("img2pdf_activeTaskId", activeTaskId ?? "");
    saveAndRenderList();
    renderEditor();
  }

  function selectTask(taskId) {
    activeTaskId = taskId;
    localStorage.setItem("img2pdf_activeTaskId", activeTaskId);
    renderTaskList();
    renderEditor();
    closeSidebar(); // 移动端选择任务后自动关闭侧栏
  }

  function getActiveTask() {
    return tasks.find((t) => t.id === activeTaskId) || null;
  }

  // ============ 图片上传 ============
  function handleFileSelect(e) {
    const files = [...e.target.files].filter((f) =>
      f.type.startsWith("image/"),
    );
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
        const imgId =
          "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
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
      delay: 50,
      delayOnTouchOnly: true,
      touchStartThreshold: 20,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onUpdate() {
        justDragged = true;
        setTimeout(() => {
          justDragged = false;
        }, 200);

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

  /**
   * ⚠️ 避坑警告 (2026-06-02 Fix):
   * 为什么这里必须在新建实例前执行 taskListSortable.destroy()?
   * 每次 renderTaskList() 触发时都会重复调用此函数。若不 destroy 旧实例，
   * 多个 Sortable 监听器会叠加抢夺移动端的 touchmove 手势，导致拖拽行为彻底死锁！
   * 详见项目根目录下的文档：/docs/pitfalls/20260602-sortable-leak.md
   */
  function initTaskListSortable() {
    if (typeof Sortable === "undefined") return;
    if (taskListSortable) taskListSortable.destroy();
    taskListSortable = new Sortable(taskListEl, {
      animation: 200,
      delay: 50,
      delayOnTouchOnly: true,
      touchStartThreshold: 20,
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
      alert(
        `有 ${missing.length} 张图片数据丢失（页面曾刷新），请重新上传后再导出。`,
      );
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

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    // 强制 reflow 再加动画类
    toast.getBoundingClientRect();
    toast.classList.add("toast-visible");
    setTimeout(() => {
      toast.classList.remove("toast-visible");
      toast.addEventListener("transitionend", () => toast.remove());
    }, 3000);
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
    if (!hoverEnabled || isMobile() || hoverPreview.style.display === "none")
      return;
    positionHoverPreview(e);
  }

  function positionHoverPreview(e) {
    const gap = 16; // 鼠标与预览框的间距
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

    modalCurrentIdx = task.images.indexOf(img);
    modalImg.src = img.dataUrl;
    updateModalPageInfo();
    resetModalTouch();
    imageModal.style.display = "flex";
  }

  function closeModal() {
    imageModal.style.display = "none";
    modalImg.src = "";
    modalCurrentIdx = -1;
    resetModalTouch();
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("touchmove", handleModalTouchMove);
    window.removeEventListener("touchend", handleModalTouchEnd);
    window.removeEventListener("touchcancel", handleModalTouchCancel);
  }

  // 弹窗内切换图片（swipe 切图）
  function showPrevImg() {
    const task = getActiveTask();
    if (!task || task.images.length === 0) return;
    modalCurrentIdx =
      modalCurrentIdx > 0 ? modalCurrentIdx - 1 : task.images.length - 1;
    modalImg.src = task.images[modalCurrentIdx].dataUrl;
    updateModalPageInfo();
  }

  function showNextImg() {
    const task = getActiveTask();
    if (!task || task.images.length === 0) return;
    modalCurrentIdx =
      modalCurrentIdx < task.images.length - 1 ? modalCurrentIdx + 1 : 0;
    modalImg.src = task.images[modalCurrentIdx].dataUrl;
    updateModalPageInfo();
  }

  // 弹窗页数指示器
  function updateModalPageInfo() {
    const task = getActiveTask();
    if (!task) return;
    const total = task.images.length;
    modalPageInfo.textContent =
      total > 0 ? `${modalCurrentIdx + 1} / ${total}` : "0 / 0";
    // 边界禁用按钮（单张图片时禁用交换）
    modalSwapPrev.disabled = total <= 1;
    modalSwapNext.disabled = total <= 1;
  }

  // 弹窗内交换图片顺序
  function swapWithPrev() {
    const task = getActiveTask();
    if (!task || modalCurrentIdx <= 0) {
      showToast("已经是第一张，无法与前页交换");
      return;
    }
    const imgs = task.images;
    [imgs[modalCurrentIdx - 1], imgs[modalCurrentIdx]] = [
      imgs[modalCurrentIdx],
      imgs[modalCurrentIdx - 1],
    ];
    modalCurrentIdx--;
    reindexImages(task);
    saveAndRenderList();
    renderImageGrid();
    updateModalPageInfo();
    showToast("已与前页交换");
  }

  function swapWithNext() {
    const task = getActiveTask();
    if (!task || modalCurrentIdx >= task.images.length - 1) {
      showToast("已经是最后一张，无法与后页交换");
      return;
    }
    const imgs = task.images;
    [imgs[modalCurrentIdx], imgs[modalCurrentIdx + 1]] = [
      imgs[modalCurrentIdx + 1],
      imgs[modalCurrentIdx],
    ];
    modalCurrentIdx++;
    reindexImages(task);
    saveAndRenderList();
    renderImageGrid();
    updateModalPageInfo();
    showToast("已与后页交换");
  }

  // ============ 弹窗缩放 + 拖拽 ============
  function applyModalTransform() {
    // 🟢 核心：拖拽/缩放时 transition 为 none 实现像素级跟手；松手后恢复动画实现回弹
    if (isPinching || isDragging) {
      modalImg.style.transition = "none";
    } else {
      modalImg.style.transition =
        "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)";
    }
    modalImg.style.transform = `translate(${modalTx}px, ${modalTy}px) scale(${modalScale})`;
    modalImg.style.cursor = modalScale > 1 ? "grab" : "";
  }

  function clampTranslate() {
    if (modalScale <= 1) {
      modalTx = 0;
      modalTy = 0;
      return;
    }
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

  // --- PC 鼠标拖拽（动态绑定/解绑 window 监听器） ---
  let mouseDragStartX = 0,
    mouseDragStartY = 0,
    mouseDragBaseTx = 0,
    mouseDragBaseTy = 0;

  function handleMouseDown(e) {
    if (modalScale <= 1 || imageModal.style.display === "none") return;
    e.preventDefault();
    isDragging = true;
    mouseDragStartX = e.clientX;
    mouseDragStartY = e.clientY;
    mouseDragBaseTx = modalTx;
    mouseDragBaseTy = modalTy;
    modalImg.style.cursor = "grabbing";
    applyModalTransform();
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(e) {
    modalTx = mouseDragBaseTx + (e.clientX - mouseDragStartX);
    modalTy = mouseDragBaseTy + (e.clientY - mouseDragStartY);
    clampTranslate();
    applyModalTransform();
  }

  function handleMouseUp() {
    isDragging = false;
    modalImg.style.cursor = modalScale > 1 ? "grab" : "";
    applyModalTransform(); // 恢复 transition 实现回弹
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  // --- 移动端触摸：手势锁隔离（单指滑动切换 / 单指平移拖拽 / 双指缩放） ---
  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleModalTouchStart(e) {
    if (imageModal.style.display === "none") return;
    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      isPinching = true;
      isDragging = false;
      pinchStartDist = getTouchDist(e.touches);
      pinchStartScale = modalScale;
    } else if (e.touches.length === 1 && !isPinching) {
      isDragging = true;
      // 记录绝对起点（当前位移量回退到起点）
      touchStartX = e.touches[0].clientX - touchCurrentX;
      touchStartY = e.touches[0].clientY - touchCurrentY;
      window.addEventListener("touchmove", handleModalTouchMove, {
        passive: false,
      });
      window.addEventListener("touchend", handleModalTouchEnd);
      window.addEventListener("touchcancel", handleModalTouchCancel);
    }
    applyModalTransform();
  }

  function handleModalTouchMove(e) {
    if (imageModal.style.display === "none") return;

    if (isPinching && e.touches.length === 2) {
      // 🟢 双指缩放：严格隔离，只响应双指
      if (e.cancelable) e.preventDefault();
      const currentDistance = getTouchDist(e.touches);
      modalScale = Math.max(
        1,
        Math.min(pinchStartScale * (currentDistance / pinchStartDist), 8)
      );
      clampTranslate();
      applyModalTransform();
    } else if (isDragging && e.touches.length === 1) {
      if (e.cancelable) e.preventDefault();
      if (modalScale === 1) {
        // 🟢 未放大状态：单指滑动只记录 X 轴位移用于切图，不修改 translateX 避免图片位移
        touchCurrentX = e.touches[0].clientX - touchStartX;
      } else {
        // 🟢 已放大状态：转为图片拖拽平移（transition 为 none，像素级跟手）
        touchCurrentX = e.touches[0].clientX - touchStartX;
        touchCurrentY = e.touches[0].clientY - touchStartY;
        modalTx = touchCurrentX;
        modalTy = touchCurrentY;
        clampTranslate();
        applyModalTransform();
      }
    }
  }

  function handleModalTouchEnd(e) {
    if (imageModal.style.display === "none") return;

    if (e.touches.length < 2) {
      isPinching = false;
      pinchStartDist = 0;
    }

    if (e.touches.length === 0) {
      if (modalScale === 1) {
        // 🟢 未放大状态松手：根据滑动距离判断是否切图（阈值 50px）
        if (touchCurrentX > 50) {
          showPrevImg();
        } else if (touchCurrentX < -50) {
          showNextImg();
        }
        resetModalTouch();
      } else {
        // 🟢 放大状态松手：边缘越界回弹（此时 isDragging=false → applyModalTransform 恢复 transition 实现动画回弹）
        isDragging = false;
        const maxOffset = (modalScale - 1) * 150;
        modalTx = Math.max(-maxOffset, Math.min(modalTx, maxOffset));
        modalTy = Math.max(-maxOffset, Math.min(modalTy, maxOffset));
        touchCurrentX = modalTx;
        touchCurrentY = modalTy;
        applyModalTransform();
      }
      window.removeEventListener("touchmove", handleModalTouchMove);
      window.removeEventListener("touchend", handleModalTouchEnd);
      window.removeEventListener("touchcancel", handleModalTouchCancel);
    }
  }

  function handleModalTouchCancel() {
    isDragging = false;
    isPinching = false;
    window.removeEventListener("touchmove", handleModalTouchMove);
    window.removeEventListener("touchend", handleModalTouchEnd);
    window.removeEventListener("touchcancel", handleModalTouchCancel);
  }

  function resetModalTouch() {
    modalScale = 1;
    modalTx = 0;
    modalTy = 0;
    touchStartX = touchStartY = touchCurrentX = touchCurrentY = 0;
    isDragging = false;
    isPinching = false;
    applyModalTransform();
    modalImg.style.cursor = "";
  }

  // ============ 启动 ============
  init();
})();
