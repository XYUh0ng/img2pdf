# 📄 图片转 PDF 工具

一个纯前端的图片批量合并为 PDF 的小工具，浏览器端完成所有处理，无需后端服务，开箱即用。

## ✨ 功能

- 📷 **批量上传** — 支持一次选择多张图片（JPG / PNG / BMP / WEBP）
- 🔀 **图片拖拽排序** — 自由调整每张图片在 PDF 中的页序
- 📋 **多任务管理** — 同时创建多个任务，任务列表支持拖拽排序
- 🔍 **悬浮预览** — 鼠标悬浮缩略图自动放大预览（可开关）
- 🖼️ **原图查看** — 点击缩略图弹窗查看原图，支持滚轮/双指缩放与拖拽平移
- 📋 **Ctrl+V 粘贴** — PC 端支持直接粘贴剪贴板图片
- ⬇️ **一键导出** — 按当前排序生成 A4 尺寸 PDF，支持可选图片压缩
- 💾 **数据持久化** — 任务和图片数据自动保存，关闭浏览器后重新打开不丢失
- 📱 **移动端适配** — 响应式布局，手机端侧栏抽屉、触屏优化
- 🔒 **隐私安全** — 所有处理在浏览器本地完成，图片不会上传到任何服务器

## 🚀 使用方式

### 方式一：直接使用（推荐）

1. 下载本项目并解压
2. 双击运行 `下载依赖库.bat`，自动下载所需的 jsPDF 和 SortableJS 库
3. 用浏览器打开 `index.html` 即可使用

### 方式二：手动下载依赖

如果 bat 脚本无法运行，手动下载以下两个文件，放到 `lib/` 目录下：

| 文件 | 下载地址 |
|------|---------|
| `jspdf.umd.min.js` | https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js |
| `Sortable.min.js` | https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js |

然后用浏览器打开 `index.html`。

## 📁 项目结构

```
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式
├── js/
│   ├── app.js              # 主逻辑（任务管理、上传、排序、预览）
│   ├── pdf-export.js       # PDF 生成与下载
│   └── storage.js          # 数据持久化（localStorage + IndexedDB）
├── lib/
│   ├── jspdf.umd.min.js    # jsPDF 库
│   └── Sortable.min.js     # SortableJS 库
├── setup.ps1               # PowerShell 依赖下载脚本
├── 下载依赖库.bat           # Windows 一键下载脚本
└── README.md
```

## 🛠️ 技术栈

- **HTML / CSS / JavaScript** — 纯前端，零框架
- **[jsPDF](https://github.com/parallax/jsPDF)** — 浏览器端 PDF 生成
- **[SortableJS](https://github.com/SortableJS/Sortable)** — 拖拽排序（图片列表 + 任务列表）
- **IndexedDB** — 图片数据持久化存储
- **localStorage** — 任务元数据存储

## ⚠️ 注意事项

- 任务数据和图片自动持久化，关闭浏览器后重新打开不丢失
- 单个任务最多 50 张图片，单张图片最大 20MB
- 推荐使用 Chrome / Edge / Firefox 最新版本

## 📄 License

[MIT](LICENSE)
