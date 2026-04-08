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

    // Sorting state for band songs
    bandSongSort: {
        field: 'title',
        direction: 'asc' // asc, desc, none
    },

    // Track deleted songs for potential rollback
    deletedEventSongs: [],
    draftEventSongOverrides: {},

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
            probeorteView: 'probeorte',
            pdftochordproView: 'pdftochordpro',
            kalenderView: 'kalender',
            musikpoolView: 'musikpool',
            settingsView: 'settings'
        };

        return viewMap[activeView.id] || 'dashboard';
    },

    rememberCurrentView(view = this.getActiveBaseView()) {
        const restorableViews = new Set(['dashboard', 'bands', 'events', 'rehearsals', 'statistics', 'news', 'probeorte', 'pdftochordpro', 'kalender', 'musikpool']);
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
        const restorableViews = new Set(['dashboard', 'bands', 'events', 'rehearsals', 'statistics', 'news', 'probeorte', 'pdftochordpro', 'kalender', 'musikpool']);
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
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
        const landingThemeToggle = document.getElementById('landingThemeToggle');

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
        if (landingThemeToggle) {
            landingThemeToggle.innerHTML = this.getThemeIconMarkup(mode);
            landingThemeToggle.title = mode === 'dark' ? 'Hellmodus aktivieren' : 'Dunkelmodus aktivieren';
            landingThemeToggle.setAttribute('aria-label', landingThemeToggle.title);
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

        const landingThemeToggle = document.getElementById('landingThemeToggle');
        if (landingThemeToggle && !landingThemeToggle._themeInit) {
            landingThemeToggle.addEventListener('click', () => this.toggleThemeMode());
            landingThemeToggle._themeInit = true;
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
        const isMobileViewport = window.matchMedia('(max-width: 1024px)').matches;
        shortcutBar.hidden = view !== 'dashboard' || isMobileViewport;
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

        // Load saved state
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed && window.innerWidth > 768) {
            sidebar.classList.add('collapsed');
            wrapper.classList.add('sidebar-collapsed');
        }

        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            wrapper.classList.toggle('sidebar-collapsed');

            this._autoExpanded = false; // Reset on manual toggle
            
            const nowCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', nowCollapsed);
            
            // Trigger a resize event to layout charts or components if needed
            window.dispatchEvent(new Event('resize'));
        });

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
                    UI.showToast('Vielen Dank für dein Feedback! 🤘', 'success');
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
                    UI.showToast('Danke für den Fehlerbericht! Wir schauen uns das an. 🐛', 'success');
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
        if (frame) frame.src = '';

        if (this.currentPDFData && this.currentPDFData.blobUrl) {
            URL.revokeObjectURL(this.currentPDFData.blobUrl);
            this.currentPDFData = null;
        }
    },

    showPDFPreview(pdfData) {
        const iframe = document.getElementById('pdfPreviewFrame');
        if (!iframe) return;

        this.cleanupPDFPreview(); // Ensure previous is cleaned up
        this.currentPDFData = pdfData;

        // Add PDF view parameters for better fitting (Fit to page)
        const viewParams = '#view=Fit';
        iframe.src = pdfData.blobUrl + viewParams;

        UI.openModal('pdfPreviewModal');
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
        // Implement unsaved changes check
        window.isProfileDirty = false;
        if (typeof UI !== 'undefined' && !UI._originalCloseModal) {
            UI._originalCloseModal = UI.closeModal;
            UI.closeModal = (modalId) => {
                if (modalId === 'settingsModal' && window.isProfileDirty) {
                    UI.showConfirm(
                        'Du hast ungespeicherte Änderungen. Möchtest du das Fenster wirklich schließen?',
                        () => {
                            window.isProfileDirty = false;
                            this.resetProfileImageDraftState({
                                resetInput: true,
                                root: document.querySelector('#settingsModal .modal-body') || document
                            });
                            UI._originalCloseModal.call(UI, modalId);
                        },
                        null,
                        {
                            kicker: 'Profil',
                            title: 'Ungespeicherte Änderungen',
                            confirmText: 'Trotzdem schließen'
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

        // Initialisierung
        this.setupDashboardFeatures();

        // Initialize Supabase Auth first
        this.setupMobileSubmenuToggle();
        this.setupSidebarToggle();
        this.setupSidebarNav();
        this.setupFeedbackModal();

        if (typeof ChordProConverter !== 'undefined') {
            ChordProConverter.init();
        }


        // Start Auth initialization in background (non-blocking)

        Auth.init().then(async () => {
            // After auth is ready, check if authenticated and show appropriate view
            if (Auth.isAuthenticated()) {
                await this.showApp();
                // Pre-load standard calendars after login (delayed to not block UI)
                setTimeout(async () => {
                    await this.preloadStandardCalendars();
                    // Log total app load time
                    if (window.APP_START_TIME) {
                        const loadTime = ((performance.now() - window.APP_START_TIME) / 1000).toFixed(3);
                        Logger.info(`🚀 Application fully loaded in ${loadTime}s`);
                    }
                }, 2000);
                // Clean up past items
                Storage.cleanupPastItems();
            } else {
                this.showAuth();
                if (window.APP_START_TIME) {
                    const loadTime = ((performance.now() - window.APP_START_TIME) / 1000).toFixed(3);
                    Logger.info(`🚀 Application fully loaded in ${loadTime}s`);
                }
            }
        }).catch(authErr => {
            console.error('[App.init] Auth initialization failed:', authErr);
            // Show auth page on error
            this.showAuth();
        });

        // Setup event listeners
        this.setupEventListeners();
        // Initialize header submenu for default view on mobile only
        if (window.innerWidth <= 768) {
            this.updateHeaderSubmenu('dashboard');
        }
        // init draft song list for new events
        this.draftEventSongIds = [];
        this.draftEventSongOverrides = {};
        this.lastSongModalContext = null; // { eventId, bandId, origin }

        // Update absence indicator
        await this.updateAbsenceIndicator();

        // Load calendar immediately if Tonstudio view is present
        document.addEventListener('DOMContentLoaded', () => {
            if (document.getElementById('tonstudioView')) {
                if (typeof Calendar !== 'undefined' && Calendar.loadCalendar) {
                    Calendar.loadCalendar();
                }
            }
        });
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

        // Auth form tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                UI.switchAuthTab(tabName);
                if (tabName !== 'login') {
                    this.clearAuthStatusNotice();
                }
            });
        });

        // Login form
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const rememberMe = document.getElementById('loginRememberMe')?.checked;
            await this.handleLogin(undefined, undefined, rememberMe);
        });

        // Forgot Password form
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
                    // 1. Trigger Supabase Password Reset (which sends an email)
                    await Auth.requestPasswordReset(email);
                    
                    UI.showToast('Reset-Link wurde an deine E-Mail gesendet!', 'success');
                    
                    // Switch back to login after success
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
                scheduleAutoUsernameSuggestion();
            });
        }

        if (registerLastNameInput) {
            registerLastNameInput.addEventListener('input', () => {
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
                    regUserInput.dataset.userEdited = 'false';
                    setUsernameFeedback('', 'idle');
                    scheduleAutoUsernameSuggestion();
                    return;
                }

                regUserInput.dataset.userEdited = currentValue !== lastAutoUsername ? 'true' : 'false';
                validateRegisterUsername();
            });
        }

        // Live Password Check
        const regPasswordInput = document.getElementById('registerPassword');
        if (regPasswordInput) {
            regPasswordInput.addEventListener('input', (e) => {
                const password = e.target.value;
                let feedback = document.getElementById('passwordFeedback');
                if (!feedback) {
                    feedback = document.createElement('div');
                    feedback.id = 'passwordFeedback';
                    feedback.style.fontSize = '0.85rem';
                    feedback.style.marginTop = '0.25rem';
                    regPasswordInput.parentNode.appendChild(feedback);
                }

                if (password.length > 0 && password.length < 6) {
                    feedback.textContent = '⚠️ Passwort muss mindestens 6 Zeichen haben';
                    feedback.style.color = '#fbbf24'; // amber-400
                    regPasswordInput.style.borderColor = '#fbbf24';
                } else if (password.length >= 6) {
                    feedback.textContent = '✅ Passwort-Länge ok';
                    feedback.style.color = '#4ade80'; // green-400
                    regPasswordInput.style.borderColor = '#4ade80';
                } else {
                    feedback.textContent = '';
                    regPasswordInput.style.borderColor = '';
                }
            });
        }

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

        // Register form
        const registerPasswordInput = document.getElementById('registerPassword');
        const registerPasswordHint = document.getElementById('registerPasswordHint');

        // Real-time password validation
        if (registerPasswordInput && registerPasswordHint) {
            registerPasswordInput.addEventListener('input', () => {
                const password = registerPasswordInput.value;
                if (password.length > 0 && password.length < 6) {
                    registerPasswordHint.style.color = 'red';
                    registerPasswordHint.textContent = 'Passwort muss mindestens 6 Zeichen haben';
                } else if (password.length >= 6) {
                    registerPasswordHint.style.color = 'green';
                    registerPasswordHint.textContent = '✓ Passwort erfüllt die Anforderungen';
                } else {
                    registerPasswordHint.style.color = 'var(--color-text-secondary)';
                    registerPasswordHint.textContent = 'Mindestens 6 Zeichen erforderlich';
                }
            });
        }

        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            // Validate password length before submitting
            const password = document.getElementById('registerPassword').value;
            if (password.length < 6) {
                UI.showToast('Passwort muss mindestens 6 Zeichen lang sein', 'error');
                return;
            }

            await this.handleRegister();
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

                if (typeof Rehearsals !== 'undefined' && Rehearsals.loadBandMembers) {
                    const currentBandId = document.getElementById('rehearsalBand')?.value || '';
                    if (!currentBandId) {
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
            createRehearsalForm.onsubmit = (e) => {
                e.preventDefault();
                this.handleCreateRehearsal();
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
            UI.clearForm('createEventForm');

            // Do not pre-fill date, keep it empty as requested by user
            const eventDateInput = document.getElementById('eventDate');
            if (eventDateInput) {
                eventDateInput.value = '';
            }

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

            await Events.populateBandSelect();
            // Clear draft song selection and deleted songs for new event
            this.resetDraftEventState();
            this.renderDraftEventSongs();
            const copyBtn = document.getElementById('copyBandSongsBtn');
            if (copyBtn) copyBtn.style.display = 'none';
            UI.openModal('createEventModal');
            this.applyPendingCreateEventDefaults();
        });

        // Create event form
        const createEventForm = document.getElementById('createEventForm');
        if (createEventForm) {
            createEventForm.onsubmit = (e) => {
                e.preventDefault();
                this.handleCreateEvent();
            };
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
        });

        // Event fixed date change
        const eventDateInput = document.getElementById('eventDate');
        if (eventDateInput) {
            eventDateInput.addEventListener('change', () => {
                if (typeof Events !== 'undefined' && typeof Events.updateAvailabilityIndicators === 'function') {
                    Events.updateAvailabilityIndicators();
                }
            });
        }

        document.querySelectorAll('input[name="eventScheduleMode"]').forEach(input => {
            if (input.dataset.initialized) return;
            input.dataset.initialized = 'true';
            input.addEventListener('change', () => {
                if (typeof Events !== 'undefined' && typeof Events.setScheduleMode === 'function') {
                    Events.setScheduleMode(input.value);
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
                ...targetView.querySelectorAll('.view-page-shell, .page-overview-card, .page-section-card, .view-actions-bar, .schedule-board, .schedule-panels, .split-content-grid, .calendar-submenu, .probeorte-submenu, #newsContainer, #bandsList, #musikpoolContainer, #ownMembersContainer, #personalCalendarContainer, #tonstudioCalendar, #festhalleCalendar, #ankersaalCalendar')
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
        setTimeout(resetScroll, 40);
        setTimeout(resetScroll, 140);
        setTimeout(resetScroll, 320);
        setTimeout(resetScroll, 700);
        setTimeout(resetScroll, 1200);
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
        this.clearAuthStatusNotice();

        // Show the global loading overlay with guitar emoji
        const overlay = document.getElementById('globalLoadingOverlay');
        if (typeof window.showGlobalLoadingOverlay === 'function') {
            window.showGlobalLoadingOverlay();
        } else if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
        }

        try {
            await Auth.login(username, password, rememberMe);
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 400);
            }
            UI.toggleAuthOverlay(false); // Ensure modal-open is removed
            UI.showToast('Erfolgreich angemeldet!', 'success');
            await this.showApp();
        } catch (error) {
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 400);
            }
            if (error?.code === 'email_not_confirmed') {
                this.showAuthStatusNotice('Dein Konto ist noch nicht aktiviert. Bitte bestätige zuerst die E-Mail aus deiner Registrierung und logge dich danach ein.', 'warning');
            }
            UI.showToast(error.message, 'error');
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
        const registrationCode = document.getElementById('registerCode').value.trim();
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
            await Auth.register(registrationCode, firstName, lastName, email, username, password, instrument);

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
    async getAbsenceConflicts(bandId, dates) {
        if (!bandId || !dates || dates.length === 0) return [];
        const members = await Storage.getBandMembers(bandId);
        if (!Array.isArray(members)) return [];

        const conflicts = [];

        for (const m of members) {
            const user = await Storage.getById('users', m.userId);
            if (!user) continue;
            const badDates = [];
            for (const d of dates) {
                if (!d) continue;
                try {
                    if (await Storage.isUserAbsentOnDate(user.id, d)) {
                        // Format date nicely
                        badDates.push(UI.formatDateOnly(new Date(d).toISOString()));
                    }
                } catch (e) {
                    // ignore parse errors
                }
            }
            if (badDates.length > 0) {
                conflicts.push({ name: user.name, userId: user.id, dates: badDates });
            }
        }

        return conflicts;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    getSongInfoDisplay(song) {
        return Storage.getSongInfoPreview(song) || '-';
    },

    // Generic PDF Download for Song Lists
    async downloadSongListPDF(songs, title, subtitle = '', preview = true) {
        try {
            if (!Array.isArray(songs) || songs.length === 0) {
                UI.showToast('Keine Songs für PDF vorhanden', 'warning');
                return;
            }

            const filename = `Setlist_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;

            const pdfData = await PDFGenerator.generateSetlistPDF({
                title: title,
                subtitle: subtitle,
                songs: songs,
                filename: filename,
                previewOnly: preview
            });

            if (preview && pdfData && pdfData.blobUrl) {
                this.showPDFPreview(pdfData);
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

    // Song Management
    async openSongModal(eventId = null, bandId = null, songId = null) {
        document.getElementById('songId').value = songId || '';
        document.getElementById('songEventId').value = eventId || '';
        document.getElementById('songBandId').value = bandId || '';
        const modalTitle = document.getElementById('songModalTitle');
        const modalSubtitle = document.querySelector('.song-editor-subtitle');
        const isDraftEventSongEdit = this.lastSongModalContext && this.lastSongModalContext.origin === 'draftEventSong';
        const isEventSongEdit = this.lastSongModalContext && this.lastSongModalContext.origin === 'eventSong';

        // Reset PDF input
        const pdfInput = document.getElementById('songPdf');
        if (pdfInput) pdfInput.value = '';
        const currentPdfContainer = document.getElementById('songCurrentPdf');
        const pdfNameSpan = document.getElementById('songPdfName');
        this.songAutofillCandidates = [];
        if (this.songAutofillSearchTimer) {
            clearTimeout(this.songAutofillSearchTimer);
            this.songAutofillSearchTimer = null;
        }
        this.clearSongAutofillResults();

        if (songId) {
            // Edit existing song
            const storedSong = await Storage.getById('songs', songId);
            const song = isDraftEventSongEdit ? this.getDraftEventSong(storedSong) : storedSong;
            if (song) {
                if (modalTitle) {
                    modalTitle.textContent = (isDraftEventSongEdit || isEventSongEdit)
                        ? 'Song in Setlist bearbeiten'
                        : 'Song bearbeiten';
                }
                if (modalSubtitle) {
                    modalSubtitle.textContent = (isDraftEventSongEdit || isEventSongEdit)
                        ? 'Passe diesen Song nur für die Setlist des Auftritts an. Deine Haupt-Setlist der Band bleibt unverändert.'
                        : 'Pflege die wichtigsten Songdaten, Metainformationen und optional ein PDF in einer kompakten Arbeitsfläche.';
                }
                document.getElementById('songTitle').value = song.title;
                document.getElementById('songArtist').value = song.artist;
                document.getElementById('songBPM').value = song.bpm || '';
                document.getElementById('songKey').value = song.key || '';
                document.getElementById('songOriginalKey').value = song.originalKey || '';
                document.getElementById('songTimeSignature').value = song.timeSignature || '';
                document.getElementById('songLanguage').value = song.language || '';
                document.getElementById('songTracks').value = song.tracks || '';
                document.getElementById('songInfo').value = Storage.getSongPlainInfo(song);
                document.getElementById('songCcli').value = song.ccli || '';
                document.getElementById('songLeadVocal').value = song.leadVocal || '';

                // Show PDF info if exists
                if (song.pdf_url) {
                    currentPdfContainer.style.display = 'block';
                    // Extract filename from URL
                    const parts = song.pdf_url.split('/');
                    const filename = parts[parts.length - 1];
                    pdfNameSpan.textContent = filename.replace(/^song-pdf-\d+-\d+-/, ''); // Try to show a cleaner name
                } else {
                    currentPdfContainer.style.display = 'none';
                }
            }
        } else {
            // New song
            if (modalTitle) modalTitle.textContent = 'Song hinzufügen';
            if (modalSubtitle) {
                modalSubtitle.textContent = 'Pflege die wichtigsten Songdaten, Metainformationen und optional ein PDF in einer kompakten Arbeitsfläche.';
            }
            document.getElementById('songTitle').value = '';
            document.getElementById('songArtist').value = '';
            document.getElementById('songBPM').value = '';
            document.getElementById('songKey').value = '';
            document.getElementById('songOriginalKey').value = '';
            document.getElementById('songTimeSignature').value = '';
            document.getElementById('songLanguage').value = '';
            document.getElementById('songTracks').value = '';
            document.getElementById('songInfo').value = '';
            document.getElementById('songCcli').value = '';
            document.getElementById('songLeadVocal').value = '';
            currentPdfContainer.style.display = 'none';
        }

        UI.openModal('songModal');

        // Wire up PDF delete button (ensure it's only added once or remove old listener)
        const deletePdfBtn = document.getElementById('deleteSongPdfBtn');
        if (deletePdfBtn) {
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

        if (query.length < 4) {
            this.songAutofillCandidates = [];
            this.clearSongAutofillResults();
            return;
        }

        this.songAutofillSearchTimer = setTimeout(() => {
            this.handleSongAutofillSearch({ silent: true });
        }, 260);
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
        if (query.length < 4) {
            if (!silent) {
                UI.showToast('Bitte gib mindestens 4 Zeichen für den Titel ein.', 'info');
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
                                </span>
                            </span>
                        </button>
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

        const normalizeSongKeyValue = value => {
            const keyMap = {
                Db: 'C#',
                Eb: 'D#',
                Gb: 'F#',
                Ab: 'G#',
                Bb: 'A#'
            };
            return keyMap[value] || value;
        };

        const setValue = (id, value) => {
            const input = document.getElementById(id);
            if (!input || value == null || value === '') return;
            input.value = (id === 'songKey' || id === 'songOriginalKey')
                ? normalizeSongKeyValue(value)
                : value;
        };

        setValue('songTitle', candidate.title);
        setValue('songArtist', candidate.artist);
        setValue('songBPM', candidate.bpm);
        setValue('songKey', candidate.key);
        setValue('songOriginalKey', candidate.originalKey);
        setValue('songTimeSignature', candidate.timeSignature);
        setValue('songLeadVocal', candidate.leadVocal);

        this.clearSongAutofillResults();
        UI.showToast('Songdaten wurden vorausgefüllt.', 'success');
    },

    async handleSaveSong() {
        const songId = document.getElementById('songId').value;
        const eventId = document.getElementById('songEventId').value;
        const bandId = document.getElementById('songBandId').value;
        const modalContext = this.lastSongModalContext || null;
        const isDraftEventSongEdit = modalContext && modalContext.origin === 'draftEventSong';
        const isEventSongEdit = modalContext && modalContext.origin === 'eventSong';
        const title = document.getElementById('songTitle').value;
        const artist = document.getElementById('songArtist').value;
        const bpm = document.getElementById('songBPM').value;
        const key = document.getElementById('songKey').value;
        const originalKey = document.getElementById('songOriginalKey').value;
        const timeSignature = document.getElementById('songTimeSignature').value;
        const language = document.getElementById('songLanguage').value;
        const tracks = document.getElementById('songTracks').value;
        const plainInfo = document.getElementById('songInfo').value;
        const ccli = document.getElementById('songCcli').value;
        const leadVocal = document.getElementById('songLeadVocal').value;
        const user = Auth.getCurrentUser();

        const pdfFileInput = document.getElementById('songPdf');
        let pdfUrl = null;

        // If editing, get existing song to preserve/delete PDF
        let existingSong = null;
        if (songId) {
            existingSong = await Storage.getById('songs', songId);
            if (existingSong) pdfUrl = existingSong.pdf_url;
        }

        const currentSongState = isDraftEventSongEdit ? this.getDraftEventSong(existingSong) : existingSong;
        if (isDraftEventSongEdit && currentSongState) {
            pdfUrl = currentSongState.pdf_url || null;
        }

        const existingChordPro = currentSongState ? Storage.getSongChordPro(currentSongState) : '';

        // Handle File Upload
        if (pdfFileInput && pdfFileInput.files.length > 0) {
            UI.showLoading('PDF wird hochgeladen...');
            const file = pdfFileInput.files[0];
            const sb = SupabaseClient.getClient();

            // Delete old PDF if exists
            if (pdfUrl && !isDraftEventSongEdit) {
                const oldFileName = pdfUrl.split('/').pop();
                if (oldFileName && oldFileName.startsWith('song-pdf-')) {
                    await sb.storage.from('song-pdfs').remove([oldFileName]);
                }
            }

            const fileExt = 'pdf';
            const fileName = `song-pdf-${user.id}-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await sb.storage
                .from('song-pdfs')
                .upload(fileName, file, { upsert: true });

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

        const songData = {
            title,
            artist,
            bpm: bpm ? parseInt(bpm) : null,
            key: key || null,
            originalKey: originalKey || null,
            timeSignature: timeSignature || null,
            language: language || null,
            tracks: tracks || null,
            info: Storage.composeSongInfoWithChordPro(plainInfo, existingChordPro),
            ccli: ccli || null,
            leadVocal: leadVocal || null,
            pdf_url: pdfUrl,
            createdBy: user.id
        };

        if (pdfFileInput && pdfFileInput.files.length > 0) {
            UI.hideLoading(); // Hide after successful upload
        }

        if (isDraftEventSongEdit && songId) {
            this.draftEventSongOverrides[songId] = {
                ...(this.draftEventSongOverrides[songId] || {}),
                ...this.getDraftEventSongOverridePayload(songData)
            };
            UI.showToast('Song nur für diesen Auftritt aktualisiert', 'success');
            UI.closeModal('songModal');
            this.lastSongModalContext = null;
            await this.renderDraftEventSongs();
            return;
        }

        // Only set one of eventId or bandId, not both
        if (eventId) {
            songData.eventId = eventId;
        } else if (bandId) {
            songData.bandId = bandId;
        }

        if (songId) {
            // Update existing song
            await Storage.updateSong(songId, songData);
            UI.showToast(isEventSongEdit ? 'Song nur für diesen Auftritt aktualisiert' : 'Song aktualisiert', 'success');
        } else {
            // Create new song
            const created = await Storage.createSong(songData);

            // If song was created for an event, also add to band's general setlist
            if (created.eventId) {
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
                UI.showToast('Song hinzugefügt', 'success');
                // Nach dem Hinzufügen eines Songs zur Band-Setlist sofort neu rendern
                if (bandId) {
                    await this.renderBandSongs(bandId);
                }
            }

            // If this song was created from the create-event modal, add to draft list
            if (this.lastSongModalContext && this.lastSongModalContext.origin === 'createEvent') {
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
            if (eventId) {
                await this.renderEventSongs(eventId);
            } else if (bandId) {
                await this.renderBandSongs(bandId);
            }

            // Also refresh draft list if applicable
            if (this.lastSongModalContext && this.lastSongModalContext.origin === 'createEvent') {
                this.renderDraftEventSongs();
            }
        }
    },

    openPdfPreview(url, title) {
        const modal = document.getElementById('pdfPreviewModal');
        const frame = document.getElementById('pdfPreviewFrame');
        const titleEl = document.getElementById('pdfPreviewTitle');
        const downloadBtn = document.getElementById('pdfPreviewDownload');

        if (!modal || !frame) return;

        titleEl.textContent = title || 'PDF Vorschau';
        frame.src = url;

        if (downloadBtn) {
            downloadBtn.href = url;
            downloadBtn.setAttribute('download', (title || 'song').replace(/[/\\?%*:|"<>]/g, '-') + '.pdf');
        }

        UI.openModal('pdfPreviewModal');
    },

    async handleDeleteSongPdf() {
        const songId = document.getElementById('songId').value;
        if (!songId) return;

        const confirm = await UI.confirmDelete('Möchtest du das PDF wirklich entfernen?');
        if (!confirm) return;

        try {
            const modalContext = this.lastSongModalContext || null;
            const isDraftEventSongEdit = modalContext && modalContext.origin === 'draftEventSong';
            const song = await Storage.getById('songs', songId);
            const currentSong = isDraftEventSongEdit ? this.getDraftEventSong(song) : song;

            if (currentSong && currentSong.pdf_url) {
                const sb = SupabaseClient.getClient();
                const fileName = currentSong.pdf_url.split('/').pop();
                const shouldDeletePhysicalFile = fileName
                    && fileName.startsWith('song-pdf-')
                    && (!song || currentSong.pdf_url !== song.pdf_url);

                if (shouldDeletePhysicalFile) {
                    await sb.storage.from('song-pdfs').remove([fileName]);
                }

                const currentPdfContainer = document.getElementById('songCurrentPdf');
                if (currentPdfContainer) currentPdfContainer.style.display = 'none';
                const pdfInput = document.getElementById('songPdf');
                if (pdfInput) pdfInput.value = '';

                if (isDraftEventSongEdit) {
                    this.draftEventSongOverrides[songId] = {
                        ...(this.draftEventSongOverrides[songId] || {}),
                        pdf_url: null
                    };
                    UI.showToast('PDF für diesen Auftritt entfernt', 'success');
                    await this.renderDraftEventSongs();
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
            console.warn('eventSongsList container not found');
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
            return;
        }

        let html = '';

        if (Array.isArray(songs) && songs.length > 0) {

            html += `
                <div class="event-setlist-workspace">
                <div id="eventSongsBulkActions" class="event-setlist-bulkbar">
                    <div class="event-setlist-bulkinfo">
                        <span>Ausgewählt:</span>
                        <strong><span id="eventSongsSelectedCount">0</span></strong>
                    </div>
                    <div class="event-setlist-bulkactions">
                        <button id="eventSongsBulkDelete" class="btn btn-danger btn-sm">🗑️ Auswahl löschen</button>
                        <button id="eventSongsBulkPDF" class="btn btn-primary btn-sm">📄 Auswahl als PDF</button>
                    </div>
                </div>
                <div class="event-setlist-table-wrap">
                <table class="songs-table event-setlist-table">
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
                            <th style="text-align: center;">PDF</th>
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
                                <td class="event-setlist-actions-cell" style="text-align: center;" data-label="Aktionen">
                                    <div class="event-setlist-actions">
                                        <button type="button" class="btn-icon edit-song" data-id="${song.id}" title="In Setlist bearbeiten" aria-label="Song in Setlist bearbeiten">
                                            <span aria-hidden="true">✎</span>
                                        </button>
                                        <button type="button" class="btn-icon delete-song" data-id="${song.id}" title="Löschen" aria-label="Song aus der Setlist löschen">🗑️</button>
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
                                <td style="text-align: center;" data-label="PDF">
                                    ${song.pdf_url ? `<button type="button" class="btn-icon" title="PDF öffnen" onclick="App.openPdfPreview('${song.pdf_url}', '${this.escapeHtml(song.title)}')">📄</button>` : '-'}
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

    showBandSongSelector(eventId, bandSongs) {
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
                        <h2>Songs aus Band-Pool wählen</h2>
                        <p>Wähle Songs aus dem Repertoire deiner Band und füge sie gesammelt zur Setlist hinzu.</p>
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

        tempModal.querySelector('#confirmCopySongs').addEventListener('click', () => {
            const selectedIds = Array.from(tempModal.querySelectorAll('.band-song-checkbox:checked')).map(cb => cb.value);
            this.copyBandSongsToEvent(eventId, selectedIds);
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
    showBandSongSelectorForDraft(bandSongs) {
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
                        <h2>Songs aus Band-Pool wählen</h2>
                        <p>Markiere Songs aus dem Bandrepertoire und übernimm sie direkt in die neue Setlist.</p>
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
            // Merge into draft list (avoid duplicates)
            selectedIds.forEach(id => {
                if (!this.draftEventSongIds.includes(id)) this.draftEventSongIds.push(id);
            });
            await this.renderDraftEventSongs();
            tempModal.remove();
        });

        tempModal.addEventListener('click', (e) => {
            if (e.target === tempModal) tempModal.remove();
        });
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
                    await Storage.createSong(eventSong);
                }
            }
        }
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
                            <button class="btn-icon edit-song" data-id="${song.id}" title="Bearbeiten">✏️</button>
                            <button class="btn-icon delete-song" data-id="${song.id}" title="Löschen">🗑️</button>
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
                    <td style="padding: var(--spacing-sm); text-align: center;" data-label="PDF">
                        ${song.pdf_url ? `<button type="button" class="btn-icon" title="PDF öffnen" onclick="App.openPdfPreview('${song.pdf_url}', '${this.escapeHtml(song.title)}')">📄</button>` : '-'}
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
        if (!container) return;

        if (!this.draftEventSongIds || this.draftEventSongIds.length === 0) {
            container.innerHTML = '<div class="event-setlist-empty">Noch keine Songs für diesen Auftritt ausgewählt.</div>';
            return;
        }

        const songs = (await Promise.all(this.draftEventSongIds.map(id => Storage.getById('songs', id)))).filter(s => s);

        container.innerHTML = `
        <div class="event-setlist-workspace">
        <div class="event-setlist-table-wrap">
        <table class="songs-table event-setlist-table">
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
                    <th style="text-align: center;">PDF</th>
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
                        <td class="event-setlist-actions-cell" style="text-align: center;" data-label="Aktionen">
                            <div class="event-setlist-actions">
                                <button type="button" class="btn-icon edit-draft-song" data-id="${song.id}" title="In Setlist bearbeiten" aria-label="Song in Setlist bearbeiten">
                                    <span aria-hidden="true">✎</span>
                                </button>
                                <button type="button" class="btn-icon remove-draft-song" data-id="${song.id}" title="Entfernen" aria-label="Song aus der Setlist entfernen">❌</button>
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
                        <td style="text-align: center;" data-label="PDF">
                            ${draftSong.pdf_url ? `<button type="button" class="btn-icon" title="PDF öffnen" onclick="App.openPdfPreview('${draftSong.pdf_url}', '${this.escapeHtml(draftSong.title)}')">📄</button>` : '-'}
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
        const profileDisplayNamePreview = effectiveRoot.querySelector('#profileDisplayNamePreview');

        const updateSettingsProfileNamePreview = () => {
            if (!profileDisplayNamePreview) return;

            const firstName = (profileFirstName?.value || '').trim();
            const lastName = (profileLastName?.value || '').trim();
            const usernameValue = (profileUsername?.value || user.username || '').trim();
            const displayName = `${firstName} ${lastName}`.trim() || usernameValue || 'Dein Profil';
            profileDisplayNamePreview.textContent = displayName;
        };

        if (profileFirstName) profileFirstName.value = user.first_name || '';
        if (profileLastName) profileLastName.value = user.last_name || '';
        if (profileUsername) profileUsername.value = user.username || '';
        if (profileEmail) profileEmail.value = user.email || '';
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

        // Password confirmation field toggle
        if (profilePassword && profilePasswordConfirmGroup && !profilePassword.dataset.confirmToggleAttached) {
            profilePassword.addEventListener('input', () => {
                if (profilePassword.value.trim()) {
                    profilePasswordConfirmGroup.style.display = 'block';
                    if (profilePasswordConfirm) profilePasswordConfirm.required = true;
                } else {
                    profilePasswordConfirmGroup.style.display = 'none';
                    if (profilePasswordConfirm) profilePasswordConfirm.required = false;
                    if (profilePasswordConfirm) profilePasswordConfirm.value = '';
                }
            });
            profilePassword.dataset.confirmToggleAttached = 'true';
        }

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
                        instrument
                    };

                    const { previousImageUrl } = await this.applyProfileImageUpdate(user, updates);

                    Logger.action('Update Profile', updates);

                    if (password && password.trim() !== '') {
                        updates.password = password;
                    }

                    const updateResult = await Storage.updateUser(user.id, updates);


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

                    // Update header
                    const currentUserElem = document.getElementById('currentUserName');
                    if (currentUserElem) currentUserElem.textContent = updatedUser.username;
                    this.renderProfileImageHeader(updatedUser);

                    // Update Dashboard Welcome Message immediately
                    const welcomeUserName = document.getElementById('welcomeUserName');
                    if (welcomeUserName) {
                        welcomeUserName.textContent = updatedUser.first_name || updatedUser.username || 'Musiker';
                    }

                    // Clear password field (scoped to settings view)
                    const pwdEl = effectiveRoot.querySelector('#profilePassword');
                    const pwdConfirmEl = effectiveRoot.querySelector('#profilePasswordConfirm');
                    const pwdConfirmGroupEl = effectiveRoot.querySelector('#profilePasswordConfirmGroup');
                    if (pwdEl) pwdEl.value = '';
                    if (pwdConfirmEl) pwdConfirmEl.value = '';
                    if (pwdConfirmGroupEl) pwdConfirmGroupEl.style.display = 'none';

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
        const absenceFormSettings = document.getElementById('createAbsenceFormSettings');
        if (absenceFormSettings && !absenceFormSettings._bound) {
            absenceFormSettings.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleCreateAbsenceFromSettings();
            });
            absenceFormSettings._bound = true;
        }

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
        const badgeIcon = isBug ? '🐛' : '💡';
        const badgeLabel = isBug ? 'Bug Report' : 'Feedback';

        const isResolved = item.status === 'resolved';

        return `
            <div class="feedback-card" data-expanded="false" data-id="${item.id}">
                <div class="feedback-card-accent" style="background: ${badgeColor};"></div>
                
                <div class="feedback-card-header">
                    <div class="feedback-badge-row">
                        <span class="feedback-badge" style="background: ${badgeColor}20; color: ${badgeColor};">
                            ${badgeIcon} ${badgeLabel.toUpperCase()}
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

    async handleCreateAbsenceFromSettings() {
        const startInput = document.getElementById('absenceStartSettings');
        const endInput = document.getElementById('absenceEndSettings');
        const reasonInput = document.getElementById('absenceReasonSettings');
        const editIdInput = document.getElementById('editAbsenceIdSettings');

        const start = startInput.value;
        const end = endInput.value;
        const reason = reasonInput.value.trim();
        const editId = editIdInput.value;

        const user = Auth.getCurrentUser();
        if (!user) return;

        if (editId) {
            // Update existing absence
            await Storage.update('absences', editId, {
                startDate: start,
                endDate: end,
                reason
            });
            UI.showToast('Abwesenheit aktualisiert', 'success');
        } else {
            // Create new absence
            await Storage.createAbsence(user.id, start, end, reason);
            UI.showToast('Abwesenheit eingetragen', 'success');
        }

        this.resetAbsenceFormSettings();

        // Update absence indicator
        await this.updateAbsenceIndicator();

        // Invalidate cache
        this.absencesCache = null;

        // Refresh list
        await this.renderAbsencesListSettings();
    },

    resetAbsenceFormSettings() {
        const form = document.getElementById('createAbsenceFormSettings');
        if (form) form.reset();

        const editIdInput = document.getElementById('editAbsenceIdSettings');
        if (editIdInput) editIdInput.value = '';

        const saveBtn = document.getElementById('saveAbsenceBtnSettings');
        if (saveBtn) saveBtn.textContent = 'Abwesenheit hinzufügen';

        const cancelBtn = document.getElementById('cancelEditAbsenceBtnSettings');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
            cancelBtn.onclick = null;
        }
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

        container.innerHTML = absences.map(absence => `
            <div class="absence-item-card" data-absence-id="${absence.id}">
                <div class="absence-info">
                    <div class="absence-date-range">
                        <span style="margin-right:0.25rem;">📅</span>
                        ${UI.formatDateOnly(absence.startDate)} - ${UI.formatDateOnly(absence.endDate)}
                    </div>
                    ${absence.reason ? `<div class="absence-reason">${Bands.escapeHtml(absence.reason)}</div>` : ''}
                </div>
                <div class="absence-actions">
                    <button class="btn btn-sm btn-icon edit-absence-settings" data-absence-id="${absence.id}" title="Bearbeiten" style="background:transparent; border:none; font-size:1.1rem; padding:0.25rem;">✏️</button>
                    <button class="btn btn-sm btn-icon delete-absence-settings" data-absence-id="${absence.id}" title="Löschen" style="background:transparent; border:none; font-size:1.1rem; padding:0.25rem;">🗑️</button>
                </div>
            </div>
    `).join('');

        // Attach event listeners
        container.querySelectorAll('.edit-absence-settings').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.absenceId;
                this.editAbsenceSettings(id);
            });
        });

        container.querySelectorAll('.delete-absence-settings').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.absenceId;
                await this.deleteAbsenceSettings(id);
            });
        });
    },

    async editAbsenceSettings(absenceId) {
        const absence = await Storage.getById('absences', absenceId);
        if (!absence) return;

        document.getElementById('absenceStartSettings').value = (absence.startDate || absence.start || '').slice(0, 10);
        document.getElementById('absenceEndSettings').value = (absence.endDate || absence.end || '').slice(0, 10);
        document.getElementById('absenceReasonSettings').value = absence.reason || '';
        document.getElementById('editAbsenceIdSettings').value = absenceId;
        document.getElementById('saveAbsenceBtnSettings').textContent = 'Änderungen speichern';
        document.getElementById('cancelEditAbsenceBtnSettings').style.display = 'inline-block';

        const cancelBtn = document.getElementById('cancelEditAbsenceBtnSettings');
        cancelBtn.onclick = () => {
            this.resetAbsenceFormSettings();
        };
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
            await this.renderAbsencesListSettings();
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

        const eventDateInput = document.getElementById('eventDate');
        const formattedDateTime = this.formatPrefilledModalDateTime(defaults.dateTime || defaults.date, defaults.time || '19:00');
        this.setPrefilledModalControlValue(eventDateInput, formattedDateTime);

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
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.checked = this.getResolvedThemeMode() === 'dark';
            const newToggle = themeToggle.cloneNode(true);
            themeToggle.parentNode.replaceChild(newToggle, themeToggle);
            newToggle.checked = this.getResolvedThemeMode() === 'dark';
            newToggle.addEventListener('change', (e) => this.applyThemeMode(e.target.checked ? 'dark' : 'light'));
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
        this.resetProfileImageDraftState({ resetInput: true, root: settingsRoot });
        this.bindProfileImageDraftHandlers(settingsRoot, user);

        // Render profile image for all users
        this.renderProfileImageSettings(user);
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
        const rangeStart = new Date(startDateTime);
        const rangeEnd = new Date(endDateTime);
        
        return absences.filter(a => {
            const absStart = new Date(a.startDate);
            const absEnd = new Date(a.endDate);

            if (!(typeof a.startDate === 'string' && a.startDate.includes('T'))) {
                absStart.setHours(0, 0, 0, 0);
            }

            const endIsMidnight = absEnd.getHours() === 0 && absEnd.getMinutes() === 0 && absEnd.getSeconds() === 0 && absEnd.getMilliseconds() === 0;
            if (!(typeof a.endDate === 'string' && a.endDate.includes('T')) || endIsMidnight) {
                absEnd.setHours(23, 59, 59, 999);
            }

            return (absStart <= rangeEnd && absEnd >= rangeStart);
        });
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

        const createEventShortcut = document.getElementById('dashboardCreateEventShortcut');
        if (createEventShortcut) {
            createEventShortcut.onclick = (e) => {
                e.preventDefault();
                this.openCreateEventModal();
            };
        }

        const createRehearsalShortcut = document.getElementById('dashboardCreateRehearsalShortcut');
        if (createRehearsalShortcut) {
            createRehearsalShortcut.onclick = (e) => {
                e.preventDefault();
                this.openCreateRehearsalModal();
            };
        }

        const openCalendarShortcut = document.getElementById('dashboardOpenCalendarShortcut');
        if (openCalendarShortcut) {
            openCalendarShortcut.onclick = (e) => {
                e.preventDefault();
                this.navigateTo('kalender', 'dashboard-primary-shortcut-calendar');
            };
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
            const upcomingEvents = events.filter(e => isVisibleFixedDate(e.date));
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
                        ...(upcomingEvents.map(e => ({ ...e, type: 'Gig', date: new Date(e.date) }))),
                        ...(confirmedRehearsals.map(r => ({
                            ...r,
                            type: 'Probe',
                            date: new Date(getConfirmedRehearsalDateValue(r))
                        })))
                    ];
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
                        <article class="next-event-item">
                            <div class="next-event-meta-line">
                                <span class="next-event-type">${nextItemTypeLabel}</span>
                                ${associatedBand ? `<span class="next-event-meta-separator" aria-hidden="true">·</span><span class="next-event-band-name">${Bands.escapeHtml(associatedBand)}</span>` : ''}
                            </div>
                            <div class="next-event-title">${Bands.escapeHtml(nextItem.title || nextItem.name || 'Ohne Titel')}</div>
                            <div class="next-event-detail-list">
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
            .filter(e => new Date(e.date) >= now)
            .map(e => ({
                type: 'event',
                date: new Date(e.date).toISOString(),
                title: e.title,
                bandId: e.bandId,
                band: e.band, // Pass through joined band data
                location: e.location || null,
                id: e.id
            }));

        const upcomingRehearsals = rehearsals
            .map(r => ({
                rehearsal: r,
                dateIso: this.getConfirmedRehearsalDate(r)
            }))
            .filter(({ rehearsal, dateIso }) => rehearsal.status === 'confirmed' && dateIso)
            .map(({ rehearsal, dateIso }) => ({
                type: 'rehearsal',
                date: dateIso,
                title: rehearsal.title,
                bandId: rehearsal.bandId,
                band: rehearsal.band, // Pass through joined band data
                locationId: rehearsal.locationId || null,
                id: rehearsal.id
            }))
            .filter(item => item.date && new Date(item.date) >= now);

        const combined = [...upcomingEvents, ...upcomingRehearsals]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 3);

        if (combined.length === 0) {
            container.innerHTML = '<div class="dashboard-empty-state"><strong>Keine anstehenden Termine</strong><p>Sobald feste Proben oder Auftritte anstehen, erscheinen sie hier.</p></div>';
            return;
        }

        const rows = combined.map(item => {
            const bandName = item.band ? item.band.name : 'Band';
            const typeLabel = item.type === 'event' ? 'Auftritt' : 'Probetermin';

            let locationText = '-';
            if (item.type === 'event') {
                locationText = item.location ? Bands.escapeHtml(item.location) : '-';
            } else if (item.type === 'rehearsal' && item.locationId) {
                // Use client-side lookup from cached map
                const loc = locationMap.get(item.locationId);
                if (loc) locationText = Bands.escapeHtml(loc.name);
            }

            // Get band color
            const bandColor = item.band ? (item.band.color || '#e11d48') : '#e11d48';

            return `
                <div class="upcoming-card" onclick="App.navigateTo('${item.type === 'event' ? 'events' : 'rehearsals'}', 'dashboard-card-upcoming')" style="cursor: pointer; --upcoming-accent: ${bandColor}">
                    <div class="upcoming-card-content">
                        <div class="upcoming-card-topline">
                            <span class="upcoming-card-type">${typeLabel}</span>
                            <span class="upcoming-card-band">${Bands.escapeHtml(bandName)}</span>
                        </div>
                        <div class="upcoming-card-title">${Bands.escapeHtml(item.title)}</div>
                        <div class="upcoming-card-meta">
                            <span class="upcoming-card-meta-primary">${UI.formatDate(item.date)}</span>
                            <span class="upcoming-card-meta-secondary">${locationText}</span>
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

        // Check for absence conflicts
        const datesToCheck = dates.map(date => date?.startTime).filter(Boolean);
        const conflicts = await this.getAbsenceConflicts(bandId, datesToCheck);
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
        const eventDateValue = document.getElementById('eventDate').value;
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

        const date = scheduleMode === 'fixed' && eventDateValue ? new Date(eventDateValue).toISOString() : null;

        const location = document.getElementById('eventLocation').value;
        let soundcheckDate = null, soundcheckLocation = null, info = null, techInfo = null;

        if (document.getElementById('eventShowExtras').checked) {
            soundcheckLocation = document.getElementById('eventSoundcheckLocation').value || null;
            info = document.getElementById('eventInfo').value;
            techInfo = document.getElementById('eventTechInfo').value;
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
                await this.syncEventSongs(savedEventId, this.draftEventSongIds || []);
                this.draftEventSongIds = [];
                this.draftEventSongOverrides = {};
            }
            // Always update dashboard after event changes
            await this.updateDashboard();

            // Clear Personal Calendar cache and sync to cloud
            if (window.PersonalCalendar) {
                window.PersonalCalendar.clearCache();
                window.PersonalCalendar.syncCalendarBackground();
            }
        };

        const datesToCheck = scheduleMode === 'fixed'
            ? (date ? [date] : [])
            : proposals.map(proposal => proposal.start);

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

        if (editId && editId.trim() !== '') {
            // update existing absence
            await Storage.update('absences', editId, { startDate: startIso, endDate: endIso, reason });
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

        container.innerHTML = absences.map(a => `
            <div class="absence-item" data-id="${a.id}" style="padding:8px; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div>
                    <div><strong>${UI.formatDateOnly(a.startDate)} — ${UI.formatDateOnly(a.endDate)}</strong></div>
                    ${a.reason ? `<div class="help-text">${Bands.escapeHtml(a.reason)}</div>` : ''}
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm edit-absence" data-id="${a.id}">✏️ Bearbeiten</button>
                    <button class="btn btn-danger btn-sm delete-absence" data-id="${a.id}">🗑️ Löschen</button>
                </div>
            </div>
    `).join('');

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
        document.getElementById('absenceReason').value = a.reason || '';
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
    RichTextEditor.init();
    App.init();

    // Setup registration instrument selector if present (landing page)
    App.setupInstrumentSelector('registerInstrumentSelector', 'registerInstrument');
});
