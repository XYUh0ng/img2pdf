/**
 * pdf-export.js — PDF 生成与下载
 * 依赖 jsPDF（UMD 全局变量 window.jspdf）
 */

const PdfExport = {
  /**
   * 将任务中的图片导出为 PDF 并触发下载
   * @param {Object} task - 任务对象 { name, images: [{ name, dataUrl, order }] }
   * @param {Object} options - { compress: boolean }
   */
  async exportTask(task, options = {}) {
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
      if (!img.dataUrl) continue;

      if (i > 0) pdf.addPage();

      let dataUrl = img.dataUrl;

      // 压缩图片
      if (options.compress) {
        dataUrl = await this._compressImage(dataUrl);
      }

      const dims = await this._getImageDimensions(dataUrl);
      const fit = this._fitToPage(dims.width, dims.height, pageW, pageH);
      const format = this._detectFormat(dataUrl);
      pdf.addImage(dataUrl, format, fit.x, fit.y, fit.w, fit.h);
    }

    const fileName = (task.name || "未命名") + ".pdf";
    pdf.save(fileName);
  },

  /**
   * 压缩图片：限制最大边长 2000px，JPEG 质量 0.8
   */
  _compressImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const MAX_SIDE = 2000;

        // 等比缩放
        if (width > MAX_SIDE || height > MAX_SIDE) {
          const ratio = Math.min(MAX_SIDE / width, MAX_SIDE / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // PNG 保持无损，其他格式用 JPEG 0.8 质量
        const isPNG = dataUrl.includes("image/png");
        const result = canvas.toDataURL(isPNG ? "image/png" : "image/jpeg", 0.8);
        resolve(result);
      };
      img.onerror = () => resolve(dataUrl); // 压缩失败则用原图
      img.src = dataUrl;
    });
  },

  /**
   * 获取图片原始像素尺寸
   */
  _getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 800, height: 1100 });
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
    return "JPEG";
  },
};
