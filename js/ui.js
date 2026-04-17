// UI Utilities Module

const UI = {
    LOADING_TIMEOUT_MS: 25000,

    _bindBackdropClose(element, onClose) {
        if (!element || element.dataset.hasBackdropCloseBinding === 'true') return;

        element.addEventListener('mousedown', (event) => {
            element._backdropMouseDownOnSelf = event.target === element;
        });

        element.addEventListener('mouseup', (event) => {
            element._backdropMouseUpOnSelf = event.target === element;
        });

        element.addEventListener('click', (event) => {
            const startedOnBackdrop = element._backdropMouseDownOnSelf === true;
            const endedOnBackdrop = event.target === element && element._backdropMouseUpOnSelf === true;

            element._backdropMouseDownOnSelf = false;
            element._backdropMouseUpOnSelf = false;

            if (!startedOnBackdrop || !endedOnBackdrop) return;
            onClose(event);
        });

        element.dataset.hasBackdropCloseBinding = 'true';
    },

    // Modal management
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            
            // Reset scroll position to top – all scrollable containers
            modal.scrollTop = 0;
            modal.querySelectorAll('.modal-body, .modal-content, .modal-scroll, .scheduler-form-scroll').forEach(el => {
                el.scrollTop = 0;
            });

            document.body.classList.add('modal-open');
            document.documentElement.classList.add('modal-open'); // Robust lock
            if (typeof App !== 'undefined' && typeof App.handleModalOpened === 'function') {
                try {
                    App.handleModalOpened(modalId);
                } catch (error) {
                    console.warn('[UI.openModal] Could not persist modal state:', error);
                }
            }

            // Add click outside to close (only if not already added)
            if (!modal.dataset.hasClickOutside) {
                this._bindBackdropClose(modal, () => {
                    this.closeModal(modalId);
                });
                modal.dataset.hasClickOutside = 'true';
            }

            // Add ESC key listener
            if (!modal.dataset.hasEscListener) {
                const escHandler = (e) => {
                    if (e.key === 'Escape' && modal.classList.contains('active')) {
                        this.closeModal(modalId);
                    }
                };
                document.addEventListener('keydown', escHandler);
                // Store handler to remove later
                modal._escHandler = escHandler;
                modal.dataset.hasEscListener = 'true';
            }
        }
    },

    /**
     * Attaches unsaved-changes guards to a modal's close triggers (X-button, backdrop, ESC).
     * When the modal has a truthy window[dirtyFlagKey], the user is asked to confirm before closing.
     * Call this once after the modal HTML is rendered.
     *
     * @param {string} modalId        - The modal element ID
     * @param {string} dirtyFlagKey   - A key on `window` that is truthy when there are unsaved changes
     */
    guardModalClose(modalId, dirtyFlagKey) {
        const modal = document.getElementById(modalId);
        if (!modal || modal.dataset.hasCloseGuard === 'true') return;
        modal.dataset.hasCloseGuard = 'true';

        const tryClose = async () => {
            if (window[dirtyFlagKey]) {
                const confirmed = await this.confirmAction(
                    'Deine Eingaben werden nicht gespeichert. Möchtest du trotzdem schließen?',
                    'Ungespeicherte Änderungen',
                    'Trotzdem schließen',
                    'btn-danger',
                    { cancelText: 'Weiter bearbeiten' }
                );
                if (!confirmed) return;
            }
            window[dirtyFlagKey] = false;
            this.closeModal(modalId);
        };

        // Guard the X / close button
        modal.querySelectorAll('.modal-close, .modal-cancel, [data-modal-close]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                tryClose();
            }, { capture: true });
        });

        // Guard backdrop click
        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) {
                e.stopImmediatePropagation();
                tryClose();
            }
        }, { capture: true });

        // Guard ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                e.stopImmediatePropagation();
                tryClose();
            }
        }, { capture: true });
    },

    // Toggle central auth overlay for landing page
    toggleAuthOverlay(show = true, tabName = 'login') {
        const overlay = document.getElementById('authOverlay');
        if (overlay) {
            if (show) {
                overlay.hidden = false;
                overlay.setAttribute('aria-hidden', 'false');
                overlay.classList.add('active');
                document.body.classList.add('modal-open');
                document.documentElement.classList.add('modal-open');
                // Auto-switch to requested tab
                this.switchAuthTab(tabName);

                const activeForm = overlay.querySelector('.auth-form.active');
                if (activeForm) {
                    activeForm.scrollTop = 0;
                }

                if (!overlay.dataset.hasClickOutside) {
                    this._bindBackdropClose(overlay, () => {
                        this.toggleAuthOverlay(false);
                    });
                    overlay.dataset.hasClickOutside = 'true';
                }
            } else {

                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                overlay.hidden = true;
                document.body.classList.remove('modal-open');
                document.documentElement.classList.remove('modal-open');

                // FORCE RESET SCROLL POSITION - Fix for iOS keyboard layout issues
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
            }
        }
    },

    // Switch between Login and Register tabs
    switchAuthTab(tabName) {
        // Toggle specific classes on the card for sizing
        const card = document.querySelector('#authOverlay .auth-white-card');
        const title = document.getElementById('authCardTitle');
        const subtitle = document.getElementById('authCardSubtitle');
        if (card) {
            card.classList.remove('auth-mode-login', 'auth-mode-register');
            card.classList.add(`auth-mode-${tabName}`);
        }

        if (title && subtitle) {
            const copy = {
                login: {
                    title: 'Anmelden',
                    subtitle: 'Greife direkt wieder auf Proben, Auftritte, Bands und Planung zu.'
                },
                register: {
                    title: 'Registrieren',
                    subtitle: 'Lege dein Profil an und verbinde dich mit deiner Band.'
                }
            };

            title.textContent = copy[tabName]?.title || 'Anmelden';
            subtitle.textContent = copy[tabName]?.subtitle || 'Greife direkt wieder auf Proben, Auftritte, Bands und Planung zu.';
        }

        document.querySelectorAll('#authOverlay .auth-tab').forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        document.querySelectorAll('#authOverlay .auth-form').forEach(form => {
            if (form.id === `${tabName}Form`) {
                form.classList.add('active');
                form.style.display = 'block'; // Ensure visibility
                form.scrollTop = 0;
            } else {
                form.classList.remove('active');
                form.style.display = 'none'; // Ensure hidden
            }
        });
    },

    showForgotPassword() {
        const title = document.getElementById('authCardTitle');
        const subtitle = document.getElementById('authCardSubtitle');
        
        if (title) title.textContent = 'Passwort vergessen';
        if (subtitle) subtitle.textContent = 'Kein Problem! Wir senden dir einen Link zum Zurücksetzen.';

        // Hide all forms, show forgotPasswordForm
        document.querySelectorAll('#authOverlay .auth-form').forEach(form => {
            if (form.id === 'forgotPasswordForm') {
                form.classList.add('active');
                form.style.display = 'block';
                form.scrollTop = 0;
            } else {
                form.classList.remove('active');
                form.style.display = 'none';
            }
        });

        // Deactivate all tabs
        document.querySelectorAll('#authOverlay .auth-tab').forEach(tab => {
            tab.classList.remove('active');
        });
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            const locationConflictReturnModalId = modalId === 'locationConflictModal'
                ? window._locationConflictReturnModalId || ''
                : '';

            if (modalId === 'locationConflictModal') {
                window._locationConflictReturnModalId = null;
                window._pendingRehearsalCreation = null;
            }

            if (modalId === 'feedbackModal' && typeof App !== 'undefined' && typeof App.resetFeedbackModal === 'function') {
                try {
                    App.resetFeedbackModal();
                } catch (err) {
                    console.warn('[UI.closeModal] Could not reset feedback modal:', err);
                }
            }

            if (modalId === 'createEventModal' && typeof App !== 'undefined' && typeof App.resetDraftEventState === 'function') {
                const deletedSongs = Array.isArray(App.deletedEventSongs) ? [...App.deletedEventSongs] : [];
                (async () => {
                    try {
                        if (deletedSongs.length > 0) {
                            for (const song of deletedSongs) {
                                await Storage.createSong(song);
                            }
                        }
                    } catch (err) {
                        console.warn('[UI.closeModal] Could not restore deleted event songs:', err);
                    } finally {
                        try {
                            App.resetDraftEventState();
                        } catch (err) {
                            console.warn('[UI.closeModal] Could not reset event draft state:', err);
                        }
                    }
                })();
            }

            if (typeof modal._confirmActionOnClose === 'function') {
                modal._confirmActionOnClose();
            }

            modal.classList.remove('active');
            if (typeof App !== 'undefined' && typeof App.handleModalClosed === 'function') {
                try {
                    App.handleModalClosed(modalId);
                } catch (error) {
                    console.warn('[UI.closeModal] Could not clear modal state:', error);
                }
            }

            // Check if any other modals are open before removing scroll lock
            const activeModals = document.querySelectorAll('.modal.active');
            if (activeModals.length === 0) {
                document.body.classList.remove('modal-open');
                document.documentElement.classList.remove('modal-open');
            }

            // Remove ESC listener if exists
            if (modal._escHandler) {
                document.removeEventListener('keydown', modal._escHandler);
                delete modal._escHandler;
                delete modal.dataset.hasEscListener;
            }

            if (locationConflictReturnModalId) {
                this.openModal(locationConflictReturnModalId);
            }
        }
    },

    closeAllModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.id === 'createEventModal' && modal.classList.contains('active') && typeof App !== 'undefined' && typeof App.resetDraftEventState === 'function') {
                const deletedSongs = Array.isArray(App.deletedEventSongs) ? [...App.deletedEventSongs] : [];
                (async () => {
                    try {
                        if (deletedSongs.length > 0) {
                            for (const song of deletedSongs) {
                                await Storage.createSong(song);
                            }
                        }
                    } catch (err) {
                        console.warn('[UI.closeAllModals] Could not restore deleted event songs:', err);
                    } finally {
                        try {
                            App.resetDraftEventState();
                        } catch (err) {
                            console.warn('[UI.closeAllModals] Could not reset event draft state:', err);
                        }
                    }
                })();
            }
            if (modal.id !== 'authModal') {
                modal.classList.remove('active');
                if (typeof App !== 'undefined' && typeof App.handleModalClosed === 'function') {
                    try {
                        App.handleModalClosed(modal.id);
                    } catch (error) {
                        console.warn('[UI.closeAllModals] Could not clear modal state:', error);
                    }
                }
            }
        });
        // Remove scroll lock if authModal is also not active (or if closing all means ALL)
        // Adjust logic if authModal should stay open. Assuming authModal is a .modal too.
        // If authModal stays open, we shouldn't remove lock.
        const activeModals = document.querySelectorAll('.modal.active');
        if (activeModals.length === 0) {
            document.body.classList.remove('modal-open');
            document.documentElement.classList.remove('modal-open');
        }
    },

    // Confirm delete dialog
    confirmDelete(message = 'Möchtest du diesen Eintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.') {
        return this.confirmAction(message, 'Wirklich löschen?', 'Löschen', 'btn-danger');
    },

    // Generic confirm action dialog
    confirmAction(message, title = 'Bestätigung', confirmText = 'OK', confirmClass = 'btn-primary', options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmDeleteModal');
            const kickerEl = document.getElementById('confirmDeleteKicker');
            const titleEl = document.getElementById('confirmDeleteTitle');
            const messageEl = document.getElementById('confirmDeleteMessage');
            const confirmBtn = document.getElementById('confirmDeleteConfirm');
            const cancelBtn = document.getElementById('confirmDeleteCancel');
            const closeBtn = modal ? modal.querySelector('.modal-close') : null;

            if (!modal || !confirmBtn || !cancelBtn || !closeBtn) {
                console.error('confirmAction: Required modal elements not found');
                resolve(false);
                return;
            }

            if (kickerEl) {
                kickerEl.textContent = options.kicker || 'Bestätigung';
            }

            if (titleEl) {
                titleEl.textContent = title;
            }

            if (messageEl) {
                const normalizedTitle = String(title || '')
                    .toLowerCase()
                    .replace(/[?!.,:;]/g, '')
                    .trim();
                const normalizedMessage = String(message || '')
                    .toLowerCase()
                    .replace(/[?!.,:;]/g, '')
                    .trim();
                const shouldHideMessage = !normalizedMessage || normalizedMessage === normalizedTitle;

                messageEl.textContent = shouldHideMessage ? '' : message;
                messageEl.hidden = shouldHideMessage;
            }

            modal.classList.remove('is-danger', 'is-warning', 'is-primary');
            if (confirmClass.includes('btn-danger')) {
                modal.classList.add('is-danger');
            } else if (confirmClass.includes('btn-warning')) {
                modal.classList.add('is-warning');
            } else {
                modal.classList.add('is-primary');
            }

            // Remove old event listeners by cloning
            const newConfirmBtn = confirmBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            const newCloseBtn = closeBtn.cloneNode(true);

            // Update button text and class
            newConfirmBtn.textContent = confirmText;
            newConfirmBtn.className = 'btn ' + confirmClass;
            newCancelBtn.textContent = options.cancelText || 'Abbrechen';

            confirmBtn.replaceWith(newConfirmBtn);
            cancelBtn.replaceWith(newCancelBtn);
            closeBtn.replaceWith(newCloseBtn);

            let settled = false;
            const finalize = (result) => {
                if (settled) return;
                settled = true;
                delete modal._confirmActionResult;
                delete modal._confirmActionOnClose;
                resolve(result);
            };

            modal._confirmActionOnClose = () => {
                const result = modal._confirmActionResult === true;
                finalize(result);
            };

            newConfirmBtn.addEventListener('click', () => {
                modal._confirmActionResult = true;
                this.closeModal('confirmDeleteModal');
            });

            newCancelBtn.addEventListener('click', () => {
                modal._confirmActionResult = false;
                this.closeModal('confirmDeleteModal');
            });

            newCloseBtn.addEventListener('click', () => {
                modal._confirmActionResult = false;
                this.closeModal('confirmDeleteModal');
            });

            this.openModal('confirmDeleteModal');
        });
    },

    // Toast notifications
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');

        if (!toast) {
            console.error('[UI.showToast] Toast element not found!');
            return;
        }

        toast.textContent = message;
        toast.className = 'toast show';

        if (type === 'success') {
            toast.classList.add('success');
        } else if (type === 'error') {
            toast.classList.add('error');
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    // View navigation
    showView(viewId) {
        // Hide all views
        const views = document.querySelectorAll('.view');
        views.forEach(view => view.classList.remove('active'));

        // Show selected view
        const selectedView = document.getElementById(viewId);
        if (selectedView) {
            selectedView.classList.add('active');
        }

        // Update nav items
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            if (item.dataset.view === viewId.replace('View', '')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    },

    // Date formatting
    formatDate(dateString) {
        const date = new Date(dateString);
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        return date.toLocaleDateString('de-DE', options);
    },

    formatDateShort(dateString) {
        const date = new Date(dateString);
        const options = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        return date.toLocaleDateString('de-DE', options);
    },

    formatDateTimeRange(dateString, endDateString = null) {
        const startDate = new Date(dateString);
        if (Number.isNaN(startDate.getTime())) return '';

        const dateLabel = startDate.toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const startTime = startDate.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const endDate = endDateString ? new Date(endDateString) : null;
        const hasDistinctEnd = !!(
            endDate &&
            !Number.isNaN(endDate.getTime()) &&
            (
                endDate.getHours() !== startDate.getHours() ||
                endDate.getMinutes() !== startDate.getMinutes()
            )
        );

        if (hasDistinctEnd) {
            const endTime = endDate.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
            });
            return `${dateLabel} von ${startTime} - ${endTime} Uhr`;
        }

        return `${dateLabel} um ${startTime} Uhr`;
    },

    // Date only (no time)
    formatDateOnly(dateString) {
        const date = new Date(dateString);
        const options = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        };
        return date.toLocaleDateString('de-DE', options);
    },

    formatRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Gerade eben';
        if (diffMins < 60) return `vor ${diffMins} Minute${diffMins > 1 ? 'n' : ''}`;
        if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours > 1 ? 'n' : ''}`;
        if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;

        return this.formatDateShort(dateString);
    },

    // Get user initials for avatar
    getUserInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.trim().substring(0, 2).toUpperCase();
    },

    // Get consistent color based on name
    getAvatarColor(name) {
        if (!name || name === '?' || name === 'Unbekannt') return 'var(--color-primary)';
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }

        const colors = [
            'linear-gradient(135deg, #6366f1, #4f46e5)', // Indigo
            'linear-gradient(135deg, #ec4899, #db2777)', // Pink
            'linear-gradient(135deg, #8b5cf6, #7c3aed)', // Violet
            'linear-gradient(135deg, #f59e0b, #d97706)', // Amber
            'linear-gradient(135deg, #10b981, #059669)', // Emerald
            'linear-gradient(135deg, #3b82f6, #2563eb)', // Blue
            'linear-gradient(135deg, #f43f5e, #e11d48)', // Rose
            'linear-gradient(135deg, #06b6d4, #0891b2)'  // Cyan
        ];

        return colors[Math.abs(hash) % colors.length];
    },

    // Robust user name getter
    getUserDisplayName(user) {
        if (!user) return 'Unbekannt';
        // Try various name fields
        if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
        if (user.first_name) return user.first_name;
        if (user.name) return user.name;
        if (user.display_name) return user.display_name;
        if (user.username) return user.username;
        return user.email || 'Unbekannt';
    },

    // Role display
    getRoleDisplayName(role) {
        const roleNames = {
            'leader': 'Leiter',
            'co-leader': 'Co-Leiter',
            'member': 'Mitglied'
        };
        return roleNames[role] || role;
    },

    getRoleClass(role) {
        return `role-${role}`;
    },

    // Empty state
    showEmptyState(container, icon, message) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${icon}</div>
                <p>${message}</p>
            </div>
        `;
    },

    showCompactEmptyState(container, message) {
        container.innerHTML = `
            <div class="empty-state-compact">
                <p>${message}</p>
            </div>
        `;
    },

    // Confirmation dialog
    confirm(message) {
        // legacy synchronous confirm (keeps backward compatibility)
        return window.confirm(message);
    },

    // Show a custom confirmation modal with callbacks
    // onConfirm: function called when user confirms
    // onCancel: optional function called when user cancels
    showConfirm(message, onConfirm, onCancel, options = {}) {
        this.confirmAction(
            message,
            options.title || 'Bestätigung',
            options.confirmText || 'Bestätigen',
            options.confirmClass || 'btn-primary',
            options
        ).then((confirmed) => {
            if (confirmed) {
                if (typeof onConfirm === 'function') onConfirm();
                return;
            }

            if (typeof onCancel === 'function') onCancel();
        });
    },

    showErrorDialog(title = 'Fehler', message = 'Bitte versuche es später erneut.', onCloseOrOptions = null) {
        let existing = document.getElementById('customErrorModal');
        if (existing) existing.remove();

        const dialogOptions = (onCloseOrOptions && typeof onCloseOrOptions === 'object')
            ? onCloseOrOptions
            : { onClose: onCloseOrOptions };
        const onClose = typeof dialogOptions.onClose === 'function' ? dialogOptions.onClose : null;
        const onRetry = typeof dialogOptions.onRetry === 'function' ? dialogOptions.onRetry : null;
        const retryLabel = dialogOptions.retryLabel || 'Neu laden';
        const closeLabel = dialogOptions.closeLabel || (onRetry ? 'Schließen' : 'Verstanden');
        const actionsMarkup = onRetry
            ? `
                <button id="errorCloseBtn" class="btn btn-secondary">${closeLabel}</button>
                <button id="errorRetryBtn" class="btn btn-primary">${retryLabel}</button>
            `
            : `<button id="errorCloseBtn" class="btn btn-primary">${closeLabel}</button>`;

        const modal = document.createElement('div');
        modal.id = 'customErrorModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" aria-label="Schließen">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin: 0; white-space: pre-line;">${message}</p>
                </div>
                <div class="modal-actions" style="display:flex; justify-content:flex-end; padding:12px;">
                    ${actionsMarkup}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.classList.add('modal-open');

        const close = () => {
            modal.remove();
            const activeModals = document.querySelectorAll('.modal.active');
            const authOverlay = document.getElementById('authOverlay');
            const authOverlayActive = Boolean(authOverlay && authOverlay.classList.contains('active'));
            if (activeModals.length === 0 && !authOverlayActive) {
                document.body.classList.remove('modal-open');
            }
            if (typeof onClose === 'function') onClose();
        };

        const retry = () => {
            modal.remove();
            const activeModals = document.querySelectorAll('.modal.active');
            const authOverlay = document.getElementById('authOverlay');
            const authOverlayActive = Boolean(authOverlay && authOverlay.classList.contains('active'));
            if (activeModals.length === 0 && !authOverlayActive) {
                document.body.classList.remove('modal-open');
            }
            if (typeof onRetry === 'function') onRetry();
        };

        modal.querySelector('.modal-close').addEventListener('click', close);
        modal.querySelector('#errorCloseBtn').addEventListener('click', close);
        if (onRetry) {
            modal.querySelector('#errorRetryBtn').addEventListener('click', retry);
        }
        this._bindBackdropClose(modal, close);
    },

    // Loading spinner: delayed appearance if operation exceeds delayMs (default 0ms for immediate feedback)
    _loaderTimer: null,
    _loaderTimeoutTimer: null,
    _loaderSessionId: 0,
    showLoading(message = 'Lädt...', delayMs = 0, options = {}) {
        const config = (options && typeof options === 'object') ? options : {};
        const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : this.LOADING_TIMEOUT_MS;
        const timeoutTitle = config.timeoutTitle || 'Zeitüberschreitung';
        const timeoutMessage = config.timeoutMessage || 'Der Vorgang dauert zu lange.';
        const onTimeout = typeof config.onTimeout === 'function' ? config.onTimeout : null;
        const onRetry = typeof config.onRetry === 'function' ? config.onRetry : null;

        // Clear previous timer
        if (this._loaderTimer) {
            clearTimeout(this._loaderTimer);
            this._loaderTimer = null;
        }
        if (this._loaderTimeoutTimer) {
            clearTimeout(this._loaderTimeoutTimer);
            this._loaderTimeoutTimer = null;
        }

        const sessionId = ++this._loaderSessionId;

        let loader = document.getElementById('globalLoader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'globalLoader';
            loader.style.display = 'none';
            loader.innerHTML = `
                <div class="loader-overlay">
                    <div class="loader-content">
                        <div class="loader-chip">Bandmate</div>
                        <div class="loader-spinner"></div>
                        <p class="loader-message">${message}</p>
                    </div>
                </div>
            `;
            document.body.appendChild(loader);
        } else {
            loader.querySelector('.loader-message').textContent = message;
        }

        const activateTimeout = () => {
            if (!timeoutMs || timeoutMs <= 0) return;
            this._loaderTimeoutTimer = setTimeout(() => {
                if (this._loaderSessionId !== sessionId) return;
                loader.style.display = 'none';
                this._loaderTimeoutTimer = null;

                if (typeof onTimeout === 'function') {
                    try {
                        onTimeout();
                    } catch (err) {
                        console.warn('[UI.showLoading] onTimeout callback failed:', err);
                    }
                }

                const retryAction = onRetry || (
                    window.App && typeof window.App.navigateTo === 'function' && window.App.currentView
                        ? () => window.App.navigateTo(window.App.currentView, 'timeout-retry')
                        : null
                );

                this.showErrorDialog(timeoutTitle, `${timeoutMessage}\n\nBitte versuche es später erneut.`, {
                    onRetry: retryAction
                });
            }, timeoutMs);
        };

        if (delayMs > 0) {
            this._loaderTimer = setTimeout(() => {
                loader.style.display = 'block';
                activateTimeout();
            }, delayMs);
        } else {
            loader.style.display = 'block';
            activateTimeout();
        }
    },

    hideLoading() {
        if (this._loaderTimer) {
            clearTimeout(this._loaderTimer);
            this._loaderTimer = null;
        }
        if (this._loaderTimeoutTimer) {
            clearTimeout(this._loaderTimeoutTimer);
            this._loaderTimeoutTimer = null;
        }
        const loader = document.getElementById('globalLoader');
        if (loader) {
            loader.style.display = 'none';
        }
    },

    // Clear form
    clearForm(formId) {
        const form = document.getElementById(formId);
        if (form) {
            form.reset();
        }
    },

    toggleAdminAccordion(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;

        const isActive = section.classList.contains('active');

        // Close all other accordion cards in the same container if desired
        const adminTab = section.closest('#adminSettingsTab');
        if (adminTab) {
            adminTab.querySelectorAll('.admin-accordion-card').forEach(card => {
                card.classList.remove('active');
            });
        }

        // Toggle current section
        if (!isActive) {
            section.classList.add('active');
        }
    },

    // Unified Lightbox for any image preview
    showLightbox(imgSrc) {
        // Remove existing lightbox if any
        const existing = document.querySelector('.lightbox-overlay');
        if (existing) existing.remove();

        // Create elements
        const overlay = document.createElement('div');
        overlay.className = 'lightbox-overlay';

        const content = document.createElement('img');
        content.className = 'lightbox-content';
        content.src = imgSrc;

        const closeBtn = document.createElement('div');
        closeBtn.className = 'lightbox-close';
        closeBtn.innerHTML = '×';

        // Assemble
        overlay.appendChild(closeBtn);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        // Animation entry
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });

        // Close handlers
        const closeLightbox = () => {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 300);
        };

        closeBtn.addEventListener('click', closeLightbox);
        this._bindBackdropClose(overlay, closeLightbox);

        // Escape key to close
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }
};
