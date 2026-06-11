export class FileSystemPermissionUtil {
    private static readonly DESCRIPTOR: FileSystemHandlePermissionDescriptor = {mode: 'readwrite'};

    // Passive check - never triggers a browser prompt.
    public static async verify(handle: FileSystemHandle): Promise<boolean> {
        try {
            return await handle.queryPermission(FileSystemPermissionUtil.DESCRIPTOR) === 'granted';
        } catch {
            return false;
        }
    }

    // May show a browser prompt - Chrome rejects it outside a user gesture,
    // so this must be called from within a click handler's task.
    public static async requestInGesture(handle: FileSystemHandle): Promise<boolean> {
        try {
            return await handle.requestPermission(FileSystemPermissionUtil.DESCRIPTOR) === 'granted';
        } catch {
            return false;
        }
    }
}
