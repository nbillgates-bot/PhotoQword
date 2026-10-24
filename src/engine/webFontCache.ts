/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 字体文件的本地缓存（IndexedDB）。
 *
 * 从 webFontLoader 里拆出来：那边管的是「下载与注册」，这边只管「存取字节」，
 * 两件事各自可以单独看懂，合在一个文件里会超过 250 行（规约 §1.2）。
 *
 * 一律不抛错：缓存读不到、写不进都不是致命问题，最坏情况是这次走网络、下次再存。
 * 让缓存故障冒泡到渲染路径才是真的坏。
 */

const DB_NAME = 'qword-fonts';
const DB_VERSION = 1;
const STORE_NAME = 'fonts';

/** 打开 IndexedDB，懒加载单例 */
let dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
  });
  return dbPromise;
}

/**
 * 读一个字体文件。读不到（含出错）一律当没有。
 * @param key 见 webFontSources 的 webFontKey：家族名 + 字重，一档一条
 */
export async function getCachedFont(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/** 存一个字体文件。失败不是致命错误，下次再下就是了 */
export async function putCachedFont(key: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .put(buffer, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // 忽略
  }
}

/** 只给测试用：丢掉缓存的连接，让下一次 open 重新走一遍替身 */
export function resetWebFontDbForTests(): void {
  dbPromise = null;
}
