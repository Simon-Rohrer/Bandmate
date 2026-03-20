// Bands Management Module

const Bands = {
    currentBandId: null,
    bandsCache: null,

    // Clear all cached data (called during logout)
    clearCache() {
        this.currentBandId = null;
        this.bandsCache = null;
    },

    invalidateCache() {
        Logger.info('[Bands] Cache invalidated.');
        this.bandsCache = null;
        if (typeof Statistics !== 'undefined') Statistics.invalidateCache();
    },

    instrumentIcons: {
        'drums': '🥁',
        'bass': '🎸',
        'acoustic_guitar': '🎸',
        'electric_guitar': '🎸',
        'keyboard': '🎹',
        'synth': '🎹',
        'violin': '🎻',
        'vocals': '🎤'
    },

    getInstrumentName(instrument) {
        const names = {
            'drums': 'Schlagzeug',
            'Drums': 'Schlagzeug',
            'bass': 'Bass',
            'Bass': 'Bass',
            'acoustic_guitar': 'Akustische Gitarre',
            'electric_guitar': 'Elektrische Gitarre',
            'Guitar': 'Gitarre',
            'keyboard': 'Keyboard',
            'synth': 'Synth',
            'Keys': 'Keys / Piano',
            'violin': 'Geige',
            'vocals': 'Gesang',
            'Vocals': 'Gesang',
            'Brass': 'Bläser',
            'Strings': 'Streicher'
        };
        return names[instrument] || '';
    },

    getInstrumentLabels(instrumentValue) {
        if (!instrumentValue) return [];

        let values = [];

        if (Array.isArray(instrumentValue)) {
            values = instrumentValue;
        } else if (typeof instrumentValue === 'string') {
            const trimmed = instrumentValue.trim();

            if (!trimmed) return [];

            if (trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) values = parsed;
                } catch (error) {
                    values = trimmed.split(',').map(value => value.trim()).filter(Boolean);
                }
            } else {
                values = trimmed.split(',').map(value => value.trim()).filter(Boolean);
            }
        } else {
            values = [instrumentValue];
        }

        const seen = new Set();
        return values
            .map(value => this.getInstrumentName(value) || String(value).trim())
            .map(value => value.trim())
            .filter(value => {
                if (!value) return false;
                const key = value.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    },

    // Render all user's bands
    async renderBands(forceRefresh = false) {
        // Clear cached bands to force fresh data fetch if requested
        if (forceRefresh) {
            this.invalidateCache();
        }

        const container = document.getElementById('bandsList');
        if (!container) return;

        const canCreateBand = Auth.canCreateBand();
        const createButtons = [
            document.getElementById('createBandBtn'),
            document.getElementById('createBandBtnView')
        ];

        createButtons.forEach(button => {
            if (button) {
                button.style.display = canCreateBand ? 'inline-flex' : 'none';
            }
        });

        // Check Cache
        if (this.bandsCache) {
            Logger.info('[Bands] Using cached data.');
            this._renderBandsList(container, this.bandsCache);
            return;
        }

        Logger.time('Bands Load');
        let bandsLoadTimedOut = false;
        UI.showLoading('Bands werden geladen...', 0, {
            timeoutMs: 5000,
            timeoutTitle: 'Zeitüberschreitung',
            timeoutMessage: 'Die Bands konnten nicht rechtzeitig geladen werden.',
            onRetry: () => this.renderBands(true),
            onTimeout: () => {
                bandsLoadTimedOut = true;
                container.innerHTML = '<p class="error-text">Die Bands konnten nicht rechtzeitig geladen werden. Bitte versuche es erneut.</p>';
            }
        });

        try {
            const user = Auth.getCurrentUser();
            if (!user) {
                UI.hideLoading();
                return;
            }

            let bands = await Storage.getUserBands(user.id);
            if (!Array.isArray(bands)) bands = [];

            // Fetch member counts for each band to have them in the cache
            const bandsWithCounts = await Promise.all(bands.map(async band => {
                const members = await Storage.getBandMembers(band.id);
                return {
                    ...band,
                    memberCount: members.length
                };
            }));

            if (bandsLoadTimedOut) {
                return;
            }

            this.bandsCache = bandsWithCounts;

            // Log which bands were loaded for debugging
            Logger.info(`[Bands.renderBands] Loaded ${bandsWithCounts.length} bands for user ${user.username || user.id}`);

            this._renderBandsList(container, this.bandsCache);

            // Update nav visibility based on current membership
            this.updateNavVisibility();
            Logger.timeEnd('Bands Load');

        } catch (error) {
            console.error('Error rendering bands:', error);
            UI.showToast('Fehler beim Laden der Bands', 'error');
            container.innerHTML = '<p class="error-text">Fehler beim Laden der Daten. Bitte versuchen Sie es später erneut.</p>';
        } finally {
            UI.hideLoading();
        }
    },

    getRolePriority(role) {
        const priorities = {
            leader: 0,
            'co-leader': 1,
            member: 2
        };

        return priorities[role] ?? 99;
    },

    getBandAvatarHtml(band) {
        if (band.image_url) {
            return `<img src="${band.image_url}" alt="${this.escapeHtml(band.name)}" class="band-card-avatar-img">`;
        }

        return `
            <div class="band-card-avatar-fallback" style="background: ${band.color || 'var(--color-primary)'};">
                ${this.escapeHtml(UI.getUserInitials(band.name || 'Band'))}
            </div>
        `;
    },

    getBandDetailsCoverHtml(band) {
        if (band.image_url) {
            return `
                <img
                    src="${band.image_url}"
                    alt="${this.escapeHtml(band.name)}"
                    class="band-details-cover-img"
                    onclick="UI.showLightbox('${band.image_url}')"
                >
            `;
        }

        return `
            <div class="band-details-cover-fallback" style="background: ${band.color || 'var(--color-primary)'};">
                ${this.escapeHtml(UI.getUserInitials(band.name || 'Band'))}
            </div>
        `;
    },

    // Helper: render the band list
    _renderBandsList(container, bands) {
        if (bands.length === 0) {
            container.innerHTML = `
                <div class="bands-empty-state">
                    <div class="bands-empty-icon">🎸</div>
                    <h3>Noch keine Bands</h3>
                    <p>Erstelle eine neue Band oder tritt per Code einer bestehenden Band bei.</p>
                </div>
            `;
            return;
        }

        const sortedBands = [...bands].sort((a, b) => {
            const roleDelta = this.getRolePriority(a.role) - this.getRolePriority(b.role);
            if (roleDelta !== 0) return roleDelta;
            return (a.name || '').localeCompare(b.name || '', 'de');
        });

        container.innerHTML = sortedBands.map((band, index) => {
            const memberCount = band.memberCount || 0;
            const roleLabel = UI.getRoleDisplayName(band.role);
            const descriptionHtml = band.description
                ? `<p class="band-card-description">${this.escapeHtml(band.description)}</p>`
                : '';

            return `
                <div class="band-card animated-fade-in" data-band-id="${band.id}" tabindex="0" role="button" aria-label="Band ${this.escapeHtml(band.name)} öffnen" style="--band-accent: ${band.color || '#6366f1'}; animation-delay: ${index * 0.06}s;">
                    <div class="band-card-header">
                        <div class="band-card-identity">
                            <div class="band-card-avatar-shell">
                                ${this.getBandAvatarHtml(band)}
                            </div>
                            <div class="band-card-title-group">
                                <div class="band-card-title-row">
                                    <h3>${this.escapeHtml(band.name)}</h3>
                                    <span class="band-role-badge role-badge ${UI.getRoleClass(band.role)}">
                                        ${roleLabel}
                                    </span>
                                </div>
                                <p class="band-card-subtitle">Deine Rolle: ${roleLabel}</p>
                            </div>
                        </div>
                        <span class="band-card-open-icon" aria-hidden="true">↗</span>
                    </div>

                    ${descriptionHtml}

                    <div class="band-card-facts">
                        <span class="band-card-chip">${memberCount} Mitglied${memberCount !== 1 ? 'er' : ''}</span>
                    </div>

                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.band-card').forEach(card => {
            card.addEventListener('click', () => {
                const bandId = card.dataset.bandId;
                this.showBandDetails(bandId);
            });
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    const bandId = card.dataset.bandId;
                    this.showBandDetails(bandId);
                }
            });
        });
    },

    // Show band details modal
    async showBandDetails(bandId) {
        this.currentBandId = bandId;
        const band = await Storage.getBand(bandId);
        const user = Auth.getCurrentUser();

        if (!band) {
            console.error('bandDetails: Band not found in storage', bandId);
            return;
        }

        const members = await Storage.getBandMembers(bandId);
        const membersCount = Array.isArray(members) ? members.length : 0;

        // Set band name and add edit button if allowed
        const nameHeader = document.getElementById('bandDetailsName');
        const coverContainer = document.getElementById('bandDetailsCover');
        const subtitle = document.getElementById('bandDetailsSubtitle');
        const meta = document.getElementById('bandDetailsMeta');
        const membersSummary = document.getElementById('bandDetailsMembersSummary');
        const settingsMeta = document.getElementById('bandDetailsSettingsMeta');
        const canEdit = await Auth.canEditBandDetails(bandId);
        const currentRole = user ? await Storage.getUserRoleInBand(user.id, bandId) : null;

        if (coverContainer) {
            coverContainer.innerHTML = this.getBandDetailsCoverHtml(band);
        }

        if (subtitle) {
            if (band.description) {
                subtitle.textContent = band.description;
                subtitle.style.display = '';
            } else {
                subtitle.textContent = '';
                subtitle.style.display = 'none';
            }
        }

        if (meta) {
            const metaItems = [];
            if (currentRole) {
                metaItems.push(`
                    <span class="band-details-meta-chip role-badge ${UI.getRoleClass(currentRole)}">
                        ${UI.getRoleDisplayName(currentRole)}
                    </span>
                `);
            }
            metaItems.push(`
                <span class="band-details-meta-chip">
                    <span class="band-details-meta-chip-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                    </span>
                    ${membersCount} Mitglied${membersCount !== 1 ? 'er' : ''}
                </span>
            `);
            meta.innerHTML = metaItems.join('');
        }

        if (membersSummary) {
            membersSummary.textContent = membersCount === 1
                ? '1 Mitglied ist aktuell Teil dieser Band.'
                : `${membersCount} Mitglieder sind aktuell Teil dieser Band.`;
        }

        if (settingsMeta) {
            if (band.createdAt) {
                const createdAt = new Date(band.createdAt);
                const createdAtLabel = Number.isNaN(createdAt.getTime())
                    ? UI.formatDateShort(band.createdAt)
                    : createdAt.toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                settingsMeta.hidden = false;
                settingsMeta.innerHTML = `
                    <div class="band-details-settings-meta-item">
                        <span class="band-details-settings-meta-label">Band erstellt</span>
                        <span class="band-details-settings-meta-value">${createdAtLabel}</span>
                    </div>
                `;
            } else {
                settingsMeta.hidden = true;
                settingsMeta.innerHTML = '';
            }
        }

        if (canEdit) {
            nameHeader.style.display = 'flex';
            nameHeader.style.alignItems = 'center';
            nameHeader.style.flexWrap = 'wrap';
            nameHeader.style.gap = '0.75rem';
            nameHeader.innerHTML = `
                <span class="band-details-name-text">${this.escapeHtml(band.name)}</span>
                <button class="btn-icon band-details-edit-btn edit-band-name" title="Bandnamen ändern">✏️</button>
            `;

            // Add edit handler
            nameHeader.querySelector('.edit-band-name').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.editBandName(bandId);
            });
        } else {
            nameHeader.style.display = 'flex';
            nameHeader.style.alignItems = 'center';
            nameHeader.style.gap = '0.75rem';
            nameHeader.innerHTML = `
                <span class="band-details-name-text">${this.escapeHtml(band.name)}</span>
            `;
        }

        // Show modal
        UI.openModal('bandDetailsModal');

        // Render members
        await this.renderBandMembers(bandId, members);

        // Show/hide settings based on permissions
        const canManage = await Auth.canManageBand(bandId);
        const addMemberBtn = document.getElementById('addMemberBtn');
        const deleteBandBtn = document.getElementById('deleteBandBtn');
        const bandSettingsSection = document.getElementById('bandSettingsSection');

        if (addMemberBtn) {
            addMemberBtn.style.display = canManage ? 'inline-flex' : 'none';
        }
        if (deleteBandBtn) {
            deleteBandBtn.style.display = canManage ? 'inline-flex' : 'none';
        }
        // Hide entire Band-Einstellungen section if user can't manage
        if (bandSettingsSection) {
            bandSettingsSection.style.display = canManage ? 'block' : 'none';
        }

        // Clean up settings tab for a fresh start
        const settingsTab = document.getElementById('settingsTab');
        const oldSections = settingsTab.querySelectorAll('.band-details-panel-section, .band-details-settings-meta');
        oldSections.forEach(s => s.remove());

        // Prepare the compact settings panel
        const compactPanel = document.createElement('div');
        compactPanel.className = 'section band-details-panel-section band-settings-compact-panel';
        
        let createdAtLabel = '';
        if (band.createdAt) {
            const createdAt = new Date(band.createdAt);
            createdAtLabel = Number.isNaN(createdAt.getTime())
                ? UI.formatDateShort(band.createdAt)
                : createdAt.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
        }

        compactPanel.innerHTML = `
            <div class="band-settings-compact-header">
                <div>
                    <span class="band-details-section-eyebrow">Verwaltung</span>
                    <h3>Band-Einstellungen</h3>
                </div>
                ${createdAtLabel ? `<span class="band-settings-date-badge" title="Erstellungsdatum">Erstellt am ${createdAtLabel}</span>` : ''}
            </div>

            <div class="band-settings-compact-grid">
                <!-- Profile Image Area -->
                ${canManage ? `
                    <div class="band-settings-compact-item profile-image-item">
                        <label class="compact-setting-label">Profilbild</label>
                        <div class="band-settings-media-compact">
                            <div class="band-settings-media-frame-sm">
                                ${band.image_url
                                    ? `<img src="${band.image_url}" alt="Profilbild" class="band-settings-media-image">`
                                    : `<div class="band-settings-media-fallback-sm" aria-hidden="true">${this.escapeHtml(UI.getUserInitials(band.name || 'Band'))}</div>`
                                }
                            </div>
                            <div class="band-settings-media-actions">
                                <label for="settingsBandImage" class="btn btn-sm btn-outline-secondary">Bild ändern</label>
                                <input type="file" id="settingsBandImage" accept="image/*" style="display: none;">
                                ${band.image_url ? `<button class="btn btn-text-danger btn-sm" id="deleteBandImageBtn">Löschen</button>` : ''}
                                <span id="uploadStatus" class="band-settings-status-sm"></span>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Join Code Area -->
                <div class="band-settings-compact-item join-code-item">
                    <label class="compact-setting-label">Beitrittscode</label>
                    <div class="join-code-row-compact">
                        <code class="join-code-sm" id="bandJoinCode">${band.joinCode || 'Kein Code'}</code>
                        <button class="btn btn-sm btn-secondary" id="copyJoinCodeBtn">Kopieren</button>
                    </div>
                    <p class="compact-setting-note">Teile diesen Code für neue Mitglieder.</p>
                </div>
            </div>

            <div class="band-settings-compact-footer">
                <button class="btn btn-warning btn-sm" id="leaveBandBtn">Band verlassen</button>
                ${canManage ? `<button class="btn btn-text-danger btn-sm" id="deleteBandBtn">Band löschen</button>` : ''}
            </div>
        `;

        settingsTab.appendChild(compactPanel);

        // Add event listeners for the compact panel
        if (canManage) {
            const fileInput = compactPanel.querySelector('#settingsBandImage');
            const deleteImgBtn = compactPanel.querySelector('#deleteBandImageBtn');
            const deleteBandBtn = compactPanel.querySelector('#deleteBandBtn');

            if (fileInput) {
                fileInput.addEventListener('change', async () => {
                    if (fileInput.files.length > 0) {
                        const statusSpan = compactPanel.querySelector('#uploadStatus');
                        if (statusSpan) statusSpan.innerHTML = '⏳...';
                        fileInput.disabled = true;
                        
                        let result = false;
                        if (typeof App.handleUpdateBandImage === 'function') {
                            result = await App.handleUpdateBandImage(bandId, fileInput.files[0]);
                        }
                        
                        fileInput.disabled = false;
                        if (statusSpan) statusSpan.innerHTML = result ? '✅' : '❌';
                    }
                });
            }

            if (deleteImgBtn) {
                deleteImgBtn.addEventListener('click', async () => {
                    if (typeof App.handleDeleteBandImage === 'function') {
                        await App.handleDeleteBandImage(bandId);
                    }
                });
            }

            if (deleteBandBtn) {
                deleteBandBtn.addEventListener('click', () => {
                    // Triggers the deletion logic (assumed to be handled globally or elsewhere)
                    // In the original code, it was likely handled by a global listener or direct call.
                    // For now, we'll assume the button ID is enough if there's a global listener,
                    // otherwise we might need to trigger the deletion logic here.
                    // Let's check for deletion logic in bands.js
                });
            }
        }

        const copyBtn = compactPanel.querySelector('#copyJoinCodeBtn');
        copyBtn.addEventListener('click', () => {
            const code = band.joinCode;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(code).then(() => {
                    UI.showToast('Kopiert', 'success');
                    copyBtn.textContent = 'Kopiert';
                    setTimeout(() => copyBtn.textContent = 'Kopieren', 2000);
                });
            }
        });

        compactPanel.querySelector('#leaveBandBtn').addEventListener('click', async () => {
            const members = await Storage.getBandMembers(bandId);
            if (members.length <= 1) {
                UI.showToast(`Du bist das letzte Mitglied. Bitte lösche die Band stattdessen.`, 'warning');
                return;
            }
            this.leaveBand(bandId);
        });



        // Render band songs
        App.renderBandSongs(bandId);

        // Abwesenheiten Tab available for ALL members
        const absenceTabBtn = document.getElementById('bandAbsencesTabBtn');
        if (absenceTabBtn) {
            absenceTabBtn.style.display = ''; // Show for everyone

            // Ensure click handler is bound
            if (!absenceTabBtn._bound) {
                absenceTabBtn.addEventListener('click', () => {
                    if (window.App && typeof window.App.switchTab === 'function') {
                        window.App.switchTab('absences');
                    }
                });
                absenceTabBtn._bound = true;
            }

            // Ensure tab content exists
            let absencesTab = document.getElementById('absencesTab');
            if (!absencesTab) {
                absencesTab = document.createElement('div');
                absencesTab.id = 'absencesTab';
                absencesTab.className = 'tab-content';
                const modalBody = document.getElementById('bandDetailsModal').querySelector('.modal-body');
                if (modalBody) modalBody.appendChild(absencesTab);
            }

            // Initial render of the absence calendar
            this.renderBandAbsences(bandId);
        }
    },

    // Edit band name
    async editBandName(bandId) {
        const band = await Storage.getBand(bandId);
        if (!band) return;

        // Populate modal form with current band data
        document.getElementById('editBandId').value = bandId;
        document.getElementById('editBandName').value = band.name;
        document.getElementById('editBandDescription').value = band.description || '';

        // Close band details modal first, then open edit modal
        UI.closeModal('bandDetailsModal');

        // Small delay to ensure smooth transition
        setTimeout(() => {
            UI.openModal('editBandModal');
        }, 100);
    },

    // Join band with code
    async joinBand(joinCode) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const band = await Storage.getBandByJoinCode(joinCode);

        if (!band) {
            UI.showToast('Ungültiger Beitrittscode', 'error');
            return;
        }

        // Check if already member
        if (await Auth.isMemberOfBand(band.id)) {
            UI.showToast('Du bist bereits Mitglied dieser Band', 'error');
            return;
        }

        // Determine role: Admin gets leader, others get member
        const role = Auth.isAdmin() ? 'leader' : 'member';

        // Add as member or leader
        await Storage.addBandMember(band.id, user.id, role);
        await Auth.updateCurrentUser();

        // Update header to reflect current user
        const updatedUser = Auth.getCurrentUser();
        const userNameElement = document.getElementById('currentUserName');
        if (userNameElement && updatedUser) {
            userNameElement.textContent = updatedUser.name;
        }

        UI.showToast(`Erfolgreich der Band "${band.name}" beigetreten!`, 'success');

        // Clear the input field
        const joinCodeInput = document.getElementById('joinBandCode');
        if (joinCodeInput) joinCodeInput.value = '';

        UI.closeModal('joinBandModal');
        this.invalidateCache();
        await this.renderBands(true);

        // Update dashboard and navigation
        if (typeof App !== 'undefined') {
            if (App.updateDashboard) await App.updateDashboard();
            if (App.updateNavigationVisibility) App.updateNavigationVisibility();
        }

        // Update nav visibility
        await this.updateNavVisibility();
    },

    // Render band members
    async renderBandMembers(bandId, preloadedMembers = null) {
        const container = document.getElementById('membersList');
        const members = Array.isArray(preloadedMembers) ? preloadedMembers : await Storage.getBandMembers(bandId);
        const currentUser = Auth.getCurrentUser();
        const canManage = await Auth.canManageBand(bandId);
        const canChangeRoles = await Auth.canChangeRoles(bandId);

        if (!Array.isArray(members) || members.length === 0) {
            UI.showEmptyState(container, '👥', 'Noch keine Mitglieder');
            return;
        }

        const userPromises = members.map(m => Storage.getById('users', m.userId));
        const users = await Promise.all(userPromises);
        const userMap = {};
        members.forEach((m, i) => {
            if (users[i]) userMap[m.userId] = users[i];
        });

        container.innerHTML = members.map((member, index) => {
            const user = userMap[member.userId];
            if (!user) return '';

            const displayName = UI.getUserDisplayName(user);
            const isCurrentUser = user.id === currentUser.id;
            // Can remove if manager and not removing self (unless admin)
            const canRemove = canManage && (!isCurrentUser || Auth.isAdmin());

            // Role selector if can change roles
            let roleDisplay;
            if (canChangeRoles && !isCurrentUser) {
                roleDisplay = `
                    <select class="role-select" data-user-id="${user.id}">
                        <option value="member" ${member.role === 'member' ? 'selected' : ''}>Mitglied</option>
                        <option value="co-leader" ${member.role === 'co-leader' ? 'selected' : ''}>Co-Leiter</option>
                        <option value="leader" ${member.role === 'leader' ? 'selected' : ''}>Leiter</option>
                    </select>
                `;
            } else {
                roleDisplay = `
                    <span class="band-role-badge ${UI.getRoleClass(member.role)}">
                        ${UI.getRoleDisplayName(member.role)}
                    </span>
                `;
            }

            // Instrument display
            const instrumentLabels = this.getInstrumentLabels(user.instrument);
            const instrumentHtml = instrumentLabels.length > 0
                ? `
                    <div class="member-instrument-list" aria-label="Instrumente">
                        ${instrumentLabels.map(label => `<span class="member-instrument-item">${this.escapeHtml(label)}</span>`).join('')}
                    </div>
                `
                : '<div class="member-instrument-list is-empty"><span class="member-instrument-item is-muted">Kein Instrument hinterlegt</span></div>';

            return `
                <div class="member-row animated-fade-in" style="animation-delay: ${index * 0.1}s">
                    <div class="member-avatar-col">
                        <div class="member-avatar" style="${user.profile_image_url ? 'background: none;' : `background: ${UI.getAvatarColor(displayName)};`}">
                            ${user.profile_image_url ?
                    `<img src="${user.profile_image_url}" alt="${this.escapeHtml(displayName)}" class="avatar-img">` :
                    `<span class="avatar-initials">${UI.getUserInitials(displayName)}</span>`}
                        </div>
                        ${member.role === 'leader' ? '<div class="leader-badge-overlay" title="Bandleiter">👑</div>' : ''}
                    </div>
                    
                    <div class="member-main-col">
                        <div class="member-name-row">
                            <span class="member-name">${this.escapeHtml(displayName)}</span>
                            ${isCurrentUser ? '<span class="self-status-badge">DU</span>' : ''}
                        </div>
                        <div class="member-meta-row">
                            ${instrumentHtml}
                        </div>
                    </div>

                    <div class="member-actions-col">
                        <div class="member-role-selector">
                            ${roleDisplay}
                        </div>
                        ${canRemove ? `
                            <button class="member-remove-btn" data-user-id="${user.id}" title="Entfernen">
                                <span class="icon">🗑️</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add remove handlers
        container.querySelectorAll('.member-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = btn.dataset.userId;
                this.removeMember(bandId, userId);
            });
        });

        // Add role change handlers
        container.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', (e) => {
                e.stopPropagation();
                const userId = select.dataset.userId;
                const newRole = e.target.value;
                this.updateMemberRole(bandId, userId, newRole);
            });
        });
    },

    // Render Absences Calendar
    async renderBandAbsences(bandId) {
        const container = document.getElementById('absencesTab');
        if (!container) return;

        // Color palette for members
        this.memberColors = [
            '#10b981', // Emerald
            '#f59e0b', // Amber
            '#ef4444', // Rose
            '#6366f1', // Indigo
            '#0ea5e9', // Sky
            '#8b5cf6', // Violet
            '#f43f5e', // Pink
            '#14b8a6'  // Teal
        ];

        // Reset content with structure
        container.innerHTML = `
            <div class="band-details-panel-intro band-details-panel-intro-compact">
                <span class="band-details-section-eyebrow">Kalender</span>
                <h3>Abwesenheiten</h3>
                <p>Behalte Verfuegbarkeiten der Band im Blick und plane transparenter.</p>
            </div>
            <div class="absence-view-controls">
                <div class="filter-group">
                    <div class="absence-filters">
                        <button class="absence-filter-btn active" data-filter="all">Alle</button>
                        <button class="absence-filter-btn" data-filter="own">Deine eigenen</button>
                    </div>
                </div>
                
                <div class="absence-info-badge">
                    <div class="info-icon">i</div>
                    <div class="info-text">
                        Die Abwesenheiten erscheinen auch in der Verfügbarkeitsübersicht und der Datumsauswahl für neue Termine.
                    </div>
                </div>
            </div>

            <div class="absence-main-layout">
                <div id="absenceMembersSidebar" class="absence-members-sidebar">
                    <!-- Members Sidebar injected here -->
                </div>
                
                <div class="absence-calendar-content" style="flex: 1;">
                    <div id="absenceCalendarContainer" class="absence-calendar-grid">
                        <!-- Calendar Grid injected here -->
                    </div>
                </div>
            </div>
        `;

        // Wire up filters
        const btns = container.querySelectorAll('.absence-filter-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderAbsenceCalendarGrid(bandId, btn.dataset.filter);
            });
        });

        // Initial render grid
        await this.renderAbsenceCalendarGrid(bandId, 'all');
    },

    // New: Render Sidebar with members and colors
    async renderAbsenceSidebar(members, memberColorMap, filterType) {
        const sidebar = document.getElementById('absenceMembersSidebar');
        if (!sidebar) return;

        const currentUser = Auth.getCurrentUser();
        sidebar.style.display = 'flex';

        const filteredMembers = filterType === 'own'
            ? members.filter(m => String(m.userId) === String(currentUser?.id))
            : members;

        // Update title based on filter
        const titleEl = document.querySelector('.grid-section-title');
        if (titleEl) {
            titleEl.textContent = filterType === 'own' ? 'Deine Abwesenheiten' : 'Alle Abwesenheiten';
        }

        const membersHtml = await Promise.all(filteredMembers.map(async (member) => {
            const user = await Storage.getById('users', member.userId);
            if (!user) return '';

            const color = memberColorMap[member.userId];
            const displayName = UI.getUserDisplayName(user);
            const initials = UI.getUserInitials(displayName);

            const avatarHtml = user.profile_image_url
                ? `<img src="${user.profile_image_url}" alt="${displayName}" class="member-avatar-img" style="border-color: ${color}">`
                : `<div class="member-avatar-placeholder" style="background: ${UI.getAvatarColor(displayName)}; border-color: ${color}">${initials}</div>`;

            return `
                <div class="absence-member-card">
                    <div class="member-avatar-wrapper">
                        ${avatarHtml}
                    </div>
                    <div class="member-info-name">${displayName}</div>
                </div>
            `;
        }));

        sidebar.innerHTML = membersHtml.join('');
    },

    async renderAbsenceCalendarGrid(bandId, filterType) {
        const gridContainer = document.getElementById('absenceCalendarContainer');
        if (!gridContainer) return;

        gridContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Lade Kalender...</div>';

        const members = await Storage.getBandMembers(bandId);
        const currentUser = Auth.getCurrentUser();

        // Assign colors to members for this view
        const memberColorMap = {};
        members.forEach((member, index) => {
            const color = this.memberColors[index % this.memberColors.length];
            memberColorMap[member.userId] = color;
        });

        // Render Sidebar
        await this.renderAbsenceSidebar(members, memberColorMap, filterType);

        // Collect all absences
        let allAbsences = [];

        for (const member of members) {
            // If filter is 'own', skip other members
            if (filterType === 'own' && member.userId !== currentUser.id) continue;

            const user = await Storage.getById('users', member.userId);
            if (!user) continue;

            const userAbsences = await Storage.getUserAbsences(user.id) || [];
            // enriching absence with user name and color
            userAbsences.forEach(abs => {
                allAbsences.push({
                    ...abs,
                    userName: user.name || 'Unbekannt',
                    userId: user.id,
                    color: memberColorMap[user.id]
                });
            });
        }

        // Clean grid
        gridContainer.innerHTML = '';

        // Generate next 6 months
        const today = new Date();
        // Start from current month
        let currentIterDate = new Date(today.getFullYear(), today.getMonth(), 1);

        for (let i = 0; i < 6; i++) {
            const year = currentIterDate.getFullYear();
            const month = currentIterDate.getMonth(); // 0-based

            const monthBlock = document.createElement('div');
            monthBlock.className = 'month-block';

            const monthName = currentIterDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

            let daysHtml = '';

            const daysInMonth = new Date(year, month + 1, 0).getDate();
            // Get weekday of 1st (0=Sun, 1=Mon, ..., 6=Sat)
            // Adjust to Monday start (Mon=0, ..., Sun=6)
            let startDay = new Date(year, month, 1).getDay();
            startDay = startDay === 0 ? 6 : startDay - 1; // 0=Mon, 6=Sun

            // Empty slots for previous month days
            for (let j = 0; j < startDay; j++) {
                daysHtml += `<div class="calendar-day other-month"></div>`;
            }

            // Days
            for (let d = 1; d <= daysInMonth; d++) {
                const dateObj = new Date(year, month, d);
                const strDate = dateObj.toISOString().split('T')[0];
                const isToday = (today.getDate() === d && today.getMonth() === month && today.getFullYear() === year);

                // Find absences for this day
                const daysAbsences = allAbsences.filter(abs => {
                    const start = abs.startDate.split('T')[0];
                    const end = abs.endDate.split('T')[0];
                    return strDate >= start && strDate <= end;
                });

                let classes = 'calendar-day';
                if (isToday) classes += ' today';

                let style = '';
                let tooltip = '';

                if (daysAbsences.length > 0) {
                    classes += ' has-absence';
                    const names = [...new Set(daysAbsences.map(a => a.userName))].join(', ');
                    tooltip = `title="Abwesend: ${names}"`;

                    if (daysAbsences.length === 1) {
                        style = `--absence-bg: ${daysAbsences[0].color}`;
                    } else {
                        // Create gradient for multiple members
                        const colors = daysAbsences.map(a => a.color);
                        if (daysAbsences.length === 2) {
                            style = `--absence-bg: linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
                        } else {
                            // 3 or more (Split in 3)
                            style = `--absence-bg: linear-gradient(135deg, ${colors[0]} 33%, ${colors[1]} 33% 66%, ${colors[2]} 66%)`;
                        }
                    }
                }

                daysHtml += `<div class="${classes}" ${tooltip} style="${style}">${d}</div>`;
            }

            monthBlock.innerHTML = `
                <div class="month-title">${monthName}</div>
                <div class="month-days-grid">
                    <div class="weekday-header">Mo</div>
                    <div class="weekday-header">Di</div>
                    <div class="weekday-header">Mi</div>
                    <div class="weekday-header">Do</div>
                    <div class="weekday-header">Fr</div>
                    <div class="weekday-header">Sa</div>
                    <div class="weekday-header">So</div>
                    ${daysHtml}
                </div>
            `;

            gridContainer.appendChild(monthBlock);

            // Move to next month
            currentIterDate.setMonth(currentIterDate.getMonth() + 1);
        }
    },

    // Update member role
    async updateMemberRole(bandId, userId, newRole) {
        if (!(await Auth.canChangeRoles(bandId))) {
            UI.showToast('Keine Berechtigung', 'error');
            return;
        }

        await Storage.updateBandMemberRole(bandId, userId, newRole);
        this.invalidateCache();
        UI.showToast('Rolle aktualisiert', 'success');
        await this.renderBandMembers(bandId);
    },

    // Create new band
    async createBand(name, description) {
        const user = Auth.getCurrentUser();
        const supabaseUser = Auth.getSupabaseUser();

        // Use Supabase auth ID as fallback
        const userId = user?.id || supabaseUser?.id;

        console.log('createBand - user:', user);
        console.log('createBand - supabaseUser:', supabaseUser);
        console.log('createBand - userId:', userId);

        if (!userId) {
            UI.showToast('Fehler: Benutzer nicht korrekt geladen. Bitte lade die Seite neu und melde dich erneut an.', 'error');
            return;
        }

        if (!Auth.canCreateBand()) {
            UI.showToast('Du hast keine Berechtigung, Bands zu erstellen', 'error');
            return;
        }

        // Check for duplicate name
        const allBands = await Storage.getAllBands();
        const duplicate = Array.isArray(allBands) ? allBands.find(b => b.name.toLowerCase() === name.trim().toLowerCase()) : null;

        if (duplicate) {
            UI.showToast(`Eine Band mit dem Namen "${name}" existiert bereits`, 'error');
            return;
        }

        UI.showLoading('Erstelle Band...');

        try {
            // Create band
            const band = await Storage.createBand({
                name,
                description
            });

            UI.showLoading('Füge dich als Bandleiter hinzu...');

            // Debug: Log userId
            if (!userId) {
                throw new Error('Benutzer-ID ist undefined - bitte neu anmelden');
            }

            // Automatically add creator as leader
            await Storage.addBandMember(band.id, userId, 'leader');

            this.invalidateCache();
            UI.hideLoading();
            UI.showToast(`Band "${name}" erstellt! Du bist jetzt Bandleiter.`, 'success');

            // Refresh the admin band management list immediately (whether modal is open or not)
            if (typeof App !== 'undefined' && typeof App.renderAllBandsList === 'function') {
                const result = App.renderAllBandsList();
                if (result && typeof result.then === 'function') {
                    await result;
                }
            }
            UI.closeModal('createBandModal');

            // Short delay to allow DB propagation
            await new Promise(r => setTimeout(r, 500));

            await this.renderBands(true);

            // Update navigation visibility to show band tabs
            await this.updateNavVisibility();

            // Refresh dashboard/rehearsals to show new band
            if (typeof Rehearsals !== 'undefined' && typeof Rehearsals.renderRehearsals === 'function') {
                await Rehearsals.renderRehearsals();
            }

            return band;
        } catch (error) {
            UI.hideLoading();
            console.error('Error creating band:', error);
            UI.showToast('Fehler beim Erstellen der Band: ' + (error.message || 'Unbekannter Fehler'), 'error');
        }
    },

    // Add member to band
    addMember(bandId, username, role) {
        const user = Storage.getUserByUsername(username);

        if (!user) {
            UI.showToast('Benutzer nicht gefunden', 'error');
            return;
        }

        // Check if already a member
        const existingMembers = Storage.getBandMembers(bandId);
        const alreadyMember = existingMembers.some(m => m.userId === user.id);

        if (alreadyMember) {
            UI.showToast('Benutzer ist bereits Mitglied dieser Band', 'error');
            return;
        }

        // Add member
        Storage.addBandMember(bandId, user.id, role);

        UI.showToast('Mitglied erfolgreich hinzugefügt!', 'success');
        UI.closeModal('addMemberModal');
        this.renderBandMembers(bandId);
    },

    // Remove member from band
    removeMember(bandId, userId) {
        const user = Storage.getById('users', userId);
        if (!user) return;

        UI.showConfirm(`Möchtest du ${user.name} wirklich aus der Band entfernen?`, () => {
            Storage.removeBandMember(bandId, userId);
            this.invalidateCache();
            UI.showToast('Mitglied entfernt', 'success');
            this.renderBandMembers(bandId);
            this.renderBands(true);
        });
    },

    // Delete band
    async deleteBand(bandId) {
        const band = await Storage.getBand(bandId);
        if (!band) return;

        // Check permission: only leader can delete band
        const canDelete = await Auth.canManageBand(bandId);
        if (!canDelete) {
            UI.showToast('Nur der Band-Leiter kann die Band löschen', 'error');
            return;
        }

        const confirmed = await UI.confirmDelete(`Möchtest du die Band "${band.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`);
        if (confirmed) {
            await Storage.deleteBand(bandId);
            this.invalidateCache();
            UI.showToast('Band gelöscht', 'success');
            UI.closeModal('bandDetailsModal');
            await this.renderBands(true);

            // Update admin band management list
            if (typeof App !== 'undefined' && typeof App.renderAllBandsList === 'function') {
                await App.renderAllBandsList();
            }

            // Update dashboard if needed
            if (typeof App !== 'undefined' && App.updateDashboard) {
                await App.updateDashboard();
            }
            // Update nav visibility after deleting a band
            await this.updateNavVisibility();
        }
    },

    // Leave band (current user)
    async leaveBand(bandId) {
        const band = await Storage.getBand(bandId);
        const user = Auth.getCurrentUser();
        if (!band || !user) return;

        const confirmed = await UI.confirmAction(
            `Möchtest du die Band "${band.name}" wirklich verlassen?`,
            'Band verlassen?',
            'Verlassen',
            'btn-warning'
        );
        if (!confirmed) return;

        // Remove current user from band members
        const ok = await Storage.removeBandMember(bandId, user.id);
        if (ok) {
            this.invalidateCache();
            UI.showToast('Du hast die Band verlassen', 'success');
            UI.closeModal('bandDetailsModal');
            await this.renderBands(true);
            if (typeof App !== 'undefined' && App.updateDashboard) await App.updateDashboard();
            // Notify other modules
            document.dispatchEvent(new Event('bandsUpdated'));
            // Update nav visibility
            await this.updateNavVisibility();
        } else {
            UI.showToast('Konnte die Band-Zugehörigkeit nicht entfernen', 'error');
        }
    },

    // Show/hide navigation items depending on whether the current user is in at least one band
    async updateNavVisibility() {
        try {
            const user = Auth.getCurrentUser();
            const bands = user ? (await Storage.getUserBands(user.id)) || [] : [];
            const show = bands.length > 0;

            // 'Auftritte' Tab soll IMMER sichtbar sein
            document.querySelectorAll('.nav-item[data-view="events"], .nav-subitem[data-view="events"]').forEach(item => {
                item.style.display = '';
            });

            // 'Neuen Probetermin' Button nur anzeigen, wenn mindestens eine Band
            const createRehearsalBtn = document.getElementById('createRehearsalBtn');
            if (createRehearsalBtn) {
                createRehearsalBtn.style.display = show ? '' : 'none';
            }

            // Probetermine Tab nur anzeigen, wenn mindestens eine Band
            const rehearsalsBtn = document.querySelector('.nav-item[data-view="rehearsals"]');
            if (rehearsalsBtn) rehearsalsBtn.style.display = show ? '' : 'none';

            // Diese Buttons sollen IMMER sichtbar sein
            const absenceBtn = document.getElementById('absenceBtn');
            const settingsBtn = document.getElementById('settingsBtn');
            if (absenceBtn) absenceBtn.style.display = 'inline-block';
            if (settingsBtn) settingsBtn.style.display = 'inline-block';
        } catch (e) {
            console.error('updateNavVisibility error', e);
        }
    },

    // Populate band select dropdowns
    async populateBandSelects() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const bands = (await Storage.getUserBands(user.id)) || [];

        // Populate rehearsal band select (Rolle egal: alle Bands des Nutzers)
        const rehearsalSelect = document.getElementById('rehearsalBand');
        if (rehearsalSelect) {
            const eligibleBands = bands;

            rehearsalSelect.innerHTML = '<option value="">Band auswählen</option>' +
                eligibleBands.map(band =>
                    `<option value="${band.id}">${this.escapeHtml(band.name)}</option>`
                ).join('');

            // Vorauswahl: wenn genau eine Band vorhanden ist
            if (eligibleBands.length === 1) {
                rehearsalSelect.value = eligibleBands[0].id;
                rehearsalSelect.dispatchEvent(new Event('change'));
            }
        }

        // Populate band filter (rehearsals)
        const bandFilter = document.getElementById('bandFilter');
        if (bandFilter) {
            bandFilter.innerHTML = '<option value="">Alle Bands</option>' +
                bands.map(band =>
                    `<option value="${band.id}">${this.escapeHtml(band.name)}</option>`
                ).join('');

            // Preselect if user is only in one band
            if (bands.length === 1) {
                bandFilter.value = bands[0].id;
                bandFilter.dispatchEvent(new Event('change'));
            }
        }

        // Populate event band filter
        const eventBandFilter = document.getElementById('eventBandFilter');
        if (eventBandFilter) {
            eventBandFilter.innerHTML = '<option value="">Alle Bands</option>' +
                bands.map(band =>
                    `<option value="${band.id}">${this.escapeHtml(band.name)}</option>`
                ).join('');
        }

        // Populate stats band select
        const statsBandSelect = document.getElementById('statsBandSelect');
        if (statsBandSelect) {
            statsBandSelect.innerHTML = '<option value="">Band auswählen</option>' +
                bands.map(band =>
                    `<option value="${band.id}">${this.escapeHtml(band.name)}</option>`
                ).join('');
            // Vorauswahl: wenn genau eine Band vorhanden ist
            if (bands.length === 1) {
                statsBandSelect.value = bands[0].id;
                statsBandSelect.dispatchEvent(new Event('change'));
            }
        }

        // Populate event band select (for event creation)
        const eventBandSelect = document.getElementById('eventBand');
        if (eventBandSelect) {
            eventBandSelect.innerHTML = '<option value="">Band auswählen</option>' +
                bands.map(band =>
                    `<option value="${band.id}">${this.escapeHtml(band.name)}</option>`
                ).join('');
            // Vorauswahl: wenn genau eine Band vorhanden ist
            if (bands.length === 1) {
                eventBandSelect.value = bands[0].id;
                eventBandSelect.dispatchEvent(new Event('change'));
            }
        }
    },

    // Utility: Escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },



    // Add member to band
    async addMember(bandId, username, role) {
        const userToAdd = await Storage.getUserByUsername(username);

        if (!userToAdd) {
            UI.showToast(`Benutzer "${username}" nicht gefunden`, 'error');
            return;
        }

        // Check if already a member
        const currentRole = await Storage.getUserRoleInBand(userToAdd.id, bandId);
        if (currentRole) {
            UI.showToast('Benutzer ist bereits Mitglied der Band', 'warning');
            return;
        }

        const success = await Storage.addBandMember(bandId, userToAdd.id, role);
        if (success) {
            UI.showToast('Mitglied erfolgreich hinzugefügt', 'success');

            // Refresh logic handled in UI calls but good to have here options
            if (this.currentBandId === bandId) {
                this.renderBandMembers(bandId);
            }

            UI.closeModal('addMemberModal');
            // Bands.renderBands(); // Only needed if member count in list changes
        } else {
            UI.showToast('Fehler beim Hinzufügen des Mitglieds', 'error');
        }
    }
};
