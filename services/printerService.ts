
export const PrinterService = {
    /**
     * Prints HTML content using a popup window with preview toolbar.
     * The user can review the content before clicking Print.
     * @param htmlContent The full HTML string to print
     * @param title Optional title for the preview window
     */
    printHTML: (htmlContent: string, title: string = 'Ticket') => {
        // Create a popup window for preview
        const win = window.open('', '_blank', 'width=450,height=700,scrollbars=yes');

        if (win) {
            // Create the print toolbar
            const printToolbar = `
                <div id="print-toolbar" style="position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 9999;">
                    <span style="color: white; font-weight: bold; font-size: 14px;">📋 Previsualización - ${title}</span>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="document.getElementById('print-toolbar').style.display='none'; window.print(); document.getElementById('print-toolbar').style.display='flex';" style="background: white; color: #667eea; border: none; padding: 8px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            🖨️ Imprimir
                        </button>
                        <button onclick="window.close();" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 8px 16px; border-radius: 6px; cursor: pointer;">
                            ✕ Cerrar
                        </button>
                    </div>
                </div>
                <style>
                    @media print { #print-toolbar { display: none !important; } }
                    body { padding-top: 60px !important; }
                </style>
            `;

            // Inject toolbar into HTML content
            const modifiedContent = htmlContent.replace(/<body([^>]*)>/i, `<body$1>${printToolbar}`);

            win.document.write(modifiedContent);
            win.document.close();
            win.focus();
            // No auto-print - user clicks button when ready
        } else {
            // Fallback: If popup blocked, use hidden iframe (old behavior)
            console.warn('Popup blocked, falling back to direct print');
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';

            document.body.appendChild(iframe);

            const doc = iframe.contentWindow?.document;
            if (doc) {
                doc.open();
                doc.write(htmlContent);
                doc.close();

                iframe.onload = () => {
                    try {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                    } catch (e) {
                        console.error("Printing failed:", e);
                    } finally {
                        setTimeout(() => {
                            document.body.removeChild(iframe);
                        }, 5000);
                    }
                };
            }
        }
    }
};
