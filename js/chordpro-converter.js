const ChordProConverter = {
    selectedFile: null,
    extractedText: '',
    convertedChordPro: '',
    hasConverted: false,
    bandsLoadedForUserId: null,
    songLoadRequestId: 0,
    LOADING_TIMEOUT_MS: 90000,
    loadingTimeoutHandle: null,

    init() {
        console.log('💎 [ChordProConverter] Initializing converter engine...');
        this.setupEventListeners();
        this.setupResizeHandle();
        this.loadBands();
        this.reset();
    },

    scrollToEditor() {
        const editor = document.getElementById('chordproResultArea');
        if (editor) {
            editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Keep caret at the top and prevent auto-scroll to the end
            if (typeof editor.setSelectionRange === 'function') {
                editor.setSelectionRange(0, 0);
            } else {
                editor.selectionStart = 0;
                editor.selectionEnd = 0;
            }
            editor.scrollTop = 0;
            editor.scrollLeft = 0;
            try {
                editor.focus({ preventScroll: true });
            } catch (err) {
                editor.focus();
            }
            requestAnimationFrame(() => {
                editor.scrollTop = 0;
                editor.scrollLeft = 0;
            });
        }
    },

    setupEventListeners() {
        const dropzone = document.getElementById('converterDropzone');
        const fileInput = document.getElementById('converterFileInput');
        const startBtn = document.getElementById('startConversionAreaBtn');
        const resetBtn = document.getElementById('converterResetBtn');
        const downloadBtn = document.getElementById('converterDownloadBtn');
        const bandSelect = document.getElementById('converterBandSelect');
        const songSelect = document.getElementById('converterSongSelect');
        const saveToSongBtn = document.getElementById('converterSaveToSongBtn');
        const editor = document.getElementById('chordproResultArea');

        if (dropzone) {
            dropzone.onclick = () => fileInput.click();
            dropzone.ondragover = (e) => {
                e.preventDefault();
                dropzone.classList.add('drag-over');
            };
            dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
            dropzone.ondrop = (e) => {
                e.preventDefault();
                dropzone.classList.remove('drag-over');
                if (e.dataTransfer.files.length) {
                    console.log('📥 [ChordProConverter] File dropped');
                    this.handleFileSelected(e.dataTransfer.files[0]);
                }
            };
        }

        if (fileInput) {
            fileInput.onchange = (e) => {
                if (e.target.files.length) {
                    console.log('📥 [ChordProConverter] File selected via input');
                    this.handleFileSelected(e.target.files[0]);
                }
            };
        }

        if (startBtn) {
            startBtn.onclick = () => {
                console.log('🚀 [ChordProConverter] Start button clicked');
                this.startConversion();
            };
        }

        if (resetBtn) {
            resetBtn.onclick = () => {
                console.log('🔄 [ChordProConverter] Reset requested');
                this.reset();
            };
        }

        if (downloadBtn) {
            downloadBtn.onclick = () => {
                console.log('📥 [ChordProConverter] Download requested');
                this.downloadResult();
            };
        }

        if (bandSelect) {
            bandSelect.onchange = (e) => {
                console.log('🎸 [ChordProConverter] Band selected:', e.target.value);
                this.handleBandSelected(e.target.value);
            };
        }

        if (saveToSongBtn) {
            saveToSongBtn.onclick = () => {
                console.log('💾 [ChordProConverter] Save to song requested');
                this.saveToSong();
            };
        }

        if (songSelect) {
            songSelect.onchange = () => this.syncActionState();
        }

        if (editor) {
            editor.addEventListener('input', () => {
                this.renderPreview(editor.value);
                this.syncActionState();
            });
        }

        const newFileBtn = document.getElementById('createNewChordProBtn');
        if (newFileBtn) {
            newFileBtn.onclick = () => {
                console.log('📝 [ChordProConverter] Creating new ChordPro file (manual)');
                this.reset();
                this.scrollToEditor();
            };
        }
    },

    handleFileSelected(file) {
        console.log('� [ChordProConverter] Selected file info:', {
            name: file.name,
            size: `${(file.size / 1024).toFixed(2)} KB`,
            type: file.type
        });

        if (file.type !== 'application/pdf') {
            console.error('❌ [ChordProConverter] Invalid file type:', file.type);
            alert('Bitte wähle eine PDF-Datei aus.');
            return;
        }

        this.selectedFile = file;
        this.hasConverted = false;
        this.updateFileStatus('selected');
        this.updateDisclaimer('ready');
        this.syncActionState();
        console.log('✅ [ChordProConverter] Start button enabled');
    },

    async startConversion() {
        if (!this.selectedFile) {
            console.warn('⚠️ [ChordProConverter] Attempted conversion without file');
            return;
        }

        const startTime = performance.now();
        console.log('🏗️ [ChordProConverter] Beginning conversion pipeline...');
        this.showLoading(true, 'PDF wird analysiert...');

        try {
            if (!window.pdfjsLib) {
                console.error('❌ [ChordProConverter] pdfjsLib missing on window object');
                throw new Error('PDF-Bibliothek noch nicht geladen. Bitte Seite neu laden.');
            }

            console.log('🔍 [ChordProConverter] Step 1: Attempting direct text extraction...');
            let text = await this.extractTextFromPdf(this.selectedFile);

            // If empty text after all extraction plans, trigger OCR fallback
            if (text.trim().length < 10) {
                console.warn('⚠️ [ChordProConverter] Extraction returned minimal text. Triggering OCR engine...');
                this.showLoading(true, 'OCR Texterkennung läuft...', 0);
                text = await this.performOcrOnPdf(this.selectedFile);
            }

            this.extractedText = text;
            const extractionTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ [ChordProConverter] Extraction complete in ${extractionTime}s. Text length: ${text.length}`);

            if (text.trim().length < 5) {
                console.error('❌ [ChordProConverter] No readable text found after all attempts');
                throw new Error('Es konnte kein Text extrahiert werden. Möglicherweise ist die Datei geschützt oder unleserlich.');
            }

            console.log('🎼 [ChordProConverter] Step 2: Applying ChordPro heuristics...');
            this.convertedChordPro = this.convertToChordPro(text);

            const resultArea = document.getElementById('chordproResultArea');
            if (resultArea) {
                resultArea.value = this.convertedChordPro;
                this.renderPreview(this.convertedChordPro);
            }

            this.hasConverted = true;
            this.updateFileStatus('converted');
            this.updateDisclaimer('converted');
            this.syncActionState();
            this.scrollToEditor();

            console.log('✨ [ChordProConverter] Pipeline finished successfully');
        } catch (err) {
            console.error('💥 [ChordProConverter] Critical error during conversion:', err);
            this.updateDisclaimer('error', err.message);
            alert('Fehler bei der Konvertierung: ' + err.message);
        } finally {
            this.showLoading(false);
        }
    },

    async extractTextFromPdf(file) {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true
        });

        const pdf = await loadingTask.promise;
        console.log(`📑 [ChordProConverter] PDF loaded: ${pdf.numPages} total pages`);

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const pageStartTime = performance.now();
            const page = await pdf.getPage(i);

            // Standard extraction with multiple Fallbacks
            let textContent;
            const extractPlans = [
                { name: 'Standard', params: {} },
                { name: 'Marked Content', params: { includeMarkedContent: true } },
                { name: 'Uncombined', params: { disableCombineTextItems: true } },
                { name: 'Deep Extraction', params: { includeMarkedContent: true, disableCombineTextItems: true } }
            ];

            for (const plan of extractPlans) {
                textContent = await page.getTextContent(plan.params);
                if (textContent.items.length > 0) {
                    console.log(`  📄 Page ${i}: Extracted using [${plan.name}] plan (${textContent.items.length} items)`);
                    break;
                }
            }

            if (!textContent || textContent.items.length === 0) {
                console.warn(`  ⚠️ Page ${i}: No text items found in any extraction plan`);
                continue;
            }

            // Spatial sorting for better sentence reconstruction
            const items = textContent.items.sort((a, b) => {
                const yDiff = a.transform[5] - b.transform[5];
                if (Math.abs(yDiff) < 5) return a.transform[4] - b.transform[4];
                return -yDiff;
            });

            let lastY = -1;
            let pageText = '';
            for (const item of items) {
                if (lastY !== -1) {
                    const yDiff = Math.abs(item.transform[5] - lastY);
                    if (yDiff > 5) {
                        // Calculate number of line breaks based on vertical distance
                        // Average line height ~12 units, so yDiff/12 = number of lines
                        // Cap at 3 to prevent excessive spacing
                        const lineBreaks = Math.min(Math.floor(yDiff / 12), 3);
                        pageText += '\n'.repeat(lineBreaks);
                    }
                }
                if (item.str !== undefined) pageText += item.str;
                lastY = item.transform[5];
            }
            fullText += pageText + '\n\n';

            const pageTime = (performance.now() - pageStartTime).toFixed(0);
            console.log(`  ✅ Page ${i} processed in ${pageTime}ms`);
        }
        return fullText;
    },

    async performOcrOnPdf(file) {
        if (!window.Tesseract) {
            console.error('❌ [ChordProConverter] Tesseract.js not found in global scope');
            throw new Error('OCR-Bibliothek nicht geladen.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let ocrText = '';

        console.log(`📷 [ChordProConverter] Initializing Tesseract for ${pdf.numPages} pages...`);

        for (let i = 1; i <= pdf.numPages; i++) {
            console.log(`  📸 OCR Rendering Page ${i}...`);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            console.log(`  🤖 Tesseract identifying Page ${i}...`);
            const { data: { text } } = await Tesseract.recognize(
                canvas,
                'deu+eng',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            // Calculate total progress across all pages
                            const baseProgress = ((i - 1) / pdf.numPages) * 100;
                            const pageProgress = (m.progress / pdf.numPages) * 100;
                            const totalProgress = Math.round(baseProgress + pageProgress);

                            this.showLoading(true, `OCR wird ausgeführt (Seite ${i}/${pdf.numPages})...`, totalProgress);
                        }
                    }
                }
            );
            ocrText += text + '\n\n';
            console.log(`  ✅ Page ${i} OCR complete.`);
        }
        return ocrText;
    },

    convertToChordPro(text) {
        if (!text) return '';
        const lines = text.split('\n');

        // Pre-scan for metadata
        let extractedKey = '';
        let extractedTempo = '';
        let extractedTime = '';

        lines.forEach(line => {
            const trimmed = line.trim();
            const lower = trimmed.toLowerCase();

            // Extract Key/Tonart (support both ":" and "-")
            if ((lower.includes('key') || lower.includes('tonart')) && !extractedKey) {
                // Match "Key: E" or "Key - E" or "Tonart - [B]"
                const match = trimmed.match(/(?:key|tonart)\s*[:\-]\s*(\[?[A-H][#b♯♭]?m?\]?)/i);
                if (match) {
                    extractedKey = match[1].replace(/[\[\]]/g, '').trim();
                }
            }

            // Extract Tempo/BPM (support both ":" and "-")
            if ((lower.includes('tempo') || lower.includes('bpm')) && !extractedTempo) {
                // Match "Tempo: 80" or "Tempo - 90"
                const match = trimmed.match(/(?:tempo|bpm)\s*[:\-]\s*(\d+)/i);
                if (match) extractedTempo = match[1];
            }

            // Extract Time/Taktart (support both ":" and "-")
            if ((lower.includes('time') || lower.includes('taktart')) && !extractedTime) {
                // Match "Time: 4/4" or "Taktart - 4/4"
                const match = trimmed.match(/(?:time|taktart)\s*[:\-]\s*(\d+\/\d+)/i);
                if (match) {
                    extractedTime = match[1];
                }
            }
        });

        // Build metadata header
        let result = '';
        if (this.selectedFile) {
            const cleanTitle = this.selectedFile.name.replace('.pdf', '').replace(/\s+\d+$/, '').trim();
            result += `{title: ${cleanTitle}}\n`;
            result += `{artist: }\n`;
            result += `{key: ${extractedKey}}\n`;
            result += `{time: ${extractedTime}}\n`;
            if (extractedTempo) {
                result += `{tempo: ${extractedTempo}}\n`;
            }
            result += `{copyright: }\n`;
        }

        const chordPattern = /^[A-H]([#b♯♭])?((maj|min|m|dim|aug|sus)(\d+)?|add\d+|\d+)*(\/[A-H]([#b♯♭])?)?$/;

        const isChord = (word) => {
            const cleanWord = word.replace(/[\|\-\(\)\[\]\s]/g, '');
            if (!cleanWord) return false;

            // Single letter: must be uppercase A-H
            if (cleanWord.length === 1) {
                return /^[A-H]$/.test(cleanWord);
            }

            // Two-letter chords: e.g., "Dm", "F#", "Bb"
            if (cleanWord.length === 2) {
                return /^[A-H]([#b♯♭m])$/.test(cleanWord);
            }

            // Longer chords: use comprehensive pattern
            return chordPattern.test(cleanWord);
        };

        const isChordLine = (line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            const words = trimmed.split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) return false;

            const potentialChords = words.filter(w => isChord(w)).length;
            return potentialChords > 0 && (potentialChords / words.length) > 0.4;
        };

        const isSectionHeader = (line) => {
            const trimmed = line.trim();
            return /^(Verse|Vers|VERS|Chorus|Bridge|Intro|Outro|Refrain|Pre-Chorus|Instr|Solo|Strophe|Zwischenspiel|Ablauf|Einstieg|Interlude)\s*[:\-\d]*.*$/i.test(trimmed);
        };

        console.log(`  🔧 [Heuristics] Processing ${lines.length} lines...`);

        for (let i = 0; i < lines.length; i++) {
            let currentLine = lines[i];
            const trimmed = currentLine.trim();
            if (!trimmed) {
                result += '\n'; continue;
            }

            if (isSectionHeader(currentLine)) {
                result += `\n{c: ${trimmed}}\n`;
                continue;
            }

            // Skip metadata lines (already extracted to header)
            const lower = trimmed.toLowerCase();
            // Check if line contains metadata patterns that were extracted
            if (/(?:key|tonart)\s*[:\-]\s*[A-H]/i.test(trimmed) ||
                /(?:tempo|bpm)\s*[:\-]\s*\d+/i.test(trimmed) ||
                /(?:time|taktart)\s*[:\-]\s*\d+\/\d+/i.test(trimmed)) {
                continue; // Skip this line, already in header
            }

            const nextLine = lines[i + 1] || '';
            if (isChordLine(currentLine) && !isChordLine(nextLine) && nextLine.trim() && !isSectionHeader(nextLine)) {
                let mergedLine = '';
                let lastLyrixIndex = 0;

                const wordsWithPos = [];
                const wordRegex = /\S+/g;
                let match;
                while ((match = wordRegex.exec(currentLine)) !== null) {
                    wordsWithPos.push({ word: match[0], pos: match.index });
                }

                for (const item of wordsWithPos) {
                    const word = item.word;
                    const pos = item.pos;

                    if (pos > lastLyrixIndex) {
                        mergedLine += nextLine.substring(lastLyrixIndex, pos);
                    }

                    if (isChord(word)) {
                        mergedLine += `[${word}]`;
                    } else {
                        mergedLine += word;
                    }
                    lastLyrixIndex = pos;
                }
                mergedLine += nextLine.substring(lastLyrixIndex);
                result += mergedLine + '\n';
                i++;
            } else {
                const words = currentLine.split(/(\s+|[\|\/\-\(\)])/);
                let processedLine = '';
                for (let word of words) {
                    if (isChord(word.trim())) {
                        processedLine += `[${word.trim()}]`;
                    } else {
                        processedLine += word;
                    }
                }
                result += processedLine + '\n';
            }
        }
        return result.trim();
    },

    loadBands: async function () {
        console.log('🎸 [ChordProConverter] Loading bands for selection...');
        const bandSelect = document.getElementById('converterBandSelect');
        if (!bandSelect) return;

        const user = Auth.getCurrentUser();
        if (!user) {
            bandSelect.innerHTML = '<option value="">Band wählen...</option>';
            this.bandsLoadedForUserId = null;
            console.warn('⚠️ [ChordProConverter] No active user session yet, bands not loaded');
            return;
        }

        if (this.bandsLoadedForUserId === user.id && bandSelect.options.length > 1) {
            return;
        }

        try {
            const bands = await Storage.getUserBands(user.id);
            bandSelect.innerHTML = '<option value="">Band wählen...</option>' +
                bands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
            this.bandsLoadedForUserId = user.id;
            console.log(`  ✅ Loaded ${bands.length} bands`);
        } catch (err) {
            this.bandsLoadedForUserId = null;
            console.error('❌ [ChordProConverter] Error loading bands:', err);
        }
    },

    handleBandSelected: async function (bandId) {
        const songSelect = document.getElementById('converterSongSelect');
        if (!bandId) {
            songSelect.disabled = true;
            songSelect.value = '';
            songSelect.innerHTML = '<option value="">Song wählen...</option>';
            this.syncActionState();
            return;
        }
        const requestId = ++this.songLoadRequestId;
        songSelect.disabled = true;
        songSelect.innerHTML = '<option value="">Lade Songs...</option>';
        try {
            const songs = await Storage.getBandSongChoices(bandId);
            if (requestId !== this.songLoadRequestId) return;

            songSelect.disabled = false;
            songSelect.innerHTML = songs.length > 0
                ? '<option value="">Song wählen...</option>' + songs.map(s => `<option value="${s.id}">${s.title}</option>`).join('')
                : '<option value="">Keine Songs in dieser Band</option>';
            songSelect.value = '';
            this.syncActionState();
            console.log(`  ✅ Loaded ${songs.length} songs for band ${bandId}`);
        } catch (err) {
            if (requestId !== this.songLoadRequestId) return;
            songSelect.disabled = true;
            songSelect.value = '';
            songSelect.innerHTML = '<option value="">Songs konnten nicht geladen werden</option>';
            this.syncActionState();
            console.error('❌ [ChordProConverter] Error loading songs:', err);
            UI.showToast('Songs konnten nicht geladen werden. Bitte versuche es später erneut.', 'error');
        }
    },

    saveToSong: async function () {
        const songId = document.getElementById('converterSongSelect').value;
        const chordpro = document.getElementById('chordproResultArea').value;
        if (!songId) {
            console.warn('⚠️ [ChordProConverter] Save attempted without song selected');
            UI.showToast('Bitte wähle einen Song aus.', 'warning');
            return;
        }
        if (!chordpro.trim()) {
            UI.showToast('Es ist noch kein ChordPro-Inhalt vorhanden.', 'warning');
            return;
        }

        console.log(`💾 [ChordProConverter] Saving content to song ${songId}...`);
        this.showLoading(true, 'In Datenbank speichern...');
        try {
            const result = await Storage.saveChordProToSong(songId, chordpro);
            console.log('✅ [ChordProConverter] Database update successful via field:', result.field);

            if (result.usedInfoFallback) {
                UI.showToast('ChordPro im Song gespeichert. Aktuell wird dafür das Song-Infofeld genutzt.', 'success');
            } else {
                UI.showToast('ChordPro erfolgreich im Song gespeichert.', 'success');
            }
        } catch (err) {
            console.error('❌ [ChordProConverter] Database update failed:', err);
            UI.showToast(err.message || 'Fehler beim Speichern', 'error');
        } finally {
            this.showLoading(false);
        }
    },

    downloadResult() {
        const text = document.getElementById('chordproResultArea').value;
        if (!text.trim()) {
            UI.showToast('Noch kein ChordPro-Inhalt zum Download vorhanden.', 'error');
            return;
        }
        const fileName = (this.selectedFile ? this.selectedFile.name.replace('.pdf', '') : 'converted') + '.cho';
        console.log(`📥 [ChordProConverter] Generating download file: ${fileName}`);

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    },

    reset() {
        console.log('🔄 [ChordProConverter] Resetting converter state');
        this.selectedFile = null;
        this.extractedText = '';
        this.convertedChordPro = '';
        this.hasConverted = false;

        const fileInput = document.getElementById('converterFileInput');
        if (fileInput) fileInput.value = '';

        const bandSelect = document.getElementById('converterBandSelect');
        if (bandSelect) bandSelect.value = '';

        const songSelect = document.getElementById('converterSongSelect');
        if (songSelect) {
            songSelect.innerHTML = '<option value="">Song wählen...</option>';
            songSelect.disabled = true;
        }

        const previewArea = document.getElementById('chordproPreviewArea');
        if (previewArea) {
            previewArea.innerHTML = '<div class="preview-placeholder">Lade oben eine PDF hoch und starte die Konvertierung. Die Vorschau erscheint danach hier.</div>';
        }

        const resultArea = document.getElementById('chordproResultArea');
        if (resultArea) resultArea.value = '';

        this.updateFileStatus('idle');
        this.updateDisclaimer('idle');
        this.syncActionState();
    },

    showLoading(show, text = 'Lädt...', progress = null) {
        const loading = document.getElementById('converterLoading');
        const loadingText = document.getElementById('converterLoadingText');
        const progressWrapper = document.getElementById('converterProgressWrapper');
        const progressBar = document.getElementById('converterProgressBar');
        const progressLabel = document.getElementById('converterProgressLabel');

        if (!loading) return;

        if (this.loadingTimeoutHandle) {
            clearTimeout(this.loadingTimeoutHandle);
            this.loadingTimeoutHandle = null;
        }

        if (show) {
            loading.style.display = 'flex';
            if (loadingText) loadingText.innerText = text;

            if (progress !== null && progressWrapper && progressBar && progressLabel) {
                progressWrapper.style.display = 'flex';
                progressBar.style.width = `${progress}%`;
                progressLabel.innerText = `${progress}%`;
            } else if (progressWrapper) {
                progressWrapper.style.display = 'none';
            }

            this.loadingTimeoutHandle = setTimeout(() => {
                loading.style.display = 'none';
                this.loadingTimeoutHandle = null;

                if (typeof UI !== 'undefined' && typeof UI.showErrorDialog === 'function') {
                    UI.showErrorDialog(
                        'Zeitüberschreitung',
                        'Die ChordPro-Verarbeitung dauert zu lange.\n\nBitte versuche es später erneut.'
                    );
                } else {
                    alert('Die ChordPro-Verarbeitung dauert zu lange. Bitte versuche es später erneut.');
                }
            }, this.LOADING_TIMEOUT_MS);
        } else {
            loading.style.display = 'none';
        }
    },

    renderPreview(chordProText) {
        const previewArea = document.getElementById('chordproPreviewArea');
        const editor = document.getElementById('chordproResultArea');
        if (!previewArea) return;

        // Synchronized Scrolling Setup (Idempotent)
        if (editor && !editor.hasAttribute('data-scroll-synced')) {
            let isSyncingLeft = false;
            let isSyncingRight = false;

            editor.addEventListener('scroll', () => {
                if (!isSyncingLeft) {
                    isSyncingRight = true;
                    // Map scroll percentage
                    const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
                    previewArea.scrollTop = percentage * (previewArea.scrollHeight - previewArea.clientHeight);
                }
                isSyncingLeft = false;
            });

            previewArea.addEventListener('scroll', () => {
                if (!isSyncingRight) {
                    isSyncingLeft = true;
                    const percentage = previewArea.scrollTop / (previewArea.scrollHeight - previewArea.clientHeight);
                    editor.scrollTop = percentage * (editor.scrollHeight - editor.clientHeight);
                }
                isSyncingRight = false;
            });
            editor.setAttribute('data-scroll-synced', 'true');
        }

        if (!chordProText.trim()) {
            previewArea.innerHTML = '<div class="preview-placeholder">Lade oben eine PDF hoch und starte die Konvertierung. Die Vorschau erscheint danach hier.</div>';
            return;
        }

        const lines = chordProText.split('\n');
        let html = '';

        // Metadata storage
        const meta = {
            title: '',
            artist: '',
            key: '',
            tempo: '',
            time: ''
        };

        // First pass: Extract metadata and remove those lines from "body" if desired, 
        // or just parse them. For a clean PDF look, we'll extract them for the header 
        // and skip rendering them as normal lines.
        const bodyLines = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                const content = trimmed.slice(1, -1);
                const parts = content.split(':');
                const key = parts[0].trim().toLowerCase();
                const value = parts.slice(1).join(':').trim();

                if (key === 't' || key === 'title') meta.title = value;
                else if (key === 'st' || key === 'subtitle' || key === 'artist') meta.artist = value;
                else if (key === 'key') meta.key = value;
                else if (key === 'tempo' || key === 'bpm') meta.tempo = value;
                else if (key === 'time') meta.time = value;
                else if (key === 'copyright') meta.copyright = value;
                else {
                    // Keep other directives (comments, chorus labels) for body
                    bodyLines.push(line);
                }
            } else {
                bodyLines.push(line);
            }
        });

        // Construct Header Block
        let headerHtml = '<div class="cp-metadata-block">';
        if (meta.title) headerHtml += `<h1 class="cp-title">${meta.title}</h1>`;
        if (meta.artist) headerHtml += `<h2 class="cp-artist">${meta.artist}</h2>`;

        const metaDetails = [];
        if (meta.key) metaDetails.push(`Key: <strong>${meta.key}</strong>`);
        if (meta.tempo) metaDetails.push(`Tempo: <strong>${meta.tempo}</strong>`);
        if (meta.time) metaDetails.push(`Time: <strong>${meta.time}</strong>`);

        if (metaDetails.length > 0) {
            headerHtml += `<div class="cp-meta-row">${metaDetails.join('<span> | </span>')}</div>`;
        }

        if (meta.copyright) {
            headerHtml += `<div class="cp-copyright">${meta.copyright}</div>`;
        }
        headerHtml += '</div>';

        html += headerHtml;

        // Render Body
        bodyLines.forEach(line => {
            const trimmed = line.trim();

            // Directive / Header (Remaining ones like Section Headers)
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                const content = trimmed.slice(1, -1);
                const parts = content.split(':');
                const key = parts[0].trim().toLowerCase();
                const value = parts.slice(1).join(':').trim();

                if (key === 'c' || key === 'comment' || key === 'soc' || key === 'eoc' || isSectionHeader(key)) {
                    // Render Section Header
                    html += `<div class="cp-section-header">${value || key}</div>`;
                }
                return;
            }

            // Lyric line with Chords (Stack Layout)
            if (line.includes('[')) {
                let lineHtml = '<div class="cp-line">';

                // Tokenizer logic:
                // We want to group [Chord]Syllable together.
                // Example: [Am]He[C]llo -> Token([Am], He), Token([C], llo)

                // Split by chords but keep delimiters
                // "Hello [Am]World [C]" -> ["Hello ", "[Am]", "World ", "[C]", ""]
                const tokens = line.split(/(\[[^\]]+\])/);

                let currentChord = '';
                let currentLyric = '';

                // Helper to flush current token
                const flushToken = (chord, lyric) => {
                    const ch = chord ? chord.slice(1, -1) : '&nbsp;'; // Remove []
                    const ly = lyric || '&nbsp;';
                    // Check if empty (only non-breaking space)
                    if (ch === '&nbsp;' && ly.trim() === '') return '';

                    return `<div class="cp-token">
                        <span class="cp-chord">${ch}</span>
                        <span class="cp-lyric">${ly}</span>
                    </div>`;
                };

                // Processing strategy:
                // Pair each chord with ONLY the immediately following text (until next chord)
                // Example: "e[F]wi[G]gli" -> Token("","e"), Token("[F]","wi"), Token("[G]","gli")

                for (let i = 0; i < tokens.length; i++) {
                    const token = tokens[i];
                    if (token.startsWith('[') && token.endsWith(']')) {
                        // It is a chord. Grab ONLY the next token
                        const nextToken = tokens[i + 1] || '';
                        lineHtml += flushToken(token, nextToken);
                        i++; // Skip next since we consumed it
                    } else {
                        // It is text WITHOUT a preceding chord
                        if (token.trim()) {
                            lineHtml += flushToken('', token);
                        }
                    }
                }

                lineHtml += '</div>';
                html += lineHtml;
            } else {
                if (trimmed === '') {
                    html += '<br>';
                } else {
                    html += `<div class="cp-line"><div class="cp-token"><span class="cp-chord">&nbsp;</span><span class="cp-lyric">${line}</span></div></div>`;
                }
            }
        });

        previewArea.innerHTML = html;

        function isSectionHeader(k) {
            return ['chorus', 'verse', 'bridge', 'intro', 'outro', 'pre-chorus'].includes(k);
        }
    },

    updateFileStatus(state = 'idle') {
        const statusEl = document.getElementById('converterFileStatus');
        if (!statusEl) return;

        if (state === 'selected' && this.selectedFile) {
            const fileSize = `${(this.selectedFile.size / 1024 / 1024).toFixed(2)} MB`;
            statusEl.innerHTML = `
                <div class="converter-file-status-row is-selected">
                    <span class="converter-file-pill">PDF bereit</span>
                    <strong>${this.escapeHtml(this.selectedFile.name)}</strong>
                    <span>${fileSize}</span>
                </div>
            `;
            return;
        }

        if (state === 'converted' && this.selectedFile) {
            statusEl.innerHTML = `
                <div class="converter-file-status-row is-converted">
                    <span class="converter-file-pill">Konvertiert</span>
                    <strong>${this.escapeHtml(this.selectedFile.name)}</strong>
                    <span>Editor und Vorschau wurden aktualisiert.</span>
                </div>
            `;
            return;
        }

        statusEl.innerHTML = `
            <div class="converter-file-status-row">
                <span class="converter-file-pill is-muted">Warten auf PDF</span>
                <span>Wähle oben eine PDF-Datei aus, um die Konvertierung zu starten.</span>
            </div>
        `;
    },

    updateDisclaimer(state = 'idle', errorMessage = '') {
        const disclaimer = document.getElementById('converterDisclaimer');
        const textEl = disclaimer ? disclaimer.querySelector('.banner-text') : null;
        if (!disclaimer || !textEl) return;

        disclaimer.classList.remove('is-idle', 'is-ready', 'is-converted', 'is-error');

        if (state === 'ready') {
            disclaimer.classList.add('is-ready');
            textEl.innerHTML = '<strong>Status:</strong> PDF gewählt. Du kannst die Konvertierung jetzt starten.';
            return;
        }

        if (state === 'converted') {
            disclaimer.classList.add('is-converted');
            textEl.innerHTML = '<strong>Hinweis:</strong> Automatisch konvertiert. Bitte Akkorde und Zeilen vor dem Speichern kurz prüfen.';
            return;
        }

        if (state === 'error') {
            disclaimer.classList.add('is-error');
            textEl.innerHTML = `<strong>Fehler:</strong> ${this.escapeHtml(errorMessage || 'Die PDF konnte nicht verarbeitet werden.')}`;
            return;
        }

        disclaimer.classList.add('is-idle');
        textEl.innerHTML = '<strong>Status:</strong> PDF hochladen und konvertieren, dann werden Editor und Vorschau direkt befüllt.';
    },

    syncActionState() {
        const startBtn = document.getElementById('startConversionAreaBtn');
        const downloadBtn = document.getElementById('converterDownloadBtn');
        const saveBtn = document.getElementById('converterSaveToSongBtn');
        const songSelect = document.getElementById('converterSongSelect');
        const editor = document.getElementById('chordproResultArea');

        const hasFile = Boolean(this.selectedFile);
        const hasContent = Boolean(editor && editor.value.trim());
        const hasSong = Boolean(songSelect && songSelect.value);

        if (startBtn) {
            startBtn.disabled = !hasFile;
        }

        if (downloadBtn) {
            downloadBtn.disabled = !hasContent;
        }

        if (saveBtn) {
            saveBtn.disabled = !(hasContent && hasSong);
        }
    },

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    setupResizeHandle() {
        const gutter = document.getElementById('converterSplitGutter');
        const container = document.querySelector('.converter-split-container');
        if (!gutter || !container) return;

        let isResizing = false;

        const onMouseDown = (e) => {
            isResizing = true;
            gutter.classList.add('active');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        };

        const onMouseUp = () => {
            if (isResizing) {
                isResizing = false;
                gutter.classList.remove('active');
                document.body.style.cursor = '';
            }
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const containerRect = container.getBoundingClientRect();
            let newX = e.clientX - containerRect.left;

            // Constrain width
            const minWidth = 200;
            const maxRight = containerRect.width - 200;

            if (newX < minWidth) newX = minWidth;
            if (newX > maxRight) newX = maxRight;

            const percentage = (newX / containerRect.width) * 100;
            container.style.gridTemplateColumns = `${percentage}% 10px minmax(0, 1fr)`;
        };

        // Mouse Events
        gutter.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Touch Events
        gutter.addEventListener('touchstart', (e) => {
            onMouseDown(e.touches[0]);
            e.preventDefault(); // prevent scrolling while dragging
        });

        document.addEventListener('touchmove', (e) => {
            if (!isResizing) return;
            onMouseMove(e.touches[0]);
        });

        document.addEventListener('touchend', onMouseUp);
    },
};

window.ChordProConverter = ChordProConverter;
