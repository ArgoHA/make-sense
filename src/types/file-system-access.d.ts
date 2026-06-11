// Minimal ambient typings for the File System Access API (Chrome/Edge).
// TypeScript 4.7's lib.dom already declares the handle interfaces, but lacks
// the directory picker, permissions, writable streams and async iteration -
// they are merged into the lib.dom interfaces here.

type FileSystemPermissionMode = 'read' | 'readwrite';

interface FileSystemHandlePermissionDescriptor {
    mode?: FileSystemPermissionMode;
}

interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemCreateWritableOptions {
    keepExistingData?: boolean;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: BufferSource | Blob | string): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
}

interface FileSystemFileHandle {
    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
    keys(): AsyncIterableIterator<string>;
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
    entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}

interface DirectoryPickerOptions {
    id?: string;
    mode?: FileSystemPermissionMode;
    startIn?: FileSystemHandle | string;
}

interface Window {
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
