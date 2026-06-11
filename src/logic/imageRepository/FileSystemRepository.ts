export type FileSystemImageEntry = {
    fileHandle: FileSystemFileHandle;
    baseName: string;
    hasLabelFile: boolean;
};

// Holds the connection between the active project and a folder on disk opened
// via the File System Access API. Mirrors ImageRepository: a static singleton
// keyed by ImageData.id, living outside the store because handles are not
// serializable state.
export class FileSystemRepository {
    public static readonly LABELS_FILE_NAME: string = 'labels.txt';
    public static readonly LABELS_DIR_NAME: string = 'labels';
    public static readonly TRASH_DIR_NAME: string = '.trash';

    private static directoryHandle: FileSystemDirectoryHandle | null = null;
    private static labelsDirectoryHandle: FileSystemDirectoryHandle | null = null;
    private static imageEntries: Record<string, FileSystemImageEntry> = {};

    public static connect(directoryHandle: FileSystemDirectoryHandle): void {
        FileSystemRepository.reset();
        FileSystemRepository.directoryHandle = directoryHandle;
    }

    public static isConnected(): boolean {
        return FileSystemRepository.directoryHandle !== null;
    }

    public static getDirectoryHandle(): FileSystemDirectoryHandle | null {
        return FileSystemRepository.directoryHandle;
    }

    public static getFolderName(): string {
        return FileSystemRepository.directoryHandle ? FileSystemRepository.directoryHandle.name : '';
    }

    public static storeImageEntry(id: string, fileHandle: FileSystemFileHandle, baseName: string): void {
        FileSystemRepository.imageEntries[id] = {fileHandle, baseName, hasLabelFile: false};
    }

    public static getFileHandleById(id: string): FileSystemFileHandle | null {
        const entry: FileSystemImageEntry = FileSystemRepository.imageEntries[id];
        return entry ? entry.fileHandle : null;
    }

    public static getBaseNameById(id: string): string | null {
        const entry: FileSystemImageEntry = FileSystemRepository.imageEntries[id];
        return entry ? entry.baseName : null;
    }

    // Tracks whether labels/<base>.txt exists on disk, so unannotated images
    // are skipped without a disk round-trip on every autosave pass.
    public static hasLabelFile(id: string): boolean {
        const entry: FileSystemImageEntry = FileSystemRepository.imageEntries[id];
        return entry ? entry.hasLabelFile : false;
    }

    public static setHasLabelFile(id: string, hasLabelFile: boolean): void {
        const entry: FileSystemImageEntry = FileSystemRepository.imageEntries[id];
        if (entry) {
            entry.hasLabelFile = hasLabelFile;
        }
    }

    public static removeImageEntry(id: string): void {
        delete FileSystemRepository.imageEntries[id];
    }

    public static async getOrCreateLabelsDir(): Promise<FileSystemDirectoryHandle> {
        if (!FileSystemRepository.directoryHandle) {
            throw new Error('No folder is connected');
        }
        if (!FileSystemRepository.labelsDirectoryHandle) {
            FileSystemRepository.labelsDirectoryHandle = await FileSystemRepository.directoryHandle
                .getDirectoryHandle(FileSystemRepository.LABELS_DIR_NAME, {create: true});
        }
        return FileSystemRepository.labelsDirectoryHandle;
    }

    public static reset(): void {
        FileSystemRepository.directoryHandle = null;
        FileSystemRepository.labelsDirectoryHandle = null;
        FileSystemRepository.imageEntries = {};
    }
}
