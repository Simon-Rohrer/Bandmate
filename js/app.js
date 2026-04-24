// Main Application Controller
window.APP_START_TIME = performance.now();

if (typeof Quill !== 'undefined') {
    const BaseImageBlot = Quill.import('formats/image');

    class ResizableImageBlot extends BaseImageBlot {
        static blotName = 'image';
        static tagName = 'IMG';

        static formats(domNode) {
            const width = domNode.getAttribute('data-width') || domNode.style.width || domNode.getAttribute('width');
            return width ? { width } : {};
        }

        format(name, value) {
            if (name === 'width') {
                if (value) {
                    this.domNode.style.width = value;
                    this.domNode.setAttribute('data-width', value);
                } else {
                    this.domNode.style.removeProperty('width');
                    this.domNode.removeAttribute('data-width');
                    this.domNode.removeAttribute('width');
                }
                return;
            }

            super.format(name, value);
        }
    }

    Quill.register(ResizableImageBlot, true);
}

/* ===== Quill Rich Text Editor Helper ===== */
const RichTextEditor = {

    // Quill instance
    quill: null,
    lastRange: null,
    activeImage: null,
    imageResizeHandle: null,
    boundEditorRoot: null,
    outsideClickHandlerBound: false,
    windowResizeHandlerBound: false,

    init() {
        const container = document.getElementById('quillEditor');
        const toolbarContainer = document.getElementById('newsEditorToolbar');
        if (!container || !toolbarContainer || typeof Quill === 'undefined') return;

        // If we have an instance but it's detached from the current DOM element
        // (e.g. because the parent form was cloned/replaced), we must re-init.
        if (this.quill) {
            // Check if our quill container is actually inside the current DOM element
            if (container.contains(this.quill.container)) {
                this.bindImageInput();
                this.bindImageInteractions();
                this.refreshEditorImages();
                return; // Everything is fine
            }
            // Quill is detached or pointing to an old element -> Reset
            this.quill = null;
            this.lastRange = null;
            this.clearImageSelection();
        }

        if (!this.quill) {
            this.quill = new Quill('#quillEditor', {
                theme: 'snow',
                placeholder: 'Beschreibe das Update oder Feature... Du kannst Text formatieren und Bilder einfügen.',
                modules: {
                    toolbar: {
                        container: '#newsEditorToolbar',
                        handlers: {
                            bold: () => this.toggleInlineFormat('bold'),
                            italic: () => this.toggleInlineFormat('italic'),
                            underline: () => this.toggleInlineFormat('underline'),
                            list: (value) => this.applyBlockFormat('list', value),
                            header: (value) => this.applyBlockFormat('header', value),
                            link: () => this.insertOrEditLink(),
                            image: () => this.openImagePicker(),
                            clean: () => this.clearFormatting()
                        }
                    }
                }
            });

            this.quill.on('selection-change', (range) => {
                if (range) {
                    this.lastRange = range;
                }
            });

            this.quill.on('text-change', () => {
                const range = this.quill.getSelection();
                if (range) {
                    this.lastRange = range;
                }
                this.refreshEditorImages();
                this.positionImageResizeHandle();
            });
        }

        this.bindImageInput();
        this.bindImageInteractions();
        this.refreshEditorImages();
    },

    getEditorShell() {
        return document.querySelector('.news-editor-shell');
    },

    bindImageInteractions() {
        if (!this.quill) return;

        const root = this.quill.root;
        if (this.boundEditorRoot !== root) {
            root.addEventListener('click', (event) => {
                const image = event.target.closest('img');
                if (image && root.contains(image)) {
                    this.selectImage(image);
                    return;
                }

                if (!event.target.closest('.news-image-resize-handle')) {
                    this.clearImageSelection();
                }
            });

            root.addEventListener('dragstart', (event) => {
                if (event.target.closest('img')) {
                    event.preventDefault();
                }
            });

            root.addEventListener('scroll', () => {
                this.positionImageResizeHandle();
            });

            this.boundEditorRoot = root;
        }

        this.ensureImageResizeHandle();

        if (!this.outsideClickHandlerBound) {
            document.addEventListener('click', (event) => {
                const shell = this.getEditorShell();
                if (!shell || !shell.contains(event.target)) {
                    this.clearImageSelection();
                }
            });
            this.outsideClickHandlerBound = true;
        }

        if (!this.windowResizeHandlerBound) {
            window.addEventListener('resize', () => {
                this.positionImageResizeHandle();
            });
            this.windowResizeHandlerBound = true;
        }
    },

    ensureImageResizeHandle() {
        if (this.imageResizeHandle) return this.imageResizeHandle;

        const shell = this.getEditorShell();
        if (!shell) return null;

        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'news-image-resize-handle';
        handle.setAttribute('aria-label', 'Bildgröße ändern');
        handle.addEventListener('pointerdown', (event) => {
            this.startImageResize(event);
        });

        shell.appendChild(handle);
        this.imageResizeHandle = handle;
        return handle;
    },

    refreshEditorImages() {
        if (!this.quill) return;

        this.quill.root.querySelectorAll('img').forEach((image) => {
            this.prepareEditorImage(image);
        });

        if (this.activeImage && !this.quill.root.contains(this.activeImage)) {
            this.clearImageSelection();
        }
    },

    prepareEditorImage(image) {
        if (!image) return;

        image.draggable = false;
        image.classList.add('news-editor-inline-image');
        const persistedWidth = image.getAttribute('data-width') || image.dataset.resizedWidth || image.style.width || image.getAttribute('width');
        if (persistedWidth) {
            image.style.width = persistedWidth;
            image.setAttribute('data-width', persistedWidth);
        }
        image.style.maxWidth = '100%';
        image.style.height = 'auto';

        if (!image.style.width) {
            image.style.width = '100%';
        }
    },

    selectImage(image) {
        if (!image) return;

        this.prepareEditorImage(image);

        if (this.activeImage && this.activeImage !== image) {
            this.activeImage.classList.remove('news-editor-image-selected');
        }

        this.activeImage = image;
        image.classList.add('news-editor-image-selected');
        this.positionImageResizeHandle();
    },

    clearImageSelection() {
        if (this.activeImage) {
            this.activeImage.classList.remove('news-editor-image-selected');
        }

        this.activeImage = null;

        if (this.imageResizeHandle) {
            this.imageResizeHandle.classList.remove('active');
        }
    },

    positionImageResizeHandle() {
        const handle = this.ensureImageResizeHandle();
        const shell = this.getEditorShell();

        if (!handle || !shell || !this.activeImage || !this.activeImage.isConnected) {
            if (handle) handle.classList.remove('active');
            return;
        }

        const shellRect = shell.getBoundingClientRect();
        const imageRect = this.activeImage.getBoundingClientRect();

        if (imageRect.width === 0 || imageRect.height === 0) {
            handle.classList.remove('active');
            return;
        }

        handle.classList.add('active');
        handle.style.left = `${imageRect.right - shellRect.left}px`;
        handle.style.top = `${imageRect.bottom - shellRect.top}px`;
    },

    startImageResize(event) {
        if (!this.activeImage || !this.quill) return;

        event.preventDefault();
        event.stopPropagation();

        const image = this.activeImage;
        const editorWidth = this.quill.root.clientWidth;
        if (!editorWidth) return;

        const startX = event.clientX;
        const startWidth = image.getBoundingClientRect().width;
        const minWidth = 120;

        const onPointerMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const nextWidth = Math.max(minWidth, Math.min(editorWidth, startWidth + deltaX));
            const percentWidth = Math.max(15, Math.min(100, (nextWidth / editorWidth) * 100));
            const widthValue = `${percentWidth.toFixed(2)}%`;
            const imageBlot = Quill.find(image);

            if (imageBlot && typeof imageBlot.format === 'function') {
                imageBlot.format('width', widthValue);
            } else {
                image.style.width = widthValue;
                image.dataset.resizedWidth = widthValue;
                image.setAttribute('data-width', widthValue);
            }
            image.style.maxWidth = '100%';
            image.style.height = 'auto';

            this.positionImageResizeHandle();
        };

        const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            this.positionImageResizeHandle();
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    },

    bindImageInput() {
        const imgInput = document.getElementById('rteImageInput');
        if (!imgInput) return;

        imgInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                UI.showToast('Bild ist zu groß (max 5MB)', 'error');
                return;
            }

            UI.showLoading('Bild wird verarbeitet...');
            try {
                const dataUrl = await this.resizeImage(file);
                const range = this.ensureRange();
                if (!range) return;

                this.quill.insertEmbed(range.index, 'image', dataUrl, Quill.sources.USER);
                this.quill.setSelection(range.index + 1, 0, Quill.sources.SILENT);
                this.lastRange = { index: range.index + 1, length: 0 };

                const [leaf] = this.quill.getLeaf(range.index);
                if (leaf && leaf.domNode && leaf.domNode.tagName === 'IMG') {
                    this.prepareEditorImage(leaf.domNode);
                    this.selectImage(leaf.domNode);
                }
            } catch (err) {
                console.error('Image insert error:', err);
                UI.showToast('Fehler beim Einfügen des Bildes', 'error');
            } finally {
                UI.hideLoading();
                e.target.value = '';
            }
        };
    },

    ensureRange() {
        if (!this.quill) return null;

        this.quill.focus();
        let range = this.quill.getSelection();

        if (!range && this.lastRange) {
            range = this.lastRange;
            this.quill.setSelection(range.index, range.length, Quill.sources.SILENT);
        }

        if (!range) {
            const index = Math.max(0, this.quill.getLength() - 1);
            range = { index, length: 0 };
            this.quill.setSelection(index, 0, Quill.sources.SILENT);
        }

        this.lastRange = range;
        return range;
    },

    normalizeToolbarValue(value) {
        if (value === '' || value === 'false' || value === false || value == null) {
            return false;
        }

        if (/^\d+$/.test(String(value))) {
            return Number(value);
        }

        return value;
    },

    toggleInlineFormat(format) {
        const range = this.ensureRange();
        if (!range) return;

        const currentFormats = this.quill.getFormat(range);
        const isActive = !!currentFormats[format];
        this.quill.format(format, !isActive, Quill.sources.USER);
        this.quill.focus();
    },

    applyBlockFormat(format, value) {
        const range = this.ensureRange();
        if (!range) return;

        const normalizedValue = this.normalizeToolbarValue(value);
        const currentValue = this.quill.getFormat(range)[format];
        const shouldReset = String(currentValue) === String(normalizedValue);
        this.quill.format(format, shouldReset ? false : normalizedValue, Quill.sources.USER);
        this.quill.focus();
    },

    openImagePicker() {
        const input = document.getElementById('rteImageInput');
        if (input) {
            this.ensureRange();
            input.click();
        }
    },

    normalizeLink(url) {
        if (!url) return '';
        if (/^(https?:|mailto:|tel:)/i.test(url)) {
            return url;
        }
        return `https://${url}`;
    },

    insertOrEditLink() {
        const range = this.ensureRange();
        if (!range) return;

        const currentFormats = this.quill.getFormat(range);
        const currentLink = typeof currentFormats.link === 'string' ? currentFormats.link : '';
        const rawUrl = window.prompt('Link eingeben', currentLink || 'https://');

        if (rawUrl === null) return;

        const normalizedUrl = this.normalizeLink(rawUrl.trim());
        if (!normalizedUrl) {
            this.quill.format('link', false, Quill.sources.USER);
            return;
        }

        if (range.length === 0) {
            const label = window.prompt('Linktext eingeben', normalizedUrl);
            if (label === null) return;

            const text = label.trim() || normalizedUrl;
            this.quill.insertText(range.index, text, { link: normalizedUrl }, Quill.sources.USER);
            this.quill.setSelection(range.index + text.length, 0, Quill.sources.SILENT);
            this.lastRange = { index: range.index + text.length, length: 0 };
            return;
        }

        this.quill.format('link', normalizedUrl, Quill.sources.USER);
        this.quill.focus();
    },

    clearFormatting() {
        const range = this.ensureRange();
        if (!range) return;

        if (range.length > 0) {
            this.quill.removeFormat(range.index, range.length, Quill.sources.USER);
            this.quill.setSelection(range.index, range.length, Quill.sources.SILENT);
            this.lastRange = { index: range.index, length: range.length };
            return;
        }

        ['bold', 'italic', 'underline', 'link'].forEach(format => {
            this.quill.format(format, false, Quill.sources.USER);
        });
        this.quill.format('header', false, Quill.sources.USER);
        this.quill.format('list', false, Quill.sources.USER);
        this.quill.focus();
    },

    focusAtEnd(shouldFocus = false) {
        if (!this.quill) return;

        const index = Math.max(0, this.quill.getLength() - 1);
        this.lastRange = { index, length: 0 };

        if (shouldFocus) {
            this.quill.setSelection(index, 0, Quill.sources.SILENT);
            this.quill.focus();
        }
    },

    resizeImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > 800) {
                        height = Math.round(height * (800 / width));
                        width = 800;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    getContent() {
        if (this.quill) return this.quill.root.innerHTML;
        return '';
    },

    setContent(html) {
        if (this.quill) {
            if (!html) {
                this.clear();
                return;
            }

            this.quill.setText('');
            this.quill.clipboard.dangerouslyPasteHTML(html);
            this.refreshEditorImages();
            this.focusAtEnd();
        }
    },

    clear() {
        if (this.quill) {
            this.quill.setText('');
            this.lastRange = { index: 0, length: 0 };
            this.clearImageSelection();
        }
    },

    sanitize(html) {
        if (!html) return '';
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gim, '')
            .replace(/ on\w+="[^"]*"/g, '')
            .replace(/javascript:/g, '');
    },

    getPlainText(html) {
        if (!html) return '';
        try {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || '';
        } catch (e) {
            return html.replace(/<[^>]+>/g, '');
        }
    }
};

const App = {
    currentView: null,
    navigationStateStorageKey: 'bandmate.app.navigationState',
    statePersistenceBound: false,
    headerQuickActionsBound: false,
    headerQuickAddHoverCloseTimer: null,
    _sidebarHoverExpanded: false,

    // Sorting state for band songs
    bandSongSort: {
        field: 'title',
        direction: 'asc' // asc, desc, none
    },
    songpoolSongSort: {
        field: 'title',
        direction: 'asc'
    },
    songpoolShowPublicStorageKey: 'bandmate.songpool.showPublic',
    songpoolImportDrafts: [],

    // Track deleted songs for potential rollback
    deletedEventSongs: [],
    draftEventSongOverrides: {},
    draftEventRundown: { startTime: '', items: [] },
    EVENT_RUNDOWN_MARKER_START: '[[BANDMATE_EVENT_RUNDOWN]]',
    EVENT_RUNDOWN_MARKER_END: '[[/BANDMATE_EVENT_RUNDOWN]]',
    songLanguageAutoValue: '',
    currentRundownPdfPreview: null,
    currentRundownPdfExportSession: null,
    currentRundownPdfPreviewTimer: null,
    currentRundownPdfPreviewRequestId: 0,
    currentBandRiderSession: null,
    currentBandRiderPreviewTimer: null,
    currentBandRiderPreviewRequestId: 0,

    // Caching for settings lists
    locationsCache: null,
    calendarsCache: null,
    allBandsCache: null,
    absencesCache: null,

    invalidateSettingsCache() {
        this.locationsCache = null;
        this.calendarsCache = null;
        this.allBandsCache = null;
        this.absencesCache = null;
        Logger.info('[App] Settings cache invalidated.');
    },

    getPersistedNavigationState() {
        try {
            return JSON.parse(sessionStorage.getItem(this.navigationStateStorageKey) || 'null') || {};
        } catch (error) {
            console.warn('[App] Could not parse persisted navigation state:', error);
            return {};
        }
    },

    setPersistedNavigationState(patch = {}) {
        try {
            const currentState = this.getPersistedNavigationState();
            const nextState = {
                ...currentState,
                ...patch,
                updatedAt: Date.now()
            };
            sessionStorage.setItem(this.navigationStateStorageKey, JSON.stringify(nextState));
        } catch (error) {
            console.warn('[App] Could not persist navigation state:', error);
        }
    },

    clearPersistedNavigationState() {
        try {
            sessionStorage.removeItem(this.navigationStateStorageKey);
        } catch (error) {
            console.warn('[App] Could not clear persisted navigation state:', error);
        }
    },

    hasPasswordRecoveryHash() {
        const hash = window.location.hash || '';
        return /(?:^|[&#])type=recovery(?:&|$)/i.test(hash);
    },

    isResetPasswordPage() {
        const pathname = window.location.pathname || '';
        return /reset-password\.html$/i.test(pathname);
    },

    redirectPasswordRecoveryToResetPage() {
        if (!this.hasPasswordRecoveryHash() || this.isResetPasswordPage()) {
            return false;
        }

        const baseUrl = SupabaseClient.buildProjectPageUrl('reset-password.html');
        const targetUrl = `${baseUrl}${window.location.hash || ''}`;

        console.log('[App] Password recovery link detected before app boot. Redirecting to reset-password page.');
        window.location.replace(targetUrl);
        return true;
    },

    markSettingsAsDirty() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal && settingsModal.classList.contains('active')) {
            window.isProfileDirty = true;
        }
    },

    getActiveBaseView() {
        const activeView = document.querySelector('.view.active');
        if (!activeView || !activeView.id) return 'dashboard';

        const viewMap = {
            dashboardView: 'dashboard',
            bandsView: 'bands',
            eventsView: 'events',
            rehearsalsView: 'rehearsals',
            statisticsView: 'statistics',
            newsView: 'news',
            songpoolView: 'songpool',
            probeorteView: 'probeorte',
            pdftochordproView: 'pdftochordpro',
            kalenderView: 'kalender',
            musikpoolView: 'musikpool',
            settingsView: 'settings'
        };

        return viewMap[activeView.id] || 'dashboard';
    },

    rememberCurrentView(view = this.getActiveBaseView()) {
        const restorableViews = new Set(['dashboard', 'bands', 'events', 'rehearsals', 'statistics', 'news', 'songpool', 'probeorte', 'pdftochordpro', 'kalender', 'musikpool']);
        if (!restorableViews.has(view)) return;
        this.setPersistedNavigationState({ view });
    },

    getCurrentSettingsTab() {
        const activeTab = document.querySelector('#settingsModal .settings-tab-btn.active');
        return activeTab?.dataset?.tab || 'profile';
    },

    getRestorableModalState(modalId) {
        const restorableModalIds = new Set([
            'settingsModal',
            'absenceModal',
            'createRehearsalModal',
            'createEventModal',
            'createBandModal',
            'joinBandModal',
            'feedbackModal',
            'onboardingModal',
            'calendarModal',
            'quickAddCalendarModal'
        ]);

        if (!restorableModalIds.has(modalId)) {
            return null;
        }

        let context = null;
        if (modalId === 'settingsModal') {
            context = { tab: this.getCurrentSettingsTab() };
        }

        return {
            id: modalId,
            context
        };
    },

    handleModalOpened(modalId) {
        const modalState = this.getRestorableModalState(modalId);
        if (!modalState) return;

        this.setPersistedNavigationState({
            view: this.getActiveBaseView(),
            modal: modalState
        });
    },

    handleModalClosed(modalId) {
        const state = this.getPersistedNavigationState();
        if (!state?.modal?.id || state.modal.id !== modalId) return;

        this.setPersistedNavigationState({
            view: this.getActiveBaseView(),
            modal: null
        });
    },

    persistCurrentScrollPosition() {
        const appMain = document.querySelector('.app-main');
        if (!appMain) return;
        this.setPersistedNavigationState({ scrollTop: appMain.scrollTop || 0 });
    },

    setupStatePersistence() {
        if (this.statePersistenceBound) return;

        const appMain = document.querySelector('.app-main');
        if (appMain) {
            let scrollFrame = null;
            appMain.addEventListener('scroll', () => {
                if (scrollFrame) cancelAnimationFrame(scrollFrame);
                scrollFrame = requestAnimationFrame(() => {
                    this.persistCurrentScrollPosition();
                    scrollFrame = null;
                });
            }, { passive: true });
        }

        window.addEventListener('beforeunload', () => {
            this.rememberCurrentView();
            this.persistCurrentScrollPosition();
        });

        this.statePersistenceBound = true;
    },

    restoreScrollPosition(scrollTop = 0) {
        const normalizedScrollTop = Number.isFinite(Number(scrollTop)) ? Number(scrollTop) : 0;
        const appMain = document.querySelector('.app-main');
        if (!appMain) return;

        const applyScroll = () => {
            appMain.scrollTop = normalizedScrollTop;
        };

        applyScroll();
        requestAnimationFrame(applyScroll);
        setTimeout(applyScroll, 80);
        setTimeout(applyScroll, 220);
    },

    async restoreModalState(modalState) {
        if (!modalState?.id) return false;

        try {
            switch (modalState.id) {
                case 'settingsModal':
                    await this.openSettingsModal();
                    if (modalState.context?.tab) {
                        setTimeout(() => this.switchSettingsTab(modalState.context.tab), 70);
                    }
                    return true;
                case 'absenceModal':
                    await this.openAbsenceModal();
                    return true;
                case 'createRehearsalModal':
                    this.openCreateRehearsalModal();
                    return true;
                case 'createEventModal':
                    this.openCreateEventModal();
                    return true;
                case 'createBandModal':
                case 'joinBandModal':
                case 'feedbackModal':
                case 'onboardingModal':
                case 'quickAddCalendarModal':
                    UI.openModal(modalState.id);
                    return true;
                case 'calendarModal':
                    await this.openCalendarModal();
                    return true;
                default:
                    return false;
            }
        } catch (error) {
            console.warn('[App] Could not restore modal state:', modalState.id, error);
            return false;
        }
    },

    async restoreLastAppState() {
        const state = this.getPersistedNavigationState();
        const restorableViews = new Set(['dashboard', 'bands', 'events', 'rehearsals', 'statistics', 'news', 'songpool', 'probeorte', 'pdftochordpro', 'kalender', 'musikpool']);
        const viewToRestore = restorableViews.has(state?.view) ? state.view : 'dashboard';

        await this.navigateTo(viewToRestore, state?.view ? 'session-restore' : 'login-success');

        if (Number.isFinite(Number(state?.scrollTop)) && Number(state.scrollTop) > 0) {
            this.restoreScrollPosition(state.scrollTop);
        }

        if (state?.modal?.id) {
            await this.restoreModalState(state.modal);
        }

        return true;
    },

    getSongKeyOptionsMarkup(selectedValue = '') {
        const select = document.getElementById('songKey');
        const currentValue = selectedValue || '';
        if (!select) {
            const fallbackOptions = ['', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            return fallbackOptions.map(value => {
                const label = value || '—';
                return `<option value="${value}"${value === currentValue ? ' selected' : ''}>${label}</option>`;
            }).join('');
        }

        return Array.from(select.options).map(option => {
            const value = option.value || '';
            return `<option value="${this.escapeHtml(value)}"${value === currentValue ? ' selected' : ''}>${this.escapeHtml(option.textContent || option.label || value || '—')}</option>`;
        }).join('');
    },

    getDraftEventSongField(song, field) {
        const mergedSong = this.getDraftEventSong(song);
        return mergedSong ? mergedSong[field] : undefined;
    },

    getDraftEventSong(song) {
        if (!song) return null;
        const override = this.draftEventSongOverrides?.[song.id];
        return override ? { ...song, ...override } : song;
    },

    getDraftEventSongOverridePayload(songData) {
        const editableFields = [
            'title',
            'artist',
            'bpm',
            'timeSignature',
            'key',
            'originalKey',
            'leadVocal',
            'language',
            'tracks',
            'info',
            'ccli',
            'pdf_url'
        ];

        return editableFields.reduce((payload, field) => {
            if (Object.prototype.hasOwnProperty.call(songData, field)) {
                payload[field] = songData[field];
            }
            return payload;
        }, {});
    },

    resetDraftEventState() {
        this.draftEventSongIds = [];
        this.draftEventSongOverrides = {};
        this.deletedEventSongs = [];
        this.draftEventRundown = this.normalizeEventRundownData();
        this.draftEventSongBlockTargetId = null;
    },

    async getPlanningManagerBands() {
        if (typeof Auth === 'undefined' || typeof Auth.getBandsUserCanManagePlanning !== 'function') {
            return [];
        }

        return (await Auth.getBandsUserCanManagePlanning()) || [];
    },

    async updatePlanningCreationButtons() {
        const planningBands = await this.getPlanningManagerBands();
        const createEventBtn = document.getElementById('createEventBtn');
        const createRehearsalBtn = document.getElementById('createRehearsalBtn');

        if (createEventBtn) {
            createEventBtn.style.display = '';
        }

        if (createRehearsalBtn) {
            createRehearsalBtn.style.display = '';
        }

        return planningBands;
    },

    // Account löschen Logik
    // Account löschen Logik
    // Account löschen Logik
    async handleDeleteAccount() {
        // Double check confirmation
        const confirmed = await UI.confirmDelete('Bist du sicher? Alle deine Daten werden unwiderruflich gelöscht.');
        if (!confirmed) {
            return;
        }

        try {
            UI.showToast('Account wird gelöscht...', 'error');
            const user = Auth.getCurrentUser();

            if (user) {
                // 1. User aus Supabase Auth löschen
                await Auth.deleteCurrentUser();

                // 2. User aus eigener Datenbank löschen
                await Storage.deleteUser(user.id);
            }

            UI.showToast('Account und alle Daten wurden gelöscht.', 'success');

            // 3. Logout und zurück zur Landing-Page
            await Auth.logout();
            this.showAuth();
        } catch (err) {
            console.error('Delete account error:', err);
            UI.showToast('Fehler beim Löschen: ' + (err.message || err), 'error');
        }
    },

    bindDeleteAccountButton(rootElement = null) {
        const root = rootElement || document;
        const deleteAccountBtn = root.querySelector
            ? root.querySelector('#deleteAccountBtn')
            : document.getElementById('deleteAccountBtn');

        if (!deleteAccountBtn || !deleteAccountBtn.parentNode) {
            return;
        }

        const newBtn = deleteAccountBtn.cloneNode(true);
        newBtn.type = 'button';
        deleteAccountBtn.parentNode.replaceChild(newBtn, deleteAccountBtn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await App.handleDeleteAccount();
        });
    },

    setupQuickAccessEdit() {
        const editBtn = document.getElementById('editQuickAccessBtn');
        const modal = document.getElementById('quickAccessModal');
        const form = document.getElementById('quickAccessForm');
        const optionsDiv = document.getElementById('quickAccessOptions');
        const cancelBtn = document.getElementById('cancelQuickAccessBtn');
        const quickLinks = [
            { key: 'kalender', label: 'Meine Termine', view: 'kalender' },
            { key: 'news', label: 'Neuigkeiten', view: 'news' },
            { key: 'musikpool', label: 'Musikerpool', view: 'musikpool' },
            { key: 'bands', label: 'Meine Bands', view: 'bands' },
            { key: 'rehearsals', label: 'Probetermine', view: 'rehearsals' },
            { key: 'events', label: 'Auftritte', view: 'events' },
            { key: 'statistics', label: 'Statistiken', view: 'statistics' },
        ];
        if (!editBtn || !modal || !form || !optionsDiv || !cancelBtn) return;
        editBtn.onclick = (e) => {
            e.stopPropagation();
            let selected = [];
            try {
                selected = JSON.parse(localStorage.getItem('quickAccessLinks') || 'null');
            } catch { }
            if (!Array.isArray(selected) || selected.length === 0) {
                selected = ['kalender', 'news', 'musikpool'];
            }
            optionsDiv.innerHTML = quickLinks.map(l =>
                `<label style="display:flex;align-items:center;gap:0.5em;">
                    <input type="checkbox" name="quickAccess" value="${l.key}" ${selected.includes(l.key) ? 'checked' : ''}>
                    <span>${l.label}</span>
                </label>`
            ).join('');
            const optionLabels = Array.from(optionsDiv.querySelectorAll('label'));
            const syncOptionStates = () => {
                optionLabels.forEach(label => {
                    const input = label.querySelector('input');
                    label.classList.toggle('is-checked', Boolean(input && input.checked));
                });
            };
            optionLabels.forEach(label => {
                const input = label.querySelector('input');
                if (input) {
                    input.addEventListener('change', syncOptionStates);
                }
            });
            syncOptionStates();
            modal.classList.add('active');
        };
        cancelBtn.onclick = (e) => {
            e.preventDefault();
            modal.classList.remove('active');
        };
        form.onsubmit = (e) => {
            e.preventDefault();
            const checked = Array.from(form.querySelectorAll('input[name="quickAccess"]:checked')).map(i => i.value);
            localStorage.setItem('quickAccessLinks', JSON.stringify(checked));
            modal.classList.remove('active');
            App.updateDashboard();
        };
        if (modal && modal.dataset.hasStandaloneBackdropClose !== 'true') {
            modal.addEventListener('mousedown', (event) => {
                modal._standaloneBackdropMouseDown = event.target === modal;
            });
            modal.addEventListener('mouseup', (event) => {
                modal._standaloneBackdropMouseUp = event.target === modal;
            });
            modal.addEventListener('click', (event) => {
                const startedOnBackdrop = modal._standaloneBackdropMouseDown === true;
                const endedOnBackdrop = event.target === modal && modal._standaloneBackdropMouseUp === true;
                modal._standaloneBackdropMouseDown = false;
                modal._standaloneBackdropMouseUp = false;
                if (!startedOnBackdrop || !endedOnBackdrop) return;
                modal.classList.remove('active');
            });
            modal.dataset.hasStandaloneBackdropClose = 'true';
        }
    },

    // Call this after DOMContentLoaded
    setupDashboardFeatures() {
        this.setupQuickAccessEdit();
        this.setupHeaderQuickActions();

        // Add interactive click handlers to stat cards
        const ids = [
            { id: 'bandCount', view: 'bands' },
            { id: 'upcomingEvents', view: 'events' },
            { id: 'totalRehearsals', view: 'rehearsals' }
        ];

        ids.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                const card = el.closest('.dashboard-card');
                if (card) {
                    card.style.cursor = 'pointer';
                    card.onclick = () => this.navigateTo(item.view, 'dashboard');
                }
            }
        });
    },

    setupHeaderQuickActions() {
        const shortcutBar = document.getElementById('dashboardHeaderShortcuts');
        const quickAddWrapper = document.querySelector('.header-quick-add');
        const quickAddBtn = document.getElementById('headerQuickAddBtn');
        const quickAddMenu = document.getElementById('headerQuickAddMenu');
        const createEventShortcut = document.getElementById('dashboardCreateEventShortcut');
        const createRehearsalShortcut = document.getElementById('dashboardCreateRehearsalShortcut');
        const createAbsenceShortcut = document.getElementById('dashboardCreateAbsenceShortcut');
        const openCalendarShortcut = document.getElementById('dashboardOpenCalendarShortcut');

        if (!shortcutBar || !quickAddWrapper || !quickAddBtn || !quickAddMenu || !createEventShortcut || !createRehearsalShortcut || !createAbsenceShortcut || !openCalendarShortcut) {
            return;
        }

        shortcutBar.hidden = false;

        const clearQuickAddHoverCloseTimer = () => {
            if (this.headerQuickAddHoverCloseTimer) {
                window.clearTimeout(this.headerQuickAddHoverCloseTimer);
                this.headerQuickAddHoverCloseTimer = null;
            }
        };

        const openQuickAddMenu = () => {
            clearQuickAddHoverCloseTimer();
            quickAddMenu.hidden = false;
            quickAddBtn.setAttribute('aria-expanded', 'true');
            quickAddWrapper.classList.add('is-open');
        };

        const closeQuickAddMenu = () => {
            clearQuickAddHoverCloseTimer();
            quickAddMenu.hidden = true;
            quickAddBtn.setAttribute('aria-expanded', 'false');
            quickAddWrapper.classList.remove('is-open');
        };

        quickAddBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();

            const shouldOpen = quickAddMenu.hidden;
            closeQuickAddMenu();

            if (shouldOpen) {
                openQuickAddMenu();
            }
        };

        createEventShortcut.onclick = (event) => {
            event.preventDefault();
            closeQuickAddMenu();
            this.openCreateEventModal();
        };

        createRehearsalShortcut.onclick = (event) => {
            event.preventDefault();
            closeQuickAddMenu();
            this.openCreateRehearsalModal();
        };

        createAbsenceShortcut.onclick = async (event) => {
            event.preventDefault();
            closeQuickAddMenu();
            await this.openAbsencesSettings();
        };

        openCalendarShortcut.onclick = (event) => {
            event.preventDefault();
            closeQuickAddMenu();
            this.navigateTo('kalender', 'header-shortcut-calendar');
        };

        const supportsHoverMenu = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (supportsHoverMenu) {
            quickAddWrapper.addEventListener('mouseenter', () => {
                openQuickAddMenu();
            });

            quickAddWrapper.addEventListener('mouseleave', () => {
                clearQuickAddHoverCloseTimer();
                this.headerQuickAddHoverCloseTimer = window.setTimeout(() => {
                    closeQuickAddMenu();
                }, 110);
            });
        }

        if (!this.headerQuickActionsBound) {
            document.addEventListener('pointerdown', (event) => {
                if (quickAddMenu.hidden) return;
                if (quickAddWrapper.contains(event.target)) return;
                closeQuickAddMenu();
            }, true);

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeQuickAddMenu();
                }
            });

            this.headerQuickActionsBound = true;
        }
    },

    getStoredThemePreference() {
        return localStorage.getItem('theme');
    },

    syncThemeMeta(mode) {
        const resolvedMode = mode === 'dark' ? 'dark' : 'light';
        const themeColorMeta = document.getElementById('themeColorMeta');
        const appleStatusBarMeta = document.getElementById('appleStatusBarMeta');

        if (themeColorMeta) {
            themeColorMeta.setAttribute('content', resolvedMode === 'dark' ? '#08111F' : '#F6F8FC');
        }

        if (appleStatusBarMeta) {
            appleStatusBarMeta.setAttribute('content', resolvedMode === 'dark' ? 'black-translucent' : 'default');
        }

        document.documentElement.style.colorScheme = resolvedMode;
        window.__bandmateTheme = resolvedMode;
    },

    syncThemeBrandAssets(mode = this.getResolvedThemeMode()) {
        const resolvedMode = mode === 'dark' ? 'dark' : 'light';
        const logoOnlySrc = resolvedMode === 'dark'
            ? 'images/branding/bandmate-logo-only-dark.svg'
            : 'images/branding/bandmate-logo-only.svg';
        const logoShortSrc = resolvedMode === 'dark'
            ? 'images/branding/bandmate-logo-short-dark.svg'
            : 'images/branding/bandmate-logo-short.svg';

        const updateImage = (id, src) => {
            const el = document.getElementById(id);
            if (el && el.getAttribute('src') !== src) {
                el.setAttribute('src', src);
            }
        };

        updateImage('loaderBrandLogo', logoOnlySrc);
        updateImage('landingBrandLogo', logoOnlySrc);
        updateImage('landingFooterBrandLogo', logoShortSrc);
        updateImage('sidebarLogoExpanded', logoShortSrc);
        updateImage('sidebarLogoCollapsed', logoOnlySrc);

        const favicon = document.getElementById('faviconSvg');
        if (favicon) {
            favicon.setAttribute('href', logoOnlySrc);
        }

        const appleTouchIcon = document.getElementById('appleTouchIcon');
        if (appleTouchIcon) {
            appleTouchIcon.setAttribute('href', logoOnlySrc);
        }
    },

    getResolvedThemeMode() {
        const savedTheme = this.getStoredThemePreference();
        if (savedTheme === 'light' || savedTheme === 'dark') {
            return savedTheme;
        }
        return 'dark';
    },

    getThemeIconMarkup(mode) {
        if (mode === 'dark') {
            return `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4"></circle>
                    <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"></path>
                </svg>
            `;
        }

        return `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path>
            </svg>
        `;
    },

    syncThemeControls(mode = this.getResolvedThemeMode()) {
        const themeToggleIcon = document.getElementById('themeToggleIcon');
        const themeToggleHeader = document.getElementById('themeToggleHeader');
        const settingsToggle = document.getElementById('themeToggle');

        if (themeToggleIcon) {
            themeToggleIcon.innerHTML = this.getThemeIconMarkup(mode);
        }
        if (themeToggleHeader) {
            themeToggleHeader.title = mode === 'dark' ? 'Hellmodus aktivieren' : 'Dunkelmodus aktivieren';
            themeToggleHeader.setAttribute('aria-label', themeToggleHeader.title);
        }
        if (settingsToggle) {
            settingsToggle.checked = mode === 'dark';
        }

        try {
            const logoutImg = document.querySelector('#logoutBtn img.icon-img') || document.querySelector('#logoutBtn img');
            if (logoutImg) {
                logoutImg.src = mode === 'dark' ? 'images/logout darkmode.jpg' : 'images/logout whitemode.jpg';
                logoutImg.alt = mode === 'dark' ? 'Abmelden im Dunkelmodus' : 'Abmelden im Hellmodus';
            }
        } catch (error) {
            console.warn('[Theme] Logout icon could not be updated', error);
        }
    },

    applyThemeMode(mode, persist = true) {
        const resolvedMode = mode === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = resolvedMode;
        document.documentElement.classList.toggle('theme-dark', resolvedMode === 'dark');
        if (document.body) {
            document.body.dataset.theme = resolvedMode;
        }

        if (persist) {
            localStorage.setItem('theme', resolvedMode);
        }

        this.syncThemeMeta(resolvedMode);
        this.syncThemeBrandAssets(resolvedMode);
        this.syncThemeControls(resolvedMode);
        return resolvedMode;
    },

    toggleThemeMode() {
        const nextMode = this.getResolvedThemeMode() === 'dark' ? 'light' : 'dark';
        this.applyThemeMode(nextMode);
    },

    bindThemeControls() {
        const themeToggleHeader = document.getElementById('themeToggleHeader');
        if (themeToggleHeader && !themeToggleHeader._themeInit) {
            themeToggleHeader.addEventListener('click', () => this.toggleThemeMode());
            themeToggleHeader._themeInit = true;
        }
    },

    initializeThemeSystem() {
        this.applyThemeMode(this.getResolvedThemeMode(), false);
        this.bindThemeControls();
    },

    // Update header to show current page title
    updateHeaderSubmenu(view) {
        const titleMap = {
            dashboard: { label: 'Überblick', description: 'Dashboard und nächste Termine' },
            bands: { label: 'Meine Bands', description: 'Bands, Mitglieder und Organisation' },
            musikpool: { label: 'Musikerpool', description: 'Kontakte, Musiker und Verbindungen' },
            rehearsals: { label: 'Probetermine', description: 'Abstimmungen und bestätigte Proben' },
            probeorte: { label: 'Probeorte', description: 'Kalender und Belegungen der Locations' },
            kalender: { label: 'Meine Termine', description: 'Synchronisation und Terminansicht' },
            events: { label: 'Auftritte', description: 'Anfragen, Zusagen und feste Termine' },
            statistics: { label: 'Statistiken', description: 'Auswertungen und Kennzahlen' },
            news: { label: 'Neuigkeiten', description: 'Updates und Ankündigungen' },
            songpool: { label: 'Songpool', description: 'Persönliche und öffentliche Songs im Studio' },
            settings: { label: 'Einstellungen', description: 'Profil, Abwesenheiten und Verwaltung' },
            pdftochordpro: { label: 'PDF to ChordPro', description: 'Songs konvertieren und zuordnen' }
        };

        const info = titleMap[view] || { label: 'Bandmate', description: 'Organisation für Bands und Termine' };

        const headerTitle = document.getElementById('headerPageTitle');
        if (headerTitle) {
            headerTitle.innerHTML = `<h2 class="header-page-title">${info.label}</h2>`;
        }

        const container = document.getElementById('headerSubmenu');
        if (container) {
            container.innerHTML = '';
        }
    },

    updateHeaderDashboardShortcuts(view) {
        const shortcutBar = document.getElementById('dashboardHeaderShortcuts');
        if (!shortcutBar) return;
        shortcutBar.hidden = false;
    },



    // Measure header submenu button label widths and store in CSS variable
    updateHeaderUnderlineWidths() {
        const container = document.getElementById('headerSubmenu');
        if (!container) return;
        const btns = container.querySelectorAll('.header-submenu-btn');
        btns.forEach(btn => {
            // measure content width (approx): clientWidth minus horizontal padding
            const cs = getComputedStyle(btn);
            const paddingLeft = parseFloat(cs.paddingLeft) || 0;
            const paddingRight = parseFloat(cs.paddingRight) || 0;
            const contentWidth = Math.max(20, Math.round(btn.clientWidth - paddingLeft - paddingRight));
            btn.style.setProperty('--underline-width', contentWidth + 'px');
        });
    },
    setupMobileSubmenuToggle() {
        // Prevent re-initialization
        if (this._mobileSubmenuInitialized) {
            console.log('[setupMobileSubmenuToggle] Already initialized, skipping...');
            return;
        }

        const navBar = document.getElementById('appNav');
        if (!navBar) return;

        Logger.info('[setupMobileSubmenuToggle] Initializing unified mobile nav delegation');


        // Mark as initialized
        this._mobileSubmenuInitialized = true;

        // DEBUGGING: Log all nav-groups on initialization
        console.log('[DEBUG] Nav groups found:', document.querySelectorAll('#appNav .nav-group').length);
        document.querySelectorAll('#appNav .nav-group').forEach((g, i) => {
            const mainBtn = g.querySelector('.nav-main');
            console.log(`[DEBUG] Tab ${i}:`, mainBtn?.dataset.view, 'hasSubmenu:', !!g.querySelector('.nav-submenu'));
        });

        // Central delegation handler for ALL mobile bottom nav interactions
        navBar.addEventListener('click', async (e) => {
            // DEBUGGING: Log ALL clicks on navBar
            console.log('[DEBUG] Click on navBar!', 'Target:', e.target, 'ClientX:', e.clientX, 'ClientY:', e.clientY);

            // Safety check: Only run logic if navBar is actually visible/active (mobile mode)
            if (window.innerWidth > 768) {
                console.log('[DEBUG] Ignoring - desktop mode');
                return;
            }
            const subitem = e.target.closest('.nav-subitem');
            let mainitem = e.target.closest('.nav-item.nav-main');
            if (!subitem && !mainitem) {
                const fallbackGroup = e.target.closest('.nav-group');
                if (fallbackGroup) {
                    mainitem = fallbackGroup.querySelector('.nav-item.nav-main');
                    console.log('[DEBUG] Using fallback mainitem from nav-group:', mainitem);
                }
            }

            console.log('[DEBUG] Closest subitem:', subitem);
            console.log('[DEBUG] Closest mainitem:', mainitem);

            // 1. CLICK ON A SUBMENU ITEM (The actual links in the bubble)
            if (subitem) {
                console.log('[DEBUG] Subitem clicked:', subitem.dataset.view);
                e.preventDefault();
                const view = subitem.dataset.view;
                const group = subitem.closest('.nav-group');

                // Close all menus immediately so no hidden touch area remains active
                document.querySelectorAll('.app-nav .nav-group.submenu-open').forEach(g => {
                    g.classList.remove('submenu-open');
                });

                if (group) {
                    const submenu = group.querySelector('.nav-submenu');
                    if (submenu) {
                        submenu.style.pointerEvents = 'none';
                        requestAnimationFrame(() => {
                            submenu.style.pointerEvents = '';
                        });
                    }
                }

                // Navigate
                if (view) {
                    console.log('[DEBUG] Navigating to:', view);
                    await this.navigateTo(view, 'mobile-nav-sub');
                }
                return;
            }

            // 2. CLICK ON A MAIN ICON (The bottom icons)
            if (mainitem) {
                console.log('[DEBUG] Main item clicked:', mainitem.dataset.view);
                e.preventDefault();
                e.stopPropagation(); // Avoid global "close all" handler

                const navGroup = mainitem.closest('.nav-group');
                const hasSubmenu = navGroup && navGroup.querySelector('.nav-submenu');

                console.log('[DEBUG] Has submenu:', !!hasSubmenu);

                if (hasSubmenu) {
                    // TOGGLE SUBMENU logic
                    // Close all other submenus first
                    document.querySelectorAll('.app-nav .nav-group.submenu-open').forEach(g => {
                        if (g !== navGroup) g.classList.remove('submenu-open');
                    });

                    navGroup.classList.toggle('submenu-open');
                    console.log('[DEBUG] Toggled submenu-open, now:', navGroup.classList.contains('submenu-open'));
                    return;
                } else {
                    // DIRECT NAVIGATION (e.g. for simple buttons without submenus)

                    // Close any open submenus
                    document.querySelectorAll('.app-nav .nav-group.submenu-open').forEach(g => {
                        g.classList.remove('submenu-open');
                    });

                    const view = mainitem.dataset.view;
                    if (view) {
                        console.log('[DEBUG] Direct navigation to:', view);
                        await this.navigateTo(view, 'mobile-nav-main-direct');
                    }
                }
            } else {
                console.log('[DEBUG] Click on navBar but no mainitem/subitem found! This should not happen.');
            }
        });

        // Global click listener to close submenus when clicking "out" of the nav
        // This should also only run on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;

            if (!e.target.closest('.app-nav')) {
                document.querySelectorAll('.app-nav .nav-group.submenu-open').forEach(g => {
                    g.classList.remove('submenu-open');
                });
            }
        });
    },

    // Helper to open settings modal
    openSettings() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            UI.openModal('settingsModal');
            // Initialize settings logic explicitly
            const modalBody = settingsModal.querySelector('.modal-body');
            const isAdmin = Auth.isAdmin();
            if (this.initializeSettingsViewListeners) {
                this.initializeSettingsViewListeners(isAdmin, modalBody);
            }
        }
    },

    // Sidebar Toggle (Desktop)
    setupSidebarToggle() {
        const toggleBtn = document.getElementById('toggleSidebarBtn');
        const sidebar = document.querySelector('.app-sidebar');
        const wrapper = document.querySelector('.app-main-wrapper');

        this._autoExpanded = false; // Flag for auto-expand behavior

        if (!toggleBtn || !sidebar || !wrapper) return;

        if (!toggleBtn || !sidebar || !wrapper) return;

        const restoreSidebarAfterTemporaryOpen = () => {
            if ((!this._autoExpanded && !this._sidebarHoverExpanded) || !sidebar || sidebar.classList.contains('collapsed')) {
                return;
            }

            sidebar.classList.add('collapsed');
            sidebar.classList.remove('hover-expanded');
            wrapper.classList.add('sidebar-collapsed');
            this._autoExpanded = false;
            this._sidebarHoverExpanded = false;
            localStorage.setItem('sidebarCollapsed', 'true');
            document.querySelectorAll('.sidebar-nav .sidebar-group.expanded').forEach(group => {
                group.classList.remove('expanded');
            });
            window.dispatchEvent(new Event('resize'));
        };

        // Load saved state
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed && window.innerWidth > 768) {
            sidebar.classList.add('collapsed');
            wrapper.classList.add('sidebar-collapsed');
        }

        toggleBtn.addEventListener('click', () => {
            if (this._sidebarHoverExpanded) {
                sidebar.classList.remove('hover-expanded');
                wrapper.classList.remove('sidebar-collapsed');
                this._sidebarHoverExpanded = false;
                this._autoExpanded = false;
                localStorage.setItem('sidebarCollapsed', 'false');
                window.dispatchEvent(new Event('resize'));
                return;
            }

            sidebar.classList.toggle('collapsed');
            wrapper.classList.toggle('sidebar-collapsed');

            this._autoExpanded = false; // Reset on manual toggle
            this._sidebarHoverExpanded = false;
            sidebar.classList.remove('hover-expanded');

            const nowCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', nowCollapsed);

            // Trigger a resize event to layout charts or components if needed
            window.dispatchEvent(new Event('resize'));
        });

        sidebar.addEventListener('mouseenter', () => {
            if (window.innerWidth <= 768) return;
            if (!sidebar.classList.contains('collapsed')) return;
            if (localStorage.getItem('sidebarCollapsed') !== 'true') return;

            sidebar.classList.remove('collapsed');
            sidebar.classList.add('hover-expanded');
            wrapper.classList.remove('sidebar-collapsed');
            this._sidebarHoverExpanded = true;
            this._autoExpanded = false;
            window.dispatchEvent(new Event('resize'));
        });

        sidebar.addEventListener('mouseleave', () => {
            if (!this._sidebarHoverExpanded) return;
            restoreSidebarAfterTemporaryOpen();
        });

        this.restoreSidebarAfterTemporaryOpen = restoreSidebarAfterTemporaryOpen;

        this.setupSidebarResize();
    },

    // Sidebar Resize (Desktop)
    setupSidebarResize() {
        const resizer = document.getElementById('sidebarResizer');
        const sidebar = document.querySelector('.app-sidebar');
        const wrapper = document.querySelector('.app-main-wrapper');
        const root = document.documentElement;

        if (!resizer || !sidebar || !wrapper) return;

        // Initialize width from localStorage
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth && window.innerWidth > 768) {
            root.style.setProperty('--sidebar-width', `${savedWidth}px`);
        }

        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            sidebar.classList.add('is-resizing');
            wrapper.classList.add('is-resizing');

            // Disable text selection during resize
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            let newWidth = e.clientX;

            // Constraints
            const minWidth = 180;
            const maxWidth = 600;
            const collapseThreshold = 140;

            // Handle Auto-Collapse/Expand during drag
            if (newWidth < collapseThreshold) {
                if (!sidebar.classList.contains('collapsed')) {
                    sidebar.classList.add('collapsed');
                    wrapper.classList.add('sidebar-collapsed');
                    localStorage.setItem('sidebarCollapsed', 'true');
                }
                newWidth = 78; // Visual feedback for collapsed state
            } else {
                if (sidebar.classList.contains('collapsed')) {
                    sidebar.classList.remove('collapsed');
                    wrapper.classList.remove('sidebar-collapsed');
                    localStorage.setItem('sidebarCollapsed', 'false');
                }

                if (newWidth < minWidth) newWidth = minWidth;
                if (newWidth > maxWidth) newWidth = maxWidth;
            }

            root.style.setProperty('--sidebar-width', `${newWidth}px`);

            // Only save non-collapsed width
            if (newWidth >= minWidth) {
                localStorage.setItem('sidebarWidth', newWidth);
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;

            isResizing = false;
            document.body.style.cursor = '';
            sidebar.classList.remove('is-resizing');
            wrapper.classList.remove('is-resizing');
            document.body.style.userSelect = '';

            // Trigger resize for components
            window.dispatchEvent(new Event('resize'));
        });
    },

    // Setup sidebar navigation (desktop)
    setupSidebarNav() {
        // Prevent re-initialization
        if (this._sidebarNavInitialized) {
            console.log('[setupSidebarNav] Already initialized, skipping...');
            return;
        }

        Logger.info('[setupSidebarNav] Initializing...');
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (!sidebarNav) {
            console.warn('[setupSidebarNav] No .sidebar-nav found');
            return;
        }

        // Use event delegation - single listener on the parent
        sidebarNav.addEventListener('click', (e) => {
            // Find the clicked sidebar item or subitem
            const navItem = e.target.closest('.sidebar-item, .sidebar-subitem');
            if (!navItem) return;

            const view = navItem.dataset.view;
            const isMainWithSubmenu = navItem.classList.contains('sidebar-main') && navItem.parentElement.classList.contains('has-submenu');

            // Handle main items with submenu BUT NO data-view (pure accordion toggles)
            if (isMainWithSubmenu && !view) {
                e.preventDefault();
                e.stopPropagation();

                const sidebar = document.querySelector('.app-sidebar');
                const wrapper = document.querySelector('.app-main-wrapper');

                // If collapsed, expand first
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    sidebar.classList.remove('collapsed');
                    if (wrapper) wrapper.classList.remove('sidebar-collapsed');
                    this._autoExpanded = true; // Mark as auto-expanded
                    localStorage.setItem('sidebarCollapsed', 'false');
                    window.dispatchEvent(new Event('resize'));
                }

                const group = navItem.parentElement;

                // Toggle current group
                const isExpanded = group.classList.contains('expanded');

                // Close all groups
                document.querySelectorAll('.sidebar-nav .sidebar-group.expanded').forEach(g => {
                    g.classList.remove('expanded');
                });

                // Expand clicked if it wasn't expanded
                if (!isExpanded) {
                    group.classList.add('expanded');
                }
                return;
            }

            // Handle navigation (subitems or regular nav items with data-view)
            if (view) {
                e.preventDefault();
                e.stopPropagation();

                // Auto-collapse if it was expanded by an accordion click previously
                const sidebar = document.querySelector('.app-sidebar');
                const wrapper = document.querySelector('.app-main-wrapper');
                if (this._autoExpanded && sidebar && !sidebar.classList.contains('collapsed')) {
                    sidebar.classList.add('collapsed');
                    if (wrapper) wrapper.classList.add('sidebar-collapsed');
                    this._autoExpanded = false;
                    localStorage.setItem('sidebarCollapsed', 'true');
                    window.dispatchEvent(new Event('resize'));
                }

                if (this._sidebarHoverExpanded && typeof this.restoreSidebarAfterTemporaryOpen === 'function') {
                    this.restoreSidebarAfterTemporaryOpen();
                }

                // Sichertstellen: Schließe alle offenen Dropdowns bei Navigation zu einem anderen Punkt
                // Aber NICHT, wenn wir auf ein Subitem innerhalb eines offenen Dropdowns klicken
                // Obwohl... wenn wir auf ein Subitem klicken, navigieren wir weg.
                // Der User möchte: "wenn ich auf einen menüpunkt gehe ... soll sich das offne dropdown menü geschlossen werden"
                // Das impliziert, dass wenn man auf "Dashboard" klickt, "Planung" zugeht.
                // Wenn man auf "Probetermine" (im Dropdown) klickt, sollte es wohl offen bleiben?
                // Oder auch zugehen, weil wir navigieren? Typischerweise bleiben aktive Accordions offen.
                // Aber wenn wir auf einen *anderen* Main-Punkt klicken, muss es zugehen.

                // Check if clicked item is a MAIN item (top level)
                if (navItem.classList.contains('sidebar-main')) {
                    document.querySelectorAll('.sidebar-nav .sidebar-group.expanded').forEach(g => {
                        g.classList.remove('expanded');
                    });
                }

                this.navigateTo(view, 'sidebar').catch(err => {
                    console.error('[Sidebar Nav Error]:', err);
                });
            }
        });

        // 2. Settings Button (Sidebar)
        const openSettingsBtn = document.getElementById('openSettingsBtnSidebar');
        if (openSettingsBtn && !openSettingsBtn._clickHandlerAttached) {
            openSettingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                Logger.userAction('Button', 'openSettingsBtnSidebar', 'Click', { action: 'Open Settings' });
                // Close any open submenus
                document.querySelectorAll('.sidebar-nav .nav-group.expanded').forEach(group => {
                    group.classList.remove('expanded');
                });
                if (this._sidebarHoverExpanded && typeof this.restoreSidebarAfterTemporaryOpen === 'function') {
                    this.restoreSidebarAfterTemporaryOpen();
                }
                this.openSettings();
            });
            openSettingsBtn._clickHandlerAttached = true;
        }

        // 3. Feedback Button (Sidebar)
        const feedbackBtn = document.getElementById('feedbackBtnSidebar');
        if (feedbackBtn && !feedbackBtn._clickHandlerAttached) {
            feedbackBtn.addEventListener('click', (e) => {
                e.preventDefault();
                Logger.userAction('Button', 'feedbackBtnSidebar', 'Click', { action: 'Open Feedback Modal' });
                // Close any open submenus
                document.querySelectorAll('.sidebar-nav .nav-group.expanded').forEach(group => {
                    group.classList.remove('expanded');
                });
                if (this._sidebarHoverExpanded && typeof this.restoreSidebarAfterTemporaryOpen === 'function') {
                    this.restoreSidebarAfterTemporaryOpen();
                }
                UI.openModal('feedbackModal');
            });
            feedbackBtn._clickHandlerAttached = true;
        }

        // 4. Logout Button (Sidebar)
        const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
        if (sidebarLogoutBtn && !sidebarLogoutBtn._clickHandlerAttached) {
            sidebarLogoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                Logger.userAction('Button', 'sidebarLogoutBtn', 'Click', { action: 'Logout from Sidebar' });
                // Close any open submenus
                document.querySelectorAll('.sidebar-nav .nav-group.expanded').forEach(group => {
                    group.classList.remove('expanded');
                });
                if (this._sidebarHoverExpanded && typeof this.restoreSidebarAfterTemporaryOpen === 'function') {
                    this.restoreSidebarAfterTemporaryOpen();
                }
                this.handleLogout();
            });
            sidebarLogoutBtn._clickHandlerAttached = true;
        }

        this._sidebarNavInitialized = true;

    },

    setupFeedbackModal() {
        const modal = document.getElementById('feedbackModal');
        if (!modal) return;

        // Tabs
        const tabs = modal.querySelectorAll('.settings-tab-btn');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Deactivate all tabs
                tabs.forEach(t => t.classList.remove('active'));
                // Hide all contents
                modal.querySelectorAll('.feedback-tab-content').forEach(c => {
                    c.style.display = 'none';
                    c.classList.remove('active');
                });

                // Activate clicked tab
                tab.classList.add('active');
                const targetId = tab.dataset.tab === 'feedback' ? 'feedbackTabContent' : 'bugTabContent';
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.style.display = 'block';
                    targetContent.classList.add('active');
                }
            });
        });

        // Forms
        const feedbackForm = document.getElementById('feedbackForm');
        if (feedbackForm) {
            feedbackForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const msg = document.getElementById('feedbackMessage').value;

                try {
                    await FeedbackService.submitFeedback('feedback', null, msg);
                    UI.showToast('Vielen Dank für dein Feedback!', 'success');
                    UI.closeModal('feedbackModal');
                    feedbackForm.reset();
                } catch (err) {
                    UI.showToast(err.message || 'Fehler beim Senden', 'error');
                }
            });
        }

        const bugForm = document.getElementById('bugReportForm');
        if (bugForm) {
            bugForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = document.getElementById('bugTitle').value;
                const desc = document.getElementById('bugDescription').value;

                try {
                    await FeedbackService.submitFeedback('bug', title, desc);
                    UI.showToast('Danke für den Fehlerbericht! Wir schauen uns das an.', 'success');
                    UI.closeModal('feedbackModal');
                    bugForm.reset();
                } catch (err) {
                    UI.showToast(err.message || 'Fehler beim Senden', 'error');
                }
            });
        }
    },

    resetFeedbackModal() {
        const modal = document.getElementById('feedbackModal');
        if (!modal) return;

        const feedbackForm = document.getElementById('feedbackForm');
        const bugForm = document.getElementById('bugReportForm');

        if (feedbackForm) feedbackForm.reset();
        if (bugForm) bugForm.reset();

        modal.querySelectorAll('.settings-tab-btn').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === 'feedback');
        });

        modal.querySelectorAll('.feedback-tab-content').forEach(content => {
            const isFeedbackTab = content.id === 'feedbackTabContent';
            content.style.display = isFeedbackTab ? 'block' : 'none';
            content.classList.toggle('active', isFeedbackTab);
        });
    },

    // Update sidebar profile info
    updateSidebarProfile() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const avatarEl = document.getElementById('sidebarProfileAvatar');
        const nameEl = document.getElementById('sidebarProfileName');

        if (nameEl) {
            const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User';
            nameEl.textContent = displayName;
        }

        if (avatarEl) {
            if (user.profile_image_url) {
                avatarEl.innerHTML = `<img src="${user.profile_image_url}" alt="Profile" />`;
            } else {
                // Show initials
                const initials = this.getInitials(user);
                avatarEl.textContent = initials;
            }
        }
    },

    // Get user initials for avatar
    getInitials(user) {
        if (!user) return '?';
        const first = (user.first_name || '').charAt(0).toUpperCase();
        const last = (user.last_name || '').charAt(0).toUpperCase();
        if (first && last) return first + last;
        if (first) return first;
        const username = (user.username || '').charAt(0).toUpperCase();
        return username || '?';
    },



    cleanupPDFPreview() {
        const frame = document.getElementById('pdfPreviewFrame');
        const titleEl = document.getElementById('pdfPreviewTitle');
        const downloadBtn = document.getElementById('pdfPreviewDownload');
        if (frame) frame.src = '';
        if (titleEl) titleEl.textContent = 'PDF Vorschau';
        if (downloadBtn) {
            downloadBtn.removeAttribute('href');
            downloadBtn.removeAttribute('download');
        }

        if (this.currentPDFData && this.currentPDFData.blobUrl) {
            URL.revokeObjectURL(this.currentPDFData.blobUrl);
            this.currentPDFData = null;
        }
    },

    cleanupChordProPreview() {
        const previewArea = document.getElementById('chordproSongPreviewArea');
        const titleEl = document.getElementById('chordproPreviewTitle');
        const downloadBtn = document.getElementById('chordproPreviewDownload');

        if (previewArea) {
            previewArea.innerHTML = '';
        }

        if (titleEl) {
            titleEl.textContent = 'ChordPro Vorschau';
        }

        if (downloadBtn) {
            downloadBtn.removeAttribute('href');
            downloadBtn.removeAttribute('download');
        }

        if (this.currentChordProPreviewBlobUrl) {
            URL.revokeObjectURL(this.currentChordProPreviewBlobUrl);
            this.currentChordProPreviewBlobUrl = null;
        }
    },

    cleanupRundownPdfExportPreview() {
        const frame = document.getElementById('rundownPdfPreviewFrame');
        const loading = document.getElementById('rundownPdfPreviewLoading');
        const titleEl = document.getElementById('rundownPdfPreviewTitle');
        const filenameEl = document.getElementById('rundownPdfPreviewFilename');
        const downloadBtn = document.getElementById('rundownPdfExportDownload');

        if (this.currentRundownPdfPreviewTimer) {
            clearTimeout(this.currentRundownPdfPreviewTimer);
            this.currentRundownPdfPreviewTimer = null;
        }

        this.currentRundownPdfPreviewRequestId += 1;

        if (frame) {
            frame.src = '';
            frame.srcdoc = '';
        }

        if (loading) {
            loading.hidden = true;
        }

        if (titleEl) {
            titleEl.textContent = 'Ablauf PDF';
        }

        if (filenameEl) {
            filenameEl.textContent = '-';
        }

        if (downloadBtn) {
            downloadBtn.disabled = true;
        }

        if (this.currentRundownPdfPreview?.blobUrl) {
            URL.revokeObjectURL(this.currentRundownPdfPreview.blobUrl);
        }

        this.currentRundownPdfPreview = null;
        this.currentRundownPdfExportSession = null;
    },

    getRundownPdfExportModeDefinitions() {
        return {
            'full-details': {
                label: 'Ganzer Ablauf mit Details'
            },
            'full-compact': {
                label: 'Ganzer Ablauf ohne Details'
            },
            'songs-full': {
                label: 'Nur Songs mit allen Infos'
            },
            'songs-language': {
                label: 'Nur Songs mit Sprache'
            },
            'songs-large': {
                label: 'Große nummerierte Songtitel'
            }
        };
    },

    getRundownPdfExportModeLabel(mode = 'full-details') {
        return this.getRundownPdfExportModeDefinitions()[mode]?.label
            || this.getRundownPdfExportModeDefinitions()['full-details'].label;
    },

    async resolveRundownPdfMemberNames(memberIds = []) {
        const uniqueIds = [...new Set((memberIds || []).map((id) => String(id)).filter(Boolean))];
        if (uniqueIds.length === 0) return [];

        const members = await Promise.all(uniqueIds.map(async (memberId) => {
            try {
                return await Storage.getById('users', memberId);
            } catch (error) {
                console.warn('[Rundown PDF] Member lookup failed:', error);
                return null;
            }
        }));

        return members
            .filter(Boolean)
            .map((member) => ((typeof UI !== 'undefined' && typeof UI.getUserDisplayName === 'function')
                ? UI.getUserDisplayName(member)
                : (member.name || member.username || member.email || 'Unbekannt')));
    },

    buildRundownPdfItemsFromSource(rundown = null, songs = [], fallbackStartTime = '') {
        const normalizedRundown = this.normalizeEventRundownData(rundown);
        const normalizedSongs = (Array.isArray(songs) ? songs : []).map((song, index) => ({
            ...song,
            orderIndex: index + 1,
            infoDisplay: this.getSongInfoDisplay(song)
        }));
        const songMap = new Map(normalizedSongs.map((song) => [String(song.id), song]));
        const timeline = this.getEventRundownTimeline(normalizedRundown, fallbackStartTime);

        const items = timeline.map((item) => ({
            ...item,
            typeLabel: item.typeMeta?.label || this.getEventRundownTypeMeta(item.type)?.label || 'Programmpunkt',
            selectedSongs: Array.isArray(item.songIds)
                ? item.songIds.map((songId) => songMap.get(String(songId))).filter(Boolean)
                : []
        }));

        const songsInRundownOrder = [];
        items.forEach((item) => {
            item.selectedSongs.forEach((song) => songsInRundownOrder.push(song));
        });

        return {
            items,
            songs: songsInRundownOrder.length > 0 ? songsInRundownOrder : normalizedSongs
        };
    },

    async buildDraftRundownPdfExportPayload() {
        const rundown = this.getPersistableDraftEventRundown();
        if (!Array.isArray(rundown.items) || rundown.items.length === 0) {
            return null;
        }

        const currentUser = Auth.getCurrentUser();
        const { bandId } = this.getCurrentEventEditorContext();
        const songs = await this.getDraftEventSongsInRundownOrder();
        const fallbackStart = this.getEventRundownFallbackStartTime();
        const { items, songs: songsInOrder } = this.buildRundownPdfItemsFromSource(rundown, songs, fallbackStart);

        const bandSelect = document.getElementById('eventBand');
        const selectedBandOption = bandSelect?.selectedOptions?.[0];
        let bandName = selectedBandOption?.textContent?.trim() || '';
        if (!bandName && bandId) {
            const band = await Storage.getBand(bandId);
            bandName = band?.name || '';
        }

        const selectedMemberIds = (typeof Events !== 'undefined' && typeof Events.getSelectedMembers === 'function')
            ? Events.getSelectedMembers()
            : [];
        const guests = (typeof Events !== 'undefined' && typeof Events.getGuests === 'function')
            ? Events.getGuests()
            : [];
        const lineup = [
            ...(await this.resolveRundownPdfMemberNames(selectedMemberIds)),
            ...guests
        ].filter(Boolean);

        const title = document.getElementById('eventTitle')?.value?.trim() || 'Ablauf';
        const eventDateValue = (typeof Events !== 'undefined' && typeof Events.getFixedDateTimeValue === 'function')
            ? Events.getFixedDateTimeValue()
            : '';
        const dateLabel = eventDateValue ? UI.formatDate(eventDateValue) : '';
        const visibleInfo = document.getElementById('eventInfo')?.value?.trim() || '';
        const techInfo = document.getElementById('eventTechInfo')?.value?.trim() || '';
        const location = document.getElementById('eventLocation')?.value?.trim() || '';
        const soundcheckLocation = document.getElementById('eventSoundcheckLocation')?.value?.trim() || '';

        return {
            title: title ? `Ablauf ${title}` : 'Ablauf',
            subtitle: [bandName, dateLabel].filter(Boolean).join(' • '),
            items,
            songs: songsInOrder,
            eventMeta: {
                bandName,
                createdByName: currentUser ? UI.getUserDisplayName(currentUser) : '',
                dateLabel,
                location,
                soundcheckLocation,
                info: visibleInfo,
                techInfo,
                lineup
            }
        };
    },

    async buildStoredEventRundownPdfExportPayload(eventId) {
        const event = await Storage.getEvent(eventId);
        if (!event) return null;

        const rundown = this.extractEventRundown(event.info || '');
        if (!Array.isArray(rundown.items) || rundown.items.length === 0) {
            return null;
        }

        const songs = (await Storage.getEventSongsForMultipleEvents([eventId]))
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const fallbackStart = event.date ? String(event.date).slice(11, 16) : '';
        const { items, songs: songsInOrder } = this.buildRundownPdfItemsFromSource(rundown, songs, fallbackStart);

        const band = event.bandId ? await Storage.getBand(event.bandId) : null;
        let creator = null;
        if (event.createdBy) {
            try {
                creator = await Storage.getById('users', event.createdBy);
            } catch (error) {
                console.warn('[Rundown PDF] Creator lookup failed:', error);
            }
        }
        const lineup = [
            ...(await this.resolveRundownPdfMemberNames(Array.isArray(event.members) ? event.members : [])),
            ...((event.guests || []).filter(Boolean))
        ];
        const dateLabel = (typeof Events !== 'undefined' && typeof Events.formatDisplayDateForEvent === 'function')
            ? Events.formatDisplayDateForEvent(event)
            : (event.date ? UI.formatDate(event.date) : '');

        return {
            title: event.title ? `Ablauf ${event.title}` : 'Ablauf',
            subtitle: [band?.name || '', dateLabel].filter(Boolean).join(' • '),
            items,
            songs: songsInOrder,
            eventMeta: {
                bandName: band?.name || '',
                createdByName: creator ? UI.getUserDisplayName(creator) : '',
                dateLabel,
                location: event.location || '',
                soundcheckLocation: event.soundcheckLocation || '',
                info: this.extractEventVisibleInfo(event.info || ''),
                techInfo: event.techInfo || '',
                lineup
            }
        };
    },

    bindRundownPdfExportModal() {
        const modal = document.getElementById('rundownPdfExportModal');
        if (!modal || modal.dataset.bound === 'true') return;

        const nameInput = document.getElementById('rundownPdfFileName');
        const fontScaleInput = document.getElementById('rundownPdfFontScale');
        const modeInputs = modal.querySelectorAll('input[name="rundownPdfMode"]');
        const cancelBtn = document.getElementById('rundownPdfExportCancel');
        const downloadBtn = document.getElementById('rundownPdfExportDownload');

        if (nameInput) {
            nameInput.addEventListener('input', () => {
                if (!this.currentRundownPdfExportSession) return;
                this.currentRundownPdfExportSession.title = nameInput.value.trim();
                this.currentRundownPdfExportSession.isDirty = true;
                this.updateRundownPdfExportModalMeta();
                this.scheduleRundownPdfPreviewRefresh(220);
            });
        }

        if (fontScaleInput) {
            fontScaleInput.addEventListener('input', () => {
                if (!this.currentRundownPdfExportSession) return;
                const nextScale = this.getRundownPdfActualFontScaleFromPercent(Number(fontScaleInput.value) || 100);
                this.currentRundownPdfExportSession.fontScale = nextScale;
                this.currentRundownPdfExportSession.isDirty = true;
                this.updateRundownPdfExportModalMeta();
                this.scheduleRundownPdfPreviewRefresh(80);
            });
        }

        modeInputs.forEach((input) => {
            input.addEventListener('change', () => {
                if (!this.currentRundownPdfExportSession) return;
                this.currentRundownPdfExportSession.mode = input.value;
                this.currentRundownPdfExportSession.isDirty = true;
                this.updateRundownPdfExportModalMeta();
                this.scheduleRundownPdfPreviewRefresh(60);
            });
        });

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => UI.closeModal('rundownPdfExportModal'));
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                await this.downloadCurrentRundownPdfPreview();
            });
        }

        modal.dataset.bound = 'true';
    },

    updateRundownPdfExportModalMeta() {
        const session = this.currentRundownPdfExportSession;
        if (!session) return;

        const previewTitle = document.getElementById('rundownPdfPreviewTitle');
        const previewContext = document.getElementById('rundownPdfPreviewContext');
        const filenameEl = document.getElementById('rundownPdfPreviewFilename');
        const previewMode = document.getElementById('rundownPdfPreviewMode');
        const previewModeLabel = document.getElementById('rundownPdfPreviewModeLabel');
        const fontScaleInput = document.getElementById('rundownPdfFontScale');
        const fontScaleValue = document.getElementById('rundownPdfFontScaleValue');

        const resolvedTitle = session.title || session.defaultTitle || 'Ablauf';
        const resolvedModeLabel = this.getRundownPdfExportModeLabel(session.mode || 'full-details');
        const resolvedFilename = typeof PDFGenerator !== 'undefined' && typeof PDFGenerator.sanitizeFilename === 'function'
            ? PDFGenerator.sanitizeFilename(resolvedTitle, 'ablauf.pdf')
            : `${resolvedTitle || 'ablauf'}.pdf`;
        const resolvedFontScale = this.getRundownPdfActualFontScaleFromPercent(
            this.getRundownPdfPercentFromActualFontScale(Number(session.fontScale) || 0.9)
        );
        const resolvedFontScalePercent = this.getRundownPdfPercentFromActualFontScale(resolvedFontScale);

        if (previewTitle) {
            previewTitle.textContent = resolvedTitle;
        }

        if (previewContext) {
            previewContext.textContent = `${session.items.length} Punkte · ${session.songs.length} Songs`;
        }

        if (previewMode) {
            previewMode.textContent = resolvedModeLabel;
        }

        if (previewModeLabel) {
            previewModeLabel.textContent = resolvedModeLabel;
        }

        if (filenameEl) {
            filenameEl.textContent = resolvedFilename;
        }

        if (fontScaleInput) {
            fontScaleInput.value = String(resolvedFontScalePercent);
        }

        if (fontScaleValue) {
            fontScaleValue.textContent = `${resolvedFontScalePercent}%`;
        }
    },

    getRundownPdfActualFontScaleFromPercent(percent = 100) {
        const safePercent = Math.min(120, Math.max(85, Number(percent) || 100));
        return Math.min(1.2, Math.max(0.85, (safePercent / 100) * 0.9));
    },

    getRundownPdfPercentFromActualFontScale(scale = 0.9) {
        const safeScale = Math.min(1.2, Math.max(0.85, Number(scale) || 0.9));
        return Math.min(120, Math.max(85, Math.round((safeScale / 0.9) * 100)));
    },

    buildRundownPdfPreviewDocument(session = null) {
        if (!session || typeof PDFGenerator === 'undefined' || typeof PDFGenerator.buildRundownPDFPages !== 'function') {
            return '';
        }

        const isDarkTheme = document.documentElement.classList.contains('theme-dark')
            || document.documentElement.dataset.theme === 'dark';

        const pages = PDFGenerator.buildRundownPDFPages({
            title: session.title || session.defaultTitle || 'Ablauf',
            subtitle: session.subtitle || '',
            mode: session.mode || 'full-details',
            eventMeta: session.eventMeta || {},
            items: session.items || [],
            songs: session.songs || [],
            fontScale: session.fontScale || 1
        });

        const pageMarkup = (Array.isArray(pages) ? pages : []).map((page) => `
            <section class="preview-page-wrap">
                <div class="preview-page-sheet">${page}</div>
            </section>
        `).join('');

        return `
            <!doctype html>
            <html lang="de">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>${this.escapeHtml(session.title || session.defaultTitle || 'Ablauf')}</title>
                    <style>
                        * { box-sizing: border-box; }
                        html, body { margin: 0; min-height: 100%; }
                        @page { size: A4; margin: 0; }
                        body {
                            font-family: Inter, Arial, sans-serif;
                            background: ${isDarkTheme
                                ? 'radial-gradient(circle at top, rgba(79, 125, 243, 0.12), transparent 34%), #0b1220'
                                : 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)'};
                            color: ${isDarkTheme ? '#e2e8f0' : '#0f172a'};
                        }
                        .preview-shell {
                            min-height: 100vh;
                            padding: ${isDarkTheme ? '18px' : '24px'};
                        }
                        .preview-page-wrap {
                            width: min(100%, 860px);
                            margin: 0 auto 20px;
                        }
                        .preview-page-sheet {
                            border-radius: 18px;
                            overflow: hidden;
                            background: #ffffff;
                            box-shadow:
                                ${isDarkTheme
                                    ? '0 22px 40px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.06)'
                                    : '0 24px 48px rgba(15, 23, 42, 0.10), 0 0 0 1px rgba(203, 213, 225, 0.82)'};
                        }
                        .preview-page-sheet > * {
                            width: 100% !important;
                            margin: 0 !important;
                        }
                        @media print {
                            html, body {
                                background: #ffffff !important;
                            }
                            .preview-shell {
                                padding: 0;
                            }
                            .preview-page-wrap {
                                width: 210mm;
                                margin: 0 auto;
                                break-after: page;
                                page-break-after: always;
                            }
                            .preview-page-wrap:last-child {
                                break-after: auto;
                                page-break-after: auto;
                            }
                            .preview-page-sheet {
                                border-radius: 0;
                                box-shadow: none;
                                border: none;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="preview-shell">
                        ${pageMarkup || '<div style="color:#e2e8f0;">Keine Vorschau verfügbar.</div>'}
                    </div>
                </body>
            </html>
        `;
    },

    buildRundownPdfPreviewErrorDocument(message = 'Die Vorschau konnte nicht geladen werden.') {
        const isDarkTheme = document.documentElement.classList.contains('theme-dark')
            || document.documentElement.dataset.theme === 'dark';

        return `
            <!doctype html>
            <html lang="de">
                <head>
                    <meta charset="utf-8">
                    <style>
                        html, body {
                            margin: 0;
                            min-height: 100%;
                            font-family: Inter, Arial, sans-serif;
                            background: ${isDarkTheme ? '#0b1220' : '#f8fafc'};
                            color: ${isDarkTheme ? '#e2e8f0' : '#0f172a'};
                        }
                        body {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 24px;
                            box-sizing: border-box;
                        }
                        .preview-error {
                            max-width: 420px;
                            padding: 22px 24px;
                            border-radius: 20px;
                            border: 1px solid ${isDarkTheme ? 'rgba(148, 163, 184, 0.18)' : 'rgba(203, 213, 225, 0.9)'};
                            background: ${isDarkTheme ? 'rgba(15, 23, 42, 0.82)' : '#ffffff'};
                            text-align: center;
                            line-height: 1.55;
                            box-shadow: ${isDarkTheme ? 'none' : '0 18px 40px rgba(15, 23, 42, 0.08)'};
                        }
                    </style>
                </head>
                <body>
                    <div class="preview-error">${this.escapeHtml(message)}</div>
                </body>
            </html>
        `;
    },

    scheduleRundownPdfPreviewRefresh(delay = 160) {
        if (this.currentRundownPdfPreviewTimer) {
            clearTimeout(this.currentRundownPdfPreviewTimer);
        }

        this.currentRundownPdfPreviewTimer = setTimeout(() => {
            this.currentRundownPdfPreviewTimer = null;
            this.refreshRundownPdfPreview();
        }, Math.max(0, delay));
    },

    setRundownPdfPreviewLoading(isLoading) {
        const loading = document.getElementById('rundownPdfPreviewLoading');
        const downloadBtn = document.getElementById('rundownPdfExportDownload');

        if (loading) {
            loading.hidden = !isLoading;
        }

        if (downloadBtn && isLoading) {
            downloadBtn.disabled = isLoading;
        }
    },

    shouldUseRundownPrintFallback() {
        const ua = navigator.userAgent || '';
        const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua);
        return isSafari;
    },

    async openRundownPdfPrintDialog() {
        const frame = document.getElementById('rundownPdfPreviewFrame');
        const session = this.currentRundownPdfExportSession;
        if (!session) return false;

        const triggerPrint = async (targetFrame) => {
            if (!targetFrame?.contentWindow) return false;
            try {
                targetFrame.contentWindow.focus();
                await new Promise((resolve) => setTimeout(resolve, 80));
                targetFrame.contentWindow.print();
                return true;
            } catch (error) {
                console.warn('[Rundown PDF] Print dialog failed:', error);
                return false;
            }
        };

        if (frame?.contentWindow?.document?.body?.children?.length) {
            return triggerPrint(frame);
        }

        const tempFrame = document.createElement('iframe');
        tempFrame.style.position = 'fixed';
        tempFrame.style.right = '0';
        tempFrame.style.bottom = '0';
        tempFrame.style.width = '1px';
        tempFrame.style.height = '1px';
        tempFrame.style.opacity = '0';
        tempFrame.style.pointerEvents = 'none';
        tempFrame.setAttribute('aria-hidden', 'true');
        document.body.appendChild(tempFrame);

        try {
            await new Promise((resolve) => {
                tempFrame.addEventListener('load', resolve, { once: true });
                tempFrame.srcdoc = this.buildRundownPdfPreviewDocument(session);
            });
            return await triggerPrint(tempFrame);
        } finally {
            setTimeout(() => tempFrame.remove(), 1200);
        }
    },

    async waitForRundownPdfPreviewIdle(maxWaitMs = 15000) {
        const startedAt = Date.now();

        while (this.currentRundownPdfExportSession?.isRendering) {
            if ((Date.now() - startedAt) >= maxWaitMs) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    },

    async refreshRundownPdfPreview(force = false) {
        const session = this.currentRundownPdfExportSession;
        const frame = document.getElementById('rundownPdfPreviewFrame');
        if (!session || !frame || typeof PDFGenerator === 'undefined' || typeof PDFGenerator.buildRundownPDFPages !== 'function') {
            return;
        }

        if (this.currentRundownPdfPreviewTimer) {
            clearTimeout(this.currentRundownPdfPreviewTimer);
            this.currentRundownPdfPreviewTimer = null;
        }

        if (session.isRendering) {
            session.refreshQueued = true;
            return;
        }

        const requestId = ++this.currentRundownPdfPreviewRequestId;
        const resolvedTitle = session.title || session.defaultTitle || 'Ablauf';

        session.isRendering = true;
        session.isDirty = false;
        this.setRundownPdfPreviewLoading(true);
        this.updateRundownPdfExportModalMeta();

        try {
            const previewDocument = this.buildRundownPdfPreviewDocument(session);
            const resolvedFilename = typeof PDFGenerator !== 'undefined' && typeof PDFGenerator.sanitizeFilename === 'function'
                ? PDFGenerator.sanitizeFilename(resolvedTitle, 'ablauf.pdf')
                : `${resolvedTitle || 'ablauf'}.pdf`;

            if (requestId !== this.currentRundownPdfPreviewRequestId || !this.currentRundownPdfExportSession) {
                return;
            }

            await new Promise((resolve) => {
                let finished = false;
                const finish = () => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timeoutId);
                    resolve();
                };
                const timeoutId = setTimeout(finish, 180);
                frame.addEventListener('load', finish, { once: true });
                frame.removeAttribute('src');
                frame.srcdoc = previewDocument;
            });

            this.currentRundownPdfPreview = {
                filename: resolvedFilename,
                ready: true
            };

            const filenameEl = document.getElementById('rundownPdfPreviewFilename');
            if (filenameEl) {
                filenameEl.textContent = resolvedFilename;
            }

            const downloadBtn = document.getElementById('rundownPdfExportDownload');
            if (downloadBtn) {
                downloadBtn.disabled = false;
            }
        } catch (error) {
            console.error('[Rundown PDF] Preview generation failed:', error);
            this.currentRundownPdfPreview = null;
            frame.removeAttribute('src');
            frame.srcdoc = this.buildRundownPdfPreviewErrorDocument('Die Vorschau konnte nicht geladen werden. Du kannst es direkt erneut versuchen oder gleich exportieren.');
            UI.showToast('Die Ablauf-PDF konnte nicht erstellt werden.', 'error');
        } finally {
            const activeSession = this.currentRundownPdfExportSession;
            if (activeSession) {
                activeSession.isRendering = false;
            }
            this.setRundownPdfPreviewLoading(false);

            if (activeSession?.refreshQueued) {
                activeSession.refreshQueued = false;
                this.refreshRundownPdfPreview(true);
            }

            const downloadBtn = document.getElementById('rundownPdfExportDownload');
            if (downloadBtn && !this.currentRundownPdfPreview?.ready) {
                downloadBtn.disabled = true;
            }
        }
    },

    async downloadCurrentRundownPdfPreview() {
        const session = this.currentRundownPdfExportSession;
        if (!session) return;

        if (session.isRendering) {
            await this.waitForRundownPdfPreviewIdle();
        }

        if (session.isDirty || !this.currentRundownPdfPreview?.ready) {
            await this.refreshRundownPdfPreview(true);
            await this.waitForRundownPdfPreviewIdle();
        }

        const downloadBtn = document.getElementById('rundownPdfExportDownload');
        const originalLabel = downloadBtn ? downloadBtn.innerHTML : '';
        const resolvedTitle = session.title || session.defaultTitle || 'Ablauf';

        if (downloadBtn) {
            downloadBtn.disabled = true;
            downloadBtn.textContent = this.shouldUseRundownPrintFallback()
                ? 'Druckdialog wird geöffnet...'
                : 'PDF wird erstellt...';
        }

        if (this.shouldUseRundownPrintFallback()) {
            try {
                const opened = await this.openRundownPdfPrintDialog();
                if (!opened) {
                    UI.showToast('Der Druckdialog konnte nicht geöffnet werden.', 'error');
                }
            } finally {
                if (downloadBtn) {
                    downloadBtn.innerHTML = originalLabel;
                    downloadBtn.disabled = false;
                }
            }
            return;
        }

        try {
            await PDFGenerator.generateRundownPDF({
                title: resolvedTitle,
                subtitle: session.subtitle || '',
                mode: session.mode || 'full-details',
                eventMeta: session.eventMeta || {},
                items: session.items || [],
                songs: session.songs || [],
                fontScale: session.fontScale || 1,
                filename: resolvedTitle,
                previewOnly: false
            });
        } catch (error) {
            console.error('[Rundown PDF] Export failed:', error);
            const fallbackOpened = await this.openRundownPdfPrintDialog();
            if (fallbackOpened) {
                UI.showToast('Direkter PDF-Download war nicht möglich. Der Druckdialog wurde als Fallback geöffnet.', 'warning');
            } else {
                UI.showToast('Die Ablauf-PDF konnte nicht exportiert werden.', 'error');
            }
            return;
        } finally {
            if (downloadBtn) {
                downloadBtn.innerHTML = originalLabel;
                downloadBtn.disabled = false;
            }
        }
    },

    // Band Rider Logic
    getBandRiderStoredMeta(existingRider = null) {
        const membersPayload = existingRider?.members && typeof existingRider.members === 'object'
            ? existingRider.members
            : {};
        const nestedMeta = membersPayload.__settings && typeof membersPayload.__settings === 'object'
            ? membersPayload.__settings
            : {};

        return {
            title: nestedMeta.title || existingRider?.title || '',
            fontScale: Number(nestedMeta.fontScale || existingRider?.fontScale || 1) || 1,
            orientation: nestedMeta.orientation === 'l' ? 'l' : 'p',
            showPositions: nestedMeta.showPositions === true,
            stageRows: Math.min(5, Math.max(1, Number(nestedMeta.stageRows || 2) || 2))
        };
    },

    getBandRiderStoredMemberMap(existingRider = null) {
        const membersPayload = existingRider?.members && typeof existingRider.members === 'object'
            ? existingRider.members
            : {};

        return Object.entries(membersPayload).reduce((accumulator, [key, value]) => {
            if (key === '__settings' || !value || typeof value !== 'object') return accumulator;
            accumulator[key] = value;
            return accumulator;
        }, {});
    },

    getBandRiderDefaultInstrument(profile = null) {
        if (!profile) return '';

        if (typeof Bands !== 'undefined' && typeof Bands.getInstrumentLabels === 'function') {
            const labels = Bands.getInstrumentLabels(profile.instrument || profile.instruments || profile.instrumentType || '');
            if (labels.length > 0) {
                return labels.join(', ');
            }
        }

        return String(profile.instrumentLabel || profile.instrument || '').trim();
    },

    createBandRiderMemberSessionEntry({
        id = '',
        type = 'band',
        name = '',
        instrument = '',
        mic = '',
        monitor = '',
        extra = '',
        showOnStage = false,
        stageRow = 1,
        stageOrder = 1
    } = {}) {
        return {
            id,
            type,
            name: String(name || '').trim() || 'Unbekannt',
            instrument: String(instrument || '').trim(),
            mic: String(mic || '').trim(),
            monitor: String(monitor || '').trim(),
            extra: String(extra || '').trim(),
            showOnStage: showOnStage === true,
            stageRow: Math.max(1, Number(stageRow) || 1),
            stageOrder: Math.max(1, Number(stageOrder) || 1)
        };
    },

    getBandRiderMemberLabel(member = {}) {
        const instrument = String(member.instrument || '').trim();
        const name = String(member.name || '').trim() || 'Unbekannt';
        return instrument ? `${instrument} ${name}` : name;
    },

    getBandRiderSortedStageMembers(rowNumber, session = this.currentBandRiderSession, excludeMemberId = null) {
        if (!session) return [];
        const normalizedRow = Math.max(1, Number(rowNumber) || 1);

        return session.members
            .map((member, index) => ({ member, index }))
            .filter(({ member }) => member.showOnStage === true && member.stageRow === normalizedRow && member.id !== excludeMemberId)
            .sort((a, b) => {
                const orderDelta = (Number(a.member.stageOrder) || 9999) - (Number(b.member.stageOrder) || 9999);
                if (orderDelta !== 0) return orderDelta;
                return a.index - b.index;
            })
            .map(({ member }) => member);
    },

    normalizeBandRiderStageOrder(session = this.currentBandRiderSession) {
        if (!session) return;

        session.members.forEach((member) => {
            member.stageRow = Math.min(Math.max(1, Number(member.stageRow) || 1), Math.max(1, Number(session.stageRows) || 1));
            member.stageOrder = Math.max(1, Number(member.stageOrder) || 1);
        });

        for (let row = 1; row <= Math.max(1, Number(session.stageRows) || 1); row += 1) {
            const rowMembers = this.getBandRiderSortedStageMembers(row, session);
            rowMembers.forEach((member, index) => {
                member.stageOrder = index + 1;
            });
        }
    },

    placeBandRiderMemberOnStage(memberId, targetRow, targetIndex = Number.POSITIVE_INFINITY) {
        const session = this.currentBandRiderSession;
        if (!session || !memberId) return;

        const member = session.members.find((entry) => entry.id === memberId);
        if (!member) return;

        const normalizedRow = Math.min(Math.max(1, Number(targetRow) || 1), Math.max(1, Number(session.stageRows) || 1));
        const rowMembers = this.getBandRiderSortedStageMembers(normalizedRow, session, memberId);
        const insertIndex = Number.isFinite(targetIndex)
            ? Math.max(0, Math.min(rowMembers.length, Number(targetIndex) || 0))
            : rowMembers.length;

        member.showOnStage = true;
        member.stageRow = normalizedRow;

        const reordered = [...rowMembers];
        reordered.splice(insertIndex, 0, member);
        reordered.forEach((entry, index) => {
            entry.stageRow = normalizedRow;
            entry.stageOrder = index + 1;
        });

        this.normalizeBandRiderStageOrder(session);
    },

    buildBandRiderMemberCardMarkup(member, index, session) {
        const initials = (member.name || '?').trim().charAt(0).toUpperCase() || '?';
        const rowCount = Math.max(1, Number(session?.stageRows) || 1);
        const showStageControls = session?.showPositions === true;
        const rowOptions = Array.from({ length: rowCount }, (_, optionIndex) => {
            const rowNumber = rowCount - optionIndex;
            return `<option value="${rowNumber}" ${rowNumber === member.stageRow ? 'selected' : ''}>Reihe ${rowNumber}</option>`;
        }).join('');

        return `
            <div class="bandrider-member-card" data-index="${index}" data-member-id="${this.escapeHtml(member.id)}" data-member-type="${this.escapeHtml(member.type)}">
                <div class="bandrider-member-card-header">
                    <div class="bandrider-member-avatar">${this.escapeHtml(initials)}</div>
                    <div class="bandrider-member-name-wrap">
                        ${member.type === 'extra'
                ? `
                                <div class="bandrider-input-group bandrider-inline-name">
                                    <label>Name</label>
                                    <input type="text" class="rider-member-name" value="${this.escapeHtml(member.name)}" placeholder="z. B. Schlagzeug Silas">
                                </div>
                            `
                : `
                                <div class="bandrider-member-name">${this.escapeHtml(member.name)}</div>
                            `}
                    </div>
                    ${member.type === 'extra'
                ? `
                            <button type="button" class="btn-icon bandrider-remove-member" title="Zusatzmitglied entfernen" aria-label="Zusatzmitglied entfernen">
                                <svg viewBox="0 0 20 20" fill="none">
                                    <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                                </svg>
                            </button>
                        `
                : ''}
                </div>
                <div class="bandrider-member-fields">
                    <div class="bandrider-field-group">
                        <label class="bandrider-field-label">Instrument / Gesang</label>
                        <textarea class="rider-member-instrument bandrider-field-textarea" rows="1" placeholder="z. B. Gesang & Gitarre">${this.escapeHtml(member.instrument)}</textarea>
                    </div>
                    <div class="bandrider-field-group">
                        <label class="bandrider-field-label">XLR / Audio-Eingänge</label>
                        <textarea class="rider-member-mic bandrider-field-textarea" rows="1" placeholder="z. B. SM58 (funk) o. 2x DI">${this.escapeHtml(member.mic)}</textarea>
                    </div>
                    <div class="bandrider-field-group">
                        <label class="bandrider-field-label">Monitoring</label>
                        <textarea class="rider-member-monitor bandrider-field-textarea" rows="1" placeholder="z. B. In-Ear (Stereo) oder Wedge">${this.escapeHtml(member.monitor)}</textarea>
                    </div>
                    <div class="bandrider-field-group">
                        <label class="bandrider-field-label">Zusatz-Infos</label>
                        <textarea class="rider-member-extra bandrider-field-textarea" rows="2" placeholder="z. B. Eigene Backline, Strom oder Funkstrecke">${this.escapeHtml(member.extra)}</textarea>
                    </div>
                    <div class="bandrider-member-stage-settings ${showStageControls ? '' : 'is-hidden'}">
                        <label class="bandrider-toggle-row bandrider-toggle-row-compact">
                            <span class="bandrider-toggle-copy">
                                <span class="bandrider-toggle-title">Position anzeigen</span>
                                <span class="bandrider-toggle-note">Dieses Mitglied auf der Bühnen-Seite platzieren</span>
                            </span>
                            <input type="checkbox" class="rider-member-show-position" ${member.showOnStage ? 'checked' : ''}>
                            <span class="bandrider-toggle-switch" aria-hidden="true"></span>
                        </label>
                        <div class="bandrider-input-group rider-member-row-wrap">
                            <label>Reihe auf Bühne</label>
                            <select class="rider-member-stage-row form-input" ${rowCount <= 1 ? 'disabled' : ''}>
                                ${rowOptions}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderBandRiderStageOrderEditor() {
        const session = this.currentBandRiderSession;
        const container = document.getElementById('bandRiderStageOrderEditor');
        if (!session || !container) return;

        if (session.showPositions !== true) {
            container.classList.add('is-hidden');
            container.innerHTML = '';
            return;
        }

        this.normalizeBandRiderStageOrder(session);

        const rowMarkup = Array.from({ length: Math.max(1, Number(session.stageRows) || 1) }, (_, index) => {
            const rowNumber = Math.max(1, Number(session.stageRows) || 1) - index;
            const members = this.getBandRiderSortedStageMembers(rowNumber, session);
            const rowHint = rowNumber === 1
                ? 'Vorne / FOH-Seite'
                : (rowNumber === session.stageRows ? 'Hinten auf der Bühne' : 'Mittlere Reihe');

            return `
                <section class="bandrider-stage-order-row">
                    <div class="bandrider-stage-order-row-head">
                        <div class="bandrider-stage-order-row-title">Reihe ${rowNumber}</div>
                        <div class="bandrider-stage-order-row-note">${this.escapeHtml(rowHint)}</div>
                    </div>
                    <div class="bandrider-stage-order-dropzone ${members.length === 0 ? 'is-empty' : ''}" data-stage-row="${rowNumber}">
                        ${members.length > 0
                ? members.map((member, memberIndex) => `
                                <div class="bandrider-stage-chip" draggable="true" data-member-id="${this.escapeHtml(member.id)}" data-stage-row="${rowNumber}" title="${this.escapeHtml(this.getBandRiderMemberLabel(member))}">
                                    <span class="bandrider-stage-chip-handle" aria-hidden="true">
                                        <svg viewBox="0 0 16 16" fill="none">
                                            <circle cx="5" cy="4.5" r="1" fill="currentColor"></circle>
                                            <circle cx="5" cy="8" r="1" fill="currentColor"></circle>
                                            <circle cx="5" cy="11.5" r="1" fill="currentColor"></circle>
                                            <circle cx="11" cy="4.5" r="1" fill="currentColor"></circle>
                                            <circle cx="11" cy="8" r="1" fill="currentColor"></circle>
                                            <circle cx="11" cy="11.5" r="1" fill="currentColor"></circle>
                                        </svg>
                                    </span>
                                    <span class="bandrider-stage-chip-copy">
                                        <span class="bandrider-stage-chip-name">${this.escapeHtml(member.name || 'Mitglied')}</span>
                                    </span>
                                </div>
                            `).join('')
                : '<div class="bandrider-stage-order-empty">Noch kein Mitglied in dieser Reihe.</div>'}
                    </div>
                </section>
            `;
        }).join('');

        container.classList.remove('is-hidden');
        container.innerHTML = `
            <div class="bandrider-stage-order-head">
                <span class="bandrider-pdf-section-label">Bühnen Reihenfolge</span>
                <p>Ziehe die Mitglieder innerhalb einer Reihe in die gewünschte Reihenfolge von links nach rechts.</p>
            </div>
            <div class="bandrider-stage-order-list">
                ${rowMarkup}
            </div>
        `;

        container.querySelectorAll('.bandrider-stage-chip').forEach((chip) => {
            chip.addEventListener('dragstart', (event) => {
                this.currentBandRiderDraggedMemberId = chip.dataset.memberId || '';
                chip.classList.add('is-dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', this.currentBandRiderDraggedMemberId);
            });

            chip.addEventListener('dragend', () => {
                this.currentBandRiderDraggedMemberId = null;
                container.querySelectorAll('.is-dragging, .is-drag-over').forEach((element) => {
                    element.classList.remove('is-dragging', 'is-drag-over');
                });
            });

            chip.addEventListener('dragover', (event) => {
                event.preventDefault();
                chip.classList.add('is-drag-over');
            });

            chip.addEventListener('dragleave', () => {
                chip.classList.remove('is-drag-over');
            });

            chip.addEventListener('drop', (event) => {
                event.preventDefault();
                chip.classList.remove('is-drag-over');

                const draggedMemberId = this.currentBandRiderDraggedMemberId || event.dataTransfer.getData('text/plain');
                const targetMemberId = chip.dataset.memberId || '';
                const targetRow = Number(chip.dataset.stageRow) || 1;
                if (!draggedMemberId || !targetMemberId || draggedMemberId === targetMemberId) return;

                const targetMembers = this.getBandRiderSortedStageMembers(targetRow, session, draggedMemberId);
                const targetMemberIndex = targetMembers.findIndex((member) => member.id === targetMemberId);
                const chipBounds = chip.getBoundingClientRect();
                const insertAfter = event.clientX > (chipBounds.left + chipBounds.width / 2);
                const targetIndex = targetMemberIndex < 0 ? targetMembers.length : targetMemberIndex + (insertAfter ? 1 : 0);

                this.placeBandRiderMemberOnStage(draggedMemberId, targetRow, targetIndex);
                this.setBandRiderDirtyState(true);
                this.renderBandRiderMembers();
                this.scheduleBandRiderPreviewRefresh(80);
            });
        });

        container.querySelectorAll('.bandrider-stage-order-dropzone').forEach((dropzone) => {
            dropzone.addEventListener('dragover', (event) => {
                event.preventDefault();
                dropzone.classList.add('is-drag-over');
            });

            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('is-drag-over');
            });

            dropzone.addEventListener('drop', (event) => {
                event.preventDefault();
                dropzone.classList.remove('is-drag-over');

                const draggedMemberId = this.currentBandRiderDraggedMemberId || event.dataTransfer.getData('text/plain');
                const targetRow = Number(dropzone.dataset.stageRow) || 1;
                if (!draggedMemberId) return;

                const chipTarget = event.target.closest('.bandrider-stage-chip');
                if (chipTarget) return;

                this.placeBandRiderMemberOnStage(draggedMemberId, targetRow, Number.POSITIVE_INFINITY);
                this.setBandRiderDirtyState(true);
                this.renderBandRiderMembers();
                this.scheduleBandRiderPreviewRefresh(80);
            });
        });
    },

    renderBandRiderMembers() {
        const session = this.currentBandRiderSession;
        const container = document.getElementById('bandRiderMembersContainer');
        if (!session || !container) return;

        const cardsMarkup = session.members.map((member, index) => this.buildBandRiderMemberCardMarkup(member, index, session)).join('');
        container.innerHTML = `
            ${cardsMarkup}
            <button type="button" class="bandrider-add-member-btn" id="bandRiderAddMemberBtn">
                <span class="bandrider-add-member-icon" aria-hidden="true">+</span>
                <span>Weiteres Mitglied für diesen Export hinzufügen</span>
            </button>
        `;

        container.querySelectorAll('.bandrider-member-card').forEach((card) => {
            const index = Number(card.dataset.index);
            const member = session.members[index];
            if (!member) return;

            card.querySelector('.rider-member-name')?.addEventListener('input', (event) => {
                member.name = event.target.value.trim();
                this.setBandRiderDirtyState(true);
                this.renderBandRiderStageOrderEditor();
                this.scheduleBandRiderPreviewRefresh();
            });

            card.querySelector('.rider-member-instrument')?.addEventListener('input', (event) => {
                member.instrument = event.target.value;
                this.setBandRiderDirtyState(true);
                this.renderBandRiderStageOrderEditor();
                this.scheduleBandRiderPreviewRefresh();
            });

            card.querySelector('.rider-member-mic')?.addEventListener('input', (event) => {
                member.mic = event.target.value;
                this.setBandRiderDirtyState(true);
                this.scheduleBandRiderPreviewRefresh();
            });

            card.querySelector('.rider-member-monitor')?.addEventListener('input', (event) => {
                member.monitor = event.target.value;
                this.setBandRiderDirtyState(true);
                this.scheduleBandRiderPreviewRefresh();
            });

            card.querySelector('.rider-member-extra')?.addEventListener('input', (event) => {
                member.extra = event.target.value;
                this.setBandRiderDirtyState(true);
                this.scheduleBandRiderPreviewRefresh();
            });

            card.querySelector('.rider-member-show-position')?.addEventListener('change', (event) => {
                member.showOnStage = event.target.checked;
                if (member.showOnStage) {
                    this.placeBandRiderMemberOnStage(member.id, member.stageRow, Number.POSITIVE_INFINITY);
                } else {
                    this.normalizeBandRiderStageOrder(session);
                }
                this.setBandRiderDirtyState(true);
                this.renderBandRiderStageOrderEditor();
                this.scheduleBandRiderPreviewRefresh();
            });

            card.querySelector('.rider-member-stage-row')?.addEventListener('change', (event) => {
                member.stageRow = Math.max(1, Number(event.target.value) || 1);
                if (member.showOnStage) {
                    this.placeBandRiderMemberOnStage(member.id, member.stageRow, Number.POSITIVE_INFINITY);
                } else {
                    this.normalizeBandRiderStageOrder(session);
                }
                this.setBandRiderDirtyState(true);
                this.renderBandRiderStageOrderEditor();
                this.scheduleBandRiderPreviewRefresh();
            });

            card.querySelector('.bandrider-remove-member')?.addEventListener('click', () => {
                session.members = session.members.filter((_, memberIndex) => memberIndex !== index);
                this.normalizeBandRiderStageOrder(session);
                this.setBandRiderDirtyState(true);
                this.renderBandRiderMembers();
                this.scheduleBandRiderPreviewRefresh();
            });
        });

        container.querySelector('#bandRiderAddMemberBtn')?.addEventListener('click', () => {
            const uniqueId = typeof Storage !== 'undefined' && typeof Storage.generateId === 'function'
                ? Storage.generateId()
                : `extra-${Date.now()}`;

            session.members.push(this.createBandRiderMemberSessionEntry({
                id: `extra-${uniqueId}`,
                type: 'extra',
                name: 'Zusatzmitglied',
                stageRow: 1,
                stageOrder: this.getBandRiderSortedStageMembers(1, session).length + 1
            }));
            this.setBandRiderDirtyState(true);
            this.renderBandRiderMembers();
            this.scheduleBandRiderPreviewRefresh();
        });

        this.renderBandRiderStageOrderEditor();
    },

    syncBandRiderStageControls() {
        const session = this.currentBandRiderSession;
        const rowsGroup = document.getElementById('bandRiderStageRowsGroup');
        if (!session) return;

        if (rowsGroup) {
            rowsGroup.classList.toggle('is-hidden', session.showPositions !== true);
        }

        session.members.forEach((member) => {
            if (member.stageRow > session.stageRows) {
                member.stageRow = session.stageRows;
            }
            if (member.stageRow < 1) {
                member.stageRow = 1;
            }
        });

        this.normalizeBandRiderStageOrder(session);
        this.renderBandRiderMembers();
    },

    buildBandRiderStoragePayload() {
        const session = this.currentBandRiderSession;
        if (!session) return {};

        const payload = {
            __settings: {
                title: session.title,
                fontScale: session.fontScale,
                orientation: session.orientation,
                showPositions: session.showPositions === true,
                stageRows: session.stageRows
            }
        };

        session.members.forEach((member) => {
            payload[member.id] = {
                type: member.type,
                name: member.name,
                instrument: member.instrument,
                mic: member.mic,
                monitor: member.monitor,
                extra: member.extra,
                showOnStage: member.showOnStage === true,
                stageRow: Math.max(1, Number(member.stageRow) || 1),
                stageOrder: Math.max(1, Number(member.stageOrder) || 1)
            };
        });

        return payload;
    },

    async showBandRiderExportModal(bandId) {
        if (!bandId) return;

        try {
            const [band, bandMembers, existingRider] = await Promise.all([
                Storage.getBand(bandId),
                Storage.getBandMembers(bandId),
                Storage.getBandRider(bandId)
            ]);

            if (!band) throw new Error('Band nicht gefunden');

            const memberProfiles = await Promise.all(
                (Array.isArray(bandMembers) ? bandMembers : []).map(async (membership) => {
                    try {
                        const profile = await Storage.getById('users', membership.userId);
                        return { membership, profile };
                    } catch (error) {
                        console.warn('[Band Rider] Mitglied konnte nicht geladen werden:', error);
                        return { membership, profile: null };
                    }
                })
            );

            const storedMemberMap = this.getBandRiderStoredMemberMap(existingRider);
            const storedMeta = this.getBandRiderStoredMeta(existingRider);
            const knownMemberIds = new Set();

            const members = memberProfiles.map(({ membership, profile }) => {
                const memberId = String(membership.userId || membership.id || '');
                knownMemberIds.add(memberId);

                const fallbackName = band.members_data?.[memberId]?.name
                    || profile?.username
                    || profile?.email?.split('@')[0]
                    || 'Unbekannt';
                const resolvedName = (profile && typeof UI !== 'undefined' && typeof UI.getUserDisplayName === 'function'
                    ? UI.getUserDisplayName(profile)
                    : fallbackName) || fallbackName;
                const stored = storedMemberMap[memberId] || {};

                return this.createBandRiderMemberSessionEntry({
                    id: memberId,
                    type: 'band',
                    name: resolvedName === 'Unbekannt' ? fallbackName : resolvedName,
                    instrument: stored.instrument || this.getBandRiderDefaultInstrument(profile),
                    mic: stored.mic || '',
                    monitor: stored.monitor || '',
                    extra: stored.extra || '',
                    showOnStage: stored.showOnStage === true,
                    stageRow: stored.stageRow || 1,
                    stageOrder: stored.stageOrder || 1
                });
            });

            Object.entries(storedMemberMap).forEach(([memberId, stored]) => {
                if (knownMemberIds.has(memberId)) return;
                if (stored?.type !== 'extra') return;

                members.push(this.createBandRiderMemberSessionEntry({
                    id: memberId,
                    type: 'extra',
                    name: stored.name || 'Zusatzmitglied',
                    instrument: stored.instrument || '',
                    mic: stored.mic || '',
                    monitor: stored.monitor || '',
                    extra: stored.extra || '',
                    showOnStage: stored.showOnStage === true,
                    stageRow: stored.stageRow || 1,
                    stageOrder: stored.stageOrder || 1
                }));
            });

            this.currentBandRiderSession = {
                bandId,
                bandName: band.name,
                title: storedMeta.title || `Rider ${band.name}`,
                fontScale: storedMeta.fontScale || 1,
                orientation: storedMeta.orientation || 'p',
                showPositions: storedMeta.showPositions === true,
                stageRows: storedMeta.stageRows || 2,
                members,
                isRendering: false,
                isDirty: false
            };

            this.normalizeBandRiderStageOrder(this.currentBandRiderSession);

            const nameInput = document.getElementById('bandRiderPdfFileName');
            const scaleInput = document.getElementById('bandRiderPdfFontScale');
            const scaleValue = document.getElementById('bandRiderPdfFontScaleValue');
            const orientationInput = document.getElementById('bandRiderPdfOrientation');
            const positionsInput = document.getElementById('bandRiderShowPositions');
            const rowsInput = document.getElementById('bandRiderStageRows');

            if (nameInput) nameInput.value = this.currentBandRiderSession.title;
            if (scaleInput) scaleInput.value = String(Math.round(this.currentBandRiderSession.fontScale * 100));
            if (scaleValue) scaleValue.textContent = `${Math.round(this.currentBandRiderSession.fontScale * 100)}%`;
            if (orientationInput) orientationInput.value = this.currentBandRiderSession.orientation;
            if (positionsInput) positionsInput.checked = this.currentBandRiderSession.showPositions === true;
            if (rowsInput) rowsInput.value = String(this.currentBandRiderSession.stageRows);

            this.setBandRiderDirtyState(false);
            this.bindBandRiderModal();
            this.syncBandRiderStageControls();
            UI.openModal('bandRiderModal');
            await this.refreshBandRiderPreview(true);
        } catch (error) {
            console.error('[Band Rider] Failed to show modal:', error);
            UI.showToast('Fehler beim Laden des Riders.', 'error');
        }
    },

    bindBandRiderModal() {
        const modal = document.getElementById('bandRiderModal');
        if (!modal || modal.dataset.bound === 'true') return;

        const nameInput = document.getElementById('bandRiderPdfFileName');
        const scaleInput = document.getElementById('bandRiderPdfFontScale');
        const orientationInput = document.getElementById('bandRiderPdfOrientation');
        const positionsInput = document.getElementById('bandRiderShowPositions');
        const rowsInput = document.getElementById('bandRiderStageRows');
        const saveBtn = document.getElementById('bandRiderSave');
        const exportBtn = document.getElementById('bandRiderExportPdf');
        const cancelBtn = document.getElementById('bandRiderCancel');

        if (cancelBtn) {
            cancelBtn.dataset.modalClose = 'true';
        }

        UI.guardModalClose('bandRiderModal', 'isBandRiderDirty');

        nameInput?.addEventListener('input', () => {
            if (!this.currentBandRiderSession) return;
            this.currentBandRiderSession.title = nameInput.value.trim();
            this.setBandRiderDirtyState(true);
            this.scheduleBandRiderPreviewRefresh();
        });

        scaleInput?.addEventListener('input', () => {
            if (!this.currentBandRiderSession) return;
            const scale = (parseInt(scaleInput.value, 10) || 100) / 100;
            this.currentBandRiderSession.fontScale = scale;
            const scaleValue = document.getElementById('bandRiderPdfFontScaleValue');
            if (scaleValue) {
                scaleValue.textContent = `${scaleInput.value}%`;
            }
            this.setBandRiderDirtyState(true);
            this.scheduleBandRiderPreviewRefresh();
        });

        orientationInput?.addEventListener('change', () => {
            if (!this.currentBandRiderSession) return;
            this.currentBandRiderSession.orientation = orientationInput.value === 'l' ? 'l' : 'p';
            this.setBandRiderDirtyState(true);
            this.scheduleBandRiderPreviewRefresh(80);
        });

        positionsInput?.addEventListener('change', () => {
            if (!this.currentBandRiderSession) return;
            this.currentBandRiderSession.showPositions = positionsInput.checked;
            this.setBandRiderDirtyState(true);
            this.syncBandRiderStageControls();
            this.scheduleBandRiderPreviewRefresh(80);
        });

        rowsInput?.addEventListener('change', () => {
            if (!this.currentBandRiderSession) return;
            this.currentBandRiderSession.stageRows = Math.min(5, Math.max(1, Number(rowsInput.value) || 1));
            this.setBandRiderDirtyState(true);
            this.syncBandRiderStageControls();
            this.scheduleBandRiderPreviewRefresh(80);
        });

        saveBtn?.addEventListener('click', () => this.saveBandRider());
        exportBtn?.addEventListener('click', () => this.exportBandRiderPDF());
        window.addEventListener('resize', () => this.applyBandRiderPreviewScaling());

        modal.dataset.bound = 'true';
    },

    scheduleBandRiderPreviewRefresh(delay = 220) {
        if (this.currentBandRiderPreviewTimer) {
            clearTimeout(this.currentBandRiderPreviewTimer);
        }

        this.currentBandRiderPreviewTimer = setTimeout(() => {
            this.currentBandRiderPreviewTimer = null;
            this.refreshBandRiderPreview();
        }, delay);
    },

    setBandRiderDirtyState(isDirty = false) {
        window.isBandRiderDirty = isDirty === true;
        if (this.currentBandRiderSession) {
            this.currentBandRiderSession.isDirty = window.isBandRiderDirty;
        }
    },

    applyBandRiderPreviewScaling() {
        const stage = document.querySelector('.bandrider-pdf-preview-stage');
        const paper = document.querySelector('.bandrider-pdf-preview-paper');
        const frame = document.getElementById('bandRiderPreviewFrame');
        if (!stage || !paper || !frame) return;

        const rawWidth = Number(paper.dataset.rawWidth || 0);
        const rawHeight = Number(paper.dataset.rawHeight || 0);
        if (!rawWidth || !rawHeight) return;

        const availableWidth = Math.max(stage.clientWidth - 24, 320);
        const scale = Math.min(1, availableWidth / rawWidth);
        const scaledWidth = Math.round(rawWidth * scale);
        const scaledHeight = Math.round(rawHeight * scale);

        paper.style.width = `${scaledWidth}px`;
        paper.style.height = `${scaledHeight}px`;
        frame.style.width = `${rawWidth}px`;
        frame.style.height = `${rawHeight}px`;
        frame.style.transform = `scale(${scale})`;
        frame.style.transformOrigin = 'top left';
    },

    buildBandRiderPreviewDocument(session, pages = []) {
        const isDarkTheme = document.documentElement.classList.contains('theme-dark')
            || document.documentElement.dataset.theme === 'dark';
        const safePages = Array.isArray(pages) ? pages : [];
        const gap = 28;
        const pageMarkup = safePages.map((page) => `
            <div style="
                width:${page.previewWidth}px;
                min-height:${page.previewHeight}px;
                margin:0 auto ${gap}px;
                background:#ffffff;
                border-radius:0;
                overflow:hidden;
                box-shadow:0 28px 60px rgba(0,0,0,0.28);
            ">
                ${page.markup}
            </div>
        `).join('');

        const totalHeight = safePages.reduce((sum, page, index) => sum + page.previewHeight + (index < safePages.length - 1 ? gap : 0), 60);
        const maxWidth = safePages.reduce((max, page) => Math.max(max, page.previewWidth), 794);

        return {
            maxWidth,
            totalHeight,
            html: `
                <!doctype html>
                <html>
                    <head>
                        <style>
                            html, body {
                                margin: 0;
                                padding: 0;
                                overflow: hidden;
                                background: ${isDarkTheme ? '#0b1220' : '#eef2f7'};
                                font-family: 'Inter', Arial, sans-serif;
                            }
                            body {
                                padding: 24px 0 36px;
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                box-sizing: border-box;
                            }
                            * { box-sizing: border-box; }
                        </style>
                    </head>
                    <body>
                        ${pageMarkup}
                    </body>
                </html>
            `
        };
    },

    async refreshBandRiderPreview(force = false) {
        const session = this.currentBandRiderSession;
        const frame = document.getElementById('bandRiderPreviewFrame');
        const paper = document.querySelector('.bandrider-pdf-preview-paper');
        const loading = document.getElementById('bandRiderPreviewLoading');

        if (!session || !frame || !paper) return;
        if (session.isRendering && !force) return;

        session.isRendering = true;
        if (loading) loading.hidden = false;

        const requestId = ++this.currentBandRiderPreviewRequestId;

        try {
            const pages = PDFGenerator.buildBandRiderPDFPages({
                bandName: session.bandName,
                title: session.title,
                members: session.members,
                fontScale: session.fontScale,
                orientation: session.orientation,
                showPositions: session.showPositions,
                stageRows: session.stageRows
            });

            const previewDocument = this.buildBandRiderPreviewDocument(session, pages);

            if (requestId !== this.currentBandRiderPreviewRequestId) return;

            frame.srcdoc = previewDocument.html;
            paper.dataset.rawWidth = String(previewDocument.maxWidth);
            paper.dataset.rawHeight = String(previewDocument.totalHeight);

            await new Promise((resolve) => {
                let finished = false;
                const finish = () => {
                    if (finished) return;
                    finished = true;
                    resolve();
                };
                const timeoutId = setTimeout(finish, 180);
                frame.addEventListener('load', () => {
                    clearTimeout(timeoutId);
                    finish();
                }, { once: true });
            });

            this.applyBandRiderPreviewScaling();
        } catch (error) {
            console.error('[Band Rider] Preview failed:', error);
        } finally {
            session.isRendering = false;
            if (loading) loading.hidden = true;
        }
    },

    async saveBandRider() {
        const session = this.currentBandRiderSession;
        if (!session) return;

        try {
            await Storage.createOrUpdateBandRider(session.bandId, {
                members: this.buildBandRiderStoragePayload()
            });
            UI.showToast('Rider erfolgreich gespeichert.', 'success');
            this.setBandRiderDirtyState(false);
        } catch (err) {
            console.error('[Band Rider] Save failed:', err);
            UI.showToast('Fehler beim Speichern.', 'error');
        }
    },

    async exportBandRiderPDF() {
        const session = this.currentBandRiderSession;
        if (!session) return;

        const btn = document.getElementById('bandRiderExportPdf');
        const originalText = btn?.innerHTML || 'PDF exportieren';

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> PDF wird erstellt...';
            }

            await PDFGenerator.generateBandRiderPDF({
                bandName: session.bandName,
                title: session.title,
                members: session.members,
                fontScale: session.fontScale,
                filename: session.title,
                orientation: session.orientation,
                showPositions: session.showPositions,
                stageRows: session.stageRows
            });

            UI.showToast('PDF-Export erfolgreich.', 'success');
        } catch (err) {
            console.error('[Band Rider] Export failed:', err);
            UI.showToast('PDF-Export fehlgeschlagen.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    },

    async openRundownPdfExportModal(payload = null) {
        if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
            UI.showToast('Kein Ablauf für den PDF-Export vorhanden.', 'warning');
            return;
        }

        this.bindRundownPdfExportModal();
        this.bindBandRiderModal();
        this.cleanupRundownPdfExportPreview();

        this.currentRundownPdfExportSession = {
            ...payload,
            defaultTitle: payload.title || 'Ablauf',
            title: payload.title || 'Ablauf',
            mode: 'full-details',
            fontScale: 0.9,
            isDirty: true,
            isRendering: false,
            refreshQueued: false
        };

        const nameInput = document.getElementById('rundownPdfFileName');
        const fontScaleInput = document.getElementById('rundownPdfFontScale');
        if (nameInput) {
            nameInput.value = this.currentRundownPdfExportSession.title;
        }

        if (fontScaleInput) {
            fontScaleInput.value = '100';
        }

        document.querySelectorAll('#rundownPdfExportModal input[name="rundownPdfMode"]').forEach((input) => {
            input.checked = input.value === 'full-details';
        });

        this.updateRundownPdfExportModalMeta();
        UI.openModal('rundownPdfExportModal');
        this.refreshRundownPdfPreview(true);
    },

    async openDraftEventRundownPdfExport() {
        const payload = await this.buildDraftRundownPdfExportPayload();
        if (!payload) {
            UI.showToast('Bitte lege zuerst einen Ablauf an.', 'warning');
            return;
        }

        await this.openRundownPdfExportModal(payload);
    },

    async openStoredEventRundownPdfExport(eventId) {
        const payload = await this.buildStoredEventRundownPdfExportPayload(eventId);
        if (!payload) {
            UI.showToast('Für diesen Termin ist kein Ablauf hinterlegt.', 'warning');
            return;
        }

        await this.openRundownPdfExportModal(payload);
    },

    showPDFPreview(pdfData) {
        const iframe = document.getElementById('pdfPreviewFrame');
        const titleEl = document.getElementById('pdfPreviewTitle');
        const downloadBtn = document.getElementById('pdfPreviewDownload');
        if (!iframe) return;

        this.cleanupPDFPreview(); // Ensure previous is cleaned up
        this.currentPDFData = pdfData;

        // Add PDF view parameters for better fitting (Fit to page)
        const viewParams = '#view=Fit';
        iframe.src = pdfData.blobUrl + viewParams;

        if (titleEl) {
            titleEl.textContent = String(pdfData?.title || 'PDF Vorschau');
        }

        if (downloadBtn && pdfData?.blobUrl) {
            downloadBtn.href = pdfData.blobUrl;
            downloadBtn.setAttribute('download', pdfData.filename || 'export.pdf');
        }

        UI.openModal('pdfPreviewModal');
    },

    renderSongpoolDocumentBadges(song) {
        if (!song) return '';

        const badges = [];
        const chordProText = typeof Storage !== 'undefined' && typeof Storage.getSongChordPro === 'function'
            ? Storage.getSongChordPro(song)
            : '';

        if (song.pdf_url) {
            badges.push('<span class="songpool-document-badge">PDF</span>');
        }

        if (chordProText) {
            badges.push('<span class="songpool-document-badge is-chordpro">ChordPro</span>');
        }

        return badges.join('');
    },

    renderSongDocumentPreviewButtons(song) {
        if (!song) return '-';

        const buttons = [];
        const safeSongId = this.escapeHtml(song.id || '');
        const safeTitle = this.escapeHtml(song.title || 'Song');
        const chordProText = typeof Storage !== 'undefined' && typeof Storage.getSongChordPro === 'function'
            ? Storage.getSongChordPro(song)
            : '';

        if (song.pdf_url) {
            buttons.push(`
                <button
                    type="button"
                    class="btn-icon open-song-preview-pdf"
                    data-url="${this.escapeHtml(song.pdf_url)}"
                    data-title="${safeTitle}"
                    title="PDF öffnen"
                    aria-label="PDF öffnen"
                >${this.getRundownInlineIcon('pdf')}</button>
            `);
        }

        if (chordProText) {
            buttons.push(`
                <button
                    type="button"
                    class="btn-icon open-song-preview-chordpro"
                    data-song-id="${safeSongId}"
                    data-title="${safeTitle}"
                    title="ChordPro Vorschau öffnen"
                    aria-label="ChordPro Vorschau öffnen"
                >${this.getRundownInlineIcon('chordpro')}</button>
            `);
        }

        if (!buttons.length) {
            return '-';
        }

        return `<div class="song-document-actions">${buttons.join('')}</div>`;
    },

    attachSongDocumentPreviewHandlers(container, songLookup = new Map()) {
        if (!container) return;

        container.querySelectorAll('.open-song-preview-pdf').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const url = button.dataset.url;
                if (!url) return;
                this.openPdfPreview(url, button.dataset.title || 'PDF Vorschau');
            });
        });

        container.querySelectorAll('.open-song-preview-chordpro').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                const songId = String(button.dataset.songId || '');
                const song = songLookup instanceof Map ? songLookup.get(songId) : null;
                const chordProText = song && typeof Storage !== 'undefined' && typeof Storage.getSongChordPro === 'function'
                    ? Storage.getSongChordPro(song)
                    : '';

                if (!chordProText) {
                    UI.showToast('Für diesen Song ist keine ChordPro-Vorschau hinterlegt.', 'info');
                    return;
                }

                this.openChordProPreview(chordProText, song?.title || button.dataset.title || 'ChordPro Vorschau');
            });
        });
    },

    getSongDocumentDownloadBaseName(song = null) {
        const title = String(song?.title || 'song').trim() || 'song';
        const artist = String(song?.artist || '').trim();
        return `${title}${artist ? ` - ${artist}` : ''}`
            .replace(/[\/\\?%*:|"<>]/g, '-')
            .replace(/\s{2,}/g, ' ')
            .trim();
    },

    normalizeTextForSearch(value = '') {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ß/g, 'ss')
            .toLowerCase()
            .trim();
    },

    getUniqueDocumentFilename(filename = 'datei', usedNames = new Set()) {
        const safeName = String(filename || 'datei').trim() || 'datei';
        const extensionMatch = safeName.match(/(\.[^.]+)$/);
        const extension = extensionMatch ? extensionMatch[1] : '';
        const basename = extension ? safeName.slice(0, -extension.length) : safeName;

        let candidate = safeName;
        let suffix = 2;

        while (usedNames.has(candidate.toLowerCase())) {
            candidate = `${basename} (${suffix})${extension}`;
            suffix += 1;
        }

        usedNames.add(candidate.toLowerCase());
        return candidate;
    },

    async triggerFileDownloadFromBlob(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
    },

    async collectSongAttachedDocuments(song, usedNames = new Set()) {
        if (!song) {
            return { files: [], skippedCount: 0, errorCount: 0 };
        }

        const files = [];
        let skippedCount = 0;
        let errorCount = 0;
        const baseName = this.getSongDocumentDownloadBaseName(song);

        if (song.pdf_url) {
            try {
                const response = await fetch(song.pdf_url);
                if (!response.ok) {
                    throw new Error(`PDF konnte nicht geladen werden (${response.status})`);
                }
                const pdfBlob = await response.blob();
                files.push({
                    filename: this.getUniqueDocumentFilename(`${baseName}.pdf`, usedNames),
                    blob: pdfBlob
                });
            } catch (error) {
                console.error('[Songpool] PDF download failed:', error);
                errorCount++;
            }
        }

        const chordProText = typeof Storage !== 'undefined' && typeof Storage.getSongChordPro === 'function'
            ? Storage.getSongChordPro(song)
            : '';

        if (chordProText) {
            try {
                const chordProBlob = new Blob([chordProText], { type: 'text/plain;charset=utf-8' });
                files.push({
                    filename: this.getUniqueDocumentFilename(`${baseName}.chopro`, usedNames),
                    blob: chordProBlob
                });
            } catch (error) {
                console.error('[Songpool] ChordPro download failed:', error);
                errorCount++;
            }
        }

        if (!song.pdf_url && !chordProText) {
            skippedCount++;
        }

        return { files, skippedCount, errorCount };
    },

    getZipDosTimestamp(date = new Date()) {
        const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
        const year = Math.max(1980, safeDate.getFullYear());
        const month = safeDate.getMonth() + 1;
        const day = safeDate.getDate();
        const hours = safeDate.getHours();
        const minutes = safeDate.getMinutes();
        const seconds = Math.floor(safeDate.getSeconds() / 2);

        return {
            time: (hours << 11) | (minutes << 5) | seconds,
            date: ((year - 1980) << 9) | (month << 5) | day
        };
    },

    getZipCRC32Table() {
        if (this.zipCRC32Table) {
            return this.zipCRC32Table;
        }

        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index++) {
            let crc = index;
            for (let bit = 0; bit < 8; bit++) {
                crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
            }
            table[index] = crc >>> 0;
        }

        this.zipCRC32Table = table;
        return table;
    },

    calculateCRC32(bytes) {
        const table = this.getZipCRC32Table();
        let crc = 0xFFFFFFFF;

        for (let index = 0; index < bytes.length; index++) {
            crc = table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
        }

        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    async createZipBlobFromFiles(files = []) {
        const normalizedFiles = Array.isArray(files) ? files.filter((file) => file?.blob && file?.filename) : [];
        if (!normalizedFiles.length) {
            return null;
        }

        const encoder = new TextEncoder();
        const zipParts = [];
        const centralDirectoryParts = [];
        let offset = 0;
        const timestamp = this.getZipDosTimestamp(new Date());

        for (const file of normalizedFiles) {
            const filenameBytes = encoder.encode(String(file.filename));
            const dataBytes = new Uint8Array(await file.blob.arrayBuffer());
            const crc32 = this.calculateCRC32(dataBytes);

            const localHeader = new Uint8Array(30 + filenameBytes.length);
            const localView = new DataView(localHeader.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, timestamp.time, true);
            localView.setUint16(12, timestamp.date, true);
            localView.setUint32(14, crc32, true);
            localView.setUint32(18, dataBytes.length, true);
            localView.setUint32(22, dataBytes.length, true);
            localView.setUint16(26, filenameBytes.length, true);
            localView.setUint16(28, 0, true);
            localHeader.set(filenameBytes, 30);

            const centralHeader = new Uint8Array(46 + filenameBytes.length);
            const centralView = new DataView(centralHeader.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, timestamp.time, true);
            centralView.setUint16(14, timestamp.date, true);
            centralView.setUint32(16, crc32, true);
            centralView.setUint32(20, dataBytes.length, true);
            centralView.setUint32(24, dataBytes.length, true);
            centralView.setUint16(28, filenameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, offset, true);
            centralHeader.set(filenameBytes, 46);

            zipParts.push(localHeader, dataBytes);
            centralDirectoryParts.push(centralHeader);
            offset += localHeader.length + dataBytes.length;
        }

        const centralDirectorySize = centralDirectoryParts.reduce((sum, part) => sum + part.length, 0);
        const endOfCentralDirectory = new Uint8Array(22);
        const eocdView = new DataView(endOfCentralDirectory.buffer);
        eocdView.setUint32(0, 0x06054b50, true);
        eocdView.setUint16(4, 0, true);
        eocdView.setUint16(6, 0, true);
        eocdView.setUint16(8, normalizedFiles.length, true);
        eocdView.setUint16(10, normalizedFiles.length, true);
        eocdView.setUint32(12, centralDirectorySize, true);
        eocdView.setUint32(16, offset, true);
        eocdView.setUint16(20, 0, true);

        return new Blob([...zipParts, ...centralDirectoryParts, endOfCentralDirectory], { type: 'application/zip' });
    },

    async downloadSongDocumentsBatch(songs = []) {
        const queue = Array.isArray(songs) ? songs.filter(Boolean) : [];
        if (!queue.length) {
            UI.showToast('Bitte wähle mindestens einen Song aus.', 'info');
            return;
        }

        let downloadedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const collectedFiles = [];
        const usedNames = new Set();

        UI.showLoading(`Dateien werden heruntergeladen (0/${queue.length})...`);

        for (let index = 0; index < queue.length; index++) {
            const song = queue[index];
            UI.showLoading(`Dateien werden heruntergeladen (${index + 1}/${queue.length})...`);
            const result = await this.collectSongAttachedDocuments(song, usedNames);
            collectedFiles.push(...result.files);
            downloadedCount += result.files.length;
            skippedCount += result.skippedCount;
            errorCount += result.errorCount;
        }

        if (collectedFiles.length === 1) {
            await this.triggerFileDownloadFromBlob(collectedFiles[0].blob, collectedFiles[0].filename);
        } else if (collectedFiles.length > 1) {
            UI.showLoading('Downloadpaket wird erstellt...');
            const archiveBlob = await this.createZipBlobFromFiles(collectedFiles);
            const archiveName = `Songpool-Auswahl ${new Date().toISOString().slice(0, 10)}.zip`;
            await this.triggerFileDownloadFromBlob(archiveBlob, archiveName);
        }

        UI.hideLoading();

        if (downloadedCount > 0 && skippedCount === 0 && errorCount === 0) {
            UI.showToast(
                collectedFiles.length > 1
                    ? `${downloadedCount} Datei${downloadedCount === 1 ? '' : 'en'} als ZIP heruntergeladen`
                    : `${downloadedCount} Datei${downloadedCount === 1 ? '' : 'en'} heruntergeladen`,
                'success'
            );
            return;
        }

        if (downloadedCount > 0 || skippedCount > 0 || errorCount > 0) {
            const parts = [];
            if (downloadedCount > 0) {
                parts.push(
                    collectedFiles.length > 1
                        ? `${downloadedCount} im ZIP`
                        : `${downloadedCount} heruntergeladen`
                );
            }
            if (skippedCount > 0) parts.push(`${skippedCount} ohne Anhang`);
            if (errorCount > 0) parts.push(`${errorCount} fehlgeschlagen`);
            UI.showToast(`Download abgeschlossen: ${parts.join(', ')}`, errorCount > 0 ? 'warning' : 'success');
            return;
        }

        UI.showToast('Für die Auswahl konnten keine Dateien heruntergeladen werden.', 'info');
    },

    async deleteSongpoolSongsWithProgress(songs = []) {
        const queue = [...new Map(
            (Array.isArray(songs) ? songs : [])
                .filter(Boolean)
                .map((song) => [String(song.id || '').trim(), song])
        ).values()].filter((song) => song?.id);

        if (!queue.length) {
            return {
                deletedCount: 0,
                missingCount: 0
            };
        }

        const updateProgress = (progress = {}) => {
            if (progress.phase === 'cleanup') {
                const total = Math.max(Number(progress.total) || 0, 1);
                const current = Math.min(Number(progress.current) || 0, total);
                UI.showLoading(`Anhänge werden bereinigt (${current}/${total})...`, 0, { timeoutMs: 0 });
                return;
            }

            const total = Math.max(Number(progress.total) || queue.length, queue.length);
            const current = Math.min(Number(progress.current) || 0, total);
            UI.showLoading(`Songs werden gelöscht (${current}/${total})...`, 0, { timeoutMs: 0 });
        };

        updateProgress({
            phase: 'delete',
            current: 0,
            total: queue.length
        });

        try {
            return await Storage.deleteSongpoolSongs(queue.map((song) => song.id), {
                onProgress: updateProgress
            });
        } finally {
            UI.hideLoading();
        }
    },

    setupInstrumentSelector(containerId, inputId, initialValue = "") {
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        const isSettingsSelector = !!container?.closest('#settingsModal');

        if (!container || !input) {
            console.warn(`Instrument selector not found: ${containerId} or ${inputId}`);
            return;
        }

        // Instrument Options Map
        const instrumentOptions = [
            { value: 'Vocals', label: 'Gesang' },
            { value: 'Guitar', label: 'Gitarre' },
            { value: 'Bass', label: 'Bass' },
            { value: 'Drums', label: 'Drums' },
            { value: 'Keys', label: 'Keys / Piano' },
            { value: 'Brass', label: 'Bläser' },
            { value: 'Strings', label: 'Streicher' }
        ];

        const instrumentValueMap = instrumentOptions.reduce((map, option) => {
            map[option.value.toLowerCase()] = option.value;
            map[option.label.toLowerCase()] = option.value;
            return map;
        }, {
            vocals: 'Vocals',
            gesang: 'Vocals',
            guitar: 'Guitar',
            gitarre: 'Guitar',
            bass: 'Bass',
            drums: 'Drums',
            schlagzeug: 'Drums',
            keys: 'Keys',
            piano: 'Keys',
            'keys / piano': 'Keys',
            'keys/piano': 'Keys',
            bläser: 'Brass',
            blaeser: 'Brass',
            brass: 'Brass',
            streicher: 'Strings',
            strings: 'Strings'
        });

        const toCanonicalInstrumentValue = (value) => {
            const normalizedValue = String(value || '').trim();
            if (!normalizedValue) return '';
            return instrumentValueMap[normalizedValue.toLowerCase()] || normalizedValue;
        };

        const normalizeInstrumentValues = (values) => {
            const seen = new Set();
            return values.map(toCanonicalInstrumentValue).filter(value => {
                const canonicalValue = String(value || '').trim();
                if (!canonicalValue) return false;
                const key = canonicalValue.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).map(value => String(value).trim());
        };

        const parseInstrumentValue = (value) => {
            if (!value) return [];

            if (Array.isArray(value)) {
                return normalizeInstrumentValues(value);
            }

            const rawValue = String(value).trim();
            if (!rawValue) return [];

            if (rawValue.startsWith('[')) {
                try {
                    const parsedValue = JSON.parse(rawValue);
                    if (Array.isArray(parsedValue)) {
                        return normalizeInstrumentValues(parsedValue);
                    }
                } catch (error) {
                    console.warn('Instrument values could not be parsed as JSON, fallback to CSV parsing.', error);
                }
            }

            return normalizeInstrumentValues(rawValue.split(','));
        };

        // Parse initial value
        let selectedValues = parseInstrumentValue(initialValue);
        input.value = selectedValues.join(',');

        // 1. Build UI Structure
        container.classList.add('custom-multiselect');
        container.innerHTML = `
            <div class="multiselect-trigger" tabindex="0">
                <div class="multiselect-badges"></div>
                <div class="multiselect-arrow">▼</div>
            </div>
            <div class="multiselect-menu">
                ${instrumentOptions.map(opt => `
                    <label class="multiselect-option">
                        <input type="checkbox" value="${opt.value}">
                        <span class="multiselect-option-indicator" aria-hidden="true"></span>
                        <span class="multiselect-option-label">${opt.label}</span>
                    </label>
                `).join('')}
            </div>
        `;

        const trigger = container.querySelector('.multiselect-trigger');
        const badgesContainer = container.querySelector('.multiselect-badges');
        const menu = container.querySelector('.multiselect-menu');
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');

        const getScrollBoundary = (element) => {
            let current = element.parentElement;

            while (current && current !== document.body) {
                const style = window.getComputedStyle(current);
                const overflowY = style.overflowY;
                const isScrollable = /(auto|scroll|overlay)/.test(overflowY) && current.scrollHeight > current.clientHeight + 2;

                if (isScrollable) {
                    return current;
                }

                current = current.parentElement;
            }

            return null;
        };

        const settingsLayerTargets = isSettingsSelector
            ? [
                container,
                container.closest('.form-group'),
                container.closest('.profile-section'),
                container.closest('.profile-main-column'),
                container.closest('.profile-settings-grid'),
                container.closest('.settings-tab-content'),
                container.closest('.settings-shell'),
                container.closest('.settings-modal-body')
            ].filter(Boolean)
            : [];

        const toggleSettingsMenuLayers = (isActive) => {
            if (!isSettingsSelector) return;
            settingsLayerTargets.forEach(element => {
                element.classList.toggle('multiselect-host-active', isActive);
            });
        };

        const resetMenuPlacement = () => {
            menu.style.removeProperty('left');
            menu.style.removeProperty('width');
            menu.style.removeProperty('top');
            menu.style.removeProperty('bottom');
            menu.style.removeProperty('max-height');
            menu.style.removeProperty('position');
        };

        const updateMenuPlacement = () => {
            if (!menu.classList.contains('show')) return;

            menu.classList.remove('show-upward');

            const triggerRect = trigger.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const boundary = getScrollBoundary(trigger);
            const boundaryRect = boundary
                ? boundary.getBoundingClientRect()
                : { top: 0, bottom: viewportHeight };
            const estimatedMenuHeight = Math.min(menu.scrollHeight || 0, 320);
            const safetyOffset = 16;
            const spaceBelow = Math.max(0, boundaryRect.bottom - triggerRect.bottom - safetyOffset);
            const spaceAbove = Math.max(0, triggerRect.top - boundaryRect.top - safetyOffset);
            const shouldOpenUpward = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
            const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow;
            const maxHeight = Math.max(180, Math.min(320, availableSpace));

            const isAuthSelector = !!container.closest('.auth-white-card') || !!container.closest('.landing-auth-overlay');

            if (isSettingsSelector || isAuthSelector) {
                menu.style.position = 'absolute';
                menu.style.left = '0';
                menu.style.width = '100%';
                menu.style.maxHeight = `${maxHeight}px`;

                if (shouldOpenUpward) {
                    menu.classList.add('show-upward');
                    menu.style.top = 'auto';
                    menu.style.bottom = 'calc(100% + 8px)';
                } else {
                    menu.style.top = 'calc(100% + 8px)';
                    menu.style.bottom = 'auto';
                }
                return;
            }

            menu.style.position = 'fixed';
            menu.style.left = `${Math.max(12, triggerRect.left)}px`;
            menu.style.width = `${Math.max(220, triggerRect.width)}px`;

            if (shouldOpenUpward) {
                menu.classList.add('show-upward');
                menu.style.top = 'auto';
                menu.style.bottom = `${Math.max(12, viewportHeight - triggerRect.top + 8)}px`;
            } else {
                menu.style.top = `${Math.max(12, triggerRect.bottom + 8)}px`;
                menu.style.bottom = 'auto';
            }

            menu.style.maxHeight = `${maxHeight}px`;
        };

        // Function to update visuals based on selectedValues
        const updateVisuals = () => {
            // Update Badges
            badgesContainer.innerHTML = '';
            if (selectedValues.length === 0) {
                badgesContainer.innerHTML = '<span class="multiselect-placeholder">Instrumente wählen...</span>';
            } else {
                selectedValues.forEach(val => {
                    const opt = instrumentOptions.find(o => o.value === val);
                    if (opt) {
                        const badge = document.createElement('span');
                        badge.className = 'multiselect-badge';
                        badge.textContent = opt.label;
                        badgesContainer.appendChild(badge);
                    }
                });
            }

            // Update Checkboxes
            checkboxes.forEach(cb => {
                cb.checked = selectedValues.includes(cb.value);
            });

            // Update Input
            selectedValues = normalizeInstrumentValues(selectedValues);
            input.value = selectedValues.join(',');
        };

        // Initial Update
        updateVisuals();

        // 2. Event Listeners

        // Toggle Menu
        trigger.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent bubbling to document click
            const isOpen = menu.classList.contains('show');

            // Close all other multiselects first (if any)
            document.querySelectorAll('.multiselect-menu.show').forEach(m => {
                if (m !== menu) {
                    m.classList.remove('show');
                    m.classList.remove('show-upward');
                    m.closest('.custom-multiselect')?.querySelector('.multiselect-trigger')?.classList.remove('active');
                    m.closest('.custom-multiselect')?.classList.remove('is-open');
                    m.closest('#settingsModal')?.querySelectorAll('.multiselect-host-active').forEach(element => {
                        element.classList.remove('multiselect-host-active');
                    });
                }
            });

            if (isOpen) {
                menu.classList.remove('show');
                menu.classList.remove('show-upward');
                resetMenuPlacement();
                trigger.classList.remove('active');
                container.classList.remove('is-open');
                toggleSettingsMenuLayers(false);
            } else {
                menu.classList.add('show');
                trigger.classList.add('active');
                container.classList.add('is-open');
                toggleSettingsMenuLayers(true);
                requestAnimationFrame(updateMenuPlacement);
            }
        });

        // Checkbox Changes
        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const val = e.target.value;
                if (e.target.checked) {
                    if (!selectedValues.includes(val)) selectedValues.push(val);
                } else {
                    selectedValues = selectedValues.filter(v => v !== val);
                }
                selectedValues = normalizeInstrumentValues(selectedValues);
                updateVisuals();
            });
            // Stop propagation on label click so it doesn't close menu if logic overlaps
            cb.closest('label').addEventListener('click', (e) => e.stopPropagation());
        });


        // Close on Click Outside works via global listener usually, but we can add one locally or rely on global approach.
        // Let's add a document listener (careful with duplication if function called multiple times, but OK for now as elements are replaced)
        // Better: Named function for removal
        const closeMenu = (e) => {
            if (!container.contains(e.target)) {
                menu.classList.remove('show');
                menu.classList.remove('show-upward');
                resetMenuPlacement();
                trigger.classList.remove('active');
                container.classList.remove('is-open');
                toggleSettingsMenuLayers(false);
            }
        };

        // Remove old listener if re-initializing on same container?
        // We cleared innerHTML so listeners on elements are gone, but document listener persists.
        // Actually, we can attach to document once or handle it here.
        // For simplicity, let's attach to document and rely on garbage collection if container is removed? No, that leaks.
        // Let's attach to the trigger's `blur` or focusout? No, simpler click.
        document.addEventListener('click', closeMenu);
        window.addEventListener('resize', updateMenuPlacement);
        window.addEventListener('scroll', updateMenuPlacement, true);

        // Cleanup function (optional but good practice)
        // If we re-run setup, we might pile up listeners.
        // For now, this simple implementation assumes the page doesn't re-render this component constantly without full refresh,
        // EXCEPT for settings modal which might open/close.
        // To avoid leaks: store cleanup on the container
        if (container._cleanup) container._cleanup();
        container._cleanup = () => {
            toggleSettingsMenuLayers(false);
            document.removeEventListener('click', closeMenu);
            window.removeEventListener('resize', updateMenuPlacement);
            window.removeEventListener('scroll', updateMenuPlacement, true);
        };
    },

    async init() {
        if (this.isInitializing) {
            console.log('[App.init] Initialization already in progress, skipping duplicate.');
            return;
        }

        const startTime = performance.now();
        this.isInitializing = true;
        console.log('[App.init] Boot sequence started...');

        if (this.redirectPasswordRecoveryToResetPage()) {
            this.isInitializing = false;
            return;
        }

        // Implement unsaved changes check
        window.isProfileDirty = false;
        if (typeof UI !== 'undefined' && !UI._originalCloseModal) {
            UI._originalCloseModal = UI.closeModal;
            UI.closeModal = (modalId) => {
                // Profiles and Absences guards
                if (modalId === 'settingsModal' && (window.isProfileDirty || window.isAbsenceFormDirty)) {
                    const dirtyType = window.isAbsenceFormDirty ? 'Abwesenheit' : 'Profil';
                    UI.showConfirm(
                        'Deine Eingaben werden nicht gespeichert. Möchtest du trotzdem schließen?',
                        () => {
                            window.isProfileDirty = false;
                            window.isAbsenceFormDirty = false;

                            // Reset absence form
                            this.resetAbsenceFormSettings();

                            // Reset profile drafts if needed
                            this.resetProfileImageDraftState({
                                resetInput: true,
                                root: document.querySelector('#settingsModal .modal-body') || document
                            });

                            UI._originalCloseModal.call(UI, modalId);
                        },
                        null,
                        {
                            kicker: dirtyType,
                            title: 'Ungespeicherte Änderungen',
                            confirmText: 'Trotzdem schließen',
                            confirmClass: 'btn-danger',
                            cancelText: 'Weiter bearbeiten'
                        }
                    );
                    return;
                }

                if (modalId === 'settingsModal') {
                    this.resetProfileImageDraftState({
                        resetInput: true,
                        root: document.querySelector('#settingsModal .modal-body') || document
                    });
                }
                if (modalId === 'pdfPreviewModal') {
                    this.cleanupPDFPreview();
                }
                if (modalId === 'rundownPdfExportModal') {
                    this.cleanupRundownPdfExportPreview();
                }
                if (modalId === 'chordproPreviewModal') {
                    this.cleanupChordProPreview();
                }
                UI._originalCloseModal.call(UI, modalId);
            };
        }

        // Setup dirty tracking for profile form
        const profileForm = document.getElementById('updateProfileForm');
        if (profileForm) {
            profileForm.addEventListener('input', () => {
                const settingsModal = document.getElementById('settingsModal');
                if (settingsModal && settingsModal.classList.contains('active')) {
                    window.isProfileDirty = true;
                }
            });
        }

        this.initializeThemeSystem();
        this.setupStatePersistence();

        // UI Prep
        this.setupDashboardFeatures();
        this.setupMobileSubmenuToggle();
        this.setupSidebarToggle();
        this.setupSidebarNav();
        this.setupFeedbackModal();

        if (typeof ChordProConverter !== 'undefined') {
            ChordProConverter.init();
        }

        // Sequential initialization with progress logging
        try {
            console.log('[App.init] Step 1: Recovering session...');
            await Auth.init();

            // Give the browser a chance to respond to loader/events
            await new Promise(resolve => setTimeout(resolve, 0));

            const authCheckTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`[App.init] Auth state determined at ${authCheckTime}s. Authenticated: ${Auth.isAuthenticated()}`);

            if (Auth.isAuthenticated()) {
                console.log('[App.init] Step 2: Displaying main application...');
                await this.showApp();

                const appShowTime = ((performance.now() - startTime) / 1000).toFixed(2);
                console.log(`[App.init] Application rendered at ${appShowTime}s.`);

                // Background tasks (non-blocking)
                setTimeout(async () => {
                    console.log('[App.init] Background: Starting maintenance tasks...');
                    try {
                        // Initialize header submenu for default view on mobile only
                        if (window.innerWidth <= 768) {
                            this.updateHeaderSubmenu('dashboard');
                        }

                        await this.updateAbsenceIndicator();
                        await this.preloadStandardCalendars();
                        Storage.cleanupPastItems(); // already parallelized internally now

                        const totalLoadTime = ((performance.now() - startTime) / 1000).toFixed(2);
                        console.log(`[App.init] All background tasks initiated. Total lifecycle: ${totalLoadTime}s.`);
                    } catch (bgErr) {
                        console.warn('[App.init] Background task encountered an issue:', bgErr);
                    }
                }, 1000);

            } else {
                console.log('[App.init] Not authenticated. Showing auth/landing UI.');
                this.showAuth();
            }

            // Setup listeners only once
            this.setupEventListeners();

        } catch (error) {
            console.error('[App.init] CRITICAL: Device boot sequence failed:', error);
            if (Auth.isAuthenticated()) {
                UI.showToast('Fehler beim Initialisieren der App.', 'error');
            }
        } finally {
            this.isInitializing = false;
            // init draft song list for new events
            this.draftEventSongIds = [];
            this.draftEventSongOverrides = {};
            this.draftEventRundown = this.normalizeEventRundownData();
            this.draftEventSongBlockTargetId = null;
            this.lastSongModalContext = null;
        }
    },

    async preloadStandardCalendars() {
        // Pre-load Tonstudio, JMS Festhalle, and Ankersaal calendars
        if (typeof Calendar !== 'undefined' && Calendar.ensureLocationCalendar) {
            const standardCalendars = [
                { id: 'tonstudio', name: 'Tonstudio' },
                { id: 'jms-festhalle', name: 'JMS Festhalle' },
                { id: 'ankersaal', name: 'Ankersaal' }
            ];

            const promises = standardCalendars.map(cal =>
                Calendar.ensureLocationCalendar(cal.id, cal.name)
                    .catch(err => console.error(`[App] Kalender konnte nicht geladen werden: ${cal.name}`, err))
            );

            return Promise.all(promises);
        }
        return Promise.resolve();
    },

    // Update absence indicator in header
    async updateAbsenceIndicator() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        try {
            const absences = await Storage.getUserAbsences(user.id);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Find active absence
            const activeAbsence = absences?.find(abs => {
                const start = new Date(abs.startDate);
                const end = new Date(abs.endDate);
                start.setHours(0, 0, 0, 0);
                end.setHours(0, 0, 0, 0);
                return today >= start && today <= end;
            });

            const indicator = document.getElementById('absenceIndicator');
            const endDateSpan = document.getElementById('absenceEndDate');

            if (activeAbsence && indicator && endDateSpan) {
                const endDate = new Date(activeAbsence.endDate);
                endDateSpan.textContent = endDate.toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                indicator.style.display = 'flex';
            } else if (indicator) {
                indicator.style.display = 'none';
            }
        } catch (error) {
            Logger.error('Error updating absence indicator', error);
        }
    },

    setupAuthFormEventListeners() {
        const authOverlay = document.getElementById('authOverlay');
        if (!authOverlay || authOverlay.dataset.authBindingsInitialized === 'true') {
            return;
        }

        authOverlay.dataset.authBindingsInitialized = 'true';

        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                UI.switchAuthTab(tabName);
                if (tabName !== 'login') {
                    this.clearAuthStatusNotice();
                }
            });
        });

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const rememberMe = document.getElementById('loginRememberMe')?.checked;
                await this.handleLogin(undefined, undefined, rememberMe);
            });
        }

        const forgotForm = document.getElementById('forgotPasswordForm');
        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const emailInput = document.getElementById('forgotPasswordEmail');
                const email = emailInput?.value.trim();
                const submitBtn = forgotForm.querySelector('button[type="submit"]');

                if (!email) return;

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Wird gesendet...';
                }

                try {
                    await Auth.requestPasswordReset(email);
                    UI.showToast('Reset-Link wurde an deine E-Mail gesendet!', 'success');

                    setTimeout(() => {
                        UI.switchAuthTab('login');
                        if (emailInput) emailInput.value = '';
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Link anfordern';
                        }
                    }, 3000);
                } catch (err) {
                    console.error('Password reset request failed:', err);
                    UI.showToast('Fehler: ' + (err.message || 'Anfrage fehlgeschlagen'), 'error');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Link anfordern';
                    }
                }
            });
        }

        const registerFirstNameInput = document.getElementById('registerFirstName');
        const registerLastNameInput = document.getElementById('registerLastName');
        const regUserInput = document.getElementById('registerUsername');
        const usernameFeedback = document.getElementById('usernameFeedback');
        const registerSubmitBtn = document.querySelector('#registerForm button[type="submit"]');
        let usernameValidationTimeout = null;
        let autoUsernameTimeout = null;
        let usernameAvailabilityRequestId = 0;
        let autoUsernameRequestId = 0;
        let isUpdatingUsernameProgrammatically = false;

        const setUsernameFeedback = (message = '', state = 'idle') => {
            if (!usernameFeedback || !regUserInput) return;

            usernameFeedback.textContent = message;

            if (!message) {
                usernameFeedback.style.color = '';
                regUserInput.style.borderColor = '';
                return;
            }

            if (state === 'error') {
                usernameFeedback.style.color = '#ef4444';
                regUserInput.style.borderColor = '#ef4444';
                return;
            }

            if (state === 'success') {
                usernameFeedback.style.color = '#4ade80';
                regUserInput.style.borderColor = '#4ade80';
                return;
            }

            if (state === 'info') {
                usernameFeedback.style.color = '#93c5fd';
                regUserInput.style.borderColor = '#6366f1';
                return;
            }

            usernameFeedback.style.color = '#fbbf24';
            regUserInput.style.borderColor = '#fbbf24';
        };

        const normalizeUsernamePart = (value = '') => {
            return value
                .trim()
                .toLowerCase()
                .replace(/ä/g, 'ae')
                .replace(/ö/g, 'oe')
                .replace(/ü/g, 'ue')
                .replace(/ß/g, 'ss')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '');
        };

        const buildSuggestedUsernameBase = () => {
            const firstName = normalizeUsernamePart(registerFirstNameInput?.value || '');
            const lastName = normalizeUsernamePart(registerLastNameInput?.value || '');

            if (!firstName || !lastName) return '';

            return `${firstName}${lastName}`;
        };

        const findAvailableUsernameCandidate = async (baseUsername) => {
            const safeBase = normalizeUsernamePart(baseUsername);
            if (!safeBase) return { username: '', adjusted: false };

            for (let index = 0; index < 50; index++) {
                const candidate = index === 0 ? safeBase : `${safeBase}${index + 1}`;
                const existingUser = await Storage.getUserByUsername(candidate);
                if (!existingUser) {
                    return { username: candidate, adjusted: index > 0 };
                }
            }

            return {
                username: `${safeBase}${Date.now().toString().slice(-4)}`,
                adjusted: true
            };
        };

        const validateRegisterUsername = ({ isAutoSuggested = false, wasAdjusted = false } = {}) => {
            if (!regUserInput) return;

            clearTimeout(usernameValidationTimeout);
            const username = regUserInput.value.trim();

            if (!username) {
                setUsernameFeedback('', 'idle');
                if (registerSubmitBtn) registerSubmitBtn.disabled = false;
                return;
            }

            if (username.length < 5) {
                setUsernameFeedback('Benutzername muss mindestens 5 Zeichen lang sein.', 'error');
                if (registerSubmitBtn) registerSubmitBtn.disabled = true;
                return;
            }

            const requestId = ++usernameAvailabilityRequestId;
            setUsernameFeedback(
                isAutoSuggested ? 'Prüfe den automatisch vorgeschlagenen Benutzernamen...' : 'Verfügbarkeit wird geprüft...',
                'checking'
            );

            usernameValidationTimeout = setTimeout(async () => {
                try {
                    const existingUser = await Storage.getUserByUsername(username);
                    if (requestId !== usernameAvailabilityRequestId) return;

                    if (existingUser) {
                        setUsernameFeedback('Dieser Benutzername ist bereits vergeben.', 'error');
                        if (registerSubmitBtn) registerSubmitBtn.disabled = true;
                        return;
                    }

                    if (isAutoSuggested) {
                        const successMessage = wasAdjusted
                            ? `Benutzername automatisch angepasst: ${username}`
                            : `Benutzername automatisch vorgeschlagen: ${username}`;
                        setUsernameFeedback(successMessage, 'success');
                    } else {
                        setUsernameFeedback('Benutzername verfügbar.', 'success');
                    }

                    if (registerSubmitBtn) registerSubmitBtn.disabled = false;
                } catch (error) {
                    console.error('Error checking username:', error);
                    setUsernameFeedback('Benutzername konnte gerade nicht geprüft werden.', 'info');
                    if (registerSubmitBtn) registerSubmitBtn.disabled = false;
                }
            }, 320);
        };

        const scheduleAutoUsernameSuggestion = () => {
            if (!registerFirstNameInput || !registerLastNameInput || !regUserInput) return;
            if (regUserInput.dataset.userEdited === 'true') return;

            clearTimeout(autoUsernameTimeout);
            const firstName = registerFirstNameInput.value.trim();
            const lastName = registerLastNameInput.value.trim();
            if (!firstName || !lastName) return;

            autoUsernameTimeout = setTimeout(async () => {
                const baseUsername = buildSuggestedUsernameBase();
                if (!baseUsername) return;

                const requestId = ++autoUsernameRequestId;
                setUsernameFeedback('Erstelle Benutzervorschlag...', 'info');
                if (registerSubmitBtn) registerSubmitBtn.disabled = true;

                try {
                    const { username, adjusted } = await findAvailableUsernameCandidate(baseUsername);
                    if (requestId !== autoUsernameRequestId || !username) return;

                    isUpdatingUsernameProgrammatically = true;
                    regUserInput.value = username;
                    regUserInput.dataset.lastAutoUsername = username;
                    regUserInput.dataset.userEdited = 'false';
                    isUpdatingUsernameProgrammatically = false;

                    validateRegisterUsername({
                        isAutoSuggested: true,
                        wasAdjusted: adjusted
                    });
                } catch (error) {
                    console.error('Error generating username suggestion:', error);
                    setUsernameFeedback('Benutzervorschlag konnte nicht erstellt werden.', 'info');
                    if (registerSubmitBtn) registerSubmitBtn.disabled = false;
                }
            }, 260);
        };

        if (registerFirstNameInput) {
            registerFirstNameInput.addEventListener('input', () => {
                if (regUserInput) {
                    regUserInput.dataset.userEdited = 'false';
                }
                scheduleAutoUsernameSuggestion();
            });
        }

        if (registerLastNameInput) {
            registerLastNameInput.addEventListener('input', () => {
                if (regUserInput) {
                    regUserInput.dataset.userEdited = 'false';
                }
                scheduleAutoUsernameSuggestion();
            });
        }

        if (regUserInput) {
            regUserInput.dataset.userEdited = 'false';
            regUserInput.dataset.lastAutoUsername = '';

            regUserInput.addEventListener('input', () => {
                if (isUpdatingUsernameProgrammatically) return;

                const currentValue = regUserInput.value.trim();
                const lastAutoUsername = regUserInput.dataset.lastAutoUsername || '';

                if (!currentValue) {
                    regUserInput.dataset.userEdited = 'true';
                    setUsernameFeedback('', 'idle');
                    if (registerSubmitBtn) registerSubmitBtn.disabled = false;
                    return;
                }

                regUserInput.dataset.userEdited = currentValue !== lastAutoUsername ? 'true' : 'false';
                validateRegisterUsername();
            });
        }

        const registerPasswordInput = document.getElementById('registerPassword');
        const registerPasswordConfirmInput = document.getElementById('registerPasswordConfirm');
        const registerPasswordHint = document.getElementById('registerPasswordHint');
        const registerPasswordConfirmHint = document.getElementById('registerPasswordConfirmHint');
        const updateRegisterPasswordHints = () => {
            if (registerPasswordInput && registerPasswordHint) {
                const password = registerPasswordInput.value;
                registerPasswordHint.classList.remove('is-warning', 'is-success');

                if (!password) {
                    registerPasswordHint.textContent = 'Mindestens 6 Zeichen erforderlich';
                } else if (password.length < 6) {
                    registerPasswordHint.textContent = 'Passwort muss mindestens 6 Zeichen haben';
                    registerPasswordHint.classList.add('is-warning');
                } else {
                    registerPasswordHint.textContent = '✓ Länge ok';
                    registerPasswordHint.classList.add('is-success');
                }
            }

            if (registerPasswordConfirmInput && registerPasswordConfirmHint && registerPasswordInput) {
                const password = registerPasswordInput.value;
                const passwordConfirm = registerPasswordConfirmInput.value;
                registerPasswordConfirmHint.classList.remove('is-warning', 'is-success');

                if (!password && !passwordConfirm) {
                    registerPasswordConfirmHint.textContent = 'Passwörter müssen übereinstimmen';
                } else if (!passwordConfirm) {
                    registerPasswordConfirmHint.textContent = 'Bitte bestätige dein Passwort';
                } else if (password === passwordConfirm) {
                    registerPasswordConfirmHint.textContent = '✓ Passwörter stimmen überein';
                    registerPasswordConfirmHint.classList.add('is-success');
                } else {
                    registerPasswordConfirmHint.textContent = 'Passwörter stimmen nicht überein';
                    registerPasswordConfirmHint.classList.add('is-warning');
                }
            }
        };

        if (registerPasswordInput) {
            registerPasswordInput.addEventListener('input', updateRegisterPasswordHints);
        }

        if (registerPasswordConfirmInput) {
            registerPasswordConfirmInput.addEventListener('input', updateRegisterPasswordHints);
        }

        updateRegisterPasswordHints();

        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const password = document.getElementById('registerPassword').value;
                if (password.length < 6) {
                    UI.showToast('Passwort muss mindestens 6 Zeichen lang sein', 'error');
                    return;
                }

                await this.handleRegister();
            });
        }
    },

    setupEventListeners() {
        // Song form submit handler: ensure only one handler is registered
        const songForm = document.getElementById('songForm');
        if (songForm) {
            // Remove all previous submit event listeners by replacing the node
            const newSongForm = songForm.cloneNode(true);
            songForm.parentNode.replaceChild(newSongForm, songForm);
            let songFormSubmitting = false;
            newSongForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (songFormSubmitting) return;
                songFormSubmitting = true;
                try {
                    await App.handleSaveSong();
                } finally {
                    songFormSubmitting = false;
                }
            });

            const songTitleInput = newSongForm.querySelector('#songTitle');
            const songAutofillResults = newSongForm.querySelector('#songAutofillResults');

            if (songTitleInput) {
                songTitleInput.addEventListener('input', () => {
                    App.scheduleSongAutofillSearch();
                    App.syncInferredSongLanguage();
                });
            }

            const songLanguageInput = newSongForm.querySelector('#songLanguage');
            if (songLanguageInput) {
                songLanguageInput.addEventListener('input', () => {
                    const currentValue = String(songLanguageInput.value || '').trim();
                    if (!currentValue) {
                        App.songLanguageAutoValue = '';
                        return;
                    }
                    if (currentValue !== App.songLanguageAutoValue) {
                        App.songLanguageAutoValue = '';
                    }
                });
            }

            if (songAutofillResults) {
                songAutofillResults.addEventListener('click', (event) => {
                    const option = event.target.closest('[data-song-autofill-index]');
                    if (!option) return;
                    App.applySongAutofillCandidate(option.dataset.songAutofillIndex);
                });
            }

            if (!this.songAutofillOutsideClickBound) {
                document.addEventListener('mousedown', (event) => {
                    const autofillGroup = document.querySelector('#songModal.active .song-editor-autofill-group');
                    if (!autofillGroup || autofillGroup.contains(event.target)) return;
                    App.clearSongAutofillResults();
                });
                this.songAutofillOutsideClickBound = true;
            }
        }

        // Zeige Planungs-Buttons nur für Bands, bei denen der Nutzer Leiter oder Co-Leiter ist
        this.updatePlanningCreationButtons().catch(error => {
            Logger.error('Error updating planning creation buttons', error);
        });
        // Ensure 'Auftritte' and 'Planung' main navigation tabs are always visible (desktop & mobile)
        document.querySelectorAll('.nav-item[data-view="events"], .nav-item[data-view="rehearsals"]').forEach(item => {
            item.style.display = '';
        });
        // Also ensure mobile tabs are always visible
        document.querySelectorAll('.nav-subitem[data-view="events"], .nav-subitem[data-view="rehearsals"], .nav-subitem[data-view="probeorte"], .nav-subitem[data-view="kalender"]').forEach(item => {
            item.style.display = '';
        });
        // Landing Hero Interactivity
        const heroArea = document.getElementById('heroArea');
        if (heroArea) {
            heroArea.addEventListener('mousemove', (e) => {
                const rect = heroArea.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                heroArea.style.setProperty('--mouse-x', `${x}%`);
                heroArea.style.setProperty('--mouse-y', `${y}%`);
            });
        }


        // Donate button is configured dynamically based on admin settings
        this.updateDonateButton().catch(err => {
            console.warn('[setupEventListeners] Donate button could not be initialized:', err);
        });
        // Band löschen Button
        // (Removed duplicate deleteBandBtn handler; handled below with Bands.currentBandId)
        // Show/hide extra event fields in modal
        const extrasCheckbox = document.getElementById('eventShowExtras');
        const extrasFields = document.getElementById('eventExtrasFields');
        const guestsCheckbox = document.getElementById('eventShowGuests');
        const guestsField = document.getElementById('eventGuestsField');
        if (extrasCheckbox && extrasFields) {
            extrasCheckbox.addEventListener('change', function () {
                extrasFields.style.display = this.checked ? '' : 'none';
            });
        }
        if (guestsCheckbox && guestsField) {
            guestsCheckbox.addEventListener('change', function () {
                guestsField.style.display = this.checked ? '' : 'none';
            });
        }
        // When opening the modal, reset extras and guest fields visibility
        const createEventModal = document.getElementById('createEventModal');
        if (createEventModal) {
            createEventModal.addEventListener('show', function () {
                if (extrasCheckbox && extrasFields) {
                    extrasFields.style.display = extrasCheckbox.checked ? '' : 'none';
                }
                if (guestsCheckbox && guestsField) {
                    guestsField.style.display = guestsCheckbox.checked ? '' : 'none';
                }
            });
        }
        // Account löschen Button
        const deleteAccountBtn = document.getElementById('deleteAccountBtn');
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => {
                UI.openModal('deleteAccountModal');
            });
        }

        // Modal: Abbrechen
        const cancelDeleteAccountBtn = document.getElementById('cancelDeleteAccountBtn');
        if (cancelDeleteAccountBtn) {
            cancelDeleteAccountBtn.addEventListener('click', () => {
                UI.closeModal('deleteAccountModal');
            });
        }

        // Modal: Bestätigen
        const confirmDeleteAccountBtn = document.getElementById('confirmDeleteAccountBtn');
        if (confirmDeleteAccountBtn) {
            confirmDeleteAccountBtn.addEventListener('click', async () => {
                await App.handleDeleteAccount();
            });
        }

        // Profile image click handlers - open preview modal
        const setupProfileImageClick = () => {
            // Header profile image
            const headerProfileImg = document.getElementById('headerProfileImage');
            if (headerProfileImg) {
                headerProfileImg.style.cursor = 'pointer';
                headerProfileImg.addEventListener('click', () => {
                    const user = Auth.getCurrentUser();
                    if (user && user.profile_image_url) {
                        App.openProfileImagePreview(user.profile_image_url);
                    }
                });
            }

            // Settings profile image
            const observer = new MutationObserver(() => {
                const settingsProfileImg = document.querySelector('#profileImageSettingsContainer img, #profileImageSettingsContainer span');
                if (settingsProfileImg && !settingsProfileImg.dataset.clickHandlerAdded) {
                    settingsProfileImg.style.cursor = 'pointer';
                    settingsProfileImg.dataset.clickHandlerAdded = 'true';
                    settingsProfileImg.addEventListener('click', () => {
                        const user = Auth.getCurrentUser();
                        const previewUrl = App.getProfileImageDisplayUrl(user);
                        if (previewUrl) {
                            App.openProfileImagePreview(previewUrl);
                        }
                    });
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        };
        setupProfileImageClick();

        this.setupAuthFormEventListeners();

        // Listen for password recovery event
        window.addEventListener('auth:password_recovery', () => {
            // GHOST EVENT PROTECTION:
            // If the main app is already visible, it means we have already logged in normally.
            // Supabase sometimes fires 'PASSWORD_RECOVERY' as a ghost event on every reload
            // if the session was originally recovery-based.
            const mainApp = document.getElementById('mainApp');
            const isAppVisible = mainApp && (mainApp.style.display === 'block' || mainApp.classList.contains('active'));

            if (isAppVisible && !this.isPasswordRecoveryMode) {
                console.log('[Recovery] Suppressing ghost recovery modal - app is already active');
                return;
            }

            // Robustness: Only show if we explicitly detected recovery state or have a token
            if (!this.isPasswordRecoveryMode && !(window.location.hash && window.location.hash.includes('recovery'))) {
                console.log('[Recovery] Suppressing recovery modal - no active token found');
                return;
            }

            console.log('Opening reset password modal (Recovery Mode)');
            this.isPasswordRecoveryMode = true;

            // Hide main app completely
            const app = document.getElementById('mainApp');
            if (app) {
                app.style.display = 'none';
                app.classList.remove('active');
            }

            // Ensure landing page is visible but hide its normal content
            const landing = document.getElementById('landingPage');
            if (landing) {
                landing.classList.add('active');
                landing.style.display = 'block';

                // Hide Hero and Auth Container standard elements
                const hero = document.getElementById('heroArea');
                if (hero) hero.style.display = 'none';

                const authTabs = document.querySelector('.auth-tabs');
                if (authTabs) authTabs.style.display = 'none';

                // Hide all auth forms
                document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');

                // Ensure auth container is visible (parent of modal)
                const authContainer = document.querySelector('.auth-container');
                if (authContainer) {
                    authContainer.style.display = 'block';
                    // Force the card to be visible for the modal context
                    const authCard = document.querySelector('.auth-white-card');
                    if (authCard) authCard.style.display = 'block';
                }
            }

            // Close other modals if any
            document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));

            // Open reset modal
            const modal = document.getElementById('resetPasswordModal');
            if (modal) {
                UI.openModal('resetPasswordModal');
            }
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            Logger.userAction('Button', 'logoutBtn', 'Click', { action: 'Logout from Header' });
            this.handleLogout();
        });




        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const modal = btn.closest('.modal');
                if (modal) {
                    UI.closeModal(modal.id);
                }
            });
        });

        // Create band button (using event delegation since button is in settings modal)
        document.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'createBandBtn') {
                UI.openModal('createBandModal');
            }
        });

        // Create band form
        const createBandForm = document.getElementById('createBandForm');
        if (createBandForm) {
            createBandForm.onsubmit = (e) => {
                e.preventDefault();
                this.handleCreateBand();
            };
        }

        // Edit band form
        const editBandForm = document.getElementById('editBandForm');
        if (editBandForm) {
            editBandForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleEditBand();
            });
        }

        // Add member button
        document.getElementById('addMemberBtn').addEventListener('click', () => {
            Logger.userAction('Button', 'addMemberBtn', 'Click', { action: 'Open Add Member Modal' });
            UI.openModal('addMemberModal');
        });

        // Band Rider button
        const bandRiderBtn = document.getElementById('bandRiderBtn');
        if (bandRiderBtn) {
            bandRiderBtn.addEventListener('click', () => {
                const bandId = Bands.currentBandId;
                if (bandId) {
                    this.showBandRiderExportModal(bandId);
                } else {
                    UI.showToast('Fehler: Keine Band ausgewählt.', 'error');
                }
            });
        }

        // Add member form
        document.getElementById('addMemberForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddMember();
        });

        // Delete band button
        document.getElementById('deleteBandBtn').addEventListener('click', async () => {
            Logger.userAction('Button', 'deleteBandBtn', 'Click', { bandId: Bands.currentBandId });
            if (Bands.currentBandId) {
                await Bands.deleteBand(Bands.currentBandId);
            }
        });


        // Show 'Probetermine hinzufügen' button only if user is in at least one band
        const createRehearsalBtn = document.getElementById('createRehearsalBtn');
        if (createRehearsalBtn) {
            this.updatePlanningCreationButtons().catch(error => {
                Logger.error('Error updating planning creation buttons', error);
            });
            createRehearsalBtn.addEventListener('click', async () => {
                Logger.userAction('Button', 'createRehearsalBtn', 'Click', { action: 'Open New Rehearsal Modal' });
                const planningBands = await this.getPlanningManagerBands();

                // Reset form for new rehearsal
                document.getElementById('rehearsalModalTitle').textContent = 'Neuen Probetermin erstellen';
                document.getElementById('saveRehearsalBtn').textContent = 'Probetermin erstellen';
                document.getElementById('editRehearsalId').value = '';
                UI.clearForm('createRehearsalForm');
                if (typeof Rehearsals !== 'undefined') {
                    Rehearsals.originalRehearsal = null;
                }

                // Warn on unsaved changes
                window._rehearsalFormDirty = false;
                UI.guardModalClose('createRehearsalModal', '_rehearsalFormDirty');
                const rehearsalForm = document.getElementById('createRehearsalForm');
                if (rehearsalForm && !rehearsalForm.dataset.dirtyTracking) {
                    rehearsalForm.dataset.dirtyTracking = 'true';
                    rehearsalForm.addEventListener('input', () => { window._rehearsalFormDirty = true; });
                    rehearsalForm.addEventListener('change', () => { window._rehearsalFormDirty = true; });
                }

                // Hide delete button for new rehearsal
                const deleteBtn = document.getElementById('deleteRehearsalBtn');
                if (deleteBtn) {
                    deleteBtn.style.display = 'none';
                }

                if (typeof Rehearsals !== 'undefined') {
                    Rehearsals.setFixedDateFields();
                    Rehearsals.resetDateProposalRows();
                    Rehearsals.setScheduleMode('fixed', { lockMode: false, refreshAvailability: false });
                    Rehearsals.clearFixedDateAvailability();
                }

                await Bands.populateBandSelects();
                await this.populateLocationSelect();

                if (typeof Rehearsals !== 'undefined') {
                    const currentBandId = document.getElementById('rehearsalBand')?.value || '';
                    if (currentBandId) {
                        if (typeof Rehearsals.fetchBandMemberAbsences === 'function') {
                            await Rehearsals.fetchBandMemberAbsences(currentBandId);
                        }
                        if (typeof Rehearsals.loadBandMembers === 'function') {
                            await Rehearsals.loadBandMembers(currentBandId, []);
                        }
                    } else if (typeof Rehearsals.loadBandMembers === 'function') {
                        await Rehearsals.loadBandMembers('', []);
                    }
                }

                // Attach availability listeners for initial input
                if (typeof Rehearsals !== 'undefined' && Rehearsals.attachAvailabilityListeners) {
                    Rehearsals.attachAvailabilityListeners();
                    Rehearsals.updateAvailabilityIndicators();
                }

                // Event-Dropdown richtig vorbelegen
                const eventSelect = document.getElementById('rehearsalEvent');
                const bandSelect = document.getElementById('rehearsalBand');
                if (eventSelect && bandSelect) {
                    if (planningBands.length === 1 && bandSelect.value) {
                        // Wenn genau eine berechtigte Band vorhanden ist, direkt Events dieser Band laden
                        await App.populateEventSelect(bandSelect.value);
                    } else {
                        eventSelect.innerHTML = '<option value="">Bitte zuerst eine Band auswählen</option>';
                    }
                }

                // Hide notification checkbox for new rehearsals
                const notifyGroup = document.getElementById('notifyMembersGroup');
                if (notifyGroup) {
                    notifyGroup.style.display = 'none';
                    document.getElementById('notifyMembersOnUpdate').checked = false;
                }
                const updateEmailSection = document.getElementById('updateEmailSection');
                if (updateEmailSection) {
                    updateEmailSection.style.display = 'none';
                    const sendUpdateEmail = document.getElementById('sendUpdateEmail');
                    if (sendUpdateEmail) sendUpdateEmail.checked = false;
                }

                UI.openModal('createRehearsalModal');
                this.applyPendingCreateRehearsalDefaults();
            });
        }

        // Listen for band selection changes in rehearsal form
        const rehearsalBandSelect = document.getElementById('rehearsalBand');
        if (rehearsalBandSelect && !rehearsalBandSelect.dataset.schedulerBound) {
            rehearsalBandSelect.dataset.schedulerBound = 'true';
            rehearsalBandSelect.addEventListener('change', async (e) => {
                const bandId = e.target.value;
                if (bandId) {
                    await this.populateEventSelect(bandId);

                    if (typeof Rehearsals !== 'undefined' && Rehearsals.loadBandMembers) {
                        await Rehearsals.loadBandMembers(bandId, null);
                    }
                } else {
                    const eventSelect = document.getElementById('rehearsalEvent');
                    if (eventSelect) {
                        eventSelect.innerHTML = '<option value="">Bitte zuerst eine Band auswählen</option>';
                    }

                    if (typeof Rehearsals !== 'undefined' && Rehearsals.loadBandMembers) {
                        await Rehearsals.loadBandMembers('', []);
                    }
                }
            });
        }

        document.querySelectorAll('input[name="rehearsalScheduleMode"]').forEach(input => {
            if (input.dataset.initialized) return;
            input.dataset.initialized = 'true';
            input.addEventListener('change', () => {
                if (typeof Rehearsals !== 'undefined' && typeof Rehearsals.setScheduleMode === 'function') {
                    Rehearsals.setScheduleMode(input.value);
                }
            });
        });

        const rehearsalLocationSelect = document.getElementById('rehearsalLocation');
        if (rehearsalLocationSelect && !rehearsalLocationSelect.dataset.availabilityBound) {
            rehearsalLocationSelect.dataset.availabilityBound = 'true';
            rehearsalLocationSelect.addEventListener('change', () => {
                if (typeof Rehearsals !== 'undefined' && typeof Rehearsals.updateAvailabilityIndicators === 'function') {
                    Rehearsals.updateAvailabilityIndicators();
                }
            });
        }

        // Create rehearsal form
        const createRehearsalForm = document.getElementById('createRehearsalForm');
        if (createRehearsalForm) {
            createRehearsalForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleCreateRehearsal();
            };
        }

        // Add date button
        const addDateBtn = document.getElementById('addDateBtn');
        if (addDateBtn) {
            // Vorherige Listener entfernen
            addDateBtn.replaceWith(addDateBtn.cloneNode(true));
            const newAddDateBtn = document.getElementById('addDateBtn');
            newAddDateBtn.addEventListener('click', () => {
                Rehearsals.addDateProposal();
            });
        }

        // Delete rehearsal button
        document.getElementById('deleteRehearsalBtn').addEventListener('click', async () => {
            const rehearsalId = document.getElementById('editRehearsalId').value;
            Logger.userAction('Button', 'deleteRehearsalBtn', 'Click', { rehearsalId });
            if (rehearsalId) {
                await Rehearsals.deleteRehearsal(rehearsalId);
                UI.closeModal('createRehearsalModal');
            }
        });

        // Band filter
        document.getElementById('bandFilter').addEventListener('change', (e) => {
            Rehearsals.currentFilter = e.target.value;
            Rehearsals.renderRehearsals(e.target.value);
        });



        // Create event button
        document.getElementById('createEventBtn').addEventListener('click', async () => {
            Logger.userAction('Button', 'createEventBtn', 'Click', { action: 'Open New Event Modal' });
            // Reset form for new event
            document.getElementById('eventModalTitle').textContent = 'Neuen Auftritt erstellen';
            document.getElementById('saveEventBtn').textContent = 'Auftritt erstellen';
            document.getElementById('editEventId').value = '';
            const deleteEventBtn = document.getElementById('deleteEventBtn');
            if (deleteEventBtn) {
                deleteEventBtn.style.display = 'none';
            }
            UI.clearForm('createEventForm');
            if (typeof Events !== 'undefined') {
                Events.currentEventId = null;
            }

            window._eventFormDirty = false;
            UI.guardModalClose('createEventModal', '_eventFormDirty');
            const eventForm = document.getElementById('createEventForm');
            if (eventForm && !eventForm.dataset.dirtyTracking) {
                eventForm.dataset.dirtyTracking = 'true';
                eventForm.addEventListener('input', () => { window._eventFormDirty = true; });
                eventForm.addEventListener('change', () => { window._eventFormDirty = true; });
            }

            // Do not pre-fill date, keep it empty as requested by user
            const eventDateInput = document.getElementById('eventFixedDate');
            const eventTimeInput = document.getElementById('eventFixedTime');
            if (eventDateInput) {
                eventDateInput.value = '';
            }
            if (eventTimeInput) {
                eventTimeInput.value = '19:00';
            }

            // Populate returns immediately, if single band it triggers change listener which loads members + absences
            await Events.populateBandSelect();

            // Reset Date Proposals
            if (typeof Events !== 'undefined' && Events.resetDateProposalRows) {
                Events.resetDateProposalRows();
            } else if (typeof Events !== 'undefined' && Events.addDateProposalRow) {
                const container = document.getElementById('eventDateProposals');
                container.innerHTML = '';
                Events.addDateProposalRow();
            }

            if (typeof Events !== 'undefined' && Events.setScheduleMode) {
                Events.setScheduleMode('fixed', { lockMode: false, refreshAvailability: true });
            }

            if (typeof Events !== 'undefined') {
                const currentBandId = document.getElementById('eventBand')?.value || '';
                if (currentBandId) {
                    if (typeof Events.fetchBandMemberAbsences === 'function') {
                        await Events.fetchBandMemberAbsences(currentBandId);
                    }
                    if (typeof Events.loadBandMembers === 'function') {
                        await Events.loadBandMembers(currentBandId, []);
                    }
                } else if (typeof Events.loadBandMembers === 'function') {
                    await Events.loadBandMembers('', []);
                }
            }

            // Clear draft song selection and deleted songs for new event
            this.resetDraftEventState();
            await this.renderDraftEventSongs();
            const copyBtn = document.getElementById('copyBandSongsBtn');
            if (copyBtn) copyBtn.style.display = 'none';
            UI.openModal('createEventModal');
            this.applyPendingCreateEventDefaults();

            if (typeof Events !== 'undefined') {
                if (typeof Events.attachAvailabilityListeners === 'function') {
                    Events.attachAvailabilityListeners(document.getElementById('createEventModal'));
                }
                if (typeof Events.requestAvailabilityRefresh === 'function') {
                    Events.requestAvailabilityRefresh();
                } else if (typeof Events.updateAvailabilityIndicators === 'function') {
                    Events.updateAvailabilityIndicators();
                }
            }
        });

        // Create event form
        const createEventForm = document.getElementById('createEventForm');
        if (createEventForm) {
            createEventForm.onsubmit = async (e) => {
                e.preventDefault();
                if (typeof Events !== 'undefined' && typeof Events.handleSaveEvent === 'function') {
                    await Events.handleSaveEvent();
                    return;
                }

                await this.handleCreateEvent();
            };
        }

        const deleteEventBtn = document.getElementById('deleteEventBtn');
        if (deleteEventBtn && !deleteEventBtn.dataset.bound) {
            deleteEventBtn.dataset.bound = 'true';
            deleteEventBtn.addEventListener('click', async () => {
                const eventId = document.getElementById('editEventId')?.value || '';
                if (!eventId || typeof Events === 'undefined' || typeof Events.deleteEvent !== 'function') return;
                await Events.deleteEvent(eventId);
                UI.closeModal('createEventModal');
            });
        }

        // Event band change
        document.getElementById('eventBand').addEventListener('change', async (e) => {
            const bandId = e.target.value;
            if (bandId) {
                await Events.loadBandMembers(bandId, null); // null = pre-select all
                const copyBtn = document.getElementById('copyBandSongsBtn');
                if (copyBtn) copyBtn.style.display = 'block';
            } else {
                await Events.loadBandMembers('', []);
                const copyBtn = document.getElementById('copyBandSongsBtn');
                if (copyBtn) copyBtn.style.display = 'none';
            }

            if (typeof Events !== 'undefined') {
                if (typeof Events.attachAvailabilityListeners === 'function') {
                    Events.attachAvailabilityListeners(document.getElementById('eventDateProposals'));
                }
                if (typeof Events.requestAvailabilityRefresh === 'function') {
                    Events.requestAvailabilityRefresh();
                } else if (typeof Events.updateAvailabilityIndicators === 'function') {
                    Events.updateAvailabilityIndicators();
                }
            }
        });

        // Event fixed date change
        const eventFixedInputs = [
            document.getElementById('eventFixedDate'),
            document.getElementById('eventFixedTime')
        ].filter(Boolean);
        eventFixedInputs.forEach((eventDateInput) => {
            if (eventDateInput.dataset.rundownBound === 'true') return;
            eventDateInput.dataset.rundownBound = 'true';
            const handler = () => {
                if (typeof Events !== 'undefined') {
                    if (typeof Events.requestAvailabilityRefresh === 'function') {
                        Events.requestAvailabilityRefresh();
                    } else if (typeof Events.updateAvailabilityIndicators === 'function') {
                        Events.updateAvailabilityIndicators();
                    }
                }
                this.syncDraftEventRundownStartFromEventDate(true);
                this.renderEventRundownEditor();
            };
            eventDateInput.addEventListener('change', handler);
            eventDateInput.addEventListener('input', handler);
        });

        const eventDateProposals = document.getElementById('eventDateProposals');
        if (eventDateProposals && eventDateProposals.dataset.availabilityBound !== 'true') {
            eventDateProposals.dataset.availabilityBound = 'true';
            const handleEventProposalAvailabilityChange = () => {
                if (typeof Events !== 'undefined') {
                    if (typeof Events.requestAvailabilityRefresh === 'function') {
                        Events.requestAvailabilityRefresh();
                    } else if (typeof Events.updateAvailabilityIndicators === 'function') {
                        Events.updateAvailabilityIndicators();
                    }
                }
            };

            eventDateProposals.addEventListener('input', (event) => {
                if (event.target.closest('.event-date-input-date, .event-date-input-start')) {
                    handleEventProposalAvailabilityChange();
                }
            });

            eventDateProposals.addEventListener('change', (event) => {
                if (event.target.closest('.event-date-input-date, .event-date-input-start')) {
                    handleEventProposalAvailabilityChange();
                }
            });

            eventDateProposals.addEventListener('focusout', (event) => {
                if (event.target.closest('.event-date-input-date, .event-date-input-start')) {
                    handleEventProposalAvailabilityChange();
                }
            });
        }

        const eventRundownPdfBtn = document.getElementById('eventRundownPdfBtn');
        if (eventRundownPdfBtn && !eventRundownPdfBtn.dataset.bound) {
            eventRundownPdfBtn.dataset.bound = 'true';
            eventRundownPdfBtn.addEventListener('click', async () => {
                const hasRundown = Array.isArray(this.draftEventRundown?.items) && this.draftEventRundown.items.length > 0;
                if (!hasRundown) {
                    UI.showToast('Bitte lege zuerst einen Ablauf an.', 'warning');
                    return;
                }
                await this.openDraftEventRundownPdfExport();
            });
        }

        const saveTemplateBtn = document.getElementById('eventRundownSaveTemplateBtn');
        if (saveTemplateBtn && !saveTemplateBtn.dataset.bound) {
            saveTemplateBtn.dataset.bound = 'true';
            saveTemplateBtn.addEventListener('click', () => this.saveRundownAsTemplate());
        }

        const loadTemplateBtn = document.getElementById('eventRundownLoadTemplateBtn');
        if (loadTemplateBtn && !loadTemplateBtn.dataset.bound) {
            loadTemplateBtn.dataset.bound = 'true';
            loadTemplateBtn.addEventListener('click', () => this.openLoadRundownTemplateModal());
        }


        document.querySelectorAll('input[name="eventScheduleMode"]').forEach(input => {
            if (input.dataset.initialized) return;
            input.dataset.initialized = 'true';
            input.addEventListener('change', () => {
                if (typeof Events !== 'undefined' && typeof Events.setScheduleMode === 'function') {
                    Events.setScheduleMode(input.value);
                }
                if (typeof Events !== 'undefined') {
                    if (typeof Events.attachAvailabilityListeners === 'function') {
                        Events.attachAvailabilityListeners(document.getElementById('eventDateProposals'));
                    }
                    if (typeof Events.requestAvailabilityRefresh === 'function') {
                        Events.requestAvailabilityRefresh();
                    } else if (typeof Events.updateAvailabilityIndicators === 'function') {
                        Events.updateAvailabilityIndicators();
                    }
                }
            });
        });

        // Add event song button (create new song)
        const addEventSongBtn = document.getElementById('addEventSongBtn');
        if (addEventSongBtn) {
            addEventSongBtn.addEventListener('click', () => {
                const eventId = document.getElementById('editEventId').value;
                const bandId = document.getElementById('eventBand').value;
                // If editing existing event -> create song attached to event
                if (eventId) {
                    this.lastSongModalContext = { eventId, bandId: null, origin: 'event' };
                    this.openSongModal(eventId, null, null);
                    return;
                }

                // Creating new event -> require band selected, open song modal to create song for the band
                if (!bandId) {
                    UI.showToast('Bitte wähle zuerst eine Band aus', 'warning');
                    return;
                }
                this.lastSongModalContext = { eventId: null, bandId, origin: 'createEvent' };
                this.openSongModal(null, bandId, null);
            });
        }

        // Add existing event song button (pick from band's songs)
        // Support both button IDs for band song copy (legacy and new)
        const addExistingEventSongBtn = document.getElementById('addExistingEventSongBtn');
        const copyBandSongsBtn = document.getElementById('copyBandSongsBtn');
        const handleCopyBandSongs = async () => {
            const eventId = document.getElementById('editEventId').value;
            const bandId = document.getElementById('eventBand').value;
            if (!bandId) {
                UI.showToast('Bitte wähle zuerst eine Band aus', 'warning');
                return;
            }
            const bandSongs = await Storage.getBandSongs(bandId);
            if (!Array.isArray(bandSongs) || bandSongs.length === 0) {
                UI.showToast('Für diese Band sind noch keine Songs vorhanden', 'info');
                return;
            }
            if (eventId) {
                this.showBandSongSelector(eventId, bandSongs);
            } else {
                this.showBandSongSelectorForDraft(bandSongs);
            }
        };
        if (addExistingEventSongBtn) {
            addExistingEventSongBtn.addEventListener('click', handleCopyBandSongs);
        }
        if (copyBandSongsBtn) {
            copyBandSongsBtn.addEventListener('click', handleCopyBandSongs);
        }

        // Event band filter
        document.getElementById('eventBandFilter').addEventListener('change', (e) => {
            Events.currentFilter = e.target.value;
            Events.renderEvents(e.target.value);
        });

        // Onboarding handlers
        document.getElementById('onboardingCreateBandBtn').addEventListener('click', () => {
            UI.closeModal('onboardingModal');
            UI.openModal('createBandModal');
        });

        document.getElementById('onboardingJoinBandBtn').addEventListener('click', () => {
            UI.closeModal('onboardingModal');
            UI.openModal('joinBandModal');
        });

        document.getElementById('onboardingSkipBtn').addEventListener('click', () => {
            UI.closeModal('onboardingModal');
        });

        // Send confirmation button
        const sendConfirmBtn = document.getElementById('sendConfirmationBtn');
        if (sendConfirmBtn) {
            sendConfirmBtn.addEventListener('click', async () => {
                await Rehearsals.confirmRehearsal();
            });
        }

        // Time suggestion modal handlers
        const saveTimeSuggestionBtn = document.getElementById('saveTimeSuggestionBtn');
        if (saveTimeSuggestionBtn) {
            saveTimeSuggestionBtn.addEventListener('click', async () => {
                await Rehearsals.saveTimeSuggestion();
            });
        }

        const deleteTimeSuggestionBtn = document.getElementById('deleteTimeSuggestionBtn');
        if (deleteTimeSuggestionBtn) {
            deleteTimeSuggestionBtn.addEventListener('click', async () => {
                await Rehearsals.deleteTimeSuggestion();
            });
        }

        // Confirmation modal time validation
        const confirmStartTime = document.getElementById('confirmRehearsalStartTime');
        const confirmEndTime = document.getElementById('confirmRehearsalEndTime');
        if (confirmStartTime && confirmEndTime) {
            const validateConfirmTimes = () => {
                if (confirmStartTime.value && confirmEndTime.value) {
                    const startDateTime = new Date(confirmStartTime.value);
                    const endDateTime = new Date(confirmEndTime.value);

                    if (endDateTime <= startDateTime) {
                        confirmEndTime.setCustomValidity('Endzeit muss nach Startzeit liegen');
                        confirmEndTime.reportValidity();
                    } else {
                        confirmEndTime.setCustomValidity('');
                    }
                }
            };

            confirmStartTime.addEventListener('change', validateConfirmTimes);
            confirmEndTime.addEventListener('change', validateConfirmTimes);
        }

        // Location conflict modal handlers
        const abortConfirmationBtn = document.getElementById('abortConfirmationBtn');
        if (abortConfirmationBtn) {
            abortConfirmationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                UI.closeModal('locationConflictModal');
            });
        }

        const proceedAnywayBtn = document.getElementById('proceedAnywayBtn');
        if (proceedAnywayBtn) {
            proceedAnywayBtn.addEventListener('click', async () => {
                // Check if we're in creation mode
                if (window._pendingRehearsalCreation) {
                    const pendingCreation = window._pendingRehearsalCreation;
                    window._pendingRehearsalCreation = null;
                    window._locationConflictReturnModalId = null;
                    UI.closeModal('locationConflictModal');
                    await pendingCreation();
                } else {
                    // Confirmation mode
                    window._locationConflictReturnModalId = null;
                    await Rehearsals.confirmRehearsal(true); // Force confirm despite conflicts
                }
            });
        }

        // Modal close buttons
        // Modal close buttons - Event Delegation for dynamic content
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('.cancel');
            if (btn) {
                e.preventDefault();
                const modal = btn.closest('.modal');
                if (modal) {
                    // If closing event modal, restore deleted songs
                    if (modal.id === 'createEventModal' && this.deletedEventSongs.length > 0) {
                        for (const song of this.deletedEventSongs) {
                            await Storage.createSong(song);
                        }
                        this.resetDraftEventState();
                        UI.showToast('Änderungen verworfen', 'info');
                    } else if (modal.id === 'createEventModal') {
                        this.resetDraftEventState();
                    }
                    UI.closeModal(modal.id);
                }
            }
        });

        const standaloneBackdropModalIds = ['profileImageModal'];
        standaloneBackdropModalIds.forEach((modalId) => {
            const modal = document.getElementById(modalId);
            if (!modal || modal.dataset.hasStandaloneBackdropClose === 'true') return;

            modal.addEventListener('mousedown', (event) => {
                modal._standaloneBackdropMouseDown = event.target === modal;
            });
            modal.addEventListener('mouseup', (event) => {
                modal._standaloneBackdropMouseUp = event.target === modal;
            });
            modal.addEventListener('click', (event) => {
                const startedOnBackdrop = modal._standaloneBackdropMouseDown === true;
                const endedOnBackdrop = event.target === modal && modal._standaloneBackdropMouseUp === true;
                modal._standaloneBackdropMouseDown = false;
                modal._standaloneBackdropMouseUp = false;

                if (!startedOnBackdrop || !endedOnBackdrop) return;
                modal.classList.remove('active');
            });

            modal.dataset.hasStandaloneBackdropClose = 'true';
        });

        // Create absence form
        const createAbsenceForm = document.getElementById('createAbsenceForm');
        if (createAbsenceForm) {
            createAbsenceForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleCreateAbsence();
            });
        }

        // Add date validation for absence dates
        const absenceStartInput = document.getElementById('absenceStart');
        const absenceEndInput = document.getElementById('absenceEnd');
        if (absenceStartInput && absenceEndInput) {
            const validateDates = () => {
                if (absenceStartInput.value && absenceEndInput.value) {
                    const start = new Date(absenceStartInput.value);
                    const end = new Date(absenceEndInput.value);
                    if (start > end) {
                        absenceEndInput.setCustomValidity('Das "Bis"-Datum muss nach dem "Von"-Datum liegen');
                    } else {
                        absenceEndInput.setCustomValidity('');
                    }
                }
            };
            absenceStartInput.addEventListener('change', validateDates);
            absenceEndInput.addEventListener('change', validateDates);
        }

        // Subscribe calendar button
        // Subscription button handled inline via onclick now

        // Cancel edit absence button
        const cancelEditBtn = document.getElementById('cancelEditAbsenceBtn');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                this.cancelEditAbsence();
            });
        }

        // Create news button
        const createNewsBtn = document.getElementById('createNewsBtn');
        if (createNewsBtn) {
            createNewsBtn.addEventListener('click', () => {
                // Reset modal for new news
                const modalTitle = document.querySelector('#createNewsModal .modal-header h2');
                if (modalTitle) modalTitle.textContent = 'News erstellen';
                const submitBtn = document.querySelector('#createNewsModal .modal-actions .btn-primary');
                if (submitBtn) submitBtn.textContent = 'Veröffentlichen';
                const editInput = document.getElementById('editNewsId');
                if (editInput) editInput.value = '';
                const preview = document.getElementById('newsImagesPreview');
                if (preview) preview.innerHTML = '';
                const imagesInput = document.getElementById('newsImages');
                if (imagesInput) imagesInput.value = null;
                document.getElementById('newsTitle').value = '';

                UI.openModal('createNewsModal');

                // Init / clear quill editor after modal is open
                setTimeout(() => {
                    RichTextEditor.init();
                    RichTextEditor.clear();
                }, 50);
            });
        }

        // Create news form
        const createNewsForm = document.getElementById('createNewsForm');
        if (createNewsForm) {
            // Check if we already added the listener to avoid double-submit
            if (!createNewsForm._newsListenerAdded) {
                createNewsForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleCreateNews();
                });
                createNewsForm._newsListenerAdded = true;
            }
        }

        // News images preview handler
        const newsImagesInput = document.getElementById('newsImages');
        const newsImagesPreview = document.getElementById('newsImagesPreview');
        if (newsImagesInput && newsImagesPreview) {
            newsImagesInput.addEventListener('change', () => {
                newsImagesPreview.innerHTML = '';
                const files = Array.from(newsImagesInput.files || []);
                files.slice(0, 6).forEach(file => {
                    if (!file.type.startsWith('image/')) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = document.createElement('img');
                        img.src = ev.target.result;
                        img.style.width = '80px';
                        img.style.height = '80px';
                        img.style.objectFit = 'cover';
                        img.style.borderRadius = '6px';
                        newsImagesPreview.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                });
            });
        }

        // Song form (Handler wird nur im DOMContentLoaded-Block registriert)

        // Calendar refresh button
        const refreshCalendarBtn = document.getElementById('refreshCalendarBtn');
        if (refreshCalendarBtn) {
            refreshCalendarBtn.addEventListener('click', () => {
                if (typeof Calendar !== 'undefined' && Calendar.loadCalendar) {
                    const activeTab = document.querySelector('.calendar-tab.active');
                    const activeCalendar = activeTab ? activeTab.dataset.calendar : 'tonstudio';
                    Calendar.loadCalendar(activeCalendar);
                }
            });
        }

        // Calendar tabs switching
        document.querySelectorAll('.calendar-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const calendarType = tab.dataset.calendar;

                // Update active tab
                document.querySelectorAll('.calendar-tab').forEach(t => {
                    t.classList.remove('active', 'btn-primary');
                    if (!t.classList.contains('btn-secondary')) {
                        t.classList.add('btn-secondary');
                    }
                });
                tab.classList.remove('btn-secondary');
                tab.classList.add('btn-primary');
                tab.classList.add('active');

                // Show/hide calendar containers
                document.querySelectorAll('.calendar-container').forEach(c => c.classList.remove('active'));
                const container = document.getElementById(`${calendarType}Calendar`);
                if (container) {
                    container.classList.add('active');
                }

                // Load calendar data
                if (typeof Calendar !== 'undefined' && Calendar.loadCalendar) {
                    Calendar.loadCalendar(calendarType);
                }
            });
        });

        // Musikpool refresh buttons
        document.querySelectorAll('[data-refresh-musikpool]').forEach(button => {
            if (button.dataset.listenerAttached) return;
            button.dataset.listenerAttached = 'true';
            button.addEventListener('click', () => {
                if (typeof Musikpool !== 'undefined' && Musikpool.loadGroupData) {
                    Musikpool.loadGroupData(true);
                }
            });
        });

        // Add Own Member button (placeholder)
        const addOwnMemberBtn = document.getElementById('addOwnMemberBtn');
        if (addOwnMemberBtn) {
            addOwnMemberBtn.addEventListener('click', () => {
                UI.showToast('Diese Funktion wird in Kürze verfügbar sein', 'success');
            });
        }

        // Tab switching in band details
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Settings tabs
        // Settings tabs - handled by initializeSettingsViewListeners to avoid duplicates
        /* document.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchSettingsTab(tabName);
            });
        }); */

        // Add User Button (Admin only) - using event delegation
        document.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'addUserBtn') {
                // Reset form
                document.getElementById('addUserForm').reset();
                UI.openModal('addUserModal');
            }
        });

        // Add User Form (Admin only)
        const addUserForm = document.getElementById('addUserForm');
        if (addUserForm) {
            // Remove existing listeners to avoid duplicates if setupEventListeners is called multiple times
            const newForm = addUserForm.cloneNode(true);
            addUserForm.parentNode.replaceChild(newForm, addUserForm);

            newForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (this.isProcessingAddUser) return; // Prevent double submission

                // Define button outside try so it's visible in finally
                const submitBtn = newForm.querySelector('button[type="submit"]') || newForm.querySelector('.btn-primary');

                try {
                    this.isProcessingAddUser = true;
                    // Disable submit button
                    if (submitBtn) submitBtn.disabled = true;

                    await this.handleAddUser();
                } catch (error) {
                    console.error('[addUserForm] Fehler beim Hinzufügen:', error);
                    UI.hideLoading();
                    UI.showToast('Fehler: ' + error.message, 'error');
                } finally {
                    this.isProcessingAddUser = false;
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        // News Banner Buttons
        const newsBannerButton = document.getElementById('newsBannerButton');
        if (newsBannerButton) {
            newsBannerButton.addEventListener('click', () => {
                this.navigateTo('news', 'app-init');
                this.hideNewsBanner();
            });
        }

        const newsBannerClose = document.getElementById('newsBannerClose');
        if (newsBannerClose) {
            newsBannerClose.addEventListener('click', () => {
                this.hideNewsBanner();
                // Mark as dismissed in localStorage so it doesn't show again until next new news
                const user = Auth.getCurrentUser();
                if (user) {
                    localStorage.setItem(`newsBanner_dismissed_${user.id}`, Date.now().toString());
                }
            });
        }

        // Vote Banner Buttons
        const voteBannerButton = document.getElementById('voteBannerButton');
        if (voteBannerButton) {
            voteBannerButton.addEventListener('click', () => {
                const banner = document.getElementById('voteBanner');
                const targetView = banner?.dataset?.targetView || 'events';
                this.hideVoteBanner(true);
                this.navigateTo(targetView, 'vote-banner');
            });
        }

        const voteBannerClose = document.getElementById('voteBannerClose');
        if (voteBannerClose) {
            voteBannerClose.addEventListener('click', () => {
                this.hideVoteBanner(true);
            });
        }

        const adminTestNewsBannerBtn = document.getElementById('adminTestNewsBannerBtn');
        if (adminTestNewsBannerBtn) {
            adminTestNewsBannerBtn.addEventListener('click', () => {
                const banner = document.getElementById('newsBanner');
                const message = document.getElementById('newsBannerMessage');
                if (banner && message) {
                    message.textContent = '🎉 Dies ist ein Test-Banner für neue News!';
                    banner.style.display = 'block';

                    // Reset animation to play it again
                    banner.style.animation = 'none';
                    banner.offsetHeight; /* trigger reflow */
                    banner.style.animation = 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)';

                    UI.showToast('News Banner eingeblendet');
                }
            });
        }

        // Create Band Button (in Bands View)
        document.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'createBandBtnView') {
                UI.openModal('createBandModal');
            }
        });

        // Initialize Sidebar Accordion
        document.querySelectorAll('.nav-group.has-submenu > .nav-main').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent navigation if it's just a toggle
                const group = btn.parentElement;

                // Toggle current
                group.classList.toggle('expanded');

                // Close others (optional, but cleaner)
                document.querySelectorAll('.nav-group.expanded').forEach(other => {
                    if (other !== group) {
                        other.classList.remove('expanded');
                    }
                });
            });
        });

        // Setup logout button
        const logoutBtn = document.getElementById('sidebarLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                Auth.logout();
            });
        }

        // Join Band Button
        const joinBandBtn = document.getElementById('joinBandBtn');
        if (joinBandBtn) {
            joinBandBtn.addEventListener('click', () => {
                UI.openModal('joinBandModal');
            });
        }

        // Join Band Form
        const joinBandForm = document.getElementById('joinBandForm');
        if (joinBandForm) {
            joinBandForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const code = document.getElementById('joinBandCode').value; Logger.userAction('Submit', 'joinBandForm', 'Join Band', { code });
                Bands.joinBand(code);
            });
        }
    },

    openProfileImagePreview(imageUrl) {
        if (!imageUrl) return;
        const modal = document.getElementById('profileImageModal');
        const img = document.getElementById('profileImagePreview');
        if (!modal || !img) return;

        img.src = imageUrl;
        modal.classList.add('active');
    },


    // Navigate to a specific view
    async navigateTo(view, triggerSource = 'unknown') {
        // Lade-Overlay wird nur noch in den jeweiligen Datenladefunktionen angezeigt
        try {
            Logger.info('Navigate To', `${view} (Trigger: ${triggerSource})`);

            // Declare overlay and loading flag at function start so they're accessible in all code paths
            const overlay = document.getElementById('globalLoadingOverlay');
            const shouldShowLoading = !['settings'].includes(view);

            const viewMap = {
                'dashboard': 'dashboardView',
                'bands': 'bandsView',
                'events': 'eventsView',
                'rehearsals': 'rehearsalsView',
                'statistics': 'statisticsView',
                'news': 'newsView',
                'songpool': 'songpoolView',
                'probeorte': 'probeorteView',
                'tonstudio': 'probeorteView', // Redirect old tonstudio to probeorte
                'pdftochordpro': 'pdftochordproView',
                'kalender': 'kalenderView',
                'musikpool': 'musikpoolView',
                'settings': 'settingsView'
            };

            const viewId = viewMap[view];

            // Special handling for Settings (Modal instead of View)
            if (view === 'settings') {
                this.currentView = view;
                this.openSettings();
                // Update active state for nav items manually
                document.querySelectorAll('.nav-item, .nav-subitem').forEach(item => {
                    if (item.dataset.view === 'settings') {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });
                return;
            }

            if (viewId) {
                this.currentView = view;
                // Set nav active color per view for sticky bottom bar indicator
                const navActiveColorMap = {
                    dashboard: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
                    bands: '#10b981', // success green
                    events: '#ec4899', // secondary pink
                    rehearsals: '#6366f1', // primary
                    statistics: '#2563eb', // blue
                    news: '#f59e0b', // warning
                    songpool: '#22c55e', // emerald
                    probeorte: '#9333ea', // purple
                    pdftochordpro: '#4f46e5', // indigo
                    kalender: '#f43f5e', // rose
                    musikpool: '#0ea5e9' // cyan
                };
                const navColor = navActiveColorMap[view] || getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
                document.documentElement.style.setProperty('--nav-active-color', navColor);

                try {
                    UI.showView(viewId);
                    this.updateHeaderSubmenu(view);
                    this.resetMainContentScroll(viewId);
                    this.rememberCurrentView(view);
                    this.setPersistedNavigationState({ scrollTop: 0 });
                } catch (uiErr) {
                    console.error('[navigateTo] UI.showView error:', uiErr);
                }



                // Update active navigation - SEPARATE LOGIC for Desktop Sidebar and Mobile Nav

                // 1. DESKTOP SIDEBAR (.sidebar-*)
                document.querySelectorAll('.sidebar-item, .sidebar-subitem').forEach(item => {
                    item.classList.remove('active');
                    const itemView = item.dataset.view;

                    // Activate if view matches
                    if (itemView === view || (view === 'tonstudio' && itemView === 'probeorte')) {
                        item.classList.add('active');

                        // If it's a subitem, also activate its parent main item and expand the group
                        if (item.classList.contains('sidebar-subitem')) {
                            const group = item.closest('.sidebar-group');
                            if (group) {
                                const mainItem = group.querySelector('.sidebar-main');
                                if (mainItem) {
                                    mainItem.classList.add('active');
                                }
                                // Expand group on desktop
                                if (window.innerWidth > 768) {
                                    group.classList.add('expanded');
                                }
                            }
                        }
                    }
                });

                // 2. MOBILE NAV (.app-nav .nav-*)
                document.querySelectorAll('.app-nav .nav-item, .app-nav .nav-subitem').forEach(item => {
                    item.classList.remove('active');
                    const itemView = item.dataset.view;

                    // Activate if view matches
                    if (itemView === view || (view === 'tonstudio' && itemView === 'probeorte')) {
                        item.classList.add('active');

                        // FIX: If it's a subitem, also activate its parent main item (like desktop sidebar)
                        if (item.classList.contains('nav-subitem')) {
                            const group = item.closest('.nav-group');
                            if (group) {
                                const mainItem = group.querySelector('.nav-main');
                                if (mainItem) {
                                    mainItem.classList.add('active');
                                }
                            }
                        }
                    }
                });
                // Update Header Title
                this.updateHeaderSubmenu(view);

                // Update header submenu active state (underline) if present -> Logic removed as buttons are gone
                // (Keeping the try-catch block minimal just in case, but really we don't need it anymore)
                try {
                    document.querySelectorAll('.header-submenu-btn').forEach(btn => {
                        const v = btn.getAttribute('data-view');
                        if (v === view || (view === 'tonstudio' && v === 'probeorte')) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
                } catch (err) {
                    // ignore if header submenu not present in DOM
                }

                // Recalculate underline widths in case layout changed
                try { this.updateHeaderUnderlineWidths(); } catch (e) { }
                this.updateHeaderDashboardShortcuts(view);

                // Render specific views
                if (view === 'dashboard') {
                    await this.updateDashboard();
                } else if (view === 'bands') {
                    await Bands.renderBands();
                } else if (view === 'events') {
                    await Bands.populateBandSelects();
                    await Events.renderEvents();
                    this.hideVoteBanner(true);
                } else if (view === 'rehearsals') {
                    await Bands.populateBandSelects();
                    await Rehearsals.renderRehearsals();
                    this.hideVoteBanner(true);
                } else if (view === 'statistics') {
                    await Statistics.initStatisticsFilters();
                    await Statistics.renderGeneralStatistics();
                } else if (view === 'pdftochordpro') {
                    if (typeof ChordProConverter !== 'undefined' && typeof ChordProConverter.loadBands === 'function') {
                        await ChordProConverter.loadBands();
                    }
                } else if (view === 'songpool') {
                    await this.renderSongpoolView();
                } else if (view === 'news') {
                    await this.renderNewsView(triggerSource === 'news-refresh');

                    // Hide news banner when viewing news
                    this.hideNewsBanner();

                    // Show/hide create button based on admin or band leader/co-leader status
                    const createNewsBtn = document.getElementById('createNewsBtn');
                    if (createNewsBtn) {
                        const user = Auth.getCurrentUser();
                        const canCreate = await this.canCurrentUserCreateNews(user);
                        createNewsBtn.style.display = canCreate ? 'inline-flex' : 'none';
                    }

                    // Hide loading overlay after view/data is loaded (immer, egal ob admin oder nicht)
                    if (overlay && shouldShowLoading) {
                        overlay.style.opacity = '0';
                        setTimeout(() => overlay.style.display = 'none', 400);
                    }

                    // Update donate button visibility and link
                    this.updateDonateButton();
                } else if (view === 'probeorte' || view === 'tonstudio') {
                    // Render dynamic calendar tabs first
                    await this.renderProbeorteCalendarTabs();
                    // Redundant loading logic removed - handled by renderProbeorteCalendarTabs
                } else if (view === 'musikpool') {
                    // Check if user is admin - Musikerpool is restricted
                    const musikpoolSection = document.getElementById('churchToolsMusikpoolSection');
                    if (!Auth.isAdmin()) {
                        if (musikpoolSection) musikpoolSection.style.display = 'none';
                        if (overlay && shouldShowLoading) {
                            overlay.style.opacity = '0';
                            setTimeout(() => overlay.style.display = 'none', 400);
                        }
                        return;
                    }

                    if (musikpoolSection) musikpoolSection.style.display = 'block';

                    // Musikerpool mit Timeout und garantiertem Ausblenden des Overlays laden
                    if (typeof Musikpool !== 'undefined' && Musikpool.loadGroupData) {
                        let overlayTimeout;
                        let overlay = document.getElementById('globalLoadingOverlay');
                        let shouldShowLoading = true;
                        let finished = false;
                        // Timeout nach 5 Sekunden
                        overlayTimeout = setTimeout(() => {
                            if (!finished && overlay && shouldShowLoading) {
                                overlay.style.opacity = '0';
                                setTimeout(() => overlay.style.display = 'none', 400);
                                UI.showToast('Musikerpool-Daten konnten nicht geladen werden (Timeout).', 'error');
                            }
                        }, 5000);
                        try {
                            await Musikpool.loadGroupData();
                        } catch (err) {
                            UI.showToast('Musikerpool-Daten konnten nicht geladen werden.', 'error');
                        } finally {
                            finished = true;
                            clearTimeout(overlayTimeout);
                            if (overlay && shouldShowLoading) {
                                overlay.style.opacity = '0';
                                setTimeout(() => overlay.style.display = 'none', 400);
                            }
                        }
                    } else {
                        console.error('Musikpool object not found!');
                    }
                } else if (view === 'kalender') {
                    // Load personal calendar when navigating to view
                    if (typeof PersonalCalendar !== 'undefined' && PersonalCalendar.loadPersonalCalendar) {
                        PersonalCalendar.loadPersonalCalendar();
                    } else {
                        console.error('[navigateTo] PersonalCalendar object not found!');
                    }
                } else if (view === 'settings') {
                    // Load settings view content
                    this.renderSettingsView();
                }

                this.resetMainContentScroll(viewId);
            } else {
                // Kein View gefunden
            }
        } catch (error) {
            console.error('[navigateTo] Fehler:', error);
        }
    },

    resetMainContentScroll(viewId = null) {
        const appMain = document.querySelector('.app-main');
        const targetView = viewId ? document.getElementById(viewId) : document.querySelector('.view.active');

        const normalizeViewLayout = () => {
            if (!targetView) return;

            const structuralElements = [
                targetView,
                ...targetView.querySelectorAll('.view-page-shell, .page-overview-card, .page-section-card, .view-actions-bar, .schedule-board, .schedule-panels, .split-content-grid, .calendar-submenu, .probeorte-submenu, #newsContainer, #bandsList, #songpoolList, #musikpoolContainer, #ownMembersContainer, #personalCalendarContainer, #tonstudioCalendar, #festhalleCalendar, #ankersaalCalendar')
            ];

            const seen = new Set();
            structuralElements.forEach(element => {
                if (!element || seen.has(element)) return;
                seen.add(element);

                const styles = window.getComputedStyle(element);
                const marginTop = parseFloat(styles.marginTop);
                const paddingTop = parseFloat(styles.paddingTop);
                const minHeight = parseFloat(styles.minHeight);

                if (!Number.isNaN(marginTop) && marginTop > 120) {
                    element.style.marginTop = '0px';
                }

                if (!Number.isNaN(paddingTop) && paddingTop > 120) {
                    element.style.paddingTop = '0px';
                }

                if (
                    element !== targetView &&
                    !Number.isNaN(minHeight) &&
                    minHeight > window.innerHeight * 1.2
                ) {
                    element.style.minHeight = 'auto';
                }
            });

            Array.from(targetView.querySelectorAll('*')).slice(0, 800).forEach(element => {
                const styles = window.getComputedStyle(element);
                const marginTop = parseFloat(styles.marginTop);
                const paddingTop = parseFloat(styles.paddingTop);

                if (!Number.isNaN(marginTop) && marginTop > 240) {
                    element.style.marginTop = '0px';
                }

                if (!Number.isNaN(paddingTop) && paddingTop > 240) {
                    element.style.paddingTop = '0px';
                }
            });
        };

        const resetScroll = () => {
            normalizeViewLayout();
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            if (appMain) {
                appMain.scrollTop = 0;
                appMain.scrollLeft = 0;
            }
            if (targetView) {
                targetView.scrollTop = 0;
                targetView.scrollLeft = 0;
                targetView.style.removeProperty('padding-top');
                targetView.style.removeProperty('margin-top');
            }
        };

        resetScroll();
        requestAnimationFrame(() => {
            resetScroll();
        });
        // One final fallback for slow-rendering layouts, but significantly shorter to avoid jumping after interaction
        setTimeout(resetScroll, 50);
    },

    // Auth tab switching
    // Tab switching in modals
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            if (content.id === `${tabName}Tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        this.refreshBandSetlistScrollbarDockVisibility();

        if (tabName === 'setlist' && typeof this.syncBandSetlistScrollbarMetrics === 'function') {
            requestAnimationFrame(() => this.syncBandSetlistScrollbarMetrics());
            setTimeout(() => this.syncBandSetlistScrollbarMetrics(), 60);
        }
    },

    // Settings tab switching
    switchSettingsTab(tabName) {
        Logger.action('Switch Settings Tab', tabName);
        const tabs = document.querySelectorAll('.settings-tab-content');
        const btns = document.querySelectorAll('.settings-tab-btn');

        tabs.forEach(tab => tab.classList.remove('active'));
        btns.forEach(btn => btn.classList.remove('active'));

        const targetTab = document.getElementById(`${tabName}SettingsTab`); // Corrected ID for tab content
        const targetBtn = document.querySelector(`.settings-tab-btn[data-tab="${tabName}"]`); // Corrected selector for button

        if (targetTab) targetTab.classList.add('active');
        if (targetBtn) targetBtn.classList.add('active');

        // Load users list when switching to users tab
        if (tabName === 'users' && Auth.isAdmin()) {
            this.renderUsersList();
        }

        // Load calendars list when switching to locations tab
        if (tabName === 'locations' && Auth.isAdmin()) {
            console.log('[switchSettingsTab] Loading calendars for locations tab...');
            this.renderCalendarsList();
        }
    },

    // Handle login
    async handleLogin() {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const rememberMe = arguments.length > 2 ? arguments[2] : false;
        const loginForm = document.getElementById('loginForm');
        const submitBtn = loginForm?.querySelector('button[type="submit"]');
        const loginInputs = loginForm ? Array.from(loginForm.querySelectorAll('input')) : [];
        const originalSubmitText = submitBtn?.dataset.originalText || submitBtn?.textContent || 'Anmelden';
        this.clearAuthStatusNotice();

        if (submitBtn) {
            submitBtn.dataset.originalText = originalSubmitText;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Anmeldung läuft...';
        }
        loginInputs.forEach(input => {
            input.disabled = true;
        });

        if (loginForm) {
            loginForm.dataset.submitting = 'true';
        }

        try {
            await Auth.login(username, password, rememberMe);
            UI.toggleAuthOverlay(false); // Ensure modal-open is removed
            await this.showApp();
        } catch (error) {
            if (error?.code === 'email_not_confirmed') {
                this.showAuthStatusNotice('Dein Konto ist noch nicht aktiviert. Bitte bestätige zuerst die E-Mail aus deiner Registrierung und logge dich danach ein.', 'warning');
            }
            UI.showToast(error.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalSubmitText;
            }
            loginInputs.forEach(input => {
                input.disabled = false;
            });
            if (loginForm) {
                delete loginForm.dataset.submitting;
            }
        }
    },

    showAuthStatusNotice(message, type = 'info') {
        const notice = document.getElementById('loginConfirmationNotice');
        if (!notice) return;
        notice.textContent = message;
        notice.dataset.type = type;
        notice.hidden = false;
    },

    clearAuthStatusNotice() {
        const notice = document.getElementById('loginConfirmationNotice');
        if (!notice) return;
        notice.hidden = true;
        notice.textContent = '';
        delete notice.dataset.type;
    },

    // Helper: Compress Image (Client-Side)
    compressImage(file, maxWidth = 1024, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Canvas is empty'));
                            return;
                        }
                        const newFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(newFile);
                    }, 'image/jpeg', quality);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    },

    // Handle registration
    async handleRegister() {
        const firstName = document.getElementById('registerFirstName').value.trim();
        const lastName = document.getElementById('registerLastName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value;
        const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
        const imageInput = document.getElementById('registerProfileImage');

        if (password !== passwordConfirm) {
            UI.showToast('Passwörter stimmen nicht überein', 'error');
            return;
        }

        // Show the global loading overlay with guitar emoji
        const overlay = document.getElementById('globalLoadingOverlay');
        if (typeof window.showGlobalLoadingOverlay === 'function') {
            window.showGlobalLoadingOverlay();
        } else if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
        }

        try {
            const instrument = document.getElementById('registerInstrument').value;
            const sb = SupabaseClient.getClient();
            await Auth.register(firstName, lastName, email, username, password, instrument);

            const { data: { session } } = await sb.auth.getSession();
            if (session) {
                await sb.auth.signOut().catch(err => console.warn('[handleRegister] Sign-out after register failed:', err));
                SupabaseClient.clearStoredAuthSession();
                if (typeof Auth !== 'undefined') {
                    Auth.currentUser = null;
                    Auth.supabaseUser = null;
                }
            }

            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 400);
            }
            UI.clearForm('registerForm');
            UI.switchAuthTab('login');
            const loginUsernameInput = document.getElementById('loginUsername');
            const loginPasswordInput = document.getElementById('loginPassword');
            if (loginUsernameInput) loginUsernameInput.value = email;
            if (loginPasswordInput) loginPasswordInput.value = '';
            this.showAuthStatusNotice(`Wir haben dir an ${email} eine Bestätigungs-E-Mail geschickt. Bitte bestätige dein Konto über den Link in der Mail, bevor du dich einloggst.`, 'success');
            UI.showToast('Registrierung abgeschlossen. Bitte bestätige jetzt zuerst deine E-Mail-Adresse über den Link in der Mail.', 'info', 10000);
        } catch (error) {
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 400);
            }
            UI.showToast(error.message, 'error');
        }
    },

    // Handle adding a new user (Admin only)
    async handleAddUser() {
        Logger.action('Add User Attempt');
        if (!Auth.isAdmin()) {
            UI.showToast('Keine Berechtigung', 'error');
            return;
        }

        const firstName = document.getElementById('newUserFirstName').value.trim();
        const lastName = document.getElementById('newUserLastName').value.trim();
        const email = document.getElementById('newUserEmail').value.trim();
        const username = document.getElementById('newUserUsername').value.trim();
        const password = document.getElementById('newUserPassword').value;
        const isAdmin = document.getElementById('newUserIsAdmin').checked;

        console.log('[handleAddUser] Form values:', { firstName, lastName, email, username, passwordLength: password.length, isAdmin });

        if (!firstName || !lastName || !email || !username || !password) {
            UI.showToast('Bitte alle Felder ausfüllen', 'error');
            console.warn('[handleAddUser] Missing fields');
            return;
        }

        if (password.length < 6) {
            UI.showToast('Passwort muss mindestens 6 Zeichen lang sein', 'error');
            return;
        }

        let loadingTimeout;
        try {
            UI.showLoading('Erstelle Benutzer...');
            loadingTimeout = setTimeout(() => {
                UI.hideLoading();
                UI.showToast('Timeout beim Erstellen des Benutzers. Bitte prüfe die Verbindung.', 'error');
            }, 5000);
            console.log('[handleAddUser] Loading shown, checking existing users...');

            // Check if username or email already exists
            const existingUsers = await Storage.getAll('users');
            console.log('[handleAddUser] Existing users count:', existingUsers.length);

            const usernameExists = existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase());
            const emailExists = existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase());

            if (usernameExists) {
                clearTimeout(loadingTimeout);
                UI.hideLoading();
                UI.showToast('Benutzername existiert bereits', 'error');
                return;
            }

            if (emailExists) {
                clearTimeout(loadingTimeout);
                UI.hideLoading();
                UI.showToast('E-Mail-Adresse existiert bereits', 'error');
                return;
            }

            console.log('[handleAddUser] Creating user via Auth.createUserByAdmin...');
            const newUserId = await Auth.createUserByAdmin(firstName, lastName, email, username, password, '');
            console.log('[handleAddUser] User created, ID:', newUserId);

            // If admin checkbox was checked, update role
            if (isAdmin) {
                console.log('[handleAddUser] Setting admin role...');
                // Wait for profile to be created by trigger
                let profile = null;
                let attempts = 0;
                while (!profile && attempts < 10) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    profile = await Storage.getById('users', newUserId);
                    attempts++;
                }

                if (profile) {
                    await Storage.updateUser(newUserId, { role: 'admin' });
                    console.log('[handleAddUser] Admin role applied.');
                } else {
                    console.warn('[handleAddUser] Profile not found after timeout, could not apply Admin role.');
                    UI.showToast('Benutzer erstellt, aber Admin-Rechte konnten nicht gesetzt werden (Timeout).', 'warning');
                }
            }

            clearTimeout(loadingTimeout);
            UI.hideLoading();
            UI.showToast(`Benutzer "${firstName} ${lastName}" erfolgreich angelegt!`, 'success');
            UI.closeModal('addUserModal');
            UI.clearForm('addUserForm');

            // Refresh users list
            await this.renderUsersList();
            console.log('[handleAddUser] Done!');
        } catch (error) {
            if (loadingTimeout) clearTimeout(loadingTimeout);
            console.error('[handleAddUser] Error:', error);
            UI.hideLoading();
            UI.showToast(error.message, 'error');
        }
    },

    // Handle logout
    handleLogout() {
        // 1. Clear navigation state to prevent issues on re-login
        document.querySelectorAll('.nav-group.submenu-open').forEach(g => g.classList.remove('submenu-open'));
        document.querySelectorAll('.nav-item.active, .nav-subitem.active, .sidebar-main.active, .sidebar-subitem.active').forEach(i => i.classList.remove('active'));

        // 2. Clear any lingering modal/overlay states
        document.body.classList.remove('modal-open');
        this.clearPersistedNavigationState();

        Auth.logout();
        UI.showToast('Erfolgreich abgemeldet', 'success');
        this.showAuth();

        // Final safety: Force layout calculation on logout
        void document.body.offsetHeight;
    },

    // News Management
    async renderNewsView(force = false) {
        // Show loading overlay if present
        const overlay = document.getElementById('globalLoadingOverlay');

        // Nur laden, wenn noch keine News im Speicher ODER force refresh
        if (!force && this.newsItems && Array.isArray(this.newsItems) && this.newsItems.length > 0) {
            this.renderNewsList(this.newsItems);
            // CRITICAL FIX: Hide overlay when using cached news
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 400);
            }
            return;
        }

        if (overlay) {
            if (typeof window.showGlobalLoadingOverlay === 'function') {
                window.showGlobalLoadingOverlay();
            } else {
                overlay.style.display = 'flex';
                overlay.style.opacity = '1';
            }
        }
        Logger.time('News Full Refresh'); // Added missing start timer
        Logger.time('Render News');
        const newsItems = await Storage.getAllNews();
        this.newsItems = newsItems;
        Logger.time('News Render');
        this.renderNewsList(newsItems);
        Logger.timeEnd('News Render');
        Logger.timeEnd('News Full Refresh');
    },

    renderNewsList(newsItems) {
        const overlay = document.getElementById('globalLoadingOverlay');
        const container = document.getElementById('newsContainer');
        const isAdmin = Auth.isAdmin();
        const currentUser = Auth.getCurrentUser();

        if (!newsItems || newsItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📰</div>
                    <p>Noch keine News oder Updates vorhanden.</p>
                    <p>Hier wirst du auf dem laufenden gehalten.</p>
                </div>
            `;
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 400);
            }
            return;
        }

        container.innerHTML = newsItems.map(news => {
            const date = new Date(news.createdAt).toLocaleDateString('de-DE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const deleteBtn = isAdmin ? `
                <button class="btn-icon delete-news" data-id="${news.id}" title="News löschen">
                    🗑️
                </button>
            ` : '';

            // allow editing for admins or the author
            let canEdit = false;
            if (currentUser) {
                canEdit = isAdmin || news.createdBy === currentUser.id;
            }

            const editBtn = canEdit ? `
                <button class="btn-icon edit-news" data-id="${news.id}" title="News bearbeiten">✏️</button>
            ` : '';

            // Render images with modern grid layout
            let imagesHtml = '';
            if (news.images && Array.isArray(news.images) && news.images.length > 0) {
                const imgs = news.images.slice(0, 3).map(imgSrc => `
                    <div class="news-image-preview">
                        <img src="${imgSrc}" alt="News preview" />
                    </div>
                `).join('');
                const moreIndicator = news.images.length > 3 ? `<div class="news-more-images">+${news.images.length - 3}</div>` : '';
                imagesHtml = `<div class="news-image-grid">${imgs}${moreIndicator}</div>`;
            }

            // mark unread for this user
            const isReadForUser = currentUser && Array.isArray(news.readBy) && news.readBy.includes(currentUser.id);

            // Extract plain text for preview (strip HTML)
            const plainContent = RichTextEditor.getPlainText(news.content || '');
            const truncatedContent = this.truncateText(plainContent, 150);

            return `
                <div class="news-card news-card-modern ${!isReadForUser ? 'news-card-unread' : ''}" data-id="${news.id}">
                    <div class="news-card-header">
                        <div class="news-card-title-section">
                            <h3 class="news-card-title">${this.escapeHtml(news.title)}</h3>
                            ${!isReadForUser ? '<span class="news-badge-new">NEU</span>' : ''}
                        </div>
                        <div class="news-card-actions">
                            ${editBtn}
                            ${deleteBtn}
                        </div>
                    </div>
                    <p class="news-card-date">📅 ${date}</p>
                    ${imagesHtml}
                    <p class="news-card-content">${this.escapeHtml(truncatedContent)}</p>
                    <div class="news-card-footer">
                        <span class="news-card-expand">Mehr anzeigen <span class="expand-icon">→</span></span>
                    </div>
                </div>
            `;
        }).join('');

        // Add delete handlers
        container.querySelectorAll('.delete-news').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteNews(btn.dataset.id);
            });
        });

        // Add edit handlers
        container.querySelectorAll('.edit-news').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openEditNews(btn.dataset.id);
            });
        });

        // Open detail modal on card click
        container.querySelectorAll('.news-card').forEach(card => {
            card.addEventListener('click', async (e) => {
                // Ignore clicks on interactive buttons (they stopPropagation above)
                const id = card.dataset.id;
                await this.openNewsDetail(id);
            });
        });
        // Overlay ausblenden, wenn alles fertig
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 400);
        }
    },

    async canCurrentUserCreateNews(user = Auth.getCurrentUser()) {
        if (!user) return false;
        return Auth.isAdmin();
    },

    resetNewsComposer() {
        const titleInput = document.getElementById('newsTitle');
        if (titleInput) {
            titleInput.value = '';
        }

        RichTextEditor.clear();

        const imagesInput = document.getElementById('newsImages');
        if (imagesInput) {
            imagesInput.value = null;
        }

        const preview = document.getElementById('newsImagesPreview');
        if (preview) {
            preview.innerHTML = '';
        }

        const editIdInput = document.getElementById('editNewsId');
        if (editIdInput) {
            editIdInput.value = '';
        }

        const modalTitle = document.querySelector('#createNewsModal .modal-header h2');
        if (modalTitle) {
            modalTitle.textContent = 'News erstellen';
        }

        const submitBtn = document.querySelector('#createNewsModal .modal-actions .btn-primary');
        if (submitBtn) {
            submitBtn.textContent = 'Veröffentlichen';
        }
    },

    async handleCreateNews() {
        const title = document.getElementById('newsTitle').value.trim();
        // Use Rich Text Editor content
        let content = RichTextEditor.getContent();
        content = RichTextEditor.sanitize(content);

        const imagesInput = document.getElementById('newsImages');
        const editIdInput = document.getElementById('editNewsId');
        const user = Auth.getCurrentUser();
        const editId = editIdInput ? editIdInput.value : '';
        let successMessage = '';

        try {
            if (!user) {
                UI.showToast('Keine Berechtigung', 'error');
                return;
            }

            if (!editId) {
                const canCreateNews = await this.canCurrentUserCreateNews(user);
                if (!canCreateNews) {
                    UI.showToast('Keine Berechtigung – nur Admins dürfen News erstellen.', 'error');
                    return;
                }
            }

            // Read image files (convert to data URLs) - these are ADDITIONAL attachments, distinct from inline images
            const images = [];
            if (imagesInput && imagesInput.files && imagesInput.files.length > 0) {
                const files = Array.from(imagesInput.files).slice(0, 6); // limit to 6 images
                const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                try {
                    const results = await Promise.all(files.map(f => readFileAsDataURL(f)));
                    results.forEach(r => images.push(r));
                } catch (err) {
                    console.error('Fehler beim Lesen der Bilddateien', err);
                    UI.showToast('Fehler beim Verarbeiten der Bilder', 'error');
                }
            }

            // If edit mode -> update existing item, else create new
            if (editId) {
                // fetch existing
                const existing = await Storage.getById('news', editId);
                if (!existing) {
                    UI.showToast('News nicht gefunden', 'error');
                    return;
                }

                // Only allow editor if admin or original author
                if (!(Auth.isAdmin() || existing.createdBy === user.id)) {
                    UI.showToast('Keine Berechtigung zum Bearbeiten', 'error');
                    return;
                }

                // If no new images selected, keep existing images
                let finalImages = existing.images || [];
                if (imagesInput && imagesInput.files && imagesInput.files.length > 0) {
                    const files = Array.from(imagesInput.files).slice(0, 6);
                    const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    try {
                        const results = await Promise.all(files.map(f => readFileAsDataURL(f)));
                        finalImages = results.slice();
                    } catch (err) {
                        console.error('Fehler beim Lesen der Bilddateien', err);
                        UI.showToast('Fehler beim Verarbeiten der Bilder', 'error');
                    }
                }

                await Storage.updateNewsItem(editId, {
                    title,
                    content, // Rich Text HTML
                    images: finalImages,
                    updatedAt: new Date().toISOString(),
                    updatedBy: user.id,
                    // reset read state so others see it as new again
                    readBy: [user.id]
                });
                successMessage = 'News aktualisiert!';
            } else {
                // Check if title or content is provided
                if (!title || !content || content === '<p><br></p>') {
                    UI.showToast('Bitte Titel und Inhalt eingeben', 'error');
                    return;
                }
                await Storage.createNewsItem(title, content, user.id, images);
                successMessage = 'News veröffentlicht!';
            }
        } catch (error) {
            console.error('[handleCreateNews] Fehler:', error);
            UI.showToast(error.message || 'Fehler beim Speichern der News', 'error');
            return;
        }

        this.resetNewsComposer();
        UI.closeModal('createNewsModal');
        UI.showToast(successMessage, 'success');

        // Clear cache to force refresh
        this.newsItems = null;

        void this.navigateTo('news', 'news-refresh').catch(error => {
            console.error('[handleCreateNews] News-Refresh fehlgeschlagen:', error);
        });
        void this.updateNewsNavBadge().catch(error => {
            console.error('[handleCreateNews] Badge-Update fehlgeschlagen:', error);
        });
    },

    async deleteNews(newsId) {
        const confirmed = await UI.confirmDelete('Möchtest du diese News wirklich löschen?');
        if (confirmed) {
            await Storage.deleteNewsItem(newsId);
            UI.showToast('News gelöscht', 'success');
            // Clear cache to force refresh
            this.newsItems = null;
            await this.renderNewsView();
            await this.updateNewsNavBadge();
        }
    },

    // Open the create/edit news modal populated for editing
    async openEditNews(newsId) {
        const news = await Storage.getById('news', newsId);
        if (!news) {
            console.error('News not found:', newsId);
            UI.showToast('News nicht gefunden', 'error');
            return;
        }
        const user = Auth.getCurrentUser();
        if (!user) return;

        // Only allow editing if admin or author
        if (!(Auth.isAdmin() || news.createdBy === user.id)) {
            UI.showToast('Keine Berechtigung zum Bearbeiten', 'error');
            return;
        }

        console.log('Opening edit for news:', news);

        // Reset file input first
        const imagesInput = document.getElementById('newsImages');
        if (imagesInput) imagesInput.value = '';

        // Populate form
        const titleInput = document.getElementById('newsTitle');
        const editInput = document.getElementById('editNewsId');

        if (titleInput) titleInput.value = news.title || '';
        if (editInput) editInput.value = news.id;

        console.log('Populated fields - Title:', news.title, 'Content:', news.content);

        // Render previews from existing images
        const preview = document.getElementById('newsImagesPreview');
        if (preview) {
            preview.innerHTML = '';
            if (news.images && Array.isArray(news.images) && news.images.length > 0) {
                news.images.forEach(src => {
                    const img = document.createElement('img');
                    img.src = src;
                    img.style.width = '80px';
                    img.style.height = '80px';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '6px';
                    preview.appendChild(img);
                });
            }
        }

        // Update modal title and button text
        const modalTitle = document.querySelector('#createNewsModal .modal-header h2');
        if (modalTitle) modalTitle.textContent = 'News bearbeiten';
        const submitBtn = document.querySelector('#createNewsModal .modal-actions .btn-primary');
        if (submitBtn) submitBtn.textContent = 'Speichern';

        UI.openModal('createNewsModal');

        // Init Quill and populate content after modal is open (so DOM is visible)
        setTimeout(() => {
            RichTextEditor.init();
            RichTextEditor.setContent(news.content || '');
        }, 50);

    },

    // Truncate text to a maximum length
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    },

    getConfirmedRehearsalDate(rehearsal) {
        if (!rehearsal) return null;
        if (rehearsal.confirmedDate) return rehearsal.confirmedDate;

        if (!Array.isArray(rehearsal.proposedDates)) {
            return null;
        }

        const confirmedProposal = rehearsal.proposedDates.find(proposal => proposal && typeof proposal === 'object' && proposal.confirmed);
        if (confirmedProposal) {
            return confirmedProposal.startTime || confirmedProposal.endTime || null;
        }

        if (
            typeof rehearsal.confirmedDateIndex === 'number' &&
            rehearsal.proposedDates[rehearsal.confirmedDateIndex] !== undefined
        ) {
            const indexedProposal = rehearsal.proposedDates[rehearsal.confirmedDateIndex];
            return typeof indexedProposal === 'string' ? indexedProposal : indexedProposal?.startTime || null;
        }

        return null;
    },

    getDashboardEventDisplayDate(event) {
        if (typeof Events !== 'undefined' && typeof Events.getDisplayDateForEvent === 'function') {
            const displayDate = Events.getDisplayDateForEvent(event);
            if (displayDate && !Number.isNaN(displayDate.getTime())) {
                return displayDate;
            }
        }

        if (!event?.date) return null;
        const fallbackDate = new Date(event.date);
        return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
    },

    getDashboardRehearsalDisplayDate(rehearsal) {
        if (typeof Rehearsals !== 'undefined' && typeof Rehearsals.getDisplayDateForRehearsal === 'function') {
            const displayDate = Rehearsals.getDisplayDateForRehearsal(rehearsal);
            if (displayDate && !Number.isNaN(displayDate.getTime())) {
                return displayDate;
            }
        }

        const rawValue = this.getConfirmedRehearsalDate(rehearsal);
        if (!rawValue) return null;

        const fallbackDate = new Date(rawValue);
        if (Number.isNaN(fallbackDate.getTime())) return null;

        if (typeof rawValue === 'string') {
            const timeMatch = rawValue.match(/T(\d{2}):(\d{2})/);
            if (timeMatch) {
                fallbackDate.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
            }
        }

        return fallbackDate;
    },

    // Open news detail modal
    async openNewsDetail(newsId) {
        const news = await Storage.getById('news', newsId);
        if (!news) {
            UI.showToast('News nicht gefunden', 'error');
            return;
        }

        // Reset Containers
        const heroContainer = document.getElementById('newsDetailHero');
        const imagesContainer = document.getElementById('newsDetailImages');
        const imagesSection = document.getElementById('newsDetailImagesSection');
        const metaContainer = document.getElementById('newsDetailMeta');
        const leadElement = document.getElementById('newsDetailLead');
        const imagesCountElement = document.getElementById('newsDetailImagesCount');
        heroContainer.innerHTML = '';
        imagesContainer.innerHTML = '';
        if (metaContainer) metaContainer.innerHTML = '';
        if (leadElement) {
            leadElement.textContent = '';
            leadElement.style.display = 'none';
        }
        if (imagesCountElement) imagesCountElement.textContent = '';
        if (imagesSection) imagesSection.style.display = 'none';

        // Determine Hero Image vs Gallery Images
        let heroImgSrc = null;
        let galleryImages = [];

        if (news.images && Array.isArray(news.images) && news.images.length > 0) {
            heroImgSrc = news.images[0]; // First image is Hero
            galleryImages = news.images.slice(1); // Rest are gallery
        }

        // Render Hero
        if (heroImgSrc) {
            heroContainer.innerHTML = `<img src="${heroImgSrc}" class="news-hero-image" alt="Titelbild">`;
        } else {
            // Creative Placeholder
            heroContainer.innerHTML = `
                <div class="news-hero-placeholder">
                    <span>📰</span>
                </div>
            `;
        }

        // Populate Text
        document.getElementById('newsDetailTitle').textContent = news.title || '';
        const author = news.createdBy ? await Storage.getById('users', news.createdBy) : null;
        const authorName = author ? UI.getUserDisplayName(author) : '';

        const date = new Date(news.createdAt).toLocaleDateString('de-DE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('newsDetailDate').textContent = date;

        if (metaContainer) {
            const metaItems = [
                '<span class="news-detail-pill news-detail-pill-accent">Aktuelle Info</span>'
            ];

            if (authorName) {
                metaItems.push(`<span class="news-detail-pill">Von ${this.escapeHtml(authorName)}</span>`);
            }

            if (heroImgSrc) {
                const imageCount = news.images.length;
                metaItems.push(`<span class="news-detail-pill">${imageCount} Bild${imageCount === 1 ? '' : 'er'}</span>`);
            }

            metaContainer.innerHTML = metaItems.join('');
        }

        // Use innerHTML directly (content is sanitized on save by RichTextEditor)
        document.getElementById('newsDetailContent').innerHTML = news.content || '';

        if (leadElement) {
            const plainContent = RichTextEditor.getPlainText(news.content || '').trim();
            const leadText = plainContent.length > 140 ? this.truncateText(plainContent, 190) : '';
            if (leadText) {
                leadElement.textContent = leadText;
                leadElement.style.display = '';
            }
        }

        // Render remaining images in modern gallery grid
        if (galleryImages.length > 0) {
            // Create gallery grid based on image count
            const galleryClass = galleryImages.length === 1 ? 'news-gallery-grid-single' : 'news-gallery-grid';
            const gallery = document.createElement('div');
            gallery.className = galleryClass;

            galleryImages.forEach(imgSrc => {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'news-gallery-item';

                const img = document.createElement('img');
                img.src = imgSrc;
                img.alt = 'Galeriebild';

                imgWrapper.appendChild(img);
                gallery.appendChild(imgWrapper);
            });

            if (imagesSection) {
                imagesSection.style.display = 'block';
            }
            if (imagesCountElement) {
                imagesCountElement.textContent = `${galleryImages.length} weitere${galleryImages.length === 1 ? 's Bild' : ' Bilder'}`;
            }
            imagesContainer.appendChild(gallery);
        }

        // Open modal IMMEDIATELY for perceived performance
        UI.openModal('newsDetailModal');

        // Attach Lightbox listeners
        this.setupNewsLightbox();

        // Mark as read in BACKGROUND (don't await to block UI)
        const user = Auth.getCurrentUser();
        if (user) {
            // We use a non-blocking async function inside
            (async () => {
                try {
                    await Storage.markNewsRead(newsId, user.id);
                    // Update badge and banner silently
                    await this.updateNewsNavBadge();
                    // Optional: refresh list if needed, but avoid layout shift
                } catch (error) {
                    console.error('Error marking news as read:', error);
                }
            })();
        }
    },

    setupNewsLightbox() {
        // Attach Lightbox listeners to all images (Hero + Inline + Gallery)
        setTimeout(() => {
            const allImages = [
                ...document.querySelectorAll('#newsDetailHero img'),
                ...document.querySelectorAll('#newsDetailContent img'),
                ...document.querySelectorAll('#newsDetailImages img')
            ];

            allImages.forEach(img => {
                img.style.cursor = 'zoom-in'; // Ensure cursor shows interactivity
                img.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent modal interactions
                    UI.showLightbox(img.src);
                });
            });
        }, 100); // Small delay to ensure DOM is updated
    },

    // Update the news nav item with an unread indicator for the current user
    async updateNewsNavBadge() {
        const user = Auth.getCurrentUser();
        const navLabel = document.querySelector('.nav-item[data-view="news"] .nav-label');
        if (!navLabel) return;
        const existing = document.getElementById('newsUnreadBadge');
        const count = user ? await Storage.getUnreadNewsCountForUser(user.id) : 0;
        if (count > 0) {
            if (!existing) {
                const span = document.createElement('span');
                span.id = 'newsUnreadBadge';
                span.textContent = ' •';
                span.style.color = '#e11d48';
                span.style.fontSize = '0.9rem';
                span.style.marginLeft = '6px';
                span.setAttribute('aria-hidden', 'true');
                navLabel.appendChild(span);
            }
        } else {
            if (existing) existing.remove();
        }
    },

    // Check for unread news and show banner
    async checkAndShowNewsBanner() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const unreadCount = await Storage.getUnreadNewsCountForUser(user.id);
        if (unreadCount === 0) return;

        // Check if user has dismissed the banner recently (within last 24 hours)
        const dismissedTime = localStorage.getItem(`newsBanner_dismissed_${user.id}`);
        if (dismissedTime) {
            const hoursSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60);
            if (hoursSinceDismissed < 24) {
                return; // Don't show if dismissed within last 24 hours
            }
        }

        // Get the latest unread news
        const allNews = await Storage.getAllNews();
        const unreadNews = allNews.filter(n => !n.readBy || !n.readBy.includes(user.id));

        if (unreadNews.length === 0) return;

        // Show banner with count
        const banner = document.getElementById('newsBanner');
        const message = document.getElementById('newsBannerMessage');

        if (banner && message) {
            const newsText = unreadCount === 1
                ? '1 neue News verfügbar'
                : `${unreadCount} neue News verfügbar`;
            message.textContent = newsText;
            banner.style.display = 'block';
        }
    },

    hideNewsBanner() {
        const banner = document.getElementById('newsBanner');
        if (banner) {
            banner.style.display = 'none';
        }
    },

    async checkAndShowVoteBanner() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        let leaderBandIds = [];
        try {
            const bands = await Storage.getUserBands(user.id);
            leaderBandIds = (bands || [])
                .filter(b => ['leader', 'co-leader'].includes(b.role))
                .map(b => String(b.id));
        } catch (err) {
            console.warn('[voteBanner] Could not load bands:', err);
            return;
        }

        if (leaderBandIds.length === 0) return;

        const [events, rehearsals] = await Promise.all([
            Storage.getUserEvents(user.id),
            Storage.getUserRehearsals(user.id)
        ]);

        const leaderEvents = (events || []).filter(e => leaderBandIds.includes(String(e.bandId)));
        const leaderRehearsals = (rehearsals || []).filter(r => leaderBandIds.includes(String(r.bandId)));

        const eventIds = leaderEvents.map(e => String(e.id)).filter(Boolean);
        const rehearsalIds = leaderRehearsals.map(r => String(r.id)).filter(Boolean);

        if (eventIds.length === 0 && rehearsalIds.length === 0) return;

        const [eventVotes, rehearsalVotes] = await Promise.all([
            Storage.getEventVotesForMultipleEvents(eventIds),
            Storage.getRehearsalVotesForMultipleRehearsals(rehearsalIds)
        ]);

        const votes = []
            .concat((eventVotes || []).map(v => ({ ...v, _type: 'event' })))
            .concat((rehearsalVotes || []).map(v => ({ ...v, _type: 'rehearsal' })))
            .filter(v => v.createdAt && String(v.userId) !== String(user.id));

        if (votes.length === 0) return;

        const lastSeenRaw = localStorage.getItem(`voteBanner_seen_${user.id}`);
        const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : 0;
        const newVotes = votes.filter(v => new Date(v.createdAt).getTime() > lastSeen);

        if (newVotes.length === 0) return;

        const latestVote = newVotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        const latestTs = new Date(latestVote.createdAt).getTime();
        const targetView = latestVote._type === 'rehearsal' ? 'rehearsals' : 'events';

        const banner = document.getElementById('voteBanner');
        const message = document.getElementById('voteBannerMessage');

        if (banner && message) {
            const voteText = newVotes.length === 1
                ? '1 neue Abstimmung eingegangen'
                : `${newVotes.length} neue Abstimmungen eingegangen`;
            message.textContent = voteText;
            banner.dataset.latestVoteTs = String(latestTs);
            banner.dataset.targetView = targetView;
            banner.style.display = 'block';
            banner.style.animation = 'none';
            banner.offsetHeight;
            banner.style.animation = 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        }
    },

    hideVoteBanner(markSeen = false) {
        const banner = document.getElementById('voteBanner');
        if (banner) {
            banner.style.display = 'none';
        }
        if (!markSeen) return;
        const user = Auth.getCurrentUser();
        if (!user) return;
        const latestTs = banner?.dataset?.latestVoteTs ? Number(banner.dataset.latestVoteTs) : Date.now();
        localStorage.setItem(`voteBanner_seen_${user.id}`, String(latestTs));
    },

    // Return array of conflicts for given band and dates (dates = array of ISO strings)
    async getAbsenceConflicts(bandId, dates, selectedMemberIds = null) {
        if (!bandId || !dates || dates.length === 0) return [];
        const members = await Storage.getBandMembers(bandId);
        if (!Array.isArray(members)) return [];

        const selectedIds = Array.isArray(selectedMemberIds)
            ? new Set(selectedMemberIds.map(id => String(id)).filter(Boolean))
            : null;

        const relevantMembers = selectedIds
            ? members.filter(member => selectedIds.has(String(member.userId)))
            : members;

        const conflicts = [];

        for (const m of relevantMembers) {
            const user = await Storage.getById('users', m.userId);
            if (!user) continue;
            const badDates = [];
            for (const d of dates) {
                if (!d) continue;
                try {
                    const rangeStart = typeof d === 'object' && d.start ? d.start : d;
                    const rangeEnd = typeof d === 'object' && d.end ? d.end : rangeStart;

                    if (await Storage.isUserUnavailableInRange(user.id, rangeStart, rangeEnd)) {
                        // Format date nicely
                        badDates.push(UI.formatDateOnly(new Date(rangeStart).toISOString()));
                    }
                } catch (e) {
                    // ignore parse errors
                }
            }
            if (badDates.length > 0) {
                const displayName = (typeof UI !== 'undefined' && typeof UI.getUserDisplayName === 'function')
                    ? UI.getUserDisplayName(user)
                    : (user.name || user.username || user.email || 'Ein Mitglied');
                conflicts.push({ name: displayName, userId: user.id, dates: badDates });
            }
        }

        return conflicts;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    escapeHtmlAttr(text) {
        return this.escapeHtml(text).replace(/"/g, '&quot;');
    },

    getRundownInlineIcon(name = 'trash') {
        const icons = {
            drag: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="6" cy="5" r="1.2" fill="currentColor"></circle>
                    <circle cx="6" cy="10" r="1.2" fill="currentColor"></circle>
                    <circle cx="6" cy="15" r="1.2" fill="currentColor"></circle>
                    <circle cx="13.5" cy="5" r="1.2" fill="currentColor"></circle>
                    <circle cx="13.5" cy="10" r="1.2" fill="currentColor"></circle>
                    <circle cx="13.5" cy="15" r="1.2" fill="currentColor"></circle>
                </svg>
            `,
            edit: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4 13.75V16h2.25L14.8 7.45l-2.25-2.25L4 13.75Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    <path d="M11.95 5.8 14.2 8.05" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
            `,
            trash: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4.75 6h10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    <path d="M7.25 6V4.75c0-.41.34-.75.75-.75h4c.41 0 .75.34.75.75V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    <path d="M6.25 6.75 6.9 14.7c.05.74.67 1.3 1.4 1.3h3.4c.73 0 1.35-.56 1.4-1.3l.65-7.95" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    <path d="M8.35 9.15v4.2M11.65 9.15v4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
            `,
            pdf: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M6 3.75h5.2l3.55 3.55V16a.75.75 0 0 1-.75.75H6A.75.75 0 0 1 5.25 16V4.5A.75.75 0 0 1 6 3.75Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    <path d="M10.95 3.75V7.3h3.55" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    <path d="M7.5 10.15h5M7.5 12.6h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
                </svg>
            `,
            download: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 3.75v7.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    <path d="m6.9 8.8 3.1 3.35 3.1-3.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M4.75 13.75v1.1c0 .62.5 1.15 1.15 1.15h8.2c.64 0 1.15-.53 1.15-1.15v-1.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            `,
            plus: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 4.5v11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                    <path d="M4.5 10h11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                </svg>
            `,
            chordpro: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M12.75 4.25v8.15a2.35 2.35 0 1 1-1.5-2.22V7.1l4-1.2v5.1a2.35 2.35 0 1 1-1.5-2.22V4.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            `,
            chevron: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="m6.25 8 3.75 4 3.75-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            `,
            close: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M6.25 6.25 13.75 13.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                    <path d="M13.75 6.25 6.25 13.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
            `,
            stats: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4.75 15.25V8.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                    <path d="M10 15.25V4.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                    <path d="M15.25 15.25v-5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                    <path d="M3.75 15.25h12.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                </svg>
            `,
            trophy: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M6.25 4.5h7.5v2.75a3.75 3.75 0 0 1-7.5 0V4.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    <path d="M6.25 5.5H4.9a1.65 1.65 0 0 0-1.65 1.65v.1A2.75 2.75 0 0 0 6 10h.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M13.75 5.5h1.35a1.65 1.65 0 0 1 1.65 1.65v.1A2.75 2.75 0 0 1 14 10h-.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M10 11v2.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    <path d="M7.5 15.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
            `,
            calendar: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <rect x="3.75" y="5.25" width="12.5" height="11" rx="2" stroke="currentColor" stroke-width="1.6"></rect>
                    <path d="M6.75 3.75v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    <path d="M13.25 3.75v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    <path d="M3.75 8.25h12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
            `,
            clock: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="6.25" stroke="currentColor" stroke-width="1.6"></circle>
                    <path d="M10 6.9v3.45l2.35 1.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            `,
            check: `
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4.5 10.5 8 14l7.5-7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            `
        };

        return icons[name] || icons.trash;
    },

    renderRundownSongSummaryChips(songs = [], options = {}) {
        const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 5;
        const emptyText = options.emptyText || 'Noch keine Songs ausgewählt';
        const style = options.style === 'list' ? 'list' : 'pills';

        if (!Array.isArray(songs) || songs.length === 0) {
            return `<span class="event-rundown-song-summary-empty">${this.escapeHtml(emptyText)}</span>`;
        }

        const visibleSongs = songs.slice(0, limit);
        const remaining = songs.length - visibleSongs.length;

        if (style === 'list') {
            return `
                <div class="event-rundown-song-summary-lines">
                    ${visibleSongs.map((song) => `
                        <span class="event-rundown-song-summary-line">- ${this.escapeHtml(song?.title || 'Ohne Titel')}</span>
                    `).join('')}
                    ${remaining > 0 ? `<span class="event-rundown-song-summary-line is-muted">- ${remaining} weitere</span>` : ''}
                </div>
            `;
        }

        return `
            <div class="event-rundown-song-summary-list">
                ${visibleSongs.map((song) => `
                    <span class="event-rundown-song-summary-pill">${this.escapeHtml(song?.title || 'Ohne Titel')}</span>
                `).join('')}
                ${remaining > 0 ? `<span class="event-rundown-song-summary-pill is-muted">+${remaining}</span>` : ''}
            </div>
        `;
    },

    getSongInfoDisplay(song) {
        return Storage.getSongInfoPreview(song) || '-';
    },

    getEventRundownPresetDefinitions() {
        return {
            countdown: { label: 'Countdown', icon: '⏱️', defaultTitle: 'Countdown', defaultDuration: 3 },
            songblock: { label: 'Liederblock', icon: '🎵', defaultTitle: 'Liederblock', defaultDuration: 15 },
            vortrag: { label: 'Vortrag', icon: '🎙️', defaultTitle: 'Vortrag', defaultDuration: 15 },
            predigt: { label: 'Predigt', icon: '📖', defaultTitle: 'Predigt', defaultDuration: 30 },
            abendmahl: { label: 'Abendmahl', icon: '🍞', defaultTitle: 'Abendmahl', defaultDuration: 12 },
            pause: { label: 'Pause', icon: '☕', defaultTitle: 'Pause', defaultDuration: 25 },
            video: { label: 'Video Vortrag', icon: '🎬', defaultTitle: 'Video Vortrag', defaultDuration: 12 },
            rede: { label: 'Rede', icon: '🗣️', defaultTitle: 'Rede', defaultDuration: 10 },
            ankuendigungen: { label: 'Ankündigungen', icon: '📣', defaultTitle: 'Ankündigungen', defaultDuration: 8 },
            custom: { label: 'Programmpunkt', icon: '🕒', defaultTitle: 'Programmpunkt', defaultDuration: 10 }
        };
    },

    getEventRundownTypeMeta(type = 'custom') {
        const presets = this.getEventRundownPresetDefinitions();
        return presets[type] || presets.custom;
    },

    normalizeEventRundownTime(value = '') {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return '';
        const match = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return '';
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return '';
        }
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    },

    timeStringToMinutes(value = '') {
        const normalized = this.normalizeEventRundownTime(value);
        if (!normalized) return null;
        const [hours, minutes] = normalized.split(':').map(Number);
        return (hours * 60) + minutes;
    },

    minutesToTimeString(totalMinutes) {
        if (!Number.isFinite(totalMinutes)) return '—';
        let normalized = Math.round(totalMinutes) % 1440;
        if (normalized < 0) normalized += 1440;
        const hours = Math.floor(normalized / 60);
        const minutes = normalized % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    },

    formatRundownDuration(duration = 0) {
        const safeDuration = Math.max(0, Number(duration) || 0);
        if (safeDuration >= 60) {
            const hours = Math.floor(safeDuration / 60);
            const minutes = safeDuration % 60;
            return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
        }
        return `${safeDuration}min`;
    },

    createDraftEventRundownItem(type = 'custom') {
        const meta = this.getEventRundownTypeMeta(type);
        return {
            id: typeof Storage !== 'undefined' && typeof Storage.generateId === 'function'
                ? Storage.generateId()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            type,
            title: meta.defaultTitle,
            duration: meta.defaultDuration,
            notes: '',
            songIds: [],
            isPickerOpen: false,
            isCollapsed: false
        };
    },

    normalizeEventRundownData(rundown = null) {
        const source = (rundown && typeof rundown === 'object') ? rundown : {};
        const items = Array.isArray(source.items) ? source.items : [];

        return {
            startTime: this.normalizeEventRundownTime(source.startTime || source.scheduleStart || ''),
            sourceEventTime: this.normalizeEventRundownTime(source.sourceEventTime || ''),
            items: items.map((item) => {
                if (!item || typeof item !== 'object') return null;
                const type = item.type || 'custom';
                const meta = this.getEventRundownTypeMeta(type);
                const duration = Math.max(0, Number(item.duration ?? meta.defaultDuration) || meta.defaultDuration);
                return {
                    id: item.id || (typeof Storage !== 'undefined' && typeof Storage.generateId === 'function'
                        ? Storage.generateId()
                        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
                    type,
                    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : meta.defaultTitle,
                    duration,
                    notes: typeof item.notes === 'string' ? item.notes : '',
                    songIds: Array.isArray(item.songIds) ? item.songIds.map(String).filter(Boolean) : [],
                    isPickerOpen: Boolean(item.isPickerOpen),
                    isCollapsed: Boolean(item.isCollapsed)
                };
            }).filter(Boolean)
        };
    },

    getPersistableDraftEventRundown() {
        const normalized = this.normalizeEventRundownData(this.draftEventRundown);
        return {
            startTime: normalized.startTime,
            sourceEventTime: this.getEventRundownEventTime() || normalized.sourceEventTime || '',
            items: normalized.items.map((item) => ({
                id: item.id,
                type: item.type,
                title: item.title,
                duration: item.duration,
                notes: item.notes,
                songIds: [...item.songIds],
                isCollapsed: Boolean(item.isCollapsed)
            }))
        };
    },

    extractEventVisibleInfo(rawInfo = '') {
        const text = typeof rawInfo === 'string' ? rawInfo : '';
        const markerIndex = text.indexOf(this.EVENT_RUNDOWN_MARKER_START);
        return markerIndex === -1 ? text.trim() : text.slice(0, markerIndex).trim();
    },

    extractEventRundown(rawInfo = '') {
        const text = typeof rawInfo === 'string' ? rawInfo : '';
        const startIndex = text.indexOf(this.EVENT_RUNDOWN_MARKER_START);
        const endIndex = text.indexOf(this.EVENT_RUNDOWN_MARKER_END);
        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
            return this.normalizeEventRundownData();
        }

        const jsonPayload = text
            .slice(startIndex + this.EVENT_RUNDOWN_MARKER_START.length, endIndex)
            .trim();

        if (!jsonPayload) {
            return this.normalizeEventRundownData();
        }

        try {
            return this.normalizeEventRundownData(JSON.parse(jsonPayload));
        } catch (error) {
            console.warn('[App] Event rundown could not be parsed:', error);
            return this.normalizeEventRundownData();
        }
    },

    composeEventInfoWithRundown(visibleInfo = '', rundown = null) {
        const cleanInfo = typeof visibleInfo === 'string' ? visibleInfo.trim() : '';
        const normalizedRundown = this.normalizeEventRundownData(rundown);
        const hasRundown = normalizedRundown.startTime || normalizedRundown.items.length > 0;

        if (!hasRundown) {
            return cleanInfo;
        }

        const payload = JSON.stringify({
            startTime: normalizedRundown.startTime,
            sourceEventTime: this.getEventRundownEventTime() || normalizedRundown.sourceEventTime || '',
            items: normalizedRundown.items.map((item) => ({
                id: item.id,
                type: item.type,
                title: item.title,
                duration: item.duration,
                notes: item.notes,
                songIds: [...item.songIds],
                isCollapsed: Boolean(item.isCollapsed)
            }))
        });

        return cleanInfo
            ? `${cleanInfo}\n\n${this.EVENT_RUNDOWN_MARKER_START}${payload}${this.EVENT_RUNDOWN_MARKER_END}`
            : `${this.EVENT_RUNDOWN_MARKER_START}${payload}${this.EVENT_RUNDOWN_MARKER_END}`;
    },

    getEventRundownFallbackStartTime() {
        const eventDateValue = (typeof Events !== 'undefined' && typeof Events.getFixedDateTimeValue === 'function')
            ? Events.getFixedDateTimeValue()
            : '';
        if (eventDateValue.includes('T')) {
            return this.normalizeEventRundownTime(eventDateValue.split('T')[1].slice(0, 5));
        }
        return '';
    },

    getEventRundownEventTime() {
        return this.getEventRundownFallbackStartTime();
    },

    syncDraftEventRundownStartFromEventDate(force = false) {
        if (!this.draftEventRundown || typeof this.draftEventRundown !== 'object') {
            this.draftEventRundown = this.normalizeEventRundownData();
        }

        const eventTime = this.getEventRundownEventTime();
        if (!eventTime) return;

        if (force || !this.draftEventRundown.startTime) {
            this.draftEventRundown.startTime = eventTime;
        }

        this.draftEventRundown.sourceEventTime = eventTime;
    },

    getEventRundownTimeline(rundown = null, fallbackStartTime = '') {
        const normalized = this.normalizeEventRundownData(rundown || this.draftEventRundown);
        const baseStartTime = normalized.startTime || this.normalizeEventRundownTime(fallbackStartTime) || '';
        let cursor = this.timeStringToMinutes(baseStartTime);
        const hasTimelineStart = Number.isFinite(cursor);

        return normalized.items.map((item, index) => {
            const startLabel = hasTimelineStart ? this.minutesToTimeString(cursor) : '—';
            const endMinutes = hasTimelineStart ? cursor + item.duration : null;
            const endLabel = hasTimelineStart ? this.minutesToTimeString(endMinutes) : '—';
            if (hasTimelineStart) {
                cursor = endMinutes;
            }
            return {
                ...item,
                index,
                startLabel,
                endLabel,
                durationLabel: this.formatRundownDuration(item.duration),
                typeMeta: this.getEventRundownTypeMeta(item.type)
            };
        });
    },

    async getCurrentEventSongsForRundown() {
        if (!Array.isArray(this.draftEventSongIds) || this.draftEventSongIds.length === 0) {
            return [];
        }

        const songs = await Promise.all(
            this.draftEventSongIds.map(async (songId, index) => {
                const song = await Storage.getById('songs', songId);
                if (!song) return null;
                return {
                    ...this.getDraftEventSong(song),
                    orderIndex: index + 1
                };
            })
        );

        return songs.filter(Boolean);
    },

    async getDraftEventSongsInRundownOrder() {
        if (!Array.isArray(this.draftEventSongIds) || this.draftEventSongIds.length === 0) {
            return [];
        }

        const songs = await Promise.all(
            this.draftEventSongIds.map(async (songId) => {
                const song = await Storage.getById('songs', songId);
                if (!song) return null;
                return this.getDraftEventSong(song);
            })
        );

        return songs.filter(Boolean);
    },

    async renderEventRundownEditor() {
        const container = document.getElementById('eventRundownList');
        const presetToolbar = document.getElementById('eventRundownPresetToolbar');
        const pdfButton = document.getElementById('eventRundownPdfBtn');
        if (!container || !presetToolbar) return;

        if (!this.draftEventRundown || typeof this.draftEventRundown !== 'object') {
            this.draftEventRundown = this.normalizeEventRundownData();
        }

        if (!presetToolbar.dataset.bound) {
            presetToolbar.dataset.bound = 'true';

            const dropdownBtn = document.getElementById('eventRundownDropdownBtn');
            const dropdownMenu = document.getElementById('eventRundownDropdownMenu');

            if (dropdownBtn && dropdownMenu) {
                dropdownBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdownMenu.classList.toggle('active');
                });

                document.addEventListener('click', (e) => {
                    if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
                        dropdownMenu.classList.remove('active');
                    }
                });
            }

            presetToolbar.querySelectorAll('.event-rundown-preset-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    this.addDraftEventRundownItem(button.dataset.rundownType || 'custom');
                    if (dropdownMenu) dropdownMenu.classList.remove('active');
                });
            });
        }

        const availableSongs = await this.getCurrentEventSongsForRundown();
        const availableSongMap = new Map(availableSongs.map((song) => [String(song.id), song]));
        const normalized = this.normalizeEventRundownData(this.draftEventRundown);
        let rundownMutated = false;

        normalized.items = normalized.items.map((item) => {
            const nextSongIds = item.songIds.filter((songId) => availableSongMap.has(String(songId)));
            if (nextSongIds.length !== item.songIds.length) {
                rundownMutated = true;
            }
            return {
                ...item,
                songIds: nextSongIds
            };
        });

        if (rundownMutated || JSON.stringify(normalized) !== JSON.stringify(this.normalizeEventRundownData(this.draftEventRundown))) {
            this.draftEventRundown = normalized;
        }

        this.syncDraftEventSongIdsFromRundown();
        if (pdfButton) {
            pdfButton.disabled = normalized.items.length === 0;
        }

        const fallbackStart = this.getEventRundownFallbackStartTime();
        const timeline = this.getEventRundownTimeline(normalized, fallbackStart);

        if (timeline.length === 0) {
            container.innerHTML = `
                <div class="event-rundown-empty">
                    <strong>Noch kein Ablauf hinterlegt.</strong>
                </div>
            `;
            return;
        }

        const renderSongTable = (item, selectedSongs) => `
            <div class="event-rundown-song-table-wrap">
                <table class="songs-table band-setlist-table event-setlist-table event-rundown-song-table">
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 40px;">Pos.</th>
                            <th style="text-align: center; width: 108px;">Aktionen</th>
                            <th>Titel</th>
                            <th>Interpret</th>
                            <th>BPM</th>
                            <th>Time</th>
                            <th>Tonart</th>
                            <th>Orig.</th>
                            <th>Lead</th>
                            <th>Sprache</th>
                            <th>Tracks</th>
                            <th style="text-align: center;">Dateien</th>
                            <th>Infos</th>
                            <th>CCLI</th>
                        </tr>
                    </thead>
                    <tbody data-rundown-song-table-body="${item.id}">
                        ${selectedSongs.map((song) => `
                            <tr draggable="true" data-rundown-song-id="${song.id}" data-rundown-item-id="${item.id}">
                                <td class="drag-handle" data-label="Pos.">⋮⋮</td>
                                <td class="band-setlist-actions-cell event-setlist-actions-cell" data-label="Aktionen">
                                    <div class="event-setlist-actions">
                                        <button type="button" class="btn-icon event-rundown-song-edit" title="Song bearbeiten">
                                            ${this.getRundownInlineIcon('edit')}
                                        </button>
                                        <button type="button" class="btn-icon event-rundown-song-remove" title="Song aus Liedblock entfernen">
                                            ${this.getRundownInlineIcon('trash')}
                                        </button>
                                    </div>
                                </td>
                                <td class="event-setlist-title-cell" data-label="Titel">${this.escapeHtml(song.title)}</td>
                                <td data-label="Interpret">${this.escapeHtml(song.artist || '-')}</td>
                                <td data-label="BPM">${song.bpm || '-'}</td>
                                <td data-label="Time">${song.timeSignature || '-'}</td>
                                <td class="event-setlist-key-cell" data-label="Tonart">${song.key || '-'}</td>
                                <td data-label="Orig.">${song.originalKey || '-'}</td>
                                <td data-label="Lead">${song.leadVocal || '-'}</td>
                                <td data-label="Sprache">${song.language || '-'}</td>
                                <td data-label="Tracks">${song.tracks === 'yes' ? 'Ja' : (song.tracks === 'no' ? 'Nein' : '-')}</td>
                                <td style="text-align: center;" data-label="Dateien">
                                    ${this.renderSongDocumentPreviewButtons(song)}
                                </td>
                                <td data-label="Infos">${this.escapeHtml(this.getSongInfoDisplay(song))}</td>
                                <td data-label="CCLI">${song.ccli || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = `
            <div class="event-rundown-board">
                <div class="event-rundown-board-head is-editor">
                    <span class="event-rundown-board-head-cell event-rundown-head-drag">Reihenfolge</span>
                    <span class="event-rundown-board-head-cell event-rundown-head-main">Ablaufpunkt</span>
                    <span class="event-rundown-board-head-cell event-rundown-head-timing">Timing</span>
                    <span class="event-rundown-board-head-cell event-rundown-head-actions">Aktionen</span>
                </div>
                <div class="event-rundown-items">
                ${timeline.map((item) => {
                    const selectedSongs = item.songIds
                        .map((songId) => availableSongMap.get(String(songId)))
                        .filter(Boolean);
                    const isSongblock = item.type === 'songblock';
                    const timeRange = item.startLabel === '—' && item.endLabel === '—'
                        ? 'Zeit offen'
                        : `${item.startLabel} - ${item.endLabel}`;
                    const songCountLabel = `${selectedSongs.length} Song${selectedSongs.length === 1 ? '' : 's'}`;

                    return `
                        <article class="event-rundown-item ${isSongblock ? 'is-songblock' : ''} ${item.isCollapsed ? 'is-collapsed' : 'is-expanded'}" draggable="true" data-rundown-id="${item.id}">
                            <div class="event-rundown-row-grid is-editor">
                                <div class="event-rundown-row-cell event-rundown-cell-drag">
                                    <button type="button" class="btn-icon event-rundown-drag-handle" title="Ziehen zum Verschieben" aria-label="Ziehen zum Verschieben">
                                        ${this.getRundownInlineIcon('drag')}
                                    </button>
                                </div>
                                <div class="event-rundown-row-cell event-rundown-cell-main">
                                    <div class="event-rundown-field-stack">
                                        <input type="text" class="event-rundown-title-input" value="${this.escapeHtmlAttr(item.title || '')}" placeholder="${this.escapeHtmlAttr(item.typeMeta.defaultTitle || item.typeMeta.label)}">
                                        <input type="text" class="event-rundown-notes-input" value="${this.escapeHtmlAttr(item.notes || '')}" placeholder="Kurze Notiz oder Moderation">
                                    </div>
                                    ${isSongblock ? `
                                        <div class="event-rundown-song-summary-row">
                                            <span class="event-rundown-song-counter">${songCountLabel}</span>
                                            ${item.isCollapsed ? this.renderRundownSongSummaryChips(selectedSongs, {
                                                limit: 6,
                                                emptyText: 'Noch keine Songs für diesen Block gewählt',
                                                style: 'list'
                                            }) : ''}
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="event-rundown-row-cell event-rundown-cell-timing">
                                    <div class="event-rundown-timing-shell">
                                        <div class="event-rundown-time-range event-rundown-time-range-pill">${timeRange}</div>
                                        <label class="event-rundown-duration-inline" for="rundownDuration-${item.id}">
                                            <span class="event-rundown-duration-inline-label">Dauer</span>
                                        </label>
                                        <div class="event-rundown-duration-input-wrap">
                                            <input type="number" min="1" max="240" id="rundownDuration-${item.id}" class="event-rundown-duration-input" value="${Number(item.duration) || 0}">
                                            <span>min</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="event-rundown-row-cell event-rundown-row-actions">
                                    ${isSongblock ? `
                                        <button type="button" class="btn btn-secondary btn-sm event-rundown-toggle" aria-expanded="${item.isCollapsed ? 'false' : 'true'}" title="${item.isCollapsed ? 'Songs anzeigen' : 'Songs einklappen'}">
                                            ${item.isCollapsed ? 'Öffnen' : 'Schließen'}
                                        </button>
                                    ` : ''}
                                    <button type="button" class="btn-icon event-rundown-delete" title="Baustein entfernen">
                                        ${this.getRundownInlineIcon('trash')}
                                    </button>
                                </div>
                            </div>
                            ${isSongblock ? `
                            <div class="event-rundown-item-body" ${item.isCollapsed ? 'hidden' : ''}>
                                <div class="event-rundown-song-block">
                                    <div class="event-rundown-song-block-top">
                                        <div class="event-rundown-song-block-actions">
                                            <button type="button" class="btn btn-secondary btn-sm event-rundown-song-pool">Band-Pool</button>
                                            <button type="button" class="btn btn-secondary btn-sm event-rundown-songpool-pool">Songpool</button>
                                            <button type="button" class="btn btn-secondary btn-sm event-rundown-song-new">Neuen Song anlegen</button>
                                        </div>
                                        <span class="event-rundown-song-hint">${selectedSongs.length > 0 ? `${songCountLabel} in diesem Block. Reihenfolge per Drag-and-drop anpassen.` : 'Füge Songs direkt aus dem Band-Pool, Songpool oder über einen neuen Song hinzu.'}</span>
                                    </div>
                                    ${selectedSongs.length > 0 ? `
                                        ${renderSongTable(item, selectedSongs)}
                                    ` : '<div class="event-rundown-song-empty">Noch keine Songs für diesen Block ausgewählt.</div>'}
                                </div>
                            </div>
                            ` : ''}
                        </article>
                    `;
                }).join('')}
                </div>
            </div>
        `;

        this.attachSongDocumentPreviewHandlers(container, availableSongMap);

        container.querySelectorAll('.event-rundown-title-input').forEach((input) => {
            input.addEventListener('input', (event) => {
                const itemId = event.target.closest('.event-rundown-item')?.dataset?.rundownId;
                const item = this.draftEventRundown.items.find((entry) => entry.id === itemId);
                if (item) item.title = event.target.value;
            });
        });

        container.querySelectorAll('.event-rundown-notes-input').forEach((input) => {
            input.addEventListener('input', (event) => {
                const itemId = event.target.closest('.event-rundown-item')?.dataset?.rundownId;
                const item = this.draftEventRundown.items.find((entry) => entry.id === itemId);
                if (item) item.notes = event.target.value;
            });
        });

        container.querySelectorAll('.event-rundown-duration-input').forEach((input) => {
            input.addEventListener('change', (event) => {
                const itemId = event.target.closest('.event-rundown-item')?.dataset?.rundownId;
                const nextDuration = Math.max(1, Number(event.target.value) || 1);
                const item = this.draftEventRundown.items.find((entry) => entry.id === itemId);
                if (item) {
                    item.duration = nextDuration;
                    this.renderEventRundownEditor();
                }
            });
        });

        container.querySelectorAll('.event-rundown-delete').forEach((button) => {
            button.addEventListener('click', () => {
                const itemId = button.closest('.event-rundown-item')?.dataset?.rundownId;
                this.deleteDraftEventRundownItem(itemId);
            });
        });

        container.querySelectorAll('.event-rundown-toggle').forEach((button) => {
            button.addEventListener('click', () => {
                const itemId = button.closest('.event-rundown-item')?.dataset?.rundownId;
                this.toggleDraftEventRundownItemCollapse(itemId);
            });
        });

        container.querySelectorAll('.event-rundown-song-pool').forEach((button) => {
            button.addEventListener('click', () => {
                const itemId = button.closest('.event-rundown-item')?.dataset?.rundownId;
                this.openBandSongSelectorForRundownItem(itemId);
            });
        });

        container.querySelectorAll('.event-rundown-songpool-pool').forEach((button) => {
            button.addEventListener('click', () => {
                const itemId = button.closest('.event-rundown-item')?.dataset?.rundownId;
                this.openSongpoolSelectorForRundownItem(itemId);
            });
        });

        container.querySelectorAll('.event-rundown-song-new').forEach((button) => {
            button.addEventListener('click', () => {
                const itemId = button.closest('.event-rundown-item')?.dataset?.rundownId;
                this.openNewSongModalForRundownItem(itemId);
            });
        });

        container.querySelectorAll('.event-rundown-song-edit').forEach((button) => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const songId = button.closest('[data-rundown-song-id]')?.dataset?.rundownSongId;
                if (!songId) return;
                this.lastSongModalContext = {
                    origin: 'draftEventSong',
                    draftSongId: songId
                };
                await this.openSongModal(null, null, songId);
            });
        });

        container.querySelectorAll('.event-rundown-song-remove').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const songId = button.closest('[data-rundown-song-id]')?.dataset?.rundownSongId;
                const itemId = button.closest('.event-rundown-item')?.dataset?.rundownId;
                this.removeSongFromDraftEventSongBlock(itemId, songId);
            });
        });

        let dragSourceItem = null;
        const draggableItems = container.querySelectorAll('.event-rundown-item[draggable="true"]');

        const clearRundownDragClasses = () => {
            draggableItems.forEach((item) => {
                item.classList.remove('dragging');
                item.classList.remove('drag-over');
            });
        };

        draggableItems.forEach((item) => {
            item.addEventListener('dragstart', (event) => {
                dragSourceItem = item;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.dataset.rundownId || '');
                item.classList.add('dragging');
            });

            item.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            });

            item.addEventListener('dragenter', () => {
                if (dragSourceItem && dragSourceItem !== item) {
                    item.classList.add('drag-over');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });

            item.addEventListener('drop', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (dragSourceItem && dragSourceItem !== item) {
                    this.reorderDraftEventRundownItems(
                        dragSourceItem.dataset.rundownId,
                        item.dataset.rundownId
                    );
                }
                clearRundownDragClasses();
            });

            item.addEventListener('dragend', clearRundownDragClasses);
        });

        let dragSourceSongRow = null;
        const songRows = container.querySelectorAll('.event-rundown-song-table tbody tr[draggable="true"]');

        const clearSongDragClasses = () => {
            songRows.forEach((row) => {
                row.classList.remove('dragging');
                row.classList.remove('drag-over');
            });
        };

        songRows.forEach((row) => {
            row.addEventListener('dragstart', (event) => {
                event.stopPropagation();
                dragSourceSongRow = row;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', row.dataset.rundownSongId || '');
                row.classList.add('dragging');
            });

            row.addEventListener('dragover', (event) => {
                event.stopPropagation();
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            });

            row.addEventListener('dragenter', () => {
                if (dragSourceSongRow && dragSourceSongRow !== row) {
                    row.classList.add('drag-over');
                }
            });

            row.addEventListener('dragleave', () => {
                row.classList.remove('drag-over');
            });

            row.addEventListener('drop', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (dragSourceSongRow && dragSourceSongRow !== row) {
                    this.reorderDraftEventRundownSong(
                        row.dataset.rundownItemId,
                        dragSourceSongRow.dataset.rundownSongId,
                        row.dataset.rundownSongId
                    );
                }
                clearSongDragClasses();
            });

            row.addEventListener('dragend', clearSongDragClasses);
        });
    },

    addDraftEventRundownItem(type = 'custom') {
        if (!this.draftEventRundown || typeof this.draftEventRundown !== 'object') {
            this.draftEventRundown = this.normalizeEventRundownData();
        }
        this.draftEventRundown.items.push(this.createDraftEventRundownItem(type));
        this.renderEventRundownEditor();
    },

    deleteDraftEventRundownItem(itemId) {
        if (!itemId || !this.draftEventRundown?.items) return;
        this.draftEventRundown.items = this.draftEventRundown.items.filter((item) => item.id !== itemId);
        this.syncDraftEventSongIdsFromRundown();
        this.renderEventRundownEditor();
    },

    toggleDraftEventRundownItemCollapse(itemId) {
        if (!itemId || !Array.isArray(this.draftEventRundown?.items)) return;
        const item = this.draftEventRundown.items.find((entry) => entry.id === itemId);
        if (!item || item.type !== 'songblock') return;
        item.isCollapsed = !item.isCollapsed;
        this.renderEventRundownEditor();
    },

    moveDraftEventRundownItem(itemId, direction = 1) {
        if (!itemId || !Array.isArray(this.draftEventRundown?.items)) return;
        const currentIndex = this.draftEventRundown.items.findIndex((item) => item.id === itemId);
        const targetIndex = currentIndex + direction;
        if (currentIndex === -1 || targetIndex < 0 || targetIndex >= this.draftEventRundown.items.length) return;
        const [movedItem] = this.draftEventRundown.items.splice(currentIndex, 1);
        this.draftEventRundown.items.splice(targetIndex, 0, movedItem);
        this.renderEventRundownEditor();
    },

    reorderDraftEventRundownItems(sourceItemId, targetItemId) {
        if (!sourceItemId || !targetItemId || !Array.isArray(this.draftEventRundown?.items)) return;

        const items = [...this.draftEventRundown.items];
        const sourceIndex = items.findIndex((item) => item.id === sourceItemId);
        const targetIndex = items.findIndex((item) => item.id === targetItemId);

        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

        const [movedItem] = items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, movedItem);
        this.draftEventRundown.items = items;
        this.renderEventRundownEditor();
    },

    reorderDraftEventRundownSong(itemId, sourceSongId, targetSongId) {
        if (!itemId || !sourceSongId || !targetSongId || !Array.isArray(this.draftEventRundown?.items)) return;

        const item = this.draftEventRundown.items.find((entry) => entry.id === itemId);
        if (!item || !Array.isArray(item.songIds)) return;

        const songIds = item.songIds.map(String);
        const sourceIndex = songIds.indexOf(String(sourceSongId));
        const targetIndex = songIds.indexOf(String(targetSongId));

        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

        const [movedSongId] = songIds.splice(sourceIndex, 1);
        songIds.splice(targetIndex, 0, movedSongId);
        item.songIds = songIds;
        this.syncDraftEventSongIdsFromRundown();
        this.renderEventRundownEditor();
    },

    getCurrentEventEditorContext() {
        const eventId = document.getElementById('editEventId')?.value || '';
        const bandId = document.getElementById('eventBand')?.value || '';
        return {
            eventId: eventId || null,
            bandId: bandId || null
        };
    },

    async addSongsToDraftEventSongBlock(itemId, songIds = []) {
        if (!itemId || !Array.isArray(this.draftEventRundown?.items)) return;

        const nextSongIds = [...new Set(songIds.map(String).filter(Boolean))];
        if (nextSongIds.length === 0) return;

        const item = this.draftEventRundown.items.find((entry) => entry.id === itemId);
        if (!item) return;

        nextSongIds.forEach((songId) => {
            if (!this.draftEventSongIds.includes(songId)) {
                this.draftEventSongIds.push(songId);
            }
        });

        item.songIds = [...new Set([...(item.songIds || []).map(String), ...nextSongIds])];
        item.isPickerOpen = false;
        item.isCollapsed = false;
        this.syncDraftEventSongIdsFromRundown();
        await this.renderDraftEventSongs();
    },

    syncDraftEventSongIdsFromRundown() {
        if (!Array.isArray(this.draftEventRundown?.items)) return;

        const referencedSongIds = [...new Set(
            this.draftEventRundown.items
                .filter((item) => item.type === 'songblock')
                .flatMap((item) => Array.isArray(item.songIds) ? item.songIds.map(String) : [])
                .filter(Boolean)
        )];

        this.draftEventSongIds = referencedSongIds;

        if (this.draftEventSongOverrides && typeof this.draftEventSongOverrides === 'object') {
            Object.keys(this.draftEventSongOverrides).forEach((songId) => {
                if (!referencedSongIds.includes(String(songId))) {
                    delete this.draftEventSongOverrides[songId];
                }
            });
        }
    },

    removeSongFromDraftEventSongBlock(itemId, songId) {
        if (!itemId || !songId || !Array.isArray(this.draftEventRundown?.items)) return;

        const item = this.draftEventRundown.items.find((entry) => entry.id === itemId);
        if (!item || !Array.isArray(item.songIds)) return;

        item.songIds = item.songIds.filter((id) => String(id) !== String(songId));
        this.syncDraftEventSongIdsFromRundown();
        this.renderDraftEventSongs();
    },

    async openBandSongSelectorForRundownItem(itemId) {
        const { eventId, bandId } = this.getCurrentEventEditorContext();
        if (!bandId) {
            UI.showToast('Bitte wähle zuerst eine Band aus.', 'warning');
            return;
        }

        const bandSongs = await Storage.getBandSongs(bandId);
        if (!Array.isArray(bandSongs) || bandSongs.length === 0) {
            UI.showToast('Für diese Band sind noch keine Songs vorhanden.', 'info');
            return;
        }

        const options = {
            title: 'Songs für Liederblock wählen',
            description: 'Wähle Songs aus dem Band-Pool und übernimm sie direkt in diesen Liedblock.',
            async onConfirm(selectedIds) {
                await App.addSongsToDraftEventSongBlock(itemId, selectedIds);
            }
        };

        if (eventId) {
            this.showBandSongSelector(eventId, bandSongs, options);
        } else {
            this.showBandSongSelectorForDraft(bandSongs, options);
        }
    },

    async openSongpoolSelectorForRundownItem(itemId) {
        const { eventId, bandId } = this.getCurrentEventEditorContext();
        const user = Auth.getCurrentUser();

        if (!user) {
            UI.showToast('Bitte melde dich an, um auf deinen Songpool zuzugreifen.', 'warning');
            return;
        }

        try {
            const songpoolSongs = await Storage.getSongpoolSongs(user.id, { includePublic: true });

            if (!songpoolSongs || songpoolSongs.length === 0) {
                UI.showToast('Es sind noch keine Songs im Songpool vorhanden.', 'info');
                return;
            }

            const options = {
                title: 'Songs aus Songpool importieren',
                description: 'Wähle Songs aus dem globalen Songpool. Sie werden direkt in die aktuelle Band kopiert und zum Liederblock hinzugefügt.',
                async onConfirm(selectedIds) {
                    await App.copySongpoolSongsToEventBlock(itemId, selectedIds, songpoolSongs, bandId, eventId);
                }
            };

            // We reuse the draft selector UI but feed it songpool songs
            this.showSongpoolSelectorForDraft(songpoolSongs, options);

        } catch (error) {
            console.error('[Event] Error loading songpool:', error);
            UI.showToast(Storage._getSongpoolErrorMessage(error, 'Songpool konnte nicht geladen werden.'), 'error');
        }
    },

    async copySongpoolSongsToEventBlock(itemId, selectedIds, songpoolSongs, bandId, eventId) {
        if (!selectedIds || selectedIds.length === 0) return;

        UI.showLoading();
        let successCount = 0;
        let mappedSongIds = [];

        try {
            for (const spSongId of selectedIds) {
                const spSong = songpoolSongs.find(s => String(s.id) === String(spSongId));
                if (!spSong) continue;

                // Create a standard song entry
                const songData = {
                    title: spSong.title,
                    artist: spSong.artist,
                    genre: spSong.genre,
                    bpm: spSong.bpm,
                    key: spSong.key,
                    originalKey: spSong.originalKey,
                    timeSignature: spSong.timeSignature,
                    language: spSong.language,
                    tracks: spSong.tracks,
                    info: spSong.info,
                    ccli: spSong.ccli,
                    leadVocal: spSong.leadVocal,
                    pdf_url: spSong.pdf_url,
                    createdBy: Auth.getCurrentUser()?.id
                };

                // Link to band (or event if no band)
                if (bandId) {
                    songData.bandId = bandId;
                } else if (eventId) {
                    songData.eventId = eventId;
                }

                // Insert into regular songs table via Storage.createSong
                const created = await Storage.createSong(songData);

                if (created && created.id) {
                    mappedSongIds.push(created.id);
                    successCount++;
                }
            }

            if (mappedSongIds.length > 0) {
                await this.addSongsToDraftEventSongBlock(itemId, mappedSongIds);
                UI.showToast(`${successCount} Song${successCount === 1 ? '' : 's'} aus dem Songpool in die Band importiert.`, 'success');
            }
        } catch (error) {
            console.error('[Event] Songpool copy error:', error);
            UI.showToast('Fehler beim Importieren der Songs aus dem Songpool.', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    openNewSongModalForRundownItem(itemId) {
        const { eventId, bandId } = this.getCurrentEventEditorContext();

        if (!eventId && !bandId) {
            UI.showToast('Bitte wähle zuerst eine Band aus.', 'warning');
            return;
        }

        this.draftEventSongBlockTargetId = itemId;

        if (eventId) {
            this.lastSongModalContext = {
                eventId,
                bandId: null,
                origin: 'eventSongBlock',
                rundownItemId: itemId
            };
            this.openSongModal(eventId, null, null);
            return;
        }

        this.lastSongModalContext = {
            eventId: null,
            bandId,
            origin: 'createEventSongBlock',
            rundownItemId: itemId
        };
        this.openSongModal(null, bandId, null);
    },

    async saveRundownAsTemplate() {
        const rundown = this.draftEventRundown;
        if (!rundown || !Array.isArray(rundown.items) || rundown.items.length === 0) {
            UI.showToast('Der Ablauf ist leer – nichts zu speichern.', 'warning');
            return;
        }

        const user = Auth.getCurrentUser();
        if (!user) {
            UI.showToast('Du musst angemeldet sein, um Vorlagen zu speichern.', 'warning');
            return;
        }

        // Ask for name via a small inline modal
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <div class="modal-header">
                    <h2>Ablauf als Vorlage speichern</h2>
                    <button type="button" class="modal-close" aria-label="Schließen">&times;</button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <label style="display:block;margin-bottom:.5rem;font-weight:600;">Vorlagenname</label>
                    <input id="rundownTemplateNameInput" type="text" class="form-input" placeholder="z.B. Sonntagsgottesdienst" style="width:100%;">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn cancel" id="cancelSaveTemplate">Abbrechen</button>
                    <button type="button" class="btn btn-primary" id="confirmSaveTemplate">💾 Speichern</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#cancelSaveTemplate').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('#confirmSaveTemplate').addEventListener('click', async () => {
            const name = modal.querySelector('#rundownTemplateNameInput').value.trim();
            if (!name) {
                UI.showToast('Bitte gib einen Namen ein.', 'warning');
                return;
            }

            // Strip songIds from each item before saving
            const templateData = {
                startTime: rundown.startTime || '',
                items: rundown.items.map(item => ({
                    id: this.generateId ? this.generateId() : crypto.randomUUID(),
                    type: item.type,
                    title: item.title,
                    duration: item.duration,
                    notes: item.notes,
                    songIds: [], // intentionally empty
                    isCollapsed: Boolean(item.isCollapsed)
                }))
            };

            try {
                await Storage.createRundownTemplate(name, templateData, user.id);
                UI.showToast(`Vorlage "${name}" gespeichert.`, 'success');
                modal.remove();
            } catch (err) {
                console.error('[Rundown] saveRundownAsTemplate error', err);
                UI.showToast('Vorlage konnte nicht gespeichert werden.', 'error');
            }
        });

        setTimeout(() => modal.querySelector('#rundownTemplateNameInput')?.focus(), 100);
    },

    async openLoadRundownTemplateModal() {
        const user = Auth.getCurrentUser();
        if (!user) {
            UI.showToast('Du musst angemeldet sein, um Vorlagen zu laden.', 'warning');
            return;
        }

        UI.showLoading();
        let templates = [];
        try {
            templates = await Storage.getRundownTemplates(user.id);
        } catch (err) {
            console.error('[Rundown] getRundownTemplates error', err);
        } finally {
            UI.hideLoading();
        }

        const modal = document.createElement('div');
        modal.className = 'modal active';

        const renderList = () => {
            if (templates.length === 0) {
                return `<p style="color:var(--text-muted);text-align:center;padding:2rem 0;">Keine Vorlagen vorhanden.</p>`;
            }
            return templates.map(t => `
                <div class="rundown-template-item" data-template-id="${t.id}">
                    <div class="rundown-template-name">${this.escapeHtml(t.name)}</div>
                    <div class="rundown-template-meta">${Array.isArray(t.data?.items) ? t.data.items.length : 0} Blöcke</div>
                    <div class="rundown-template-actions">
                        <button class="btn btn-primary btn-sm rundown-template-load-btn" data-id="${t.id}">Laden</button>
                        <button class="btn btn-danger btn-sm rundown-template-delete-btn" data-id="${t.id}">Entfernen</button>
                    </div>
                </div>
            `).join('');
        };

        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px;">
                <div class="modal-header">
                    <h2>Vorlage laden</h2>
                    <button type="button" class="modal-close" aria-label="Schließen">&times;</button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <div id="rundownTemplateList">${renderList()}</div>
                    <p style="margin-top:1rem;font-size:.82rem;color:var(--text-muted);">⚠️ Das Laden einer Vorlage ersetzt den aktuellen Ablauf (Songs bleiben erhalten).</p>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn cancel" id="cancelLoadTemplate">Schließen</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#cancelLoadTemplate').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.addEventListener('click', async (e) => {
            const loadBtn = e.target.closest('.rundown-template-load-btn');
            const deleteBtn = e.target.closest('.rundown-template-delete-btn');

            if (loadBtn) {
                const templateId = loadBtn.dataset.id;
                const template = templates.find(t => String(t.id) === String(templateId));
                if (!template?.data) return;

                // Apply template: preserve existing songIds where block index matches
                const oldItems = this.draftEventRundown?.items || [];
                const newItems = template.data.items.map((tItem, idx) => ({
                    ...tItem,
                    id: tItem.id || (this.generateId ? this.generateId() : crypto.randomUUID()),
                    songIds: [] // no songs imported from template
                }));
                this.draftEventRundown = {
                    startTime: template.data.startTime || this.draftEventRundown?.startTime || '',
                    items: newItems
                };
                await this.renderEventRundownEditor();
                UI.showToast(`Vorlage "${template.name}" geladen.`, 'success');
                modal.remove();
            }

            if (deleteBtn) {
                const templateId = deleteBtn.dataset.id;
                const template = templates.find(t => String(t.id) === String(templateId));
                if (!template) return;

                if (!confirm(`Vorlage "${template.name}" wirklich löschen?`)) return;
                try {
                    await Storage.deleteRundownTemplate(templateId);
                    templates = templates.filter(t => String(t.id) !== String(templateId));
                    modal.querySelector('#rundownTemplateList').innerHTML = renderList();
                    UI.showToast('Vorlage gelöscht.', 'success');
                } catch (err) {
                    UI.showToast('Vorlage konnte nicht gelöscht werden.', 'error');
                }
            }
        });
    },

    remapDraftEventRundownSongIds(songIdMap) {
        if (!(songIdMap instanceof Map) || songIdMap.size === 0 || !Array.isArray(this.draftEventRundown?.items)) {
            return false;
        }

        let changed = false;
        this.draftEventRundown.items = this.draftEventRundown.items.map((item) => {
            if (item.type !== 'songblock' || !Array.isArray(item.songIds) || item.songIds.length === 0) {
                return item;
            }

            const nextSongIds = [...new Set(
                item.songIds
                    .map((songId) => String(songIdMap.get(String(songId)) || songId))
                    .filter(Boolean)
            )];

            if (nextSongIds.join('|') !== item.songIds.map(String).join('|')) {
                changed = true;
                return { ...item, songIds: nextSongIds };
            }

            return item;
        });

        return changed;
    },

    setDraftEventRundownFromEvent(event) {
        const rawInfo = event?.info || '';
        const normalized = this.extractEventRundown(rawInfo);
        const fallbackStart = event?.date ? this.normalizeEventRundownTime(String(event.date).slice(11, 16)) : '';
        const shouldResyncFromEventTime = Boolean(
            fallbackStart
            && normalized.sourceEventTime
            && normalized.sourceEventTime !== fallbackStart
        );

        const hasSongBlock = Array.isArray(normalized.items) && normalized.items.some((item) => item?.type === 'songblock');
        if (!hasSongBlock && Array.isArray(this.draftEventSongIds) && this.draftEventSongIds.length > 0) {
            normalized.items = [
                this.createDraftEventRundownItem('songblock'),
                ...(normalized.items || [])
            ];
            normalized.items[0].title = 'Setlist';
            normalized.items[0].songIds = [...this.draftEventSongIds];
        }

        this.draftEventRundown = this.normalizeEventRundownData({
            ...normalized,
            startTime: shouldResyncFromEventTime ? fallbackStart : (normalized.startTime || fallbackStart),
            sourceEventTime: fallbackStart || normalized.sourceEventTime || ''
        });
    },

    // Generic PDF Download for Song Lists
    async downloadSongListPDF(songs, title, subtitle = '', preview = true) {
        try {
            if (!Array.isArray(songs) || songs.length === 0) {
                UI.showToast('Keine Songs für PDF vorhanden', 'warning');
                return;
            }

            const filename = typeof PDFGenerator !== 'undefined' && typeof PDFGenerator.sanitizeFilename === 'function'
                ? PDFGenerator.sanitizeFilename(`${title}.pdf`, 'setlist.pdf')
                : `${String(title || 'Setlist').trim() || 'Setlist'}.pdf`;

            const pdfData = await PDFGenerator.generateSetlistPDF({
                title: title,
                subtitle: subtitle,
                songs: songs,
                filename: filename,
                previewOnly: preview
            });

            if (preview && pdfData && pdfData.blobUrl) {
                this.showPDFPreview({
                    ...pdfData,
                    filename,
                    title: `${title} - PDF`
                });
            } else if (!preview) {
                UI.showToast('PDF heruntergeladen!', 'success');
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            UI.showToast('Fehler bei PDF-Erstellung', 'error');
        }
    },

    // Handle CSV Upload
    async handleCSVUpload(file, bandId) {
        if (!file || !bandId) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const lines = text.split('\n');
            let successCount = 0;
            let dbErrorCount = 0;

            // Simple CSV parsing (assumes comma or semicolon delimiter)
            // Skip header if present (heuristic)
            const startIndex = lines[0].toLowerCase().includes('titel') ? 1 : 0;
            const totalLines = lines.length - startIndex;

            UI.showLoading(`Importiere Songs (0/${totalLines})...`);

            // Basic Binary Check to prevent crashing with XLS/Numbers files
            // "PK" at the start usually indicates a Zip/Office/Numbers file
            if (text.startsWith('PK') || text.includes(String.fromCharCode(0))) {
                UI.hideLoading();
                UI.showToast('Fehler: Das ist keine gültige CSV-Datei.', 'error');
                console.error('Binary file detected (PK header or null bytes). Likely an Excel (.xlsx) or Numbers file.');
                alert('Es sieht so aus, als hätten Sie eine Excel- oder Numbers-Datei hochgeladen.\n\nBitte öffnen Sie die Datei in Ihrem Programm und wählen Sie "Datei > Exportieren > CSV" (Kommagetrennte Werte).');
                return;
            }

            let processed = 0;

            for (let i = startIndex; i < lines.length; i++) {
                let line = lines[i].trim();

                if (!line) {
                    processed++;
                    continue;
                }

                // Detect delimiter
                const delimiter = line.includes(';') ? ';' : ',';
                // Split by delimiter, handling quotes generically is hard without a library,
                // so we assume simple CSV first.
                // Remove quotes from start/end of parts
                const parts = line.split(delimiter).map(p => p.trim().replace(/^"|"$/g, ''));


                // Expected format: Titel, Interpret, BPM, Time, Tonart, Tonart Original, Leadvocal, Sprache, Tracks, Songsinfos, CCLI
                if (parts.length >= 2) {
                    const title = parts[0];
                    const artist = parts[1];
                    const bpm = parts[2] || '';
                    const timeSignature = parts[3] || '';
                    const key = parts[4] || '';
                    const originalKey = parts[5] || '';
                    const leadVocal = parts[6] || '';
                    const language = parts[7] || '';
                    const tracks = parts[8] || ''; // Expect yes/no or similar
                    const info = parts[9] || '';
                    const ccli = parts[10] || '';

                    console.log(`Extracted data: Title="${title}", Artist="${artist}"`);

                    if (title) {
                        try {
                            const songData = {
                                bandId: bandId,
                                title: title,
                                artist: artist || '', // Allow empty artist
                                bpm: bpm,
                                timeSignature: timeSignature,
                                key: key,
                                originalKey: originalKey,
                                leadVocal: leadVocal,
                                language: language,
                                tracks: tracks,
                                info: info,
                                ccli: ccli
                            };
                            Logger.info('Importing song', songData.title);
                            await Storage.createSong(songData);
                            successCount++;

                        } catch (err) {
                            console.error('Import error for line:', line, err);
                            dbErrorCount++;
                        }
                    } else {
                        console.warn('Skipping line: Title missing');
                    }
                } else {
                    console.warn('Skipping line: Not enough columns');
                }

                processed++;
                if (processed % 5 === 0) {
                    UI.showLoading(`Importiere Songs (${processed}/${totalLines})...`);
                    // allow UI update
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            UI.hideLoading();

            if (successCount > 0) {
                UI.showToast(`${successCount} Songs erfolgreich importiert!`, 'success');
                await this.renderBandSongs(bandId); // Refresh list
                UI.closeModal('importSongsModal');
            } else if (dbErrorCount > 0) {
                UI.showToast('Fehler beim Importieren. Prüfe die Konsole.', 'error');
            } else {
                UI.showToast('Keine gültigen Songs gefunden.', 'warning');
            }
        };
        reader.readAsText(file);
    },

    getSongpoolShowPublicPreference() {
        try {
            const pref = localStorage.getItem(this.songpoolShowPublicStorageKey);
            return pref === null ? true : pref === 'true';
        } catch (error) {
            console.warn('[Songpool] Public toggle could not be read:', error);
            return false;
        }
    },

    setSongpoolShowPublicPreference(showPublic) {
        try {
            localStorage.setItem(this.songpoolShowPublicStorageKey, showPublic ? 'true' : 'false');
        } catch (error) {
            console.warn('[Songpool] Public toggle could not be saved:', error);
        }
    },

    normalizeSongpoolVisibility(value = 'public') {
        return String(value || '').trim().toLowerCase() === 'private' ? 'private' : 'public';
    },

    normalizeSongpoolDuplicateText(value = '') {
        return String(value || '')
            .toLocaleLowerCase('de-DE')
            .replace(/ß/g, 'ss')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    },

    getSongpoolDuplicateTokens(value = '') {
        const stopWords = new Set([
            'der', 'die', 'das', 'dem', 'den', 'des',
            'ein', 'eine', 'einer', 'einem', 'einen',
            'und', 'oder', 'mit', 'von', 'vom', 'zum', 'zur',
            'im', 'in', 'am', 'an', 'auf', 'for', 'the', 'a'
        ]);

        return [...new Set(
            this.normalizeSongpoolDuplicateText(value)
                .split(' ')
                .map((token) => token.trim())
                .filter((token) => token.length > 1 && !stopWords.has(token))
        )];
    },

    normalizeSongpoolKeyForComparison(value = '') {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';

        return raw
            .replace(/\s+/g, ' ')
            .replace(/\bdur\b/g, '')
            .replace(/\bmajor\b/g, '')
            .replace(/\bmoll\b/g, 'm')
            .replace(/\bminor\b/g, 'm')
            .replace(/\s+/g, '')
            .replace('db', 'c#')
            .replace('eb', 'd#')
            .replace('gb', 'f#')
            .replace('ab', 'g#')
            .replace('bb', 'a#');
    },

    getSongpoolDuplicateMatchMeta(leftTitle = '', rightTitle = '', leftArtist = '', rightArtist = '', leftKey = '', rightKey = '') {
        const normalizedLeft = this.normalizeSongpoolDuplicateText(leftTitle);
        const normalizedRight = this.normalizeSongpoolDuplicateText(rightTitle);

        if (!normalizedLeft || !normalizedRight) return null;

        let score = 0;

        if (normalizedLeft === normalizedRight) {
            score = 1;
        }

        const shorter = normalizedLeft.length <= normalizedRight.length ? normalizedLeft : normalizedRight;
        const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft;

        if (shorter.length >= 6 && longer.includes(shorter)) {
            score = Math.max(score, 0.9);
        }

        const leftTokens = this.getSongpoolDuplicateTokens(leftTitle);
        const rightTokens = this.getSongpoolDuplicateTokens(rightTitle);

        if (leftTokens.length > 0 && rightTokens.length > 0) {
            const tokenIntersection = leftTokens.filter((token) => rightTokens.includes(token));
            const uniqueIntersection = [...new Set(tokenIntersection)];
            const minTokenCount = Math.min(leftTokens.length, rightTokens.length);
            const unionCount = new Set([...leftTokens, ...rightTokens]).size || 1;
            const overlap = uniqueIntersection.length / Math.max(minTokenCount, 1);
            const jaccard = uniqueIntersection.length / unionCount;

            if (uniqueIntersection.length >= 2 && overlap >= 0.67) {
                score = Math.max(score, Math.min(0.95, 0.66 + overlap * 0.22 + jaccard * 0.07));
            }

            if (uniqueIntersection.length === minTokenCount && minTokenCount >= 2) {
                score = Math.max(score, 0.91);
            }
        }

        const normalizedLeftArtist = this.normalizeSongpoolDuplicateText(leftArtist);
        const normalizedRightArtist = this.normalizeSongpoolDuplicateText(rightArtist);
        if (normalizedLeftArtist && normalizedRightArtist && normalizedLeftArtist === normalizedRightArtist) {
            score = Math.min(score + 0.04, 1);
        }

        const normalizedLeftKey = this.normalizeSongpoolKeyForComparison(leftKey);
        const normalizedRightKey = this.normalizeSongpoolKeyForComparison(rightKey);
        if (normalizedLeftKey && normalizedRightKey) {
            if (normalizedLeftKey !== normalizedRightKey) {
                return null;
            }
            score = Math.min(score + 0.03, 1);
        }

        if (score < 0.78) return null;

        return {
            score,
            reason: score >= 0.98 ? 'Gleicher Titel' : 'Ähnlicher Titel'
        };
    },

    findSongpoolDuplicateMatchesForDraft(draft, existingSongs = []) {
        const matches = (Array.isArray(existingSongs) ? existingSongs : [])
            .map((song) => {
                const matchMeta = this.getSongpoolDuplicateMatchMeta(
                    draft?.title || '',
                    song?.title || '',
                    draft?.artist || '',
                    song?.artist || '',
                    draft?.key || '',
                    song?.key || ''
                );

                if (!matchMeta) return null;

                return {
                    song,
                    score: matchMeta.score,
                    reason: matchMeta.reason
                };
            })
            .filter(Boolean)
            .sort((left, right) => right.score - left.score)
            .slice(0, 6);

        return matches;
    },

    buildSongpoolDuplicateEntries(drafts = [], existingSongs = []) {
        return (Array.isArray(drafts) ? drafts : [])
            .map((draft) => {
                const matches = this.findSongpoolDuplicateMatchesForDraft(draft, existingSongs);
                return matches.length > 0 ? { draft, matches } : null;
            })
            .filter(Boolean);
    },

    getSongpoolDuplicateCountLabel(count = 0, options = {}) {
        const total = Math.max(0, Number(count) || 0);
        const compact = options.compact === true;

        if (compact) {
            return total === 1 ? '1 Treffer' : `${total} Treffer`;
        }

        return total === 1 ? '1 möglicher Treffer' : `${total} mögliche Treffer`;
    },

    getSongpoolDuplicateReviewLabel(count = 0) {
        const total = Math.max(0, Number(count) || 0);
        return total === 1 ? '1 Song prüfen' : `${total} Songs prüfen`;
    },

    getSongpoolDuplicateMatchCountLabel(count = 0) {
        const total = Math.max(0, Number(count) || 0);
        return total === 1 ? '1 ähnlicher Treffer' : `${total} ähnliche Treffer`;
    },

    getSongpoolDuplicateDraftSignature(draft = null) {
        if (!draft) return '';
        return [
            this.normalizeSongpoolDuplicateText(draft.title || ''),
            this.normalizeSongpoolDuplicateText(draft.artist || ''),
            this.normalizeSongpoolKeyForComparison(draft.key || '')
        ].join('::');
    },

    isChordProLikeFileName(fileName = '') {
        const lowerName = String(fileName || '').trim().toLowerCase();
        return ['.cho', '.chordpro', '.chopro', '.pro', '.crd', '.txt', '.cp', '.chord']
            .some((extension) => lowerName.endsWith(extension));
    },

    songpoolEntryHasDocument(entry = null) {
        if (!entry) return false;

        if (entry.file) {
            return true;
        }

        if (entry.pdf_url) {
            return true;
        }

        return Boolean(Storage.getSongChordPro(entry));
    },

    songpoolEntryRequiresKey(entry = null) {
        if (!entry) return false;

        if (entry.pdf_url) return true;

        const selectedFileName = String(entry.file?.name || '').trim();
        if (selectedFileName) {
            return !this.isChordProLikeFileName(selectedFileName);
        }

        if (entry.sourceType === 'pdf') return true;
        if (entry.sourceType === 'chordpro') return false;

        return false;
    },

    updateSongpoolKeyFieldRequirement(entry = null) {
        const songKeyLabel = document.querySelector('label[for="songKey"]');
        if (!songKeyLabel) return;

        const isRequired = this.songpoolEntryRequiresKey(entry);
        songKeyLabel.innerHTML = isRequired
            ? 'Tonart <span class="required-indicator" title="Pflichtfeld bei PDF">*</span>'
            : 'Tonart';
    },

    async saveSongpoolDraftsWithDuplicateReview(drafts = [], options = {}) {
        const normalizedDrafts = (Array.isArray(drafts) ? drafts : [])
            .map((draft) => ({
                ...draft,
                title: this.cleanImportedSongTitle(
                    draft.title,
                    this.getSongpoolImportedFileBaseName(draft.file?.name || draft.title || '')
                )
            }))
            .filter((draft) => draft.title);

        const draftsWithoutKey = normalizedDrafts.filter((draft) => this.songpoolEntryRequiresKey(draft) && !String(draft.key || '').trim());
        if (draftsWithoutKey.length > 0) {
            throw new Error(`Bitte trage für ${draftsWithoutKey.length} Song${draftsWithoutKey.length === 1 ? '' : 's'} eine Tonart ein.`);
        }

        const user = options.user || Auth.getCurrentUser();
        if (!user) {
            throw new Error('Du musst angemeldet sein, um Songs in den Songpool zu speichern.');
        }

        let existingSongs = [];
        try {
            existingSongs = await Storage.getSongpoolSongs(user.id, { includePublic: true });
        } catch (error) {
            console.error('[Songpool] Existing songs could not be loaded for duplicate check:', error);
            throw new Error(Storage._getSongpoolErrorMessage(error, 'Songpool konnte nicht geprüft werden.'));
        }

        const duplicateEntries = this.buildSongpoolDuplicateEntries(normalizedDrafts, existingSongs)
            .filter((entry) => {
                const approvedSignature = String(entry?.draft?.duplicateReviewSignature || '');
                return !(
                    entry?.draft?.duplicateReviewApproved
                    && approvedSignature
                    && approvedSignature === this.getSongpoolDuplicateDraftSignature(entry.draft)
                );
            });
        const duplicateDraftIdSet = new Set(duplicateEntries.map((entry) => String(entry.draft.id)));
        const directDrafts = normalizedDrafts.filter((draft) => !duplicateDraftIdSet.has(String(draft.id)));
        const totalDraftCount = normalizedDrafts.length;

        let successCount = 0;
        let errorCount = 0;
        let skippedDuplicateCount = 0;
        const savedDraftIds = [];
        const discardedDraftIds = [];
        let duplicateReviewCanceled = false;

        if (directDrafts.length > 0) {
            const directResult = await this.persistSongpoolImportDraftBatch(directDrafts, user, {
                progressOffset: 0,
                progressTotal: totalDraftCount
            });
            successCount += directResult.successCount;
            errorCount += directResult.errorCount;
            savedDraftIds.push(...directResult.savedDraftIds);
        }

        if (duplicateEntries.length > 0) {
            if (typeof options.onBeforeDuplicateReview === 'function') {
                await options.onBeforeDuplicateReview(duplicateEntries);
            }

            const reviewResult = await this.openSongpoolDuplicateReviewModal(duplicateEntries, {
                savedCount: successCount,
                userId: user.id
            });

            const selectedEntries = Array.isArray(reviewResult?.entries) ? reviewResult.entries : [];
            const removedCount = Math.max(0, duplicateEntries.length - selectedEntries.length);

            if (reviewResult?.confirmed) {
                skippedDuplicateCount += removedCount;
                discardedDraftIds.push(
                    ...duplicateEntries
                        .filter((entry) => !selectedEntries.some((selectedEntry) => String(selectedEntry?.draft?.id) === String(entry?.draft?.id)))
                        .map((entry) => entry?.draft?.id)
                        .filter(Boolean)
                );

                const selectedDrafts = selectedEntries
                    .map((entry) => entry?.draft)
                    .filter(Boolean);

                if (selectedDrafts.length > 0) {
                    const duplicateResult = await this.persistSongpoolImportDraftBatch(selectedDrafts, user, {
                        progressOffset: successCount + errorCount,
                        progressTotal: totalDraftCount
                    });
                    successCount += duplicateResult.successCount;
                    errorCount += duplicateResult.errorCount;
                    savedDraftIds.push(...duplicateResult.savedDraftIds);
                }
            } else {
                duplicateReviewCanceled = true;
                skippedDuplicateCount += duplicateEntries.length;
            }
        }

        return {
            normalizedDrafts,
            duplicateEntries,
            successCount,
            errorCount,
            skippedDuplicateCount,
            savedDraftIds,
            discardedDraftIds,
            duplicateReviewCanceled
        };
    },

    createSongpoolDraftFromBandSong(song, visibility = 'public') {
        if (!song) return null;

        return {
            id: `bandpool-${song.id || Math.random().toString(36).slice(2, 9)}`,
            sourceSongId: song.id || null,
            sourceType: 'bandpool',
            sourceLabel: 'Bandpool',
            file: null,
            title: this.cleanImportedSongTitle(song.title, 'Ohne Titel'),
            artist: song.artist || '',
            genre: song.genre || null,
            bpm: song.bpm || null,
            key: song.key || null,
            originalKey: song.originalKey || null,
            timeSignature: song.timeSignature || null,
            language: song.language || null,
            tracks: song.tracks || null,
            leadVocal: song.leadVocal || null,
            ccli: song.ccli || null,
            info: song.info || null,
            pdf_url: song.pdf_url || null,
            visibility: this.normalizeSongpoolVisibility(visibility)
        };
    },

    async createSongpoolDraftFromBandSongFile(song, visibility = 'public', file = null, draftOverrides = {}) {
        const baseDraft = this.createSongpoolDraftFromBandSong(song, visibility);
        if (!baseDraft) return null;
        if (!file) {
            return {
                ...baseDraft,
                ...draftOverrides
            };
        }

        const isChordProUpload = this.isChordProLikeFileName(file.name || '');
        const plainInfo = Storage.getSongPlainInfo(song);
        const chordProText = isChordProUpload ? await file.text() : '';
        const detectedMetadata = isChordProUpload
            ? this.extractSongpoolMetadataFromText(chordProText, file.name, { requireExplicitTitle: true })
            : await this.extractSongpoolMetadataFromPdfFile(file);

        return {
            ...baseDraft,
            ...draftOverrides,
            sourceType: isChordProUpload ? 'chordpro' : 'pdf',
            sourceLabel: isChordProUpload ? 'ChordPro' : 'PDF',
            file,
            pdf_url: null,
            title: baseDraft.title || detectedMetadata?.title || this.getSongpoolImportedFileBaseName(file.name || ''),
            artist: baseDraft.artist || detectedMetadata?.artist || '',
            bpm: baseDraft.bpm || detectedMetadata?.bpm || null,
            key: baseDraft.key || detectedMetadata?.key || null,
            timeSignature: baseDraft.timeSignature || detectedMetadata?.timeSignature || null,
            language: baseDraft.language || detectedMetadata?.language || null,
            info: isChordProUpload
                ? Storage.composeSongInfoWithChordPro(plainInfo, chordProText)
                : (baseDraft.info || null)
        };
    },

    async openSongpoolBandMissingDocumentModal(readySongs = [], missingSongs = [], visibility = 'public', draftMetaBySongId = new Map()) {
        const readyEntries = Array.isArray(readySongs) ? readySongs.filter(Boolean) : [];
        const missingEntries = Array.isArray(missingSongs) ? missingSongs.filter(Boolean) : [];
        const readyDocumentCount = readyEntries.length;
        let missingDocumentCount = missingEntries.length;
        let activeMissingEntries = [...missingEntries];

        if (!missingEntries.length) {
            const drafts = await Promise.all(
                readyEntries.map((song) => this.createSongpoolDraftFromBandSongFile(
                    song,
                    visibility,
                    null,
                    draftMetaBySongId.get(String(song?.id || '')) || {}
                ))
            );
            return {
                confirmed: true,
                drafts: drafts.filter(Boolean)
            };
        }

        return new Promise((resolve) => {
            const tempModal = document.createElement('div');
            tempModal.className = 'modal active';
            const fileSelections = new Map();

            tempModal.innerHTML = `
                <div class="modal-content song-pool-modal songpool-band-import-modal songpool-band-document-modal">
                    <div class="modal-header song-pool-modal-header">
                        <div class="song-pool-title-group">
                            <span class="song-pool-kicker">Songpool</span>
                            <h2>Dateien für den Import ergänzen</h2>
                            <p>Ein Song im Songpool braucht immer eine PDF oder ChordPro-Datei. Für die markierten Band-Songs fehlt diese Datei noch.</p>
                        </div>
                        <button type="button" class="modal-close song-pool-close" aria-label="Schließen">&times;</button>
                    </div>
                    <div class="song-pool-modal-body songpool-band-document-body">
                        <div class="songpool-band-import-toolbar songpool-band-document-toolbar">
                            <div class="songpool-band-import-status songpool-band-document-status">
                                <strong data-band-document-ready-count>${readyDocumentCount}</strong>
                                <span>schon bereit</span>
                            </div>
                            <div class="songpool-band-import-status songpool-band-document-status">
                                <strong data-band-document-missing-count>${missingDocumentCount}</strong>
                                <span>brauchen eine Datei</span>
                            </div>
                            <div class="songpool-duplicate-review-copy songpool-band-document-copy">
                                <strong>Direkt im Import ergänzen</strong>
                                <span>Du kannst jetzt pro Song eine PDF oder ChordPro-Datei anhängen. Danach öffnet sich die Vorschau, in der du unter anderem die Tonart prüfen und ergänzen kannst.</span>
                            </div>
                        </div>
                        <div class="modal-song-list-container song-pool-list songpool-band-document-list" data-band-document-list></div>
                    </div>
                    <div class="song-pool-modal-actions">
                        <button type="button" class="btn btn-secondary" data-action="cancel">Import abbrechen</button>
                        ${readyDocumentCount > 0 ? `<button type="button" class="btn btn-secondary" data-action="ready-only"></button>` : ''}
                        <button type="button" class="btn btn-primary" data-action="continue"></button>
                    </div>
                </div>
            `;

            document.body.appendChild(tempModal);
            document.body.classList.add('modal-open');
            document.documentElement.classList.add('modal-open');

            const listContainer = tempModal.querySelector('[data-band-document-list]');
            const continueButton = tempModal.querySelector('[data-action="continue"]');
            const readyOnlyButton = tempModal.querySelector('[data-action="ready-only"]');
            const readyCountEl = tempModal.querySelector('[data-band-document-ready-count]');
            const missingCountEl = tempModal.querySelector('[data-band-document-missing-count]');

            const closeModal = (result = { confirmed: false, drafts: [] }) => {
                document.removeEventListener('keydown', handleEscape);
                tempModal.remove();
                if (document.querySelectorAll('.modal.active').length === 0) {
                    document.body.classList.remove('modal-open');
                    document.documentElement.classList.remove('modal-open');
                }
                resolve(result);
            };

            const handleEscape = (event) => {
                if (event.key === 'Escape') {
                    closeModal({ confirmed: false, drafts: [] });
                }
            };

            const buildDraftsForSelection = async ({ includeReady = true, includeUploaded = true } = {}) => {
                const drafts = [];

                if (includeReady) {
                    for (const song of readyEntries) {
                        const draft = await this.createSongpoolDraftFromBandSongFile(
                            song,
                            visibility,
                            null,
                            draftMetaBySongId.get(String(song?.id || '')) || {}
                        );
                        if (draft) drafts.push(draft);
                    }
                }

                if (includeUploaded) {
                    for (const song of activeMissingEntries) {
                        const file = fileSelections.get(String(song.id));
                        if (!file) continue;
                        const draft = await this.createSongpoolDraftFromBandSongFile(
                            song,
                            visibility,
                            file,
                            draftMetaBySongId.get(String(song?.id || '')) || {}
                        );
                        if (draft) drafts.push(draft);
                    }
                }

                return drafts;
            };

            const updateStatusCounts = () => {
                missingDocumentCount = activeMissingEntries.filter((song) => !fileSelections.has(String(song.id))).length;

                if (readyCountEl) {
                    readyCountEl.textContent = String(readyDocumentCount);
                }

                if (missingCountEl) {
                    missingCountEl.textContent = String(missingDocumentCount);
                }
            };

            const updateActionState = () => {
                const uploadedCount = activeMissingEntries.filter((song) => fileSelections.has(String(song.id))).length;
                const totalCount = readyDocumentCount + uploadedCount;

                if (continueButton) {
                    continueButton.disabled = totalCount === 0;
                    continueButton.textContent = totalCount > 0
                        ? `${totalCount} Song${totalCount === 1 ? '' : 's'} zur Vorschau`
                        : 'Nichts ausgewählt';
                }

                if (readyOnlyButton) {
                    readyOnlyButton.disabled = readyDocumentCount === 0;
                    readyOnlyButton.textContent = `${readyDocumentCount} Song${readyDocumentCount === 1 ? '' : 's'} zur Vorschau`;
                }
            };

            const renderMissingList = () => {
                if (!listContainer) return;

                if (!activeMissingEntries.length) {
                    listContainer.innerHTML = `
                        <div class="songpool-duplicate-review-empty songpool-band-document-empty">
                            <strong>Keine offenen Datei-Anhänge mehr</strong>
                            <span>Du kannst jetzt mit den übrigen Songs zur Vorschau weitergehen oder den Import abbrechen.</span>
                        </div>
                    `;
                    return;
                }

                listContainer.innerHTML = activeMissingEntries.map((song) => {
                    const selectedFile = fileSelections.get(String(song.id));
                    const fileName = selectedFile?.name || 'Noch keine Datei ausgewählt';
                    const hasFile = Boolean(selectedFile);

                    return `
                        <article class="songpool-band-document-card">
                            <div class="songpool-band-document-head">
                                <div class="songpool-band-document-copy">
                                    <div class="songpool-import-file-line">
                                        <span class="songpool-import-file-pill songpool-band-document-pill">Datei fehlt</span>
                                        <strong>${this.escapeHtml(song.title || 'Ohne Titel')}</strong>
                                    </div>
                                    <span>${this.escapeHtml(song.artist || 'Unbekannter Interpret')}</span>
                                </div>
                                <div class="songpool-band-document-head-actions">
                                    <span class="song-badge ${hasFile ? 'bpm' : ''}">${hasFile ? 'Datei ergänzt' : 'Noch offen'}</span>
                                    <button
                                        type="button"
                                        class="btn-icon songpool-band-document-card-remove"
                                        data-remove-missing-song-id="${this.escapeHtmlAttr(String(song.id))}"
                                        title="Song aus dem Import entfernen"
                                        aria-label="Song aus dem Import entfernen"
                                    >${this.getRundownInlineIcon('close')}</button>
                                </div>
                            </div>
                            <div class="songpool-band-document-upload-row">
                                <label class="btn btn-secondary btn-sm songpool-band-document-upload-btn" for="songpoolBandMissingFile-${this.escapeHtmlAttr(String(song.id))}">
                                    Datei auswählen
                                </label>
                                <input
                                    type="file"
                                    id="songpoolBandMissingFile-${this.escapeHtmlAttr(String(song.id))}"
                                    class="songpool-band-document-input"
                                    data-missing-song-id="${this.escapeHtmlAttr(String(song.id))}"
                                    accept=".pdf,.cho,.chordpro,.chopro,.pro,.crd,.txt,.cp,.chord,text/plain,application/pdf"
                                >
                                <div class="songpool-band-document-file ${hasFile ? 'has-file' : ''}">
                                    <span>${this.escapeHtml(fileName)}</span>
                                    ${hasFile ? `
                                        <button
                                            type="button"
                                            class="btn-icon songpool-band-document-remove"
                                            data-remove-missing-file="${this.escapeHtmlAttr(String(song.id))}"
                                            title="Datei entfernen"
                                            aria-label="Datei entfernen"
                                        >${this.getRundownInlineIcon('close')}</button>
                                    ` : ''}
                                </div>
                            </div>
                        </article>
                    `;
                }).join('');

                listContainer.querySelectorAll('.songpool-band-document-input').forEach((input) => {
                    input.addEventListener('change', () => {
                        const songId = String(input.dataset.missingSongId || '');
                        const file = input.files && input.files[0] ? input.files[0] : null;

                        if (file && !(this.isChordProLikeFileName(file.name) || String(file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
                            UI.showToast('Bitte wähle eine PDF- oder ChordPro-Datei aus.', 'error');
                            input.value = '';
                            return;
                        }

                        if (file) {
                            fileSelections.set(songId, file);
                        } else {
                            fileSelections.delete(songId);
                        }

                        renderMissingList();
                        updateActionState();
                    });
                });

                listContainer.querySelectorAll('[data-remove-missing-song-id]').forEach((button) => {
                    button.addEventListener('click', () => {
                        const songId = String(button.dataset.removeMissingSongId || '');
                        fileSelections.delete(songId);
                        activeMissingEntries = activeMissingEntries.filter((song) => String(song?.id || '') !== songId);
                        updateStatusCounts();
                        renderMissingList();
                        updateActionState();
                    });
                });

                listContainer.querySelectorAll('[data-remove-missing-file]').forEach((button) => {
                    button.addEventListener('click', () => {
                        fileSelections.delete(String(button.dataset.removeMissingFile || ''));
                        updateStatusCounts();
                        renderMissingList();
                        updateActionState();
                    });
                });
            };

            document.addEventListener('keydown', handleEscape);
            updateStatusCounts();
            renderMissingList();
            updateActionState();

            tempModal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
                closeModal({ confirmed: false, drafts: [] });
            });

            readyOnlyButton?.addEventListener('click', async () => {
                const drafts = await buildDraftsForSelection({ includeReady: true, includeUploaded: false });
                closeModal({ confirmed: true, drafts });
            });

            continueButton?.addEventListener('click', async () => {
                const drafts = await buildDraftsForSelection({ includeReady: true, includeUploaded: true });
                closeModal({ confirmed: true, drafts });
            });

            tempModal.querySelector('.song-pool-close')?.addEventListener('click', () => {
                closeModal({ confirmed: false, drafts: [] });
            });

            this.bindSongpoolTempModalBackdropClose(tempModal, () => {
                closeModal({ confirmed: false, drafts: [] });
            });
        });
    },

    removeSongpoolImportDraftsByIds(draftIds = []) {
        const idSet = new Set((Array.isArray(draftIds) ? draftIds : []).map((id) => String(id)));
        if (!idSet.size) return;

        this.songpoolImportDrafts = (Array.isArray(this.songpoolImportDrafts) ? this.songpoolImportDrafts : [])
            .filter((draft) => !idSet.has(String(draft.id)));
    },

    bindSongpoolTempModalBackdropClose(tempModal, onClose) {
        if (!tempModal || typeof onClose !== 'function') return;

        let backdropMouseDown = false;
        let backdropMouseUp = false;

        tempModal.addEventListener('mousedown', (event) => {
            backdropMouseDown = event.target === tempModal;
        });

        tempModal.addEventListener('mouseup', (event) => {
            backdropMouseUp = event.target === tempModal;
        });

        tempModal.addEventListener('click', (event) => {
            const shouldClose = backdropMouseDown && backdropMouseUp && event.target === tempModal;
            backdropMouseDown = false;
            backdropMouseUp = false;

            if (shouldClose) {
                onClose();
            }
        });
    },

    async persistSongpoolImportDraftBatch(drafts = [], user, options = {}) {
        const queue = Array.isArray(drafts) ? drafts : [];
        const progressOffset = Number(options.progressOffset) || 0;
        const progressTotal = Number(options.progressTotal) || queue.length;
        let successCount = 0;
        let errorCount = 0;
        const savedDraftIds = [];

        if (!queue.length || !user) {
            return { successCount, errorCount, savedDraftIds };
        }

        UI.showLoading(`Songs werden gespeichert (${progressOffset}/${progressTotal})...`);

        for (let index = 0; index < queue.length; index++) {
            const draft = queue[index];
            UI.showLoading(`Songs werden gespeichert (${progressOffset + index + 1}/${progressTotal})...`);

            try {
                let pdfUrl = draft.pdf_url || null;

                if (draft.sourceType === 'pdf' && draft.file) {
                    const sb = SupabaseClient.getClient();
                    const fileName = `song-pdf-${Date.now()}-${progressOffset + index}.pdf`;
                    const { error: uploadError } = await sb.storage
                        .from('song-pdfs')
                        .upload(fileName, draft.file, {
                            cacheControl: '3600',
                            contentType: draft.file.type || 'application/pdf'
                        });

                    if (uploadError) {
                        throw uploadError;
                    }

                    const { data: { publicUrl } } = sb.storage
                        .from('song-pdfs')
                        .getPublicUrl(fileName);

                    pdfUrl = publicUrl || null;
                }

                await Storage.createSongpoolSong({
                    title: draft.title,
                    artist: draft.artist || null,
                    genre: draft.genre || null,
                    bpm: draft.bpm ? parseInt(draft.bpm, 10) || null : null,
                    key: draft.key || null,
                    originalKey: draft.originalKey || null,
                    timeSignature: draft.timeSignature || null,
                    language: draft.language || this.getDetectedSongLanguage(draft.title, ''),
                    tracks: draft.tracks || null,
                    info: draft.info || null,
                    ccli: draft.ccli || null,
                    leadVocal: draft.leadVocal || null,
                    pdf_url: pdfUrl,
                    visibility: this.normalizeSongpoolVisibility(draft.visibility),
                    createdBy: user.id
                });

                successCount++;
                savedDraftIds.push(draft.id);
            } catch (error) {
                errorCount++;
                console.error('[Songpool] Draft save failed:', error);
            }
        }

        UI.hideLoading();

        return { successCount, errorCount, savedDraftIds };
    },

    async openSongpoolDuplicateReviewModal(entries = [], options = {}) {
        const duplicateEntries = Array.isArray(entries) ? entries : [];
        if (!duplicateEntries.length) {
            return { confirmed: true, entries: [] };
        }

        const savedCount = Number(options.savedCount) || 0;
        const currentUserId = String(options.userId || '');
        const modalTitle = options.title || 'Mögliche Doppelungen prüfen';
        const modalDescription = options.description || `${savedCount > 0
            ? (savedCount === 1
                ? '1 anderer Song wurde bereits hinzugefügt. '
                : `${savedCount} andere Songs wurden bereits hinzugefügt. `)
            : ''}Du kannst einzelne Treffer aus der Auswahl entfernen und nur die übrigen Songs übernehmen.`;
        const cancelLabel = options.cancelLabel || 'Import abbrechen';

        return new Promise((resolve) => {
            const tempModal = document.createElement('div');
            tempModal.className = 'modal active';
            let activeEntries = [...duplicateEntries];

            const renderBadges = (match) => {
                const badges = [];
                badges.push(`<span class="song-badge">${this.escapeHtml(match.reason)}</span>`);
                badges.push(`
                    <span class="song-badge ${this.normalizeSongpoolVisibility(match.song?.visibility) === 'public' ? 'bpm' : ''}">
                        ${this.normalizeSongpoolVisibility(match.song?.visibility) === 'public' ? 'Öffentlich' : 'Privat'}
                    </span>
                `);

                const originLabel = String(match.song?.createdBy || '') === currentUserId
                    ? 'Dein Songpool'
                    : 'Bereits im Songpool';
                badges.push(`<span class="song-badge">${this.escapeHtml(originLabel)}</span>`);

                if (match.song?.language) {
                    badges.push(`<span class="song-badge">${this.escapeHtml(match.song.language)}</span>`);
                }

                if (match.song?.key) {
                    badges.push(`<span class="song-badge key">${this.escapeHtml(match.song.key)}</span>`);
                }

                return badges.join('');
            };

            const renderMatchInfo = (song) => {
                const infoText = this.getSongInfoDisplay(song);
                return infoText && infoText !== '-' ? `
                    <div class="songpool-duplicate-match-info">${this.escapeHtml(infoText)}</div>
                ` : '';
            };

            tempModal.innerHTML = `
                <div class="modal-content song-pool-modal songpool-band-import-modal songpool-duplicate-import-modal">
                    <div class="modal-header song-pool-modal-header">
                        <div class="song-pool-title-group">
                            <span class="song-pool-kicker">Songpool</span>
                            <h2>${this.escapeHtml(modalTitle)}</h2>
                            <p>${this.escapeHtml(modalDescription)}</p>
                        </div>
                        <button type="button" class="modal-close song-pool-close" aria-label="Schließen">&times;</button>
                    </div>
                    <div class="song-pool-modal-body songpool-duplicate-review-body">
                        <div class="songpool-band-import-toolbar songpool-duplicate-review-toolbar band-details-danger-note" style="margin-bottom: 1.2rem;">
                            <div class="songpool-band-import-status songpool-duplicate-review-status">
                                <strong data-duplicate-review-count></strong>
                            </div>
                            <div class="songpool-duplicate-review-copy" data-duplicate-review-copy>
                                <strong></strong>
                                <span></span>
                            </div>
                        </div>
                        <div class="modal-song-list-container song-pool-list songpool-duplicate-review-list" data-duplicate-review-list></div>
                    </div>
                    <div class="song-pool-modal-actions">
                        <button type="button" class="btn btn-secondary" data-action="cancel">${this.escapeHtml(cancelLabel)}</button>
                        <button type="button" class="btn btn-primary" data-action="confirm">Trotzdem hochladen</button>
                    </div>
                </div>
            `;

            document.body.appendChild(tempModal);
            document.body.classList.add('modal-open');
            document.documentElement.classList.add('modal-open');

            const listContainer = tempModal.querySelector('[data-duplicate-review-list]');
            const countEl = tempModal.querySelector('[data-duplicate-review-count]');
            const copyStrongEl = tempModal.querySelector('[data-duplicate-review-copy] strong');
            const copyTextEl = tempModal.querySelector('[data-duplicate-review-copy] span');
            const confirmButton = tempModal.querySelector('[data-action="confirm"]');

            const getConfirmLabel = () => {
                if (typeof options.getConfirmLabel === 'function') {
                    return options.getConfirmLabel(activeEntries.length, duplicateEntries.length);
                }
                if (activeEntries.length === 0) return 'Ohne Treffer fortfahren';
                if (activeEntries.length === duplicateEntries.length) return 'Trotzdem hochladen';
                return `${activeEntries.length} trotzdem hochladen`;
            };

            const getCopyText = () => {
                if (activeEntries.length === 0) {
                    return 'Alle markierten Treffer wurden aus der Auswahl genommen. Es bleiben nur noch die eindeutigen Songs für den nächsten Schritt übrig.';
                }

                if (activeEntries.length !== duplicateEntries.length) {
                    const removedCount = duplicateEntries.length - activeEntries.length;
                    return `${removedCount} Song${removedCount === 1 ? '' : 's'} wurden aus der Liste entfernt. Prüfe die übrigen Treffer und behalte nur die Songs, die du wirklich weiterverarbeiten möchtest.`;
                }

                return 'Diese Songs sehen bestehenden Einträgen sehr ähnlich. Über das rote X oben rechts kannst du einzelne Titel direkt aus der Auswahl entfernen.';
            };

            const renderActiveEntries = () => {
                if (countEl) {
                    countEl.textContent = activeEntries.length > 0
                        ? this.getSongpoolDuplicateReviewLabel(activeEntries.length)
                        : 'Keine offenen Treffer';
                }

                if (copyStrongEl) {
                    copyStrongEl.textContent = activeEntries.length > 0
                        ? 'Ähnliche Songs sind bereits im Songpool'
                        : 'Keine weiteren Doppelungen ausgewählt';
                }

                if (copyTextEl) {
                    copyTextEl.textContent = getCopyText();
                }

                if (confirmButton) {
                    confirmButton.textContent = getConfirmLabel();
                }

                if (!listContainer) return;

                if (!activeEntries.length) {
                    listContainer.innerHTML = `
                        <div class="songpool-band-import-empty songpool-duplicate-review-empty">
                            <strong>Keine Treffer mehr in der Auswahl</strong>
                            <span>Du kannst jetzt ohne diese Songs fortfahren oder das Fenster schließen.</span>
                        </div>
                    `;
                    return;
                }

                listContainer.innerHTML = activeEntries.map((entry) => `
                    <article class="songpool-duplicate-review-card" data-duplicate-draft-id="${this.escapeHtmlAttr(entry.draft?.id || '')}">
                        <div class="songpool-duplicate-review-head">
                            <div class="songpool-duplicate-review-draft">
                                            <div class="songpool-import-file-line">
                                                <span class="songpool-import-file-pill">${this.escapeHtml(entry.draft?.sourceLabel || 'Import')}</span>
                                                <strong>${this.escapeHtml(entry.draft?.title || 'Ohne Titel')}</strong>
                                            </div>
                                            <span>${this.escapeHtml([
                                                entry.draft?.artist || 'Unbekannter Interpret',
                                                entry.draft?.key ? `Tonart ${entry.draft.key}` : ''
                                            ].filter(Boolean).join(' • '))}</span>
                                        </div>
                            <div class="songpool-duplicate-review-head-actions">
                                <div class="songpool-band-import-status songpool-duplicate-hit-count">
                                    <strong>${this.escapeHtml(this.getSongpoolDuplicateMatchCountLabel(entry.matches.length))}</strong>
                                </div>
                                <button
                                    type="button"
                                    class="btn-icon songpool-duplicate-review-remove"
                                    data-remove-duplicate-draft-id="${this.escapeHtmlAttr(entry.draft?.id || '')}"
                                    title="Nicht hochladen"
                                    aria-label="Diesen Song nicht hochladen"
                                >${this.getRundownInlineIcon('close')}</button>
                            </div>
                        </div>
                        <div class="songpool-duplicate-match-list">
                            ${entry.matches.map((match) => `
                                <article class="song-selection-card songpool-duplicate-match-card">
                                    <div class="song-card-content">
                                        <div class="song-card-title">${this.escapeHtml(match.song?.title || 'Ohne Titel')}</div>
                                        <div class="song-card-artist">${this.escapeHtml(match.song?.artist || 'Unbekannter Interpret')}</div>
                                        <div class="song-card-badges">
                                            ${renderBadges(match)}
                                        </div>
                                        ${renderMatchInfo(match.song)}
                                    </div>
                                </article>
                            `).join('')}
                        </div>
                    </article>
                `).join('');

                listContainer.querySelectorAll('[data-remove-duplicate-draft-id]').forEach((button) => {
                    button.addEventListener('click', () => {
                        activeEntries = activeEntries.filter((entry) => String(entry?.draft?.id) !== String(button.dataset.removeDuplicateDraftId));
                        renderActiveEntries();
                    });
                });
            };

            const closeModal = (result = false) => {
                document.removeEventListener('keydown', handleEscape);
                tempModal.remove();
                if (document.querySelectorAll('.modal.active').length === 0) {
                    document.body.classList.remove('modal-open');
                    document.documentElement.classList.remove('modal-open');
                }
                resolve({
                    confirmed: result === true,
                    entries: [...activeEntries]
                });
            };

            const handleEscape = (event) => {
                if (event.key === 'Escape') {
                    closeModal(false);
                }
            };

            document.addEventListener('keydown', handleEscape);

            renderActiveEntries();
            tempModal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => closeModal(false));
            tempModal.querySelector('[data-action="confirm"]')?.addEventListener('click', () => closeModal(true));
            tempModal.querySelector('.song-pool-close')?.addEventListener('click', () => closeModal(false));
            this.bindSongpoolTempModalBackdropClose(tempModal, () => {
                closeModal(false);
            });
        });
    },

    normalizeImportedSongKeyCandidate(value = '') {
        const normalized = String(value || '')
            .trim()
            .replace(/[\[\](){}/\\|]/g, '')
            .replace(/♯/g, '#')
            .replace(/♭/g, 'b')
            .replace(/\s+/g, '');

        if (!normalized) return '';

        const match = normalized.match(/^([A-Ha-h])([#b]?)(maj|min|m|sus\d*|sus|dim|aug|add\d+|\d+)?(?:\/([A-Ha-h])([#b]?))?$/i);
        if (!match) return '';

        const [, root, accidental = '', quality = '', slashRoot = '', slashAccidental = ''] = match;
        const normalizedRoot = String(root || '').toUpperCase();
        const normalizedQuality = quality
            ? (String(quality).toLowerCase() === 'min' ? 'm' : String(quality))
            : '';
        const normalizedSlash = slashRoot
            ? `/${String(slashRoot).toUpperCase()}${slashAccidental || ''}`
            : '';

        return `${normalizedRoot}${accidental || ''}${normalizedQuality}${normalizedSlash}`;
    },

    extractSongpoolTitleAndKeyFromFileName(fileName = '') {
        const rawBaseName = decodeURIComponent(String(fileName || ''))
            .replace(/\.[^.]+$/, '')
            .replace(/\s+\d+$/, '')
            .trim();

        if (!rawBaseName) {
            return { title: '', key: null };
        }

        const normalizedBaseName = rawBaseName
            .replace(/[“”„"'’`´‚]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        let titleSource = rawBaseName;
        let detectedKey = null;

        const trailingKeyPatterns = [
            /^(.*?)(?:\s*[-_–—,:;|/\\]+\s*)([A-Ha-h][A-Za-z0-9#b♯♭/+_-]*)\s*$/,
            /^(.*?)(?:\s+)([A-Ha-h][A-Za-z0-9#b♯♭/+_-]*)\s*$/
        ];

        for (let index = 0; index < trailingKeyPatterns.length; index++) {
            const match = normalizedBaseName.match(trailingKeyPatterns[index]);
            if (!match) continue;

            const potentialTitle = String(match[1] || '').trim();
            const potentialKey = String(match[2] || '').trim();
            const normalizedKey = this.normalizeImportedSongKeyCandidate(potentialKey);
            const plainCandidate = potentialKey.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
            const keyLooksSpecific = /[#b♯♭/]/.test(potentialKey) || /\d/.test(potentialKey) || plainCandidate.length > 1;
            const normalizedPotentialTitle = this.normalizeImportedSongTitleCandidate(potentialTitle);
            const titleTokenCount = normalizedPotentialTitle.split(/\s+/).filter(Boolean).length;
            const titleLooksSafe = normalizedPotentialTitle.length >= 4 || titleTokenCount >= 2;
            const hasExplicitDelimiter = index === 0;

            if (normalizedKey && (hasExplicitDelimiter || keyLooksSpecific) && titleLooksSafe) {
                titleSource = potentialTitle;
                detectedKey = normalizedKey;
                break;
            }
        }

        let detectedArtist = '';
        const titleWithoutKey = String(titleSource || '').trim();
        const trailingArtistMatch = titleWithoutKey.match(/^(.*?)(?:\s*[\[(]\s*([^()[\]{}]+?)\s*[\])])\s*$/);
        if (trailingArtistMatch) {
            const potentialTitle = this.normalizeImportedSongTitleCandidate(String(trailingArtistMatch[1] || '').trim());
            const potentialArtist = this.normalizeImportedSongTitleCandidate(String(trailingArtistMatch[2] || '').trim());

            if (
                potentialTitle
                && potentialArtist
                && !this.isWeakImportedSongTitleCandidate(potentialTitle)
                && !this.isWeakImportedSongTitleCandidate(potentialArtist)
            ) {
                titleSource = potentialTitle;
                detectedArtist = potentialArtist;
            }
        }

        return {
            title: this.normalizeImportedSongTitleCandidate(
                String(titleSource || '')
                    .replace(/[_-]+/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim()
            ),
            artist: detectedArtist || '',
            key: detectedKey || null
        };
    },

    getSongpoolImportedFileBaseName(fileName = '') {
        return this.extractSongpoolTitleAndKeyFromFileName(fileName).title;
    },

    getSongpoolImportedFileKey(fileName = '') {
        return this.extractSongpoolTitleAndKeyFromFileName(fileName).key;
    },

    cleanImportedSongTitle(title = '', fallbackTitle = '') {
        const cleanedTitle = this.normalizeImportedSongTitleCandidate(title);
        if (cleanedTitle && !this.isWeakImportedSongTitleCandidate(cleanedTitle)) return cleanedTitle;

        const normalizedFallbackTitle = this.normalizeImportedSongTitleCandidate(fallbackTitle);
        if (normalizedFallbackTitle) return normalizedFallbackTitle;
        return 'Ohne Titel';
    },

    normalizeImportedSongTitleCandidate(value = '') {
        let normalized = String(value || '')
            .replace(/^\{(?:title|t)\s*:\s*|\}$/gi, '')
            .replace(/\[[A-H](?:[#b♯♭]|m|maj|min|sus|dim|aug|add|\d|\/)*\]/gi, ' ')
            .replace(/[_–—-]+/g, ' ')
            .replace(/[|/\\]+/g, ' ')
            .replace(/[“”„"’`´]/g, ' ')
            .replace(/[^\p{L}\p{N}\s()&+]/gu, ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .replace(/^[\s\-–—:|,.]+|[\s\-–—:|,.]+$/g, '')
            .trim();

        if (!normalized) return '';

        normalized = normalized
            .split(/\s+/)
            .map((word, index, words) => this.normalizeImportedSongTitleWord(word, index, words.length))
            .join(' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        return normalized;
    },

    normalizeImportedSongTitleWord(word = '', index = 0, totalWords = 1) {
        const match = String(word || '').match(/^(\(*)(.*?)(\)*)$/);
        if (!match) return word;

        const [, leadingParens, rawCore, trailingParens] = match;
        const core = String(rawCore || '').trim();
        if (!core) return word;

        const lowerCore = core.toLowerCase();
        const lowerSmallWords = new Set([
            'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'vs',
            'am', 'an', 'auf', 'aus', 'bei', 'bis', 'das', 'dem', 'den', 'der', 'des', 'die', 'ein', 'eine',
            'einer', 'eines', 'für', 'fuer', 'im', 'mit', 'nach', 'ohne', 'und', 'vom', 'von', 'vor', 'zum', 'zur'
        ]);

        const shouldStayLower = index > 0 && index < totalWords - 1 && lowerSmallWords.has(lowerCore);
        const normalizedCore = shouldStayLower
            ? lowerCore
            : lowerCore.charAt(0).toUpperCase() + lowerCore.slice(1);

        return `${leadingParens}${normalizedCore}${trailingParens}`;
    },

    stripImportedChordLineArtifacts(line = '') {
        return String(line || '')
            .replace(/\[[A-H](?:[#b♯♭]|m|maj|min|sus|dim|aug|add|\d|\/)*\]/gi, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    },

    isWeakImportedSongTitleCandidate(title = '') {
        const normalized = this.normalizeImportedSongTitleCandidate(title);
        if (!normalized) return true;
        if (normalized.length < 2 || normalized.length > 120) return true;
        if (!/[A-Za-zÄÖÜäöüß]/.test(normalized)) return true;

        const tokens = normalized
            .split(/\s+/)
            .map((token) => token.replace(/[()]/g, '').trim())
            .filter(Boolean);

        if (tokens.length === 0) return true;
        if (tokens.length > 7) return true;
        if (tokens.length > 5 && normalized.length > 55) return true;

        const singleLetterTokenCount = tokens.filter((token) => token.length === 1).length;
        if (tokens.length > 4 && singleLetterTokenCount > 1) return true;

        const lower = normalized.toLowerCase();
        const blockedValues = new Set([
            'verse', 'vers', 'chorus', 'refrain', 'bridge', 'intro', 'outro', 'ending', 'interlude',
            'instrumental', 'solo', 'tag', 'pre chorus', 'prechorus', 'strophe', 'stanza', 'teil'
        ]);

        const lyricTokens = new Set([
            'i', 'you', 'your', 'me', 'my', 'we', 'our', 'he', 'she', 'they', 'their',
            'was', 'were', 'am', 'are', 'is', 'with', 'without', 'now', 'then', 'just',
            'lost', 'broken', 'picked', 'set', 'apart', 'heart'
        ]);
        const lyricTokenCount = tokens.filter((token) => lyricTokens.has(token.toLowerCase())).length;

        if (blockedValues.has(lower)) return true;
        if (/^\{[^}]+\}$/.test(String(title || '').trim())) return true;
        if (/^(?:c|comment|soc|start_of_chorus|eoc|end_of_chorus)\s*[:\-]/i.test(lower)) return true;
        if (/^[\d\s().-]+$/.test(normalized)) return true;
        if (tokens.length >= 6 && lyricTokenCount >= 3) return true;
        return false;
    },

    isLikelyImportedChordLine(line = '') {
        const tokens = String(line || '')
            .replace(/\[[^\]]+\]/g, ' ')
            .split(/\s+/)
            .map(token => token.replace(/[|()[\],.;:!?]/g, '').trim())
            .filter(Boolean);

        if (tokens.length === 0 || tokens.length > 8) return false;

        const chordRegex = /^[A-H](?:[#b]|m|maj|min|sus|dim|aug|add|\d|\/)*$/i;
        const chordTokenCount = tokens.filter(token => chordRegex.test(token)).length;
        return chordTokenCount > 0 && (chordTokenCount / tokens.length) >= 0.6;
    },

    isLikelyImportedSongTitleLine(line = '') {
        const rawLine = String(line || '').replace(/\s+/g, ' ').trim();
        if (!rawLine) return false;
        if (/^\{[^}]+\}$/.test(rawLine)) return false;

        const normalizedLine = this.normalizeImportedSongTitleCandidate(this.stripImportedChordLineArtifacts(rawLine));
        if (!normalizedLine) return false;
        if (normalizedLine.length < 2 || normalizedLine.length > 90) return false;
        if (!/[A-Za-zÄÖÜäöüß]/.test(normalizedLine)) return false;
        if (this.isLikelyImportedChordLine(rawLine) || this.isLikelyImportedChordLine(normalizedLine)) return false;
        if (this.isWeakImportedSongTitleCandidate(normalizedLine)) return false;

        const lower = normalizedLine.toLowerCase();
        const blockedPrefixes = [
            'key:', 'tonart:', 'tempo:', 'bpm:', 'time:', 'taktart:', 'copyright:',
            'artist:', 'interpret:', 'verse', 'chorus', 'bridge', 'intro', 'outro', 'comment:'
        ];
        return !blockedPrefixes.some(prefix => lower.startsWith(prefix));
    },

    extractSongpoolMetadataFromText(rawText = '', fileName = '', options = {}) {
        const text = String(rawText || '').replace(/\r/g, '\n');
        const fileNameMeta = this.extractSongpoolTitleAndKeyFromFileName(fileName);
        const fallbackTitle = fileNameMeta.title;
        const requireExplicitTitle = Boolean(options && options.requireExplicitTitle);
        const lines = text
            .split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        const metadata = {
            title: '',
            artist: '',
            key: '',
            timeSignature: '',
            bpm: '',
            detectedFrom: fallbackTitle ? 'Dateiname' : 'Inhalt'
        };

        const applyExplicitMetadataValue = (field, rawValue = '') => {
            const value = String(rawValue || '').trim();
            if (!value) return;

            if (field === 'title') {
                const normalizedDirectiveTitle = this.normalizeImportedSongTitleCandidate(value);
                if (!this.isWeakImportedSongTitleCandidate(normalizedDirectiveTitle)) {
                    metadata.title = normalizedDirectiveTitle;
                    metadata.detectedFrom = 'Dateiinhalt';
                }
                return;
            }

            if (field === 'artist' && !metadata.artist) {
                metadata.artist = this.normalizeImportedSongTitleCandidate(value);
                return;
            }

            if (field === 'key' && !metadata.key) {
                metadata.key = value.replace(/[\[\]]/g, '').trim() || '';
                return;
            }

            if (field === 'timeSignature' && !metadata.timeSignature) {
                const normalizedTime = value.match(/\d+\s*\/\s*\d+/);
                metadata.timeSignature = normalizedTime ? normalizedTime[0].replace(/\s+/g, '') : value;
                return;
            }

            if (field === 'bpm' && !metadata.bpm) {
                const normalizedBpm = String(value).match(/\d{1,3}/);
                metadata.bpm = normalizedBpm ? normalizedBpm[0] : '';
            }
        };

        for (const line of lines) {
            const directiveMatch = line.match(/^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}$/);
            if (directiveMatch) {
                const key = directiveMatch[1].trim().toLowerCase();
                const value = directiveMatch[2].trim();
                if (key === 'title' || key === 'titel' || key === 't') {
                    applyExplicitMetadataValue('title', value);
                } else if (key === 'artist' || key === 'subtitle' || key === 'st') {
                    applyExplicitMetadataValue('artist', value);
                } else if (key === 'key' || key === 'tonart') {
                    applyExplicitMetadataValue('key', value);
                } else if (key === 'time' || key === 'taktart' || key === 'meter') {
                    applyExplicitMetadataValue('timeSignature', value);
                } else if (key === 'tempo' || key === 'bpm') {
                    applyExplicitMetadataValue('bpm', value);
                }
                continue;
            }

            const cleanedLine = this.normalizeImportedSongTitleCandidate(this.stripImportedChordLineArtifacts(line));

            if (!metadata.title) {
                const explicitTitleMatch = line.match(/^(?:title|titel|t)\s*[:\-]\s*(.+)$/i);
                if (explicitTitleMatch) {
                    applyExplicitMetadataValue('title', explicitTitleMatch[1]);
                    continue;
                }
            }

            if (!metadata.artist) {
                const artistMatch = cleanedLine.match(/^(?:artist|interpret)\s*[:\-]\s*(.+)$/i);
                if (artistMatch) {
                    applyExplicitMetadataValue('artist', artistMatch[1]);
                }
            }

            if (!metadata.key) {
                const keyMatch = line.match(/(?:key|tonart)\s*[:\-]\s*([^\n]+)/i);
                if (keyMatch) {
                    applyExplicitMetadataValue('key', keyMatch[1]);
                }
            }

            if (!metadata.timeSignature) {
                const timeMatch = line.match(/(?:time|taktart|meter)\s*[:\-]\s*([^\n]+)/i);
                if (timeMatch) {
                    applyExplicitMetadataValue('timeSignature', timeMatch[1]);
                }
            }

            if (!metadata.bpm) {
                const bpmMatch = line.match(/(?:tempo|bpm)\s*[:\-]\s*([^\n]+)/i);
                if (bpmMatch) {
                    applyExplicitMetadataValue('bpm', bpmMatch[1]);
                }
            }

            if (!requireExplicitTitle && !metadata.title && this.isLikelyImportedSongTitleLine(cleanedLine)) {
                metadata.title = cleanedLine;
                metadata.detectedFrom = 'Dateiinhalt';
            }
        }

        if (!requireExplicitTitle && !metadata.title) {
            const firstUsableLine = lines
                .map((line) => this.normalizeImportedSongTitleCandidate(this.stripImportedChordLineArtifacts(line)))
                .find((line) => this.isLikelyImportedSongTitleLine(line));
            if (firstUsableLine) {
                metadata.title = firstUsableLine;
                metadata.detectedFrom = 'Dateiinhalt';
            }
        }

        const title = this.cleanImportedSongTitle(metadata.title, fallbackTitle);
        return {
            title,
            artist: metadata.artist || '',
            key: metadata.key || fileNameMeta.key || null,
            timeSignature: metadata.timeSignature || null,
            bpm: metadata.bpm ? parseInt(metadata.bpm, 10) || null : null,
            language: this.getDetectedSongLanguage(title, ''),
            detectedFrom: metadata.detectedFrom
        };
    },

    async extractSongpoolMetadataFromPdfFile(file) {
        if (!file) {
            return this.extractSongpoolMetadataFromText('', '');
        }

        const fileNameMeta = this.extractSongpoolTitleAndKeyFromFileName(file.name);
        const fallbackTitle = fileNameMeta.title;

        try {
            if (!window.pdfjsLib) {
                throw new Error('pdf.js ist nicht verfügbar.');
            }

            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = window.pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true
            });
            const pdf = await loadingTask.promise;

            let extractedText = '';
            const maxPages = Math.min(pdf.numPages || 0, 2);

            for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const textContent = await page.getTextContent({ includeMarkedContent: true });
                const sortedItems = (textContent.items || [])
                    .filter(item => item && item.transform && Array.isArray(item.transform))
                    .slice()
                    .sort((left, right) => {
                        const yDiff = left.transform[5] - right.transform[5];
                        if (Math.abs(yDiff) < 5) return left.transform[4] - right.transform[4];
                        return -yDiff;
                    });

                let lastY = null;
                sortedItems.forEach((item) => {
                    if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                        extractedText += '\n';
                    }
                    extractedText += item.str || '';
                    lastY = item.transform[5];
                });
                extractedText += '\n';
            }

            const metadata = this.extractSongpoolMetadataFromText(extractedText, file.name);
            return {
                ...metadata,
                title: this.cleanImportedSongTitle(fileNameMeta.title, metadata.title || fallbackTitle),
                artist: fileNameMeta.artist || metadata.artist || '',
                key: fileNameMeta.key || metadata.key || null,
                detectedFrom: fileNameMeta.title ? 'Dateiname' : (extractedText.trim() ? metadata.detectedFrom : 'Dateiname')
            };
        } catch (error) {
            console.warn('[Songpool] PDF metadata extraction failed:', error);
            return {
                title: this.cleanImportedSongTitle(fileNameMeta.title, fallbackTitle),
                artist: fileNameMeta.artist || '',
                key: fileNameMeta.key || null,
                timeSignature: null,
                bpm: null,
                language: this.getDetectedSongLanguage(fileNameMeta.title || fallbackTitle, ''),
                detectedFrom: 'Dateiname'
            };
        }
    },

    async createSongpoolImportDraft(file) {
        if (!file) return null;

        const lowerName = String(file.name || '').toLowerCase();
        const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
        const isChordPro = ['.cho', '.chordpro', '.chopro', '.pro', '.crd', '.txt', '.cp', '.chord'].some(ext => lowerName.endsWith(ext));

        if (!isPdf && !isChordPro) {
            throw new Error(`"${file.name}" ist kein unterstütztes PDF- oder ChordPro-Format.`);
        }

        const draftId = typeof Storage !== 'undefined' && typeof Storage.generateId === 'function'
            ? Storage.generateId()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        let metadata = null;
        let info = null;

        if (isPdf) {
            metadata = await this.extractSongpoolMetadataFromPdfFile(file);
        } else {
            const chordProText = await file.text();
            metadata = this.extractSongpoolMetadataFromText(chordProText, file.name, { requireExplicitTitle: true });
            info = Storage.composeSongInfoWithChordPro('', chordProText);
        }

        return {
            id: draftId,
            file,
            sourceType: isPdf ? 'pdf' : 'chordpro',
            sourceLabel: isPdf ? 'PDF' : 'ChordPro',
            detectedFrom: metadata?.detectedFrom || 'Dateiname',
            title: this.cleanImportedSongTitle(metadata?.title, this.getSongpoolImportedFileBaseName(file.name)),
            artist: metadata?.artist || '',
            bpm: metadata?.bpm || null,
            key: metadata?.key || null,
            originalKey: null,
            timeSignature: metadata?.timeSignature || null,
            language: metadata?.language || null,
            tracks: null,
            leadVocal: null,
            ccli: null,
            info,
            visibility: 'public'
        };
    },

    normalizeSongKeySelectValue(value = '') {
        const normalizedValue = String(value || '').trim();
        const keyMap = {
            Db: 'C#',
            Eb: 'D#',
            Gb: 'F#',
            Ab: 'G#',
            Bb: 'A#',
            db: 'C#',
            eb: 'D#',
            gb: 'F#',
            ab: 'G#',
            bb: 'A#'
        };
        return keyMap[normalizedValue] || normalizedValue;
    },

    setSongFormFieldValue(fieldId, value, options = {}) {
        const field = document.getElementById(fieldId);
        if (!field) return false;

        const nextValue = value == null ? '' : String(value);
        if (!nextValue.trim()) return false;

        const currentValue = String(field.value || '').trim();
        const shouldOverwrite = options.overwrite === true;
        if (!shouldOverwrite && currentValue) {
            return false;
        }

        field.value = (fieldId === 'songKey' || fieldId === 'songOriginalKey')
            ? this.normalizeSongKeySelectValue(nextValue)
            : nextValue;

        return true;
    },

    setSongFileSelectionState(file = null, fallbackFileName = '') {
        const currentPdfContainer = document.getElementById('songCurrentPdf');
        const pdfNameSpan = document.getElementById('songPdfName');
        const deletePdfBtn = document.getElementById('deleteSongPdfBtn');
        const songId = String(document.getElementById('songId')?.value || '').trim();
        const fileName = String(file?.name || fallbackFileName || '').trim();

        if (!currentPdfContainer || !pdfNameSpan) return;

        if (fileName) {
            currentPdfContainer.style.display = 'block';
            pdfNameSpan.textContent = fileName;
            if (deletePdfBtn) {
                deletePdfBtn.hidden = !songId;
            }
            return;
        }

        currentPdfContainer.style.display = 'none';
        if (deletePdfBtn) {
            deletePdfBtn.hidden = false;
        }
    },

    async applyImportedSongMetadataToForm(file, options = {}) {
        if (!file) return null;

        const lowerName = String(file.name || '').toLowerCase();
        const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
        const isChordPro = this.isChordProLikeFileName(file.name || '');

        if (!isPdf && !isChordPro) {
            return null;
        }

        let metadata = null;
        if (isPdf) {
            metadata = await this.extractSongpoolMetadataFromPdfFile(file);
        } else {
            const chordProText = await file.text();
            metadata = this.extractSongpoolMetadataFromText(chordProText, file.name, { requireExplicitTitle: true });
        }

        const cleanedTitle = this.cleanImportedSongTitle(
            metadata?.title,
            this.getSongpoolImportedFileBaseName(file.name || '')
        );
        const detectedLanguage = this.getDetectedSongLanguage(cleanedTitle, metadata?.language || '');
        const overwrite = options.overwriteExisting === true;
        this.clearSongAutofillResults();

        this.setSongFormFieldValue('songTitle', cleanedTitle, { overwrite });
        this.setSongFormFieldValue('songArtist', metadata?.artist || '', { overwrite });
        this.setSongFormFieldValue('songBPM', metadata?.bpm || '', { overwrite });
        this.setSongFormFieldValue('songKey', metadata?.key || '', { overwrite });
        this.setSongFormFieldValue('songTimeSignature', metadata?.timeSignature || '', { overwrite });
        this.setSongFormFieldValue('songLanguage', detectedLanguage || '', { overwrite });

        if (detectedLanguage) {
            const languageInput = document.getElementById('songLanguage');
            if (languageInput && String(languageInput.value || '').trim() === detectedLanguage) {
                this.songLanguageAutoValue = detectedLanguage;
            }
        }

        this.syncInferredSongLanguage({
            force: overwrite === true && !String(document.getElementById('songLanguage')?.value || '').trim()
        });
        return metadata;
    },

    async handleSongpoolUploadSelection(event) {
        const files = Array.from(event?.target?.files || []);
        if (!files.length) return;

        let drafts = [];
        const errors = [];

        UI.showLoading(`Dateien werden analysiert (0/${files.length})...`);

        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            UI.showLoading(`Dateien werden analysiert (${index + 1}/${files.length})...`);

            try {
                const draft = await this.createSongpoolImportDraft(file);
                if (draft) drafts.push(draft);
            } catch (error) {
                console.error('[Songpool] Import draft could not be created:', error);
                errors.push(error.message || `"${file.name}" konnte nicht verarbeitet werden.`);
            }
        }

        UI.hideLoading();
        if (event?.target) {
            event.target.value = '';
        }

        if (!drafts.length) {
            UI.showToast(errors[0] || 'Keine gültigen Dateien gefunden.', 'error');
            return;
        }

        const user = Auth.getCurrentUser();
        if (!user) {
            UI.showToast('Du musst angemeldet sein, um Songs zu importieren.', 'error');
            return;
        }

        try {
            const existingSongs = await Storage.getSongpoolSongs(user.id, { includePublic: true });
            const duplicateEntries = this.buildSongpoolDuplicateEntries(drafts, existingSongs);

            if (duplicateEntries.length > 0) {
                const reviewResult = await this.openSongpoolDuplicateReviewModal(duplicateEntries, {
                    userId: user.id,
                    title: 'Ähnliche Songs vorab prüfen',
                    description: 'Bevor du die Songs bearbeitest, kannst du hier mögliche Doppelungen direkt aussortieren.',
                    getConfirmLabel: (activeCount, totalCount) => {
                        if (activeCount === 0) return 'Ohne Treffer weiter';
                        if (activeCount === totalCount) return 'Zur Bearbeitung weiter';
                        return `${activeCount} zur Bearbeitung weiter`;
                    }
                });

                if (!reviewResult?.confirmed) {
                    UI.showToast('Import abgebrochen.', 'info');
                    return;
                }

                const selectedEntryIds = new Set(
                    (Array.isArray(reviewResult.entries) ? reviewResult.entries : [])
                        .map((entry) => String(entry?.draft?.id || ''))
                        .filter(Boolean)
                );
                const duplicateEntryIdSet = new Set(
                    duplicateEntries
                        .map((entry) => String(entry?.draft?.id || ''))
                        .filter(Boolean)
                );

                drafts = drafts
                    .filter((draft) => !duplicateEntryIdSet.has(String(draft.id)) || selectedEntryIds.has(String(draft.id)))
                    .map((draft) => (
                        selectedEntryIds.has(String(draft.id))
                            ? {
                                ...draft,
                                duplicateReviewApproved: true,
                                duplicateReviewSignature: this.getSongpoolDuplicateDraftSignature(draft)
                            }
                            : draft
                    ));

                if (!drafts.length) {
                    UI.showToast('Keine Songs mehr zum Bearbeiten ausgewählt.', 'info');
                    return;
                }
            }
        } catch (error) {
            console.error('[Songpool] Duplicate pre-check could not be prepared:', error);
            UI.showToast(Storage._getSongpoolErrorMessage(error, 'Songpool konnte nicht geprüft werden.'), 'error');
            return;
        }

        this.openSongpoolImportPreview(drafts);

        if (errors.length > 0) {
            UI.showToast(`${errors.length} Datei${errors.length === 1 ? '' : 'en'} konnten nicht vollständig gelesen werden.`, 'warning');
        }
    },

    openSongpoolImportPreview(drafts = []) {
        this.songpoolImportDrafts = Array.isArray(drafts) ? drafts.filter(Boolean) : [];
        this.renderSongpoolImportPreview();
        UI.openModal('songpoolImportModal');
    },

    renderSongpoolImportPreview() {
        const container = document.getElementById('songpoolImportDrafts');
        const summary = document.getElementById('songpoolImportSummary');
        const confirmButton = document.getElementById('confirmSongpoolImportBtn');
        if (!container || !summary || !confirmButton) return;

        const drafts = Array.isArray(this.songpoolImportDrafts) ? this.songpoolImportDrafts : [];
        summary.textContent = `${drafts.length} Song${drafts.length === 1 ? '' : 's'} erkannt`;
        confirmButton.disabled = drafts.length === 0;

        if (!drafts.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Keine Dateien mehr in der Import-Vorschau.</p>
                    <p class="empty-state-note">Wähle im Songpool neue PDFs oder ChordPro-Dateien aus, um Songs gesammelt hinzuzufügen.</p>
                </div>
            `;
            return;
        }

        const renderMetaChip = (label, value) => value
            ? `<span class="songpool-import-meta-chip"><strong>${this.escapeHtml(label)}</strong><span>${this.escapeHtml(String(value))}</span></span>`
            : '';

        container.innerHTML = drafts.map((draft) => `
            <article class="songpool-import-card" data-draft-id="${draft.id}">
                <div class="songpool-import-card-head">
                    <div class="songpool-import-file-copy">
                        <div class="songpool-import-file-line">
                            <span class="songpool-import-file-pill">${this.escapeHtml(draft.sourceLabel)}</span>
                            <strong>${this.escapeHtml(draft.file?.name || draft.title || 'Neue Datei')}</strong>
                        </div>
                        <span class="songpool-import-file-hint">Songname erkannt über: ${this.escapeHtml(draft.detectedFrom || 'Dateiname')}</span>
                    </div>
                    <button type="button" class="btn-icon songpool-import-remove" data-draft-id="${draft.id}" title="Entfernen" aria-label="Entfernen">${this.getRundownInlineIcon('trash')}</button>
                </div>
                <div class="songpool-import-grid">
                    <div class="form-group">
                        <label for="songpoolDraftTitle-${draft.id}">Titel</label>
                        <input type="text" id="songpoolDraftTitle-${draft.id}" data-draft-field="title" data-draft-id="${draft.id}" value="${this.escapeHtml(draft.title || '')}">
                    </div>
                    <div class="form-group">
                        <label for="songpoolDraftArtist-${draft.id}">Interpret</label>
                        <input type="text" id="songpoolDraftArtist-${draft.id}" data-draft-field="artist" data-draft-id="${draft.id}" value="${this.escapeHtml(draft.artist || '')}">
                    </div>
                    <div class="form-group">
                        <label for="songpoolDraftBpm-${draft.id}">BPM</label>
                        <input type="number" min="0" step="1" id="songpoolDraftBpm-${draft.id}" data-draft-field="bpm" data-draft-id="${draft.id}" value="${this.escapeHtml(draft.bpm || '')}">
                    </div>
                    <div class="form-group">
                        <label for="songpoolDraftKey-${draft.id}">Tonart${this.songpoolEntryRequiresKey(draft) ? ' <span class="required-indicator" title="Pflichtfeld bei PDF">*</span>' : ''}</label>
                        <input type="text" id="songpoolDraftKey-${draft.id}" data-draft-field="key" data-draft-id="${draft.id}" value="${this.escapeHtml(draft.key || '')}">
                    </div>
                    <div class="form-group">
                        <label for="songpoolDraftTime-${draft.id}">Time</label>
                        <input type="text" id="songpoolDraftTime-${draft.id}" data-draft-field="timeSignature" data-draft-id="${draft.id}" value="${this.escapeHtml(draft.timeSignature || '')}">
                    </div>
                    <div class="form-group">
                        <label for="songpoolDraftLanguage-${draft.id}">Sprache</label>
                        <input type="text" id="songpoolDraftLanguage-${draft.id}" data-draft-field="language" data-draft-id="${draft.id}" value="${this.escapeHtml(draft.language || '')}">
                    </div>
                    <div class="form-group full-width">
                        <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem; padding: 1rem; background: var(--color-surface-hover); border-radius: 12px; border: 1px solid var(--color-border);">
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                <span style="font-size: 1.2rem;">👁️</span>
                                <strong style="font-size: 0.95rem;">Sichtbarkeit</strong>
                            </div>
                            <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                                <input type="radio" name="songpoolDraftVisibility-${draft.id}" value="private" data-draft-field="visibility" data-draft-id="${draft.id}"${this.normalizeSongpoolVisibility(draft.visibility) === 'private' ? ' checked' : ''} style="margin-top: 0.25rem;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem;">Privat</div>
                                    <div style="font-size: 0.8rem; color: var(--color-text-muted);">Nur du kannst diesen Song in deinem Songpool sehen.</div>
                                </div>
                            </label>
                            <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                                <input type="radio" name="songpoolDraftVisibility-${draft.id}" value="public" data-draft-field="visibility" data-draft-id="${draft.id}"${this.normalizeSongpoolVisibility(draft.visibility) === 'public' ? ' checked' : ''} style="margin-top: 0.25rem;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem;">Öffentlich</div>
                                    <div style="font-size: 0.8rem; color: var(--color-text-muted);">Andere Nutzer können deinen Song sehen und ebenfalls importieren. Hilf mit, den globalen Pool zu vergrößern!</div>
                                </div>
                            </label>
                        </div>
                    </div>

                </div>
                <div class="songpool-import-meta">
                    ${renderMetaChip('BPM', draft.bpm)}
                    ${renderMetaChip('Tonart', draft.key)}
                    ${renderMetaChip('Time', draft.timeSignature)}
                    ${renderMetaChip('Sprache', draft.language)}
                </div>
            </article>
        `).join('');

        container.querySelectorAll('[data-draft-field]').forEach((field) => {
            const eventName = field.tagName === 'SELECT' ? 'change' : 'input';
            field.addEventListener(eventName, (event) => {
                const draftId = event.currentTarget.dataset.draftId;
                const draftField = event.currentTarget.dataset.draftField;
                const draft = this.songpoolImportDrafts.find(entry => entry.id === draftId);
                if (!draft || !draftField) return;

                draft[draftField] = draftField === 'visibility'
                    ? this.normalizeSongpoolVisibility(event.currentTarget.value)
                    : event.currentTarget.value;
            });
        });

        container.querySelectorAll('.songpool-import-remove').forEach((button) => {
            button.addEventListener('click', () => {
                this.songpoolImportDrafts = this.songpoolImportDrafts.filter(draft => draft.id !== button.dataset.draftId);
                this.renderSongpoolImportPreview();
            });
        });

        if (!confirmButton.dataset.bound) {
            confirmButton.dataset.bound = 'true';
            confirmButton.addEventListener('click', async () => {
                await this.saveSongpoolImportDrafts();
            });
        }
    },

    async saveSongpoolImportDrafts() {
        const drafts = (Array.isArray(this.songpoolImportDrafts) ? this.songpoolImportDrafts : [])
            .map((draft) => ({
                ...draft,
                title: this.cleanImportedSongTitle(draft.title, this.getSongpoolImportedFileBaseName(draft.file?.name || ''))
            }))
            .filter((draft) => draft.title);

        if (!drafts.length) {
            UI.showToast('Bitte mindestens einen Songtitel eintragen.', 'warning');
            return;
        }

        const draftsWithoutKey = drafts.filter((draft) => this.songpoolEntryRequiresKey(draft) && !String(draft.key || '').trim());
        if (draftsWithoutKey.length > 0) {
            UI.showToast(`Bitte trage für ${draftsWithoutKey.length} Song${draftsWithoutKey.length === 1 ? '' : 's'} eine Tonart ein.`, 'warning');
            const firstMissingKeyInput = document.getElementById(`songpoolDraftKey-${draftsWithoutKey[0].id}`);
            if (firstMissingKeyInput) {
                firstMissingKeyInput.focus();
            }
            return;
        }

        const user = Auth.getCurrentUser();
        if (!user) {
            UI.showToast('Du musst angemeldet sein, um Songs zu importieren.', 'error');
            return;
        }

        try {
            const result = await this.saveSongpoolDraftsWithDuplicateReview(drafts, {
                user,
                onBeforeDuplicateReview: async () => {
                    this.renderSongpoolImportPreview();
                }
            });

            this.removeSongpoolImportDraftsByIds([
                ...(Array.isArray(result.savedDraftIds) ? result.savedDraftIds : []),
                ...(Array.isArray(result.discardedDraftIds) ? result.discardedDraftIds : [])
            ]);

            if (result.successCount > 0) {
                await this.renderSongpoolView();
            }

            if (result.duplicateReviewCanceled) {
                this.songpoolImportDrafts = [];
                UI.closeModal('songpoolImportModal');
                await this.renderSongpoolView();
                if (result.successCount > 0) {
                    UI.showToast(`Import abgebrochen. ${result.successCount} eindeutige Song${result.successCount === 1 ? '' : 's'} wurden bereits gespeichert.`, 'warning');
                } else {
                    UI.showToast('Import abgebrochen.', 'info');
                }
                return;
            }

            this.renderSongpoolImportPreview();

            if ((Array.isArray(this.songpoolImportDrafts) ? this.songpoolImportDrafts : []).length === 0) {
                UI.closeModal('songpoolImportModal');
            }

            if (result.successCount > 0 && result.skippedDuplicateCount > 0) {
                UI.showToast(`${result.successCount} Song${result.successCount === 1 ? '' : 's'} gespeichert. ${result.skippedDuplicateCount} ähnliche${result.skippedDuplicateCount === 1 ? 'r Song wurde' : ' Songs wurden'} ausgelassen.`, 'warning');
            } else if (result.successCount > 0) {
                UI.showToast(`${result.successCount} Song${result.successCount === 1 ? '' : 's'} im Songpool gespeichert.`, 'success');
            } else if (result.skippedDuplicateCount > 0) {
                UI.showToast(`${result.skippedDuplicateCount} ähnliche${result.skippedDuplicateCount === 1 ? 'r Song wurde' : ' Songs wurden'} nicht übernommen.`, 'info');
            }

            if (result.errorCount > 0) {
                UI.showToast(`${result.errorCount} Import${result.errorCount === 1 ? '' : 'e'} konnten nicht gespeichert werden.`, result.successCount > 0 ? 'warning' : 'error');
            }
        } catch (error) {
            console.error('[Songpool] saveSongpoolImportDrafts failed:', error);
            UI.showToast(error.message || 'Songpool konnte nicht geprüft werden.', 'error');
            return;
        }

        if ((Array.isArray(this.songpoolImportDrafts) ? this.songpoolImportDrafts : []).length === 0) {
            await this.renderSongpoolView();
        }
    },

    // Song Management
    async openSongModal(eventId = null, bandId = null, songId = null) {
        document.getElementById('songId').value = songId || '';
        document.getElementById('songEventId').value = eventId || '';
        document.getElementById('songBandId').value = bandId || '';
        const modalContext = this.lastSongModalContext || null;
        const collection = modalContext?.collection || ((modalContext?.origin === 'songpool' || modalContext?.origin === 'songpoolEdit') ? 'songpool_songs' : 'songs');
        document.getElementById('songCollection').value = collection;
        const modalTitle = document.getElementById('songModalTitle');
        const modalSubtitle = document.querySelector('.song-editor-subtitle');
        const isDraftEventSongEdit = modalContext && modalContext.origin === 'draftEventSong';
        const isEventSongEdit = modalContext && modalContext.origin === 'eventSong';
        const isSongpoolSong = collection === 'songpool_songs';
        const visibilityGroup = document.getElementById('songVisibilityGroup');

        // Reset PDF input
        const pdfInput = document.getElementById('songPdf');
        if (pdfInput) pdfInput.value = '';
        this.setSongFileSelectionState(null, '');
        let existingSongpoolPdfUrl = null;
        let existingSongpoolChordPro = '';
        let existingDisplayFileName = '';
        this.songAutofillCandidates = [];
        if (this.songAutofillSearchTimer) {
            clearTimeout(this.songAutofillSearchTimer);
            this.songAutofillSearchTimer = null;
        }
        this.clearSongAutofillResults();

        if (visibilityGroup) {
            visibilityGroup.hidden = !isSongpoolSong;
        }

        if (!isSongpoolSong) {
            this.updateSongpoolKeyFieldRequirement(null);
        }

        if (songId) {
            // Edit existing song
            const storedSong = isSongpoolSong
                ? await Storage.getSongpoolSong(songId)
                : await Storage.getById('songs', songId);
            const song = isDraftEventSongEdit ? this.getDraftEventSong(storedSong) : storedSong;
            if (song) {
                if (modalTitle) {
                    modalTitle.textContent = isSongpoolSong
                        ? 'Songpool-Song bearbeiten'
                        : (isDraftEventSongEdit || isEventSongEdit)
                        ? 'Song in Setlist bearbeiten'
                        : 'Song bearbeiten';
                }
                if (modalSubtitle) {
                    modalSubtitle.textContent = isSongpoolSong
                        ? 'Pflege deinen persönlichen Songpool und lege fest, ob der Song öffentlich oder nur für dich sichtbar ist.'
                        : (isDraftEventSongEdit || isEventSongEdit)
                        ? 'Passe diesen Song nur für die Setlist des Auftritts an. Deine Haupt-Setlist der Band bleibt unverändert.'
                        : 'Pflege die wichtigsten Songdaten, Metainformationen und optional eine PDF- oder ChordPro-Datei in einer kompakten Arbeitsfläche.';
                }
                document.getElementById('songTitle').value = song.title;
                document.getElementById('songArtist').value = song.artist || '';
                document.getElementById('songGenre').value = song.genre || '';
                document.getElementById('songBPM').value = song.bpm || '';
                document.getElementById('songKey').value = song.key || '';
                document.getElementById('songOriginalKey').value = song.originalKey || '';
                document.getElementById('songTimeSignature').value = song.timeSignature || '';
                document.getElementById('songLanguage').value = song.language || '';
                this.songLanguageAutoValue = this.normalizeSongLanguageLabel(song.language || '');
                document.getElementById('songTracks').value = song.tracks || '';
                document.getElementById('songInfo').value = Storage.getSongPlainInfo(song);
                document.getElementById('songCcli').value = song.ccli || '';
                document.getElementById('songLeadVocal').value = song.leadVocal || '';
                const normalizedVisibility = this.normalizeSongpoolVisibility(song.visibility);
                const visRadio = document.querySelector(`input[name="songVisibility"][value="${normalizedVisibility}"]`);
                if (visRadio) visRadio.checked = true;

                // Show PDF info if exists
                if (song.pdf_url) {
                    // Extract filename from URL
                    const parts = song.pdf_url.split('/');
                    const filename = parts[parts.length - 1];
                    existingDisplayFileName = filename.replace(/^song-pdf-\d+-\d+-/, '');
                    this.setSongFileSelectionState(null, existingDisplayFileName);
                } else {
                    this.setSongFileSelectionState(null, '');
                }

                if (isSongpoolSong) {
                    existingSongpoolPdfUrl = song.pdf_url || null;
                    existingSongpoolChordPro = Storage.getSongChordPro(song) || '';
                    this.updateSongpoolKeyFieldRequirement({
                        sourceType: song.pdf_url ? 'pdf' : (Storage.getSongChordPro(song) ? 'chordpro' : ''),
                        pdf_url: song.pdf_url || null,
                        info: song.info || null
                    });
                }
            }
        } else {
            // New song
            if (modalTitle) {
                modalTitle.textContent = isSongpoolSong ? 'Songpool-Song hinzufügen' : 'Song hinzufügen';
            }
            if (modalSubtitle) {
                modalSubtitle.textContent = isSongpoolSong
                    ? 'Lege einen Song in deinem persönlichen Songpool an. Neue Songpool-Songs brauchen immer eine PDF oder ChordPro-Datei.'
                    : 'Pflege die wichtigsten Songdaten, Metainformationen und optional eine PDF- oder ChordPro-Datei in einer kompakten Arbeitsfläche.';
            }
            document.getElementById('songTitle').value = '';
            document.getElementById('songArtist').value = '';
            document.getElementById('songGenre').value = '';
            document.getElementById('songBPM').value = '';
            document.getElementById('songKey').value = '';
            document.getElementById('songOriginalKey').value = '';
            document.getElementById('songTimeSignature').value = '';
            document.getElementById('songLanguage').value = '';
            this.songLanguageAutoValue = '';
            document.getElementById('songTracks').value = '';
            document.getElementById('songInfo').value = '';
            document.getElementById('songCcli').value = '';
            document.getElementById('songLeadVocal').value = '';
            const defaultVis = this.normalizeSongpoolVisibility(modalContext?.defaultVisibility || 'public');
            const visDefaultRadio = document.querySelector(`input[name="songVisibility"][value="${defaultVis}"]`);
            if (visDefaultRadio) visDefaultRadio.checked = true;
            this.setSongFileSelectionState(null, '');

            if (isSongpoolSong) {
                this.updateSongpoolKeyFieldRequirement(null);
            }
        }

        UI.openModal('songModal');
        this.syncInferredSongLanguage();

        if (pdfInput) {
            pdfInput.onchange = async () => {
                const nextFile = pdfInput.files && pdfInput.files[0] ? pdfInput.files[0] : null;
                this.setSongFileSelectionState(nextFile, nextFile ? nextFile.name : existingDisplayFileName);

                if (nextFile) {
                    try {
                        await this.applyImportedSongMetadataToForm(nextFile);
                    } catch (error) {
                        console.warn('[Song] Metadata prefill failed:', error);
                    }
                }

                if (isSongpoolSong) {
                    this.updateSongpoolKeyFieldRequirement({
                        file: nextFile,
                        pdf_url: nextFile
                            ? (this.isChordProLikeFileName(nextFile.name || '') ? existingSongpoolPdfUrl : null)
                            : existingSongpoolPdfUrl,
                        info: nextFile
                            ? (this.isChordProLikeFileName(nextFile.name || '') ? document.getElementById('songInfo')?.value || existingSongpoolChordPro : '')
                            : existingSongpoolChordPro
                    });
                }
            };
        }

        // Wire up PDF delete button (ensure it's only added once or remove old listener)
        const deletePdfBtn = document.getElementById('deleteSongPdfBtn');
        if (deletePdfBtn) {
            deletePdfBtn.hidden = !String(songId || '').trim();
            deletePdfBtn.onclick = () => this.handleDeleteSongPdf();
        }
    },

    scheduleSongAutofillSearch() {
        const titleInput = document.getElementById('songTitle');
        if (!titleInput) return;

        const query = String(titleInput.value || '').trim();
        if (this.songAutofillSearchTimer) {
            clearTimeout(this.songAutofillSearchTimer);
        }

        if (query.length < 2) {
            this.songAutofillCandidates = [];
            this.clearSongAutofillResults();
            return;
        }

        this.songAutofillSearchTimer = setTimeout(() => {
            this.handleSongAutofillSearch({ silent: true });
        }, 260);
    },

    normalizeSongLanguageLabel(value = '') {
        const raw = String(value || '').trim();
        if (!raw) return '';

        const normalized = raw.toLowerCase();
        const map = {
            de: 'Deutsch',
            deu: 'Deutsch',
            ger: 'Deutsch',
            german: 'Deutsch',
            deutsch: 'Deutsch',
            en: 'Englisch',
            eng: 'Englisch',
            english: 'Englisch',
            englisch: 'Englisch'
        };

        return map[normalized] || raw;
    },

    inferSongLanguageFromTitle(title = '', fallbackLanguage = '') {
        const normalizedFallback = this.normalizeSongLanguageLabel(fallbackLanguage);
        if (normalizedFallback) return normalizedFallback;

        const rawTitle = String(title || '').trim();
        if (!rawTitle) return '';

        const lowered = rawTitle.toLowerCase();
        if (/[äöüß]/i.test(rawTitle)) {
            return 'Deutsch';
        }

        const tokens = lowered
            .replace(/[^a-z0-9\s']/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

        if (tokens.length === 0) return '';

        const germanTokens = new Set([
            'der', 'die', 'das', 'und', 'ich', 'du', 'wir', 'ihr', 'nicht', 'für', 'mit', 'auf', 'bei', 'von',
            'dem', 'den', 'des', 'ein', 'eine', 'einer', 'einem', 'mein', 'meine', 'dein', 'deine', 'sein',
            'uns', 'euch', 'herr', 'gott', 'über', 'koenig', 'könig', 'heilig', 'leben', 'liebe', 'treu',
            'wunder', 'immer', 'heute', 'morgen', 'himmel', 'erde', 'dich', 'mich', 'unsere', 'unser', 'deiner',
            'gegenübersteh', 'gehört', 'alles'
        ]);

        const englishTokens = new Set([
            'the', 'and', 'you', 'your', 'my', 'love', 'of', 'to', 'for', 'in', 'on', 'with', 'holy', 'king',
            'lord', 'who', 'where', 'here', 'this', 'that', 'treasure', 'nothing', 'else', 'countdown',
            'again', 'heaven', 'touch', 'open', 'awake', 'battle', 'coming', 'clouds', 'lion', 'lamb',
            'worship', 'grace', 'hope', 'glory', 'praise', 'victory', 'how', 'great', 'name', 'high'
        ]);

        let germanScore = 0;
        let englishScore = 0;

        tokens.forEach((token) => {
            const comparableToken = token.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü');
            if (germanTokens.has(token) || germanTokens.has(comparableToken)) germanScore += 1;
            if (englishTokens.has(token)) englishScore += 1;
        });

        if (germanScore === 0 && englishScore === 0) {
            return '';
        }

        if (germanScore > englishScore) return 'Deutsch';
        if (englishScore > germanScore) return 'Englisch';
        return '';
    },

    getDetectedSongLanguage(title = '', explicitLanguage = '') {
        return this.inferSongLanguageFromTitle(title, explicitLanguage);
    },

    syncInferredSongLanguage(options = {}) {
        const titleInput = document.getElementById('songTitle');
        const languageInput = document.getElementById('songLanguage');
        if (!titleInput || !languageInput) return;

        const currentValue = String(languageInput.value || '').trim();
        const previousAutoValue = String(this.songLanguageAutoValue || '').trim();
        const inferredLanguage = this.inferSongLanguageFromTitle(titleInput.value, '');
        const canOverwrite = options.force === true || !currentValue || (previousAutoValue && currentValue === previousAutoValue);

        if (!inferredLanguage) {
            if (previousAutoValue && currentValue === previousAutoValue) {
                languageInput.value = '';
            }
            this.songLanguageAutoValue = '';
            return;
        }

        if (canOverwrite) {
            languageInput.value = inferredLanguage;
            this.songLanguageAutoValue = inferredLanguage;
        }
    },

    clearSongAutofillResults() {
        const results = document.getElementById('songAutofillResults');
        if (!results) return;
        results.hidden = true;
        results.innerHTML = '';
    },

    async handleSongAutofillSearch(options = {}) {
        const titleInput = document.getElementById('songTitle');
        const results = document.getElementById('songAutofillResults');
        const bandId = document.getElementById('songBandId')?.value || null;
        const query = String(titleInput?.value || '').trim();
        const silent = options.silent === true;

        if (this.songAutofillSearchTimer) {
            clearTimeout(this.songAutofillSearchTimer);
            this.songAutofillSearchTimer = null;
        }

        if (!titleInput || !results) return;
        if (query.length < 2) {
            if (!silent) {
                UI.showToast('Bitte gib mindestens 2 Zeichen für den Titel ein.', 'info');
            }
            this.songAutofillCandidates = [];
            this.clearSongAutofillResults();
            return;
        }

        results.hidden = false;
        results.innerHTML = `
            <div class="song-autofill-dropdown-state">
                Suche in Bandmate und externen Song-Katalogen...
            </div>
        `;

        try {
            const candidates = await Storage.searchSongAutofillCandidates(query, bandId || null);
            this.songAutofillCandidates = candidates;

            if (!candidates.length) {
                results.innerHTML = `
                    <div class="song-autofill-dropdown-state">
                        Keine Treffer gefunden. Versuche einen anderen Titel.
                    </div>
                `;
                return;
            }

            const renderChip = (label, value) => value
                ? `<span class="song-autofill-chip">${this.escapeHtml(label)}: ${this.escapeHtml(String(value))}</span>`
                : '';
            const renderSubtitle = (song) => {
                const parts = [];
                if (song.artist) parts.push(this.escapeHtml(song.artist));
                if (song.sourceLabel) parts.push(this.escapeHtml(song.sourceLabel));
                return parts.join(' • ') || 'Unbekannter Treffer';
            };

            results.innerHTML = `
                <div class="song-autofill-list" role="listbox" aria-label="Song-Vorschläge">
                    ${candidates.map((song, index) => `
                        ${(() => {
                            const detectedLanguage = this.getDetectedSongLanguage(song.title, song.language);
                            return `
                        <button type="button" class="song-autofill-option" data-song-autofill-index="${index}">
                            <span class="song-autofill-option-copy">
                                <span class="song-autofill-option-title">${this.escapeHtml(song.title || 'Ohne Titel')}</span>
                                <span class="song-autofill-option-subtitle">${renderSubtitle(song)}</span>
                                <span class="song-autofill-option-meta">
                                    ${renderChip('Quelle', song.sourceLabel && song.source !== 'bandmate' ? song.sourceLabel : '')}
                                    ${renderChip('BPM', song.bpm)}
                                    ${renderChip('Tonart', song.key)}
                                    ${renderChip('Orig.', song.originalKey)}
                                    ${renderChip('Time', song.timeSignature)}
                                    ${renderChip('Sprache', detectedLanguage)}
                                </span>
                            </span>
                        </button>
                    `;
                        })()}
                    `).join('')}
                </div>
            `;
        } catch (error) {
            results.innerHTML = `
                <div class="song-autofill-dropdown-state">
                    ${this.escapeHtml(error.message || 'Die Vorschläge konnten gerade nicht geladen werden.')}
                </div>
            `;
            if (!silent) {
                UI.showToast(error.message || 'Song-Vorschläge konnten nicht geladen werden.', 'error');
            }
        }
    },

    applySongAutofillCandidate(index) {
        const candidates = Array.isArray(this.songAutofillCandidates) ? this.songAutofillCandidates : [];
        const candidate = candidates[Number(index)];
        if (!candidate) {
            UI.showToast('Song-Vorschlag konnte nicht übernommen werden.', 'error');
            return;
        }

        const setValue = (id, value) => {
            const input = document.getElementById(id);
            if (!input || value == null || value === '') return;
            input.value = (id === 'songKey' || id === 'songOriginalKey')
                ? this.normalizeSongKeySelectValue(value)
                : value;
        };

        setValue('songTitle', candidate.title);
        setValue('songArtist', candidate.artist);
        setValue('songBPM', candidate.bpm);
        setValue('songKey', candidate.key);
        setValue('songOriginalKey', candidate.originalKey);
        setValue('songTimeSignature', candidate.timeSignature);
        setValue('songLeadVocal', candidate.leadVocal);
        const detectedLanguage = this.getDetectedSongLanguage(candidate.title, candidate.language);
        setValue('songLanguage', detectedLanguage);
        this.songLanguageAutoValue = detectedLanguage || '';

        this.clearSongAutofillResults();
        UI.showToast('Songdaten wurden vorausgefüllt.', 'success');
    },

    async handleSaveSong() {
        const songId = document.getElementById('songId').value;
        const eventId = document.getElementById('songEventId').value;
        const bandId = document.getElementById('songBandId').value;
        const collection = document.getElementById('songCollection')?.value || 'songs';
        const modalContext = this.lastSongModalContext || null;
        const isDraftEventSongEdit = modalContext && modalContext.origin === 'draftEventSong';
        const isEventSongEdit = modalContext && modalContext.origin === 'eventSong';
        const isEventSongBlockCreate = modalContext && ['createEventSongBlock', 'eventSongBlock'].includes(modalContext.origin);
        const isSongpoolSong = collection === 'songpool_songs';
        const title = document.getElementById('songTitle').value;
        const artist = document.getElementById('songArtist').value;
        const genre = document.getElementById('songGenre').value;
        const bpm = document.getElementById('songBPM').value;
        const key = document.getElementById('songKey').value;
        const originalKey = document.getElementById('songOriginalKey').value;
        const timeSignature = document.getElementById('songTimeSignature').value;
        const languageInputValue = document.getElementById('songLanguage').value;
        const language = this.getDetectedSongLanguage(title, languageInputValue);
        const tracks = document.getElementById('songTracks').value;
        const plainInfo = document.getElementById('songInfo').value;
        const ccli = document.getElementById('songCcli').value;
        const leadVocal = document.getElementById('songLeadVocal').value;
        const visibility = this.normalizeSongpoolVisibility(document.querySelector('input[name="songVisibility"]:checked')?.value || 'public');
        const user = Auth.getCurrentUser();

        const pdfFileInput = document.getElementById('songPdf');
        let pdfUrl = null;

        try {
            if (!user) {
                throw new Error('Du musst angemeldet sein, um Songs zu speichern.');
            }

            // If editing, get existing song to preserve/delete PDF
            let existingSong = null;
            if (songId) {
                existingSong = isSongpoolSong
                    ? await Storage.getSongpoolSong(songId)
                    : await Storage.getById('songs', songId);
                if (existingSong) pdfUrl = existingSong.pdf_url;
            }

            const currentSongState = isDraftEventSongEdit ? this.getDraftEventSong(existingSong) : existingSong;
            const previousCurrentPdfUrl = currentSongState?.pdf_url || null;
            if (isDraftEventSongEdit && currentSongState) {
                pdfUrl = currentSongState.pdf_url || null;
            }

            const existingChordPro = currentSongState ? Storage.getSongChordPro(currentSongState) : '';
            let uploadedChordProText = existingChordPro;
            const selectedSongFile = pdfFileInput && pdfFileInput.files.length > 0 ? pdfFileInput.files[0] : null;
            const isPdfUpload = Boolean(
                selectedSongFile
                && (
                    selectedSongFile.type === 'application/pdf'
                    || String(selectedSongFile.name || '').toLowerCase().endsWith('.pdf')
                )
            );
            const isChordProUpload = this.isChordProLikeFileName(selectedSongFile?.name || '');

            if (selectedSongFile && !isPdfUpload && !isChordProUpload) {
                UI.showToast('Bitte wähle eine PDF- oder ChordPro-Datei aus.', 'error');
                return;
            }

            if (isSongpoolSong && !songId) {
                const manualEntryRequiresKey = this.songpoolEntryRequiresKey({
                    sourceType: isChordProUpload ? 'chordpro' : (isPdfUpload ? 'pdf' : ''),
                    file: selectedSongFile,
                    pdf_url: pdfUrl,
                    info: existingChordPro
                });

                if (manualEntryRequiresKey && !String(key || '').trim()) {
                    UI.showToast('Bitte wähle für den Songpool eine Tonart aus.', 'warning');
                    document.getElementById('songKey')?.focus();
                    return;
                }

                if (!this.songpoolEntryHasDocument({ file: selectedSongFile, pdf_url: pdfUrl, info: existingChordPro })) {
                    UI.showToast('Im Songpool braucht jeder Song eine PDF oder eine ChordPro-Datei.', 'error');
                    return;
                }

                if (visibility === 'public') {
                    const confirmedPublicSave = await UI.confirmAction(
                        'Öffentlich bedeutet, dass alle Nutzer von Bandmate diesen Song in ihrem Songpool einblenden können. Nur du kannst deinen eigenen Song weiterhin bearbeiten oder löschen.',
                        'Öffentlichen Song speichern?',
                        'OK, speichern',
                        'btn-primary',
                        {
                            kicker: 'Sichtbarkeit',
                            cancelText: 'Abbrechen'
                        }
                    );

                    if (!confirmedPublicSave) {
                        return;
                    }
                }

                let manualSongInfo = Storage.composeSongInfoWithChordPro(plainInfo, existingChordPro);

                if (selectedSongFile && isChordProUpload) {
                    const chordProText = await selectedSongFile.text();
                    manualSongInfo = Storage.composeSongInfoWithChordPro(plainInfo, chordProText);
                }

                const result = await this.saveSongpoolDraftsWithDuplicateReview([
                    {
                        id: `songpool-manual-${Date.now()}`,
                        sourceType: isChordProUpload ? 'chordpro' : 'pdf',
                        sourceLabel: 'Song hinzufügen',
                        file: selectedSongFile,
                        title,
                        artist: artist || '',
                        genre: genre || null,
                        bpm: bpm || null,
                        key: key || null,
                        originalKey: originalKey || null,
                        timeSignature: timeSignature || null,
                        language: language || null,
                        tracks: tracks || null,
                        info: manualSongInfo,
                        ccli: ccli || null,
                        leadVocal: leadVocal || null,
                        visibility
                    }
                ], { user });

                if (result.successCount > 0) {
                    UI.showToast(
                        result.skippedDuplicateCount > 0
                            ? `Song hinzugefügt. ${result.skippedDuplicateCount} ähnlicher Treffer wurde ausgelassen.`
                            : 'Songpool-Song hinzugefügt',
                        result.skippedDuplicateCount > 0 ? 'warning' : 'success'
                    );
                    UI.closeModal('songModal');
                    this.lastSongModalContext = null;
                    await this.renderSongpoolView();
                    return;
                }

                if (result.duplicateReviewCanceled) {
                    UI.closeModal('songModal');
                    this.lastSongModalContext = null;
                    await this.renderSongpoolView();
                    UI.showToast('Import abgebrochen.', 'info');
                    return;
                }

                if (result.skippedDuplicateCount > 0) {
                    UI.showToast('Song wurde nicht gespeichert.', 'info');
                    return;
                }

                if (result.errorCount > 0) {
                    throw new Error('Fehler beim Speichern des Songs.');
                }
            }

            if (isSongpoolSong && songId && this.songpoolEntryRequiresKey({
                sourceType: isChordProUpload ? 'chordpro' : (isPdfUpload ? 'pdf' : ''),
                file: selectedSongFile,
                pdf_url: pdfUrl,
                info: existingChordPro
            }) && !String(key || '').trim()) {
                UI.showToast('Bitte wähle für den Songpool eine Tonart aus.', 'warning');
                document.getElementById('songKey')?.focus();
                return;
            }

            // Handle File Upload
            if (pdfFileInput && pdfFileInput.files.length > 0) {
                const file = pdfFileInput.files[0];

                if (isChordProUpload) {
                    uploadedChordProText = await file.text();
                } else {
                    UI.showLoading('PDF wird hochgeladen...');
                    const sb = SupabaseClient.getClient();

                    const fileExt = 'pdf';
                    const fileName = `song-pdf-${Date.now()}.${fileExt}`;

                    const { error: uploadError } = await sb.storage
                        .from('song-pdfs')
                        .upload(fileName, file, {
                            upsert: true,
                            cacheControl: '3600',
                            contentType: file.type || 'application/pdf'
                        });

                    if (uploadError) {
                        UI.hideLoading();
                        UI.showToast('Fehler beim PDF-Upload: ' + uploadError.message, 'error');
                        return;
                    }

                    const { data: { publicUrl } } = sb.storage
                        .from('song-pdfs')
                        .getPublicUrl(fileName);

                    pdfUrl = publicUrl;
                }
            }

            const songData = {
                title,
                artist: artist || null,
                genre: genre || null,
                bpm: bpm ? parseInt(bpm, 10) : null,
                key: key || null,
                originalKey: originalKey || null,
                timeSignature: timeSignature || null,
                language: language || null,
                tracks: tracks || null,
                info: Storage.composeSongInfoWithChordPro(plainInfo, uploadedChordProText),
                ccli: ccli || null,
                leadVocal: leadVocal || null,
                pdf_url: pdfUrl,
                createdBy: existingSong?.createdBy || user.id
            };
            if (isSongpoolSong) {
                songData.visibility = visibility;
            }

            if (pdfFileInput && pdfFileInput.files.length > 0 && isPdfUpload) {
                UI.hideLoading(); // Hide after successful upload
            }

            if (isDraftEventSongEdit && songId) {
                this.draftEventSongOverrides[songId] = {
                    ...(this.draftEventSongOverrides[songId] || {}),
                    ...this.getDraftEventSongOverridePayload(songData)
                };
                if (previousCurrentPdfUrl && previousCurrentPdfUrl !== pdfUrl && previousCurrentPdfUrl !== existingSong?.pdf_url) {
                    await Storage.cleanupSongPdfStorage(previousCurrentPdfUrl);
                }
                UI.showToast('Song nur für diesen Auftritt aktualisiert', 'success');
                UI.closeModal('songModal');
                this.lastSongModalContext = null;
                await this.renderDraftEventSongs();
                return;
            }

            // Only set one of eventId or bandId, not both
            if (!isSongpoolSong && eventId) {
                songData.eventId = eventId;
            } else if (!isSongpoolSong && bandId) {
                songData.bandId = bandId;
            }

            if (songId) {
                if (isSongpoolSong) {
                    await Storage.updateSongpoolSong(songId, songData);
                    UI.showToast('Songpool-Song aktualisiert', 'success');
                } else {
                    // Update existing song
                    await Storage.updateSong(songId, songData);
                    UI.showToast(isEventSongEdit ? 'Song nur für diesen Auftritt aktualisiert' : 'Song aktualisiert', 'success');
                }
            } else {
                const created = isSongpoolSong
                    ? await Storage.createSongpoolSong(songData)
                    : await Storage.createSong(songData);

                // If song was created for an event, also add to band's general setlist
                if (!isSongpoolSong && created.eventId) {
                    const event = await Storage.getEvent(created.eventId);
                    if (event && event.bandId) {
                        // Create a band version of the song (without eventId)
                        await Storage.createSong({
                            title: created.title,
                            artist: created.artist,
                            bpm: created.bpm,
                            key: created.key,
                            originalKey: created.originalKey,
                            timeSignature: created.timeSignature,
                            language: created.language,
                            tracks: created.tracks,
                            info: created.info,
                            ccli: created.ccli,
                            leadVocal: created.leadVocal,
                            pdf_url: created.pdf_url,
                            bandId: event.bandId,
                            createdBy: user.id
                        });
                        UI.showToast('Song zu Auftritt und Band-Setlist hinzugefügt', 'success');

                        // Update both event songs and band songs lists
                        await this.renderEventSongs(created.eventId);
                        await this.renderBandSongs(event.bandId);
                    } else {
                        UI.showToast('Song hinzugefügt', 'success');
                    }
                } else {
                    UI.showToast(isSongpoolSong ? 'Songpool-Song hinzugefügt' : 'Song hinzugefügt', 'success');
                    if (isSongpoolSong) {
                        await this.renderSongpoolView();
                    } else if (bandId) {
                        // Nach dem Hinzufügen eines Songs zur Band-Setlist sofort neu rendern
                        await this.renderBandSongs(bandId);
                    }
                }

                // If this song was created from the create-event modal, add to draft list
                if (!isSongpoolSong && isEventSongBlockCreate && modalContext?.rundownItemId) {
                    await this.addSongsToDraftEventSongBlock(modalContext.rundownItemId, [created.id]);
                    this.draftEventSongBlockTargetId = null;
                } else if (!isSongpoolSong && modalContext && modalContext.origin === 'createEvent') {
                    if (!this.draftEventSongIds.includes(created.id)) {
                        this.draftEventSongIds.push(created.id);
                    }
                    this.renderDraftEventSongs();
                }
            }

            UI.closeModal('songModal');
            // reset last song modal context
            this.lastSongModalContext = null;

            // Refresh the appropriate list (if not already refreshed above)
            if (songId) {
                // For updates, refresh the current list
                if (isSongpoolSong) {
                    await this.renderSongpoolView();
                } else if (eventId) {
                    await this.renderEventSongs(eventId);
                } else if (bandId) {
                    await this.renderBandSongs(bandId);
                }

                // Also refresh draft list if applicable
                if (modalContext && modalContext.origin === 'createEvent') {
                    this.renderDraftEventSongs();
                }
            }
        } catch (error) {
            console.error('[App] handleSaveSong failed:', error);
            UI.showToast(error.message || 'Fehler beim Speichern des Songs.', 'error');
        }
    },

    openPdfPreview(url, title) {
        const modal = document.getElementById('pdfPreviewModal');
        const frame = document.getElementById('pdfPreviewFrame');
        const titleEl = document.getElementById('pdfPreviewTitle');
        const downloadBtn = document.getElementById('pdfPreviewDownload');

        if (!modal || !frame) return;

        const baseTitle = String(title || '').trim();
        const previewTitle = baseTitle
            ? (/pdf/i.test(baseTitle) ? baseTitle : `${baseTitle} - PDF`)
            : 'PDF Vorschau';

        titleEl.textContent = previewTitle;
        frame.src = url;

        if (downloadBtn) {
            downloadBtn.href = url;
            downloadBtn.setAttribute('download', (baseTitle || 'song').replace(/[/\\?%*:|"<>]/g, '-') + '.pdf');
        }

        UI.openModal('pdfPreviewModal');
    },

    openChordProPreview(chordProText, title) {
        const modal = document.getElementById('chordproPreviewModal');
        const previewArea = document.getElementById('chordproSongPreviewArea');
        const titleEl = document.getElementById('chordproPreviewTitle');
        const downloadBtn = document.getElementById('chordproPreviewDownload');
        const cleanText = typeof chordProText === 'string' ? chordProText.trim() : '';

        if (!modal || !previewArea) return;

        if (!cleanText) {
            UI.showToast('Für diesen Song ist keine ChordPro-Datei hinterlegt.', 'info');
            return;
        }

        this.cleanupChordProPreview();

        if (titleEl) {
            titleEl.textContent = title ? `${title} · ChordPro` : 'ChordPro Vorschau';
        }

        if (typeof ChordProConverter !== 'undefined' && typeof ChordProConverter.buildPreviewMarkup === 'function') {
            previewArea.innerHTML = ChordProConverter.buildPreviewMarkup(cleanText, {
                placeholderMessage: 'Für diesen Song ist keine ChordPro-Vorschau vorhanden.'
            });
        } else {
            previewArea.innerHTML = `
                <pre class="song-chordpro-preview-fallback">${this.escapeHtml(cleanText)}</pre>
            `;
        }

        if (downloadBtn) {
            const fileName = (title || 'song')
                .replace(/[/\\?%*:|"<>]/g, '-')
                .replace(/\s+/g, ' ')
                .trim() || 'song';
            const blob = new Blob([cleanText], { type: 'text/plain;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            this.currentChordProPreviewBlobUrl = blobUrl;
            downloadBtn.href = blobUrl;
            downloadBtn.setAttribute('download', `${fileName}.cho`);
        }

        UI.openModal('chordproPreviewModal');
    },

    async handleDeleteSongPdf() {
        const songId = document.getElementById('songId').value;
        const collection = document.getElementById('songCollection')?.value || 'songs';
        if (!songId) return;

        const confirm = await UI.confirmDelete('Möchtest du das PDF wirklich entfernen?');
        if (!confirm) return;

        try {
            const modalContext = this.lastSongModalContext || null;
            const isDraftEventSongEdit = modalContext && modalContext.origin === 'draftEventSong';
            const isSongpoolSong = collection === 'songpool_songs';
            const song = isSongpoolSong
                ? await Storage.getSongpoolSong(songId)
                : await Storage.getById('songs', songId);
            const currentSong = isDraftEventSongEdit ? this.getDraftEventSong(song) : song;

            if (currentSong && currentSong.pdf_url) {
                const currentPdfContainer = document.getElementById('songCurrentPdf');
                if (currentPdfContainer) currentPdfContainer.style.display = 'none';
                const pdfInput = document.getElementById('songPdf');
                if (pdfInput) pdfInput.value = '';

                if (isDraftEventSongEdit) {
                    this.draftEventSongOverrides[songId] = {
                        ...(this.draftEventSongOverrides[songId] || {}),
                        pdf_url: null
                    };
                    if (!song || currentSong.pdf_url !== song.pdf_url) {
                        await Storage.cleanupSongPdfStorage(currentSong.pdf_url);
                    }
                    UI.showToast('PDF für diesen Auftritt entfernt', 'success');
                    await this.renderDraftEventSongs();
                    return;
                }

                if (isSongpoolSong) {
                    await Storage.updateSongpoolSong(songId, { pdf_url: null });
                    UI.showToast('PDF aus dem Songpool entfernt', 'success');
                    await this.renderSongpoolView();
                    return;
                }

                await Storage.updateSong(songId, { pdf_url: null });
                UI.showToast('PDF entfernt', 'success');

                // Refresh list
                if (song.eventId) await this.renderEventSongs(song.eventId);
                if (song.bandId) await this.renderBandSongs(song.bandId);
            }
        } catch (err) {
            console.error('Error deleting song PDF:', err);
            UI.showToast('Fehler beim Löschen des PDFs', 'error');
        }
    },

    async renderEventSongs(eventId) {
        const container = document.getElementById('eventSongsList');
        if (!container) {
            await this.renderEventRundownEditor();
            return;
        }

        const songs = await Storage.getEventSongs(eventId);
        Logger.time(`Render Event Songs ${eventId}`);

        // Get band ID from event to show band songs
        const event = await Storage.getById('events', eventId);
        const bandSongs = event && event.bandId ? await Storage.getBandSongs(event.bandId) : [];

        // Toggle static copy button visibility
        const staticCopyBtn = document.getElementById('copyBandSongsBtn');
        if (staticCopyBtn) {
            staticCopyBtn.style.display = (Array.isArray(bandSongs) && bandSongs.length > 0) ? 'inline-flex' : 'none';
        }

        if ((!Array.isArray(songs) || songs.length === 0) && (!Array.isArray(bandSongs) || bandSongs.length === 0)) {
            container.innerHTML = '<div class="event-setlist-empty">Noch keine Songs hinzugefügt.</div>';
            await this.renderEventRundownEditor();
            return;
        }

        let html = '';

        if (Array.isArray(songs) && songs.length > 0) {

            html += `
                <div class="event-setlist-workspace">
                <div id="eventSongsBulkActions" class="event-setlist-bulkbar">
                    <div class="event-setlist-bulkinfo">
                        <span class="event-setlist-bulk-label">Ausgewählt</span>
                        <strong id="eventSongsSelectedCount">0</strong>
                    </div>
                    <div class="event-setlist-bulkactions">
                        <button id="eventSongsBulkDelete" class="btn btn-danger btn-sm">Auswahl löschen</button>
                        <button id="eventSongsBulkPDF" class="btn btn-secondary btn-sm">Auswahl als PDF exportieren</button>
                    </div>
                </div>
                <div class="event-setlist-table-wrap">
                <table class="songs-table band-setlist-table event-setlist-table">
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 40px;">Pos.</th>
                            <th style="text-align: center; width: 40px;">
                                <input type="checkbox" id="selectAllEventSongs">
                            </th>
                            <th style="text-align: center; width: 108px;">Aktionen</th>
                            <th>Titel</th>
                            <th>Interpret</th>
                            <th>BPM</th>
                            <th>Time</th>
                            <th>Tonart</th>
                            <th>Orig.</th>
                            <th>Lead</th>
                            <th>Sprache</th>
                            <th>Tracks</th>
                            <th style="text-align: center;">Dateien</th>
                            <th>Infos</th>
                            <th>CCLI</th>
                        </tr>
                    </thead>
                    <tbody id="eventSongsTableBody">
                        ${songs.map((song, idx) => `
                            <tr draggable="true" data-song-id="${song.id}">
                                <td class="drag-handle" data-label="Pos.">☰</td>
                                <td style="text-align: center;" data-label="Auswählen">
                                    <input type="checkbox" class="event-song-checkbox-row" value="${song.id}">
                                </td>
                                <td class="band-setlist-actions-cell event-setlist-actions-cell" style="text-align: center;" data-label="Aktionen">
                                    <div class="event-setlist-actions">
                                        <button type="button" class="btn-icon edit-song" data-id="${song.id}" title="In Setlist bearbeiten" aria-label="Song in Setlist bearbeiten">${this.getRundownInlineIcon('edit')}</button>
                                        <button type="button" class="btn-icon delete-song" data-id="${song.id}" title="Löschen" aria-label="Song aus der Setlist löschen">${this.getRundownInlineIcon('trash')}</button>
                                    </div>
                                </td>
                                <td class="event-setlist-title-cell" data-label="Titel">${this.escapeHtml(song.title)}</td>
                                <td data-label="Interpret">${this.escapeHtml(song.artist || '-')}</td>
                                <td data-label="BPM">${song.bpm || '-'}</td>
                                <td data-label="Time">${song.timeSignature || '-'}</td>
                                <td class="event-setlist-key-cell" data-label="Tonart">${song.key || '-'}</td>
                                <td data-label="Orig.">${song.originalKey || '-'}</td>
                                <td data-label="Lead">${song.leadVocal || '-'}</td>
                                <td data-label="Sprache">${song.language || '-'}</td>
                                <td data-label="Tracks">${song.tracks === 'yes' ? 'Ja' : (song.tracks === 'no' ? 'Nein' : '-')}</td>
                                <td style="text-align: center;" data-label="Dateien">
                                    ${this.renderSongDocumentPreviewButtons(song)}
                                </td>
                                <td data-label="Infos">${this.escapeHtml(this.getSongInfoDisplay(song))}</td>
                                <td style="font-family: monospace;" data-label="CCLI">${song.ccli || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
                </div>
            `;
        }

        container.innerHTML = html;
        this.attachSongDocumentPreviewHandlers(container, new Map((songs || []).map((song) => [String(song.id), song])));
        await this.renderEventRundownEditor();

        // Store event songs for quick access
        this.currentEventSongs = songs || [];
        const eventInfo = await Storage.getById('events', eventId); // Fetch again or store content
        const eventName = eventInfo ? eventInfo.title : 'Event Setlist';


        // --- Event Listeners for Bulk Actions and Checkboxes ---

        const checkboxRows = container.querySelectorAll('.event-song-checkbox-row');
        const selectAll = document.getElementById('selectAllEventSongs');
        const bulkActionsBar = document.getElementById('eventSongsBulkActions');
        const selectedCountSpan = document.getElementById('eventSongsSelectedCount');
        const bulkDeleteBtn = document.getElementById('eventSongsBulkDelete');
        const bulkPDFBtn = document.getElementById('eventSongsBulkPDF');

        const updateBulkActions = () => {
            const checkedCount = container.querySelectorAll('.event-song-checkbox-row:checked').length;
            selectedCountSpan.textContent = checkedCount;
            bulkActionsBar.style.display = checkedCount > 0 ? 'flex' : 'none';
        };

        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                checkboxRows.forEach(cb => cb.checked = e.target.checked);
                updateBulkActions();
            });
        }

        checkboxRows.forEach(cb => {
            cb.addEventListener('change', updateBulkActions);
        });

        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', async () => {
                const selectedIds = Array.from(container.querySelectorAll('.event-song-checkbox-row:checked')).map(cb => cb.value);
                if (selectedIds.length === 0) return;

                if (await UI.confirmDelete(`${selectedIds.length} Songs wirklich aus dem Event löschen?`)) {
                    // Collect song objects to allow potential undo if needed (complex, skipping undo for now)
                    for (const id of selectedIds) {
                        await Storage.deleteSong(id);
                    }
                    UI.showToast(`${selectedIds.length} Songs entfernt`, 'success');
                    this.renderEventSongs(eventId);
                }
            });
        }

        if (bulkPDFBtn) {
            bulkPDFBtn.addEventListener('click', () => {
                const selectedIds = Array.from(container.querySelectorAll('.event-song-checkbox-row:checked')).map(cb => cb.value);
                const selectedSongs = this.currentEventSongs.filter(s => selectedIds.includes(s.id));
                this.downloadSongListPDF(selectedSongs, eventName, 'Ausgewählte Songs', true);
            });
        }
        // ----------------------------------------------------


        // Add event listeners for edit/delete
        const attachEventSongListeners = () => {
            container.querySelectorAll('.edit-song').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    this.lastSongModalContext = {
                        origin: 'eventSong',
                        eventId,
                        songId: btn.dataset.id
                    };
                    this.openSongModal(eventId, null, btn.dataset.id);
                });
            });

            container.querySelectorAll('.delete-song').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    if (await UI.confirmDelete('Song wirklich aus dem Event entfernen?')) {
                        await Storage.deleteSong(btn.dataset.id);
                        UI.showToast('Song entfernt', 'success');
                        this.renderEventSongs(eventId);
                    }
                });
            });
        };

        attachEventSongListeners();

        // --- Drag and Drop Logic ---
        const tbody = document.getElementById('eventSongsTableBody');
        let dragSrcEl = null;

        if (tbody) {
            const rows = tbody.querySelectorAll('tr[draggable="true"]');

            const handleDragStart = (e) => {
                dragSrcEl = e.currentTarget;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', e.currentTarget.dataset.songId);
                e.currentTarget.classList.add('dragging');
            };

            const handleDragOver = (e) => {
                if (e.preventDefault) {
                    e.preventDefault(); // Necessary. Allows us to drop.
                }
                e.dataTransfer.dropEffect = 'move';

                // Visual feedback: find row we are over
                const targetRow = e.target.closest('tr');
                if (targetRow && targetRow !== dragSrcEl) {
                    // Could add class 'drag-over' here if desired
                }

                return false;
            };

            const handleDragEnter = (e) => {
                const targetRow = e.target.closest('tr');
                if (targetRow && targetRow !== dragSrcEl) {
                    targetRow.classList.add('drag-over');
                }
            };

            const handleDragLeave = (e) => {
                const targetRow = e.target.closest('tr');
                if (targetRow) {
                    targetRow.classList.remove('drag-over');
                }
            };

            const handleDrop = async (e) => {
                if (e.stopPropagation) {
                    e.stopPropagation(); // Stops some browsers from redirecting.
                }

                const targetRow = e.target.closest('tr');
                // Remove visual feedback
                rows.forEach(row => {
                    row.classList.remove('dragging');
                    row.classList.remove('drag-over');
                });

                if (dragSrcEl !== targetRow && targetRow && targetRow.draggable) {
                    // Reorder DOM
                    const allRows = Array.from(tbody.querySelectorAll('tr[draggable="true"]'));
                    const srcIndex = allRows.indexOf(dragSrcEl);
                    const targetIndex = allRows.indexOf(targetRow);

                    if (srcIndex < targetIndex) {
                        tbody.insertBefore(dragSrcEl, targetRow.nextSibling);
                    } else {
                        tbody.insertBefore(dragSrcEl, targetRow);
                    }

                    // Calculate new order
                    const newOrderIds = Array.from(tbody.querySelectorAll('tr[draggable="true"]')).map(row => row.dataset.songId);

                    try {
                        UI.showLoading('Speichere Reihenfolge...');

                        // Update all songs with new index
                        const updatePromises = newOrderIds.map((id, index) => {
                            return Storage.updateSong(id, { order: index });
                        });

                        await Promise.all(updatePromises);
                        UI.showToast('Reihenfolge gespeichert', 'success');
                    } catch (error) {
                        console.error('Error saving order:', error);
                        UI.showToast('Fehler beim Speichern der Reihenfolge', 'error');
                        // Re-render to restore correct state
                        this.renderEventSongs(eventId);
                    } finally {
                        UI.hideLoading();
                    }
                }
                return false;
            };

            rows.forEach(row => {
                row.addEventListener('dragstart', handleDragStart);
                row.addEventListener('dragenter', handleDragEnter);
                row.addEventListener('dragover', handleDragOver);
                row.addEventListener('dragleave', handleDragLeave);
                row.addEventListener('drop', handleDrop);
            });
        }

        container.querySelectorAll('.delete-song').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const confirmed = await UI.confirmDelete('Möchtest du diesen Song wirklich löschen?');
                if (confirmed) {
                    const songId = btn.dataset.id;
                    console.log('Deleting song:', songId, 'for event:', eventId);

                    // Save song data before deleting for potential rollback
                    const song = await Storage.getById('songs', songId);
                    if (song) {
                        this.deletedEventSongs.push(song);
                    }

                    await Storage.deleteSong(songId);
                    UI.showToast('Song gelöscht', 'success');
                    console.log('Re-rendering event songs only');
                    await this.renderEventSongs(eventId);
                    console.log('Finished re-rendering event songs');
                }
            });
        });
    },

    showBandSongSelector(eventId, bandSongs, options = {}) {
        const songList = bandSongs.map(song => `
            <div class="song-selection-card" onclick="const cb = this.querySelector('input'); cb.checked = !cb.checked;">
                <input type="checkbox" value="${song.id}" class="band-song-checkbox" onclick="event.stopPropagation()">
                <div class="song-card-content">
                    <div class="song-card-title">${this.escapeHtml(song.title)}</div>
                    <div class="song-card-artist">${this.escapeHtml(song.artist || 'Unbekannter Interpret')}</div>
                    <div class="song-card-badges">
                        ${song.bpm ? `<span class="song-badge bpm">${song.bpm} BPM</span>` : ''}
                        ${song.key ? `<span class="song-badge key">${song.key}</span>` : ''}
                        ${song.timeSignature ? `<span class="song-badge">${song.timeSignature}</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        const modalContent = `
            <div class="song-pool-modal-body">
                <div class="song-pool-search">
                    <input type="text" id="modalSongSearch" placeholder="Songs durchsuchen..." class="modern-search-input">
                </div>
                <div class="modal-song-list-container song-pool-list">
                ${songList}
                </div>
            </div>
            <div class="song-pool-modal-actions">
                <button type="button" id="cancelCopySongs" class="btn btn-secondary">Abbrechen</button>
                <button type="button" id="confirmCopySongs" class="btn btn-primary">Ausgewählte hinzufügen</button>
            </div>
        `;

        const tempModal = document.createElement('div');
        tempModal.className = 'modal active';
        tempModal.innerHTML = `
            <div class="modal-content song-pool-modal">
                <div class="modal-header song-pool-modal-header">
                    <div class="song-pool-title-group">
                        <span class="song-pool-kicker">Band-Pool</span>
                        <h2>${this.escapeHtml(options.title || 'Songs aus Band-Pool wählen')}</h2>
                        <p>${this.escapeHtml(options.description || 'Wähle Songs aus dem Repertoire deiner Band und füge sie gesammelt zur Setlist hinzu.')}</p>
                    </div>
                    <button type="button" class="modal-close song-pool-close" aria-label="Schließen">&times;</button>
                </div>
                ${modalContent}
            </div>
        `;
        document.body.appendChild(tempModal);

        // Add search functionality
        const searchInput = tempModal.querySelector('#modalSongSearch');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const cards = tempModal.querySelectorAll('.song-selection-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(term) ? 'flex' : 'none';
            });
        });

        // Add handlers
        tempModal.querySelector('#cancelCopySongs').addEventListener('click', () => {
            tempModal.remove();
        });

        tempModal.querySelector('.song-pool-close').addEventListener('click', () => {
            tempModal.remove();
        });

        tempModal.querySelector('#confirmCopySongs').addEventListener('click', async () => {
            const selectedIds = Array.from(tempModal.querySelectorAll('.band-song-checkbox:checked')).map(cb => cb.value);
            if (typeof options.onConfirm === 'function') {
                await options.onConfirm(selectedIds);
            } else {
                this.copyBandSongsToEvent(eventId, selectedIds);
            }
            tempModal.remove();
        });

        // Close on overlay click
        tempModal.addEventListener('click', (e) => {
            if (e.target === tempModal) {
                tempModal.remove();
            }
        });
    },

    // Similar to showBandSongSelector but adds selected songs to the draft for a new event
    showBandSongSelectorForDraft(bandSongs, options = {}) {
        const songList = bandSongs.map(song => `
            <div class="song-selection-card" onclick="const cb = this.querySelector('input'); cb.checked = !cb.checked;">
                <input type="checkbox" value="${song.id}" class="band-song-checkbox-draft" onclick="event.stopPropagation()">
                <div class="song-card-content">
                    <div class="song-card-title">${this.escapeHtml(song.title)}</div>
                    <div class="song-card-artist">${this.escapeHtml(song.artist || 'Unbekannter Interpret')}</div>
                    <div class="song-card-badges">
                        ${song.bpm ? `<span class="song-badge bpm">${song.bpm} BPM</span>` : ''}
                        ${song.key ? `<span class="song-badge key">${song.key}</span>` : ''}
                        ${song.timeSignature ? `<span class="song-badge">${song.timeSignature}</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        const modalContent = `
            <div class="song-pool-modal-body">
                <div class="song-pool-search">
                    <input type="text" id="modalSongSearchDraft" placeholder="Songs durchsuchen..." class="modern-search-input">
                </div>
                <div class="modal-song-list-container song-pool-list">
                ${songList}
                </div>
            </div>
            <div class="song-pool-modal-actions">
                <button type="button" id="cancelDraftSongs" class="btn btn-secondary">Abbrechen</button>
                <button type="button" id="confirmDraftSongs" class="btn btn-primary">Ausgewählte hinzufügen</button>
            </div>
        `;

        const tempModal = document.createElement('div');
        tempModal.className = 'modal active';
        tempModal.innerHTML = `
            <div class="modal-content song-pool-modal">
                <div class="modal-header song-pool-modal-header">
                    <div class="song-pool-title-group">
                        <span class="song-pool-kicker">Band-Pool</span>
                        <h2>${this.escapeHtml(options.title || 'Songs aus Band-Pool wählen')}</h2>
                        <p>${this.escapeHtml(options.description || 'Markiere Songs aus dem Bandrepertoire und übernimm sie direkt in die neue Setlist.')}</p>
                    </div>
                    <button type="button" class="modal-close song-pool-close" aria-label="Schließen">&times;</button>
                </div>
                ${modalContent}
            </div>
        `;
        document.body.appendChild(tempModal);

        // Add search functionality
        const searchInput = tempModal.querySelector('#modalSongSearchDraft');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const cards = tempModal.querySelectorAll('.song-selection-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(term) ? 'flex' : 'none';
            });
        });

        tempModal.querySelector('#cancelDraftSongs').addEventListener('click', () => {
            tempModal.remove();
        });

        tempModal.querySelector('.song-pool-close').addEventListener('click', () => {
            tempModal.remove();
        });

        tempModal.querySelector('#confirmDraftSongs').addEventListener('click', async () => {
            const selectedIds = Array.from(tempModal.querySelectorAll('.band-song-checkbox-draft:checked')).map(cb => cb.value);
            if (typeof options.onConfirm === 'function') {
                await options.onConfirm(selectedIds);
            } else {
                selectedIds.forEach(id => {
                    if (!this.draftEventSongIds.includes(id)) this.draftEventSongIds.push(id);
                });
                await this.renderDraftEventSongs();
            }
            tempModal.remove();
        });

        tempModal.addEventListener('click', (e) => {
            if (e.target === tempModal) tempModal.remove();
        });
    },

    showSongpoolSelectorForDraft(songpoolSongs, options = {}) {
        const songList = songpoolSongs.map(song => {
            const isPublic = String(song.visibility || '').toLowerCase() !== 'private';
            const icon = isPublic
                ? `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
                        <circle cx="12" cy="12" r="3.2"></circle>
                    </svg>
                `
                : `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18"></path>
                        <path d="M10.6 5.2A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a16.4 16.4 0 0 1-3.5 4.3"></path>
                        <path d="M6.5 6.5A16.4 16.4 0 0 0 2 12s3.5 7 10 7a11.8 11.8 0 0 0 4.1-.7"></path>
                        <path d="M9.9 9.9A3.2 3.2 0 0 0 12 15.2"></path>
                    </svg>
                `;

            const visibilityBadge = `
                <span class="songpool-visibility-badge ${isPublic ? 'is-public' : 'is-private'}" style="margin-right: 6px;">
                    <span class="songpool-visibility-icon" style="width:12px;height:12px;margin-right:4px;display:inline-flex;">${icon}</span>
                    <span style="font-size:0.7em;">${isPublic ? 'Öffentlich' : 'Privat'}</span>
                </span>
            `;

            return `
            <div class="song-selection-card" onclick="const cb = this.querySelector('input'); cb.checked = !cb.checked;">
                <input type="checkbox" value="${song.id}" class="songpool-song-checkbox-draft" onclick="event.stopPropagation()">
                <div class="song-card-content">
                    <div class="song-card-title">${this.escapeHtml(song.title)}</div>
                    <div class="song-card-artist">${this.escapeHtml(song.artist || 'Unbekannter Interpret')}</div>
                    <div class="song-card-badges">
                        ${visibilityBadge}
                        ${song.bpm ? `<span class="song-badge bpm">${song.bpm} BPM</span>` : ''}
                        ${song.key ? `<span class="song-badge key">${song.key}</span>` : ''}
                        ${song.timeSignature ? `<span class="song-badge">${song.timeSignature}</span>` : ''}
                    </div>
                </div>
            </div>
        `}).join('');

        const modalContent = `
            <div class="song-pool-modal-body">
                <div class="song-pool-search">
                    <input type="text" id="modalSongpoolSearchDraft" placeholder="Songpool durchsuchen..." class="modern-search-input">
                </div>
                <div class="modal-song-list-container song-pool-list">
                ${songList}
                </div>
            </div>
            <div class="song-pool-modal-actions">
                <button type="button" id="cancelSongpoolDraftSongs" class="btn btn-secondary">Abbrechen</button>
                <button type="button" id="confirmSongpoolDraftSongs" class="btn btn-primary">Ausgewählte hinzufügen</button>
            </div>
        `;

        const tempModal = document.createElement('div');
        tempModal.className = 'modal active';
        tempModal.innerHTML = `
            <div class="modal-content song-pool-modal">
                <div class="modal-header song-pool-modal-header">
                    <div class="song-pool-title-group">
                        <span class="song-pool-kicker">Songpool</span>
                        <h2>${this.escapeHtml(options.title || 'Songs aus Songpool wählen')}</h2>
                        <p>${this.escapeHtml(options.description || 'Markiere Songs aus dem Songpool und übernimm sie direkt.')}</p>
                    </div>
                    <button type="button" class="modal-close songpool-modal-close" aria-label="Schließen">&times;</button>
                </div>
                ${modalContent}
            </div>
        `;
        document.body.appendChild(tempModal);

        // Add search functionality
        const searchInput = tempModal.querySelector('#modalSongpoolSearchDraft');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const cards = tempModal.querySelectorAll('.song-selection-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(term) ? 'flex' : 'none';
            });
        });

        tempModal.querySelector('#cancelSongpoolDraftSongs').addEventListener('click', () => {
            tempModal.remove();
        });

        tempModal.querySelector('.songpool-modal-close').addEventListener('click', () => {
            tempModal.remove();
        });

        tempModal.querySelector('#confirmSongpoolDraftSongs').addEventListener('click', async () => {
            const selectedIds = Array.from(tempModal.querySelectorAll('.songpool-song-checkbox-draft:checked')).map(cb => cb.value);
            if (typeof options.onConfirm === 'function') {
                await options.onConfirm(selectedIds);
            }
            tempModal.remove();
        });

        tempModal.addEventListener('click', (e) => {
            if (e.target === tempModal) tempModal.remove();
        });
    },

    openSongpoolAddEntryModal() {
        const tempModal = document.createElement('div');
        tempModal.className = 'modal active';
        tempModal.innerHTML = `
            <div class="modal-content song-pool-modal songpool-add-choice-modal">
                <div class="modal-header song-pool-modal-header">
                    <div class="song-pool-title-group">
                        <span class="song-pool-kicker">Songpool</span>
                        <h2>Song hinzufügen</h2>
                    </div>
                    <button type="button" class="modal-close song-pool-close" aria-label="Schließen">&times;</button>
                </div>
                <div class="songpool-add-choice-body">
                    <button type="button" class="songpool-add-choice-card" data-action="manual">
                        <span class="songpool-add-choice-chip">Direkt erstellen</span>
                        <strong>Neuen Song erstellen</strong>
                    </button>
                    <button type="button" class="songpool-add-choice-card" data-action="bandpool">
                        <span class="songpool-add-choice-chip">Aus bestehendem Repertoire</span>
                        <strong>Song aus Bandpool hinzufügen</strong>
                    </button>
                </div>
                <div class="song-pool-modal-actions songpool-add-choice-actions">
                    <button type="button" class="btn btn-secondary" data-action="cancel">Abbrechen</button>
                </div>
            </div>
        `;

        document.body.appendChild(tempModal);
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');

        const closeModal = () => {
            document.removeEventListener('keydown', handleEscape);
            tempModal.remove();
            if (document.querySelectorAll('.modal.active').length === 0) {
                document.body.classList.remove('modal-open');
                document.documentElement.classList.remove('modal-open');
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                closeModal();
            }
        };

        document.addEventListener('keydown', handleEscape);

        tempModal.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
        tempModal.querySelector('.song-pool-close').addEventListener('click', closeModal);

        tempModal.querySelector('[data-action="manual"]').addEventListener('click', () => {
            closeModal();
            this.lastSongModalContext = {
                origin: 'songpool',
                collection: 'songpool_songs',
                defaultVisibility: 'public'
            };
            this.openSongModal(null, null, null);
        });

        tempModal.querySelector('[data-action="bandpool"]').addEventListener('click', async () => {
            closeModal();
            await this.openSongpoolBandImportModal();
        });

        this.bindSongpoolTempModalBackdropClose(tempModal, closeModal);
    },

    async openSongpoolBandImportModal() {
        const user = Auth.getCurrentUser();
        if (!user) {
            UI.showToast('Du musst angemeldet sein, um Songs aus dem Bandpool zu übernehmen.', 'error');
            return;
        }

        UI.showLoading('Band-Songs werden geladen...');

        try {
            const bands = (await Storage.getUserBands(user.id) || [])
                .filter(Boolean)
                .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'de'));

            if (!bands.length) {
                UI.hideLoading();
                UI.showToast('Du bist aktuell in keiner Band.', 'info');
                return;
            }

            const bandEntries = await Promise.all(bands.map(async (band) => {
                const songs = (await Storage.getBandSongs(band.id) || [])
                    .filter(song => !!song && !!song.title)
                    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || ''), 'de'));

                return { band, songs };
            }));

            UI.hideLoading();

            if (!bandEntries.some((entry) => entry.songs.length > 0)) {
                UI.showToast('In deinen Bands sind noch keine Songs vorhanden.', 'info');
                return;
            }

            const tempModal = document.createElement('div');
            tempModal.className = 'modal active';
            tempModal.innerHTML = `
                <div class="modal-content song-pool-modal songpool-band-import-modal">
                    <div class="modal-header song-pool-modal-header">
                        <div class="song-pool-title-group">
                            <span class="song-pool-kicker">Songpool</span>
                            <h2>Song aus Bandpool hinzufügen</h2>
                            <p>Wähle eine Band und markiere die Songs, die du in deinen Songpool übernehmen möchtest.</p>
                        </div>
                        <button type="button" class="modal-close song-pool-close" aria-label="Schließen">&times;</button>
                    </div>
                    <div class="song-pool-modal-body songpool-band-import-body">
                        <div class="songpool-band-import-toolbar">
                            <div class="songpool-band-select-wrapper">
                                <select id="songpoolBandSelect" class="modern-select"></select>
                            </div>
                            <div class="song-pool-search">
                                <input type="text" id="songpoolBandSearch" placeholder="Band-Songs durchsuchen..." class="modern-search-input">
                            </div>
                            <div class="songpool-band-import-status">
                                <strong id="songpoolBandSelectedCount">0</strong>
                                <span>ausgewählt</span>
                            </div>
                        </div>
                        <div class="songpool-band-select-all-row">
                            <label class="select-all-label">
                                <input type="checkbox" id="songpoolSelectAllVisible">
                                <span>Alle sichtbaren auswählen</span>
                            </label>
                            <div id="songpoolBandMeta" class="songpool-band-import-meta"></div>
                        </div>
                        <div id="songpoolBandSongList" class="modal-song-list-container song-pool-list songpool-band-song-list"></div>
                        <div class="songpool-band-import-visibility-settings">
                            <div class="songpool-band-import-visibility-head">
                                <span class="songpool-band-import-visibility-icon" aria-hidden="true">👁️</span>
                                <strong>Sichtbarkeit der übernommenen Songs</strong>
                            </div>
                            <div class="songpool-band-import-visibility-options">
                                <label class="songpool-band-import-visibility-option">
                                    <input type="radio" name="importVisibility" value="private">
                                    <div>
                                        <div class="songpool-band-import-visibility-title">Privat</div>
                                        <div class="songpool-band-import-visibility-copy">Nur du kannst diese Songs in deinem Songpool sehen.</div>
                                    </div>
                                </label>
                                <label class="songpool-band-import-visibility-option">
                                    <input type="radio" name="importVisibility" value="public" checked>
                                    <div>
                                        <div class="songpool-band-import-visibility-title">Öffentlich</div>
                                        <div class="songpool-band-import-visibility-copy">Andere Nutzer können deine Songs sehen und ebenfalls importieren.</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="song-pool-modal-actions">
                        <button type="button" class="btn btn-secondary" data-action="cancel">Abbrechen</button>
                        <button type="button" class="btn btn-primary" id="confirmSongpoolBandImport" disabled>Song hinzufügen</button>
                    </div>
                </div>
            `;

            document.body.appendChild(tempModal);
            document.body.classList.add('modal-open');
            document.documentElement.classList.add('modal-open');

            const bandSelect = tempModal.querySelector('#songpoolBandSelect');
            const metaContainer = tempModal.querySelector('#songpoolBandMeta');
            const songsContainer = tempModal.querySelector('#songpoolBandSongList');
            const searchInput = tempModal.querySelector('#songpoolBandSearch');
            const selectAllCheckbox = tempModal.querySelector('#songpoolSelectAllVisible');
            const confirmButton = tempModal.querySelector('#confirmSongpoolBandImport');
            const selectedCountLabel = tempModal.querySelector('#songpoolBandSelectedCount');
            const selectedSongIds = new Set();
            let activeBandId = String((bandEntries.find((entry) => entry.songs.length > 0) || bandEntries[0]).band.id);

            const closeModal = () => {
                document.removeEventListener('keydown', handleEscape);
                tempModal.remove();
                if (document.querySelectorAll('.modal.active').length === 0) {
                    document.body.classList.remove('modal-open');
                    document.documentElement.classList.remove('modal-open');
                }
            };

            const handleEscape = (event) => {
                if (event.key === 'Escape') {
                    closeModal();
                }
            };

            document.addEventListener('keydown', handleEscape);

            const normalizeSearch = (value) => this.normalizeTextForSearch(value);
            const getActiveEntry = () => bandEntries.find((entry) => String(entry.band.id) === String(activeBandId)) || bandEntries[0];

            const updateConfirmState = () => {
                const selectedCount = selectedSongIds.size;
                selectedCountLabel.textContent = String(selectedCount);
                confirmButton.disabled = selectedCount === 0;
                confirmButton.textContent = selectedCount === 0
                    ? 'Song hinzufügen'
                    : `${selectedCount} Song${selectedCount === 1 ? '' : 's'} hinzufügen`;
            };

            const renderBandSelect = () => {
                bandSelect.innerHTML = bandEntries.map((entry) => `
                    <option value="${entry.band.id}" ${String(entry.band.id) === String(activeBandId) ? 'selected' : ''}>
                        ${this.escapeHtml(entry.band.name || 'Band')} (${entry.songs.length})
                    </option>
                `).join('');

                bandSelect.addEventListener('change', () => {
                    activeBandId = bandSelect.value;
                    renderSongs();
                });
            };

            const renderSongs = () => {
                const activeEntry = getActiveEntry();
                const activeSongs = Array.isArray(activeEntry?.songs) ? activeEntry.songs : [];
                const searchTerm = normalizeSearch(searchInput.value);
                const visibleSongs = searchTerm
                    ? activeSongs.filter((song) => {
                        const searchable = [
                            song.title,
                            song.artist,
                            song.key,
                            song.timeSignature,
                            song.leadVocal,
                            song.language,
                            song.ccli,
                            this.getSongInfoDisplay(song)
                        ].map((value) => this.normalizeTextForSearch(value)).join(' ');
                        return searchable.includes(searchTerm);
                    })
                    : activeSongs;

                metaContainer.innerHTML = `
                    <strong>${this.escapeHtml(activeEntry?.band?.name || 'Band')}</strong>
                    <span>${activeSongs.length} Song${activeSongs.length === 1 ? '' : 's'} im Bandpool</span>
                `;

                if (!visibleSongs.length) {
                    songsContainer.innerHTML = `
                        <div class="songpool-band-import-empty">
                            <strong>Keine Songs gefunden</strong>
                            <span>${searchTerm ? 'Passe deine Suche an oder wechsle zu einer anderen Band.' : 'Für diese Band sind aktuell noch keine Songs hinterlegt.'}</span>
                        </div>
                    `;
                    updateConfirmState();
                    return;
                }

                songsContainer.innerHTML = visibleSongs.map((song) => `
                    <label class="song-selection-card songpool-band-song-card">
                        <input
                            type="checkbox"
                            value="${song.id}"
                            class="songpool-band-song-checkbox"
                            ${selectedSongIds.has(String(song.id)) ? 'checked' : ''}
                        >
                        <div class="song-card-content">
                            <div class="song-card-title">${this.escapeHtml(song.title)}</div>
                            <div class="song-card-artist">${this.escapeHtml(song.artist || 'Unbekannter Interpret')}</div>
                            <div class="song-card-badges">
                                ${song.bpm ? `<span class="song-badge bpm">${song.bpm} BPM</span>` : ''}
                                ${song.key ? `<span class="song-badge key">${this.escapeHtml(song.key)}</span>` : ''}
                                ${song.timeSignature ? `<span class="song-badge">${this.escapeHtml(song.timeSignature)}</span>` : ''}
                                ${song.language ? `<span class="song-badge">${this.escapeHtml(song.language)}</span>` : ''}
                            </div>
                        </div>
                    </label>
                `).join('');

                // Update "Select All" checkbox state
                if (visibleSongs.length > 0) {
                    const allVisibleSelected = visibleSongs.every(song => selectedSongIds.has(String(song.id)));
                    const someVisibleSelected = visibleSongs.some(song => selectedSongIds.has(String(song.id)));
                    selectAllCheckbox.checked = allVisibleSelected;
                    selectAllCheckbox.indeterminate = someVisibleSelected && !allVisibleSelected;
                } else {
                    selectAllCheckbox.checked = false;
                    selectAllCheckbox.indeterminate = false;
                }

                songsContainer.querySelectorAll('.songpool-band-song-checkbox').forEach((checkbox) => {
                    checkbox.addEventListener('change', () => {
                        const songId = String(checkbox.value);
                        if (checkbox.checked) {
                            selectedSongIds.add(songId);
                        } else {
                            selectedSongIds.delete(songId);
                        }

                        // Update Select All state after individual change
                        const stillAllSelected = visibleSongs.every(s => selectedSongIds.has(String(s.id)));
                        const stillSomeSelected = visibleSongs.some(s => selectedSongIds.has(String(s.id)));
                        selectAllCheckbox.checked = stillAllSelected;
                        selectAllCheckbox.indeterminate = stillSomeSelected && !stillAllSelected;

                        updateConfirmState();
                    });
                });

                updateConfirmState();
            };

            // Select All logic
            selectAllCheckbox.addEventListener('change', () => {
                const activeEntry = getActiveEntry();
                const activeSongs = Array.isArray(activeEntry?.songs) ? activeEntry.songs : [];
                const searchTerm = normalizeSearch(searchInput.value);
                const visibleSongs = searchTerm
                    ? activeSongs.filter((song) => {
                        const searchable = [
                            song.title,
                            song.artist,
                            song.key,
                            song.timeSignature,
                            song.leadVocal,
                            song.language,
                            song.ccli,
                            this.getSongInfoDisplay(song)
                        ].map((value) => this.normalizeTextForSearch(value)).join(' ');
                        return searchable.includes(searchTerm);
                    })
                    : activeSongs;

                if (selectAllCheckbox.checked) {
                    visibleSongs.forEach(song => selectedSongIds.add(String(song.id)));
                } else {
                    visibleSongs.forEach(song => selectedSongIds.delete(String(song.id)));
                }
                renderSongs();
            });

            renderBandSelect();
            renderSongs();

            tempModal.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
            tempModal.querySelector('.song-pool-close').addEventListener('click', closeModal);

            confirmButton.addEventListener('click', async () => {
                const selectedIds = Array.from(selectedSongIds);
                if (!selectedIds.length) return;

                const visibility = tempModal.querySelector('input[name="importVisibility"]:checked')?.value || 'public';

                closeModal();
                await this.copyBandSongsToSongpool(selectedIds, visibility);
            });

            searchInput.addEventListener('input', () => {
                renderSongs();
            });

            this.bindSongpoolTempModalBackdropClose(tempModal, closeModal);
        } catch (error) {
            UI.hideLoading();
            console.error('[Songpool] Band import modal could not be opened:', error);
            UI.showToast(error.message || 'Band-Songs konnten nicht geladen werden.', 'error');
        }
    },

    async copyBandSongsToSongpool(songIds, visibility = 'private') {
        const user = Auth.getCurrentUser();
        if (!user) {
            UI.showToast('Du musst angemeldet sein, um Songs in den Songpool zu übernehmen.', 'error');
            return;
        }

        const uniqueSongIds = Array.from(new Set((Array.isArray(songIds) ? songIds : []).map((songId) => String(songId)).filter(Boolean)));
        if (!uniqueSongIds.length) {
            UI.showToast('Bitte wähle mindestens einen Song aus.', 'info');
            return;
        }

        let loadErrorCount = 0;
        const readyBandSongs = [];
        const missingDocumentSongs = [];

        try {
            UI.showLoading(`Songs werden vorbereitet (0/${uniqueSongIds.length})...`);

            for (let index = 0; index < uniqueSongIds.length; index++) {
                const songId = uniqueSongIds[index];
                UI.showLoading(`Songs werden vorbereitet (${index + 1}/${uniqueSongIds.length})...`);

                try {
                    const bandSong = await Storage.getById('songs', songId);
                    if (!bandSong || !bandSong.title) {
                        loadErrorCount++;
                        continue;
                    }

                    if (!this.songpoolEntryHasDocument(bandSong)) {
                        missingDocumentSongs.push(bandSong);
                        continue;
                    }

                    readyBandSongs.push(bandSong);
                } catch (error) {
                    console.error('[Songpool] Band song could not be loaded:', error);
                    loadErrorCount++;
                }
            }

            UI.hideLoading();

            if (!readyBandSongs.length && !missingDocumentSongs.length) {
                UI.showToast('Die ausgewählten Songs konnten nicht übernommen werden.', 'error');
                return;
            }

            const initialDrafts = [
                ...readyBandSongs.map((song) => this.createSongpoolDraftFromBandSong(song, visibility)),
                ...missingDocumentSongs.map((song) => this.createSongpoolDraftFromBandSong(song, visibility))
            ].filter(Boolean);

            let selectedDrafts = initialDrafts;
            try {
                const existingSongs = await Storage.getSongpoolSongs(user.id, { includePublic: true });
                const duplicateEntries = this.buildSongpoolDuplicateEntries(initialDrafts, existingSongs);

                if (duplicateEntries.length > 0) {
                    const reviewResult = await this.openSongpoolDuplicateReviewModal(duplicateEntries, {
                        userId: user.id,
                        title: 'Ähnliche Songs vorab prüfen',
                        description: 'Prüfe mögliche Doppelungen zuerst. Danach ergänzt du nur noch fehlende Dateien und vervollständigst die Songdaten in der Vorschau.',
                        getConfirmLabel: (activeCount, totalCount) => {
                            if (activeCount === 0) return 'Ohne Treffer weiter';
                            if (activeCount === totalCount) return 'Auswahl übernehmen';
                            return `${activeCount} Songs übernehmen`;
                        }
                    });

                    if (!reviewResult?.confirmed) {
                        UI.showToast('Import abgebrochen.', 'info');
                        return;
                    }

                    const selectedEntryIds = new Set(
                        (Array.isArray(reviewResult.entries) ? reviewResult.entries : [])
                            .map((entry) => String(entry?.draft?.id || ''))
                            .filter(Boolean)
                    );
                    const duplicateDraftIdSet = new Set(
                        duplicateEntries
                            .map((entry) => String(entry?.draft?.id || ''))
                            .filter(Boolean)
                    );

                    selectedDrafts = initialDrafts
                        .filter((draft) => !duplicateDraftIdSet.has(String(draft.id)) || selectedEntryIds.has(String(draft.id)))
                        .map((draft) => (
                            selectedEntryIds.has(String(draft.id))
                                ? {
                                    ...draft,
                                    duplicateReviewApproved: true,
                                    duplicateReviewSignature: this.getSongpoolDuplicateDraftSignature(draft)
                                }
                                : draft
                        ));
                }
            } catch (error) {
                console.error('[Songpool] Duplicate pre-check for band import failed:', error);
                UI.showToast(Storage._getSongpoolErrorMessage(error, 'Songpool konnte nicht geprüft werden.'), 'error');
                return;
            }

            if (!selectedDrafts.length) {
                UI.showToast('Keine Songs mehr zum Übernehmen ausgewählt.', 'info');
                return;
            }

            const selectedDraftIdSet = new Set(selectedDrafts.map((draft) => String(draft.id)));
            const selectedDraftMetaBySongId = new Map(
                selectedDrafts
                    .filter((draft) => draft.sourceSongId != null)
                    .map((draft) => [
                        String(draft.sourceSongId),
                        {
                            duplicateReviewApproved: Boolean(draft.duplicateReviewApproved),
                            duplicateReviewSignature: draft.duplicateReviewSignature || ''
                        }
                    ])
            );

            const filteredReadyBandSongs = readyBandSongs.filter((song) => selectedDraftIdSet.has(`bandpool-${song.id}`));
            const filteredMissingDocumentSongs = missingDocumentSongs.filter((song) => selectedDraftIdSet.has(`bandpool-${song.id}`));

            const documentResolution = await this.openSongpoolBandMissingDocumentModal(
                filteredReadyBandSongs,
                filteredMissingDocumentSongs,
                visibility,
                selectedDraftMetaBySongId
            );

            if (!documentResolution?.confirmed) {
                UI.showToast('Import abgebrochen.', 'info');
                return;
            }

            const drafts = (Array.isArray(documentResolution.drafts) ? documentResolution.drafts : []).filter(Boolean);

            if (!drafts.length) {
                UI.showToast('Es wurden keine Songs zum Hinzufügen ausgewählt.', 'info');
                return;
            }

            this.openSongpoolImportPreview(drafts);

            if (loadErrorCount > 0) {
                UI.showToast(`${loadErrorCount} Song${loadErrorCount === 1 ? '' : 's'} konnten nicht geladen werden.`, 'warning');
            }
            return;
        } catch (error) {
            console.error('[Songpool] Band songs could not be copied to songpool:', error);
            UI.showToast(error.message || 'Band-Songs konnten nicht in den Songpool übernommen werden.', 'error');
            return;
        } finally {
            UI.hideLoading();
        }
    },

    async copyBandSongsToEvent(eventId, songIds) {
        const user = Auth.getCurrentUser();
        let count = 0;

        for (const songId of songIds) {
            const bandSong = await Storage.getById('songs', songId);
            if (bandSong) {
                // Duplicate check: Don't copy if it's already an event song for this event
                if (bandSong.eventId === eventId) continue;

                // Create a copy for the event
                const eventSong = {
                    title: bandSong.title,
                    artist: bandSong.artist,
                    bpm: bandSong.bpm,
                    timeSignature: bandSong.timeSignature,
                    key: bandSong.key,
                    originalKey: bandSong.originalKey,
                    leadVocal: bandSong.leadVocal,
                    language: bandSong.language,
                    tracks: bandSong.tracks,
                    info: bandSong.info,
                    ccli: bandSong.ccli,
                    pdf_url: bandSong.pdf_url,
                    eventId: eventId,
                    createdBy: user.id
                };
                await Storage.createSong(eventSong);
                count++;
            }
        }

        UI.showToast(`${count} Song${count !== 1 ? 's' : ''} kopiert`, 'success');
        await this.renderEventSongs(eventId);
    },

    // Sync draft songs to event (Handle additions, reordering, and removals)
    async syncEventSongs(eventId, draftSongIds) {
        const user = Auth.getCurrentUser();
        const overrides = this.draftEventSongOverrides || {};
        const songIdMap = new Map();

        const getOverridePayload = (songId) => {
            const override = overrides[songId];
            if (!override) return null;

            const editableFields = [
                'title',
                'artist',
                'bpm',
                'timeSignature',
                'key',
                'originalKey',
                'leadVocal',
                'language',
                'tracks',
                'info',
                'ccli',
                'pdf_url'
            ];

            const payload = editableFields.reduce((nextPayload, field) => {
                if (Object.prototype.hasOwnProperty.call(override, field)) {
                    nextPayload[field] = override[field];
                }
                return nextPayload;
            }, {});

            return Object.keys(payload).length > 0 ? payload : null;
        };

        // 1. Get existing event songs
        const existingSongs = await Storage.getEventSongs(eventId);
        const existingIds = existingSongs.map(s => s.id);

        // a. Detect songs to delete (in existing but not in draft)
        // BUT: draftSongIds might contain BandSong IDs (new additions) or EventSong IDs (existing).
        // We need to be careful.
        // Rule: If an existing EventSong ID is NOT in draftSongIds, IT MUST BE DELETED.
        const toDeleteIds = existingIds.filter(id => !draftSongIds.includes(id));

        for (const id of toDeleteIds) {
            await Storage.deleteSong(id);
        }

        // b. Process draft list in order
        let orderCounter = 0;
        for (const songId of draftSongIds) {
            // Check if it's an existing event song
            if (existingIds.includes(songId)) {
                // It's an existing song, kept in the list. Update order.
                const updatePayload = {
                    order: orderCounter++
                };
                const overridePayload = getOverridePayload(songId);
                if (overridePayload) Object.assign(updatePayload, overridePayload);
                await Storage.updateSong(songId, updatePayload);
                songIdMap.set(String(songId), String(songId));
            } else {
                // It's a NEW song (Band Song ID) to be added
                const bandSong = await Storage.getById('songs', songId);
                if (bandSong) {
                    const overridePayload = getOverridePayload(songId);
                    const eventSong = {
                        title: bandSong.title,
                        artist: bandSong.artist,
                        bpm: bandSong.bpm,
                        timeSignature: bandSong.timeSignature,
                        key: overridePayload && Object.prototype.hasOwnProperty.call(overridePayload, 'key')
                            ? overridePayload.key
                            : bandSong.key,
                        originalKey: bandSong.originalKey,
                        leadVocal: bandSong.leadVocal,
                        language: bandSong.language,
                        tracks: bandSong.tracks,
                        info: bandSong.info,
                        ccli: bandSong.ccli,
                        pdf_url: bandSong.pdf_url,
                        eventId: eventId,
                        order: orderCounter++,
                        createdBy: user.id
                    };
                    if (overridePayload) Object.assign(eventSong, overridePayload);
                    const createdEventSong = await Storage.createSong(eventSong);
                    if (createdEventSong?.id) {
                        songIdMap.set(String(songId), String(createdEventSong.id));
                    }
                }
            }
        }

        this.remapDraftEventRundownSongIds(songIdMap);
        return songIdMap;
    },

    async renderBandSongs(bandId) {
        const container = document.getElementById('bandSongsList');
        if (!container) return;

        // Fix: Ensure we are fetching for the correct band
        let songs = await Storage.getBandSongs(bandId);
        if (!Array.isArray(songs)) songs = [];

        // Apply Search Filter locally for responsiveness
        const searchTerm = (document.getElementById('bandSongSearch')?.value || '').toLowerCase();
        if (searchTerm) {
            songs = songs.filter(s =>
                (s.title || '').toLowerCase().includes(searchTerm) ||
                (s.artist || '').toLowerCase().includes(searchTerm) ||
                Storage.getSongPlainInfo(s).toLowerCase().includes(searchTerm) ||
                (s.ccli || '').toLowerCase().includes(searchTerm)
            );
        }

        // Apply Sorting
        if (this.bandSongSort.direction !== 'none') {
            const field = this.bandSongSort.field;
            const dir = this.bandSongSort.direction === 'asc' ? 1 : -1;

            songs.sort((a, b) => {
                let valA = a[field] || '';
                let valB = b[field] || '';

                // Special handling for artist mapping
                if (field === 'artist' && !a.artist) valA = a.artist || '';

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                // Numeric sorting for BPM
                if (field === 'bpm') {
                    valA = parseInt(valA) || 0;
                    valB = parseInt(valB) || 0;
                }

                if (valA < valB) return -1 * dir;
                if (valA > valB) return 1 * dir;
                return 0;
            });
        }

        const band = await Storage.getBand(bandId);
        const bandName = band ? band.name : 'Unbekannte Band';

        const tableRows = songs.length > 0 ?
            songs.map(song => `
                <tr style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: var(--spacing-sm); text-align: center;" data-label="Auswählen">
                        <input type="checkbox" class="band-song-checkbox-row" value="${song.id}">
                    </td>
                    <td class="band-setlist-actions-cell" style="padding: var(--spacing-sm); text-align: center;" data-label="Aktionen">
                        <div style="display: flex; gap: 8px; justify-content: center;">
                            <button type="button" class="btn-icon edit-song" data-id="${song.id}" title="Bearbeiten" aria-label="Song bearbeiten">${this.getRundownInlineIcon('edit')}</button>
                            <button type="button" class="btn-icon delete-song" data-id="${song.id}" title="Löschen" aria-label="Song löschen">${this.getRundownInlineIcon('trash')}</button>
                        </div>
                    </td>
                    <td style="padding: var(--spacing-sm); white-space: nowrap;" data-label="Titel">${this.escapeHtml(song.title)}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Interpret">${this.escapeHtml(song.artist || '-')}</td>
                    <td style="padding: var(--spacing-sm);" data-label="BPM">${song.bpm || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Time">${song.timeSignature || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Tonart">${song.key || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Orig.">${song.originalKey || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Lead Vocal">${song.leadVocal || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Sprache">${song.language || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Tracks">${song.tracks === 'yes' ? 'Ja' : (song.tracks === 'no' ? 'Nein' : '-')}</td>
                    <td style="padding: var(--spacing-sm); text-align: center;" data-label="Dateien">
                        ${this.renderSongDocumentPreviewButtons(song)}
                    </td>
                    <td style="padding: var(--spacing-sm); font-size: 0.9em;" data-label="Infos">${this.escapeHtml(this.getSongInfoDisplay(song))}</td>
                    <td style="padding: var(--spacing-sm); font-family: monospace; font-size: 0.9em;" data-label="CCLI">${song.ccli || '-'}</td>
                </tr>
            `).join('') :
            `<tr><td colspan="14" style="padding: var(--spacing-xl); text-align: center; color: var(--color-text-light);">${searchTerm ? 'Keine Songs gefunden.' : 'Noch keine Songs hinzugefügt.'}</td></tr>`;

        // Store songs for PDF export
        this.currentBandSongs = songs;

        const getSortClass = (field) => {
            if (this.bandSongSort.field !== field) return '';
            return this.bandSongSort.direction === 'asc' ? 'sort-asc' : (this.bandSongSort.direction === 'desc' ? 'sort-desc' : '');
        };

        container.innerHTML = `
        <div class="band-setlist-workspace">
            <div class="band-setlist-toolbar">
                <div class="band-setlist-toolbar-top">
                    <div class="band-setlist-titleblock">
                        <span class="band-setlist-kicker">Repertoire</span>
                        <h3>Setlist <span class="band-setlist-count">(${this.currentBandSongs.length})</span></h3>
                        <p class="band-setlist-description">Verwalte Songs, Reihenfolge und Material der Band an einem Ort.</p>
                    </div>
                    <div class="band-setlist-toolbar-actions">
                        <button class="btn btn-secondary btn-sm" id="bandSongsExportPDF" title="Gesamte Setliste als PDF">
                            <img src="images/pdf-download.png" class="btn-icon-img" alt="PDF icon"><span class="btn-text-mobile-hide">Als PDF herunterladen</span>
                        </button>
                        <input type="file" id="csvSongUpload" accept=".csv" style="display: none;">
                        <button class="btn btn-secondary btn-sm" onclick="UI.openModal('importSongsModal')" title="Import-Anleitung anzeigen">
                            <img src="images/csv-import.png" class="btn-icon-img" alt="CSV icon"><span class="btn-text-mobile-hide">CSV Import</span>
                        </button>
                        <button id="addBandSongBtn" class="btn btn-primary btn-sm">+ Song hinzufügen</button>
                    </div>
                </div>
                <div class="band-setlist-toolbar-main">
                    <div class="search-wrapper band-setlist-search">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="bandSongSearch" placeholder="Setliste durchsuchen..." class="modern-search-input" value="${searchTerm}">
                    </div>
                </div>
            </div>

            <div id="bandSongsBulkActions" class="band-setlist-bulkbar" style="display: none;">
                <div class="band-setlist-bulkinfo">
                    <span class="band-setlist-bulk-label">Ausgewählt</span>
                    <strong id="bandSongsSelectedCount">0</strong>
                </div>
                <div class="band-setlist-bulkactions">
                    <button id="bandSongsBulkDelete" class="btn btn-danger btn-sm">Auswahl löschen</button>
                    <button id="bandSongsBulkPDF" class="btn btn-secondary btn-sm">Auswahl als PDF exportieren</button>
                </div>
            </div>

            <div class="band-setlist-table-wrap">
        <table class="songs-table band-setlist-table" style="width: 100%; border-collapse: collapse; margin-top: var(--spacing-md);">
            <thead>
                <tr style="border-bottom: 2px solid var(--color-border);">
                    <th style="padding: var(--spacing-sm); text-align: center; width: 40px;">
                        <input type="checkbox" id="selectAllBandSongs">
                    </th>
                    <th style="padding: var(--spacing-sm); text-align: center; width: 108px;">Aktionen</th>
                    <th class="sortable-header sortable-col-title ${getSortClass('title')}" data-field="title" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Titel</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-artist ${getSortClass('artist')}" data-field="artist" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Interpret</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-bpm ${getSortClass('bpm')}" data-field="bpm" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">BPM</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-time ${getSortClass('timeSignature')}" data-field="timeSignature" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Time</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-key ${getSortClass('key')}" data-field="key" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Tonart</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-original-key ${getSortClass('originalKey')}" data-field="originalKey" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Orig.</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-lead ${getSortClass('leadVocal')}" data-field="leadVocal" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Lead</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-language ${getSortClass('language')}" data-field="language" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Sprache</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th class="sortable-header sortable-col-tracks ${getSortClass('tracks')}" data-field="tracks" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Tracks</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                    <th style="padding: var(--spacing-sm); text-align: center;">PDF</th>
                    <th style="padding: var(--spacing-sm); text-align: left; min-width: 250px;">Infos</th>
                    <th class="sortable-header sortable-col-ccli ${getSortClass('ccli')}" data-field="ccli" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">CCLI</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                </tr>
            </thead>
            <tbody id="bandSongsTableBody">
                ${tableRows}
            </tbody>
        </table>
            </div>
        </div>
`;

        this.setupBandSetlistHorizontalScroll(container);

        // Wire up Sort Headers
        container.querySelectorAll('.sortable-header').forEach(header => {
            header.addEventListener('click', () => {
                const field = header.dataset.field;
                if (this.bandSongSort.field === field) {
                    // Toggle: asc -> desc -> none -> asc
                    if (this.bandSongSort.direction === 'asc') this.bandSongSort.direction = 'desc';
                    else if (this.bandSongSort.direction === 'desc') this.bandSongSort.direction = 'none';
                    else this.bandSongSort.direction = 'asc';
                } else {
                    this.bandSongSort.field = field;
                    this.bandSongSort.direction = 'asc';
                }
                this.renderBandSongs(bandId);
            });
        });

        // Wire up search
        const searchInput = document.getElementById('bandSongSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                // We use a small timeout to avoid double-renders but keep it snappy
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => this.renderBandSongs(bandId), 300);
            });
            searchInput.focus(); // Keep focus when typing
            // Set cursor to end
            const val = searchInput.value;
            searchInput.value = '';
            searchInput.value = val;
        }

        // Wire up add button
        const addBtn = document.getElementById('addBandSongBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.openSongModal(null, bandId, null);
            });
        }

        // PDF Export
        document.getElementById('bandSongsExportPDF').addEventListener('click', () => {
            this.downloadSongListPDF(this.currentBandSongs || [], `Gesamtsetlist der Band ${bandName}`, 'Repertoire Export', true);
        });

        const bandSongLookup = new Map((this.currentBandSongs || []).map((song) => [String(song.id), song]));
        this.attachSongDocumentPreviewHandlers(container, bandSongLookup);

        // CSV Import
        const csvUpload = document.getElementById('csvSongUpload');
        if (csvUpload) {
            csvUpload.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.handleCSVUpload(e.target.files[0], bandId);
                }
            });
        }

        // Bulk Actions Logic
        const checkboxRows = container.querySelectorAll('.band-song-checkbox-row');
        const selectAll = document.getElementById('selectAllBandSongs');
        const bulkActionsBar = document.getElementById('bandSongsBulkActions');
        const selectedCountSpan = document.getElementById('bandSongsSelectedCount');
        const bulkDeleteBtn = document.getElementById('bandSongsBulkDelete');
        const bulkPDFBtn = document.getElementById('bandSongsBulkPDF');

        const updateBulkActions = () => {
            const checkedCount = container.querySelectorAll('.band-song-checkbox-row:checked').length;
            selectedCountSpan.textContent = checkedCount;
            if (checkedCount > 0) {
                bulkActionsBar.style.display = 'flex';
            } else {
                bulkActionsBar.style.display = 'none';
            }
        };

        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                checkboxRows.forEach(cb => {
                    // Check logic based on display (filtered search results)
                    if (cb.closest('tr').style.display !== 'none') {
                        cb.checked = e.target.checked;
                    }
                });
                updateBulkActions();
            });
        }

        checkboxRows.forEach(cb => {
            cb.addEventListener('change', updateBulkActions);
        });

        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', async () => {
                const selectedIds = Array.from(container.querySelectorAll('.band-song-checkbox-row:checked')).map(cb => cb.value);
                if (selectedIds.length === 0) return;

                if (await UI.confirmDelete(`${selectedIds.length} Songs wirklich löschen?`)) {
                    UI.showLoading(`${selectedIds.length} Songs werden gelöscht...`);
                    try {
                        for (const id of selectedIds) {
                            await Storage.deleteSong(id);
                        }
                        UI.hideLoading();
                        UI.showToast(`${selectedIds.length} Songs gelöscht`, 'success');
                        await this.renderBandSongs(bandId);
                    } catch (error) {
                        UI.hideLoading();
                        console.error('Error deleting songs:', error);
                        UI.showToast('Fehler beim Löschen', 'error');
                    }
                }
            });
        }

        if (bulkPDFBtn) {
            bulkPDFBtn.addEventListener('click', () => {
                const selectedIds = Array.from(container.querySelectorAll('.band-song-checkbox-row:checked')).map(cb => cb.value);
                const selectedSongs = this.currentBandSongs.filter(s => selectedIds.includes(s.id));
                this.downloadSongListPDF(selectedSongs, `Ausgewählte Songs der Band ${bandName}`, 'Teil-Repertoire Export', true);
            });
        }

        // Add event listeners for edit/delete
        const attachSongListeners = () => {
            container.querySelectorAll('.edit-song').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    this.openSongModal(null, bandId, btn.dataset.id);
                });
            });

            container.querySelectorAll('.delete-song').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    const confirmed = await UI.confirmDelete('Möchtest du diesen Song wirklich löschen?');
                    if (confirmed) {
                        UI.showLoading('Song wird gelöscht...');
                        try {
                            await Storage.deleteSong(btn.dataset.id);
                            UI.hideLoading();
                            UI.showToast('Song gelöscht', 'success');
                            await this.renderBandSongs(bandId);
                        } catch (error) {
                            UI.hideLoading();
                            console.error('Error deleting song:', error);
                            UI.showToast('Fehler beim Löschen des Songs', 'error');
                        }
                    }
                });
            });
        };

        attachSongListeners();
    },

    async renderSongpoolView() {
        const container = document.getElementById('songpoolList');
        if (!container) return;

        const user = Auth.getCurrentUser();
        if (!user) return;
        const isAdmin = Auth.isAdmin();

        const showPublicSongs = this.getSongpoolShowPublicPreference();
        const previousSearchInput = document.getElementById('songpoolSongSearch');
        const searchInputValue = previousSearchInput?.value || '';
        const searchTerm = this.normalizeTextForSearch(searchInputValue);
        const shouldRestoreSearchFocus = document.activeElement === previousSearchInput;
        const previousSelectionStart = previousSearchInput?.selectionStart;
        const previousSelectionEnd = previousSearchInput?.selectionEnd;

        let songs = [];
        try {
            songs = await Storage.getSongpoolSongs(user.id, {
                includePublic: showPublicSongs
            });
        } catch (error) {
            console.error('[Songpool] View could not be rendered:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>Der Songpool konnte gerade nicht geladen werden.</p>
                    <p class="empty-state-note">${this.escapeHtml(error.message || 'Bitte prüfe die Verbindung oder richte zuerst die Songpool-Tabelle ein.')}</p>
                </div>
            `;
            return;
        }

        songs = (Array.isArray(songs) ? songs : []).map((song) => ({
            ...song,
            visibility: this.normalizeSongpoolVisibility(song.visibility),
            isOwner: String(song.createdBy) === String(user.id),
            canManage: isAdmin || String(song.createdBy) === String(user.id)
        }));

        if (searchTerm) {
            songs = songs.filter((song) =>
                this.normalizeTextForSearch(song.title).includes(searchTerm) ||
                this.normalizeTextForSearch(song.artist).includes(searchTerm) ||
                this.normalizeTextForSearch(Storage.getSongPlainInfo(song)).includes(searchTerm) ||
                this.normalizeTextForSearch(song.ccli).includes(searchTerm)
            );
        }

        if (this.songpoolSongSort.direction !== 'none') {
            const field = this.songpoolSongSort.field;
            const direction = this.songpoolSongSort.direction === 'asc' ? 1 : -1;

            songs.sort((left, right) => {
                let leftValue = left[field] || '';
                let rightValue = right[field] || '';

                if (field === 'bpm') {
                    leftValue = parseInt(leftValue, 10) || 0;
                    rightValue = parseInt(rightValue, 10) || 0;
                } else {
                    leftValue = String(leftValue || '').toLowerCase();
                    rightValue = String(rightValue || '').toLowerCase();
                }

                if (leftValue < rightValue) return -1 * direction;
                if (leftValue > rightValue) return 1 * direction;
                return 0;
            });
        }

        const ownSongCount = songs.filter((song) => song.isOwner).length;
        const sharedSongCount = songs.filter((song) => !song.isOwner && song.visibility === 'public').length;
        const countText = showPublicSongs && sharedSongCount > 0 
            ? `${ownSongCount} eigene, ${sharedSongCount} öffentliche` 
            : `${ownSongCount} Songs`;
        const description = `Dein zentraler Songpool mit PDF- und ChordPro-Import. (${countText})`;

        const getSortClass = (field) => {
            if (this.songpoolSongSort.field !== field) return '';
            return this.songpoolSongSort.direction === 'asc' ? 'sort-asc' : (this.songpoolSongSort.direction === 'desc' ? 'sort-desc' : '');
        };

        const getVisibilityBadge = (song) => {
            const isPublic = this.normalizeSongpoolVisibility(song.visibility) === 'public';
            const tooltipText = isPublic
                ? 'Öffentlich: Andere Bandmate-Nutzer können diesen Song sehen und in ihren Songpool übernehmen.'
                : 'Privat: Dieser Song ist nur für dich in deinem Songpool sichtbar.';
            const icon = isPublic
                ? `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
                        <circle cx="12" cy="12" r="3.2"></circle>
                    </svg>
                `
                : `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18"></path>
                        <path d="M10.6 5.2A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a16.4 16.4 0 0 1-3.5 4.3"></path>
                        <path d="M6.5 6.5A16.4 16.4 0 0 0 2 12s3.5 7 10 7a11.8 11.8 0 0 0 4.1-.7"></path>
                        <path d="M9.9 9.9A3.2 3.2 0 0 0 12 15.2"></path>
                    </svg>
                `;
            return `
                <span
                    class="songpool-visibility-badge ${isPublic ? 'is-public' : 'is-private'}"
                    title="${this.escapeHtml(tooltipText)}"
                    aria-label="${this.escapeHtml(tooltipText)}"
                >
                    <span class="songpool-visibility-icon">${icon}</span>
                    <span>${isPublic ? 'Öffentlich' : 'Privat'}</span>
                </span>
            `;
        };

        const getOwnershipBadge = (song) => {
            const isOwner = Boolean(song.isOwner);
            const label = isOwner ? 'Von dir' : 'Nicht von dir';
            const tooltipText = isOwner
                ? 'Diesen Song hast du selbst in deinen Songpool hochgeladen.'
                : 'Dieser Song stammt nicht aus deinem eigenen Upload.';

            return `
                <span
                    class="songpool-owner-badge ${isOwner ? 'is-owner' : 'is-shared'}"
                    title="${this.escapeHtml(tooltipText)}"
                    aria-label="${this.escapeHtml(tooltipText)}"
                >
                    ${this.escapeHtml(label)}
                </span>
            `;
        };

        const tableRows = songs.length > 0
            ? songs.map((song) => `
                <tr class="${song.isOwner ? '' : 'songpool-row-shared'}" style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: var(--spacing-sm); text-align: center;" data-label="Auswählen">
                        <input
                            type="checkbox"
                            class="songpool-song-checkbox-row"
                            value="${song.id}"
                            title="${song.canManage ? 'Song auswählen' : 'Für den Download auswählbar. Bearbeiten und Löschen bleiben gesperrt.'}"
                        >
                    </td>
                    <td class="band-setlist-actions-cell" style="padding: var(--spacing-sm); text-align: center;" data-label="Aktionen">
                        ${song.canManage ? `
                            <div style="display: flex; gap: 8px; justify-content: center;">
                                <button type="button" class="btn-icon edit-songpool-song" data-id="${song.id}" title="Bearbeiten" aria-label="Song bearbeiten">${this.getRundownInlineIcon('edit')}</button>
                                <button type="button" class="btn-icon delete-songpool-song" data-id="${song.id}" title="Löschen" aria-label="Song löschen">${this.getRundownInlineIcon('trash')}</button>
                            </div>
                        ` : `
                            <div
                                class="songpool-readonly-cell"
                                title="Dieser Song wurde nicht von dir erstellt. Du kannst nur eigene Songs bearbeiten oder löschen."
                                aria-label="Dieser Song wurde nicht von dir erstellt. Du kannst nur eigene Songs bearbeiten oder löschen."
                            >—</div>
                        `}
                    </td>
                    <td style="padding: var(--spacing-sm); text-align: center;" data-label="PDF">
                        ${this.renderSongDocumentPreviewButtons(song)}
                    </td>
                    <td style="padding: var(--spacing-sm);" data-label="Titel">
                        <div class="songpool-title-cell">
                            <div class="songpool-title-main">${this.escapeHtml(song.title)}</div>
                            <div class="songpool-title-meta">
                                ${getOwnershipBadge(song)}
                                ${this.renderSongpoolDocumentBadges(song)}
                            </div>
                        </div>
                    </td>
                    <td style="padding: var(--spacing-sm);" data-label="Interpret">${this.escapeHtml(song.artist || '-')}</td>
                    <td style="padding: var(--spacing-sm);" data-label="BPM">${song.bpm || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Time">${song.timeSignature || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Tonart">${song.key || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Genre">${this.escapeHtml(song.genre || '-')}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Sprache">${song.language || '-'}</td>
                    <td style="padding: var(--spacing-sm);" data-label="Sichtbar">${getVisibilityBadge(song)}</td>
                    <td style="padding: var(--spacing-sm); font-family: monospace; font-size: 0.9em;" data-label="CCLI">${song.ccli || '-'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="12" style="padding: var(--spacing-xl); text-align: center; color: var(--color-text-light);">${searchTerm ? 'Keine Songs gefunden.' : 'Noch keine Songs im Songpool.'}</td></tr>`;

        this.currentSongpoolSongs = songs;

        container.innerHTML = `
        <div class="band-setlist-workspace songpool-workspace">
            <div class="band-setlist-toolbar songpool-toolbar">
                <div class="band-setlist-toolbar-top">
                    <div class="band-setlist-titleblock">
                        <span class="band-setlist-kicker">Studio</span>
                        <div class="songpool-heading-row">
                            <h3>Songpool <span class="band-setlist-count">(${this.currentSongpoolSongs.length})</span></h3>
                            <button type="button" class="btn btn-secondary btn-sm songpool-help-button" onclick="UI.openModal('songpoolHelpModal')">
                                Was ist der Songpool?
                            </button>
                        </div>
                        <p class="band-setlist-description">${this.escapeHtml(description)}</p>
                    </div>
                    <div class="band-setlist-toolbar-actions">
                        <input type="file" id="songpoolFileUpload" accept=".pdf,.cho,.chordpro,.chopro,.pro,.crd,.txt,.cp,.chord,text/plain,application/pdf" multiple style="display: none;">
                        <button id="songpoolImportBtn" class="btn btn-secondary btn-sm" title="PDFs oder ChordPro-Dateien importieren">
                            <img src="images/pdf-download.png" class="btn-icon-img" alt="Import icon"><span class="btn-text-mobile-hide">PDF / ChordPro import</span>
                        </button>
                        <button id="addSongpoolSongBtn" class="btn btn-primary btn-sm">+ Song hinzufügen</button>
                    </div>
                </div>
                <div class="band-setlist-toolbar-main songpool-toolbar-main">
                    <div class="search-wrapper band-setlist-search">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="songpoolSongSearch" placeholder="Songpool durchsuchen..." class="modern-search-input" value="${this.escapeHtml(searchInputValue)}">
                    </div>
                    <div class="songpool-visibility-toggle">
                        <label class="toggle-switch" for="songpoolShowPublicToggle">
                            <input type="checkbox" id="songpoolShowPublicToggle"${showPublicSongs ? ' checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <label for="songpoolShowPublicToggle" class="toggle-label">Öffentliche Songs anzeigen</label>
                    </div>
                </div>
            </div>

            <div id="songpoolBulkActions" class="band-setlist-bulkbar" style="display: none;">
                <div class="band-setlist-bulkinfo">
                    <span class="band-setlist-bulk-label">Ausgewählt</span>
                    <strong id="songpoolSelectedCount">0</strong>
                </div>
                <div class="band-setlist-bulkactions">
                    <button id="songpoolBulkDelete" class="btn btn-danger btn-sm">Auswahl löschen</button>
                    <button id="songpoolBulkPDF" class="btn btn-secondary btn-sm">Auswahl herunterladen</button>
                </div>
            </div>

            <div class="band-setlist-table-wrap">
                <table class="songs-table band-setlist-table songpool-table" style="width: 100%; border-collapse: collapse; margin-top: var(--spacing-md);">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--color-border);">
                            <th style="padding: var(--spacing-sm); text-align: center; width: 40px;">
                                <input type="checkbox" id="selectAllSongpoolSongs">
                            </th>
                            <th style="padding: var(--spacing-sm); text-align: center; width: 108px;">Aktionen</th>
                            <th style="padding: var(--spacing-sm); text-align: center;">Dateien</th>
                            <th class="sortable-header sortable-col-title ${getSortClass('title')}" data-field="title" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Titel</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header sortable-col-artist ${getSortClass('artist')}" data-field="artist" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Interpret</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header sortable-col-bpm ${getSortClass('bpm')}" data-field="bpm" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">BPM</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header sortable-col-time ${getSortClass('timeSignature')}" data-field="timeSignature" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Time</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header sortable-col-key ${getSortClass('key')}" data-field="key" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Tonart</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header sortable-col-genre ${getSortClass('genre')}" data-field="genre" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Genre</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header sortable-col-language ${getSortClass('language')}" data-field="language" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Sprache</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header songpool-col-visibility ${getSortClass('visibility')}" data-field="visibility" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">Sichtbar</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                            <th class="sortable-header sortable-col-ccli ${getSortClass('ccli')}" data-field="ccli" style="padding: var(--spacing-sm); text-align: left; cursor: pointer;"><span class="sortable-header-content"><span class="sortable-header-label">CCLI</span><span class="sortable-header-icon" aria-hidden="true"></span></span></th>
                        </tr>
                    </thead>
                    <tbody id="songpoolTableBody">
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
        `;

        this.setupSongpoolHorizontalScroll(container);

        container.querySelectorAll('.sortable-header').forEach((header) => {
            header.addEventListener('click', () => {
                const field = header.dataset.field;
                if (this.songpoolSongSort.field === field) {
                    if (this.songpoolSongSort.direction === 'asc') this.songpoolSongSort.direction = 'desc';
                    else if (this.songpoolSongSort.direction === 'desc') this.songpoolSongSort.direction = 'none';
                    else this.songpoolSongSort.direction = 'asc';
                } else {
                    this.songpoolSongSort.field = field;
                    this.songpoolSongSort.direction = 'asc';
                }
                this.renderSongpoolView();
            });
        });

        const searchInput = document.getElementById('songpoolSongSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this.songpoolSearchTimeout);
                this.songpoolSearchTimeout = setTimeout(() => this.renderSongpoolView(), 250);
            });
            if (shouldRestoreSearchFocus) {
                searchInput.focus();
                const selectionStart = typeof previousSelectionStart === 'number'
                    ? Math.min(previousSelectionStart, searchInput.value.length)
                    : searchInput.value.length;
                const selectionEnd = typeof previousSelectionEnd === 'number'
                    ? Math.min(previousSelectionEnd, searchInput.value.length)
                    : searchInput.value.length;
                searchInput.setSelectionRange(selectionStart, selectionEnd);
            }
        }

        const publicToggle = document.getElementById('songpoolShowPublicToggle');
        if (publicToggle) {
            publicToggle.addEventListener('change', () => {
                this.setSongpoolShowPublicPreference(publicToggle.checked);
                this.renderSongpoolView();
            });
        }

        const importButton = document.getElementById('songpoolImportBtn');
        const fileInput = document.getElementById('songpoolFileUpload');
        if (importButton && fileInput) {
            importButton.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (event) => {
                await this.handleSongpoolUploadSelection(event);
            });
        }

        const addButton = document.getElementById('addSongpoolSongBtn');
        if (addButton) {
            addButton.addEventListener('click', () => {
                this.openSongpoolAddEntryModal();
            });
        }

        const checkboxRows = container.querySelectorAll('.songpool-song-checkbox-row');
        const selectAll = document.getElementById('selectAllSongpoolSongs');
        const bulkActionsBar = document.getElementById('songpoolBulkActions');
        const selectedCountSpan = document.getElementById('songpoolSelectedCount');
        const bulkDeleteBtn = document.getElementById('songpoolBulkDelete');
        const bulkPDFBtn = document.getElementById('songpoolBulkPDF');
        const songLookup = new Map((this.currentSongpoolSongs || []).map((song) => [String(song.id), song]));

        this.attachSongDocumentPreviewHandlers(container, songLookup);

        const getVisibleCheckboxes = () => Array.from(container.querySelectorAll('.songpool-song-checkbox-row'))
            .filter((checkbox) => checkbox.closest('tr')?.style.display !== 'none');

        const getSelectedSongIds = () => Array.from(container.querySelectorAll('.songpool-song-checkbox-row:checked'))
            .map((checkbox) => String(checkbox.value));

        const getSelectedSongs = () => getSelectedSongIds()
            .map((songId) => songLookup.get(songId))
            .filter(Boolean);

        const updateBulkActions = () => {
            const selectedSongs = getSelectedSongs();
            const checkedCount = selectedSongs.length;
            const deletableCount = selectedSongs.filter((song) => song.canManage).length;
            const visibleCheckboxes = getVisibleCheckboxes();
            const visibleCheckedCount = visibleCheckboxes.filter((checkbox) => checkbox.checked).length;

            selectedCountSpan.textContent = checkedCount;
            bulkActionsBar.style.display = checkedCount > 0 ? 'flex' : 'none';

            if (bulkDeleteBtn) {
                bulkDeleteBtn.disabled = deletableCount === 0;
                bulkDeleteBtn.title = deletableCount === 0
                    ? 'In deiner Auswahl ist kein Song, den du löschen darfst.'
                    : (
                        deletableCount < checkedCount
                            ? `${deletableCount} Song${deletableCount === 1 ? '' : 's'} aus deiner Auswahl ${deletableCount === 1 ? 'ist' : 'sind'} löschbar. Öffentliche Songs anderer Mitglieder bleiben erhalten.`
                            : ''
                    );
            }

            if (bulkPDFBtn) {
                bulkPDFBtn.disabled = checkedCount === 0;
                bulkPDFBtn.title = checkedCount === 0
                    ? 'Bitte wähle mindestens einen Song aus.'
                    : 'Lädt einen Anhang direkt herunter oder bündelt mehrere PDFs und ChordPro-Dateien als ZIP.';
            }

            if (selectAll) {
                selectAll.checked = visibleCheckboxes.length > 0 && visibleCheckedCount === visibleCheckboxes.length;
                selectAll.indeterminate = visibleCheckedCount > 0 && visibleCheckedCount < visibleCheckboxes.length;
            }
        };

        if (selectAll) {
            selectAll.addEventListener('change', (event) => {
                getVisibleCheckboxes().forEach((checkbox) => {
                    checkbox.checked = event.target.checked;
                });
                updateBulkActions();
            });
        }

        checkboxRows.forEach((checkbox) => {
            checkbox.addEventListener('change', updateBulkActions);
        });

        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', async () => {
                const selectedSongs = getSelectedSongs();
                if (selectedSongs.length === 0) return;

                const deletableSongs = selectedSongs.filter((song) => song.canManage);
                const skippedCount = selectedSongs.length - deletableSongs.length;

                if (deletableSongs.length === 0) {
                    UI.showToast('Du kannst nur eigene Songs aus dem Songpool löschen.', 'info');
                    return;
                }

                const confirmMessage = skippedCount > 0
                    ? `${deletableSongs.length} Song${deletableSongs.length === 1 ? '' : 's'} aus deiner Auswahl ${deletableSongs.length === 1 ? 'ist' : 'sind'} löschbar. ${skippedCount} öffentlicher Song${skippedCount === 1 ? '' : 's'} anderer Mitglieder ${skippedCount === 1 ? 'bleibt' : 'bleiben'} erhalten.`
                    : `${deletableSongs.length} Song${deletableSongs.length === 1 ? '' : 's'} aus deinem Songpool löschen?`;

                const confirmed = await UI.confirmAction(
                    confirmMessage,
                    'Wirklich löschen?',
                    'Löschen',
                    'btn-danger',
                    {
                        kicker: 'Songpool'
                    }
                );

                if (confirmed) {
                    if (bulkDeleteBtn.dataset.busy === 'true') return;
                    bulkDeleteBtn.dataset.busy = 'true';
                    bulkDeleteBtn.disabled = true;
                    try {
                        await this.deleteSongpoolSongsWithProgress(deletableSongs);
                        UI.showToast(
                            skippedCount > 0
                                ? `${deletableSongs.length} Song${deletableSongs.length === 1 ? '' : 's'} gelöscht, ${skippedCount} öffentlicher Song${skippedCount === 1 ? '' : 's'} ${skippedCount === 1 ? 'wurde' : 'wurden'} übersprungen`
                                : `${deletableSongs.length} Song${deletableSongs.length === 1 ? '' : 's'} gelöscht`,
                            skippedCount > 0 ? 'warning' : 'success'
                        );
                        await this.renderSongpoolView();
                    } catch (error) {
                        console.error('[Songpool] Bulk delete failed:', error);
                        UI.showToast(error.message || 'Fehler beim Löschen im Songpool', 'error');
                    } finally {
                        delete bulkDeleteBtn.dataset.busy;
                        updateBulkActions();
                    }
                }
            });
        }

        if (bulkPDFBtn) {
            bulkPDFBtn.addEventListener('click', async () => {
                const selectedSongs = getSelectedSongs();
                await this.downloadSongDocumentsBatch(selectedSongs);
            });
        }

        updateBulkActions();

        container.querySelectorAll('.edit-songpool-song').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.lastSongModalContext = {
                    origin: 'songpoolEdit',
                    collection: 'songpool_songs'
                };
                this.openSongModal(null, null, button.dataset.id);
            });
        });

        container.querySelectorAll('.delete-songpool-song').forEach((button) => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const confirmed = await UI.confirmDelete('Möchtest du diesen Song wirklich aus deinem Songpool löschen?');
                if (!confirmed) return;

                try {
                    const song = songLookup.get(String(button.dataset.id)) || { id: button.dataset.id };
                    await this.deleteSongpoolSongsWithProgress([song]);
                    UI.showToast('Song aus dem Songpool gelöscht', 'success');
                    await this.renderSongpoolView();
                } catch (error) {
                    console.error('[Songpool] Delete failed:', error);
                    UI.showToast(error.message || 'Fehler beim Löschen des Songpool-Songs', 'error');
                }
            });
        });
    },

    setupSongpoolHorizontalScroll(container) {
        if (typeof this.songpoolScrollCleanup === 'function') {
            this.songpoolScrollCleanup();
        }

        if (this.songpoolResizeObserver) {
            this.songpoolResizeObserver.disconnect();
            this.songpoolResizeObserver = null;
        }

        const scrollbarDock = document.getElementById('songpoolScrollbarDock');
        const topScrollbar = document.getElementById('songpoolScrollbar');
        const topScrollbarInner = document.getElementById('songpoolScrollbarInner');
        const tableWrap = container.querySelector('.band-setlist-table-wrap');
        const table = container.querySelector('.songpool-table');

        if (!scrollbarDock || !topScrollbar || !topScrollbarInner || !tableWrap || !table) return;

        let syncingScroll = false;

        const syncMetrics = () => {
            const contentWidth = Math.max(table.scrollWidth, table.offsetWidth, tableWrap.scrollWidth);
            const hasOverflow = contentWidth > tableWrap.clientWidth + 1;

            topScrollbarInner.style.width = `${contentWidth}px`;
            scrollbarDock.dataset.hasOverflow = hasOverflow ? 'true' : 'false';
            this.refreshSongpoolScrollbarDockVisibility();

            if (!hasOverflow) {
                topScrollbar.scrollLeft = 0;
                tableWrap.scrollLeft = 0;
                return;
            }

            if (Math.abs(topScrollbar.scrollLeft - tableWrap.scrollLeft) > 1) {
                topScrollbar.scrollLeft = tableWrap.scrollLeft;
            }
        };

        const onScrollbarScroll = () => {
            if (syncingScroll) return;
            syncingScroll = true;
            tableWrap.scrollLeft = topScrollbar.scrollLeft;
            requestAnimationFrame(() => {
                syncingScroll = false;
            });
        };

        const onTableScroll = () => {
            if (syncingScroll) return;
            syncingScroll = true;
            topScrollbar.scrollLeft = tableWrap.scrollLeft;
            requestAnimationFrame(() => {
                syncingScroll = false;
            });
        };

        topScrollbar.addEventListener('scroll', onScrollbarScroll, { passive: true });
        tableWrap.addEventListener('scroll', onTableScroll, { passive: true });

        if (typeof ResizeObserver !== 'undefined') {
            this.songpoolResizeObserver = new ResizeObserver(() => {
                syncMetrics();
            });
            this.songpoolResizeObserver.observe(tableWrap);
            this.songpoolResizeObserver.observe(table);
        }

        this.syncSongpoolScrollbarMetrics = syncMetrics;
        this.songpoolScrollCleanup = () => {
            topScrollbar.removeEventListener('scroll', onScrollbarScroll);
            tableWrap.removeEventListener('scroll', onTableScroll);
            if (this.songpoolResizeObserver) {
                this.songpoolResizeObserver.disconnect();
                this.songpoolResizeObserver = null;
            }
            scrollbarDock.dataset.hasOverflow = 'false';
            this.refreshSongpoolScrollbarDockVisibility();
            if (this.syncSongpoolScrollbarMetrics === syncMetrics) {
                this.syncSongpoolScrollbarMetrics = null;
            }
            this.songpoolScrollCleanup = null;
        };

        requestAnimationFrame(() => {
            syncMetrics();
            setTimeout(syncMetrics, 0);
        });
    },

    refreshSongpoolScrollbarDockVisibility() {
        const dock = document.getElementById('songpoolScrollbarDock');
        const songpoolView = document.getElementById('songpoolView');
        if (!dock || !songpoolView) return;

        const hasOverflow = dock.dataset.hasOverflow === 'true';
        const isActive = songpoolView.classList.contains('active');
        dock.classList.toggle('is-visible', hasOverflow && isActive);
    },

    setupBandSetlistHorizontalScroll(container) {
        const scrollbarDock = document.getElementById('bandSetlistScrollbarDock');
        const topScrollbar = document.getElementById('bandSetlistScrollbar');
        const topScrollbarInner = document.getElementById('bandSetlistScrollbarInner');
        const tableWrap = container.querySelector('.band-setlist-table-wrap');
        const table = container.querySelector('.band-setlist-table');

        if (!scrollbarDock || !topScrollbar || !topScrollbarInner || !tableWrap || !table) return;

        if (typeof this.bandSetlistScrollCleanup === 'function') {
            this.bandSetlistScrollCleanup();
        }

        if (this.bandSetlistResizeObserver) {
            this.bandSetlistResizeObserver.disconnect();
            this.bandSetlistResizeObserver = null;
        }

        let syncingScroll = false;

        const syncMetrics = () => {
            const contentWidth = Math.max(table.scrollWidth, table.offsetWidth, tableWrap.scrollWidth);
            const hasOverflow = contentWidth > tableWrap.clientWidth + 1;

            topScrollbarInner.style.width = `${contentWidth}px`;
            scrollbarDock.dataset.hasOverflow = hasOverflow ? 'true' : 'false';
            this.refreshBandSetlistScrollbarDockVisibility();

            if (!hasOverflow) {
                topScrollbar.scrollLeft = 0;
                tableWrap.scrollLeft = 0;
                return;
            }

            if (Math.abs(topScrollbar.scrollLeft - tableWrap.scrollLeft) > 1) {
                topScrollbar.scrollLeft = tableWrap.scrollLeft;
            }
        };

        const onScrollbarScroll = () => {
            if (syncingScroll) return;
            syncingScroll = true;
            tableWrap.scrollLeft = topScrollbar.scrollLeft;
            requestAnimationFrame(() => {
                syncingScroll = false;
            });
        };

        const onTableScroll = () => {
            if (syncingScroll) return;
            syncingScroll = true;
            topScrollbar.scrollLeft = tableWrap.scrollLeft;
            requestAnimationFrame(() => {
                syncingScroll = false;
            });
        };

        topScrollbar.addEventListener('scroll', onScrollbarScroll, { passive: true });
        tableWrap.addEventListener('scroll', onTableScroll, { passive: true });

        if (typeof ResizeObserver !== 'undefined') {
            this.bandSetlistResizeObserver = new ResizeObserver(() => {
                syncMetrics();
            });
            this.bandSetlistResizeObserver.observe(tableWrap);
            this.bandSetlistResizeObserver.observe(table);
        }

        this.syncBandSetlistScrollbarMetrics = syncMetrics;
        this.bandSetlistScrollCleanup = () => {
            topScrollbar.removeEventListener('scroll', onScrollbarScroll);
            tableWrap.removeEventListener('scroll', onTableScroll);
            if (this.bandSetlistResizeObserver) {
                this.bandSetlistResizeObserver.disconnect();
                this.bandSetlistResizeObserver = null;
            }
            scrollbarDock.dataset.hasOverflow = 'false';
            this.refreshBandSetlistScrollbarDockVisibility();
            if (this.syncBandSetlistScrollbarMetrics === syncMetrics) {
                this.syncBandSetlistScrollbarMetrics = null;
            }
            this.bandSetlistScrollCleanup = null;
        };

        requestAnimationFrame(() => {
            syncMetrics();
            setTimeout(syncMetrics, 0);
        });
    },

    refreshBandSetlistScrollbarDockVisibility() {
        const dock = document.getElementById('bandSetlistScrollbarDock');
        const setlistTab = document.getElementById('setlistTab');
        if (!dock || !setlistTab) return;

        const hasOverflow = dock.dataset.hasOverflow === 'true';
        const isSetlistActive = setlistTab.classList.contains('active');

        dock.classList.toggle('is-visible', hasOverflow && isSetlistActive);
    },

    async renderDraftEventSongs() {
        const container = document.getElementById('eventSongsList');
        if (!container) {
            await this.renderEventRundownEditor();
            return;
        }

        if (!this.draftEventSongIds || this.draftEventSongIds.length === 0) {
            container.innerHTML = '<div class="event-setlist-empty">Noch keine Songs für diesen Auftritt ausgewählt.</div>';
            await this.renderEventRundownEditor();
            return;
        }

        const songs = (await Promise.all(this.draftEventSongIds.map(id => Storage.getById('songs', id)))).filter(s => s);

        container.innerHTML = `
        <div class="event-setlist-workspace">
        <div class="event-setlist-table-wrap">
        <table class="songs-table band-setlist-table event-setlist-table">
            <thead>
                <tr>
                    <th style="text-align: center; width: 40px;">Pos.</th>
                    <th style="width: 30px;">#</th>
                    <th style="text-align: center; width: 108px;">Aktionen</th>
                    <th>Titel</th>
                    <th>Interpret</th>
                    <th style="text-align: center;">BPM</th>
                    <th style="text-align: center;">Time</th>
                    <th style="text-align: center;">Key</th>
                    <th style="text-align: center;">Orig.</th>
                    <th>Lead</th>
                    <th>Sprache</th>
                    <th>Tracks</th>
                    <th style="text-align: center;">Dateien</th>
                    <th>Infos</th>
                    <th>CCLI</th>
                </tr>
            </thead>
            <tbody id="draftEventSongsTableBody">
                ${songs.map((song, idx) => {
                    const draftSong = this.getDraftEventSong(song);
                    return `
                    <tr draggable="true" data-song-id="${song.id}">
                        <td class="drag-handle" data-label="Pos.">☰</td>
                        <td style="color: var(--color-text-muted);" data-label="#">${idx + 1}</td>
                        <td class="band-setlist-actions-cell event-setlist-actions-cell" style="text-align: center;" data-label="Aktionen">
                            <div class="event-setlist-actions">
                                <button type="button" class="btn-icon edit-draft-song" data-id="${song.id}" title="In Setlist bearbeiten" aria-label="Song in Setlist bearbeiten">${this.getRundownInlineIcon('edit')}</button>
                                <button type="button" class="btn-icon remove-draft-song" data-id="${song.id}" title="Entfernen" aria-label="Song aus der Setlist entfernen">${this.getRundownInlineIcon('trash')}</button>
                            </div>
                        </td>
                        <td class="event-setlist-title-cell" data-label="Titel">${this.escapeHtml(draftSong.title)}</td>
                        <td data-label="Interpret">${this.escapeHtml(draftSong.artist || '-')}</td>
                        <td style="text-align: center;" data-label="BPM">${draftSong.bpm || '-'}</td>
                        <td style="text-align: center;" data-label="Time">${draftSong.timeSignature || '-'}</td>
                        <td class="event-setlist-key-cell" style="text-align: center;" data-label="Key">${draftSong.key || '-'}</td>
                        <td style="text-align: center;" data-label="Orig.">${draftSong.originalKey || '-'}</td>
                        <td data-label="Lead">${draftSong.leadVocal || '-'}</td>
                        <td data-label="Sprache">${draftSong.language || '-'}</td>
                        <td data-label="Tracks">${draftSong.tracks === 'yes' ? 'Ja' : (draftSong.tracks === 'no' ? 'Nein' : '-')}</td>
                        <td style="text-align: center;" data-label="Dateien">
                            ${this.renderSongDocumentPreviewButtons(draftSong)}
                        </td>
                        <td data-label="Infos">${this.escapeHtml(this.getSongInfoDisplay(draftSong))}</td>
                        <td style="font-family: monospace;" data-label="CCLI">${draftSong.ccli || '-'}</td>
                    </tr>
                `;
                }).join('')}
            </tbody>
        </table>
            </div>
        </div>
`;
        this.attachSongDocumentPreviewHandlers(
            container,
            new Map(songs.map((song) => [String(song.id), this.getDraftEventSong(song)]))
        );
        await this.renderEventRundownEditor();

        // --- Drag and Drop Logic for Draft Songs ---
        const tbody = document.getElementById('draftEventSongsTableBody');
        let dragSrcEl = null;

        if (tbody) {
            const rows = tbody.querySelectorAll('tr[draggable="true"]');

            const handleDragStart = (e) => {
                dragSrcEl = e.currentTarget;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', e.currentTarget.dataset.songId);
                e.currentTarget.classList.add('dragging');
            };

            const handleDragOver = (e) => {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                e.dataTransfer.dropEffect = 'move';
                return false;
            };

            const handleDragEnter = (e) => {
                const targetRow = e.target.closest('tr');
                if (targetRow && targetRow !== dragSrcEl) {
                    targetRow.classList.add('drag-over');
                }
            };

            const handleDragLeave = (e) => {
                const targetRow = e.target.closest('tr');
                if (targetRow) {
                    targetRow.classList.remove('drag-over');
                }
            };

            const handleDrop = async (e) => {
                if (e.stopPropagation) {
                    e.stopPropagation();
                }
                const targetRow = e.target.closest('tr');
                // Remove visual feedback
                rows.forEach(row => {
                    row.classList.remove('dragging');
                    row.classList.remove('drag-over');
                });

                if (dragSrcEl !== targetRow && targetRow && targetRow.draggable) {
                    // Get current Order from Array
                    const srcId = dragSrcEl.dataset.songId;
                    const targetId = targetRow.dataset.songId;

                    const srcIndex = this.draftEventSongIds.indexOf(srcId);
                    const targetIndex = this.draftEventSongIds.indexOf(targetId);

                    if (srcIndex > -1 && targetIndex > -1) {
                        // Move element in array
                        this.draftEventSongIds.splice(srcIndex, 1);
                        this.draftEventSongIds.splice(targetIndex, 0, srcId);

                        // Re-render
                        this.renderDraftEventSongs();
                    }
                }
                return false;
            };

            rows.forEach(row => {
                row.addEventListener('dragstart', handleDragStart);
                row.addEventListener('dragenter', handleDragEnter);
                row.addEventListener('dragover', handleDragOver);
                row.addEventListener('dragleave', handleDragLeave);
                row.addEventListener('drop', handleDrop);
            });
        }

        container.querySelectorAll('.edit-draft-song').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.lastSongModalContext = {
                    origin: 'draftEventSong',
                    draftSongId: btn.dataset.id
                };
                await this.openSongModal(null, null, btn.dataset.id);
            });
        });

        container.querySelectorAll('.remove-draft-song').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent form submit if inside form
                const id = btn.dataset.id;
                this.draftEventSongIds = this.draftEventSongIds.filter(x => x !== id);
                if (this.draftEventSongOverrides && this.draftEventSongOverrides[id]) {
                    delete this.draftEventSongOverrides[id];
                }
                this.renderDraftEventSongs();
            });
        });

    },

    // Show authentication screen
    showAuth() {
        // Show landing page instead of modal
        const lPage = document.getElementById('landingPage');
        const mApp = document.getElementById('mainApp');
        this.clearAuthStatusNotice();
        this.clearPersistedNavigationState();

        if (!lPage) {
            window.location.href = SupabaseClient.buildProjectPageUrl('index.html');
            return;
        }

        if (lPage) {
            lPage.style.display = 'flex';
            lPage.classList.add('active');
        }
        if (mApp) {
            mApp.style.display = 'none';
            mApp.classList.remove('active');
        }

        document.body.classList.add('landing-active');
        document.documentElement.classList.add('landing-active-root');

        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.style.display = 'none';

        // FORCE REFLOW to ensure landing page is rendered correctly
        void document.body.offsetHeight;

        // Safety: Ensure auth overlay is closed by default
        if (typeof UI !== 'undefined' && UI.toggleAuthOverlay) {
            UI.toggleAuthOverlay(false);
        }

        const rememberCheckbox = document.getElementById('loginRememberMe');
        if (rememberCheckbox && typeof SupabaseClient !== 'undefined' && SupabaseClient.getRememberPreference) {
            rememberCheckbox.checked = SupabaseClient.getRememberPreference();
        }
    },

    getOnboardingDismissKey(userId) {
        return userId ? `bandmate.onboarding.dismissed.${userId}` : '';
    },

    async consumePostActivationOnboardingFlag() {
        const supabaseUser = typeof Auth !== 'undefined' && Auth.getSupabaseUser ? Auth.getSupabaseUser() : null;
        const currentUser = typeof Auth !== 'undefined' && Auth.getCurrentUser ? Auth.getCurrentUser() : null;
        const userId = currentUser?.id || supabaseUser?.id;
        if (!userId || !supabaseUser) return false;

        const metadata = supabaseUser.user_metadata || {};
        if (metadata.show_onboarding_after_activation !== true) {
            return false;
        }

        const dismissKey = this.getOnboardingDismissKey(userId);
        if (dismissKey && localStorage.getItem(dismissKey) === 'true') {
            return false;
        }

        if (dismissKey) {
            localStorage.setItem(dismissKey, 'true');
        }

        try {
            const sb = SupabaseClient.getClient();
            if (sb) {
                const { data, error } = await sb.auth.updateUser({
                    data: {
                        ...metadata,
                        show_onboarding_after_activation: false,
                        email_activation_completed: true,
                        requires_email_activation: true
                    }
                });
                if (!error && data?.user) {
                    Auth.supabaseUser = data.user;
                }
            }
        } catch (error) {
            console.warn('[App] Could not persist onboarding flag reset:', error);
        }

        return true;
    },

    // Show main application
    // Show main application
    async showApp() {
        // Hide landing page and show main app
        const landingPage = document.getElementById('landingPage');
        const mainApp = document.getElementById('mainApp');

        if (!mainApp) {
            window.location.href = SupabaseClient.buildProjectPageUrl('app.html');
            return;
        }

        if (landingPage) {
            landingPage.style.display = 'none';
            landingPage.classList.remove('active');
        }
        if (mainApp) {
            mainApp.style.display = 'block';
            mainApp.classList.add('active'); // Trigger CSS rules
        }

        document.body.classList.remove('landing-active');
        document.documentElement.classList.remove('landing-active-root');


        // iOS-specific: Force complete layout recalculation and viewport refresh
        if (window.Capacitor && window.Capacitor.getPlatform() === 'ios') {
            // Multiple forced reflows to ensure iOS WebView recalculates everything
            void document.documentElement.offsetHeight;
            void document.body.offsetHeight;
            if (mainApp) void mainApp.offsetHeight;

            // Force viewport meta refresh
            setTimeout(() => {
                const viewport = document.querySelector('meta[name="viewport"]');
                if (viewport) {
                    const content = viewport.getAttribute('content');
                    viewport.setAttribute('content', content);
                }
                // Final reflow
                void document.body.offsetHeight;
            }, 100);
        }

        // CRITICAL: Reset all navigation state for clean re-login
        // This ensures mobile nav works correctly after logout/login cycles
        const appNav = document.getElementById('appNav');
        if (appNav) {
            // Remove all active states
            appNav.querySelectorAll('.nav-item, .nav-subitem').forEach(item => {
                item.classList.remove('active');
            });
            // Close all open submenus
            appNav.querySelectorAll('.nav-group').forEach(group => {
                group.classList.remove('submenu-open', 'expanded');
            });
        }

        // Also reset sidebar states
        document.querySelectorAll('.sidebar-item, .sidebar-subitem').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll('.sidebar-group').forEach(group => {
            group.classList.remove('expanded');
        });

        // CRITICAL: Ensure scrolling is enabled on the body (fixes manual login/auto-login lock)
        document.body.classList.remove('modal-open');

        document.getElementById('app').style.display = 'flex';

        const user = Auth.getCurrentUser();
        document.getElementById('currentUserName').textContent = user.username || user.name;

        // Render header profile image
        this.renderProfileImageHeader(user);

        if (typeof Notifications !== 'undefined' && typeof Notifications.start === 'function') {
            Notifications.start().catch(error => {
                console.error('[App.showApp] Could not start notifications:', error);
            });
        }

        this.applyThemeMode(this.getResolvedThemeMode(), false);
        this.bindThemeControls();

        const isAdmin = Auth.isAdmin();

        // Absence Button (visible for all users)
        const absenceBtn = document.getElementById('absenceBtn');
        if (absenceBtn) {
            absenceBtn.style.display = 'inline-block';
            const newAbsenceBtn = absenceBtn.cloneNode(true);
            absenceBtn.parentNode.replaceChild(newAbsenceBtn, absenceBtn);

            newAbsenceBtn.addEventListener('click', async () => {
                await this.openAbsenceModal();
            });
        }

        // Settings Button (visible to all now)
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.style.display = 'inline-block';
            const newBtn = settingsBtn.cloneNode(true);
            settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);

            newBtn.addEventListener('click', async () => {
                await this.openSettingsModal();
            });
        }

        // Update sidebar profile
        this.updateSidebarProfile();

        // Run in background for faster login
        this.updateDashboard();
        await this.updateNavigationVisibility();
        await this.restoreLastAppState();

        const shouldOpenOnboarding = await this.consumePostActivationOnboardingFlag();
        if (shouldOpenOnboarding) {
            setTimeout(() => {
                UI.openModal('onboardingModal');
            }, 120);
        }

        // Ensure create news button visibility immediately after login (so admins/leaders see it without navigating)
        const createNewsBtnGlobal = document.getElementById('createNewsBtn');
        if (createNewsBtnGlobal) {
            // Run in background
            (async () => {
                const user = Auth.getCurrentUser();
                const canCreate = await this.canCurrentUserCreateNews(user);
                createNewsBtnGlobal.style.display = canCreate ? 'inline-flex' : 'none';
            })();
        }
        // Update unread news badge (background)
        this.updateNewsNavBadge();

        // Check for unread news and show banner (background)
        this.checkAndShowNewsBanner();
        // Check for new votes and show banner (background)
        this.checkAndShowVoteBanner();

        // Load calendar right after login so it is ready without manual refresh
        if (document.getElementById('tonstudioView')) {
            if (typeof Calendar !== 'undefined' && Calendar.loadCalendar) {
                Calendar.loadCalendar();
            }
        }

        if (typeof ChordProConverter !== 'undefined' && typeof ChordProConverter.loadBands === 'function') {
            ChordProConverter.loadBands().catch(err => {
                console.warn('[showApp] Could not pre-load ChordPro bands:', err);
            });
        }
    },

    getDonateInfoMessage() {
        return 'Diese Funktion ist in Kürze verfügbar. Vielen Dank für dein Interesse! 💖';
    },

    getValidatedDonateLink(rawLink) {
        if (typeof rawLink !== 'string') return '';
        const trimmedLink = rawLink.trim();
        if (!trimmedLink) return '';
        return /^https:\/\//i.test(trimmedLink) ? trimmedLink : '';
    },

    // Update navigation visibility based on band membership
    async updateNavigationVisibility() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const bands = await Storage.getUserBands(user.id);
        const hasBands = Array.isArray(bands) && bands.length > 0;

        // Hide/Show Rehearsals nav item. Events should always be visible.
        const eventsNav = document.querySelector('.nav-item[data-view="events"]');
        const rehearsalsNav = document.querySelector('.nav-item[data-view="rehearsals"]');

        if (eventsNav) eventsNav.style.display = 'flex';
        if (rehearsalsNav) rehearsalsNav.style.display = hasBands ? 'flex' : 'none';
    },

    // Open absence modal and render current user's absences
    async openAbsenceModal() {
        // Render existing absences
        await this.renderUserAbsences();
        UI.openModal('absenceModal');
    },

    // Open settings modal
    // Render Settings View
    async renderSettingsView() {
        const container = document.getElementById('settingsViewContent');
        if (!container) return;

        const user = Auth.getCurrentUser();
        const isAdmin = Auth.isAdmin();

        // Clone the settings modal content
        const modalBody = document.querySelector('#settingsModal .modal-body');
        if (modalBody) {
            container.innerHTML = modalBody.innerHTML;

            // Initialize dirty tracking for absences
            if (typeof window.isAbsenceFormDirty === 'undefined') {
                window.isAbsenceFormDirty = false;
            }

            // Re-initialize all event listeners for the cloned content
            await this.initializeSettingsViewListeners(isAdmin);
        }
    },

    async initializeSettingsViewListeners(isAdmin, rootElement = null) {
        const user = Auth.getCurrentUser();
        const root = rootElement || document.getElementById('settingsViewContent');
        // Fallback to settingsModal body if settingsViewContent is missing
        const effectiveRoot = root || document.querySelector('#settingsModal .modal-body');

        if (!effectiveRoot) {
            console.error('Settings view root element not found!');
            return;
        }

        // Only attach event listeners once
        if (!effectiveRoot.dataset.listenersAttached) {
            // Re-attach event listeners to settings tab buttons (scoped)
            effectiveRoot.querySelectorAll('.settings-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabName = btn.dataset.tab;
                    this.switchSettingsTab(tabName);
                });
            });
            effectiveRoot.dataset.listenersAttached = 'true';
        }

        // Always update logic below (visibility, values, re-rendering lists)
        // Admin Tab Visibility
        const adminTab = effectiveRoot.querySelector('#settingsTabAdmin');
        if (adminTab) {
            adminTab.style.display = isAdmin ? 'flex' : 'none';
        }

        // Refresh button for feedback
        const refreshFeedbackBtn = effectiveRoot.querySelector('#refreshFeedbackBtn');
        if (refreshFeedbackBtn) {
            refreshFeedbackBtn.onclick = (e) => {
                e.preventDefault();
                this.loadAdminFeedback();
            };
        }

        // Donate Link (Admin only)
        const donateLinkSection = effectiveRoot.querySelector('#donateLinkSection');
        if (donateLinkSection) donateLinkSection.style.display = isAdmin ? 'block' : 'none';

        // Pre-fill profile form (scoped)
        const profileFirstName = effectiveRoot.querySelector('#profileFirstName');
        const profileLastName = effectiveRoot.querySelector('#profileLastName');
        const profileUsername = effectiveRoot.querySelector('#profileUsername');
        const profileEmail = effectiveRoot.querySelector('#profileEmail');
        const profileInstrument = effectiveRoot.querySelector('#profileInstrument');
        const profilePassword = effectiveRoot.querySelector('#profilePassword');
        const profilePasswordConfirm = effectiveRoot.querySelector('#profilePasswordConfirm');
        const profilePasswordConfirmGroup = effectiveRoot.querySelector('#profilePasswordConfirmGroup');
        const profilePasswordHint = effectiveRoot.querySelector('#profilePasswordHint');
        const profilePasswordConfirmHint = effectiveRoot.querySelector('#profilePasswordConfirmHint');
        const profileDisplayNamePreview = effectiveRoot.querySelector('#profileDisplayNamePreview');

        const updateSettingsProfileNamePreview = () => {
            if (!profileDisplayNamePreview) return;

            const firstName = (profileFirstName?.value || '').trim();
            const lastName = (profileLastName?.value || '').trim();
            const usernameValue = (profileUsername?.value || user.username || '').trim();
            const displayName = `${firstName} ${lastName}`.trim() || usernameValue || 'Dein Profil';
            profileDisplayNamePreview.textContent = displayName;
        };

        const profileIcalUrl = effectiveRoot.querySelector('#profileIcalUrl');
        const profileColorRehearsal = effectiveRoot.querySelector('#profileColorRehearsal');
        const profileColorEvent = effectiveRoot.querySelector('#profileColorEvent');
        const profileColorAbsence = effectiveRoot.querySelector('#profileColorAbsence');
        const profileColorExternal = effectiveRoot.querySelector('#profileColorExternal');

        if (profileFirstName) profileFirstName.value = user.first_name || '';
        if (profileLastName) profileLastName.value = user.last_name || '';
        if (profileUsername) profileUsername.value = user.username || '';
        if (profileEmail) profileEmail.value = user.email || '';
        if (profileColorRehearsal) profileColorRehearsal.value = user.color_rehearsal || '#3b82f6';
        if (profileColorEvent) profileColorEvent.value = user.color_event || '#8b5cf6';
        if (profileColorAbsence) profileColorAbsence.value = user.color_absence || '#f59e0b';
        if (profileColorExternal) profileColorExternal.value = user.color_external_event || '#64748b';

        // --- Multi-Calendar Management ---
        const externalCalendarsList = effectiveRoot.querySelector('#externalCalendarsList');
        const btnAddCalendar = effectiveRoot.querySelector('#btnAddCalendar');

        const showExternalCalendarVisibilityInfo = async () => {
            return UI.confirmAction(
                'Wenn du die Sichtbarkeit aktivierst, sehen Leiter und Co-Leiter deiner Bands bei Proben und Auftritten nur, dass in diesem Zeitraum ein externer Kalendereintrag existiert. Titel, Ort und Inhalt des Termins bleiben verborgen.',
                'Kalender für die Bandplanung freigeben?',
                'Freigeben',
                'btn-primary',
                {
                    kicker: 'Kalenderfreigabe',
                    cancelText: 'Abbrechen'
                }
            );
        };

        const renderCalendarRow = (calendar = { name: '', url: '', share_for_band_planning: false }) => {
            if (!externalCalendarsList) return null;

            const rowId = `cal_${Math.random().toString(36).slice(2, 11)}`;
            const toggleId = `${rowId}_share`;
            const isVisibleForLeads = Boolean(calendar.share_for_band_planning ?? calendar.shareForBandPlanning);
            const row = document.createElement('div');
            row.className = 'external-calendar-row';
            row.dataset.calendarId = calendar.id ? String(calendar.id) : '';

            row.innerHTML = `
                <label class="external-calendar-visibility" for="${toggleId}">
                    <span class="toggle-switch">
                        <input
                            type="checkbox"
                            class="calendar-share-toggle-input"
                            id="${toggleId}"
                            ${isVisibleForLeads ? 'checked' : ''}
                        >
                        <span class="toggle-slider"></span>
                    </span>
                    <span class="external-calendar-visibility-copy">
                        <span class="external-calendar-visibility-title">Für Leiter sichtbar</span>
                        <span class="external-calendar-visibility-note">Zeigt bei der Planung nur blockierte Zeiten</span>
                    </span>
                </label>
                <div class="external-calendar-field">
                    <input
                        type="text"
                        class="profile-form-input calendar-name"
                        placeholder="Name (z.B. Privat)"
                        value="${this.escapeHtmlAttr(calendar.name || '')}"
                    >
                    <span class="external-calendar-field-hint">Name des Kalenders</span>
                </div>
                <div class="external-calendar-field external-calendar-field-url">
                    <input
                        type="url"
                        class="profile-form-input calendar-url"
                        placeholder="https://..."
                        value="${this.escapeHtmlAttr(calendar.url || '')}"
                    >
                    <span class="external-calendar-field-hint">iCal- oder Webcal-Link</span>
                </div>
                <button type="button" class="btn btn-icon btn-sm external-calendar-delete" title="Kalender entfernen" aria-label="Kalender entfernen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
            `;

            const shareToggle = row.querySelector('.calendar-share-toggle-input');
            const deleteButton = row.querySelector('.external-calendar-delete');

            if (shareToggle) {
                shareToggle.addEventListener('change', async () => {
                    if (!shareToggle.checked) return;

                    const approved = await showExternalCalendarVisibilityInfo();
                    if (!approved) {
                        shareToggle.checked = false;
                        return;
                    }

                    UI.showToast('Kalender wird bei der nächsten Speicherung für die Bandplanung freigegeben.', 'info', 7000);
                });
            }

            if (deleteButton) {
                deleteButton.addEventListener('click', () => {
                    row.remove();
                });
            }

            externalCalendarsList.appendChild(row);
            return row;
        };

        if (btnAddCalendar) {
            btnAddCalendar.onclick = () => {
                const currentRows = externalCalendarsList.querySelectorAll('.external-calendar-row');
                if (currentRows.length >= 10) {
                    UI.showToast('Maximal 10 Kalender können synchronisiert werden.', 'warning');
                    return;
                }
                renderCalendarRow();
            };
        }

        // Fetch existing calendars
        const loadUserCalendars = async () => {
            if (externalCalendarsList) externalCalendarsList.innerHTML = '';
            try {
                const calendars = await Storage.get('external_calendars', { user_id: user.id });
                if (calendars && calendars.length > 0) {
                    calendars.forEach(cal => renderCalendarRow(cal));
                } else if (user.personal_ical_url) {
                    // Migration: If user has old single URL, show it as first item
                    renderCalendarRow({ name: 'Hauptkalender', url: user.personal_ical_url });
                }
            } catch (error) {
                console.error('Error loading external calendars:', error);
            }
        };
        loadUserCalendars();

        // if (profileInstrument) profileInstrument.value = user.instrument || ''; // Handled by setupInstrumentSelector
        if (profilePassword) profilePassword.value = '';

        // Initialize Instrument Selector for Profile
        // Delay slightly to ensure DOM is ready if cloned
        setTimeout(() => {
            this.setupInstrumentSelector('profileInstrumentSelector', 'profileInstrument', user.instrument || '');
        }, 0);

        // Update profile display name preview
        updateSettingsProfileNamePreview();

        // Continue with existing logic...

        const updateProfilePasswordHint = () => {
            if (!profilePassword) return;

            const password = profilePassword.value || '';
            if (profilePasswordHint) {
                profilePasswordHint.classList.remove('is-warning', 'is-success');

                if (!password) {
                    profilePasswordHint.textContent = 'Mindestens 6 Zeichen erforderlich';
                } else if (password.length < 6) {
                    profilePasswordHint.textContent = 'Passwort muss mindestens 6 Zeichen haben';
                    profilePasswordHint.classList.add('is-warning');
                } else {
                    profilePasswordHint.textContent = '✓ Länge ok';
                    profilePasswordHint.classList.add('is-success');
                }
            }

            if (profilePasswordConfirmHint && profilePasswordConfirm) {
                const passwordConfirm = profilePasswordConfirm.value || '';
                profilePasswordConfirmHint.classList.remove('is-warning', 'is-success');

                if (!password && !passwordConfirm) {
                    profilePasswordConfirmHint.textContent = 'Passwörter müssen übereinstimmen';
                } else if (!passwordConfirm) {
                    profilePasswordConfirmHint.textContent = 'Bitte bestätige dein Passwort';
                } else if (password === passwordConfirm) {
                    profilePasswordConfirmHint.textContent = '✓ Passwörter stimmen überein';
                    profilePasswordConfirmHint.classList.add('is-success');
                } else {
                    profilePasswordConfirmHint.textContent = 'Passwörter stimmen nicht überein';
                    profilePasswordConfirmHint.classList.add('is-warning');
                }
            }
        };

        // Password confirmation field toggle
        if (profilePassword && profilePasswordConfirmGroup && !profilePassword.dataset.confirmToggleAttached) {
            profilePassword.addEventListener('input', () => {
                if (profilePassword.value.trim()) {
                    if (profilePasswordConfirm) profilePasswordConfirm.required = true;
                } else {
                    if (profilePasswordConfirm) profilePasswordConfirm.required = false;
                    if (profilePasswordConfirm) profilePasswordConfirm.value = '';
                }

                updateProfilePasswordHint();
            });
            profilePassword.dataset.confirmToggleAttached = 'true';
        }

        if (profilePasswordConfirm && !profilePasswordConfirm.dataset.matchHintAttached) {
            profilePasswordConfirm.addEventListener('input', updateProfilePasswordHint);
            profilePasswordConfirm.dataset.matchHintAttached = 'true';
        }

        updateProfilePasswordHint();

        // Default to profile tab
        this.switchSettingsTab('profile');


        // Account delete button (scoped to settings view)
        this.bindDeleteAccountButton(effectiveRoot);

        // Donate link (scoped)
        const donateLinkInput = effectiveRoot.querySelector('#donateLink');
        const saveDonateBtn = effectiveRoot.querySelector('#saveDonateLink');
        if (donateLinkInput && saveDonateBtn) {
            // Lade gespeicherten Link aus Supabase
            const savedLink = await Storage.getSetting('donateLink');
            if (savedLink) {
                donateLinkInput.value = savedLink;
            }
            saveDonateBtn.addEventListener('click', async () => {
                const link = donateLinkInput.value.trim();
                const normalizedLink = this.getValidatedDonateLink(link);

                if (link && !normalizedLink) {
                    UI.showToast('Bitte hinterlege einen gültigen https-Link für den Spenden-Button.', 'error');
                    return;
                }

                try {
                    await Storage.setSetting('donateLink', normalizedLink);
                    donateLinkInput.value = normalizedLink;
                    if (normalizedLink) {
                        UI.showToast('Spenden-Link gespeichert!', 'success');
                    } else {
                        UI.showToast('Spenden-Link entfernt', 'info');
                    }
                    await this.updateDonateButton();
                } catch (error) {
                    console.error('Error saving donate link:', error);
                    UI.showToast('Fehler beim Speichern: ' + error.message, 'error');
                }
            });
        }

        // Profile form in settings view (scoped)
        const updateProfileForm = effectiveRoot.querySelector('#updateProfileForm');
        if (updateProfileForm && !updateProfileForm.dataset.submitHandlerAttached) {
            updateProfileForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const submitBtn = updateProfileForm.querySelector('button[type="submit"]');
                // Ensure we don't capture the loading state if button was already stuck
                let originalBtnText = submitBtn ? submitBtn.innerHTML : 'Speichern';
                if (originalBtnText.includes('spinner-border') || originalBtnText.includes('Speichern...')) {
                    originalBtnText = 'Speichern';
                }

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Speichern...';
                }

                try {

                    const firstName = (effectiveRoot.querySelector('#profileFirstName') || {}).value;
                    const lastName = (effectiveRoot.querySelector('#profileLastName') || {}).value;
                    const username = (effectiveRoot.querySelector('#profileUsername') || {}).value;
                    const email = (effectiveRoot.querySelector('#profileEmail') || {}).value;
                    const instrument = (effectiveRoot.querySelector('#profileInstrument') || {}).value;
                    const password = (effectiveRoot.querySelector('#profilePassword') || {}).value;
                    const passwordConfirm = (effectiveRoot.querySelector('#profilePasswordConfirm') || {}).value;

                    // Validate password confirmation
                    if (password && password.trim() !== '') {
                        if (password.length < 6) {
                            UI.showToast('Passwort muss mindestens 6 Zeichen haben', 'error');
                            return;
                        }
                        if (password !== passwordConfirm) {
                            UI.showToast('Passwörter stimmen nicht überein', 'error');
                            return;
                        }
                    }

                    UI.showLoading('Profil wird aktualisiert...');


                    // Update in users table
                    const updates = {
                        first_name: firstName,
                        last_name: lastName,
                        username,
                        email,
                        instrument,
                        color_rehearsal: (effectiveRoot.querySelector('#profileColorRehearsal') || {}).value || '#3b82f6',
                        color_event: (effectiveRoot.querySelector('#profileColorEvent') || {}).value || '#8b5cf6',
                        color_absence: (effectiveRoot.querySelector('#profileColorAbsence') || {}).value || '#f59e0b',
                        color_external_event: (effectiveRoot.querySelector('#profileColorExternal') || {}).value || '#64748b'
                    };

                    // Extract multiple calendars
                    const calendarRows = effectiveRoot.querySelectorAll('.external-calendar-row');
                    const externalCalendars = Array.from(calendarRows).map(row => ({
                        name: (row.querySelector('.calendar-name') || {}).value || '',
                        url: (row.querySelector('.calendar-url') || {}).value || '',
                        share_for_band_planning: Boolean((row.querySelector('.calendar-share-toggle-input') || {}).checked),
                        user_id: user.id
                    })).filter(cal => cal.url.trim() !== '');

                    // We'll handle saving these after the main update

                    const { previousImageUrl } = await this.applyProfileImageUpdate(user, updates);

                    Logger.action('Update Profile', updates);

                    if (password && password.trim() !== '') {
                        updates.password = password;
                    }

                    const updateResult = await Storage.updateUser(user.id, updates);

                    // Update External Calendars Table + sanitized busy slots
                    const sb = SupabaseClient.getClient();
                    try {
                        const { error: deleteCalendarError } = await sb
                            .from('external_calendars')
                            .delete()
                            .eq('user_id', user.id);

                        if (deleteCalendarError) {
                            throw deleteCalendarError;
                        }

                        let savedExternalCalendars = [];
                        if (externalCalendars.length > 0) {
                            const { data: insertedCalendars, error: insertCalendarError } = await sb
                                .from('external_calendars')
                                .insert(externalCalendars)
                                .select('*');

                            if (insertCalendarError) {
                                throw insertCalendarError;
                            }

                            savedExternalCalendars = insertedCalendars || [];
                        }

                        await Storage.syncSharedExternalCalendarBusySlots(user.id, savedExternalCalendars);
                    } catch (error) {
                        console.error('Error updating external calendars records:', error);
                        throw new Error(Storage._getExternalCalendarSharingErrorMessage(
                            error,
                            'Externe Kalender konnten nicht gespeichert werden.'
                        ));
                    }


                    // Update email in Supabase Auth if changed
                    if (email !== user.email) {
                        const sb = SupabaseClient.getClient();
                        const { error } = await sb.auth.updateUser({ email });
                        if (error) {
                            console.error('Error updating auth email:', error);
                            UI.showToast('Hinweis: E-Mail für Login konnte nicht geändert werden.', 'warning');
                        }
                    }

                    // Update password in Supabase Auth if provided
                    if (password && password.trim() !== '') {
                        const sb = SupabaseClient.getClient();
                        const { error } = await sb.auth.updateUser({ password });
                        if (error) {
                            console.error('Error updating password:', error);
                        }
                    }

                    // Update current session user data
                    await Auth.updateCurrentUser();
                    const updatedUser = {
                        ...(Auth.getCurrentUser() || user),
                        ...updates,
                        id: user.id
                    };
                    Auth.currentUser = updatedUser;
                    Logger.info('Profile Updated');

                    // Clear Personal Calendar Cache (partial reset) to force refresh without breaking clicks
                    if (typeof PersonalCalendar !== 'undefined' && typeof PersonalCalendar.clearCache === 'function') {
                        PersonalCalendar.clearCache(false);
                        console.log('[App] PersonalCalendar marked for refresh after profile update');
                    }

                    // Update header
                    const currentUserElem = document.getElementById('currentUserName');
                    if (currentUserElem) currentUserElem.textContent = updatedUser.username;
                    this.renderProfileImageHeader(updatedUser);

                    // Update Dashboard Welcome Message immediately
                    const welcomeUserName = document.getElementById('welcomeUserName');
                    if (welcomeUserName) {
                        welcomeUserName.textContent = updatedUser.first_name || updatedUser.username || 'Musiker';
                    }

                    // Trigger immediate UI refresh if calendar is active
                    if (typeof PersonalCalendar !== 'undefined' && typeof PersonalCalendar.renderCalendar === 'function') {
                        const calendarView = document.getElementById('kalenderView');
                        if (calendarView && !calendarView.hidden) {
                            PersonalCalendar.renderCalendar();
                        }
                    }

                    // Clear password field (scoped to settings view)
                    const pwdEl = effectiveRoot.querySelector('#profilePassword');
                    const pwdConfirmEl = effectiveRoot.querySelector('#profilePasswordConfirm');
                    if (pwdEl) pwdEl.value = '';
                    if (pwdConfirmEl) pwdConfirmEl.value = '';
                    updateProfilePasswordHint();

                    // Reload form with updated values (scoped)
                    const usernameEl = effectiveRoot.querySelector('#profileUsername');
                    const emailEl = effectiveRoot.querySelector('#profileEmail');
                    const instrumentEl = effectiveRoot.querySelector('#profileInstrument');
                    if (usernameEl) usernameEl.value = updatedUser.username;
                    if (emailEl) emailEl.value = updatedUser.email;
                    if (instrumentEl) instrumentEl.value = updatedUser.instrument || '';

                    updateSettingsProfileNamePreview();

                    const savedImageInput = effectiveRoot.querySelector('#profileImageInput');
                    if (savedImageInput) {
                        savedImageInput.value = '';
                    }

                    if (previousImageUrl && previousImageUrl !== updates.profile_image_url) {
                        await this.removeStoredProfileImage(previousImageUrl);
                    }

                    this.resetProfileImageDraftState();
                    UI.showToast('Profil erfolgreich aktualisiert!', 'success');
                    window.isProfileDirty = false;

                    // Render updated profile image
                    this.renderProfileImageSettings(updatedUser);
                } catch (error) {
                    console.error('Error updating profile:', error);
                    UI.showToast('Fehler beim Aktualisieren: ' + error.message, 'error');
                } finally {
                    // Re-query button to be safe
                    const btn = updateProfileForm ? updateProfileForm.querySelector('button[type="submit"]') : null;
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = originalBtnText;
                    }
                    UI.hideLoading();
                }
            });
            updateProfileForm.dataset.submitHandlerAttached = 'true';
        }

        if (isAdmin) {
            this.loadAdminFeedback();
            this.renderLocationsList();
            this.renderCalendarsList();
            this.renderAllBandsList();
            this.renderUsersList();
        }

        this.resetProfileImageDraftState({ resetInput: true, root: effectiveRoot });
        this.bindProfileImageDraftHandlers(effectiveRoot, user);

        // Render profile image initially
        this.renderProfileImageSettings(user);

        // Setup absences form in settings
        const absenceFormSettings = effectiveRoot.querySelector('#createAbsenceFormSettings');
        if (absenceFormSettings && !absenceFormSettings._bound) {
            absenceFormSettings.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleCreateAbsenceFromSettings();
            });
            absenceFormSettings._bound = true;
        }
        this.setupAbsenceSettingsControls();

        // Always render absences list when settings open
        this.renderAbsencesListSettings();

        // Create location form (scoped to settings view)
        const createLocationForm = effectiveRoot.querySelector('#createLocationForm');
        if (createLocationForm) {
            // Clone to remove all old event listeners
            const newForm = createLocationForm.cloneNode(true);
            createLocationForm.parentNode.replaceChild(newForm, createLocationForm);

            newForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleCreateLocation();
            });
        }

        // Edit location form (GLOBAL modal, not scoped)
        const editLocationForm = document.querySelector('#editLocationForm');
        if (editLocationForm) {
            // Clone to remove all old event listeners
            const newEditForm = editLocationForm.cloneNode(true);
            editLocationForm.parentNode.replaceChild(newEditForm, editLocationForm);

            newEditForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleEditLocation();
            });
        }

        // Calendar form event listeners (only register once)
        if (!this._calendarListenersRegistered) {


            const calendarForm = document.getElementById('calendarForm');
            if (calendarForm) {
                calendarForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await App.handleCalendarForm();
                }, { once: false }); // Allow multiple submissions
            }

            const quickAddCalendarForm = document.getElementById('quickAddCalendarForm');
            if (quickAddCalendarForm) {
                quickAddCalendarForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await App.handleQuickAddCalendarForm();
                }, { once: false });
            }

            const addCalendarBtn = document.getElementById('addCalendarBtn');
            if (addCalendarBtn) {
                addCalendarBtn.addEventListener('click', async () => {
                    await App.openCalendarModal();
                });
            }

            this._calendarListenersRegistered = true;

        }

        // Render absences list in settings
        this.renderAbsencesListSettings();

    },

    async loadAdminFeedback() {
        const list = document.getElementById('adminFeedbackList');
        if (!list) return;

        list.innerHTML = '<div class="loader">Daten werden geladen...</div>';

        try {
            const feedbacks = await FeedbackService.getAllFeedback();

            const badge = document.getElementById('adminFeedbackCount');
            if (badge) badge.textContent = feedbacks ? feedbacks.length : 0;

            if (!feedbacks || feedbacks.length === 0) {
                list.innerHTML = '<div class="empty-state">Aktuell keine Einträge vorhanden.</div>';
                return;
            }

            // Split items
            const openItems = feedbacks.filter(i => i.status !== 'resolved');
            const resolvedItems = feedbacks.filter(i => i.status === 'resolved');

            let html = '';

            // Section: Open
            html += `<h4 class="admin-sub-header">
    Offene Tickets <span class="badge bg-primary">${openItems.length}</span>
                     </h4>`;

            if (openItems.length === 0) {
                html += '<div class="user-no-bands">Alles erledigt! 🎉</div>';
            } else {
                html += '<div class="feedback-grid">';
                openItems.forEach(item => html += this._renderFeedbackCard(item));
                html += '</div>';
            }

            // Section: Resolved
            if (resolvedItems.length > 0) {
                html += `<h4 class="admin-sub-header secondary">
    Archiv / Erledigt <span class="badge bg-secondary">${resolvedItems.length}</span>
                         </h4>`;
                html += '<div class="feedback-grid resolved">';
                resolvedItems.forEach(item => html += this._renderFeedbackCard(item));
                html += '</div>';
            }

            list.innerHTML = html;

            // Attach listeners
            // 1. Resolve Buttons
            list.querySelectorAll('.resolve-feedback-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const confirm = await UI.confirmAction(
                        'Ticket als erledigt markieren?',
                        'Ticket schließen',
                        'Ja, erledigt',
                        'btn-success'
                    );

                    if (!confirm) return;

                    try {
                        await FeedbackService.updateStatus(id, 'resolved');
                        UI.showToast('Ticket als erledigt markiert', 'success');
                        this.loadAdminFeedback();
                    } catch (err) {
                        UI.showToast('Fehler: ' + err.message, 'error');
                    }
                };
            });

            // 1.5 Delete Buttons
            list.querySelectorAll('.delete-feedback-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const confirm = await UI.confirmAction(
                        'Ticket unwiderruflich löschen?',
                        'Ticket löschen',
                        'Ja, löschen',
                        'btn-danger'
                    );

                    if (!confirm) return;

                    try {
                        await FeedbackService.deleteFeedback(id);
                        UI.showToast('Ticket gelöscht', 'success');
                        this.loadAdminFeedback();
                    } catch (err) {
                        UI.showToast('Fehler: ' + err.message, 'error');
                    }
                };
            });

            // 2. Expansion
            list.querySelectorAll('.feedback-card').forEach(card => {
                card.onclick = (e) => {
                    if (window.getSelection().toString().length > 0 || e.target.closest('button')) return;
                    const isExpanded = card.getAttribute('data-expanded') === 'true';
                    card.setAttribute('data-expanded', !isExpanded);
                };
            });

        } catch (err) {
            console.error(err);
            list.innerHTML = `<div class="error-state" style="color:red">Fehler: ${err.message}</div>`;
        }
    },

    _renderFeedbackCard(item) {
        const isBug = item.type === 'bug';
        const userLabel = item.users ?
            (item.users.first_name + ' ' + item.users.last_name) :
            'Unbekannter User';
        const initials = item.users ?
            ((item.users.first_name?.[0] || '') + (item.users.last_name?.[0] || '')).toUpperCase() || item.users.username[0].toUpperCase() :
            '?';

        const date = new Date(item.created_at);
        const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        const badgeColor = isBug ? '#ef4444' : '#3b82f6';
        const badgeIcon = isBug
            ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v10M8.5 9.5 6 7M15.5 9.5 18 7M8 13H5M19 13h-3M8.5 16.5 6 19M15.5 16.5 18 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 7.5a3 3 0 1 1 6 0M8 10.5c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v4.5a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M8.5 14.5A5.5 5.5 0 1 1 15.5 14.5c-.8.7-1.3 1.3-1.5 2.5h-4c-.2-1.2-.7-1.8-1.5-2.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
        const badgeLabel = isBug ? 'Bug Report' : 'Feedback';

        const isResolved = item.status === 'resolved';

        return `
            <div class="feedback-card" data-expanded="false" data-id="${item.id}">
                <div class="feedback-card-accent" style="background: ${badgeColor};"></div>

                <div class="feedback-card-header">
                    <div class="feedback-badge-row">
                        <span class="feedback-badge" style="background: ${badgeColor}20; color: ${badgeColor};">
                            ${badgeIcon}<span>${badgeLabel.toUpperCase()}</span>
                        </span>
                        <span class="feedback-date">${dateStr} • ${timeStr}</span>
                    </div>
                    <div class="chevron-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>

                ${item.title ? `<h3 class="feedback-title">${Bands.escapeHtml(item.title)}</h3>` : ''}

                <div class="feedback-message-box">${Bands.escapeHtml(item.message)}</div>

                <div class="feedback-actions">
                    <div class="feedback-user-info">
                        <div class="feedback-avatar">${initials}</div>
                        <span class="feedback-username">${Bands.escapeHtml(userLabel)}</span>
                    </div>
                    <div class="action-buttons" style="display: flex; gap: 0.4rem;">
                        ${!isResolved ? `
                            <button class="btn btn-sm btn-outline-success resolve-feedback-btn" data-id="${item.id}" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;">Erledigt</button>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-danger delete-feedback-btn" data-id="${item.id}" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;">Löschen</button>
                    </div>
                </div>
            </div>
    `;
    },

    switchSettingsTab(tabName) {
        if (window.isAbsenceFormDirty) {
            UI.showConfirm(
                'Deine Eingaben werden nicht gespeichert. Möchtest du trotzdem den Tab wechseln?',
                () => {
                    window.isAbsenceFormDirty = false;
                    this.resetAbsenceFormSettings();
                    this.switchSettingsTab(tabName);
                },
                null,
                {
                    kicker: 'Abwesenheit',
                    title: 'Ungespeicherte Änderungen',
                    confirmText: 'Trotzdem wechseln',
                    confirmClass: 'btn-danger',
                    cancelText: 'Weiter bearbeiten'
                }
            );
            return;
        }

        // Toggle Buttons
        const settingsModal = document.getElementById('settingsModal');
        if (!settingsModal) return;

        const btns = settingsModal.querySelectorAll('.settings-tab-btn');
        btns.forEach(b => {
            // We can check dataset tab OR id
            if (b.dataset.tab === tabName) b.classList.add('active');
            else b.classList.remove('active');
        });

        // Toggle Content
        const contents = settingsModal.querySelectorAll('.settings-tab-content');
        contents.forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
        });

        // Mappings
        let contentId = '';
        if (tabName === 'profile') contentId = 'profileSettingsTab';

        // Try precise ID
        let content = document.getElementById(contentId);
        if (!content) {
            // Try standard pattern
            content = document.getElementById(tabName + 'SettingsTab');
        }

        if (content) {
            content.style.display = 'block';
            content.classList.add('active');

            // Load data if switching to Admin tab
            if (tabName === 'admin') {
                void this.loadAdminFeedback();
                void this.renderLocationsList();
                void this.renderAllBandsList();
                void this.renderUsersList();
                void this.renderCalendarsList();
            } else if (tabName === 'absences') {
                void this.renderAbsencesListSettings();
            }
        } else {
            // Handling for bands/locations if standard ID isn't matching
            // Just trying to be safe if I don't see all IDs
        }

        if (settingsModal.classList.contains('active')) {
            this.handleModalOpened('settingsModal');
        }
    },

    parseAbsenceDateInputValue(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return null;
        }

        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
    },

    formatAbsenceDateInputValue(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    shiftAbsenceDateInputValue(value, offsetDays = 0) {
        const date = this.parseAbsenceDateInputValue(value);
        if (!date) return '';

        date.setDate(date.getDate() + Number(offsetDays || 0));
        return this.formatAbsenceDateInputValue(date);
    },

    extractAbsenceDateInputValue(value) {
        if (typeof value !== 'string' || !value) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value;
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : this.formatAbsenceDateInputValue(date);
    },

    extractAbsenceTimeInputValue(value, absenceOrMeta = null, type = 'start') {
        if (typeof value === 'string' && value.includes('T')) {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
                return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }
        }

        // Fallback to meta (Support both the raw meta and the absence object)
        const meta = (absenceOrMeta && typeof absenceOrMeta === 'object')
            ? (absenceOrMeta.recurrenceMeta || absenceOrMeta.meta || absenceOrMeta)
            : null;

        if (meta) {
            if (type === 'start' && meta.startTime) return meta.startTime;
            if (type === 'end' && meta.endTime) return meta.endTime;
        }

        return '';
    },

    buildAbsenceDateTimeValue(dateValue, timeValue = '') {
        if (!dateValue) return '';
        if (!timeValue) return dateValue;

        const date = this.parseAbsenceDateInputValue(dateValue);
        if (!date) return '';

        const [hours, minutes] = String(timeValue).split(':').map(Number);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
            return dateValue;
        }

        date.setHours(hours, minutes, 0, 0);
        return date.toISOString();
    },

    formatAbsenceTimeRangeLabel(startValue, endValue, absenceOrMeta = null) {
        const startTime = this.extractAbsenceTimeInputValue(startValue, absenceOrMeta, 'start');
        const endTime = this.extractAbsenceTimeInputValue(endValue, absenceOrMeta, 'end');
        if (!startTime && !endTime) return '';
        if (startTime && endTime) return `${startTime} - ${endTime} Uhr`;
        if (startTime) return `ab ${startTime} Uhr`;
        return `bis ${endTime} Uhr`;
    },

    formatAbsenceClockRangeLabel(startTime = '', endTime = '') {
        const normalizedStart = typeof startTime === 'string' ? startTime.trim() : '';
        const normalizedEnd = typeof endTime === 'string' ? endTime.trim() : '';
        if (!normalizedStart && !normalizedEnd) return '';
        if (normalizedStart && normalizedEnd) return `${normalizedStart} - ${normalizedEnd} Uhr`;
        if (normalizedStart) return `ab ${normalizedStart} Uhr`;
        return `bis ${normalizedEnd} Uhr`;
    },

    getAbsenceWeekdayLabel(weekdayValue) {
        const labels = {
            0: 'Sonntag',
            1: 'Montag',
            2: 'Dienstag',
            3: 'Mittwoch',
            4: 'Donnerstag',
            5: 'Freitag',
            6: 'Samstag'
        };
        return labels[Number(weekdayValue)] || 'Wochentag';
    },

    getAbsenceSeriesEntries(absences = [], seriesId = '') {
        return (Array.isArray(absences) ? absences : [])
            .filter(absence => {
                const meta = Storage.getAbsenceRecurrenceMeta(absence);
                return meta?.type === 'series' && meta.seriesId === seriesId;
            })
            .sort((left, right) => new Date(left.startDate) - new Date(right.startDate));
    },

    buildAbsenceSeriesGroups(absences = []) {
        const groups = new Map();

        (Array.isArray(absences) ? absences : []).forEach(absence => {
            const meta = Storage.getAbsenceRecurrenceMeta(absence);
            if (meta?.type === 'series' && meta.seriesId) {
                const key = `series:${meta.seriesId}`;
                if (!groups.has(key)) {
                    groups.set(key, {
                        kind: 'series',
                        key,
                        seriesId: meta.seriesId,
                        items: [],
                        meta
                    });
                }
                groups.get(key).items.push(absence);
                return;
            }

            groups.set(`single:${absence.id}`, {
                kind: 'single',
                key: `single:${absence.id}`,
                items: [absence]
            });
        });

        return Array.from(groups.values()).map(group => {
            const items = [...group.items].sort((left, right) => new Date(left.startDate) - new Date(right.startDate));
            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            const latestStart = [...items].sort((left, right) => new Date(right.startDate) - new Date(left.startDate))[0];
            const recurrenceMeta = group.meta || Storage.getAbsenceRecurrenceMeta(firstItem) || null;
            const firstStartValue = firstItem.startDate || firstItem.start || '';
            const lastEndValue = lastItem.endDate || lastItem.end || firstItem.endDate || firstStartValue;
            const metaTimeLabel = this.formatAbsenceClockRangeLabel(recurrenceMeta?.startTime, recurrenceMeta?.endTime);
            const itemTimeLabel = this.formatAbsenceTimeRangeLabel(firstStartValue, lastEndValue, recurrenceMeta || firstItem);
            const firstDateLabel = UI.formatDateOnly(firstStartValue);
            const lastDateLabel = UI.formatDateOnly(lastEndValue);

            return {
                ...group,
                items,
                firstItem,
                lastItem,
                reason: Storage.getAbsenceDisplayReason(firstItem),
                dateLabel: firstDateLabel === lastDateLabel
                    ? firstDateLabel
                    : `${firstDateLabel} - ${lastDateLabel}`,
                timeLabel: metaTimeLabel || itemTimeLabel,
                weekdayLabel: this.getAbsenceWeekdayLabel(group.meta?.weekday ?? new Date(firstItem.startDate).getDay()),
                countLabel: items.length === 1 ? '1 Termin' : `${items.length} Termine`,
                sortDate: latestStart?.startDate || firstItem.startDate
            };
        }).sort((left, right) => new Date(right.sortDate) - new Date(left.sortDate));
    },

    getAbsenceSettingsMode() {
        return document.getElementById('absenceModeSettings')?.value === 'series' ? 'series' : 'single';
    },

    setAbsenceSettingsMode(mode = 'single') {
        const normalizedMode = mode === 'series' ? 'series' : 'single';
        const modeInput = document.getElementById('absenceModeSettings');
        const singlePanel = document.querySelector('[data-absence-mode-panel="single"]');
        const seriesPanel = document.querySelector('[data-absence-mode-panel="series"]');
        const modeButtons = document.querySelectorAll('[data-absence-mode]');
        const singleStartInput = document.getElementById('absenceStartSettings');
        const seriesStartInput = document.getElementById('absenceSeriesStartSettings');
        const seriesEndInput = document.getElementById('absenceSeriesEndSettings');
        const seriesWeekdayInput = document.getElementById('absenceSeriesWeekdaySettings');

        if (modeInput) {
            modeInput.value = normalizedMode;
        }

        modeButtons.forEach(button => {
            const isActive = button.dataset.absenceMode === normalizedMode;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (singlePanel) {
            singlePanel.hidden = normalizedMode !== 'single';
        }

        if (seriesPanel) {
            seriesPanel.hidden = normalizedMode !== 'series';
        }

        if (singleStartInput) {
            singleStartInput.required = normalizedMode === 'single';
        }

        if (seriesStartInput) {
            seriesStartInput.required = normalizedMode === 'series';
            if (normalizedMode === 'series' && !seriesStartInput.value && singleStartInput?.value) {
                seriesStartInput.value = singleStartInput.value;
            }
        }

        if (seriesEndInput) {
            seriesEndInput.required = normalizedMode === 'series';
            if (normalizedMode === 'series' && !seriesEndInput.value) {
                seriesEndInput.value = seriesStartInput?.value || singleStartInput?.value || '';
            }
        }

        if (seriesWeekdayInput) {
            seriesWeekdayInput.required = normalizedMode === 'series';
        }

        if (normalizedMode === 'series') {
            this.setAbsenceSettingsQuickDuration(0);
        }
    },

    setAbsenceSettingsModeLocked(isLocked = false) {
        const toggle = document.querySelector('.absence-mode-toggle');
        const modeButtons = document.querySelectorAll('[data-absence-mode]');

        if (toggle) {
            toggle.classList.toggle('is-locked', Boolean(isLocked));
        }

        modeButtons.forEach(button => {
            button.disabled = Boolean(isLocked);
        });
    },

    setAbsenceSettingsQuickDuration(days = 0) {
        const normalizedDays = Number.isFinite(Number(days)) ? Math.max(0, Number(days)) : 0;
        const quickInput = document.getElementById('absenceQuickDurationSettings');
        const startInput = document.getElementById('absenceStartSettings');
        const endInput = document.getElementById('absenceEndSettings');
        const quickButtons = document.querySelectorAll('[data-absence-quick-days]');

        if (quickInput) {
            quickInput.value = normalizedDays > 0 ? String(normalizedDays) : '';
        }

        quickButtons.forEach(button => {
            const isActive = Number(button.dataset.absenceQuickDays) === normalizedDays && normalizedDays > 0;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (normalizedDays > 0 && startInput?.value && endInput) {
            endInput.value = this.shiftAbsenceDateInputValue(startInput.value, normalizedDays - 1);
        }
    },

    buildRecurringAbsenceEntries(startValue, endValue, weekdayValue, options = {}) {
        const startDate = this.parseAbsenceDateInputValue(startValue);
        const endDate = this.parseAbsenceDateInputValue(endValue);
        const weekday = Number(weekdayValue);

        if (!startDate || !endDate || Number.isNaN(weekday) || weekday < 0 || weekday > 6 || startDate > endDate) {
            return [];
        }

        const cursor = new Date(startDate.getTime());
        const offset = (weekday - cursor.getDay() + 7) % 7;
        cursor.setDate(cursor.getDate() + offset);

        const entries = [];
        while (cursor <= endDate) {
            const dateValue = this.formatAbsenceDateInputValue(cursor);
            entries.push({
                startDate: this.buildAbsenceDateTimeValue(dateValue, options.startTime || ''),
                endDate: this.buildAbsenceDateTimeValue(dateValue, options.endTime || '')
            });
            cursor.setDate(cursor.getDate() + 7);
        }

        return entries;
    },

    setupAbsenceSettingsControls() {
        const form = document.getElementById('createAbsenceFormSettings');
        if (!form || form.dataset.absenceControlsBound === 'true') return;

        const singleStartInput = document.getElementById('absenceStartSettings');
        const singleEndInput = document.getElementById('absenceEndSettings');
        const seriesStartInput = document.getElementById('absenceSeriesStartSettings');
        const seriesEndInput = document.getElementById('absenceSeriesEndSettings');
        const seriesWeekdayInput = document.getElementById('absenceSeriesWeekdaySettings');
        const quickInput = document.getElementById('absenceQuickDurationSettings');

        form.querySelectorAll('[data-absence-mode]').forEach(button => {
            button.addEventListener('click', () => {
                if (button.disabled) return;
                this.setAbsenceSettingsMode(button.dataset.absenceMode);
            });
        });

        form.querySelectorAll('[data-absence-quick-days]').forEach(button => {
            button.addEventListener('click', () => {
                const days = Number(button.dataset.absenceQuickDays);
                const currentDays = Number(quickInput?.value || 0);
                this.setAbsenceSettingsQuickDuration(currentDays === days ? 0 : days);
            });
        });

        if (singleStartInput && singleEndInput) {
            singleStartInput.addEventListener('change', () => {
                singleEndInput.min = singleStartInput.value || '';

                const activeQuickDays = Number(quickInput?.value || 0);
                if (activeQuickDays > 0) {
                    this.setAbsenceSettingsQuickDuration(activeQuickDays);
                }
            });

            singleEndInput.addEventListener('change', () => {
                const activeQuickDays = Number(quickInput?.value || 0);
                if (!activeQuickDays || !singleStartInput.value || !singleEndInput.value) return;

                const expectedEnd = this.shiftAbsenceDateInputValue(singleStartInput.value, activeQuickDays - 1);
                if (singleEndInput.value !== expectedEnd) {
                    this.setAbsenceSettingsQuickDuration(0);
                }
            });
        }

        if (seriesStartInput && seriesEndInput) {
            seriesStartInput.addEventListener('change', () => {
                seriesEndInput.min = seriesStartInput.value || '';

                if (seriesWeekdayInput && !seriesWeekdayInput.dataset.userSet && seriesStartInput.value) {
                    const parsed = this.parseAbsenceDateInputValue(seriesStartInput.value);
                    if (parsed) {
                        seriesWeekdayInput.value = String(parsed.getDay());
                    }
                }
            });
        }

        if (seriesWeekdayInput) {
            seriesWeekdayInput.addEventListener('change', () => {
                seriesWeekdayInput.dataset.userSet = 'true';
            });
        }

        // Dirty tracking for absence form
        if (!form.dataset.dirtyTracking) {
            form.addEventListener('input', () => { window.isAbsenceFormDirty = true; });
            form.addEventListener('change', () => { window.isAbsenceFormDirty = true; });
            form.dataset.dirtyTracking = 'true';
        }

        this.setAbsenceSettingsMode('single');
        this.setAbsenceSettingsQuickDuration(0);
        form.dataset.absenceControlsBound = 'true';
    },

    async handleCreateAbsenceFromSettings() {
        const startInput = document.getElementById('absenceStartSettings');
        const endInput = document.getElementById('absenceEndSettings');
        const startTimeInput = document.getElementById('absenceStartTimeSettings');
        const endTimeInput = document.getElementById('absenceEndTimeSettings');
        const seriesStartInput = document.getElementById('absenceSeriesStartSettings');
        const seriesEndInput = document.getElementById('absenceSeriesEndSettings');
        const seriesStartTimeInput = document.getElementById('absenceSeriesStartTimeSettings');
        const seriesEndTimeInput = document.getElementById('absenceSeriesEndTimeSettings');
        const seriesWeekdayInput = document.getElementById('absenceSeriesWeekdaySettings');
        const reasonInput = document.getElementById('absenceReasonSettings');
        const editIdInput = document.getElementById('editAbsenceIdSettings');
        const editSeriesIdInput = document.getElementById('editAbsenceSeriesIdSettings');
        const quickDurationInput = document.getElementById('absenceQuickDurationSettings');

        const reason = reasonInput.value.trim();
        const editId = editIdInput.value;
        const editSeriesId = editSeriesIdInput?.value || '';
        const user = Auth.getCurrentUser();
        if (!user) return;

        // Force cache invalidation early to prevent stale reads during/after process
        this.absencesCache = null;

        const mode = editId ? 'single' : (editSeriesId ? 'series' : this.getAbsenceSettingsMode());

        if (mode === 'series') {
            const seriesStart = seriesStartInput?.value || '';
            const seriesEnd = seriesEndInput?.value || '';
            const seriesStartTime = seriesStartTimeInput?.value || '';
            const seriesEndTime = seriesEndTimeInput?.value || '';
            const weekday = seriesWeekdayInput?.value;

            if (!seriesStart || !seriesEnd) {
                UI.showToast('Bitte gib den Zeitraum fuer die Serie vollstaendig ein.', 'error');
                return;
            }

            if ((seriesStartTime && !seriesEndTime) || (!seriesStartTime && seriesEndTime)) {
                UI.showToast('Bitte gib fuer die Serie Start- und Endzeit gemeinsam an.', 'error');
                return;
            }

            const recurringEntries = this.buildRecurringAbsenceEntries(seriesStart, seriesEnd, weekday, {
                startTime: seriesStartTime,
                endTime: seriesEndTime
            });
            if (recurringEntries.length === 0) {
                UI.showToast('Im gewaehlten Zeitraum wurde kein passender Wochentag gefunden.', 'error');
                return;
            }

            const existingAbsences = await Storage.getUserAbsences(user.id) || [];
            const existingKeys = new Set(existingAbsences
                .filter(absence => {
                    const meta = Storage.getAbsenceRecurrenceMeta(absence);
                    const sid = meta?.seriesId ? String(meta.seriesId).trim() : '';
                    return sid !== String(editSeriesId).trim();
                })
                .map(absence => {
                    return `${absence.startDate || ''}__${absence.endDate || ''}`;
                }));

            const entriesToCreate = recurringEntries.filter(entry => !existingKeys.has(`${entry.startDate || ''}__${entry.endDate || ''}`));

            if (entriesToCreate.length === 0) {
                UI.showToast(editSeriesId
                    ? 'Die neue Serie überschneidet sich vollständig mit bereits vorhandenen Abwesenheiten.'
                    : 'Diese Serien-Abwesenheiten sind bereits eingetragen.', 'info');
                return;
            }

            if (editSeriesId) {
                const currentSeriesEntries = this.getAbsenceSeriesEntries(existingAbsences, editSeriesId);
                if (currentSeriesEntries.length > 0) {
                    await Promise.all(currentSeriesEntries.map(absence => Storage.deleteAbsence(absence.id)));
                }
            }

            const seriesId = editSeriesId || Storage.generateId();
            const createdAt = new Date().toISOString();
            const seriesMeta = {
                type: 'series',
                seriesId,
                frequency: 'weekly',
                weekday: Number(weekday),
                startTime: seriesStartTime,
                endTime: seriesEndTime
            };

            for (const entry of entriesToCreate) {
                await Storage.createAbsence(user.id, entry.startDate, entry.endDate, reason, {
                    meta: seriesMeta,
                    createdAt
                });
            }

            const skippedCount = recurringEntries.length - entriesToCreate.length;
            const successText = editSeriesId
                ? 'Serie aktualisiert'
                : (entriesToCreate.length === 1
                    ? '1 Serien-Abwesenheit eingetragen'
                    : `${entriesToCreate.length} Serien-Abwesenheiten eingetragen`);
            UI.showToast(successText, 'success');

            if (skippedCount > 0) {
                UI.showToast(`${skippedCount} bereits vorhandene Termine wurden uebersprungen.`, 'info');
            }
        } else {
            const start = startInput.value;
            const startTime = startTimeInput?.value || '';
            const endTime = endTimeInput?.value || '';
            const quickDuration = Number(quickDurationInput?.value || 0);
            const end = endInput.value || (quickDuration > 0 ? this.shiftAbsenceDateInputValue(start, quickDuration - 1) : start);

            if (!start) {
                UI.showToast('Bitte waehle mindestens ein Startdatum aus.', 'error');
                return;
            }

            if ((startTime && !endTime) || (!startTime && endTime)) {
                UI.showToast('Bitte gib Start- und Endzeit gemeinsam an.', 'error');
                return;
            }

            const startDate = this.parseAbsenceDateInputValue(start);
            const endDate = this.parseAbsenceDateInputValue(end);
            if (!startDate || !endDate) {
                UI.showToast('Bitte pruefe die Datumsangaben.', 'error');
                return;
            }

            if (startDate > endDate) {
                UI.showToast('Das Bis-Datum muss nach dem Von-Datum liegen.', 'error');
                return;
            }

            const startValue = this.buildAbsenceDateTimeValue(start, startTime);
            const endValue = this.buildAbsenceDateTimeValue(end, endTime);

            if (new Date(startValue) > new Date(endValue)) {
                UI.showToast('Das Ende muss nach dem Beginn liegen.', 'error');
                return;
            }

            // Save single absence with time in meta for redundancy (DATE columns might truncate time)
            const singleMeta = (startTime || endTime) ? { startTime, endTime } : null;

            if (editId) {
                await Storage.update('absences', editId, {
                    startDate: startValue,
                    endDate: endValue,
                    reason: Storage.buildAbsenceReasonPayload(reason, singleMeta)
                });
                UI.showToast('Abwesenheit aktualisiert', 'success');
            } else {
                await Storage.createAbsence(user.id, startValue, endValue, reason, {
                    meta: singleMeta
                });
                UI.showToast('Abwesenheit eingetragen', 'success');
            }
        }

        this.resetAbsenceFormSettings();

        // Update markers and calendars
        await Promise.all([
            this.updateAbsenceIndicator(),
            this.refreshPersonalCalendarAfterAbsenceChange()
        ]);

        // Reset dirty flag
        window.isAbsenceFormDirty = false;

        // Refresh list with a tiny delay to ensure database consistency on read
        setTimeout(async () => {
            this.absencesCache = null;
            await this.renderAbsencesListSettings();
        }, 300);
    },

    resetAbsenceFormSettings() {
        const form = document.getElementById('createAbsenceFormSettings');
        if (form) form.reset();

        const editIdInput = document.getElementById('editAbsenceIdSettings');
        const editSeriesIdInput = document.getElementById('editAbsenceSeriesIdSettings');
        const reasonInput = document.getElementById('absenceReasonSettings');
        const saveBtn = document.getElementById('saveAbsenceBtnSettings');
        const cancelBtn = document.getElementById('cancelEditAbsenceBtnSettings');

        if (editIdInput) editIdInput.value = '';
        if (editSeriesIdInput) editSeriesIdInput.value = '';
        if (reasonInput) reasonInput.value = '';
        if (saveBtn) saveBtn.textContent = 'Abwesenheit hinzufügen';
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
            cancelBtn.onclick = null;
        }

        const seriesWeekdayInput = document.getElementById('absenceSeriesWeekdaySettings');
        if (seriesWeekdayInput) {
            delete seriesWeekdayInput.dataset.userSet;
        }

        window.isAbsenceFormDirty = false;

        this.setAbsenceSettingsModeLocked(false);
        this.setAbsenceSettingsMode('single');
        this.setAbsenceSettingsQuickDuration(0);
    },

    async renderAbsencesListSettings() {
        const container = document.getElementById('absencesListSettings');
        if (!container) return;

        const user = Auth.getCurrentUser();
        if (!user) return;

        let absences;
        if (this.absencesCache) {
            Logger.info('[App] Using cached absences.');
            absences = this.absencesCache;
        } else {
            // Cleanup past absences first
            await this.cleanupPastAbsences(user.id);
            absences = await Storage.getUserAbsences(user.id) || [];
            this.absencesCache = absences;
        }

        if (absences.length === 0) {
            container.innerHTML = '<p class="text-muted">Keine Abwesenheiten eingetragen.</p>';
            return;
        }

        const groups = this.buildAbsenceSeriesGroups(absences);

        container.innerHTML = groups.map(group => `
            <div class="absence-item-card${group.kind === 'series' ? ' is-series' : ''}"${group.kind === 'series' ? ` data-absence-series-id="${group.seriesId}"` : ` data-absence-id="${group.firstItem.id}"`}>
                <div class="absence-info">
                    <div class="absence-card-header">
                        <div class="absence-card-title">${group.reason ? Bands.escapeHtml(group.reason) : Bands.escapeHtml(group.dateLabel)}</div>
                        ${group.kind === 'series' ? '<span class="absence-series-pill">Serie</span>' : ''}
                    </div>
                    <div class="absence-date-row">
                        <div class="absence-date-range">${Bands.escapeHtml(group.dateLabel)}</div>
                        ${group.timeLabel ? `<div class="absence-time-range">${Bands.escapeHtml(group.timeLabel)}</div>` : ''}
                    </div>
                    ${group.kind === 'series' ? `
                        <div class="absence-series-meta">
                            <span>${Bands.escapeHtml(`Jeden ${group.weekdayLabel}`)}</span>
                            <span>${Bands.escapeHtml(group.countLabel)}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="absence-actions">
                    <button class="btn btn-sm btn-icon edit-absence-settings"${group.kind === 'series' ? ` data-absence-series-id="${group.seriesId}"` : ` data-absence-id="${group.firstItem.id}"`} title="Bearbeiten" aria-label="Abwesenheit bearbeiten">${this.getRundownInlineIcon('edit')}</button>
                    <button class="btn btn-sm btn-icon delete-absence-settings"${group.kind === 'series' ? ` data-absence-series-id="${group.seriesId}"` : ` data-absence-id="${group.firstItem.id}"`} title="Löschen" aria-label="Abwesenheit löschen">${this.getRundownInlineIcon('trash')}</button>
                </div>
            </div>
    `).join('');

        // Attach event listeners
        container.querySelectorAll('.edit-absence-settings').forEach(btn => {
            btn.addEventListener('click', () => {
                const seriesId = btn.dataset.absenceSeriesId;
                if (seriesId) {
                    this.editAbsenceSeriesSettings(seriesId);
                    return;
                }

                const id = btn.dataset.absenceId;
                this.editAbsenceSettings(id);
            });
        });

        container.querySelectorAll('.delete-absence-settings').forEach(btn => {
            btn.addEventListener('click', async () => {
                const seriesId = btn.dataset.absenceSeriesId;
                if (seriesId) {
                    await this.deleteAbsenceSeriesSettings(seriesId);
                    return;
                }

                const id = btn.dataset.absenceId;
                await this.deleteAbsenceSettings(id);
            });
        });
    },

    async editAbsenceSettings(absenceId) {
        const absence = await Storage.getAbsenceById(absenceId);
        if (!absence) return;

        this.setAbsenceSettingsMode('single');
        this.setAbsenceSettingsModeLocked(true);
        this.setAbsenceSettingsQuickDuration(0);
        document.getElementById('absenceStartSettings').value = this.extractAbsenceDateInputValue(absence.startDate || absence.start || '');
        document.getElementById('absenceEndSettings').value = this.extractAbsenceDateInputValue(absence.endDate || absence.end || '');
        const startTimeInput = document.getElementById('absenceStartTimeSettings');
        const endTimeInput = document.getElementById('absenceEndTimeSettings');
        if (startTimeInput) startTimeInput.value = this.extractAbsenceTimeInputValue(absence.startDate || '', absence, 'start');
        if (endTimeInput) endTimeInput.value = this.extractAbsenceTimeInputValue(absence.endDate || '', absence, 'end');
        document.getElementById('absenceReasonSettings').value = Storage.getAbsenceDisplayReason(absence);
        document.getElementById('editAbsenceIdSettings').value = absenceId;
        const editSeriesIdInput = document.getElementById('editAbsenceSeriesIdSettings');
        if (editSeriesIdInput) editSeriesIdInput.value = '';
        document.getElementById('saveAbsenceBtnSettings').textContent = 'Änderungen speichern';
        document.getElementById('cancelEditAbsenceBtnSettings').style.display = 'inline-block';

        const cancelBtn = document.getElementById('cancelEditAbsenceBtnSettings');
        cancelBtn.onclick = () => {
            this.resetAbsenceFormSettings();
        };

        window.isAbsenceFormDirty = false;
    },

    async editAbsenceSeriesSettings(seriesId) {
        const user = Auth.getCurrentUser();
        if (!user || !seriesId) return;

        const absences = this.absencesCache || await Storage.getUserAbsences(user.id) || [];
        const seriesEntries = this.getAbsenceSeriesEntries(absences, seriesId);
        if (seriesEntries.length === 0) return;

        const firstEntry = seriesEntries[0];
        const lastEntry = seriesEntries[seriesEntries.length - 1];
        const meta = Storage.getAbsenceRecurrenceMeta(firstEntry) || {};

        this.setAbsenceSettingsMode('series');
        this.setAbsenceSettingsModeLocked(true);
        this.setAbsenceSettingsQuickDuration(0);

        document.getElementById('absenceSeriesStartSettings').value = this.extractAbsenceDateInputValue(firstEntry.startDate || '');
        document.getElementById('absenceSeriesEndSettings').value = this.extractAbsenceDateInputValue(lastEntry.endDate || '');
        const weekdayInput = document.getElementById('absenceSeriesWeekdaySettings');
        if (weekdayInput) {
            weekdayInput.value = String(Number.isFinite(Number(meta.weekday)) ? Number(meta.weekday) : new Date(firstEntry.startDate).getDay());
            weekdayInput.dataset.userSet = 'true';
        }
        const seriesStartTimeInput = document.getElementById('absenceSeriesStartTimeSettings');
        const seriesEndTimeInput = document.getElementById('absenceSeriesEndTimeSettings');
        if (seriesStartTimeInput) {
            seriesStartTimeInput.value = meta.startTime || this.extractAbsenceTimeInputValue(firstEntry.startDate || '');
        }
        if (seriesEndTimeInput) {
            seriesEndTimeInput.value = meta.endTime || this.extractAbsenceTimeInputValue(firstEntry.endDate || '');
        }
        document.getElementById('absenceReasonSettings').value = Storage.getAbsenceDisplayReason(firstEntry);
        document.getElementById('editAbsenceIdSettings').value = '';
        const editSeriesIdInput = document.getElementById('editAbsenceSeriesIdSettings');
        if (editSeriesIdInput) editSeriesIdInput.value = seriesId;
        document.getElementById('saveAbsenceBtnSettings').textContent = 'Serie speichern';
        document.getElementById('cancelEditAbsenceBtnSettings').style.display = 'inline-block';

        const cancelBtn = document.getElementById('cancelEditAbsenceBtnSettings');
        cancelBtn.onclick = () => {
            this.resetAbsenceFormSettings();
        };

        window.isAbsenceFormDirty = false;
    },

    async deleteAbsenceSettings(absenceId) {
        const confirmed = await UI.confirmDelete('Möchtest du diese Abwesenheit wirklich löschen?');
        if (confirmed) {
            await Storage.deleteAbsence(absenceId);
            const editIdInput = document.getElementById('editAbsenceIdSettings');
            if (!editIdInput || editIdInput.value === absenceId) {
                this.resetAbsenceFormSettings();
            }
            this.absencesCache = null; // Invalidate cache
            UI.showToast('Abwesenheit gelöscht', 'success');
            await this.updateAbsenceIndicator(); // Update header immediately
            await this.refreshPersonalCalendarAfterAbsenceChange();
            await this.renderAbsencesListSettings();
        }
    },

    async deleteAbsenceSeriesSettings(seriesId) {
        const user = Auth.getCurrentUser();
        if (!user || !seriesId) return;

        const confirmed = await UI.confirmDelete('Möchtest du diese Serie wirklich löschen?');
        if (!confirmed) return;

        const absences = this.absencesCache || await Storage.getUserAbsences(user.id) || [];
        const seriesEntries = this.getAbsenceSeriesEntries(absences, seriesId);
        if (seriesEntries.length === 0) return;

        await Promise.all(seriesEntries.map(absence => Storage.deleteAbsence(absence.id)));

        const editSeriesIdInput = document.getElementById('editAbsenceSeriesIdSettings');
        if (!editSeriesIdInput || editSeriesIdInput.value === seriesId) {
            this.resetAbsenceFormSettings();
        }

        this.absencesCache = null;
        UI.showToast('Serie gelöscht', 'success');
        await this.updateAbsenceIndicator();
        await this.refreshPersonalCalendarAfterAbsenceChange();
        await this.renderAbsencesListSettings();
    },

    async refreshPersonalCalendarAfterAbsenceChange() {
        if (typeof window === 'undefined' || !window.PersonalCalendar) return;

        try {
            const user = Auth.getCurrentUser();
            if (!user) return;

            const personalCalendar = window.PersonalCalendar;
            const freshAbsences = await Storage.getUserAbsences(user.id);
            personalCalendar.absences = Array.isArray(freshAbsences) ? freshAbsences : [];

            if (this.currentView === 'kalender' && document.getElementById('personalCalendarContainer')) {
                personalCalendar.clearCache();
                await personalCalendar.loadPersonalCalendar();
                return;
            }

            await personalCalendar.syncCalendarBackground();
        } catch (error) {
            console.warn('[App.refreshPersonalCalendarAfterAbsenceChange] Failed:', error);
        }
    },

    async refreshPersonalCalendarAfterPlanningChange() {
        if (typeof window === 'undefined' || !window.PersonalCalendar) return;

        try {
            const personalCalendar = window.PersonalCalendar;
            personalCalendar.clearCache();

            if (this.currentView === 'kalender' && document.getElementById('personalCalendarContainer')) {
                await personalCalendar.loadPersonalCalendar();
                return;
            }

            await personalCalendar.syncCalendarBackground();
        } catch (error) {
            console.warn('[App.refreshPersonalCalendarAfterPlanningChange] Failed:', error);
        }
    },

    showCalendarSubscriptionModal() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        // Generate webcal URL (this would need a backend endpoint to generate the iCal feed)
        const webcalUrl = `webcal://your-domain.com/api/calendar/${user.id}`;
        const httpUrl = `https://your-domain.com/api/calendar/${user.id}`;

        UI.showToast(`
            <div>
                <strong>Kalender abonnieren</strong><br>
                <p style="margin-top: 0.5rem; font-size: 0.9em;">
                    Um deinen persönlichen Kalender zu abonnieren, benötigst du eine iCal-URL.<br>
                    Diese Funktion erfordert ein Backend zur Generierung des Kalender-Feeds.
                </p>
                <p style="margin-top: 0.5rem; font-size: 0.9em;">
                    <strong>In Apple Kalender:</strong><br>
                    Datei → Neues Kalender-Abo → URL eingeben
                </p>
                <p style="margin-top: 0.5rem; font-size: 0.9em;">
                    <strong>In Google Calendar:</strong><br>
                    Einstellungen → Kalender hinzufügen → Über URL
                </p>
        `, 'info', 8000);
    },

    // ── Calendar quick-action helpers ─────────────────────────────────────────

    formatPrefilledModalDate(value) {
        if (!value) return '';

        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            return value.slice(0, 10);
        }

        const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    formatPrefilledModalDateTime(value, fallbackTime = '19:00') {
        if (!value) return '';

        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
            return value.slice(0, 16);
        }

        const date = this.formatPrefilledModalDate(value);
        if (!date) return '';

        const time = typeof fallbackTime === 'string' && /^\d{2}:\d{2}$/.test(fallbackTime) ? fallbackTime : '19:00';
        return `${date}T${time}`;
    },

    setPrefilledModalControlValue(element, value) {
        if (!element || !value) return;

        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    },

    applyPendingCreateRehearsalDefaults() {
        const defaults = this.pendingCreateRehearsalDefaults;
        this.pendingCreateRehearsalDefaults = null;

        if (!defaults?.date && !defaults?.locationId) return;

        if (typeof Rehearsals !== 'undefined' && typeof Rehearsals.setScheduleMode === 'function') {
            Rehearsals.setScheduleMode('fixed', { lockMode: false, refreshAvailability: false });
        }

        const fixedDateInput = document.getElementById('rehearsalFixedDate');
        if (defaults?.date) {
            const formattedDate = this.formatPrefilledModalDate(defaults.date);
            this.setPrefilledModalControlValue(fixedDateInput, formattedDate);
        }

        const locationSelect = document.getElementById('rehearsalLocation');
        if (locationSelect && defaults?.locationId) {
            this.setPrefilledModalControlValue(locationSelect, defaults.locationId);
        }

        if (typeof Rehearsals !== 'undefined' && typeof Rehearsals.updateAvailabilityIndicators === 'function') {
            Promise.resolve(Rehearsals.updateAvailabilityIndicators()).catch(error => {
                console.warn('[applyPendingCreateRehearsalDefaults] Could not refresh availability', error);
            });
        }
    },

    applyPendingCreateEventDefaults() {
        const defaults = this.pendingCreateEventDefaults;
        this.pendingCreateEventDefaults = null;

        if (!defaults?.date && !defaults?.dateTime) return;

        if (typeof Events !== 'undefined' && typeof Events.setScheduleMode === 'function') {
            Events.setScheduleMode('fixed', { lockMode: false, refreshAvailability: false });
        }

        const eventDateInput = document.getElementById('eventFixedDate');
        const eventTimeInput = document.getElementById('eventFixedTime');
        const formattedDateTime = this.formatPrefilledModalDateTime(defaults.dateTime || defaults.date, defaults.time || '19:00');
        const [date = '', timePart = ''] = formattedDateTime.split('T');

        this.setPrefilledModalControlValue(eventDateInput, date);
        this.setPrefilledModalControlValue(eventTimeInput, timePart ? timePart.slice(0, 5) : '19:00');

        if (typeof Events !== 'undefined' && typeof Events.updateAvailabilityIndicators === 'function') {
            Promise.resolve(Events.updateAvailabilityIndicators()).catch(error => {
                console.warn('[applyPendingCreateEventDefaults] Could not refresh availability', error);
            });
        }
    },

    openCreateRehearsalModal(options = null) {
        this.pendingCreateRehearsalDefaults = options && typeof options === 'object' ? { ...options } : null;

        // Trigger the same logic as clicking the "Probe erstellen" button
        const btn = document.getElementById('createRehearsalBtn');
        if (btn) {
            btn.click();
        } else {
            this.pendingCreateRehearsalDefaults = null;
            console.warn('[openCreateRehearsalModal] createRehearsalBtn not found');
        }
    },

    openCreateEventModal(options = null) {
        this.pendingCreateEventDefaults = options && typeof options === 'object' ? { ...options } : null;

        // Trigger the same logic as clicking the "Auftritt erstellen" button
        const btn = document.getElementById('createEventBtn');
        if (btn) {
            btn.click();
        } else {
            this.pendingCreateEventDefaults = null;
            console.warn('[openCreateEventModal] createEventBtn not found');
        }
    },

    async openAbsencesSettings() {
        // Open settings modal and switch directly to the absences tab
        // Use setTimeout to override the default profile-tab switch that happens at end of openSettingsModal
        await this.openSettingsModal();
        setTimeout(() => this.switchSettingsTab('absences'), 50);
    },

    // ──────────────────────────────────────────────────────────────────────────

    async openSettingsModal() {
        Logger.action('Open Settings Modal');
        const user = Auth.currentUser;
        if (!user) {
            console.warn('[openSettingsModal] No user found!');
            return;
        }

        const isAdmin = user.isAdmin || false;

        // Show/Hide tabs based on role
        // Show/Hide tabs based on role
        const adminTab = document.getElementById('settingsTabAdmin');
        if (adminTab) {
            adminTab.style.display = isAdmin ? 'flex' : 'none';
        }

        // Pre-fill profile form
        document.getElementById('profileUsername').value = user.username;
        document.getElementById('profileEmail').value = user.email;
        document.getElementById('profileInstrument').value = user.instrument || '';
        document.getElementById('profilePassword').value = '';

        UI.openModal('settingsModal');

        // Default to profile tab for everyone initially
        this.switchSettingsTab('profile');

        this.bindDeleteAccountButton(document.querySelector('#settingsModal .modal-body'));

        // Theme toggle setup
        const themeCard = document.querySelector('#settingsModal .profile-theme-card');
        if (themeCard) {
            const newThemeCard = themeCard.cloneNode(true);
            themeCard.parentNode.replaceChild(newThemeCard, themeCard);

            const themeToggle = newThemeCard.querySelector('#themeToggle');
            const applyThemeSelection = (isDark) => {
                if (themeToggle) {
                    themeToggle.checked = Boolean(isDark);
                }
                this.applyThemeMode(isDark ? 'dark' : 'light');
            };

            if (themeToggle) {
                themeToggle.checked = this.getResolvedThemeMode() === 'dark';
                themeToggle.addEventListener('change', (e) => {
                    applyThemeSelection(e.target.checked);
                });
            }

            const themeToggleLabel = newThemeCard.querySelector('label.toggle-switch');
            if (themeToggleLabel) {
                themeToggleLabel.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    applyThemeSelection(!(themeToggle && themeToggle.checked));
                });
            }

            newThemeCard.addEventListener('click', (event) => {
                if (event.target.closest('input, label.toggle-switch')) return;
                applyThemeSelection(!(themeToggle && themeToggle.checked));
            });
        }

        // Donate link setup
        const donateLinkInput = document.getElementById('donateLink');
        const saveDonateBtn = document.getElementById('saveDonateLink');
        if (donateLinkInput && saveDonateBtn) {
            // Load saved donate link from Supabase
            const savedLink = await Storage.getSetting('donateLink');
            if (savedLink) {
                donateLinkInput.value = savedLink;
            }

            // Save donate link
            const newSaveBtn = saveDonateBtn.cloneNode(true);
            saveDonateBtn.parentNode.replaceChild(newSaveBtn, saveDonateBtn);
            newSaveBtn.addEventListener('click', async () => {
                const link = donateLinkInput.value.trim();
                const normalizedLink = this.getValidatedDonateLink(link);

                if (link && !normalizedLink) {
                    UI.showToast('Bitte hinterlege einen gültigen https-Link für den Spenden-Button.', 'error');
                    return;
                }

                try {
                    await Storage.setSetting('donateLink', normalizedLink);
                    donateLinkInput.value = normalizedLink;
                    if (normalizedLink) {
                        UI.showToast('Spenden-Link gespeichert!', 'success');
                    } else {
                        UI.showToast('Spenden-Link entfernt', 'info');
                    }
                    // Update donate button visibility in news view
                    await this.updateDonateButton();
                } catch (error) {
                    UI.showToast('Fehler beim Speichern: ' + error.message, 'error');
                }
            });
        }

        if (isAdmin) {
            await this.renderCalendarsList();
            await this.renderLocationsList();
            await this.populateCalendarDropdowns(); // Populate calendar dropdowns
            await this.renderAllBandsList();
            await this.renderUsersList();

            // Populate donate link input
            const donateLink = await Storage.getSetting('donateLink');
            const donateLinkInput = document.getElementById('donateLinkInput');
            if (donateLinkInput) {
                donateLinkInput.value = donateLink || '';
            }
        }

        const settingsRoot = document.querySelector('#settingsModal .modal-body') || document;
        await this.initializeSettingsViewListeners(isAdmin, settingsRoot);
    },

    revokeProfileImageDraftObjectUrl() {
        if (this.profileImageDraftObjectUrl) {
            try {
                URL.revokeObjectURL(this.profileImageDraftObjectUrl);
            } catch (error) {
                console.warn('Could not revoke profile image preview URL:', error);
            }
        }
        this.profileImageDraftObjectUrl = null;
    },

    getProfileImageDisplayUrl(user) {
        if (this.profileImageDraftUrl) {
            return this.profileImageDraftUrl;
        }

        if (this.profileImageRemovalPending) {
            return null;
        }

        return user?.profile_image_url || null;
    },

    setProfileImageDraft(file) {
        this.revokeProfileImageDraftObjectUrl();
        this.profileImageDraftUrl = null;
        this.profileImageDraftFile = null;
        this.profileImageRemovalPending = false;

        if (!file) return null;

        const previewUrl = URL.createObjectURL(file);
        this.profileImageDraftFile = file;
        this.profileImageDraftObjectUrl = previewUrl;
        this.profileImageDraftUrl = previewUrl;
        return previewUrl;
    },

    clearProfileImageDraft({ resetInput = false, root = document } = {}) {
        this.revokeProfileImageDraftObjectUrl();
        this.profileImageDraftFile = null;
        this.profileImageDraftUrl = null;

        if (resetInput) {
            const imageInput = root.querySelector('#profileImageInput');
            if (imageInput) {
                imageInput.value = '';
            }
        }
    },

    resetProfileImageDraftState({ resetInput = false, root = document } = {}) {
        this.profileImageRemovalPending = false;
        this.clearProfileImageDraft({ resetInput, root });
    },

    async removeStoredProfileImage(imageUrl) {
        if (!imageUrl) return;

        try {
            const pathPart = imageUrl.split('/profile-images/')[1];
            if (!pathPart) return;
            const sb = SupabaseClient.getClient();
            if (!sb) return;
            await sb.storage.from('profile-images').remove([pathPart]);
        } catch (error) {
            console.warn('Could not remove file from storage:', error);
        }
    },

    async applyProfileImageUpdate(user, updates) {
        const currentImageUrl = user?.profile_image_url || null;

        if (this.profileImageDraftFile) {
            let file = this.profileImageDraftFile;

            try {
                const compressionPromise = this.compressImage(file);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Bildkomprimierung Zeitüberschreitung')), 5000)
                );
                file = await Promise.race([compressionPromise, timeoutPromise]);
            } catch (error) {
                console.warn('Compression failed or timed out, using original file', error);
            }

            const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
            const filePath = `${user.id}/${Date.now()}-profile.${fileExt}`;
            const sb = SupabaseClient.getClient();

            const { error: uploadError } = await sb.storage
                .from('profile-images')
                .upload(filePath, file, {
                    upsert: true
                });

            if (uploadError) {
                throw new Error('Fehler beim Bilder-Upload: ' + uploadError.message);
            }

            const { data } = sb.storage
                .from('profile-images')
                .getPublicUrl(filePath);

            if (data?.publicUrl) {
                updates.profile_image_url = data.publicUrl;
            }

            return { previousImageUrl: currentImageUrl };
        }

        if (this.profileImageRemovalPending) {
            updates.profile_image_url = null;
            return { previousImageUrl: currentImageUrl };
        }

        return { previousImageUrl: null };
    },

    bindProfileImageDraftHandlers(rootElement, fallbackUser) {
        const root = rootElement || document;
        const imageInput = root.querySelector('#profileImageInput');

        if (imageInput && !imageInput.dataset.previewHandlerAttached) {
            imageInput.addEventListener('change', () => {
                const currentUser = Auth.getCurrentUser() || fallbackUser;
                const selectedFile = imageInput.files && imageInput.files[0]
                    ? imageInput.files[0]
                    : null;

                if (selectedFile) {
                    this.setProfileImageDraft(selectedFile);
                } else if (!this.profileImageRemovalPending) {
                    this.clearProfileImageDraft();
                }

                this.markSettingsAsDirty();
                this.renderProfileImageSettings(currentUser);
            });
            imageInput.dataset.previewHandlerAttached = 'true';
        }

        const deleteImgBtn = root.querySelector('#deleteProfileImageBtn');
        if (deleteImgBtn) {
            const newBtn = deleteImgBtn.cloneNode(true);
            deleteImgBtn.parentNode.replaceChild(newBtn, deleteImgBtn);

            newBtn.addEventListener('click', () => {
                const currentUser = Auth.getCurrentUser() || fallbackUser;

                if (this.profileImageDraftFile) {
                    this.clearProfileImageDraft({ resetInput: true, root });
                    this.renderProfileImageSettings(currentUser);
                    this.markSettingsAsDirty();
                    UI.showToast('Ausgewähltes Bild entfernt', 'info');
                    return;
                }

                if (!currentUser?.profile_image_url) {
                    UI.showToast('Es ist aktuell kein Profilbild hinterlegt.', 'info');
                    return;
                }

                if (confirm('Möchtest du dein Profilbild entfernen? Es wird erst nach dem Speichern endgültig gelöscht.')) {
                    this.resetProfileImageDraftState({ resetInput: true, root });
                    this.profileImageRemovalPending = true;
                    this.renderProfileImageSettings(currentUser);
                    this.markSettingsAsDirty();
                    UI.showToast('Profilbild wird nach dem Speichern entfernt', 'info');
                }
            });
        }
    },

    createProfileImageFallback(user) {
        const initials = UI.getUserInitials(UI.getUserDisplayName(user));
        const placeholder = document.createElement('div');
        placeholder.className = 'profile-avatar-preview profile-initials-placeholder';
        placeholder.innerHTML = `<span style="font-size: 2.5rem; font-weight: 700; color: white;">${initials}</span>`;
        placeholder.style.backgroundColor = 'var(--color-primary)';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        return placeholder;
    },

    // Render profile image in settings
    renderProfileImageSettings(user, options = {}) {
        const previewUrl = Object.prototype.hasOwnProperty.call(options, 'previewUrl')
            ? options.previewUrl
            : this.profileImageDraftUrl;
        const removePending = Object.prototype.hasOwnProperty.call(options, 'removePending')
            ? options.removePending
            : this.profileImageRemovalPending === true;
        const containers = document.querySelectorAll('#profileImageSettingsContainer');
        containers.forEach(container => {
            container.innerHTML = '';

            container.className = 'profile-avatar-container';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.borderRadius = '50%';
            container.style.overflow = 'hidden';

            const effectiveImageUrl = previewUrl || (removePending ? null : user.profile_image_url);

            if (effectiveImageUrl) {
                const img = document.createElement('img');
                img.src = effectiveImageUrl;
                img.alt = 'Profilbild';
                img.className = 'profile-avatar-preview';
                img.dataset.clickHandlerAdded = 'true';
                img.style.cursor = 'zoom-in';
                img.addEventListener('click', () => this.openProfileImagePreview(effectiveImageUrl));
                img.addEventListener('error', () => {
                    container.innerHTML = '';
                    container.appendChild(this.createProfileImageFallback(user));
                }, { once: true });
                container.appendChild(img);
            } else {
                container.appendChild(this.createProfileImageFallback(user));
            }
        });
    },

    // Render profile image in header
    renderProfileImageHeader(user) {
        const container = document.getElementById('headerProfileImage');
        if (!container) return;

        container.innerHTML = '';
        container.style.display = 'inline-block';
        container.style.backgroundColor = '';
        container.style.color = '';
        container.style.lineHeight = '';
        container.style.fontSize = '';
        container.style.fontWeight = '';
        container.style.textAlign = '';

        if (user.profile_image_url) {
            const img = document.createElement('img');
            img.src = user.profile_image_url;
            img.alt = 'Profilbild';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';
            img.addEventListener('error', () => {
                this.renderProfileImageHeader({ ...user, profile_image_url: null });
            }, { once: true });
            container.appendChild(img);
        } else {
            // Render initials
            const initials = UI.getUserInitials(UI.getUserDisplayName(user));
            container.style.backgroundColor = '#e5e7eb'; // Default light
            container.style.color = '#444';
            container.textContent = initials;
            // Adjust styles for text
            container.style.lineHeight = '36px';
            container.style.fontSize = '1.1em';
            container.style.fontWeight = '600';
            container.style.textAlign = 'center';
        }
    },


    // Render locations list
    async renderLocationsList() {
        const startTime = performance.now();
        const container = document.getElementById('locationsList');
        if (!container) return;

        // Ensure dropdowns are populated with latest calendars
        await this.populateCalendarDropdowns();

        let locations, calendars;

        // Check Cache
        if (this.locationsCache && this.calendarsCache) {
            Logger.info('[App] Using cached locations and calendars.');
            locations = this.locationsCache;
            calendars = this.calendarsCache;
        } else {
            locations = await Storage.getLocations();
            calendars = await Storage.getAllCalendars();
            this.locationsCache = locations || [];
            this.calendarsCache = calendars || [];
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            Logger.info(`Locations/Calendars Data Fetched (${duration}s)`);
        }

        // Update admin badge if present
        const badge = document.getElementById('adminLocationCount');
        if (badge) badge.textContent = locations ? locations.length : 0;

        // Create map of calendar names
        const calendarMap = {
            'tonstudio': '🎙️ Tonstudio',
            'festhalle': '🏛️ JMS Festhalle',
            'ankersaal': '⚓ Ankersaal'
        };

        // Add dynamic calendars to map
        if (calendars) {
            calendars.forEach(cal => {
                calendarMap[cal.id] = `📅 ${cal.name}`;
            });
        }

        if (!locations || locations.length === 0) {
            container.innerHTML = '<p class="text-muted">Keine Probeorte vorhanden.</p>';
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            Logger.info(`Locations Rendered – 0 items (${duration}s)`);
            return;
        }

        container.innerHTML = locations.map(loc => {
            // Support new format (linkedCalendar string) and old formats
            let linkedCalendar = loc.linkedCalendar || '';

            // Migration from old linkedCalendars object
            if (!linkedCalendar && loc.linkedCalendars) {
                if (loc.linkedCalendars.tonstudio) linkedCalendar = 'tonstudio';
                else if (loc.linkedCalendars.festhalle) linkedCalendar = 'festhalle';
                else if (loc.linkedCalendars.ankersaal) linkedCalendar = 'ankersaal';
            } else if (!linkedCalendar && loc.linkedToCalendar) {
                linkedCalendar = 'tonstudio';
            }

            const linkedBadge = linkedCalendar && calendarMap[linkedCalendar]
                ? `<br><span class="location-link">🔗 ${calendarMap[linkedCalendar]}</span>`
                : (linkedCalendar ? `<br><span class="location-link text-muted">🔗 Unbekannter Kalender</span>` : '');

            return `
                <div class="location-item">
                    <div class="location-info">
                        <strong>${Bands.escapeHtml(loc.name)}</strong>
                        ${loc.address ? `<br><small>${Bands.escapeHtml(loc.address)}</small>` : ''}
                        ${linkedBadge}
                    </div>
                    <div class="location-actions">
                        <button class="btn-icon edit-location" data-id="${loc.id}" title="Bearbeiten">✏️</button>
                        <button class="btn-icon delete-location" data-id="${loc.id}" title="Löschen">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        Logger.info(`Locations Rendered – ${locations.length} items (${duration}s)`);

        // Edit handlers
        container.querySelectorAll('.edit-location').forEach(btn => {
            btn.addEventListener('click', async () => {
                const locationId = btn.dataset.id;
                await this.openEditLocationModal(locationId);
            });
        });

        // Delete handlers
        container.querySelectorAll('.delete-location').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = await UI.confirmDelete('Möchtest du diesen Probeort wirklich löschen?');
                if (confirmed) {
                    await Storage.deleteLocation(btn.dataset.id);
                    this.locationsCache = null; // Invalidate cache
                    await this.renderLocationsList();
                    UI.showToast('Probeort gelöscht', 'success');
                }
            });
        });
    },

    // Render calendars list in settings
    async renderCalendarsList() {
        const startTime = performance.now();
        const container = document.getElementById('calendarsList');
        if (!container) return;

        let calendars;

        // Check Cache
        if (this.calendarsCache) {
            Logger.info('[App] Using cached calendars.');
            calendars = this.calendarsCache;
        } else {
            calendars = await Storage.getAllCalendars();
            this.calendarsCache = calendars || [];
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            Logger.info(`Calendars Data Fetched (${duration}s)`);
        }

        const badge = document.getElementById('adminCalendarCount');
        if (badge) badge.textContent = calendars ? calendars.length : 0;

        if (!calendars || calendars.length === 0) {
            container.innerHTML = '<p class="text-muted">Keine Kalender vorhanden. Füge einen neuen Kalender hinzu, um zu beginnen.</p>';
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            Logger.info(`Calendars Rendered – 0 items (${duration}s)`);
            return;
        }

        container.innerHTML = calendars.map(cal => {
            const icon = cal.icon || '📅';
            const isSystem = cal.is_system || false;

            return `
                <div class="calendar-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--color-border);">
                    <div>
                        <strong>${icon} ${Bands.escapeHtml(cal.name)}</strong>
                        ${isSystem ? '<span style="color: var(--color-text-secondary); font-size: 0.75rem; margin-left: 0.5rem;">🔒 System</span>' : ''}
                        <br><small style="color: var(--color-text-secondary); font-size: 0.875rem; word-break: break-all;">${Bands.escapeHtml(cal.ical_url || '')}</small>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-icon edit-calendar" data-id="${cal.id}" title="Bearbeiten">✏️</button>
                        <button class="btn-icon delete-calendar" data-id="${cal.id}" title="Löschen" ${isSystem ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        // Edit handlers
        container.querySelectorAll('.edit-calendar').forEach(btn => {
            btn.addEventListener('click', async () => {
                const calendarId = btn.dataset.id;
                await this.openCalendarModal(calendarId);
            });
        });

        // Delete handlers
        container.querySelectorAll('.delete-calendar:not([disabled])').forEach(btn => {
            btn.addEventListener('click', async () => {
                const calendarId = btn.dataset.id;
                await this.deleteCalendar(calendarId);
            });
        });

        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        Logger.info(`Calendars Rendered – ${calendars.length} items (${duration}s)`);
    },

    // Open calendar modal for add or edit
    async openCalendarModal(calendarId = null) {
        const modal = document.getElementById('calendarModal');
        const form = document.getElementById('calendarForm');
        const title = document.getElementById('calendarModalTitle');
        const editIdInput = document.getElementById('editCalendarId');
        const nameInput = document.getElementById('calendarName');
        const iconInput = document.getElementById('calendarIcon');
        const urlInput = document.getElementById('calendarUrl');

        if (calendarId) {
            // Edit mode
            const calendar = await Storage.getCalendar(calendarId);
            if (!calendar) {
                UI.showToast('Kalender nicht gefunden', 'error');
                return;
            }

            title.textContent = 'Kalender bearbeiten';
            editIdInput.value = calendar.id;
            nameInput.value = calendar.name;
            iconInput.value = calendar.icon || '';
            urlInput.value = calendar.ical_url || '';
        } else {
            // Add mode
            title.textContent = 'Neuen Kalender hinzufügen';
            editIdInput.value = '';
            form.reset();
        }

        UI.openModal('calendarModal');
    },

    // Handle calendar form submission
    async handleCalendarForm() {
        console.log('[handleCalendarForm] Starting calendar form submission');
        const editIdInput = document.getElementById('editCalendarId');
        const nameInput = document.getElementById('calendarName');
        const iconInput = document.getElementById('calendarIcon');
        const urlInput = document.getElementById('calendarUrl');

        const calendarId = editIdInput.value;
        const name = nameInput.value.trim();
        const icon = iconInput.value.trim() || '📅';
        const icalUrl = urlInput.value.trim();

        console.log('[handleCalendarForm] Form data:', { calendarId, name, icon, icalUrl });

        if (!name || !icalUrl) {
            UI.showToast('Bitte fülle alle Pflichtfelder aus', 'error');
            return;
        }

        // Show loading indicator immediately (no delay)
        UI.showLoading('Kalender wird gespeichert...', 0);

        try {
            console.log('[handleCalendarForm] Attempting to save calendar...');
            let result;
            if (calendarId) {
                // Update existing calendar
                console.log('[handleCalendarForm] Updating calendar with ID:', calendarId);
                result = await Storage.updateCalendar(calendarId, {
                    name,
                    icon,
                    ical_url: icalUrl
                });
                console.log('[handleCalendarForm] Calendar updated:', result);
                UI.showToast('Kalender aktualisiert', 'success');
            } else {
                // Create new calendar
                console.log('[handleCalendarForm] Creating new calendar...');
                result = await Storage.createCalendar({
                    name,
                    icon,
                    ical_url: icalUrl,
                    is_system: false
                });
                console.log('[handleCalendarForm] Calendar created:', result);
                UI.showToast('Kalender erstellt', 'success');
            }

            this.invalidateSettingsCache();
            console.log('[handleCalendarForm] Closing modal and refreshing data...');
            UI.closeModal('calendarModal');

            // Refresh calendar data
            console.log('[handleCalendarForm] Rendering calendars list...');
            await this.renderCalendarsList();
            console.log('[handleCalendarForm] Rendering locations list...');
            await this.renderLocationsList();
            console.log('[handleCalendarForm] Rendering calendar tabs...');
            await this.renderProbeorteCalendarTabs();

            // Reload Calendar module
            console.log('[handleCalendarForm] Reinitializing Calendar module...');
            if (typeof Calendar.initCalendars === 'function') {
                await Calendar.initCalendars();
            }

            console.log('[handleCalendarForm] Calendar saved successfully!');
        } catch (error) {
            console.error('[handleCalendarForm] Error saving calendar:', error);
            console.error('[handleCalendarForm] Error stack:', error.stack);
            console.error('[handleCalendarForm] Error details:', {
                message: error.message,
                name: error.name,
                code: error.code
            });
            UI.showToast('Fehler beim Speichern: ' + error.message, 'error');
        } finally {
            // Always hide loading indicator
            UI.hideLoading();
        }
    },

    // Delete calendar
    async deleteCalendar(calendarId) {
        const calendar = await Storage.getCalendar(calendarId);
        if (!calendar) return;

        if (calendar.is_system) {
            UI.showToast('System-Kalender können nicht gelöscht werden', 'error');
            return;
        }

        const confirmed = await UI.confirmDelete(`Möchtest du den Kalender "${calendar.name}" wirklich löschen? Probeorte, die mit diesem Kalender verknüpft sind, verlieren ihre Verknüpfung.`);

        if (confirmed) {
            try {
                // Remove calendar from linked locations
                const locations = await Storage.getLocations();
                for (const loc of locations) {
                    if (loc.linkedCalendar === calendarId) {
                        await Storage.updateLocation(loc.id, { linkedCalendar: '' });
                    }
                }

                await Storage.deleteCalendar(calendarId);
                this.invalidateSettingsCache();
                UI.showToast('Kalender gelöscht', 'success');
                await this.renderCalendarsList();
                await this.renderLocationsList();
                await this.renderProbeorteCalendarTabs(); // Refresh calendar tabs

                // Reload Calendar module
                if (typeof Calendar.initCalendars === 'function') {
                    await Calendar.initCalendars();
                }
            } catch (error) {
                console.error('Error deleting calendar:', error);
                UI.showToast('Fehler beim Löschen: ' + error.message, 'error');
            }
        }
    },

    // Render all bands list for management
    async renderAllBandsList() {
        const container = document.getElementById('allBandsList');
        if (!container) return;

        let bands;
        if (this.allBandsCache) {
            Logger.info('[App] Using cached all bands list.');
            bands = this.allBandsCache;
        } else {
            bands = await Storage.getAllBands();
            if (!Array.isArray(bands)) {
                bands = [];
            }
            this.allBandsCache = bands;
        }

        if (!Array.isArray(bands)) {
            bands = [];
        }

        const badge = document.getElementById('adminBandCount');
        if (badge) badge.textContent = bands ? bands.length : 0;

        if (bands.length === 0) {
            container.innerHTML = '<p class="text-muted">Keine Bands vorhanden.</p>';
            return;
        }

        container.innerHTML = await Promise.all(bands.map(async band => {
            const bandMembers = await Storage.getBandMembers(band.id);
            const members = Array.isArray(bandMembers) ? bandMembers : [];
            const isExpanded = this.expandedBandId === band.id;
            const memberCards = await Promise.all(members.map(async member => {
                const user = await Storage.getById('users', member.userId);
                const displayName = user
                    ? ((typeof UI.getUserDisplayName === 'function')
                        ? UI.getUserDisplayName(user)
                        : ((user.first_name && user.last_name)
                            ? `${user.first_name} ${user.last_name}`
                            : (user.username || 'Unbekannt')))
                    : 'Benutzer nicht gefunden';
                const secondaryLabel = user
                    ? (user.username ? `@${user.username}` : (user.email || 'Kein Benutzername'))
                    : `ID: ${member.userId}`;
                const initials = (typeof UI.getUserInitials === 'function')
                    ? UI.getUserInitials(displayName)
                    : (displayName || '?').charAt(0).toUpperCase();
                const roleClass = `role-${member.role}`;
                const roleText = member.role === 'leader' ? 'Leiter' :
                    member.role === 'co-leader' ? 'Co-Leiter' : 'Mitglied';

                return `
                    <div class="band-admin-member-card">
                        <span class="band-admin-member-avatar">${Bands.escapeHtml(initials)}</span>
                        <div class="band-admin-member-copy">
                            <strong>${Bands.escapeHtml(displayName)}</strong>
                            <small>${Bands.escapeHtml(secondaryLabel)}</small>
                        </div>
                        <span class="role-badge ${roleClass}">${roleText}</span>
                    </div>
                `;
            }));

            return `
                <div class="band-management-card accordion-card ${isExpanded ? 'expanded' : ''}" data-band-id="${band.id}">
                    <div class="accordion-header" data-band-id="${band.id}">
                        <div class="accordion-title">
                            <h4>${Bands.escapeHtml(band.name)}</h4>
                            <p class="band-meta">
                                <span>${members.length} Mitglieder</span>
                                <span>Code <code id="joinCode_${band.id}">${band.joinCode}</code></span>
                            </p>
                        </div>
                        <div class="accordion-actions">
                            <button class="btn btn-secondary btn-sm copy-code-btn" data-code="${band.joinCode}" data-id="${band.id}">Code kopieren</button>
                            <button class="btn btn-danger btn-sm delete-band-admin" data-id="${band.id}">Löschen</button>
                            <button class="accordion-toggle" aria-label="Ausklappen">
                                <span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span>
                            </button>
                        </div>
                    </div>

                    <div class="accordion-content" style="display: ${isExpanded ? 'block' : 'none'};">
                        <div class="accordion-body">
                            <div class="band-details-expanded">
                                ${band.description ? `
                                    <div class="detail-row">
                                        <div class="detail-label">Beschreibung</div>
                                        <div class="detail-value">${Bands.escapeHtml(band.description)}</div>
                                    </div>
                                ` : ''}

                                <div class="detail-row detail-row-members">
                                    <div class="detail-label">Mitglieder (${members.length})</div>
                                    <div class="detail-value detail-value-members">
                                        ${members.length > 0
                                            ? `<div class="band-admin-member-list">${memberCards.join('')}</div>`
                                            : '<p class="text-muted">Keine Mitglieder</p>'}
                                    </div>
                                </div>

                                <div class="detail-row">
                                    <div class="detail-label">Erstellt</div>
                                    <div class="detail-value">${UI.formatDate(band.createdAt)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        })).then(results => results.join(''));

        // Add accordion toggle handlers
        container.querySelectorAll('.band-management-card .accordion-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking on delete button
                if (e.target.closest('.delete-band-admin')) {
                    return;
                }
                const bandId = header.dataset.bandId;
                this.toggleBandAccordion(bandId);
            });
        });

        // Add delete handlers
        container.querySelectorAll('.delete-band-admin').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const bandId = btn.dataset.id;
                const band = await Storage.getBand(bandId);
                const confirmed = await UI.confirmDelete(`Möchtest du die Band "${band.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`);
                if (confirmed) {
                    await Storage.deleteBand(bandId);
                    this.allBandsCache = null; // Invalidate cache
                    await this.renderAllBandsList();
                    // Refresh band cards in "Meine Bands" view
                    if (typeof Bands.renderBands === 'function') {
                        await Bands.renderBands();
                    }
                    // Always update dashboard after band deletion
                    if (typeof App.updateDashboard === 'function') {
                        await App.updateDashboard();
                    }
                    // Show/hide 'Neuer Auftritt' and 'Neuer Probetermin' buttons
                    await this.updatePlanningCreationButtons();
                    UI.showToast('Band gelöscht', 'success');
                }
            });
        });

        // Add copy code handlers
        container.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = btn.dataset.code;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(code).then(() => {
                        UI.showToast('Beitrittscode in die Zwischenablage kopiert', 'success');
                    }).catch(() => {
                        UI.showToast('Konnte Code nicht kopieren', 'error');
                    });
                } else {
                    // Fallback: select the code element text
                    const codeEl = document.getElementById(`joinCode_${btn.dataset.id}`);
                    if (codeEl) {
                        const range = document.createRange();
                        range.selectNodeContents(codeEl);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        try {
                            document.execCommand('copy');
                            UI.showToast('Beitrittscode in die Zwischenablage kopiert', 'success');
                        } catch (err) {
                            UI.showToast('Konnte Code nicht kopieren', 'error');
                        }
                        sel.removeAllRanges();
                    }
                }
            });
        });
    },

    // Toggle band accordion in management view
    toggleBandAccordion(bandId) {
        const card = document.querySelector(`.band-management-card[data-band-id="${bandId}"]`);
        if (!card) return;

        const content = card.querySelector('.accordion-content');
        const toggle = card.querySelector('.toggle-icon');
        const wasExpanded = this.expandedBandId === bandId;

        // Close all accordions
        document.querySelectorAll('.band-management-card').forEach(c => {
            c.classList.remove('expanded');
            const cont = c.querySelector('.accordion-content');
            const tog = c.querySelector('.toggle-icon');
            if (cont) cont.style.display = 'none';
            if (tog) tog.textContent = '▶';
        });

        // If it was already expanded, just close it
        if (wasExpanded) {
            this.expandedBandId = null;
        } else {
            // Open this accordion
            card.classList.add('expanded');
            if (content) content.style.display = 'block';
            if (toggle) toggle.textContent = '▼';
            this.expandedBandId = bandId;
        }
    },

    // Render users list (Admin only)
    async renderUsersList() {
        if (!Auth.isAdmin()) return;

        const container = document.getElementById('usersList');
        const users = await Storage.getAll('users');

        const badge = document.getElementById('adminUserCount');
        if (badge) badge.textContent = users ? users.length : 0;

        if (!users || users.length === 0) {
            container.innerHTML = '<p class="text-muted">Keine Benutzer vorhanden.</p>';
            return;
        }

        // Sort users: admins first, then by last name
        users.sort((a, b) => {
            if (a.isAdmin && !b.isAdmin) return -1;
            if (!a.isAdmin && b.isAdmin) return 1;
            const aName = a.last_name || a.username;
            const bName = b.last_name || b.username;
            return aName.localeCompare(bName);
        });

        container.innerHTML = await Promise.all(users.map(async user => {
            // Get user's bands
            const userBands = await Storage.getUserBands(user.id);
            // userBands is an array of band objects with .name, .role, .color
            const currentUser = Auth.getCurrentUser();
            const isCurrentUser = currentUser ? currentUser.id === user.id : false;

            return `
                <div class="user-management-card">
                    <div class="user-card-header">
                        <div class="user-card-info">
                            <div class="user-title-row">
                                <h4>
                                    ${Bands.escapeHtml((user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : user.username)}
                                </h4>
                                ${user.isAdmin ? '<span class="admin-badge">👑 ADMIN</span>' : ''}
                            </div>
                            <div class="user-meta">
                                <span>👤 @${Bands.escapeHtml(user.username)}</span>
                                <span>📧 ${Bands.escapeHtml(user.email)}</span>
                                ${user.instrument ? (() => {
                                    try {
                                        const parsed = JSON.parse(user.instrument);
                                        if (Array.isArray(parsed) && parsed.length > 0) {
                                            return `<span>🎵 ${parsed.map(i => Bands.getInstrumentName(i)).join(', ')}</span>`;
                                        } else if (typeof user.instrument === 'string' && !user.instrument.startsWith('[')) {
                                            return `<span>🎵 ${Bands.getInstrumentName(user.instrument)}</span>`;
                                        }
                                        return '';
                                    } catch (e) {
                                        return `<span>🎵 ${Bands.getInstrumentName(user.instrument)}</span>`;
                                    }
                                })() : ''}
                            </div>
                        </div>
                        <div class="user-card-actions">
                            ${!user.isAdmin ? `
                                <button class="btn btn-sm btn-primary make-admin-btn" data-user-id="${user.id}" title="Zum Admin machen">
                                    👑 Admin machen
                                </button>
                            ` : (isCurrentUser ? '' : `
                                <button class="btn btn-sm btn-secondary remove-admin-btn" data-user-id="${user.id}" title="Admin entfernen">
                                    Admin entfernen
                                </button>
                            `)}
                            ${!isCurrentUser ? `
                                <button class="btn btn-sm btn-danger delete-user-btn" data-user-id="${user.id}" title="Benutzer löschen">
                                    🗑️ Löschen
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    ${userBands.length > 0 ? `
                        <div class="user-bands-list">
                            <h5>Bands (${userBands.length})</h5>
                            <div class="user-band-tags">
                                ${userBands.map(band => `
                                    <span class="user-band-tag" style="border-left: 3px solid ${band.color || '#6366f1'}">
                                        <span class="ub-name">${Bands.escapeHtml(band.name)}</span>
                                        <span class="role-badge role-${band.role}">${UI.getRoleDisplayName(band.role)}</span>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : '<div class="user-no-bands">Nicht in einer Band</div>'}
                </div>
            `;
        })).then(results => results.join(''));

        // Add event listeners
        container.querySelectorAll('.make-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const userId = btn.dataset.userId;
                    const user = await Storage.getById('users', userId);
                    if (!user) {
                        UI.showToast('Benutzer nicht gefunden', 'error');
                        return;
                    }

                    const confirmed = await UI.confirmAction(
                        `Möchtest du ${(user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : user.username} wirklich zum Admin machen? Als Admin hat dieser Benutzer vollen Zugriff auf alle Funktionen.`,
                        'Admin-Rechte erteilen?',
                        'Zum Admin machen',
                        'btn-primary'
                    );

                    if (confirmed) {
                        await this.toggleUserAdmin(userId, true);
                    }
                } catch (error) {
                    console.error('Error in make-admin-btn handler:', error);
                    UI.showToast('Fehler: ' + error.message, 'error');
                }
            });
        });

        container.querySelectorAll('.remove-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const userId = btn.dataset.userId;
                    const user = await Storage.getById('users', userId);
                    if (!user) {
                        UI.showToast('Benutzer nicht gefunden', 'error');
                        return;
                    }

                    const confirmed = await UI.confirmAction(
                        `Möchtest du die Admin-Rechte von ${(user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : user.username} wirklich entfernen?`,
                        'Admin-Rechte entfernen?',
                        'Admin entfernen',
                        'btn-secondary'
                    );

                    if (confirmed) {
                        await this.toggleUserAdmin(userId, false);
                    }
                } catch (error) {
                    console.error('Error in remove-admin-btn handler:', error);
                    UI.showToast('Fehler: ' + error.message, 'error');
                }
            });
        });

        container.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const userId = btn.dataset.userId;
                    console.log('Delete user button clicked for:', userId);

                    const user = await Storage.getById('users', userId);
                    console.log('User found:', user);

                    if (!user) {
                        UI.showToast('Benutzer nicht gefunden', 'error');
                        return;
                    }

                    const confirmed = await UI.confirmDelete(`Möchtest du den Benutzer ${(user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : user.username} wirklich löschen? Dies kann nicht rückgängig gemacht werden!`);
                    console.log('User confirmed deletion:', confirmed);

                    if (confirmed) {
                        await this.deleteUser(userId);
                    }
                } catch (error) {
                    console.error('Error in delete-user-btn handler:', error);
                    UI.showToast('Fehler beim Löschen: ' + error.message, 'error');
                }
            });
        });
    },

    // Toggle user admin status
    async toggleUserAdmin(userId, makeAdmin) {
        try {
            console.log('Toggling admin status:', { userId, makeAdmin });

            const sb = SupabaseClient.getClient();
            if (!sb) {
                throw new Error('Supabase Client nicht verfügbar');
            }

            // First verify the user exists
            const { data: existingUser, error: fetchError } = await sb
                .from('users')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (fetchError) {
                console.error('Error fetching user:', fetchError);
                throw new Error('Benutzer konnte nicht gefunden werden');
            }

            if (!existingUser) {
                throw new Error('Benutzer existiert nicht');
            }

            console.log('Current user state:', existingUser);

            // Update admin status without expecting a return value
            const { error: updateError } = await sb
                .from('users')
                .update({ isAdmin: makeAdmin })
                .eq('id', userId);

            if (updateError) {
                console.error('Supabase error toggling admin:', updateError);
                throw new Error(updateError.message || 'Fehler beim Aktualisieren');
            }

            console.log('Admin status updated successfully');
            UI.showToast(makeAdmin ? 'Benutzer ist jetzt Admin' : 'Admin-Rechte entfernt', 'success');
            await this.renderUsersList();
        } catch (error) {
            console.error('Error toggling admin:', error);
            UI.showToast('Fehler beim Ändern der Admin-Rechte: ' + error.message, 'error');
        }
    },

    // Delete user
    async deleteUser(userId) {
        try {
            console.log('Deleting user:', userId);
            UI.showLoading('Lösche Benutzer...');

            // Remove user from all bands
            const userBands = await Storage.getUserBands(userId);
            console.log('User bands:', userBands);
            for (const ub of userBands) {
                await Storage.removeBandMember(ub.bandId, userId);
            }

            // Delete all user's votes
            const sb = SupabaseClient.getClient();
            if (sb) {
                const { error } = await sb.from('votes').delete().eq('userId', userId);
                if (error) {
                    console.error('Error deleting votes:', error);
                }
            }

            await Auth.deleteAuthUserById(userId);

            // Delete user
            const deleted = await Storage.delete('users', userId);
            if (!deleted) {
                throw new Error('Benutzer konnte nicht gelöscht werden (RLS/Policy?)');
            }

            console.log('User deleted successfully');
            UI.hideLoading();
            UI.showToast('Benutzer gelöscht', 'success');
            await this.renderUsersList();
        } catch (error) {
            UI.hideLoading();
            console.error('Error deleting user:', error);
            UI.showToast('Fehler beim Löschen des Benutzers: ' + error.message, 'error');
        }
    },

    // Helper: Compress image if larger than 100KB
    async compressImage(file) {
        const MAX_SIZE = 100 * 1024; // 100KB
        if (file.size <= MAX_SIZE) return file;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max dimensions
                const MAX_DIMENSION = 1200;
                if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    if (width > height) {
                        height = Math.round((height * MAX_DIMENSION) / width);
                        width = MAX_DIMENSION;
                    } else {
                        width = Math.round((width * MAX_DIMENSION) / height);
                        height = MAX_DIMENSION;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Reduce quality
                let quality = 0.9;
                const tryCompress = () => {
                    canvas.toBlob(blob => {
                        if (!blob) {
                            reject(new Error('Compression failed'));
                            return;
                        }
                        if (blob.size <= MAX_SIZE || quality <= 0.1) {
                            const compressedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now(),
                            });
                            resolve(compressedFile);
                        } else {
                            quality -= 0.1;
                            tryCompress();
                        }
                    }, 'image/jpeg', quality);
                };
                tryCompress();
            };
            img.onerror = (err) => reject(err);
        });
    },

    // Handle profile update
    async handleUpdateProfile() {
        const username = document.getElementById('profileUsername').value;
        const email = document.getElementById('profileEmail').value;
        const instrument = document.getElementById('profileInstrument').value;
        const password = document.getElementById('profilePassword').value;
        const imageInput = document.getElementById('profileImageInput');

        const user = Auth.getCurrentUser();
        if (!user) return;

        UI.showLoading('Profil wird aktualisiert...');

        try {
            // Update in users table
            const updates = {
                username,
                email,
                instrument
            };

            // Handle Image Upload
            if (imageInput && imageInput.files && imageInput.files[0]) {
                let file = imageInput.files[0];

                // Compress if needed with timeout
                try {
                    const compressionPromise = this.compressImage(file);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Bildkomprimierung Zeitüberschreitung')), 5000)
                    );
                    file = await Promise.race([compressionPromise, timeoutPromise]);
                } catch (cErr) {
                    console.warn('Image compression failed or timed out, trying original file', cErr);
                }

                const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
                const filePath = `${user.id}/${Date.now()}-profile.${fileExt}`;

                const sb = SupabaseClient.getClient();

                const { error: uploadError } = await sb.storage
                    .from('profile-images')
                    .upload(filePath, file, {
                        upsert: true
                    });

                if (uploadError) {
                    throw new Error('Fehler beim Bilder-Upload: ' + uploadError.message);
                }

                const { data } = sb.storage
                    .from('profile-images')
                    .getPublicUrl(filePath);

                if (data && data.publicUrl) {
                    updates.profile_image_url = data.publicUrl;
                }
            }

            // Update password if provided
            if (password && password.trim() !== '') {
                updates.password = password;
            }

            // Update in DB
            await Storage.updateUser(user.id, updates);

            // Update email in Supabase Auth if changed
            if (email !== user.email) {
                const sb = SupabaseClient.getClient();
                const { error } = await sb.auth.updateUser({ email });
                if (error) {
                    console.error('Error updating auth email:', error);
                    UI.showToast('E-Mail aktualisiert, aber Login-Email bleibt alt (Auth-Fehler)', 'warning');
                }
            }

            // Update password in Supabase Auth if provided
            if (password && password.trim() !== '') {
                const sb = SupabaseClient.getClient();
                const { error } = await sb.auth.updateUser({ password });
                if (error) {
                    console.error('Error updating password:', error);
                }
            }

            // Update current session user data
            await Auth.updateCurrentUser();
            const updatedUser = {
                ...(Auth.getCurrentUser() || user),
                ...updates,
                id: user.id
            };
            Auth.currentUser = updatedUser;
            this.clearProfileImageDraft();

            // Update header
            document.getElementById('currentUserName').textContent = updatedUser.username;
            this.renderProfileImageHeader(updatedUser);

            // Clear password field after successful update
            document.getElementById('profilePassword').value = '';

            // Update inputs
            document.getElementById('profileUsername').value = updatedUser.username;
            document.getElementById('profileEmail').value = updatedUser.email;
            document.getElementById('profileInstrument').value = updatedUser.instrument || '';

            UI.showToast('Profil erfolgreich aktualisiert', 'success');

            // Refresh settings view to show updated values if open
            // but handleUpdateProfile is often used from modal which might not be settings view
            // If this is used, we might want to also re-render settings list
            // Refresh settings view to show updated values if open
            // but handleUpdateProfile is often used from modal which might not be settings view
            // If this is used, we might want to also re-render settings list
            const settingsView = document.getElementById('settingsView');
            if (settingsView && settingsView.classList.contains('active')) {
                await this.renderSettingsView();
            }

        } catch (error) {
            console.error('Error updating profile:', error);
            UI.showToast('Fehler beim Aktualisieren: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    },

    // Handle create location
    async handleCreateLocation() {
        const nameInput = document.getElementById('newLocationName');
        const addressInput = document.getElementById('newLocationAddress');
        const linkedCalendarSelect = document.getElementById('newLocationLinkedCalendar');

        const name = nameInput.value;
        const address = addressInput.value;
        const linkedCalendar = linkedCalendarSelect.value;



        if (name) {
            await Storage.createLocation({ name, address, linkedCalendar });
            this.invalidateSettingsCache();
            nameInput.value = '';
            addressInput.value = '';
            linkedCalendarSelect.value = '';
            await this.renderLocationsList();
            await this.populateCalendarDropdowns(); // Refresh dropdowns
            UI.showToast('Probeort erstellt', 'success');
        }
    },

    // Populate calendar dropdowns dynamically
    async populateCalendarDropdowns() {
        const dropdowns = [
            document.getElementById('newLocationLinkedCalendar'),
            document.getElementById('editLocationLinkedCalendar')
        ];

        const calendars = await Storage.getAllCalendars();

        dropdowns.forEach(dropdown => {
            if (!dropdown) return;

            const currentValue = dropdown.value;
            dropdown.innerHTML = `
                <option value="">Nicht verknüpft</option>
                <option disabled>──────────</option>
            `;

            // Add system calendars first (hardcoded IDs)
            const systemCalendarIds = ['tonstudio', 'festhalle', 'ankersaal'];
            const systemCalendars = calendars.filter(cal =>
                systemCalendarIds.includes(cal.id) || cal.is_system
            );
            const userCalendars = calendars.filter(cal =>
                !systemCalendarIds.includes(cal.id) && !cal.is_system
            );

            systemCalendars.forEach(cal => {
                const icon = cal.icon || '📅';
                const option = document.createElement('option');
                option.value = cal.id;
                option.textContent = `${icon} ${cal.name}`;
                dropdown.appendChild(option);
            });

            if (userCalendars.length > 0) {
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '──────────';
                dropdown.appendChild(separator);

                userCalendars.forEach(cal => {
                    const icon = cal.icon || '📅';
                    const option = document.createElement('option');
                    option.value = cal.id;
                    option.textContent = `${icon} ${cal.name}`;
                    dropdown.appendChild(option);
                });
            }

            // Restore previous value if it still exists
            if (currentValue && dropdown.querySelector(`option[value="${currentValue}"]`)) {
                dropdown.value = currentValue;
            }
        });
    },

    // Open quick add calendar modal (from location form)
    async openQuickAddCalendarModal() {
        const modal = document.getElementById('quickAddCalendarModal');
        const form = document.getElementById('quickAddCalendarForm');
        form.reset();
        UI.openModal('quickAddCalendarModal');
    },

    // Handle quick add calendar form
    async handleQuickAddCalendarForm() {
        const nameInput = document.getElementById('quickCalendarName');
        const iconInput = document.getElementById('quickCalendarIcon');
        const urlInput = document.getElementById('quickCalendarUrl');

        const name = nameInput.value.trim();
        const icon = iconInput.value.trim() || '📅';
        const icalUrl = urlInput.value.trim();

        if (!name || !icalUrl) {
            UI.showToast('Bitte fülle alle Pflichtfelder aus', 'error');
            return;
        }

        try {
            const newCalendar = await Storage.createCalendar({
                name,
                icon,
                ical_url: icalUrl,
                is_system: false
            });

            UI.showToast('Kalender erstellt', 'success');
            UI.closeModal('quickAddCalendarModal');

            // Reload calendars and populate dropdowns
            if (typeof Calendar.initCalendars === 'function') {
                await Calendar.initCalendars();
            }
            await this.populateCalendarDropdowns();
            await this.renderCalendarsList();
            await this.renderProbeorteCalendarTabs(); // Refresh calendar tabs

            // Select the newly created calendar in the dropdown
            const dropdown = document.getElementById('newLocationLinkedCalendar');
            if (dropdown && newCalendar && newCalendar.id) {
                dropdown.value = newCalendar.id;
            }
        } catch (error) {
            console.error('Error creating calendar:', error);
            UI.showToast('Fehler beim Erstellen: ' + error.message, 'error');
        }
    },

    // Render dynamic calendar tabs for Probeorte view
    async renderProbeorteCalendarTabs() {
        const calendars = await Storage.getAllCalendars();

        // Get submenu container
        const submenu = document.querySelector('#probeorteView .calendar-submenu');
        const calendarSection = document.querySelector('#probeorteView .section');

        if (!submenu || !calendarSection) {
            console.warn('[renderProbeorteCalendarTabs] Submenu or section container not found');
            return;
        }

        submenu.classList.add('probeorte-submenu');
        calendarSection.classList.add('probeorte-calendar-section');

        // Clear existing tabs and containers
        submenu.innerHTML = '';

        // Remove old calendar containers
        calendarSection.querySelectorAll('.calendar-container').forEach(container => {
            container.remove();
        });
        calendarSection.querySelectorAll('.probeorte-empty-state').forEach(emptyState => {
            emptyState.remove();
        });

        if (!calendars || calendars.length === 0) {
            calendarSection.innerHTML = '<div class="probeorte-empty-state">Keine Kalender vorhanden.</div>';
            return;
        }

        // Sort calendars: system calendars first
        const systemCalendars = calendars.filter(cal => cal.is_system);
        const userCalendars = calendars.filter(cal => !cal.is_system);
        const sortedCalendars = [...systemCalendars, ...userCalendars];

        let firstCalendarId = null;

        // Create tabs and containers for each calendar
        sortedCalendars.forEach((cal, index) => {
            const calId = cal.id;
            const icon = cal.icon || '📅';
            const name = cal.name;

            if (index === 0) firstCalendarId = calId;

            // Create tab button
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn ${index === 0 ? 'btn-primary active' : 'btn-secondary'} personal-calendar-action-btn calendar-tab`;
            button.dataset.calendar = calId;
            button.innerHTML = `
                <span class="calendar-tab-icon" aria-hidden="true">${this.escapeHtml(icon)}</span>
                <span class="calendar-tab-label">${this.escapeHtml(name)}</span>
            `;
            button.addEventListener('click', async () => {
                // Remove active class from all tabs and containers
                submenu.querySelectorAll('.calendar-tab').forEach(tab => {
                    tab.classList.remove('active', 'btn-primary');
                    if (!tab.classList.contains('btn-secondary')) {
                        tab.classList.add('btn-secondary');
                    }
                });
                calendarSection.querySelectorAll('.calendar-container').forEach(cont => cont.classList.remove('active'));

                // Add active class to clicked tab and its container
                button.classList.remove('btn-secondary');
                button.classList.add('btn-primary');
                button.classList.add('active');
                const container = document.getElementById(`${calId}Calendar`);
                if (container) {
                    container.classList.add('active');
                }

                // Load calendar if not yet loaded
                if (typeof Calendar !== 'undefined' && Calendar.loadCalendar) {
                    await Calendar.loadCalendar(calId);
                }
            });
            submenu.appendChild(button);

            // Create calendar container
            const containerDiv = document.createElement('div');
            containerDiv.id = `${calId}Calendar`;
            containerDiv.className = `calendar-container probeorte-calendar-panel ${index === 0 ? 'active' : ''}`;
            containerDiv.innerHTML = `
                <div id="${calId}EventsContainer" style="min-height: 400px;">
                    <!-- Events will be rendered here -->
                </div>
            `;
            calendarSection.appendChild(containerDiv);
        });

        // Load first calendar automatically
        if (firstCalendarId && typeof Calendar !== 'undefined' && Calendar.loadCalendar) {
            setTimeout(() => {
                Calendar.loadCalendar(firstCalendarId);
            }, 100);
        }
    },


    // Open edit location modal
    async openEditLocationModal(locationId) {
        const location = await Storage.getLocation(locationId);
        if (!location) return;

        document.getElementById('editLocationId').value = location.id;
        document.getElementById('editLocationName').value = location.name;
        document.getElementById('editLocationAddress').value = location.address || '';

        // Support both old formats (linkedToCalendar, linkedCalendars) and new (linkedCalendar)
        let linkedCalendar = location.linkedCalendar || '';

        // Migration from old format
        if (!linkedCalendar && location.linkedCalendars) {
            if (location.linkedCalendars.tonstudio) linkedCalendar = 'tonstudio';
            else if (location.linkedCalendars.festhalle) linkedCalendar = 'festhalle';
            else if (location.linkedCalendars.ankersaal) linkedCalendar = 'ankersaal';
        } else if (!linkedCalendar && location.linkedToCalendar) {
            linkedCalendar = 'tonstudio'; // Old single calendar was always tonstudio
        }

        document.getElementById('editLocationLinkedCalendar').value = linkedCalendar;

        UI.openModal('editLocationModal');
    },

    // Handle edit location
    async handleEditLocation() {
        const locationId = document.getElementById('editLocationId').value;
        const name = document.getElementById('editLocationName').value;
        const address = document.getElementById('editLocationAddress').value;
        const linkedCalendar = document.getElementById('editLocationLinkedCalendar').value;

        if (name) {
            await Storage.updateLocation(locationId, { name, address, linkedCalendar });
            this.invalidateSettingsCache();
            UI.closeModal('editLocationModal');
            await this.renderLocationsList();
            UI.showToast('Probeort aktualisiert', 'success');
        }
    },

    // Check if location is available (for calendar-linked locations)
    async checkLocationAvailability(locationId, startDate, endDate) {
        const location = await Storage.getLocation(locationId);

        // Support new format (linkedCalendar string) and old formats
        let linkedCalendar = location.linkedCalendar || '';

        // Migration from old formats
        if (!linkedCalendar && location.linkedCalendars) {
            if (location.linkedCalendars.tonstudio) linkedCalendar = 'tonstudio';
            else if (location.linkedCalendars.festhalle) linkedCalendar = 'festhalle';
            else if (location.linkedCalendars.ankersaal) linkedCalendar = 'ankersaal';
        } else if (!linkedCalendar && location.linkedToCalendar) {
            linkedCalendar = 'tonstudio';
        }

        if (!location || !linkedCalendar) {
            // Location not linked to any calendar, always available
            return { available: true };
        }

        // Check calendar for conflicts
        if (typeof Calendar === 'undefined' || !Calendar.calendars) {
            console.warn('Calendar not loaded, skipping availability check');
            return { available: true };
        }

        const startTime = new Date(startDate);
        const endTime = new Date(endDate);

        // Check the linked calendar
        const calendar = Calendar.calendars[linkedCalendar];
        if (!calendar || !calendar.events || calendar.events.length === 0) {
            return { available: true };
        }

        // Find overlapping events
        const conflicts = calendar.events.filter(event => {
            const eventStart = new Date(event.startDate);
            const eventEnd = new Date(event.endDate);

            // Check if times overlap
            return (startTime < eventEnd && endTime > eventStart);
        });

        if (conflicts.length > 0) {
            return {
                available: false,
                conflicts: conflicts.map(e => ({
                    summary: e.summary,
                    startDate: e.startDate,
                    endDate: e.endDate,
                    calendar: linkedCalendar
                }))
            };
        }

        return { available: true };
    },

    // Check members against cached absences
    checkMembersAvailabilityLocally(absences, startDateTime, endDateTime) {
        if (!absences || absences.length === 0) return [];
        const start = new Date(startDateTime);
        const end = new Date(endDateTime || startDateTime);
        return absences.filter(absence => Storage.absenceOverlapsRange(absence, start, end));
    },

    // Populate location select
    async populateLocationSelect() {
        const select = document.getElementById('rehearsalLocation');
        if (!select) return;

        const locations = (await Storage.getLocations()) || [];

        select.innerHTML = '<option value="">Kein Ort ausgewählt</option>' +
            locations.map(loc =>
                `<option value="${loc.id}">${Bands.escapeHtml(loc.name)}</option>`
            ).join('');
    },

    // Update dashboard
    async updateDashboard() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        Logger.time('dashboard-load');

        // --- 1. Immediate Updates (Static / Local Data) ---

        // Welcome Message
        const welcomeUserName = document.getElementById('welcomeUserName');
        if (welcomeUserName) {
            welcomeUserName.textContent = user.first_name || user.username || 'Musiker';
        }

        // Stat Cards Click Handlers
        const statCards = document.querySelectorAll('.stat-card');
        const statTargets = ['bands', 'events', 'rehearsals'];
        statCards.forEach((card, index) => {
            const view = statTargets[index];
            if (!view) return;
            card.onclick = () => this.navigateTo(view, `stats-card-${view}`);
        });

        // Quick Access (Sync) - Render Immediately
        try {
            const quickLinksDiv = document.getElementById('dashboardQuickLinks');
            if (quickLinksDiv) {
                const quickLinks = [
                    { key: 'kalender', label: 'Meine Termine', view: 'kalender', meta: 'Persönliche Termine und Abo', accent: '#38bdf8' },
                    { key: 'news', label: 'Neuigkeiten', view: 'news', meta: 'Updates und Ankündigungen', accent: '#5b8cff' },
                    { key: 'musikpool', label: 'Musikerpool', view: 'musikpool', meta: 'Kontakte und Musiker', accent: '#f59e0b' },
                    { key: 'bands', label: 'Meine Bands', view: 'bands', meta: 'Bands, Rollen und Mitglieder', accent: '#8b5cf6' },
                    { key: 'rehearsals', label: 'Probetermine', view: 'rehearsals', meta: 'Abstimmungen und feste Proben', accent: '#14b8a6' },
                    { key: 'events', label: 'Auftritte', view: 'events', meta: 'Anfragen und feste Gigs', accent: '#ec4899' },
                    { key: 'statistics', label: 'Statistiken', view: 'statistics', meta: 'Auswertungen im Überblick', accent: '#22c55e' },
                ];
                let selected = [];
                try {
                    selected = JSON.parse(localStorage.getItem('quickAccessLinks') || 'null');
                } catch { }
                if (!Array.isArray(selected) || selected.length === 0) {
                    selected = ['kalender', 'news', 'musikpool'];
                }
                const linksToShow = quickLinks.filter(l => selected.includes(l.key));
                if (linksToShow.length === 0) {
                    quickLinksDiv.innerHTML = '<div class="dashboard-empty-state"><strong>Keine Schnellzugriffe aktiv</strong><p>Lege über Bearbeiten die wichtigsten Aktionen für dein Dashboard fest.</p></div>';
                } else {
                    quickLinksDiv.innerHTML = linksToShow.map(l =>
                        `<button class="dashboard-shortcut" data-view="${l.view}" style="--dashboard-shortcut-accent: ${l.accent}">
                            <span class="dashboard-shortcut-copy">
                                <span class="dashboard-shortcut-label">${l.label}</span>
                                <span class="dashboard-shortcut-meta">${l.meta}</span>
                            </span>
                            <span class="dashboard-shortcut-arrow" aria-hidden="true">↗</span>
                        </button>`
                    ).join('');
                    quickLinksDiv.querySelectorAll('.dashboard-shortcut').forEach(btn => {
                        btn.onclick = (e) => {
                            e.preventDefault();
                            this.navigateTo(btn.dataset.view);
                        };
                    });
                }
            }
        } catch (err) {
            console.error('[updateDashboard] QuickAccess failed', err);
        }

        // Drag & Drop Setup
        try {
            const dashboardSectionsContainer = document.querySelector('.dashboard-bento-grid');
            if (dashboardSectionsContainer) {
                const sectionIds = ['dashboardUpcomingSection', 'dashboardActivitySection', 'dashboardNewsSection', 'dashboardQuickAccessSection'];
                let order = [];
                try { order = JSON.parse(localStorage.getItem('dashboardSectionOrder') || 'null'); } catch { }
                if (!Array.isArray(order) || order.length !== sectionIds.length) order = sectionIds;

                order.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) dashboardSectionsContainer.appendChild(el);
                });

                sectionIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.setAttribute('draggable', 'true');
                    el.ondragstart = (e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', id);
                        el.classList.add('dragging');
                    };
                    el.ondragend = () => {
                        el.classList.remove('dragging');
                        el.classList.remove('drag-over');
                    };
                    el.ondragover = (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        el.classList.add('drag-over');
                    };
                    el.ondragleave = (e) => el.classList.remove('drag-over');
                    el.ondrop = (e) => {
                        e.preventDefault();
                        el.classList.remove('drag-over');
                        const draggedId = e.dataTransfer.getData('text/plain');
                        if (!draggedId || draggedId === id) return;
                        const draggedEl = document.getElementById(draggedId);
                        if (draggedEl) {
                            dashboardSectionsContainer.insertBefore(draggedEl, el);
                            const newOrder = Array.from(dashboardSectionsContainer.children).map(child => child.id);
                            localStorage.setItem('dashboardSectionOrder', JSON.stringify(newOrder));
                        }
                    };
                });
            }
        } catch (err) {
            console.error('[updateDashboard] Error in drag & drop logic', err);
        }

        // --- 2. Parallel Data Fetching ---

        // Show Skeleton Loaders immediately
        const newsSection = document.getElementById('dashboardNewsList');
        if (newsSection) {
            newsSection.innerHTML = `
                <div class="skeleton-item" style="height:80px; margin-bottom:10px;"></div>
                <div class="skeleton-item" style="height:80px; margin-bottom:10px;"></div>
                <div class="skeleton-item" style="height:80px;"></div>
            `;
        }

        const activitySection = document.getElementById('dashboardActivityList');
        if (activitySection) {
            activitySection.innerHTML = `
                <div class="skeleton-item" style="height:60px; margin-bottom:8px;"></div>
                <div class="skeleton-item" style="height:60px; margin-bottom:8px;"></div>
                <div class="skeleton-item" style="height:60px;"></div>
            `;
        }

        // Start all fetches
        const bandsPromise = Storage.getUserBands(user.id).catch(e => { console.error('Bands fetch failed', e); return []; });
        const eventsPromise = Storage.getUserEvents(user.id).catch(e => { console.error('Events fetch failed', e); return []; });
        const rehearsalsPromise = Storage.getUserRehearsals(user.id).catch(e => { console.error('Rehearsals fetch failed', e); return []; });
        // Use optimized getLatestNews instead of fetching all
        const newsPromise = Storage.getLatestNews(10).catch(e => { console.error('News fetch failed', e); return []; });

        // Handle News
        newsPromise.then(news => {
            const newsSection = document.getElementById('dashboardNewsList');
            if (newsSection) {
                if (news.length === 0) {
                    newsSection.innerHTML = '<div class="dashboard-empty-state"><strong>Keine News vorhanden</strong><p>Sobald neue Meldungen erscheinen, findest du sie hier auf einen Blick.</p></div>';
                } else {
                    newsSection.innerHTML = news.slice(0, 3).map(n => {
                        const dashPlainContent = RichTextEditor.getPlainText(n.content || '');
                        const dashTruncated = dashPlainContent.slice(0, 80) + (dashPlainContent.length > 80 ? '…' : '');

                        return `
                            <div class="dashboard-news-item clickable" data-id="${n.id}">
                                <div class="dashboard-entry-topline">
                                    <span class="news-item-badge">News</span>
                                    <span class="news-date">${UI.formatDateShort(n.createdAt)}</span>
                                </div>
                                <div class="news-title">${Bands.escapeHtml(n.title)}</div>
                                <div class="news-content">${this.escapeHtml(dashTruncated)}</div>
                                <div class="dashboard-entry-footer">
                                    <div class="btn-show-more-news">Zum Artikel</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                    const self = this;
                    newsSection.querySelectorAll('.dashboard-news-item.clickable').forEach(item => {
                        item.addEventListener('click', async (e) => {
                            const id = item.dataset.id;
                            const user = Auth.getCurrentUser();
                            if (user && id) {
                                try { await Storage.markNewsRead(id, user.id); } catch (err) { }
                                if (typeof self.updateNewsNavBadge === 'function') await self.updateNewsNavBadge();
                            }
                            self.navigateTo('news');
                        });
                    });
                }
            }
        });

        // Handle Events & Rehearsals (Dependent logic: Next Event, Stats, Activities, Upcoming List)
        try {
            const [bands, events, rehearsals] = await Promise.all([bandsPromise, eventsPromise, rehearsalsPromise]);
            const now = new Date();
            const nowTs = Date.now();
            const bandMap = new Map((bands || []).map(band => [band.id, band]));
            const formatCountLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
            const getConfirmedRehearsalDateValue = (rehearsal) => {
                if (!rehearsal) return null;
                if (typeof rehearsal.confirmedDate === 'object' && rehearsal.confirmedDate?.startTime) {
                    return rehearsal.confirmedDate.startTime;
                }
                return rehearsal.confirmedDate || rehearsal.finalDate || null;
            };
            const isVisibleFixedDate = (dateValue) => !!dateValue && !Storage.isPastCalendarDay(dateValue, now);

            // Upcoming Events Count
            const upcomingEvents = events.filter(e => {
                const displayDate = this.getDashboardEventDisplayDate(e);
                return !!displayDate && !Storage.isPastCalendarDay(displayDate, now);
            });
            const upcomingEventsEl = document.getElementById('upcomingEvents');
            if (upcomingEventsEl) upcomingEventsEl.textContent = upcomingEvents.length;
            const upcomingEventsCaptionEl = document.getElementById('upcomingEventsCaption');
            if (upcomingEventsCaptionEl) {
                upcomingEventsCaptionEl.textContent = upcomingEvents.length === 0
                    ? 'Aktuell stehen keine Auftritte an.'
                    : `Es ${upcomingEvents.length === 1 ? 'steht' : 'stehen'} aktuell ${formatCountLabel(upcomingEvents.length, 'Auftritt', 'Auftritte')} an.`;
            }

            // Pending Votes Count
            const pendingRehearsals = rehearsals.filter(r => r.status === 'pending');
            let openPollsCount = 0;
            for (const rehearsal of pendingRehearsals) {
                const hasOpenProposal = rehearsal.proposedDates && rehearsal.proposedDates.some(p => {
                    let endTs = null;
                    if (p.endTime) endTs = new Date(p.endTime).getTime();
                    else if (p.startTime) endTs = new Date(p.startTime).getTime() + 2 * 60 * 60 * 1000;
                    return endTs && endTs > nowTs;
                });
                if (hasOpenProposal) openPollsCount++;
            }

            // Total Rehearsals Count (open polls + confirmed)
            const confirmedRehearsals = rehearsals.filter(r =>
                r.status === 'confirmed' && isVisibleFixedDate(getConfirmedRehearsalDateValue(r))
            );
            const totalRehearsalsCount = openPollsCount + confirmedRehearsals.length;
            const totalRehearsalsEl = document.getElementById('totalRehearsals');
            if (totalRehearsalsEl) totalRehearsalsEl.textContent = totalRehearsalsCount;
            const totalRehearsalsCaptionEl = document.getElementById('totalRehearsalsCaption');
            if (totalRehearsalsCaptionEl) {
                totalRehearsalsCaptionEl.textContent = totalRehearsalsCount === 0
                    ? 'Aktuell stehen keine Proben an.'
                    : `Es ${totalRehearsalsCount === 1 ? 'steht' : 'stehen'} aktuell ${formatCountLabel(totalRehearsalsCount, 'Probe', 'Proben')} an.`;
            }

            const bandCountEl = document.getElementById('bandCount');
            if (bandCountEl) bandCountEl.textContent = bands.length;
            const bandCountCaptionEl = document.getElementById('bandCountCaption');
            if (bandCountCaptionEl) {
                bandCountCaptionEl.textContent = bands.length === 0
                    ? 'Du spielst aktuell in keiner Band.'
                    : `Du spielst aktuell in ${formatCountLabel(bands.length, 'Band', 'Bands')}.`;
            }

            // Next Event Hero
            const nextEventContent = document.getElementById('nextEventContent');
            if (nextEventContent) {
                try {
                    const allItems = [
                        ...(upcomingEvents.map(e => ({ ...e, type: 'Gig', date: this.getDashboardEventDisplayDate(e) }))),
                        ...(confirmedRehearsals.map(r => ({
                            ...r,
                            type: 'Probe',
                            date: this.getDashboardRehearsalDisplayDate(r)
                        })))
                    ].filter(item => item.date && !Number.isNaN(item.date.getTime()));
                    allItems.sort((a, b) => a.date - b.date);
                    const nextItem = allItems.find(item => item.date >= now)
                        || allItems.find(item => !Storage.isPastCalendarDay(item.date, now));

                    if (nextItem) {
                        const dateStr = nextItem.date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
                        const timeStr = nextItem.date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        const nextItemTypeLabel = nextItem.type === 'Gig' ? 'Auftritt' : 'Probe';
                        const associatedBand = nextItem.band?.name
                            || bandMap.get(nextItem.bandId)?.name
                            || '';

                        // Handle location (Event = string, Rehearsal = object via join)
                        let locName = 'Kein Ort angegeben';
                        if (nextItem.location) {
                            if (typeof nextItem.location === 'object' && nextItem.location.name) {
                                locName = nextItem.location.name;
                            } else if (typeof nextItem.location === 'string') {
                                locName = nextItem.location;
                            }
                        }

                        nextEventContent.innerHTML = `
                        <div style="position: absolute; top: -2.5rem; right: 0; display: flex; align-items: center; z-index: 10;">
                            <span class="next-event-type" style="color: #ffffff; font-size: 1.5rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">${nextItemTypeLabel}</span>
                        </div>
                        <article class="next-event-item" style="margin-top: 1rem;">
                            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <div class="next-event-title">${Bands.escapeHtml(nextItem.title || nextItem.name || 'Ohne Titel')}</div>
                                ${associatedBand ? `<div style="color: var(--text-secondary); font-size: 1.05rem; font-weight: 500;">${Bands.escapeHtml(associatedBand)}</div>` : ''}
                            </div>
                            <div class="next-event-detail-list" style="margin-top: 0.5rem;">
                                <div class="next-event-detail-item">
                                    <span class="next-event-info-label">Datum</span>
                                    <strong>${dateStr}</strong>
                                </div>
                                <div class="next-event-detail-item">
                                    <span class="next-event-info-label">Zeit</span>
                                    <strong>${timeStr} Uhr</strong>
                                </div>
                                <div class="next-event-detail-item">
                                    <span class="next-event-info-label">Ort</span>
                                    <strong>${Bands.escapeHtml(locName)}</strong>
                                </div>
                            </div>
                        </article>`;
                        const heroCard = document.getElementById('nextEventHero');
                        if (heroCard) {
                            heroCard.style.cursor = 'pointer';
                            heroCard.onclick = () => this.navigateTo(nextItem.type === 'Gig' ? 'events' : 'rehearsals', 'dashboard-hero-card');
                        }
                    } else {
                        nextEventContent.innerHTML = `<div class="next-event-placeholder">Keine anstehenden Termine geplant.</div>`;
                    }
                } catch (err) {
                    console.error('[updateDashboard] Error in Next Event logic', err);
                    nextEventContent.innerHTML = '<div class="next-event-placeholder">Fehler beim Laden</div>';
                }
            }

            // Render upcoming list using cached data
            this.renderUpcomingList(events, rehearsals).catch(err => console.error('[updateDashboard] renderUpcomingList failed', err));
        } catch (err) {
            console.error('[updateDashboard] Failed to load events/rehearsals:', err);
        }

        // Handle Activities (needs News + Events + Rehearsals)
        try {
            const [events, rehearsals, news, locations] = await Promise.all([
                eventsPromise,
                rehearsalsPromise,
                newsPromise,
                Storage.getLocations().catch(() => [])
            ]);
            const activitySection = document.getElementById('dashboardActivityList');
            if (activitySection) {
                const locationMap = new Map((locations || []).map(loc => [String(loc.id), loc]));
                const eventMap = new Map((events || []).map(e => [String(e.id), e]));
                const rehearsalMap = new Map((rehearsals || []).map(r => [String(r.id), r]));
                let activities = [];
                activities = activities.concat(
                    (events || []).map(e => ({
                        type: 'event',
                        date: e.date,
                        title: e.title,
                        id: e.id,
                        bandName: e.band?.name || '',
                        metaSecondary: e.location || '',
                        accent: e.band?.color || '#8b5cf6'
                    })),
                    (rehearsals || [])
                        .map(r => ({
                            type: 'rehearsal',
                            date: this.getConfirmedRehearsalDate(r),
                            title: r.title,
                            id: r.id,
                            bandName: r.band?.name || '',
                            metaSecondary: r.locationId ? (locationMap.get(String(r.locationId))?.name || '') : '',
                            accent: r.band?.color || '#5b8cff'
                        }))
                        .filter(r => r.date),
                    (news || []).map(n => ({
                        type: 'news',
                        date: n.createdAt,
                        title: n.title,
                        id: n.id,
                        bandName: '',
                        metaSecondary: '',
                        accent: '#8b5cf6'
                    }))
                );

                try {
                    const eventIds = (events || []).map(e => String(e.id)).filter(Boolean);
                    const rehearsalIds = (rehearsals || []).map(r => String(r.id)).filter(Boolean);
                    const [eventVotes, rehearsalVotes] = await Promise.all([
                        Storage.getEventVotesForMultipleEvents(eventIds),
                        Storage.getRehearsalVotesForMultipleRehearsals(rehearsalIds)
                    ]);
                    const voteActivities = [];
                    (eventVotes || []).forEach(vote => {
                        if (!vote.createdAt || String(vote.userId) === String(user.id)) return;
                        const event = eventMap.get(String(vote.eventId));
                        if (!event) return;
                        voteActivities.push({
                            type: 'vote-event',
                            date: vote.createdAt,
                            title: event.title || 'Auftritt',
                            id: event.id,
                            bandName: event.band?.name || '',
                            metaSecondary: event.location || '',
                            accent: event.band?.color || '#8b5cf6'
                        });
                    });
                    (rehearsalVotes || []).forEach(vote => {
                        if (!vote.createdAt || String(vote.userId) === String(user.id)) return;
                        const rehearsal = rehearsalMap.get(String(vote.rehearsalId));
                        if (!rehearsal) return;
                        voteActivities.push({
                            type: 'vote-rehearsal',
                            date: vote.createdAt,
                            title: rehearsal.title || 'Probetermin',
                            id: rehearsal.id,
                            bandName: rehearsal.band?.name || '',
                            metaSecondary: rehearsal.locationId ? (locationMap.get(String(rehearsal.locationId))?.name || '') : '',
                            accent: rehearsal.band?.color || '#5b8cff'
                        });
                    });
                    activities = activities.concat(voteActivities);
                } catch (err) {
                    console.warn('[dashboard] Could not load vote activities:', err);
                }

                activities = activities.filter(a => a.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);

                if (activities.length === 0) {
                    activitySection.innerHTML = '<div class="dashboard-empty-state"><strong>Keine neue Aktivität</strong><p>Neue Termine, bestätigte Proben oder News erscheinen hier automatisch.</p></div>';
                } else {
                    activitySection.innerHTML = activities.map(a => `
                    <div class="dashboard-activity-item upcoming-card clickable" data-type="${a.type}" data-id="${a.id || ''}" style="--upcoming-accent: ${a.accent}">
                        <div class="upcoming-card-content">
                            <div class="upcoming-card-topline">
                                <span class="upcoming-card-type">${a.type === 'event' ? 'Auftritt' : a.type === 'rehearsal' ? 'Probetermin' : a.type === 'vote-event' ? 'Abstimmung (Auftritt)' : a.type === 'vote-rehearsal' ? 'Abstimmung (Probe)' : 'News'}</span>
                                ${a.bandName ? `<span class="upcoming-card-band">${Bands.escapeHtml(a.bandName)}</span>` : `<span class="upcoming-card-band">${UI.formatDateShort(a.date)}</span>`}
                            </div>
                            <div class="upcoming-card-title">${Bands.escapeHtml(a.title)}</div>
                            <div class="upcoming-card-meta">
                                <span class="upcoming-card-meta-primary">${UI.formatDate(a.date)}</span>
                                ${a.metaSecondary ? `<span class="upcoming-card-meta-secondary">${Bands.escapeHtml(a.metaSecondary)}</span>` : ''}
                            </div>
                        </div>
                        <div class="upcoming-card-action" aria-hidden="true">Öffnen</div>
                    </div>
                `).join('');
                    const self = this;
                    activitySection.querySelectorAll('.dashboard-activity-item.clickable').forEach(item => {
                        item.addEventListener('click', async () => {
                            const type = item.dataset.type;
                            if (type === 'event' || type === 'vote-event') self.navigateTo('events', 'dashboard-upcoming-list-event');
                            else if (type === 'rehearsal' || type === 'vote-rehearsal') self.navigateTo('rehearsals', 'dashboard-upcoming-list-rehearsal');
                            else self.navigateTo('news', 'dashboard-upcoming-list-unknown');
                        });
                    });
                }
            }
        } catch (err) {
            console.error('[updateDashboard] Failed to load activities:', err);
        }

        Logger.timeEnd('dashboard-load');
    },

    // Render upcoming events and rehearsals sorted by date
    async renderUpcomingList(cachedEvents = null, cachedRehearsals = null) {
        const container = document.getElementById('upcomingList');
        const user = Auth.getCurrentUser();
        if (!container || !user) return;

        const now = new Date();
        // Use cached data if provided, otherwise fetch
        const events = cachedEvents || (await Storage.getUserEvents(user.id)) || [];
        const rehearsals = cachedRehearsals || (await Storage.getUserRehearsals(user.id)) || [];

        // Pre-fetch locations once (cached) to avoid N+1 lookups
        const allLocations = await Storage.getLocations();
        const locationMap = new Map(allLocations.map(l => [l.id, l]));

        const upcomingEvents = events
            .map(e => ({
                source: e,
                displayDate: this.getDashboardEventDisplayDate(e)
            }))
            .filter(({ displayDate }) => displayDate && displayDate >= now)
            .map(e => ({
                type: 'event',
                date: e.displayDate,
                title: e.source.title,
                bandId: e.source.bandId,
                band: e.source.band,
                location: e.source.location || null,
                id: e.source.id
            }));

        const upcomingRehearsals = rehearsals
            .map(r => ({
                rehearsal: r,
                dateIso: this.getConfirmedRehearsalDate(r)
            }))
            .filter(({ rehearsal, dateIso }) => rehearsal.status === 'confirmed' && dateIso)
            .map(({ rehearsal, dateIso }) => ({
                type: 'rehearsal',
                date: this.getDashboardRehearsalDisplayDate(rehearsal),
                title: rehearsal.title,
                bandId: rehearsal.bandId,
                band: rehearsal.band, // Pass through joined band data
                locationId: rehearsal.locationId || null,
                id: rehearsal.id
            }))
            .filter(item => item.date && item.date >= now);

        const combined = [...upcomingEvents, ...upcomingRehearsals]
            .sort((a, b) => a.date - b.date)
            .slice(0, 3);

        if (combined.length === 0) {
            container.innerHTML = '<div class="dashboard-empty-state"><strong>Keine anstehenden Termine</strong><p>Sobald feste Proben oder Auftritte anstehen, erscheinen sie hier.</p></div>';
            return;
        }

        const rows = combined.map(item => {
            const bandName = item.band ? item.band.name : 'Band';
            const typeLabel = item.type === 'event' ? 'Auftritt' : 'Probetermin';

            let locationText = '';
            if (item.type === 'event') {
                locationText = item.location ? Bands.escapeHtml(item.location) : '';
            } else if (item.type === 'rehearsal' && item.locationId) {
                // Use client-side lookup from cached map
                const loc = locationMap.get(item.locationId);
                if (loc) locationText = Bands.escapeHtml(loc.name);
            }

            // Get band color
            const bandColor = item.band ? (item.band.color || '#e11d48') : '#e11d48';

            return `
                <div class="upcoming-card upcoming-card-dashboard" onclick="App.navigateTo('${item.type === 'event' ? 'events' : 'rehearsals'}', 'dashboard-card-upcoming')" style="cursor: pointer; --upcoming-accent: ${bandColor}">
                    <div class="upcoming-card-content">
                        <div class="upcoming-card-title-row">
                            <div class="upcoming-card-title">${Bands.escapeHtml(item.title)}</div>
                            <span class="upcoming-card-type">${typeLabel}</span>
                        </div>
                        <div class="upcoming-card-meta">
                            <span class="upcoming-card-band">${Bands.escapeHtml(bandName)}</span>
                            <span class="upcoming-card-meta-primary">${UI.formatDate(item.date)}</span>
                            ${locationText ? `<span class="upcoming-card-meta-secondary">${locationText}</span>` : ''}
                        </div>
                    </div>
                    <div class="upcoming-card-action" aria-hidden="true">Öffnen</div>
                </div>`;
        });

        container.innerHTML = rows.join('');
    },

    // Handle create band
    handleCreateBand() {
        const name = document.getElementById('bandName').value;
        const description = document.getElementById('bandDescription').value; Logger.userAction('Submit', 'createBandForm', 'Create Band', { name, description });

        Bands.createBand(name, description).then(async () => {
            UI.clearForm('createBandForm');
            UI.closeModal('createBandModal');
            // Refresh band cards in "Meine Bands" view
            if (typeof Bands.renderBands === 'function') {
                await Bands.renderBands();
            }
            // Always update dashboard after band creation
            if (typeof this.updateDashboard === 'function') {
                await this.updateDashboard();
            }
            // Show 'Neuer Auftritt' and 'Neuer Probetermin' buttons if user is now in a band
            await this.updatePlanningCreationButtons();
            // Refresh band management list if admin
            if (Auth.isAdmin() && typeof this.renderAllBandsList === 'function') {
                await this.renderAllBandsList();
            }
            // Navigate to bands view so user sees their new band
            if (typeof App.navigateTo === 'function') {
                App.navigateTo('bands', 'dashboard-create-band-btn');
            }
        });
    },

    // Handle edit band
    async handleEditBand() {
        const bandId = document.getElementById('editBandId').value;
        const name = document.getElementById('editBandName').value.trim();
        const description = document.getElementById('editBandDescription').value.trim();

        if (!name) {
            UI.showToast('Bitte gib einen Bandnamen ein', 'error');
            return;
        }

        // Check for duplicate band names
        const allBands = await Storage.getAllBands();
        if (Array.isArray(allBands)) {
            const duplicate = allBands.find(b => b.name.toLowerCase() === name.toLowerCase() && b.id !== bandId);

            if (duplicate) {
                UI.showToast('Eine Band mit diesem Namen existiert bereits', 'error');
                return;
            }
        }

        // Update band
        const success = await Storage.updateBand(bandId, { name, description });

        if (success) {
            UI.closeModal('editBandModal');
            UI.clearForm('editBandForm');
            UI.showToast('Band wurde aktualisiert', 'success');

            // Refresh band details view if currently viewing this band
            if (Bands.currentBandId === bandId) {
                await Bands.showBandDetails(bandId);
            }

            // Band-Cache leeren, damit die Übersicht neu geladen wird
            if (typeof Bands.invalidateCache === 'function') {
                Bands.invalidateCache();
            } else {
                Bands.bandsCache = null;
            }
            await Bands.renderBands(true);

            // Wenn die aktuelle Ansicht "bands" ist, Ansicht neu laden
            if (this.currentView === 'bands') {
                await this.navigateTo('bands', 'dashboard-join-band-btn');
            }

            // Refresh band management list if admin
            if (Auth.isAdmin()) {
                await this.renderAllBandsList();
            }

            // Update dashboard if visible
            if (this.currentView === 'dashboard') {
                await this.updateDashboard();
            }
        }
    },

    // Handle updating band profile image specifically
    async handleUpdateBandImage(bandId, file) {
        if (!file || !bandId) return;

        try {
            const currentUser = Auth.getCurrentUser();
            const currentRole = currentUser ? await Storage.getUserRoleInBand(currentUser.id, bandId) : null;
            const canManageBandSettings = currentRole === 'leader' || currentRole === 'co-leader';
            if (!canManageBandSettings) {
                UI.showToast('Nur Bandleiter und Co-Leiter dürfen das Bandbild bearbeiten', 'error');
                return false;
            }

            const sb = SupabaseClient.getClient();

            // DELETE OLD IMAGE FIRST
            const band = await Storage.getBand(bandId);
            if (band && band.image_url) {
                // Extract filename from URL
                const oldUrl = band.image_url;
                const urlParts = oldUrl.split('/');
                const oldFileName = urlParts[urlParts.length - 1];

                // Delete old image from storage
                if (oldFileName && oldFileName.startsWith('band-')) {
                    const { error: deleteError } = await sb.storage
                        .from('band-images')
                        .remove([oldFileName]);

                    if (deleteError) {
                        console.warn('Could not delete old band image:', deleteError);
                        // Continue anyway - not critical
                    }
                }
            }

            // Compress
            try {
                file = await this.compressImage(file);
            } catch (e) {
                console.warn('Band image compression failed', e);
            }

            const fileExt = 'jpg';
            const fileName = `band-${bandId}-${Date.now()}.${fileExt}`;

            // Upload
            const { error: uploadError } = await sb.storage
                .from('band-images')
                .upload(fileName, file, { upsert: true });

            if (uploadError) {
                console.error('Band image upload error:', uploadError);
                UI.showToast('Fehler beim Bild-Upload: ' + uploadError.message, 'error');
                return false;
            }

            // Get URL
            const { data: { publicUrl } } = sb.storage
                .from('band-images')
                .getPublicUrl(fileName);

            if (!publicUrl) {
                UI.showToast('Fehler: Bild-URL nicht erhalten', 'error');
                return false;
            }

            // Update DB
            const success = await Storage.updateBand(bandId, { image_url: publicUrl });

            if (success) {
                UI.showToast('Profilbild aktualisiert', 'success');
                // Refresh views
                if (Bands.currentBandId === bandId) {
                    await Bands.showBandDetails(bandId);
                }
                if (typeof Bands.invalidateCache === 'function') {
                    Bands.invalidateCache();
                } else {
                    Bands.bandsCache = null;
                }
                await Bands.renderBands(true); // Update list
                return true;
            } else {
                UI.showToast('Fehler beim Speichern der URL', 'error');
                return false;
            }

        } catch (err) {
            console.error('Error in handleUpdateBandImage:', err);
            UI.showToast('Ein unerwarteter Fehler ist aufgetreten', 'error');
            return false;
        }
    },

    // Handle deleting band profile image
    async handleDeleteBandImage(bandId) {
        if (!bandId) return;

        const currentUser = Auth.getCurrentUser();
        const currentRole = currentUser ? await Storage.getUserRoleInBand(currentUser.id, bandId) : null;
        const canManageBandSettings = currentRole === 'leader' || currentRole === 'co-leader';
        if (!canManageBandSettings) {
            UI.showToast('Nur Bandleiter und Co-Leiter dürfen das Bandbild löschen', 'error');
            return false;
        }

        const confirm = await UI.confirmDelete('Möchtest du das Band-Profilbild wirklich entfernen?');
        if (!confirm) return;

        try {
            const sb = SupabaseClient.getClient();

            // Get current band to extract image filename
            const band = await Storage.getBand(bandId);
            if (band && band.image_url) {
                // Extract filename from URL
                const oldUrl = band.image_url;
                const urlParts = oldUrl.split('/');
                const fileName = urlParts[urlParts.length - 1];

                // Delete from storage
                if (fileName && fileName.startsWith('band-')) {
                    const { error: deleteError } = await sb.storage
                        .from('band-images')
                        .remove([fileName]);

                    if (deleteError) {
                        console.warn('Could not delete band image from storage:', deleteError);
                        // Continue anyway to remove URL from DB
                    }
                }
            }

            // Update DB to remove URL
            const success = await Storage.updateBand(bandId, { image_url: null });

            if (success) {
                UI.showToast('Profilbild entfernt', 'success');
                // Refresh views
                if (Bands.currentBandId === bandId) {
                    await Bands.showBandDetails(bandId);
                }
                if (typeof Bands.invalidateCache === 'function') {
                    Bands.invalidateCache();
                } else {
                    Bands.bandsCache = null;
                }
                await Bands.renderBands(true);
            } else {
                UI.showToast('Fehler beim Löschen', 'error');
            }
        } catch (err) {
            console.error('Error in handleDeleteBandImage:', err);
            UI.showToast('Ein Fehler ist aufgetreten', 'error');
        }
    },

    // Handle add member
    async handleAddMember() {
        const username = document.getElementById('memberUsername').value;
        const role = document.getElementById('memberRole').value;

        if (Bands.currentBandId) {
            const success = await Bands.addMember(Bands.currentBandId, username, role);
            if (success) {
                UI.clearForm('addMemberForm');
            }
        }
    },

    // Handle create rehearsal
    async handleCreateRehearsal(forceCreate = false) {
        const editId = document.getElementById('editRehearsalId').value;
        const title = document.getElementById('rehearsalTitle').value;
        const description = document.getElementById('rehearsalDescription').value;
        const bandId = document.getElementById('rehearsalBand').value;
        const locationId = document.getElementById('rehearsalLocation').value;
        const eventId = document.getElementById('rehearsalEvent').value || null;
        const scheduleMode = (typeof Rehearsals !== 'undefined' && typeof Rehearsals.getScheduleMode === 'function')
            ? Rehearsals.getScheduleMode()
            : 'fixed';

        if (!title || !bandId) {
            UI.showToast('Bitte Titel und Band auswählen', 'error');
            return;
        }

        const fixedDate = (scheduleMode === 'fixed' && typeof Rehearsals !== 'undefined' && typeof Rehearsals.getFixedDateFromForm === 'function')
            ? Rehearsals.getFixedDateFromForm()
            : [];
        const proposalDates = (scheduleMode === 'proposals' && typeof Rehearsals !== 'undefined' && typeof Rehearsals.getProposalDatesFromForm === 'function')
            ? Rehearsals.getProposalDatesFromForm()
            : [];
        const dates = scheduleMode === 'fixed' ? fixedDate : proposalDates;

        if (scheduleMode === 'fixed') {
            const startTime = document.getElementById('rehearsalFixedStartTime')?.value || '';
            const endTime = document.getElementById('rehearsalFixedEndTime')?.value || '';
            if (startTime && endTime && endTime <= startTime) {
                UI.showToast('Die Endzeit muss nach der Startzeit liegen.', 'error');
                return;
            }
        }

        if (dates.length === 0) {
            UI.showToast(
                scheduleMode === 'fixed'
                    ? 'Bitte trage den festen Termin vollständig ein.'
                    : 'Bitte mindestens einen vollständigen Terminvorschlag eingeben.',
                'error'
            );
            return;
        }

        const proceed = async () => {
            if (editId) {
                // Update existing
                Logger.userAction('Form', 'rehearsalForm', 'Submit', { action: 'Update Rehearsal', rehearsalId: editId, title, bandId });
                const notifyMembers = document.getElementById('sendUpdateEmail')?.checked || false;
                await Rehearsals.updateRehearsal(editId, bandId, title, description, dates, locationId, eventId, notifyMembers, { scheduleMode });
            } else {
                // Create new
                Logger.userAction('Form', 'rehearsalForm', 'Submit', { action: 'Create Rehearsal', title, bandId });
                await Rehearsals.createRehearsal(bandId, title, description, dates, locationId, eventId, { scheduleMode });
            }
        };

        // Check for location conflicts if location is selected and not forcing creation
        if (locationId && !forceCreate && this.checkLocationAvailability) {
            const allConflicts = [];

            // Check each proposed date
            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                let startDate, endDate;
                if (typeof date === 'object' && date !== null && date.startTime && date.endTime) {
                    startDate = new Date(date.startTime);
                    endDate = new Date(date.endTime);
                } else {
                    startDate = new Date(date);
                    endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // fallback: 2h
                }

                const availability = await this.checkLocationAvailability(locationId, startDate, endDate);

                if (!availability.available && availability.conflicts && availability.conflicts.length > 0) {
                    allConflicts.push({
                        date: date,
                        dateIndex: i,
                        conflicts: availability.conflicts
                    });
                }
            }

            // If there are any conflicts, show warning modal
            if (allConflicts.length > 0) {
                const location = await Storage.getLocation(locationId);
                const conflictDetailsHtml = `
                    <div class="conflict-container">
                        <div class="conflict-header">
                            <h4 class="conflict-header-title">📍 Ort: ${Bands.escapeHtml(location?.name || 'Unbekannt')}</h4>
                            <div class="conflict-header-info">
                                <strong>${allConflicts.length} von ${dates.length} Terminen</strong> überschneiden sich mit anderen Buchungen.
                            </div>
                        </div>

                        ${allConflicts.map(dateConflict => {
                    let dateLabel = '';
                    if (dateConflict.date && typeof dateConflict.date === 'object' && dateConflict.date.startTime) {
                        dateLabel = UI.formatDate(dateConflict.date.startTime);
                        if (dateConflict.date.endTime) {
                            const start = new Date(dateConflict.date.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const end = new Date(dateConflict.date.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            dateLabel += ` (${start} - ${end})`;
                        }
                    } else {
                        dateLabel = UI.formatDate(dateConflict.date);
                    }

                    return `
                                <div class="conflict-card">
                                    <div class="conflict-card-header">
                                        <div class="date-badge">📅 ${dateLabel}</div>
                                        <div class="conflict-count">${dateConflict.conflicts.length} ${dateConflict.conflicts.length === 1 ? 'Konflikt' : 'Konflikte'}</div>
                                    </div>
                                    <div class="conflict-card-body">
                                        <div class="conflict-event-list">
                                            ${dateConflict.conflicts.map(conflict => {
                        const start = new Date(conflict.startDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        const end = new Date(conflict.endDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        return `
                                                    <div class="conflict-event-item">
                                                        <div class="conflict-event-bullet"></div>
                                                        <div class="conflict-event-info">
                                                            <div class="conflict-event-title">${Bands.escapeHtml(conflict.summary)}</div>
                                                            <div class="conflict-event-time">🕐 ${start} - ${end}</div>
                                                        </div>
                                                    </div>
                                                `;
                    }).join('')}
                                        </div>
                                    </div>
                                </div>
                            `;
                }).join('')}
                    </div>
                `;

                document.getElementById('conflictDetails').innerHTML = conflictDetailsHtml;

                // Store the proceed function for later use
                window._pendingRehearsalCreation = proceed;
                window._locationConflictReturnModalId = 'createRehearsalModal';

                // Close create modal and open conflict modal
                UI.closeModal('createRehearsalModal');
                UI.openModal('locationConflictModal');

                return; // Stop here, wait for user decision
            }
        }

        // Check for absence conflicts with a default duration of 3 hours for rehearsals
        const datesToCheck = dates.map(date => {
            if (!date?.startTime) return null;
            const start = new Date(date.startTime);
            const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // 3 hours duration
            return { start: start.toISOString(), end: end.toISOString() };
        }).filter(Boolean);
        const selectedRehearsalMembers = (typeof Rehearsals !== 'undefined' && typeof Rehearsals.getSelectedMembers === 'function')
            ? Rehearsals.getSelectedMembers()
            : [];
        const conflicts = await this.getAbsenceConflicts(bandId, datesToCheck, selectedRehearsalMembers);
        if (conflicts && conflicts.length > 0) {
            const lines = conflicts.map(c => `• ${c.name}: ${c.dates.join(', ')}`);
            const msg = `Folgende Mitglieder haben für die ausgewählten Probetermine Abwesenheiten eingetragen:\n\n${lines.join('\n')}\n\nMöchtest du die Probe trotzdem anlegen?`;
            UI.showConfirm(msg, () => {
                proceed();
            }, null, {
                kicker: 'Abwesenheiten',
                title: 'Mitglieder nicht verfügbar',
                confirmText: 'Trotzdem anlegen',
                confirmClass: 'btn-warning'
            });
        } else {
            await proceed();
        }
    },

    // Handle editing an existing rehearsal
    async handleEditRehearsal(rehearsalId) {
        if (!rehearsalId) return;

        // Close calendar detail modal if open
        if (window.PersonalCalendar) {
            window.PersonalCalendar.closeDetailsModal();
        }

        // Close all other modals to be safe
        UI.closeAllModals();

        // Navigate to rehearsals view
        await this.navigateTo('rehearsals');

        // Open edit modal
        if (typeof Rehearsals !== 'undefined' && Rehearsals.editRehearsal) {
            await Rehearsals.editRehearsal(rehearsalId);
        }
    },

    // Handle create event
    async handleCreateEvent() {
        const editId = document.getElementById('editEventId').value;
        const bandId = document.getElementById('eventBand').value;
        const title = document.getElementById('eventTitle').value;
        const eventDateValue = (typeof Events !== 'undefined' && typeof Events.getFixedDateTimeValue === 'function')
            ? Events.getFixedDateTimeValue()
            : '';
        const scheduleMode = (typeof Events !== 'undefined' && typeof Events.getScheduleMode === 'function')
            ? Events.getScheduleMode()
            : 'fixed';
        const proposals = (scheduleMode === 'proposals' && typeof Events !== 'undefined' && typeof Events.collectDateProposals === 'function')
            ? Events.collectDateProposals()
            : [];

        if (!bandId) {
            UI.showToast('Bitte eine Band auswählen.', 'error');
            return;
        }

        if (!await Auth.canManageEvents(bandId)) {
            UI.showToast('Keine Berechtigung – nur Leiter und Co-Leiter dürfen Auftritte für diese Band erstellen oder bearbeiten.', 'error');
            return;
        }

        if (scheduleMode === 'fixed' && !eventDateValue) {
            UI.showToast('Bitte trage den festen Termin ein.', 'error');
            return;
        }

        if (scheduleMode === 'proposals' && proposals.length === 0) {
            UI.showToast('Bitte gib mindestens einen Terminvorschlag mit Uhrzeit an.', 'error');
            return;
        }

        const date = scheduleMode === 'fixed' && eventDateValue ? eventDateValue : null;

        const location = document.getElementById('eventLocation').value;
        const visibleEventInfo = document.getElementById('eventInfo').value;
        let soundcheckDate = null, soundcheckLocation = null, info = null, techInfo = null;

        if (document.getElementById('eventShowExtras').checked) {
            soundcheckLocation = document.getElementById('eventSoundcheckLocation').value || null;
            info = this.composeEventInfoWithRundown(visibleEventInfo, this.getPersistableDraftEventRundown());
            techInfo = document.getElementById('eventTechInfo').value;
        } else {
            info = this.composeEventInfoWithRundown('', this.getPersistableDraftEventRundown());
        }

        const members = Events.getSelectedMembers();
        const guests = Events.getGuests();
        const currentUser = Auth.getCurrentUser();
        const eventData = {
            bandId,
            title,
            date: scheduleMode === 'fixed' ? date : (proposals.length > 0 ? proposals[0].start : null),
            proposedDates: scheduleMode === 'proposals' ? proposals : [],
            location,
            info,
            techInfo,
            members,
            guests,
            soundcheckDate,
            soundcheckLocation,
            status: scheduleMode === 'fixed' ? 'confirmed' : 'pending'
        };

        if (!editId && currentUser) {
            eventData.createdBy = currentUser.id;
        }

        const proceed = async () => {
            // Clear deleted songs list - changes are being saved
            this.deletedEventSongs = [];
            let savedEventId = editId || null;
            const isUpdate = Boolean(editId);

            if (editId) {
                // Update existing
                Logger.userAction('Form', 'eventForm', 'Submit', { action: 'Update Event', eventId: editId, title, bandId });
                await Storage.updateEvent(editId, eventData);
            } else {
                // Create new
                Logger.userAction('Form', 'eventForm', 'Submit', { action: 'Create Event', title, bandId });
                const saved = await Storage.createEvent(eventData);
                savedEventId = saved?.id || null;
            }

            if (savedEventId) {
                this.syncDraftEventSongIdsFromRundown();
                await this.syncEventSongs(savedEventId, this.draftEventSongIds || []);
                await Storage.updateEvent(savedEventId, {
                    info: this.composeEventInfoWithRundown(
                        document.getElementById('eventShowExtras').checked ? visibleEventInfo : '',
                        this.getPersistableDraftEventRundown()
                    )
                });
                this.resetDraftEventState();
            }

            UI.showToast(isUpdate ? 'Auftritt aktualisiert' : 'Auftritt erstellt', 'success');
            UI.closeModal('createEventModal');

            if (typeof Events !== 'undefined' && typeof Events.renderEvents === 'function') {
                await Events.renderEvents(Events.currentFilter, true);
            }

            // Always update dashboard after event changes
            await this.updateDashboard();

            if (this.refreshPersonalCalendarAfterPlanningChange) {
                await this.refreshPersonalCalendarAfterPlanningChange();
            }
        };

        const datesToCheck = (scheduleMode === 'fixed'
            ? (date ? [date] : [])
            : proposals.map(proposal => proposal.start)).map(dateStr => {
                const start = new Date(dateStr);
                const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // 4 hours for events
                return { start: start.toISOString(), end: end.toISOString() };
            });

        if (datesToCheck.length > 0 && members.length > 0) {
            const conflicts = (typeof Events !== 'undefined' && typeof Events.collectSelectedMemberAbsenceConflicts === 'function')
                ? await Events.collectSelectedMemberAbsenceConflicts(datesToCheck)
                : [];

            if (conflicts.length > 0) {
                const lines = conflicts.map(conflict => `• ${conflict.name}: ${conflict.dates.join(', ')}`);
                const msg = `Folgende Mitglieder haben für die ausgewählten Auftrittstermine Abwesenheiten eingetragen:\n\n${lines.join('\n')}\n\nMöchtest du den Auftritt trotzdem anlegen?`;
                UI.showConfirm(msg, async () => {
                    await proceed();
                }, null, {
                    kicker: 'Abwesenheiten',
                    title: 'Mitglieder nicht verfügbar',
                    confirmText: 'Trotzdem anlegen',
                    confirmClass: 'btn-warning'
                });
                return;
            }
        }

        await proceed();
    },

    // Handle editing an existing event
    async handleEditEvent(eventId) {
        if (!eventId) return;

        // Close calendar detail modal if open
        if (window.PersonalCalendar) {
            window.PersonalCalendar.closeDetailsModal();
        }

        // Close all other modals to be safe
        UI.closeAllModals();

        // Navigate to events view
        await this.navigateTo('events');

        // Open edit modal
        if (typeof Events !== 'undefined' && Events.editEvent) {
            await Events.editEvent(eventId);
        }
    },

    // Handle create absence
    async handleCreateAbsence() {
        const start = document.getElementById('absenceStart').value;
        const end = document.getElementById('absenceEnd').value;
        const reason = document.getElementById('absenceReason').value || '';
        const editIdEl = document.getElementById('editAbsenceId');
        const editId = editIdEl ? editIdEl.value : '';

        const user = Auth.getCurrentUser();
        if (!user) return;

        if (!start || !end) {
            UI.showToast('Bitte Anfangs- und Enddatum angeben', 'error');
            return;
        }

        // Validate that start date is not after end date
        const startDate = new Date(start);
        const endDate = new Date(end);

        if (startDate > endDate) {
            UI.showToast('Das "Von"-Datum darf nicht nach dem "Bis"-Datum liegen', 'error');
            return;
        }

        // Ensure ISO strings
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();

        // preserve time in meta (Dashboard has no time inputs, but if editing an existing time-enabled absence, we should preserve it)
        const existingAbsence = editId ? await Storage.getAbsenceById(editId) : null;
        const meta = existingAbsence ? (existingAbsence.recurrenceMeta || existingAbsence.meta) : null;

        if (editId && editId.trim() !== '') {
            // update existing absence
            await Storage.update('absences', editId, {
                startDate: startIso,
                endDate: endIso,
                reason: Storage.buildAbsenceReasonPayload(reason, meta)
            });
            UI.showToast('Abwesenheit aktualisiert', 'success');
        } else {
            await Storage.createAbsence(user.id, startIso, endIso, reason);
            UI.showToast('Abwesenheit eingetragen', 'success');
        }

        // Clear form
        document.getElementById('absenceStart').value = '';
        document.getElementById('absenceEnd').value = '';
        document.getElementById('absenceReason').value = '';
        if (editIdEl) {
            editIdEl.value = '';
        }
        // reset save button / cancel
        const saveBtn = document.getElementById('saveAbsenceBtn');
        const cancelBtn = document.getElementById('cancelEditAbsenceBtn');
        if (saveBtn) saveBtn.textContent = 'Abwesenheit hinzufügen';
        if (cancelBtn) cancelBtn.style.display = 'none';

        // Re-render lists
        await this.renderUserAbsences();
        await this.updateAbsenceIndicator();
        await this.refreshPersonalCalendarAfterAbsenceChange();
        // If band details modal open and has absences tab, re-render band absences
        if (typeof Bands !== 'undefined' && Bands.currentBandId) {
            Bands.renderBandAbsences(Bands.currentBandId);
        }
    },


    // Helper: Cleanup past absences (end date < today)
    async cleanupPastAbsences(userId) {
        if (!userId) return;

        // Only run cleanup once per session/reload to save requests?
        // Or run every time view is opened? Let's run every time to be safe.
        // But optimizing: fetch only if needed.

        // Actually, we need to fetch all to check dates.
        // Logic:
        // 1. Fetch all absences locally (Storage.getUserAbsences usually fetches fresh)
        // 2. Filter for past ones
        // 3. Delete them parallel

        const absences = await Storage.getUserAbsences(userId);
        if (!absences || absences.length === 0) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today

        const promises = [];
        for (const abs of absences) {
            const endDate = new Date(abs.endDate);
            // If end date is strictly before today (meaning it ended yesterday or earlier)
            if (endDate < today) {
                Logger.info(`[Cleanup] Deleting past absence: ${abs.startDate} - ${abs.endDate} (${abs.reason})`);
                promises.push(Storage.deleteAbsence(abs.id));
            }
        }

        if (promises.length > 0) {
            await Promise.all(promises);
            Logger.info(`[Cleanup] Deleted ${promises.length} past absences.`);
        }
    },

    // Render the current user's absences into the Absence modal
    async renderUserAbsences() {
        const container = document.getElementById('absencesList');
        const user = Auth.getCurrentUser();
        if (!container || !user) return;

        // Cleanup past absences first
        await this.cleanupPastAbsences(user.id);

        const absences = await Storage.getUserAbsences(user.id);
        if (!absences || absences.length === 0) {
            container.innerHTML = '<p class="text-muted">Du hast keine eingetragenen Abwesenheiten.</p>';
            return;
        }

        // sort by start date desc
        absences.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

        container.innerHTML = absences.map(a => {
            const timeLabel = this.formatAbsenceTimeRangeLabel(a.startDate, a.endDate, a);
            return `
            <div class="absence-item" data-id="${a.id}" style="padding:8px; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div>
                    <div><strong>${UI.formatDateOnly(a.startDate)} — ${UI.formatDateOnly(a.endDate)}</strong></div>
                    ${timeLabel ? `<div class="absence-time-range" style="font-size: 0.8em; color: var(--color-text-secondary);">${Bands.escapeHtml(timeLabel)}</div>` : ''}
                    ${Storage.getAbsenceDisplayReason(a) ? `<div class="help-text">${Bands.escapeHtml(Storage.getAbsenceDisplayReason(a))}</div>` : ''}
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm edit-absence" data-id="${a.id}">✏️ Bearbeiten</button>
                    <button class="btn btn-danger btn-sm delete-absence" data-id="${a.id}">🗑️ Löschen</button>
                </div>
            </div>
            `;
        }).join('');

        // Wire up edit/delete handlers
        container.querySelectorAll('.edit-absence').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.startEditAbsence(id);
            });
        });

        container.querySelectorAll('.delete-absence').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const confirmed = await UI.confirmDelete('Möchtest du diese Abwesenheit wirklich löschen?');
                if (confirmed) {
                    await Storage.deleteAbsence(id);
                    UI.showToast('Abwesenheit gelöscht', 'success');
                    await this.updateAbsenceIndicator(); // Update header immediately
                    await this.refreshPersonalCalendarAfterAbsenceChange();
                    await this.renderUserAbsences();
                    if (typeof Bands !== 'undefined' && Bands.currentBandId) {
                        Bands.renderBandAbsences(Bands.currentBandId);
                    }
                }
            });
        });
    },

    // Start editing an absence: populate form and switch to edit-mode
    async startEditAbsence(absenceId) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const absences = await Storage.getUserAbsences(user.id) || [];
        const a = Array.isArray(absences) ? absences.find(x => x.id === absenceId) : null;
        if (!a) return;

        // populate form
        document.getElementById('absenceStart').value = a.startDate.slice(0, 10);
        document.getElementById('absenceEnd').value = a.endDate.slice(0, 10);
        document.getElementById('absenceReason').value = Storage.getAbsenceDisplayReason(a);
        document.getElementById('editAbsenceId').value = a.id;

        // change submit button text and show cancel
        const saveBtn = document.getElementById('saveAbsenceBtn');
        const cancelBtn = document.getElementById('cancelEditAbsenceBtn');
        if (saveBtn) saveBtn.textContent = 'Speichern';
        if (cancelBtn) cancelBtn.style.display = '';

        // ensure modal open
        UI.openModal('absenceModal');
    },

    // Cancel editing absence
    cancelEditAbsence() {
        // reset form
        document.getElementById('absenceStart').value = '';
        document.getElementById('absenceEnd').value = '';
        document.getElementById('absenceReason').value = '';
        const editIdEl = document.getElementById('editAbsenceId');
        if (editIdEl) editIdEl.value = '';
        const saveBtn = document.getElementById('saveAbsenceBtn');
        const cancelBtn = document.getElementById('cancelEditAbsenceBtn');
        if (saveBtn) saveBtn.textContent = 'Abwesenheit hinzufügen';
        if (cancelBtn) cancelBtn.style.display = 'none';
    },

    // Populate event select for rehearsal form
    async populateEventSelect(bandId) {
        const select = document.getElementById('rehearsalEvent');
        if (!select) return;

        const events = await Storage.getBandEvents(bandId);

        select.innerHTML = '<option value="">Kein Auftritt ausgewählt</option>' +
            (Array.isArray(events) ? events.map(event =>
                `<option value="${event.id}">${Bands.escapeHtml(event.title)} - ${UI.formatDateShort(event.date)}</option>`
            ).join('') : '');
    },

    // Update donate button visibility and link
    async updateDonateButton() {
        const donateBtn = document.getElementById('donateBtn');
        if (!donateBtn) return;

        const savedLink = await Storage.getSetting('donateLink');
        const donateLink = this.getValidatedDonateLink(savedLink);

        const newDonateBtn = donateBtn.cloneNode(true);
        donateBtn.parentNode.replaceChild(newDonateBtn, donateBtn);
        newDonateBtn.style.display = 'inline-flex';

        if (donateLink) {
            // Wenn ein gueltiger https-Link vorhanden ist, öffne externe Seite
            newDonateBtn.href = donateLink;
            newDonateBtn.target = '_blank';
            newDonateBtn.rel = 'noopener noreferrer';
            newDonateBtn.title = 'Spenden-Link öffnen';
        } else {
            // Wenn kein gueltiger Link vorhanden ist, bleibt die Info erhalten
            newDonateBtn.href = '#';
            newDonateBtn.removeAttribute('target');
            newDonateBtn.removeAttribute('rel');
            newDonateBtn.title = 'Spenden-Link noch nicht verfügbar';
            newDonateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                UI.showToast(this.getDonateInfoMessage(), 'info');
            });
        }
    }
};

// Make App globally accessible
window.App = App;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('mainApp')) {
        if (typeof RichTextEditor !== 'undefined' && typeof RichTextEditor.init === 'function') {
            RichTextEditor.init();
        }
        App.init();
    }

    // Setup registration instrument selector if present (landing page)
    if (document.getElementById('registerInstrumentSelector') && document.getElementById('registerInstrument')) {
        App.setupInstrumentSelector('registerInstrumentSelector', 'registerInstrument');
    }
});
