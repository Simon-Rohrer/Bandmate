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

    normalizeRundownFontScale(fontScale = 1) {
        const value = Number(fontScale);
        if (!Number.isFinite(value)) return 1;
        return Math.min(1.2, Math.max(0.85, value));
    },

    scaleRundownSize(size = 16, fontScale = 1, minimum = 0) {
        const scaled = Math.max(minimum, Number(size || 0) * this.normalizeRundownFontScale(fontScale));
        const rounded = Math.round(scaled * 100) / 100;
        return `${Number.isInteger(rounded) ? rounded : String(rounded).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}px`;
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
    },

    sanitizeFilename(name = '', fallback = 'export.pdf') {
        const cleanBase = String(name || '')
            .trim()
            .replace(/[/\\?%*:|"<>]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
        const baseName = cleanBase || fallback.replace(/\.pdf$/i, '') || 'export';
        return /\.pdf$/i.test(baseName) ? baseName : `${baseName}.pdf`;
    },

    getRundownModeLabel(mode = 'full-details') {
        const labels = {
            'full-details': 'Ganzer Ablauf mit Details',
            'full-compact': 'Ganzer Ablauf ohne Details',
            'songs-full': 'Nur Songs mit allen Infos',
            'songs-language': 'Nur Songs mit Sprache',
            'songs-large': 'Große nummerierte Songtitel'
        };
        return labels[mode] || labels['full-details'];
    },

    getRundownBrandLogoUrl() {
        try {
            return new URL('/images/branding/bandmate-logo-short.svg', window.location.origin).href;
        } catch (error) {
            return '/images/branding/bandmate-logo-short.svg';
        }
    },

    renderRundownSongMetaChips(song = {}, chipStyle = '') {
        const entries = [
            song.artist ? `Interpret: ${song.artist}` : '',
            song.bpm ? `BPM: ${song.bpm}` : '',
            song.timeSignature ? `Time: ${song.timeSignature}` : '',
            song.key ? `Tonart: ${song.key}` : '',
            song.originalKey ? `Orig.: ${song.originalKey}` : '',
            song.leadVocal ? `Lead: ${song.leadVocal}` : '',
            song.language ? `Sprache: ${song.language}` : '',
            song.tracks === 'yes' ? 'Tracks: Ja' : (song.tracks === 'no' ? 'Tracks: Nein' : ''),
            song.ccli ? `CCLI: ${song.ccli}` : ''
        ].filter(Boolean);

        if (entries.length === 0) return '';

        return `
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;">
                ${entries.map((entry) => `<span style="${chipStyle}">${this.escapeHtml(entry)}</span>`).join('')}
            </div>
        `;
    },

    renderRundownSongCards(songs = [], options = {}) {
        const {
            cardStyle = '',
            orderStyle = '',
            titleStyle = '',
            metaStyle = '',
            noteStyle = '',
            chipStyle = '',
            languageOnly = false,
            largeTitles = false,
            suppressEmptyState = false,
            fontScale = 1,
            showColumnHeaders = false
        } = options;
        const scale = this.normalizeRundownFontScale(fontScale);
        const px = (size, minimum = 0) => this.scaleRundownSize(size, scale, minimum);
        const resolveTracks = (value) => {
            if (value === 'yes') return 'Ja';
            if (value === 'no') return 'Nein';
            return value || '';
        };
        const joinParts = (parts = [], fallback = '-') => {
            const filtered = parts.filter(Boolean).map((entry) => this.escapeHtml(String(entry)));
            return filtered.length > 0 ? filtered.join(' &middot; ') : fallback;
        };
        const compactSongColumns = `${px(22)} minmax(0, 2.5fr) minmax(0, 1.45fr) minmax(0, 0.92fr) minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 0.92fr) minmax(0, 1.2fr)`;

        if (!Array.isArray(songs) || songs.length === 0) {
            if (suppressEmptyState) return '';
            return `<div style="${cardStyle}; font-size:${px(13)}; color:#64748b;">Keine Songs für diese Ansicht vorhanden.</div>`;
        }

        if (largeTitles) {
            return songs.map((song, index) => `
                <div style="display:grid; grid-template-columns:${px(44)} minmax(0, 1fr); gap:${px(12)}; align-items:flex-start; padding:${px(5)} 0; ${index < songs.length - 1 ? 'border-bottom:1px solid #edf2f7;' : ''}">
                    <div style="${orderStyle}; min-width:${px(44)};">${index + 1}.</div>
                    <div style="${titleStyle}; font-size:${px(22)}; line-height:1.18;">${this.escapeHtml(song.title || 'Ohne Titel')}</div>
                </div>
            `).join('');
        }

        if (languageOnly) {
            return songs.map((song, index) => `
                <div style="display:grid; grid-template-columns:${px(34)} minmax(0, 1fr); gap:${px(12)}; align-items:flex-start; padding:${px(6)} 0; ${index < songs.length - 1 ? 'border-bottom:1px solid #edf2f7;' : ''}">
                    <div style="${orderStyle}; min-width:${px(34)};">${index + 1}.</div>
                    <div style="min-width:0;">
                        <div style="${titleStyle}; font-size:${px(17)}; line-height:1.24;">${this.escapeHtml(song.title || 'Ohne Titel')}</div>
                        ${song.language
                            ? `<div style="margin-top:${px(4)}; padding-left:${px(10)}; font-size:${px(13)}; line-height:1.4; color:#475569;">&bull; ${this.escapeHtml(song.language)}</div>`
                            : ''}
                    </div>
                </div>
            `).join('');
        }

        const headerMarkup = showColumnHeaders ? `
            <div style="display:grid; grid-template-columns:${compactSongColumns}; gap:${px(8)}; align-items:end; padding:0 0 ${px(6)}; border-bottom:1px solid #dbe3ef; margin-bottom:${px(2)};">
                ${['#', 'Titel', 'Interpret', 'BPM / Time', 'Tonart', 'Lead / Sprache', 'Tracks / CCLI', 'Infos'].map((label) => `
                    <div style="font-size:${px(9.5)}; line-height:1.3; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${this.escapeHtml(label)}
                    </div>
                `).join('')}
            </div>
        ` : '';

        const rowsMarkup = songs.map((song, index) => `
            <div style="${cardStyle}; display:grid; grid-template-columns:${compactSongColumns}; gap:${px(8)}; align-items:start; padding:${px(7)} 0; ${index < songs.length - 1 ? 'border-bottom:1px solid #edf2f7;' : ''}">
                <div style="${orderStyle}; min-width:${px(22)};">${index + 1}.</div>
                <div style="${titleStyle}; font-size:${px(13)}; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${this.escapeHtml(song.title || 'Ohne Titel')}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.artist, song.genre])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.bpm || '', song.timeSignature])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.key, song.originalKey])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.leadVocal, song.language])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([resolveTracks(song.tracks), song.ccli])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.35; color:#334155; white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:anywhere; word-break:break-word;">
                    ${joinParts([song.infoDisplay && song.infoDisplay !== '-' ? song.infoDisplay : ''], '-')}
                </div>
            </div>
        `).join('');

        return `${headerMarkup}${rowsMarkup}`;
    },

    renderRundownTimelineItems(items = [], options = {}) {
        const {
            detailed = true,
            itemStyle = '',
            chipStyle = '',
            songCardStyle = '',
            orderStyle = '',
            titleStyle = '',
            metaStyle = '',
            noteStyle = '',
            fontScale = 1
        } = options;
        const scale = this.normalizeRundownFontScale(fontScale);
        const px = (size, minimum = 0) => this.scaleRundownSize(size, scale, minimum);

        if (!Array.isArray(items) || items.length === 0) {
            return `
                <div style="${itemStyle}">
                    <div style="font-size:${px(14)}; color:#64748b;">Kein Ablauf vorhanden.</div>
                </div>
            `;
        }

        return items.map((item, index) => {
            const songList = Array.isArray(item.selectedSongs) ? item.selectedSongs : [];
            const timeLabel = item.startLabel === '—' && item.endLabel === '—'
                ? 'Zeit offen'
                : `${item.startLabel} - ${item.endLabel}`;
            const nestedSongs = detailed
                ? this.renderRundownSongCards(songList, {
                    cardStyle: songCardStyle,
                    orderStyle,
                    titleStyle: `${titleStyle}; font-size:${px(13.5)};`,
                    metaStyle,
                    noteStyle,
                    chipStyle,
                    suppressEmptyState: true,
                    fontScale: scale,
                    showColumnHeaders: true
                })
                : (songList.length > 0
                    ? `
                        <div style="margin-top:${px(10)}; display:flex; flex-direction:column; gap:${px(4)};">
                            ${songList.map((song) => `
                                <div style="font-size:${px(13)}; color:#334155; line-height:1.45;">
                                    - ${this.escapeHtml(song.title || 'Ohne Titel')}
                                </div>
                            `).join('')}
                        </div>
                    `
                    : '');

            return `
                <section style="${itemStyle}">
                    <div style="display:flex; gap:${px(16)}; align-items:flex-start; justify-content:space-between;">
                        <div style="min-width:0; flex:1;">
                            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:${px(8)}; margin-bottom:${px(8)};">
                                <span style="${chipStyle}; background:#e8f0ff; color:#274690;">${index + 1}.</span>
                                <span style="${chipStyle}">${this.escapeHtml(item.typeLabel || item.type || 'Programmpunkt')}</span>
                            </div>
                            <div style="${titleStyle}; font-size:${px(detailed ? 18 : 16.5)};">${this.escapeHtml(item.title || 'Programmpunkt')}</div>
                            ${item.notes && detailed ? `<div style="${noteStyle}; margin-top:${px(7)}; font-size:${px(12.5)};">${this.escapeHtml(item.notes)}</div>` : ''}
                        </div>
                        <div style="min-width:${px(168)}; text-align:right;">
                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:${px(8)}; flex-wrap:wrap;">
                                ${item.durationLabel ? `<span style="${chipStyle}">${this.escapeHtml(item.durationLabel)}</span>` : ''}
                                <span style="font-size:${px(14)}; font-weight:700; color:#0f172a;">${this.escapeHtml(timeLabel)}</span>
                            </div>
                        </div>
                    </div>
                    ${nestedSongs ? `<div style="margin-top:${px(10)};">${nestedSongs}</div>` : ''}
                </section>
            `;
        }).join('');
    },

    buildRundownPDFMarkup({
        title = 'Ablauf',
        subtitle = '',
        mode = 'full-details',
        eventMeta = {},
        items = [],
        songs = []
    } = {}) {
        const safeItems = Array.isArray(items) ? items : [];
        const safeSongs = Array.isArray(songs) ? songs : [];
        const modeLabel = this.getRundownModeLabel(mode);
        const generatedAt = new Date().toLocaleString('de-DE');

        const styles = {
            page: "font-family:'Inter', Arial, sans-serif; width:860px; box-sizing:border-box; margin:0 auto; padding:32px 34px 36px; background:#ffffff; color:#0f172a;",
            accent: "height:8px; border-radius:999px; background:linear-gradient(90deg, #4f7df3 0%, #22c55e 100%); margin-bottom:22px;",
            header: "display:flex; flex-direction:column; gap:12px; margin-bottom:24px;",
            title: "margin:0; font-size:32px; line-height:1.08; font-weight:800; letter-spacing:-0.03em; color:#0f172a;",
            subtitle: "margin:0; color:#475569; font-size:14px; font-weight:500;",
            chipRow: "display:flex; flex-wrap:wrap; gap:8px;",
            chip: "display:inline-flex; align-items:center; min-height:28px; padding:4px 11px; border-radius:999px; background:#f1f5f9; color:#334155; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;",
            summaryGrid: "display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; margin:24px 0 20px;",
            summaryCard: "border:1px solid #dbe3ef; border-radius:18px; background:#f8fafc; padding:14px 16px;",
            summaryLabel: "font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;",
            summaryValue: "margin-top:8px; font-size:17px; font-weight:700; color:#0f172a; line-height:1.3;",
            sectionTitle: "margin:28px 0 14px; font-size:13px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;",
            detailGrid: "display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px;",
            detailCard: "border:1px solid #dbe3ef; border-radius:18px; background:#ffffff; padding:14px 16px;",
            detailCardWide: "grid-column:1 / -1;",
            detailLabel: "font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;",
            detailValue: "margin-top:8px; font-size:15px; line-height:1.55; color:#0f172a;",
            itemCard: "border:1px solid #dbe3ef; border-radius:22px; background:#ffffff; padding:18px 20px; margin-bottom:14px;",
            nestedSongCard: "margin-top:12px; border:1px solid #e2e8f0; border-radius:18px; background:#f8fafc; padding:12px 14px;",
            orderBadge: "display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:12px; background:#e8f0ff; color:#274690; font-size:14px; font-weight:800; flex-shrink:0;",
            songTitle: "font-size:18px; line-height:1.25; font-weight:800; color:#0f172a;",
            metaText: "font-size:13px; line-height:1.5; color:#475569;",
            note: "font-size:13px; line-height:1.55; color:#334155;",
            footer: "margin-top:32px; padding-top:18px; border-top:1px solid #dbe3ef; display:flex; justify-content:space-between; gap:16px; font-size:11px; color:#64748b;"
        };

        const headerChips = [
            modeLabel,
            eventMeta.bandName || '',
            eventMeta.dateLabel || '',
            eventMeta.location || ''
        ].filter(Boolean).map((value) => `<span style="${styles.chip}">${this.escapeHtml(value)}</span>`).join('');

        const summaryCards = [
            { label: 'Ansicht', value: modeLabel },
            { label: 'Punkte', value: `${safeItems.length}` },
            { label: 'Songs', value: `${safeSongs.length}` }
        ].map((entry) => `
            <div style="${styles.summaryCard}">
                <div style="${styles.summaryLabel}">${this.escapeHtml(entry.label)}</div>
                <div style="${styles.summaryValue}">${this.escapeHtml(entry.value)}</div>
            </div>
        `).join('');

        const detailCards = [];
        const pushDetail = (label, value, wide = false) => {
            if (!value || (Array.isArray(value) && value.length === 0)) return;
            const displayValue = Array.isArray(value)
                ? value.map((entry) => `<span style="${styles.chip}; text-transform:none; letter-spacing:0; font-size:12px; font-weight:600;">${this.escapeHtml(entry)}</span>`).join('')
                : this.escapeHtml(value);
            detailCards.push(`
                <div style="${styles.detailCard}; ${wide ? styles.detailCardWide : ''}">
                    <div style="${styles.detailLabel}">${this.escapeHtml(label)}</div>
                    <div style="${styles.detailValue}; ${Array.isArray(value) ? 'display:flex; flex-wrap:wrap; gap:8px;' : ''}">${displayValue}</div>
                </div>
            `);
        };

        pushDetail('Band', eventMeta.bandName);
        pushDetail('Erstellt von', eventMeta.createdByName);
        pushDetail('Datum & Zeit', eventMeta.dateLabel);
        pushDetail('Ort', eventMeta.location);
        pushDetail('Soundcheck', eventMeta.soundcheckLocation);
        pushDetail('Besetzung', eventMeta.lineup, true);
        pushDetail('Event-Infos', eventMeta.info, true);
        pushDetail('Technik / PA', eventMeta.techInfo, true);

        let mainContent = '';

        if (mode === 'full-details') {
            mainContent = `
                ${detailCards.length > 0 ? `
                    <div style="${styles.sectionTitle}">Event Details</div>
                    <div style="${styles.detailGrid}">
                        ${detailCards.join('')}
                    </div>
                ` : ''}
                <div style="${styles.sectionTitle}">Ablauf</div>
                ${this.renderRundownTimelineItems(safeItems, {
                    detailed: true,
                    itemStyle: styles.itemCard,
                    chipStyle: styles.chip,
                    songCardStyle: styles.nestedSongCard,
                    orderStyle: styles.orderBadge,
                    titleStyle: styles.songTitle,
                    metaStyle: styles.metaText,
                    noteStyle: styles.note
                })}
            `;
        } else if (mode === 'full-compact') {
            mainContent = `
                <div style="${styles.sectionTitle}">Ablauf</div>
                ${this.renderRundownTimelineItems(safeItems, {
                    detailed: false,
                    itemStyle: styles.itemCard,
                    chipStyle: styles.chip,
                    songCardStyle: styles.nestedSongCard,
                    orderStyle: styles.orderBadge,
                    titleStyle: styles.songTitle,
                    metaStyle: styles.metaText,
                    noteStyle: styles.note
                })}
            `;
        } else if (mode === 'songs-full') {
            mainContent = `
                <div style="${styles.sectionTitle}">Songs aus dem Ablauf</div>
                ${this.renderRundownSongCards(safeSongs, {
                    cardStyle: styles.itemCard,
                    orderStyle: styles.orderBadge,
                    titleStyle: styles.songTitle,
                    metaStyle: styles.metaText,
                    noteStyle: styles.note,
                    chipStyle: styles.chip
                })}
            `;
        } else if (mode === 'songs-language') {
            mainContent = `
                <div style="${styles.sectionTitle}">Songliste mit Sprache</div>
                ${this.renderRundownSongCards(safeSongs, {
                    cardStyle: styles.itemCard,
                    orderStyle: styles.orderBadge,
                    titleStyle: styles.songTitle,
                    metaStyle: styles.metaText,
                    noteStyle: styles.note,
                    chipStyle: styles.chip,
                    languageOnly: true
                })}
            `;
        } else {
            mainContent = `
                <div style="${styles.sectionTitle}">Große Songtitel</div>
                ${this.renderRundownSongCards(safeSongs, {
                    cardStyle: styles.itemCard,
                    orderStyle: "display:inline-flex; align-items:flex-start; justify-content:flex-start; color:#2563eb; font-size:28px; font-weight:800; line-height:1;",
                    titleStyle: styles.songTitle,
                    metaStyle: styles.metaText,
                    noteStyle: styles.note,
                    chipStyle: styles.chip,
                    largeTitles: true
                })}
            `;
        }

        return `
            <div style="${styles.page}">
                <div style="${styles.accent}"></div>
                <header style="${styles.header}">
                    <h1 style="${styles.title}">${this.escapeHtml(title || 'Ablauf')}</h1>
                    ${subtitle ? `<p style="${styles.subtitle}">${this.escapeHtml(subtitle)}</p>` : ''}
                    <div style="${styles.chipRow}">
                        ${headerChips}
                    </div>
                </header>
                <div style="${styles.summaryGrid}">
                    ${summaryCards}
                </div>
                ${mainContent}
                <footer style="${styles.footer}">
                    <div>Erstellt mit <strong>Bandmate</strong></div>
                    <div>Stand: ${this.escapeHtml(generatedAt)}</div>
                </footer>
            </div>
        `;
    },

    chunkByUnits(entries = [], getUnits = () => 1, firstMaxUnits = 18, otherMaxUnits = firstMaxUnits) {
        const safeEntries = Array.isArray(entries) ? entries : [];
        if (safeEntries.length === 0) return [];

        const chunks = [];
        let currentChunk = [];
        let currentUnits = 0;
        let maxUnits = Math.max(1, Number(firstMaxUnits) || 1);

        safeEntries.forEach((entry) => {
            const nextUnits = Math.max(1, Number(getUnits(entry)) || 1);
            const normalizedUnits = Math.min(nextUnits, maxUnits);

            if (currentChunk.length > 0 && (currentUnits + normalizedUnits) > maxUnits) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentUnits = 0;
                maxUnits = Math.max(1, Number(otherMaxUnits) || 1);
            }

            currentChunk.push(entry);
            currentUnits += normalizedUnits;
        });

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    },

    estimateRundownTimelineUnits(item = {}, detailed = true, fontScale = 1) {
        const songCount = Array.isArray(item.selectedSongs) ? item.selectedSongs.length : 0;
        const scale = this.normalizeRundownFontScale(fontScale);
        let units = detailed ? 1.95 : 1.55;

        if (item.notes) {
            units += detailed ? 0.35 : 0.18;
        }

        if (detailed) {
            units += Math.min(8, songCount * 0.55);
        } else {
            units += Math.min(4.8, songCount * 0.24);
        }

        return units * (0.94 + (scale - 0.85) * 0.95);
    },

    estimateRundownSongUnits(song = {}, mode = 'songs-full', fontScale = 1) {
        const scale = this.normalizeRundownFontScale(fontScale);
        let units = 1.1;

        if (mode === 'songs-large') {
            units = 1.15;
        } else if (mode === 'songs-language') {
            units = song.language ? 1.25 : 1.05;
        } else {
            units = 1.45;
            if (song.infoDisplay && song.infoDisplay !== '-') units += 0.15;
            if (song.artist || song.genre) units += 0.08;
        }

        return units * (0.92 + (scale - 0.85) * 1.15);
    },

    buildRundownPDFPageMarkup({
        title = 'Ablauf',
        subtitle = '',
        modeLabel = '',
        pageNumber = 1,
        totalPages = 1,
        detailsHtml = '',
        bodyHtml = '',
        headerMeta = []
    } = {}) {
        const safeTitle = String(title || 'Ablauf').trim() || 'Ablauf';
        const titleText = safeTitle.toLowerCase().startsWith('ablauf')
            ? safeTitle
            : `Ablauf ${safeTitle}`;
        const logoUrl = this.getRundownBrandLogoUrl();
        const styles = {
            page: "font-family:'Inter', Arial, sans-serif; width:794px; min-height:1123px; box-sizing:border-box; margin:0 auto; padding:28px 32px 22px; background:#ffffff; color:#0f172a; display:flex; flex-direction:column;",
            top: "display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:10px;",
            titleGroup: "display:flex; flex-direction:column; gap:6px; min-width:0; flex:1;",
            title: "margin:0; font-size:24px; line-height:1.18; font-weight:800; letter-spacing:-0.02em; color:#0f172a;",
            subtitle: "margin:0; font-size:12px; line-height:1.45; color:#64748b; font-weight:500;",
            logo: "width:118px; height:auto; flex-shrink:0;",
            detailWrap: "display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px;",
            detailCard: "flex:1 1 220px; min-width:220px; background:#f8fafc; border-radius:16px; padding:12px 14px;",
            detailCardWide: "flex:1 1 100%; min-width:100%;",
            detailLabel: "font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;",
            detailValue: "margin-top:7px; font-size:13px; line-height:1.55; color:#0f172a;",
            body: "display:block; flex:1 1 auto;",
            footer: "margin-top:auto; padding-top:12px; border-top:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; gap:16px; font-size:11px; color:#64748b;"
        };

        return `
            <div style="${styles.page}">
                <div style="${styles.top}">
                    <div style="${styles.titleGroup}">
                        <h1 style="${styles.title}">${this.escapeHtml(titleText)}</h1>
                        ${subtitle ? `<p style="${styles.subtitle}">${this.escapeHtml(subtitle)}</p>` : ''}
                    </div>
                    <img src="${this.escapeHtml(logoUrl)}" alt="Bandmate" style="${styles.logo}">
                </div>
                ${detailsHtml ? `<div style="${styles.detailWrap}">${detailsHtml}</div>` : ''}
                <div style="${styles.body}">
                    ${bodyHtml}
                </div>
                <div style="${styles.footer}">
                    <div>Erstellt mit <strong>Bandmate</strong></div>
                    <div>Seite ${pageNumber} / ${totalPages}</div>
                </div>
            </div>
        `;
    },

    buildRundownPDFPages({
        title = 'Ablauf',
        subtitle = '',
        mode = 'full-details',
        eventMeta = {},
        items = [],
        songs = [],
        fontScale = 1
    } = {}) {
        const safeItems = Array.isArray(items) ? items : [];
        const safeSongs = Array.isArray(songs) ? songs : [];
        const modeLabel = this.getRundownModeLabel(mode);
        const scale = this.normalizeRundownFontScale(fontScale);
        const px = (size, minimum = 0) => this.scaleRundownSize(size, scale, minimum);

        const detailCards = [];
        const buildDetailLines = (entries = []) => entries
            .filter((entry) => entry && entry.value)
            .map((entry) => `
                <div style="display:grid; grid-template-columns:${px(88)} minmax(0, 1fr); gap:${px(8)}; align-items:start; padding:${px(2)} 0;">
                    <div style="font-size:${px(10)}; line-height:1.35; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">${this.escapeHtml(entry.label)}</div>
                    <div style="font-size:${px(12.5)}; line-height:1.5; color:#0f172a; white-space:pre-line;">${this.escapeHtml(entry.value)}</div>
                </div>
            `)
            .join('');

        const pushDetailCard = (markup = '', wide = false) => {
            if (!markup) return;
            detailCards.push(`
                <div style="flex:${wide ? '1 1 100%' : '1 1 210px'}; min-width:${wide ? '100%' : '210px'}; border:1px solid #dbe3ef; border-radius:${px(16)}; background:#ffffff; padding:${px(11)} ${px(13)};">
                    ${markup}
                </div>
            `);
        };

        const locationMetaMarkup = buildDetailLines([
            { label: 'Ort', value: eventMeta.location },
            { label: 'Soundcheck', value: eventMeta.soundcheckLocation }
        ]);
        pushDetailCard(locationMetaMarkup);

        if (Array.isArray(eventMeta.lineup) && eventMeta.lineup.length > 0) {
            pushDetailCard(`
                <div style="font-size:${px(10)}; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">Besetzung</div>
                <ul style="margin:${px(8)} 0 0; padding-left:${px(16)}; display:flex; flex-direction:column; gap:${px(4)}; color:#0f172a; font-size:${px(12.5)}; line-height:1.45;">
                    ${eventMeta.lineup.map((entry) => `<li>${this.escapeHtml(entry)}</li>`).join('')}
                </ul>
            `);
        }

        const extendedInfoBlocks = [
            eventMeta.info
                ? `
                    <div style="display:grid; grid-template-columns:${px(88)} minmax(0, 1fr); gap:${px(8)}; align-items:start;">
                        <div style="font-size:${px(10)}; line-height:1.35; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">Info</div>
                        <div style="font-size:${px(12.5)}; line-height:1.5; color:#0f172a; white-space:pre-line;">${this.escapeHtml(eventMeta.info)}</div>
                    </div>
                `
                : '',
            eventMeta.techInfo
                ? `
                    <div style="display:grid; grid-template-columns:${px(88)} minmax(0, 1fr); gap:${px(8)}; align-items:start;">
                        <div style="font-size:${px(10)}; line-height:1.35; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">Technik</div>
                        <div style="font-size:${px(12.5)}; line-height:1.5; color:#0f172a; white-space:pre-line;">${this.escapeHtml(eventMeta.techInfo)}</div>
                    </div>
                `
                : ''
        ].filter(Boolean).join(`
            <div style="height:${px(1)}; background:#eef2f7; margin:${px(8)} 0;"></div>
        `);
        pushDetailCard(extendedInfoBlocks, true);

        const buildPagesFromChunks = (chunks, renderChunk, options = {}) => {
            const safeChunks = chunks.length > 0 ? chunks : [[]];
            const totalPages = safeChunks.length;
            return safeChunks.map((chunk, index) => this.buildRundownPDFPageMarkup({
                title,
                subtitle,
                modeLabel,
                pageNumber: index + 1,
                totalPages,
                detailsHtml: index === 0 && options.includeDetails ? detailCards.join('') : '',
                bodyHtml: renderChunk(chunk, index),
                headerMeta: []
            }));
        };

        if (mode === 'full-details') {
            const firstLimit = detailCards.length > 0 ? 19.5 : 22;
            const chunks = this.chunkByUnits(
                safeItems,
                (item) => this.estimateRundownTimelineUnits(item, true, scale),
                firstLimit,
                23.5
            );

            return buildPagesFromChunks(chunks, (chunk) => this.renderRundownTimelineItems(chunk, {
                detailed: true,
                itemStyle: `border:1px solid #dbe3ef; border-radius:${px(18)}; background:#ffffff; padding:${px(14)} ${px(16)}; margin-bottom:${px(10)};`,
                chipStyle: `display:inline-flex; align-items:center; min-height:${px(22)}; padding:0 ${px(9)}; border-radius:999px; background:#f1f5f9; color:#334155; font-size:${px(10.5)}; font-weight:700; letter-spacing:0.03em;`,
                songCardStyle: 'padding:0;',
                orderStyle: `display:inline-flex; align-items:flex-start; justify-content:flex-start; color:#64748b; font-size:${px(12.5)}; font-weight:700; line-height:1.2;`,
                titleStyle: `font-size:${px(18)}; line-height:1.24; font-weight:800; color:#0f172a;`,
                metaStyle: `font-size:${px(11.5)}; line-height:1.35; color:#475569;`,
                noteStyle: `font-size:${px(12.5)}; line-height:1.5; color:#334155;`,
                fontScale: scale
            }), {
                includeDetails: true
            });
        }

        if (mode === 'full-compact') {
            const chunks = this.chunkByUnits(
                safeItems,
                (item) => this.estimateRundownTimelineUnits(item, false, scale),
                26,
                28
            );

            return buildPagesFromChunks(chunks, (chunk) => this.renderRundownTimelineItems(chunk, {
                detailed: false,
                itemStyle: `border:1px solid #dbe3ef; border-radius:${px(18)}; background:#ffffff; padding:${px(13)} ${px(15)}; margin-bottom:${px(9)};`,
                chipStyle: `display:inline-flex; align-items:center; min-height:${px(21)}; padding:0 ${px(9)}; border-radius:999px; background:#f1f5f9; color:#334155; font-size:${px(10.5)}; font-weight:700; letter-spacing:0.03em;`,
                songCardStyle: '',
                orderStyle: `display:inline-flex; align-items:flex-start; justify-content:flex-start; color:#64748b; font-size:${px(12.5)}; font-weight:700; line-height:1.2;`,
                titleStyle: `font-size:${px(16.5)}; line-height:1.22; font-weight:800; color:#0f172a;`,
                metaStyle: `font-size:${px(11.5)}; line-height:1.35; color:#475569;`,
                noteStyle: `font-size:${px(12)}; line-height:1.45; color:#334155;`,
                fontScale: scale
            }), {
                includeDetails: false
            });
        }

        const songMode = mode === 'songs-language' ? 'songs-language' : (mode === 'songs-large' ? 'songs-large' : 'songs-full');
        const songChunks = this.chunkByUnits(
            safeSongs,
            (song) => this.estimateRundownSongUnits(song, songMode, scale),
            mode === 'songs-large' ? 24 : 22,
            mode === 'songs-large' ? 26 : 24
        );

        return buildPagesFromChunks(songChunks, (chunk) => this.renderRundownSongCards(chunk, {
            cardStyle: 'padding:0;',
            orderStyle: mode === 'songs-large'
                ? `display:inline-flex; align-items:flex-start; justify-content:flex-start; color:#0f172a; font-size:${px(21)}; font-weight:800; line-height:1;`
                : `display:inline-flex; align-items:flex-start; justify-content:flex-start; color:#64748b; font-size:${px(12.5)}; font-weight:700; line-height:1.2;`,
            titleStyle: `font-size:${px(18)}; line-height:1.24; font-weight:800; color:#0f172a;`,
            metaStyle: `font-size:${px(11.5)}; line-height:1.35; color:#475569;`,
            noteStyle: `font-size:${px(12.5)}; line-height:1.45; color:#334155;`,
            chipStyle: '',
            languageOnly: mode === 'songs-language',
            largeTitles: mode === 'songs-large',
            suppressEmptyState: true,
            fontScale: scale,
            showColumnHeaders: mode === 'songs-full'
        }), {
            includeDetails: false
        });
    },

    async renderMarkupToPDF({ markup = '', pages = null, filename = 'export.pdf', previewOnly = false, orientation = 'p', canvasWidth = 860 }) {
        let currentElement = null;
        const sourcePages = Array.isArray(pages) && pages.length > 0
            ? pages
            : [markup];

        try {
            const pdf = new window.jsPDF(orientation, 'mm', 'a4');
            const pageWidth = orientation === 'l' ? 297 : 210;
            const pageHeight = orientation === 'l' ? 210 : 297;

            for (let index = 0; index < sourcePages.length; index += 1) {
                const pageMarkup = sourcePages[index];

                currentElement = document.createElement('div');
                currentElement.innerHTML = pageMarkup;
                currentElement.style.backgroundColor = '#ffffff';
                currentElement.style.padding = '0';
                currentElement.style.margin = '0';
                currentElement.style.color = '#000000';
                currentElement.style.position = 'fixed';
                currentElement.style.left = '0';
                currentElement.style.top = '0';
                currentElement.style.opacity = '0';
                currentElement.style.pointerEvents = 'none';
                currentElement.style.zIndex = '-1';
                currentElement.style.width = `${canvasWidth}px`;

                document.body.appendChild(currentElement);
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                const renderWidth = Math.max(canvasWidth, currentElement.scrollWidth || 0, currentElement.offsetWidth || 0);
                const renderHeight = Math.max(currentElement.scrollHeight || 0, currentElement.offsetHeight || 0, 1180);

                let canvas = null;
                let lastRenderError = null;
                const scales = [2, 1.5, 1];

                for (const scale of scales) {
                    try {
                        canvas = await html2canvas(currentElement, {
                            scale,
                            useCORS: true,
                            allowTaint: true,
                            backgroundColor: '#ffffff',
                            logging: false,
                            width: renderWidth,
                            height: renderHeight,
                            windowWidth: renderWidth,
                            windowHeight: renderHeight,
                            scrollX: 0,
                            scrollY: 0
                        });
                        break;
                    } catch (error) {
                        lastRenderError = error;
                    }
                }

                if (!canvas) {
                    throw lastRenderError || new Error('PDF-Seite konnte nicht gerendert werden.');
                }

                if (index > 0) {
                    pdf.addPage();
                }

                const imgData = canvas.toDataURL('image/png');
                const widthScale = pageWidth / canvas.width;
                const heightScale = pageHeight / canvas.height;
                const scaleRatio = Math.min(widthScale, heightScale);
                const imgWidth = canvas.width * scaleRatio;
                const imgHeight = canvas.height * scaleRatio;
                const xOffset = (pageWidth - imgWidth) / 2;
                pdf.addImage(imgData, 'PNG', xOffset, 0, imgWidth, imgHeight);

                if (currentElement.parentNode) {
                    currentElement.parentNode.removeChild(currentElement);
                }
                currentElement = null;
            }

            if (previewOnly) {
                const blob = pdf.output('blob');
                const blobUrl = URL.createObjectURL(blob);
                return { pdf, blobUrl, filename };
            }

            pdf.save(filename);
            return true;
        } catch (error) {
            console.error('PDFGenerator renderMarkupToPDF Error:', error);
            throw error;
        } finally {
            if (currentElement && currentElement.parentNode) {
                currentElement.parentNode.removeChild(currentElement);
            }
        }
    },

    async generateRundownPDF({
        title = 'Ablauf',
        subtitle = '',
        mode = 'full-details',
        eventMeta = {},
        items = [],
        songs = [],
        fontScale = 1,
        filename = '',
        previewOnly = false
    } = {}) {
        const resolvedFilename = this.sanitizeFilename(filename || title || 'ablauf.pdf', 'ablauf.pdf');
        const pages = this.buildRundownPDFPages({
            title,
            subtitle,
            mode,
            eventMeta,
            items,
            songs,
            fontScale
        });

        return this.renderMarkupToPDF({
            pages,
            filename: resolvedFilename,
            previewOnly,
            orientation: 'p',
            canvasWidth: 794
        });
    }
};

window.PDFGenerator = PDFGenerator;
