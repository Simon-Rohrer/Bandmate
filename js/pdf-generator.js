/**
 * PDF Generator Module
 * Handles the generation of PDFs using html2canvas and jsPDF
 */
const PDFGenerator = {

    // Helper to escape HTML to prevent XSS in the generated PDF
    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Generate and download a Setlist PDF
     * @param {Object} data - Configuration object
     * @param {string} data.title - Main title (e.g., Event Name or "Gesamtsetlist")
     * @param {string} data.subtitle - Subtitle (optional)
     * @param {Array} data.metaInfo - Array of strings/objects for header info (e.g. ["Band XYZ", "Date", "Location"])
     * @param {Array} data.songs - Array of song objects
     * @param {boolean} data.showNotes - Whether to show CCLI/Notes section at bottom
     * @param {string} data.filename - Desired filename
     */
    async generateSetlistPDF({ title, subtitle, metaInfo = [], songs = [], showNotes = false, filename = 'setlist.pdf', previewOnly = false }) {
        try {
            // Build HTML content
            const element = document.createElement('div');

            // Layout Configuration
            // box-sizing: border-box ensures padding is included in width
            const styles = {
                container: "font-family: 'Inter', Arial, sans-serif; padding: 20px; background: white; color: #111827; width: 1100px; margin: 0 auto; box-sizing: border-box;",
                headerAccent: "height: 6px; background: #8B5CF6; border-radius: 3px; margin-bottom: 25px;",
                header: "display: flex; flex-direction: column; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #E5E7EB; padding-bottom: 15px;", // Reduced margin/padding
                h1: "margin: 0; font-size: 28px; font-weight: 700; color: #111827; letter-spacing: -0.025em; text-align: center;",
                metaRow: "display: flex; gap: 20px; margin-top: 12px; color: #6B7280; font-size: 14px; flex-wrap: wrap; justify-content: center;",
                subHeader: "margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end;",
                h2: "margin: 0; font-size: 16px; font-weight: 600; color: #111827; text-transform: uppercase; letter-spacing: 0.05em;",
                table: "width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 13px; table-layout: fixed;",
                th: "padding: 12px 10px; text-align: left; font-weight: 600; color: #4B5563; border-bottom: 2px solid #E5E7EB; background-color: #F9FAFB;",
                td: "padding: 10px; color: #111827; border-bottom: 1px solid #F3F4F6;",
                footer: "margin-top: 50px; padding-top: 20px; border-top: 1px solid #E5E7EB; color: #9CA3AF; font-size: 11px; display: flex; justify-content: space-between; align-items: center;"
            };

            // Generate Meta/Subtitle HTML
            let metaHtml = '';
            if (subtitle) {
                metaHtml += `<div style="margin-top: 8px; color: #6B7280; font-size: 14px; font-weight: 500;">${this.escapeHtml(subtitle)}</div>`;
            }
            if (metaInfo && metaInfo.length > 0) {
                metaHtml += `<div style="${styles.metaRow}">`;
                metaInfo.forEach(info => {
                    metaHtml += `<span>${info}</span>`; // info is assumed to be safe or pre-formatted HTML (like 🎸 <b>Name</b>) OR plain text. 
                    // For safety, caller should escape if raw user input, but usually we pass formatted HTML icons here.
                    // We'll trust the caller to pass HTML for icons/bolding, or layout might break if we escape everything.
                });
                metaHtml += `</div>`;
            }

            // Generate Songs Rows
            const songsRows = songs.map((song, idx) => `
                <tr style="border-bottom: 1px solid #F3F4F6; ${idx % 2 === 0 ? '' : 'background-color: #FAFAFA;'}">
                    <td style="padding: 10px; color: #9CA3AF; font-weight: 500; width: 35px;">${idx + 1}</td>
                    <td style="padding: 10px; font-weight: 600; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(song.title)}</td>
                    <td style="padding: 10px; color: #4B5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(song.artist || '-')}</td>
                    <td style="padding: 10px; text-align: center; font-weight: 500; width: 50px;">${song.bpm || '-'}</td>
                    <td style="padding: 10px; text-align: center; font-weight: 500; color: #8B5CF6; width: 50px;">${song.key || '-'}</td>
                    <td style="padding: 10px; color: #4B5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100px;">${this.escapeHtml(song.leadVocal || '-')}</td>
                </tr>
            `).join('');

            // Additional Info Section (Notes only, CCLI is in table)
            let additionalInfoHTML = '';
            if (showNotes && songs.some(s => s.notes)) {
                additionalInfoHTML = `
                    <div style="margin-top: 40px; border-radius: 12px; border: 1px solid #E5E7EB; overflow: hidden;">
                        <div style="background: #F9FAFB; padding: 12px 20px; border-bottom: 1px solid #E5E7EB;">
                            <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">Zusätzliche Informationen</h3>
                        </div>
                        <div style="padding: 10px 20px;">
                            ${songs.filter(s => s.notes).map((song, idx) => `
                                <div style="padding: 12px 0; ${idx !== 0 ? 'border-top: 1px dashed #E5E7EB;' : ''}">
                                    <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #111827;">${this.escapeHtml(song.title)}</div>
                                    <div style="font-size: 12px; color: #6B7280;">
                                        <span><b>Notiz:</b> ${this.escapeHtml(song.notes)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Construct Full HTML
            element.innerHTML = `
                <div style="${styles.container}">
                    <!-- Header Accent -->
                    <div style="${styles.headerAccent}"></div>

                    <div style="${styles.header}">
                        <h1 style="${styles.h1}">${this.escapeHtml(title)}</h1>
                        ${metaHtml}
                    </div>

                    <div style="${styles.subHeader}">
                        <h2 style="${styles.h2}">Songliste</h2>
                        <span style="color: #9CA3AF; font-size: 13px;">${songs.length} Songs</span>
                    </div>

                    <table style="${styles.table}">
                        <thead>
                            <tr style="${styles.th}">
                                <th style="padding: 12px 5px; text-align: left; font-weight: 600; width: 40px; color: #4B5563;">#</th>
                                <th style="padding: 12px 5px; text-align: left; font-weight: 600; width: 300px; color: #4B5563;">Titel</th>
                                <th style="padding: 12px 5px; text-align: left; font-weight: 600; width: 200px; color: #4B5563;">Interpret</th>
                                <th style="padding: 12px 5px; text-align: left; font-weight: 600; width: 180px; color: #4B5563;">Genre</th>
                                <th style="padding: 12px 5px; text-align: center; font-weight: 600; width: 60px; color: #4B5563;">BPM</th>
                                <th style="padding: 12px 5px; text-align: center; font-weight: 600; width: 60px; color: #4B5563;">Time</th>
                                <th style="padding: 12px 5px; text-align: center; font-weight: 600; width: 60px; color: #4B5563;">Key</th>
                                <th style="padding: 12px 5px; text-align: left; font-weight: 600; width: 100px; color: #4B5563;">Sprache</th>
                                <th style="padding: 12px 5px; text-align: left; font-weight: 600; width: 100px; color: #4B5563;">CCLI</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${songs.map((song, idx) => `
                <tr style="border-bottom: 1px solid #F3F4F6; ${idx % 2 === 0 ? '' : 'background-color: #FAFAFA;'}">
                    <td style="padding: 8px 5px; color: #9CA3AF; font-weight: 500; vertical-align: top;">${idx + 1}</td>
                    <td style="padding: 8px 5px; font-weight: 600; color: #111827; vertical-align: top;">${this.escapeHtml(song.title)}</td>
                    <td style="padding: 8px 5px; color: #4B5563; vertical-align: top;">${this.escapeHtml(song.artist || '-')}</td>
                    <td style="padding: 8px 5px; color: #4B5563; vertical-align: top;">${this.escapeHtml(song.genre || '-')}</td>
                    <td style="padding: 8px 5px; text-align: center; font-weight: 500; vertical-align: top;">${song.bpm || '-'}</td>
                    <td style="padding: 8px 5px; text-align: center; font-weight: 500; vertical-align: top;">${song.timeSignature || '-'}</td>
                    <td style="padding: 8px 5px; text-align: center; font-weight: 500; color: #8B5CF6; vertical-align: top;">${song.key || '-'}</td>
                    <td style="padding: 8px 5px; color: #4B5563; vertical-align: top;">${this.escapeHtml(song.language || '-')}</td>
                    <td style="padding: 8px 5px; color: #4B5563; vertical-align: top; font-family: monospace;">${this.escapeHtml(song.ccli || '-')}</td>
                </tr>
            `).join('')}
                        </tbody>
                    </table>

                    ${additionalInfoHTML}

                    <div style="${styles.footer}">
                        <div>Erstellt mit <b>Bandmate</b></div>
                        <div>Stand: ${new Date().toLocaleString('de-DE')}</div>
                    </div>
                </div>
            `;

            // Style Element for Rendering
            element.style.backgroundColor = 'white';
            element.style.padding = '0';
            element.style.margin = '0';
            element.style.color = 'black';
            element.style.position = 'absolute'; // Prevent it from messing with layout while rendering
            element.style.left = '-9999px';
            element.style.top = '0';
            element.style.width = '1100px'; // Wider for Landscape

            // Append to body temporarily
            document.body.appendChild(element);

            // Wait for rendering (ensure fonts load etc)
            await new Promise(resolve => setTimeout(resolve, 200));

            // Generate canvas
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: 1100, // Matching width
                windowWidth: 1100
            });

            // Create PDF
            // l = landscape, mm = millimeters, a4 = format
            const pdf = new window.jsPDF('l', 'mm', 'a4');
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 297; // A4 width in mm (landscape)
            const pageHeight = 210; // A4 height in mm (landscape)
            const imgHeight = canvas.height * imgWidth / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            // Cleanup
            document.body.removeChild(element);

            if (previewOnly) {
                const blob = pdf.output('blob');
                const blobUrl = URL.createObjectURL(blob);
                return { pdf, blobUrl, filename };
            }

            pdf.save(filename);
            return true;

        } catch (error) {
            console.error('PDFGenerator Error:', error);
            throw error;
        }
    }
};

window.PDFGenerator = PDFGenerator;
