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
        const pages = this.buildSetlistPDFPages({
            title,
            subtitle,
            metaInfo,
            songs,
            showNotes
        });

        return this.renderMarkupToPDF({
            pages,
            filename,
            previewOnly,
            orientation: 'p',
            canvasWidth: pages[0]?.canvasWidth || 794
        });
    },

    buildSetlistPDFPages({
        title = 'Setlist',
        subtitle = '',
        metaInfo = [],
        songs = [],
        showNotes = false,
        fontScale = 1
    } = {}) {
        const safeSongs = Array.isArray(songs) ? songs.filter(Boolean) : [];
        const scale = this.normalizeRundownFontScale(fontScale);
        const px = (size, minimum = 0) => this.scaleRundownSize(size, scale, minimum);
        const safeTitle = String(title || 'Setlist').trim() || 'Setlist';
        const safeSubtitle = String(subtitle || '').trim();
        const generatedAt = new Date().toLocaleDateString('de-DE');
        const stripHtml = (value = '') => String(value || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const normalizedMetaInfo = (Array.isArray(metaInfo) ? metaInfo : [])
            .map((entry) => stripHtml(entry))
            .filter(Boolean);
        const normalizedSongs = safeSongs.map((song) => ({
            ...song,
            infoDisplay: song.infoDisplay
                || (typeof Storage !== 'undefined' && typeof Storage.getSongInfoPreview === 'function'
                    ? Storage.getSongInfoPreview(song)
                    : (song.info || '-')),
            notes: showNotes ? (song.notes || '') : ''
        }));

        const detailCards = [
            `
                <div style="flex:1 1 180px; min-width:180px; background:#f8fafc; border-radius:16px; padding:12px 14px;">
                    <div style="font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;">Ansicht</div>
                    <div style="margin-top:7px; font-size:13px; line-height:1.5; color:#0f172a;">Songliste</div>
                </div>
            `,
            `
                <div style="flex:1 1 140px; min-width:140px; background:#f8fafc; border-radius:16px; padding:12px 14px;">
                    <div style="font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;">Songs</div>
                    <div style="margin-top:7px; font-size:13px; line-height:1.5; color:#0f172a;">${this.escapeHtml(String(normalizedSongs.length))}</div>
                </div>
            `
        ];

        if (safeSubtitle) {
            detailCards.push(`
                <div style="flex:1 1 100%; min-width:100%; background:#f8fafc; border-radius:16px; padding:12px 14px;">
                    <div style="font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;">Kontext</div>
                    <div style="margin-top:7px; font-size:13px; line-height:1.55; color:#0f172a;">${this.escapeHtml(safeSubtitle)}</div>
                </div>
            `);
        } else if (normalizedMetaInfo.length > 0) {
            detailCards.push(`
                <div style="flex:1 1 100%; min-width:100%; background:#f8fafc; border-radius:16px; padding:12px 14px;">
                    <div style="font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#64748b;">Meta</div>
                    <div style="margin-top:7px; display:flex; flex-wrap:wrap; gap:8px;">
                        ${normalizedMetaInfo.map((entry) => `
                            <span style="display:inline-flex; align-items:center; min-height:22px; padding:0 9px; border-radius:999px; background:#ffffff; color:#334155; font-size:10.5px; font-weight:700; letter-spacing:0.03em;">
                                ${this.escapeHtml(entry)}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `);
        }

        const detailsMarkup = detailCards.join('');
        const songChunks = this.chunkByUnits(
            normalizedSongs,
            (song) => this.estimateRundownSongUnits(song, 'songs-full', scale),
            detailsMarkup ? 17.5 : 21.5,
            23
        );

        const safeChunks = songChunks.length > 0 ? songChunks : [[]];
        const totalPages = safeChunks.length;

        return safeChunks.map((chunk, index) => {
            const bodyHtml = `
                <div style="display:flex; flex-direction:column; gap:${px(10)};">
                    ${this.renderRundownSongCards(chunk, {
                        cardStyle: 'padding:0;',
                        orderStyle: `display:inline-flex; align-items:flex-start; justify-content:flex-start; color:#64748b; font-size:${px(12.5)}; font-weight:700; line-height:1.2;`,
                        titleStyle: `font-size:${px(18)}; line-height:1.24; font-weight:800; color:#0f172a;`,
                        metaStyle: `font-size:${px(11.5)}; line-height:1.35; color:#475569;`,
                        noteStyle: `font-size:${px(12.5)}; line-height:1.45; color:#334155;`,
                        chipStyle: '',
                        suppressEmptyState: false,
                        fontScale: scale,
                        showColumnHeaders: true
                    })}
                </div>
            `;

            return {
                markup: this.buildRundownPDFPageMarkup({
                    title: safeTitle,
                    subtitle: safeSubtitle,
                    pageNumber: index + 1,
                    totalPages,
                    eyebrowLabel: 'Setlist',
                    detailsHtml: index === 0 ? detailsMarkup : '',
                    bodyHtml,
                    footerMeta: `Stand: ${generatedAt}`
                }),
                orientation: 'p',
                canvasWidth: 794,
                previewWidth: 794,
                previewHeight: 1123
            };
        });
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

    getRiderBrandLogoUrl() {
        return this.getRundownBrandLogoUrl(); // Nutze das kompakte Icon auch für den Rider
    },

    renderRundownSongMetaChips(song = {}, chipStyle = '') {
        const entries = [
            song.artist ? `Interpret: ${song.artist}` : '',
            song.bpm ? `BPM: ${song.bpm}` : '',
            song.timeSignature ? `Time: ${song.timeSignature}` : '',
            song.key ? `Tonart: ${song.key}` : '',
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
        const compactSongColumns = `${px(22)} minmax(0, 2.05fr) minmax(0, 1.25fr) minmax(0, 0.62fr) minmax(0, 0.66fr) minmax(0, 0.72fr) minmax(0, 0.82fr) minmax(0, 0.9fr) minmax(0, 0.62fr) minmax(0, 0.92fr) minmax(0, 1.04fr)`;

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
                ${[
                    { label: '#', wrap: false },
                    { label: 'Titel', wrap: false },
                    { label: 'Interpret / Genre', wrap: true },
                    { label: 'BPM', wrap: false },
                    { label: 'Time', wrap: false },
                    { label: 'Tonart', wrap: false },
                    { label: 'Lead', wrap: false },
                    { label: 'Sprache', wrap: false },
                    { label: 'Tracks', wrap: false },
                    { label: 'CCLI-Nr.', wrap: true },
                    { label: 'Infos', wrap: false }
                ].map(({ label, wrap }) => `
                    <div style="font-size:${px(9.5)}; line-height:1.2; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; ${wrap ? 'white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:anywhere; word-break:break-word;' : 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'}">
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
                    ${joinParts([song.bpm])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.timeSignature])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.key])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.leadVocal])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.language])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([resolveTracks(song.tracks)])}
                </div>
                <div style="${metaStyle}; font-size:${px(11)}; line-height:1.3; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${joinParts([song.ccli])}
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
            const typeLabel = String(item.typeLabel || item.type || 'Programmpunkt').trim() || 'Programmpunkt';
            const itemTitle = String(item.title || '').trim();
            const normalizeLabel = (value) => String(value || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ');
            const fallbackTitle = itemTitle || typeLabel;
            const showStandaloneTitle = normalizeLabel(itemTitle) !== normalizeLabel(typeLabel);
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
                                <span style="${chipStyle}">${this.escapeHtml(typeLabel)}</span>
                            </div>
                            ${showStandaloneTitle ? `<div style="${titleStyle}; font-size:${px(detailed ? 18 : 16.5)};">${this.escapeHtml(fallbackTitle)}</div>` : ''}
                            ${item.notes && detailed ? `<div style="${noteStyle}; margin-top:${px(showStandaloneTitle ? 7 : 2)}; font-size:${px(12.5)};">${this.escapeHtml(item.notes)}</div>` : ''}
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
        headerMeta = [],
        footerMeta = '',
        eyebrowLabel = null
    } = {}) {
        const safeTitle = String(title || 'Ablauf').trim() || 'Ablauf';
        const titleText = (safeTitle.toLowerCase().includes('rider') || safeTitle.toLowerCase().startsWith('ablauf'))
            ? safeTitle
            : `Ablauf ${safeTitle}`;
        const isRiderPage = /rider/i.test(safeTitle) || /rider/i.test(String(subtitle || ''));
        const displayTitle = isRiderPage
            ? titleText
            : (titleText.replace(/^Ablauf\s*/i, '').trim() || 'Ablauf');
        const resolvedEyebrow = eyebrowLabel == null
            ? 'Ablauf'
            : String(eyebrowLabel || '').trim();
        const logoUrl = isRiderPage ? this.getRiderBrandLogoUrl() : this.getRundownBrandLogoUrl();
        const logoBoxWidth = isRiderPage ? '94px' : '92px';
        const logoBoxHeight = isRiderPage ? '42px' : '40px';
        const styles = {
            page: `font-family:'Inter', Arial, sans-serif; width:794px; min-height:1123px; box-sizing:border-box; margin:0 auto; padding:${isRiderPage ? '24px 28px 18px' : '28px 32px 22px'}; background:#ffffff; color:#0f172a; display:flex; flex-direction:column;`,
            top: `display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:start; gap:14px; margin-bottom:${isRiderPage ? '8px' : '10px'};`,
            titleGroup: `display:flex; flex-direction:column; gap:${isRiderPage ? '6px' : '4px'}; min-width:0; flex:1;`,
            eyebrow: "display:inline-flex; align-items:center; width:max-content; padding:5px 11px; border-radius:999px; background:#edf4ff; color:#2954a3; font-size:11px; line-height:1; font-weight:900; letter-spacing:0.18em; text-transform:uppercase;",
            title: `margin:0; font-size:${isRiderPage ? '22px' : '29px'}; line-height:${isRiderPage ? '1.14' : '1.04'}; font-weight:800; letter-spacing:-0.03em; color:#0f172a;`,
            subtitle: "margin:0; font-size:12px; line-height:1.45; color:#64748b; font-weight:500;",
            logoWrap: `width:${logoBoxWidth}; height:${logoBoxHeight}; display:flex; align-items:flex-start; justify-content:flex-end; overflow:hidden;`,
            logo: `display:block; width:100%; max-width:100%; max-height:${logoBoxHeight}; height:auto; object-fit:contain; object-position:right top; flex-shrink:0;`,
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
                        ${!isRiderPage && resolvedEyebrow ? `<div style="${styles.eyebrow}">${this.escapeHtml(resolvedEyebrow)}</div>` : ''}
                        <h1 style="${styles.title}">${this.escapeHtml(displayTitle)}</h1>
                        ${subtitle ? `<p style="${styles.subtitle}">${this.escapeHtml(subtitle)}</p>` : ''}
                    </div>
                    <div style="${styles.logoWrap}">
                        <img src="${this.escapeHtml(logoUrl)}" alt="Bandmate" style="${styles.logo}">
                    </div>
                </div>
                ${detailsHtml ? `<div style="${styles.detailWrap}">${detailsHtml}</div>` : ''}
                <div style="${styles.body}">
                    ${bodyHtml}
                </div>
                <div style="${styles.footer}">
                    <div>Erstellt mit <strong>Bandmate</strong></div>
                    ${footerMeta ? `<div>${this.escapeHtml(footerMeta)}</div>` : ''}
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

        const primaryDetailCards = [];
        const secondaryDetailCards = [];
        const buildDetailLines = (entries = []) => entries
            .filter((entry) => entry && entry.value)
            .map((entry) => `
                <div style="display:grid; grid-template-columns:${px(88)} minmax(0, 1fr); gap:${px(8)}; align-items:start; padding:${px(2)} 0;">
                    <div style="font-size:${px(10)}; line-height:1.35; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">${this.escapeHtml(entry.label)}</div>
                    <div style="font-size:${px(12.5)}; line-height:1.5; color:#0f172a; white-space:pre-line;">${this.escapeHtml(entry.value)}</div>
                </div>
            `)
            .join('');

        const createDetailCard = (markup = '', { wide = false, minHeight = null } = {}) => {
            if (!markup) return;
            return `
                <div style="border:1px solid #dbe3ef; border-radius:${px(16)}; background:#ffffff; padding:${px(11)} ${px(13)};${minHeight ? ` min-height:${minHeight};` : ''}${wide ? ' width:100%;' : ''}">
                    ${markup}
                </div>
            `;
        };

        const locationMetaMarkup = buildDetailLines([
            { label: 'Ort', value: eventMeta.location },
            { label: 'Soundcheck', value: eventMeta.soundcheckLocation }
        ]);
        const locationCard = createDetailCard(locationMetaMarkup, {
            minHeight: px(102)
        });
        if (locationCard) {
            primaryDetailCards.push(locationCard);
        }

        if (Array.isArray(eventMeta.lineup) && eventMeta.lineup.length > 0) {
            const lineupCard = createDetailCard(`
                <div style="font-size:${px(10)}; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">Besetzung</div>
                <ul style="margin:${px(8)} 0 0; padding-left:${px(16)}; display:flex; flex-direction:column; gap:${px(4)}; color:#0f172a; font-size:${px(12.5)}; line-height:1.45;">
                    ${eventMeta.lineup.map((entry) => `<li>${this.escapeHtml(entry)}</li>`).join('')}
                </ul>
            `, {
                minHeight: px(102)
            });
            if (lineupCard) {
                primaryDetailCards.push(lineupCard);
            }
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
        const extendedInfoCard = createDetailCard(extendedInfoBlocks, { wide: true });
        if (extendedInfoCard) {
            secondaryDetailCards.push(extendedInfoCard);
        }

        const detailsMarkup = [
            primaryDetailCards.length > 0
                ? `
                    <div style="display:grid; grid-template-columns:${primaryDetailCards.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)'}; gap:${px(10)}; align-items:stretch;">
                        ${primaryDetailCards.join('')}
                    </div>
                `
                : '',
            secondaryDetailCards.length > 0
                ? `
                    <div style="display:grid; grid-template-columns:minmax(0, 1fr); gap:${px(10)};${primaryDetailCards.length > 0 ? ` margin-top:${px(10)};` : ''}">
                        ${secondaryDetailCards.join('')}
                    </div>
                `
                : ''
        ].filter(Boolean).join('');

        const buildPagesFromChunks = (chunks, renderChunk, options = {}) => {
            const safeChunks = chunks.length > 0 ? chunks : [[]];
            const totalPages = safeChunks.length;
            return safeChunks.map((chunk, index) => this.buildRundownPDFPageMarkup({
                title,
                subtitle,
                modeLabel,
                pageNumber: index + 1,
                totalPages,
                detailsHtml: index === 0 && options.includeDetails ? detailsMarkup : '',
                bodyHtml: renderChunk(chunk, index),
                headerMeta: []
            }));
        };

        if (mode === 'full-details') {
            const firstLimit = detailsMarkup ? 19.5 : 22;
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
        const rawPages = Array.isArray(pages) && pages.length > 0 ? pages : [markup];
        const sourcePages = rawPages.map((page) => {
            if (page && typeof page === 'object' && !Array.isArray(page)) {
                return {
                    markup: page.markup || page.pageMarkup || '',
                    orientation: page.orientation === 'l' ? 'l' : 'p',
                    canvasWidth: Number(page.canvasWidth) || canvasWidth,
                    canvasHeight: Number(page.canvasHeight || page.previewHeight) || 0
                };
            }

            return {
                markup: page || '',
                orientation: orientation === 'l' ? 'l' : 'p',
                canvasWidth,
                canvasHeight: 0
            };
        });

        try {
            const firstPage = sourcePages[0] || { orientation: orientation === 'l' ? 'l' : 'p' };
            const pdf = new window.jsPDF(firstPage.orientation, 'mm', 'a4');

            for (let index = 0; index < sourcePages.length; index += 1) {
                const pageDescriptor = sourcePages[index];
                const pageMarkup = pageDescriptor.markup;
                const pageOrientation = pageDescriptor.orientation === 'l' ? 'l' : 'p';
                const resolvedCanvasWidth = Number(pageDescriptor.canvasWidth) || canvasWidth;
                const resolvedCanvasHeight = Number(pageDescriptor.canvasHeight) || (pageOrientation === 'l' ? 794 : 1123);
                const pageWidth = pageOrientation === 'l' ? 297 : 210;
                const pageHeight = pageOrientation === 'l' ? 210 : 297;

                currentElement = document.createElement('div');
                currentElement.innerHTML = pageMarkup;
                currentElement.style.backgroundColor = '#ffffff';
                currentElement.style.padding = '0';
                currentElement.style.margin = '0';
                currentElement.style.color = '#000000';
                currentElement.style.position = 'fixed';
                currentElement.style.left = '-20000px';
                currentElement.style.top = '0';
                currentElement.style.opacity = '1';
                currentElement.style.pointerEvents = 'none';
                currentElement.style.zIndex = '-1';
                currentElement.style.width = `${resolvedCanvasWidth}px`;

                document.body.appendChild(currentElement);
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                const renderWidth = Math.max(resolvedCanvasWidth, currentElement.scrollWidth || 0, currentElement.offsetWidth || 0);
                const renderHeight = Math.max(currentElement.scrollHeight || 0, currentElement.offsetHeight || 0, resolvedCanvasHeight);

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
                    pdf.addPage('a4', pageOrientation);
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
            Logger.error('PDFGenerator renderMarkupToPDF Error:', error);
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
    },

    async generateBandRiderPDF({
        bandName = 'Band',
        title = '',
        members = [],
        fontScale = 1,
        filename = '',
        previewOnly = false,
        orientation = 'p',
        showPositions = false,
        stageRows = 2
    } = {}) {
        const resolvedFilename = this.sanitizeFilename(filename || title || `Tech_Rider_${bandName}.pdf`, 'rider.pdf');

        const pages = this.buildBandRiderPDFPages({
            bandName,
            title,
            members,
            fontScale,
            orientation,
            showPositions,
            stageRows
        });

        return this.renderMarkupToPDF({
            pages,
            filename: resolvedFilename,
            previewOnly,
            orientation: pages[0]?.orientation || 'p',
            canvasWidth: pages[0]?.canvasWidth || 794
        });
    },

    buildBandRiderStagePageMarkup({ bandName, title, members = [], fontScale = 1, stageRows = 2, pageNumber = 1, totalPages = 1, generatedAt = '' }) {
        const scale = this.normalizeRundownFontScale(fontScale);
        const px = (size, minimum = 0) => this.scaleRundownSize(size, scale, minimum);
        const logoUrl = this.getRiderBrandLogoUrl();
        const logoBoxWidth = 94;
        const logoBoxHeight = 42;
        const activeMembers = members
            .map((member, index) => ({ member, index }))
            .filter(({ member }) => member && member.showOnStage)
            .sort((a, b) => {
                const rowDelta = (Number(a.member.stageRow) || 1) - (Number(b.member.stageRow) || 1);
                if (rowDelta !== 0) return rowDelta;
                const orderDelta = (Number(a.member.stageOrder) || 9999) - (Number(b.member.stageOrder) || 9999);
                if (orderDelta !== 0) return orderDelta;
                return a.index - b.index;
            })
            .map(({ member }) => ({
                ...member,
                stageRow: Math.min(Math.max(1, Number(member.stageRow) || 1), Math.max(1, Number(stageRows) || 1)),
                stageOrder: Math.max(1, Number(member.stageOrder) || 1)
            }));
        const getMemberInfoCount = (member = {}) => (
            [member.mic, member.monitor, member.extra]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .length
        );
        const getStageCardMetrics = (member = {}) => {
            const infoCount = getMemberInfoCount(member);
            const compact = infoCount === 0;
            return {
                compact,
                width: compact ? Math.max(106, 130 * scale) : Math.max(154, 194 * scale),
                height: compact ? Math.max(52, 70 * scale) : Math.max(110, 136 * scale)
            };
        };

        const rows = Array.from({ length: Math.max(1, Number(stageRows) || 1) }, (_, index) => ({
            rowNumber: index + 1,
            members: activeMembers
                .filter((member) => member.stageRow === index + 1)
                .sort((a, b) => (Number(a.stageOrder) || 9999) - (Number(b.stageOrder) || 9999))
        }));

        const maxMembersInRow = Math.max(1, ...rows.map((row) => row.members.length));
        const largestCardWidth = Math.max(1, ...activeMembers.map((member) => getStageCardMetrics(member).width), Math.max(108, 132 * scale));
        const largestCardHeight = Math.max(1, ...activeMembers.map((member) => getStageCardMetrics(member).height), Math.max(54, 72 * scale));
        const rawStageWidth = Math.max(820, (maxMembersInRow * largestCardWidth) + (Math.max(0, maxMembersInRow - 1) * 38) + 140);
        const rawStageHeight = Math.max(430, (rows.length * largestCardHeight) + (Math.max(0, rows.length - 1) * 54) + 130);
        const maxStageWidth = 1040;
        const maxStageHeight = 610;
        const stageScale = Math.min(maxStageWidth / rawStageWidth, maxStageHeight / rawStageHeight, 1);
        const stageWidth = rawStageWidth * stageScale;
        const stageHeight = rawStageHeight * stageScale;
        const maxPerformerWidth = largestCardWidth * stageScale;
        const maxPerformerHeight = largestCardHeight * stageScale;
        const stageTopPadding = 32 * stageScale;
        const stageBottomPadding = 72 * stageScale;
        const stageSidePadding = 38 * stageScale;
        const availableRowSpace = Math.max(maxPerformerHeight, stageHeight - stageTopPadding - stageBottomPadding);
        const rowSpacing = rows.length > 1 ? (availableRowSpace - maxPerformerHeight) / (rows.length - 1) : 0;
        const pageTitle = String(title || '').trim() || `Technical Rider ${bandName}`;

        const renderStageDetail = (label, value) => {
            const trimmedValue = String(value || '').trim();
            if (!trimmedValue) return '';

            return `
                <div style="margin-top:${px(6)}; display:flex; flex-direction:column; gap:${px(4)}; text-align:left;">
                    <div style="font-size:${px(10)}; line-height:1; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.02em;">${this.escapeHtml(label)}</div>
                    <div style="padding-left:${px(2)}; font-size:${px(11)}; line-height:1.25; color:#334155; white-space:pre-line;">${this.escapeHtml(trimmedValue)}</div>
                </div>
            `;
        };

        const performerMarkup = rows.map((row) => {
            const visualRowIndex = rows.length - row.rowNumber;
            const rowTop = stageTopPadding + visualRowIndex * rowSpacing;
            const rowMembers = row.members;
            if (rowMembers.length === 0) {
                return `
                    <div style="position:absolute; left:50%; top:${rowTop + maxPerformerHeight / 2 - px(8)}px; transform:translateX(-50%); font-size:${px(11)}; color:#94a3b8; font-weight:600;">
                        Reihe ${row.rowNumber} frei
                    </div>
                `;
            }

            const rowUsableWidth = Math.max(maxPerformerWidth, stageWidth - (stageSidePadding * 2));
            const slotWidth = rowMembers.length > 0 ? rowUsableWidth / rowMembers.length : rowUsableWidth;

            return rowMembers.map((member, memberIndex) => {
                const metrics = getStageCardMetrics(member);
                const performerWidth = metrics.width * stageScale;
                const performerHeight = metrics.height * stageScale;
                const left = rowMembers.length > 1
                    ? stageSidePadding + (memberIndex * slotWidth) + ((slotWidth - performerWidth) / 2)
                    : (stageWidth - performerWidth) / 2;
                const top = rowTop + (maxPerformerHeight - performerHeight);
                const memberDetails = [
                    renderStageDetail('Eingänge', member.mic),
                    renderStageDetail('Monitoring', member.monitor),
                    renderStageDetail('Zusatzinfos', member.extra)
                ].filter(Boolean).join('');

                return `
                    <div style="
                        position:absolute;
                        left:${left}px;
                        top:${top}px;
                        width:${performerWidth}px;
                        min-height:${performerHeight}px;
                        padding:${metrics.compact ? `${px(7)} ${px(9)}` : `${px(8)} ${px(10)}`};
                        border-radius:${px(14)};
                        border:1px solid #d7dee7;
                        background:#ffffff;
                        color:#0f172a;
                        display:flex;
                        flex-direction:column;
                        justify-content:flex-start;
                        align-items:center;
                        text-align:center;
                        box-shadow:0 ${px(6)} ${px(18)} rgba(15,23,42,0.08);
                    ">
                        <div style="font-size:${metrics.compact ? px(9.5) : px(10.4)}; line-height:1.06; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.04em;">
                            ${this.escapeHtml(member.instrument || 'Position')}
                        </div>
                        <div style="margin-top:${metrics.compact ? px(2) : px(3)}; font-size:${metrics.compact ? px(12.5) : px(13.5)}; line-height:1.1; font-weight:700; color:#0f172a;">
                            ${this.escapeHtml(member.name || 'Mitglied')}
                        </div>
                        ${memberDetails ? `
                            <div style="margin-top:${px(4)}; width:100%; border-top:1px solid #e2e8f0; padding-top:${px(5)}; text-align:left;">
                                ${memberDetails}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }).join('');

        return `
            <div style="font-family:'Inter', Arial, sans-serif; width:1123px; min-height:794px; box-sizing:border-box; margin:0 auto; padding:18px 24px 16px; background:#ffffff; color:#0f172a; display:flex; flex-direction:column;">
                <div style="display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:flex-start; gap:${px(14)}; margin-bottom:${px(10)};">
                    <div style="min-width:0; flex:1;">
                        <h1 style="margin:0; font-size:${px(24)}; line-height:1.08; font-weight:800; letter-spacing:-0.02em; color:#0f172a;">${this.escapeHtml(pageTitle)}</h1>
                        <div style="margin-top:${px(4)}; font-size:${px(12)}; line-height:1.4; color:#64748b;">${this.escapeHtml(bandName)}</div>
                        <div style="margin-top:${px(8)}; font-size:${px(12)}; line-height:1.45; color:#475569; max-width:${px(720)};">
                            Bühnenplan von oben. Reihe 1 steht vorne an der Bühnenkante zur FOH-Seite, höhere Reihen stehen weiter hinten.
                        </div>
                    </div>
                    <div style="width:${logoBoxWidth}px; height:${logoBoxHeight}px; display:flex; align-items:flex-start; justify-content:flex-end; overflow:hidden; flex-shrink:0;">
                        <img src="${this.escapeHtml(logoUrl)}" alt="Bandmate" style="display:block; width:100%; max-width:100%; max-height:${logoBoxHeight}px; height:auto; object-fit:contain; object-position:right top;">
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; align-items:center; gap:${px(14)}; padding-top:${px(2)}; flex:1;">
                    <div style="
                        position:relative;
                        width:${stageWidth}px;
                        height:${stageHeight}px;
                        border-radius:${px(26)};
                        border:2px solid #0f172a;
                        background:linear-gradient(180deg, #f7f7f8 0%, #eceef1 100%);
                        box-shadow:inset 0 ${px(16)} ${px(30)} rgba(148,163,184,0.16);
                    ">
                        <div style="position:absolute; left:50%; bottom:${px(16)}; transform:translateX(-50%); font-size:${px(12)}; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:#475569;">
                            Bühne
                        </div>
                        ${performerMarkup}
                    </div>

                    <div style="display:flex; flex-direction:column; align-items:center; gap:${px(8)};">
                        <div style="width:${Math.max(140, 180 * stageScale)}px; height:${px(2)}; background:#cbd5e1;"></div>
                        <div style="
                            min-width:${Math.max(120, 160 * stageScale)}px;
                            padding:${px(12)} ${px(14)};
                            border-radius:${px(16)};
                            border:1px solid #cbd5e1;
                            background:#ffffff;
                            text-align:center;
                            box-shadow:0 ${px(8)} ${px(20)} rgba(15,23,42,0.08);
                        ">
                            <div style="font-size:${px(11)}; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#475569;">FOH</div>
                            <div style="margin-top:${px(4)}; font-size:${px(12)}; line-height:1.35; color:#0f172a;">Mischerplatz</div>
                        </div>
                    </div>
                </div>

                <div style="margin-top:${px(10)}; padding-top:${px(8)}; border-top:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; gap:${px(12)}; font-size:${px(11)}; color:#64748b;">
                    <div>Erstellt mit <strong>Bandmate</strong></div>
                    ${generatedAt ? `<div>Stand: ${this.escapeHtml(generatedAt)}</div>` : ''}
                    <div>Seite ${pageNumber} / ${totalPages}</div>
                </div>
            </div>
        `;
    },

    buildBandRiderPDFPages({
        bandName,
        title = '',
        members = [],
        fontScale = 1,
        orientation = 'p',
        showPositions = false,
        stageRows = 2
    } = {}) {
        const safeMembers = Array.isArray(members) ? members.filter(Boolean) : [];
        const resolvedOrientation = orientation === 'l' ? 'l' : 'p';
        const canvasWidth = resolvedOrientation === 'l' ? 1123 : 794;
        const previewHeight = resolvedOrientation === 'l' ? 794 : 1123;
        const generatedAt = new Date().toLocaleDateString('de-DE');
        const scale = this.normalizeRundownFontScale(fontScale);
        const px = (size, minimum = 0) => this.scaleRundownSize(size, scale, minimum);
        const pageTitle = String(title || '').trim() || `Technical Rider ${bandName}`;

        const renderRiderMemberDetail = (label, value) => {
            const trimmedValue = String(value || '').trim();
            if (!trimmedValue) return '';

            return `
                <div style="display:flex; flex-direction:column; gap:${px(5)}; padding:${px(10)} ${px(12)}; border-radius:${px(12)}; border:1px solid #e2e8f0; background:#f8fafc;">
                    <div style="font-size:${px(9.5)}; font-weight:900; text-transform:uppercase; letter-spacing:0.08em; color:#0f172a;">${this.escapeHtml(label)}</div>
                    <div style="font-size:${px(11.5)}; color:#334155; line-height:1.5; white-space:pre-line;">${this.escapeHtml(trimmedValue)}</div>
                </div>
            `;
        };

        const sortedMembers = [...safeMembers].sort((a, b) => {
            const rowA = Number(a.stageRow) || 1;
            const rowB = Number(b.stageRow) || 1;
            if (rowA !== rowB) return rowB - rowA; // Höhere Reihe (hinten) zuerst
            const orderA = Number(a.stageOrder) || 999;
            const orderB = Number(b.stageOrder) || 999;
            return orderA - orderB; // Links nach rechts innerhalb der Reihe
        });

        const estimateRiderMemberUnits = (member) => {
            const infoCount = [member?.mic, member?.monitor, member?.extra]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .length;
            const baseUnits = resolvedOrientation === 'l' ? 0.95 : 1.1;
            return baseUnits + (infoCount * 0.38);
        };

        const riderRows = sortedMembers.map(m => [m]); // Einspaltig: Jedes Mitglied ist eine eigene Reihe

        const renderRiderMember = (member) => {
            const technicalBlocks = [
                renderRiderMemberDetail('XLR / Audio-Eingänge', member.mic),
                renderRiderMemberDetail('Monitoring', member.monitor),
                renderRiderMemberDetail('Zusatz-Infos', member.extra)
            ].filter(Boolean).join('');

            const stageBadge = member.showOnStage
                ? `
                    <div style="padding:${px(5)} ${px(9)}; border-radius:${px(999)}; background:#eff6ff; color:#1d4ed8; font-size:${px(10)}; font-weight:800; letter-spacing:0.05em; text-transform:uppercase;">
                        Reihe ${Math.max(1, Number(member.stageRow) || 1)}
                    </div>
                `
                : '';

            return `
            <div style="border:1px solid #dbe3ef; border-radius:${px(15)}; background:#ffffff; padding:${px(11)} ${px(14)}; margin-bottom:${px(8)}; page-break-inside:avoid; width:100%; box-sizing:border-box;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:${px(10)}; margin-bottom:${px(10)}; border-bottom:1px solid #f1f5f9; padding-bottom:${px(8)};">
                    <div style="display:flex; align-items:center; gap:${px(12)}; min-width:0;">
                    <div style="width:${px(36)}; height:${px(36)}; border-radius:50%; background:#6366f1; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${px(14)};">
                        ${this.escapeHtml((member.name || '?').charAt(0).toUpperCase())}
                    </div>
                    <div style="min-width:0; flex:1;">
                        <div style="font-size:${px(15)}; font-weight:800; color:#0f172a; line-height:1.2;">${this.escapeHtml(member.name || 'Mitglied')}</div>
                        <div style="font-size:${px(11)}; font-weight:700; color:#6366f1; text-transform:uppercase; letter-spacing:0.06em;">${this.escapeHtml(member.instrument || 'Instrument')}</div>
                    </div>
                    </div>
                    ${stageBadge}
                </div>
                ${technicalBlocks ? `
                    <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:${px(10)};">
                        ${technicalBlocks}
                    </div>
                ` : ''}
            </div>
        `;
        };

        const rowChunks = this.chunkByUnits(
            riderRows,
            (row) => estimateRiderMemberUnits(row[0]),
            resolvedOrientation === 'l' ? 5.8 : 19.5, // Viel mehr Platz bei einspaltig im Portrait
            resolvedOrientation === 'l' ? 6.1 : 20.5
        );

        const totalPages = rowChunks.length + (showPositions ? 1 : 0);
        const pages = rowChunks.map((chunk, index) => ({
            markup: this.buildRundownPDFPageMarkup({
                title: pageTitle,
                subtitle: bandName,
                modeLabel: 'Technik',
                pageNumber: index + 1,
                totalPages,
                detailsHtml: '',
                bodyHtml: chunk.length
                    ? `
                        <div style="display:flex; flex-direction:column; gap:${px(10)}; align-items:stretch; width:100%;">
                            ${chunk.flat().map((member) => renderRiderMember(member)).join('')}
                        </div>
                    `
                    : '<div style="text-align:center; padding:50px; color:#64748b;">Keine Mitgliederdaten vorhanden.</div>',
                headerMeta: [],
                footerMeta: `Stand: ${generatedAt}`
            }).replace(
                'width:794px; min-height:1123px;',
                resolvedOrientation === 'l'
                    ? 'width:1123px; min-height:794px;'
                    : 'width:794px; min-height:1123px;'
            ),
            orientation: resolvedOrientation,
            canvasWidth,
            previewWidth: canvasWidth,
            previewHeight
        }));

        if (showPositions) {
            pages.push({
                markup: this.buildBandRiderStagePageMarkup({
                    bandName,
                    title: `${pageTitle} · Bühne`,
                    members: safeMembers,
                    fontScale,
                    stageRows,
                    pageNumber: totalPages,
                    totalPages,
                    generatedAt
                }),
                orientation: 'l',
                canvasWidth: 1123,
                previewWidth: 1123,
                previewHeight: 794
            });
        }

        return pages;
    }
};

window.PDFGenerator = PDFGenerator;
