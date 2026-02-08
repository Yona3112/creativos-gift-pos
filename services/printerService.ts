
export const PrinterService = {
    /**
     * Prints HTML content using a hidden iframe to avoid popup blockers
     * and ensure consistent rendering.
     * @param htmlContent The full HTML string to print
     */
    printHTML: (htmlContent: string) => {
        // Create a hidden iframe
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';

        // Append to body
        document.body.appendChild(iframe);

        // Write content
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(htmlContent);
            doc.close();

            // Wait for content to load (images, styles)
            iframe.onload = () => {
                try {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } catch (e) {
                    console.error("Printing failed:", e);
                } finally {
                    // Remove iframe after a delay to ensure print dialog triggers
                    // Note: In some browsers, removing immediately might cancel print.
                    // 1 minute timeout is safe, or checking for afterprint event
                    setTimeout(() => {
                        document.body.removeChild(iframe);
                    }, 5000); // 5 seconds should be enough for the dialog to appeal
                }
            };
        }
    }
};
