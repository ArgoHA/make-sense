import {AutoSaveSnapshot} from './AutoSaveTypes';

// Minimal IndexedDB wrapper holding a single autosave record. IndexedDB is used
// instead of localStorage because annotation datasets can easily exceed the
// ~5MB localStorage limit. Snapshots are plain (structured-cloneable) objects.
export class AutoSaveStorage {
    private static readonly DB_NAME: string = 'make-sense';
    private static readonly DB_VERSION: number = 1;
    private static readonly STORE_NAME: string = 'autosave';
    private static readonly RECORD_KEY: string = 'session';

    private static isSupported(): boolean {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    }

    private static openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request: IDBOpenDBRequest = indexedDB.open(AutoSaveStorage.DB_NAME, AutoSaveStorage.DB_VERSION);
            request.onupgradeneeded = () => {
                const db: IDBDatabase = request.result;
                if (!db.objectStoreNames.contains(AutoSaveStorage.STORE_NAME)) {
                    db.createObjectStore(AutoSaveStorage.STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public static save(snapshot: AutoSaveSnapshot): Promise<void> {
        if (!AutoSaveStorage.isSupported()) return Promise.resolve();
        return AutoSaveStorage.openDB().then((db: IDBDatabase) => {
            return new Promise<void>((resolve, reject) => {
                const tx: IDBTransaction = db.transaction(AutoSaveStorage.STORE_NAME, 'readwrite');
                tx.objectStore(AutoSaveStorage.STORE_NAME).put(snapshot, AutoSaveStorage.RECORD_KEY);
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            });
        });
    }

    public static load(): Promise<AutoSaveSnapshot | null> {
        if (!AutoSaveStorage.isSupported()) return Promise.resolve(null);
        return AutoSaveStorage.openDB().then((db: IDBDatabase) => {
            return new Promise<AutoSaveSnapshot | null>((resolve, reject) => {
                const tx: IDBTransaction = db.transaction(AutoSaveStorage.STORE_NAME, 'readonly');
                const request: IDBRequest = tx.objectStore(AutoSaveStorage.STORE_NAME).get(AutoSaveStorage.RECORD_KEY);
                request.onsuccess = () => {
                    db.close();
                    resolve((request.result as AutoSaveSnapshot) || null);
                };
                request.onerror = () => {
                    db.close();
                    reject(request.error);
                };
            });
        });
    }

    public static clear(): Promise<void> {
        if (!AutoSaveStorage.isSupported()) return Promise.resolve();
        return AutoSaveStorage.openDB().then((db: IDBDatabase) => {
            return new Promise<void>((resolve, reject) => {
                const tx: IDBTransaction = db.transaction(AutoSaveStorage.STORE_NAME, 'readwrite');
                tx.objectStore(AutoSaveStorage.STORE_NAME).delete(AutoSaveStorage.RECORD_KEY);
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            });
        });
    }
}
