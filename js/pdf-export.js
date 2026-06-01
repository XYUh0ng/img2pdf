/**
 * pdf-export.js — PDF 生成与下载
 * 依赖 jsPDF（UMD 全局变量 window.jspdf）
 */

const PdfExport = {
  /**
   * 将任务中的图片导出为 PDF 并触发下载
   * @param {Object} task - 任务对象 { name, images: [{ name, dataUrl, order }] }
   */
  async exportTask(task) {
    if (!task.images || task.images.length === 0) {
      alert("当前任务没有图片，无法导出。");
      return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });

    // A4 尺寸 (mm)
    const pageW = 210;
    const pageH = 297;

    // 按 order 排序
    const sorted = [...task.images].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sorted.length; i++) {
      const img = sorted[i];
      if (!img.dataUrl) continue; // 跳过无数据的图片（刷新后丢失）

      // 第一页不需要 addPage（jsPDF 构造时已创建第一页）
      if (i > 0) pdf.addPage();

      // 加载图片获取尺寸
      const dims = await this._getImageDimensions(img.dataUrl);
      const fit = this._fitToPage(dims.width, dims.height, pageW, pageH);

      // 判断图片格式
      const format = this._detectFormat(img.dataUrl);
      pdf.addImage(img.dataUrl, format, fit.x, fit.y, fit.w, fit.h);
    }

    // 触发下载
    const fileName = (task.name || "未命名") + ".pdf";
    pdf.save(fileName);
  },

  /**
   * 获取图片原始像素尺寸
   */
  _getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 800, height: 1100 }); // fallback
      img.src = dataUrl;
    });
  },

  /**
   * 计算适配 A4 页面的尺寸与位置（保持比例，居中）
   */
  _fitToPage(imgW, imgH, pageW, pageH) {
    const ratio = Math.min(pageW / imgW, pageH / imgH);
    const w = imgW * ratio;
    const h = imgH * ratio;
    return {
      w,
      h,
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
    };
  },

  /**
   * 根据 dataUrl 前缀判断图片格式
   */
  _detectFormat(dataUrl) {
    if (dataUrl.includes("image/png")) return "PNG";
    if (dataUrl.includes("image/webp")) return "WEBP";
    return "JPEG"; // 默认
  },
};
