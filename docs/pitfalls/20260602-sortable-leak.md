# 避坑日志：SortableJS 实例未销毁导致移动端手势锁死及事件泄露

## 📅 发生时间：2026-06-02
## 🏷️ 标签：#SortableJS #TouchEvent #MemoryLeak #事件冲突

## 🚨 现象描述
在移动端（触屏设备）环境下，用户点击查看图片放大弹窗后，退回到主界面时，左侧侧边栏的任务列表拖拽排序功能彻底失效（无法触发拖动）。

## 🔍 根因分析
1. **主因（实例叠加冲突）**：
   `initTaskListSortable()` 在重新渲染列表（如切换任务、更新数据）时被频繁触发，但缺失了旧实例的 `.destroy()` 操作。
   导致同一个 DOM 节点上无故叠加挂载了多个 SortableJS 实例。多个实例的 `touchstart/touchmove/touchend` 监听器在底层疯狂抢夺同一次触摸手势的控制权，导致事件响应死锁，引发拖拽失效。
   用户感知为"看图后坏了"，本质是因为打开图片前执行了 `selectTask()` 触发了列表重绘，埋下了冲突实例，直到看完图片回来尝试拖拽才暴露。

2. **次因（Window 事件泄露）**：
   Modal 弹窗的触摸拦截器在 `handleModalTouchStart` 中向 `window` 动态注册了手势监听，但未在系统触发 `touchcancel`（如通知弹出、手势冲突被系统强行拦截）时进行清理，存在小概率的永久事件泄露和状态锁死风险。

## 🛠️ 修复核心代码
1. **主修复**：
   ```javascript
   if (taskListSortable) {
       taskListSortable.destroy();
   }
   ```

2. **次要防御**：
   全面引入 `touchcancel` 事件监听，在 `closeModal()`、`handleModalTouchEnd` 中同步挂载和清理 `touchcancel`，并新增 `handleModalTouchCancel()` 用于在手势被系统强行终止时，干净地回滚 `isPinching` 等响应式状态。

## 💭 核心教训 (Takeaways)

* **清理意识（Cleanup）**：任何具有全局或 DOM 级"副作用"的第三方初始化逻辑（如 Swiper, ECharts, Sortable），在函数可能被重复调用的场景下，**必须有先销毁再重建的生命周期闭环**。
* **移动端手势防御**：在触屏开发中，只监听 `touchend` 是不够的，必须同时监听 `touchcancel` 来防御手势被系统冲突中断的情况。
* **对照意识**：项目中 `initSortable()`（图片网格）一直有 `destroy()` 保护，但 `initTaskListSortable()`（任务列表）却缺失——说明复制同类代码时务必对齐生命周期模式。
