export interface FolderConnectionRecord {
    handle: FileSystemDirectoryHandle;
    name: string;
    savedAt: number;
}

// Minimal IndexedDB wrapper holding the last connected directory handle, so
// reconnecting can be offered after a reload. IndexedDB is required because
// handles are structured-cloneable but not JSON-serializable.
export class FileSystemHandleStorage {
    private static readonly DB_NAME: string = 'make-sense';
    private static readonly DB_VERSION: number = 2;
    private static readonly STORE_NAME: string = 'folder-connection';
    private static readonly RECORD_KEY: string = 'directory-handle';
    private static readonly LEGACY_STORE_NAME: string = 'autosave';

    private static isSupported(): boolean {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    }

    private static openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request: IDBOpenDBRequest = indexedDB.open(FileSystemHandleStorage.DB_NAME, FileSystemHandleStorage.DB_VERSION);
            request.onupgradeneeded = () => {
                const db: IDBDatabase = request.result;
                if (!db.objectStoreNames.contains(FileSystemHandleStorage.STORE_NAME)) {
                    db.createObjectStore(FileSystemHandleStorage.STORE_NAME);
                }
                // Drop the store left behind by the removed IndexedDB autosave feature.
                if (db.objectStoreNames.contains(FileSystemHandleStorage.LEGACY_STORE_NAME)) {
                    db.deleteObjectStore(FileSystemHandleStorage.LEGACY_STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public static save(record: FolderConnectionRecord): Promise<void> {
        if (!FileSystemHandleStorage.isSupported()) return Promise.resolve();
        return FileSystemHandleStorage.openDB().then((db: IDBDatabase) => {
            return new Promise<void>((resolve, reject) => {
                const tx: IDBTransaction = db.transaction(FileSystemHandleStorage.STORE_NAME, 'readwrite');
                tx.objectStore(FileSystemHandleStorage.STORE_NAME).put(record, FileSystemHandleStorage.RECORD_KEY);
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

    public static load(): Promise<FolderConnectionRecord | null> {
        if (!FileSystemHandleStorage.isSupported()) return Promise.resolve(null);
        return FileSystemHandleStorage.openDB().then((db: IDBDatabase) => {
            return new Promise<FolderConnectionRecord | null>((resolve, reject) => {
                const tx: IDBTransaction = db.transaction(FileSystemHandleStorage.STORE_NAME, 'readonly');
                const request: IDBRequest = tx.objectStore(FileSystemHandleStorage.STORE_NAME).get(FileSystemHandleStorage.RECORD_KEY);
                request.onsuccess = () => {
                    db.close();
                    resolve((request.result as FolderConnectionRecord) || null);
                };
                request.onerror = () => {
                    db.close();
                    reject(request.error);
                };
            });
        });
    }

    public static clear(): Promise<void> {
        if (!FileSystemHandleStorage.isSupported()) return Promise.resolve();
        return FileSystemHandleStorage.openDB().then((db: IDBDatabase) => {
            return new Promise<void>((resolve, reject) => {
                const tx: IDBTransaction = db.transaction(FileSystemHandleStorage.STORE_NAME, 'readwrite');
                tx.objectStore(FileSystemHandleStorage.STORE_NAME).delete(FileSystemHandleStorage.RECORD_KEY);
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
