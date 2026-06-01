/**
 * storage.js — 持久化存储
 *
 * 策略：
 *   - 任务元数据（id, name, 图片文件名/顺序）→ localStorage（轻量快速）
 *   - 图片 dataUrl → IndexedDB（容量大，可存大量图片）
 */

const STORAGE_KEY = "img2pdf_tasks";
const DB_NAME = "img2pdf_db";
const DB_VERSION = 1;
const STORE_NAME = "images";

// ============ IndexedDB 封装 ============

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(key, value) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function dbGet(key) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
  );
}

function dbDelete(key) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function dbDeleteMany(keys) {
  if (keys.length === 0) return Promise.resolve();
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        keys.forEach((k) => store.delete(k));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

// ============ 主接口 ============

const Storage = {
  /** 保存图片 dataUrl 到 IndexedDB */
  saveImage(imgId, dataUrl) {
    return dbPut(imgId, dataUrl);
  },

  /** 从 IndexedDB 读取单张图片 dataUrl */
  getImage(imgId) {
    return dbGet(imgId);
  },

  /** 从 IndexedDB 批量读取图片 dataUrl */
  async getImages(imgIds) {
    if (imgIds.length === 0) return {};
    const db = await openDB();
    const results = {};
    await Promise.all(
      imgIds.map(
        (id) =>
          new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
            req.onsuccess = () => {
              if (req.result) results[id] = req.result;
              resolve();
            };
            req.onerror = () => reject(req.error);
          })
      )
    );
    return results;
  },

  /** 从 IndexedDB 删除图片 */
  deleteImage(imgId) {
    return dbDelete(imgId);
  },

  /** 从 IndexedDB 批量删除图片 */
  deleteImages(imgIds) {
    return dbDeleteMany(imgIds);
  },

  /** 读取任务元数据（同步，从 localStorage） */
  loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /** 保存任务元数据（同步，到 localStorage） */
  saveTasks(tasks) {
    const meta = tasks.map((t) => ({
      id: t.id,
      name: t.name,
      images: t.images.map((img) => ({
        id: img.id,
        name: img.name,
        order: img.order,
      })),
      createdAt: t.createdAt,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  },

  /** 清空所有数据 */
  async clear() {
    localStorage.removeItem(STORAGE_KEY);
    // 清空 IndexedDB
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    return new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
  },
};
