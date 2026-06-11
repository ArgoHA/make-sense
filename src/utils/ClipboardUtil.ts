export class ClipboardUtil {
    public static copyText(text: string): Promise<void> {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        // Fallback for non-secure contexts (e.g. http://host:port) where the
        // async Clipboard API is unavailable.
        return new Promise<void>((resolve, reject) => {
            try {
                const textArea: HTMLTextAreaElement = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                const succeeded: boolean = document.execCommand('copy');
                document.body.removeChild(textArea);
                succeeded ? resolve() : reject(new Error('copy command failed'));
            } catch (error) {
                reject(error);
            }
        });
    }
}
