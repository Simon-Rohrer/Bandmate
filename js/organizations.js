// Organizations Management Module
const Organizations = {
    currentOrgId: null,
    orgSettingsDirty: false,
    orgImageDraftFile: null,
    orgImageRemovalPending: false,
    organizationsCache: null,
    browseCache: null,

    init() {
        this.bindEvents();
    },

    async getCurrentOrgMembership() {
        const user = Auth.getCurrentUser();
        if (!this.currentOrgId || !user?.id) return null;
        return await Storage.getOrganizationMember(this.currentOrgId, user.id);
    },

    async getCurrentOrgPermissions() {
        const membership = await this.getCurrentOrgMembership();
        const role = String(membership?.role || '').toLowerCase();
        const isActive = membership?.status === 'active';

        return {
            membership,
            role,
            canView: isActive,
            canManage: isActive && ['admin', 'manager'].includes(role),
            canAdmin: isActive && role === 'admin'
        };
    },

    setElementVisible(elementOrId, visible, display = 'inline-flex') {
        const element = typeof elementOrId === 'string'
            ? document.getElementById(elementOrId)
            : elementOrId;
        if (element) element.style.display = visible ? display : 'none';
    },

    applyOrgPermissions(permissions) {
        const canManage = !!permissions?.canManage;
        const canAdmin = !!permissions?.canAdmin;

        this.setElementVisible('inviteOrgMemberBtn', canManage);
        this.setElementVisible('linkBandBtn', canManage);
        this.setElementVisible('addOrgSongBtn', canManage);
        this.setElementVisible('addOrgLocationBtn', canManage);
        this.setElementVisible('orgQuickAddBtn', canManage);

        const quickAddMenu = document.getElementById('orgQuickAddMenu');
        if (quickAddMenu && !canManage) {
            quickAddMenu.hidden = true;
        }

        const settingsTabBtn = document.querySelector('.tab-btn[data-tab="org-settings"]');
        if (settingsTabBtn) {
            settingsTabBtn.style.display = canAdmin ? 'block' : 'none';
        }

        const inviteRoleSelect = document.getElementById('inviteOrgRole');
        const inviteAdminOption = inviteRoleSelect?.querySelector('option[value="admin"]');
        if (inviteAdminOption) {
            inviteAdminOption.hidden = !canAdmin;
            inviteAdminOption.disabled = !canAdmin;
            if (!canAdmin && inviteRoleSelect.value === 'admin') {
                inviteRoleSelect.value = 'member';
            }
        }
    },

    bindEvents() {
        // List Actions
        const openChoiceBtn = document.getElementById('openOrgChoiceBtn');
        if (openChoiceBtn) {
            openChoiceBtn.onclick = () => UI.openModal('orgChoiceModal');
        }

        const choiceJoin = document.getElementById('choiceJoinOrg');
        if (choiceJoin) {
            choiceJoin.onclick = () => {
                UI.closeModal('orgChoiceModal');
                this.browseOrganizations();
            };
        }

        const choiceCreate = document.getElementById('choiceCreateOrg');
        if (choiceCreate) {
            choiceCreate.onclick = () => {
                UI.closeModal('orgChoiceModal');
                UI.openModal('createOrgModal');
            };
        }

        const closeOrgChoice = document.getElementById('closeOrgChoiceModal');
        if (closeOrgChoice) {
            closeOrgChoice.onclick = () => UI.closeModal('orgChoiceModal');
        }

        const cancelOrgChoice = document.getElementById('cancelOrgChoiceBtn');
        if (cancelOrgChoice) {
            cancelOrgChoice.onclick = () => UI.closeModal('orgChoiceModal');
        }

        const searchInput = document.getElementById('searchOrgsInput');
        if (searchInput) {
            searchInput.oninput = (e) => this.filterBrowseList(e.target.value);
        }

        const sendRequestBtn = document.getElementById('requestJoinOrgBtn');
        if (sendRequestBtn) {
            sendRequestBtn.onclick = () => this.sendJoinRequest();
        }

        const cancelRemoveOrgMemberBtn = document.getElementById('cancelRemoveOrgMemberBtn');
        if (cancelRemoveOrgMemberBtn) {
            cancelRemoveOrgMemberBtn.onclick = () => UI.closeModal('removeOrgMemberConfirmModal');
        }

        const confirmRemoveOrgMemberBtn = document.getElementById('confirmRemoveOrgMemberBtn');
        if (confirmRemoveOrgMemberBtn) {
            confirmRemoveOrgMemberBtn.onclick = () => this.handleRemoveMember();
        }

        // Form Submission
        const createOrgForm = document.getElementById('createOrgForm');
        if (createOrgForm) {
            createOrgForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleCreateOrganization();
            };
        }

        // Modal Close/Cancel
        const closeCreateOrgModal = document.getElementById('closeCreateOrgModal');
        if (closeCreateOrgModal) {
            closeCreateOrgModal.onclick = () => UI.closeModal('createOrgModal');
        }
        const cancelCreateOrgBtn = document.getElementById('cancelCreateOrgBtn');
        if (cancelCreateOrgBtn) {
            cancelCreateOrgBtn.onclick = () => UI.closeModal('createOrgModal');
        }

        // Modal Tab Switching
        const orgModalTabs = document.getElementById('orgModalTabs');
        if (orgModalTabs) {
            orgModalTabs.querySelectorAll('.tab-btn').forEach(btn => {
                btn.onclick = () => this.switchTab(btn.dataset.tab);
            });
        }

        // Settings (within modal)
        const saveOrgSettingsBtn = document.getElementById('saveOrgSettingsBtn');
        if (saveOrgSettingsBtn) {
            saveOrgSettingsBtn.onclick = () => this.handleSaveSettings();
        }

        const deleteOrgBtn = document.getElementById('deleteOrgBtn');
        if (deleteOrgBtn) {
            deleteOrgBtn.onclick = () => this.handleDeleteOrganization();
        }

        // Image Upload Handlers
        const orgImageUploadBtn = document.getElementById('orgImageUploadBtn');
        const orgImageInput = document.getElementById('orgImageInput');
        if (orgImageUploadBtn && orgImageInput) {
            orgImageUploadBtn.onclick = () => orgImageInput.click();
            orgImageInput.onchange = (e) => this.handleImageSelect(e);
        }

        // Dirty Tracking
        const settingsInputs = ['editOrgName', 'editOrgDescription'];
        settingsInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    this.orgSettingsDirty = true;
                    window._orgSettingsDirty = true;
                });
            }
        });
        UI.guardModalClose('orgDetailsModal', '_orgSettingsDirty');

        // Member Invitation
        const inviteOrgMemberBtn = document.getElementById('inviteOrgMemberBtn');
        if (inviteOrgMemberBtn) {
            inviteOrgMemberBtn.onclick = () => UI.openModal('inviteOrgMemberModal');
        }

        const inviteOrgMemberForm = document.getElementById('inviteOrgMemberForm');
        if (inviteOrgMemberForm) {
            inviteOrgMemberForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleInviteMember();
            };
        }

        const closeInviteOrgModal = document.getElementById('closeInviteOrgModal');
        if (closeInviteOrgModal) {
            closeInviteOrgModal.onclick = () => UI.closeModal('inviteOrgMemberModal');
        }
        const cancelInviteOrgBtn = document.getElementById('cancelInviteOrgBtn');
        if (cancelInviteOrgBtn) {
            cancelInviteOrgBtn.onclick = () => UI.closeModal('inviteOrgMemberModal');
        }

        // Band Linking
        const linkBandBtn = document.getElementById('linkBandBtn');
        if (linkBandBtn) {
            linkBandBtn.onclick = () => this.handleLinkBand();
        }

        const linkOrgBandForm = document.getElementById('linkOrgBandForm');
        if (linkOrgBandForm) {
            linkOrgBandForm.onsubmit = async (e) => {
                e.preventDefault();
            };
        }
        
        const orgBandSearchInput = document.getElementById('orgBandSearchInput');
        if (orgBandSearchInput) {
            orgBandSearchInput.addEventListener('input', (e) => {
                clearTimeout(this.orgBandSearchTimeout);
                this.orgBandSearchTimeout = setTimeout(() => {
                    this.renderOrgBandSearchResults(e.target.value.trim());
                }, 300);
            });
        }

        const closeLinkOrgBandModal = document.getElementById('closeLinkOrgBandModal');
        if (closeLinkOrgBandModal) {
            closeLinkOrgBandModal.onclick = () => UI.closeModal('linkOrgBandModal');
        }
        const cancelLinkOrgBandBtn = document.getElementById('cancelLinkOrgBandBtn');
        if (cancelLinkOrgBandBtn) {
            cancelLinkOrgBandBtn.onclick = () => UI.closeModal('linkOrgBandModal');
        }

        // Song Addition
        const addOrgSongBtn = document.getElementById('addOrgSongBtn');
        if (addOrgSongBtn) {
            addOrgSongBtn.onclick = () => this.handleAddOrgSong();
        }

        // Location Creation
        const addOrgLocationBtn = document.getElementById('addOrgLocationBtn');
        if (addOrgLocationBtn) {
            addOrgLocationBtn.onclick = () => UI.openModal('createOrgLocationModal');
        }

        const createOrgLocationForm = document.getElementById('createOrgLocationForm');
        if (createOrgLocationForm) {
            createOrgLocationForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleCreateLocation();
            };
        }

        const closeCreateOrgLocationModal = document.getElementById('closeCreateOrgLocationModal');
        if (closeCreateOrgLocationModal) {
            closeCreateOrgLocationModal.onclick = () => UI.closeModal('createOrgLocationModal');
        }
        const cancelCreateOrgLocationBtn = document.getElementById('cancelCreateOrgLocationBtn');
        if (cancelCreateOrgLocationBtn) {
            cancelCreateOrgLocationBtn.onclick = () => UI.closeModal('createOrgLocationModal');
        }

        // Quick Add Toggle
        const orgQuickAddBtn = document.getElementById('orgQuickAddBtn');
        const orgQuickAddMenu = document.getElementById('orgQuickAddMenu');
        if (orgQuickAddBtn && orgQuickAddMenu) {
            orgQuickAddBtn.onclick = (e) => {
                e.stopPropagation();
                const isHidden = orgQuickAddMenu.hidden;
                orgQuickAddMenu.hidden = !isHidden;
                orgQuickAddBtn.setAttribute('aria-expanded', !isHidden);
            };

            document.addEventListener('click', (e) => {
                if (!orgQuickAddBtn.contains(e.target) && !orgQuickAddMenu.contains(e.target)) {
                    orgQuickAddMenu.hidden = true;
                    orgQuickAddBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }
    },

    async renderOrganizations(forceRefresh = false) {
        if (forceRefresh) this.organizationsCache = null;
        
        const container = document.getElementById('organizationsList');
        if (!container) return;

        if (this.organizationsCache && !forceRefresh) {
            this._renderOrganizationsList(container, this.organizationsCache);
            return;
        }

        UI.showLoading('Organisationen werden geladen...');
        try {
            const user = Auth.getCurrentUser();
            if (!user) return;

            const orgs = await Storage.getOrganizations(user.id);
            this.organizationsCache = orgs;
            this._renderOrganizationsList(container, orgs);
        } catch (error) {
            Logger.error('Error rendering organizations:', error);
            UI.showToast('Fehler beim Laden der Organisationen', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    _renderOrganizationsList(container, orgs) {
        if (!orgs || orgs.length === 0) {
            container.innerHTML = `
                <div class="bands-empty-state">
                    <div class="bands-empty-icon">🏢</div>
                    <h3>Keine Organisationen</h3>
                    <p>Du bist noch kein Mitglied einer Organisation. Erstelle eine neue oder lass dich einladen.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = orgs.map((org, index) => {
            const initials = UI.getUserInitials(org.name);
            const typeLabel = this.getOrgTypeLabel(org.type);
            const description = org.description ? `<p class="band-card-description">${this.escapeHtml(org.description)}</p>` : '';

            return `
                <div class="band-card animated-fade-in" onclick="Organizations.showOrgDetail('${org.id}')" style="--band-accent: var(--color-primary); animation-delay: ${index * 0.05}s;">
                    <div class="band-card-header">
                        <div class="band-card-identity">
                            <div class="band-card-avatar-shell">
                                <div class="band-card-avatar" style="background: var(--color-bg-secondary); color: var(--color-primary);">
                                    ${initials}
                                </div>
                            </div>
                            <div class="band-card-title-group">
                                <div class="band-card-title-row">
                                    <h3>${this.escapeHtml(org.name)}</h3>
                                    <span class="band-role-badge role-badge role-admin">
                                        ${typeLabel}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <span class="band-card-open-icon" aria-hidden="true">↗</span>
                    </div>
                    ${description}
                </div>
            `;
        }).join('');
    },

    getOrgTypeLabel(type) {
        const types = {
            'club': 'Verein',
            'agency': 'Agentur',
            'collective': 'Kollektiv',
            'other': 'Sonstiges'
        };
        return types[type] || type;
    },

    async handleCreateOrganization() {
        const name = document.getElementById('orgName').value.trim();
        const description = document.getElementById('orgDescription').value.trim();
        const type = document.getElementById('orgType').value;
        const website = document.getElementById('orgWebsite').value.trim();
        const email = document.getElementById('orgEmail').value.trim();
        const phone = document.getElementById('orgPhone').value.trim();
        const user = Auth.getCurrentUser();

        if (!name) return;

        UI.showLoading('Organisation wird erstellt...');
        try {
            const orgData = {
                name,
                description,
                type,
                owner_id: user.id,
                created_by: user.id
            };

            await Storage.createOrganization(orgData);
            UI.showToast('Organisation erfolgreich erstellt', 'success');
            UI.closeModal('createOrgModal');
            document.getElementById('createOrgForm').reset();
            await this.renderOrganizations(true);
        } catch (error) {
            Logger.error('Error creating organization:', error);
            UI.showToast('Fehler beim Erstellen der Organisation', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async showOrgDetail(orgId) {
        this.currentOrgId = orgId;
        const [org, permissions] = await Promise.all([
            Storage.getOrganization(orgId),
            (async () => {
                const user = Auth.getCurrentUser();
                const membership = user?.id ? await Storage.getOrganizationMember(orgId, user.id) : null;
                const role = String(membership?.role || '').toLowerCase();
                const isActive = membership?.status === 'active';
                return {
                    membership,
                    role,
                    canView: isActive,
                    canManage: isActive && ['admin', 'manager'].includes(role),
                    canAdmin: isActive && role === 'admin'
                };
            })()
        ]);
        if (!org) return;

        if (!permissions.canView) {
            UI.showToast('Du hast noch keinen Zugriff auf diese Organisation.', 'warning');
            return;
        }

        // Open Modal
        UI.openModal('orgDetailsModal');
        
        // Update Hero Info
        const nameEl = document.getElementById('orgDetailsName');
        if (nameEl) nameEl.textContent = org.name;

        const subtitleEl = document.getElementById('orgDetailsSubtitle');
        if (subtitleEl) subtitleEl.textContent = this.getOrgTypeLabel(org.type);

        const coverEl = document.getElementById('orgDetailsCover');
        const imgPreview = document.getElementById('orgSettingsImagePreview');
        
        if (org.image_url) {
            if (coverEl) {
                coverEl.style.backgroundImage = `url(${org.image_url})`;
                coverEl.style.backgroundSize = 'cover';
                coverEl.style.backgroundPosition = 'center';
                coverEl.textContent = '';
            }
            if (imgPreview) {
                imgPreview.style.backgroundImage = `url(${org.image_url})`;
                imgPreview.style.backgroundSize = 'cover';
                imgPreview.style.backgroundPosition = 'center';
                imgPreview.textContent = '';
            }
        } else {
            if (coverEl) {
                coverEl.style.backgroundImage = 'none';
                coverEl.textContent = UI.getUserInitials(org.name);
                coverEl.style.background = 'var(--color-bg-tertiary)';
                coverEl.style.color = 'var(--color-primary)';
                coverEl.style.display = 'flex';
                coverEl.style.alignItems = 'center';
                coverEl.style.justifyContent = 'center';
                coverEl.style.fontSize = '2rem';
                coverEl.style.fontWeight = '700';
            }
            if (imgPreview) {
                imgPreview.style.backgroundImage = 'none';
                imgPreview.innerHTML = '<span id="orgSettingsImagePlaceholder">🏢</span>';
            }
        }

        // Update Settings Form
        const editName = document.getElementById('editOrgName');
        const editDesc = document.getElementById('editOrgDescription');
        if (editName) editName.value = org.name;
        if (editDesc) editDesc.value = org.description || '';

        this.applyOrgPermissions(permissions);

        // Reset to Overview
        this.switchTab('org-overview');
    },

    switchTab(tabId) {
        if (typeof tabId === 'string' && tabId.endsWith('Tab')) {
            tabId = tabId.slice(0, -3);
        }

        const orgModalTabs = document.getElementById('orgModalTabs');
        if (!orgModalTabs) return;

        // Update tab buttons
        orgModalTabs.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update tab panels
        const modalBody = document.querySelector('#orgDetailsModal .modal-body');
        if (modalBody) {
            modalBody.querySelectorAll('.tab-content').forEach(panel => {
                panel.classList.toggle('active', panel.id === `${tabId}Tab`);
            });
        }

        // Load tab content
        this.loadTabContent(tabId);
    },

    async loadTabContent(tabId) {
        if (!this.currentOrgId) return;

        switch (tabId) {
            case 'org-overview':
                await this.loadOverview();
                break;
            case 'org-members':
                await this.loadMembers();
                break;
            case 'org-bands':
                await this.loadBands();
                break;
            case 'org-songpool':
                await this.loadSongpool();
                break;
            case 'org-musikpool':
                await this.loadMusikpool();
                break;
            case 'org-locations':
                await this.loadLocations();
                break;
            case 'org-settings':
                await this.loadSettings();
                break;
        }
    },

    async loadOverview() {
        try {
            const user = Auth.getCurrentUser();
            const [members, bands, songs] = await Promise.all([
                Storage.getOrganizationMembers(this.currentOrgId),
                Storage.getOrganizationBands(this.currentOrgId),
                Storage.getSongpoolSongs(user.id, { organizationId: this.currentOrgId })
            ]);

            const memCount = document.getElementById('orgMemberCount');
            if (memCount) memCount.textContent = members.length;
            
            const bandCount = document.getElementById('orgBandCount');
            if (bandCount) bandCount.textContent = bands.length;
            
            const songCount = document.getElementById('orgSongCount');
            if (songCount) songCount.textContent = songs.length;

            // Update section summaries
            const memSummary = document.getElementById('orgDetailsMembersSummary');
            if (memSummary) memSummary.textContent = `${members.length} Mitglied${members.length !== 1 ? 'er sind' : ' ist'} aktuell Teil dieser Organisation.`;

            const bandSummary = document.getElementById('orgDetailsBandsSummary');
            if (bandSummary) bandSummary.textContent = `${bands.length} Band${bands.length !== 1 ? 's sind' : ' ist'} mit dieser Organisation verknüpft.`;

            const songSummary = document.getElementById('orgDetailsSongsSummary');
            if (songSummary) songSummary.textContent = `${songs.length} Song${songs.length !== 1 ? 's befinden' : ' befindet'} sich im Organisations-Songpool.`;

            // Load recent activity
            await this.loadHistory();
        } catch (error) {
            Logger.error('[Organizations] Error loading overview:', error);
        }
    },

    async loadMembers() {
        const container = document.getElementById('orgMembersList');
        if (!container) return;

        container.innerHTML = '<div class="loading-inline">Mitglieder werden geladen...</div>';
        
        try {
            const user = Auth.getCurrentUser();
            const permissions = await this.getCurrentOrgPermissions();
            const canManage = permissions.canManage;
            const canChangeRoles = permissions.canAdmin;
            const members = await Storage.getOrganizationMembers(this.currentOrgId, { includePending: canManage });

            this.applyOrgPermissions(permissions);

            if (Logger.debugMode) {
                console.log('[Organizations] Member list loaded:', members);
                console.log('[Organizations] Current user member state:', permissions.membership);
                console.log('[Organizations] canManage:', canManage);
            }

            if (members.length === 0) {
                container.innerHTML = '<p class="text-secondary">Keine Mitglieder gefunden.</p>';
                return;
            }

            // Get user details for all members
            const memberProfiles = await Promise.all(members.map(async m => {
                const profile = await Storage.getById('users', m.user_id);
                return { ...m, profile };
            }));

            container.innerHTML = memberProfiles.map((m, index) => {
                const name = m.profile ? `${m.profile.first_name || ''} ${m.profile.last_name || ''}`.trim() || m.profile.email : 'Unbekannter User';
                const initials = UI.getUserInitials(name);
                const isCurrentUser = m.user_id === user.id;
                const isPending = m.status !== 'active';
                const statusText = isPending
                    ? (m.invited_by || (m.status && m.status !== 'pending') ? 'Einladung offen' : 'Anfrage offen')
                    : 'Aktiv';
                
                // Role selector
                let roleDisplay;
                if (canChangeRoles && !isCurrentUser && !isPending) {
                    roleDisplay = `
                        <select class="role-select" data-user-id="${m.user_id}">
                            <option value="member" ${m.role === 'member' ? 'selected' : ''}>Mitglied</option>
                            <option value="manager" ${m.role === 'manager' ? 'selected' : ''}>Manager</option>
                            <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    `;
                } else {
                    roleDisplay = `
                        <span class="band-role-badge ${UI.getRoleClass(m.role)}">
                            ${this.getRoleLabel(m.role)}
                        </span>
                    `;
                }

                return `
                    <div class="member-row animated-fade-in" style="animation-delay: ${index * 0.1}s">
                        <div class="member-avatar-col">
                            <div class="member-avatar" style="${m.profile?.profile_image_url ? 'background: none;' : `background: ${UI.getAvatarColor(name)};`}">
                                ${m.profile?.profile_image_url ?
                                    `<img src="${m.profile.profile_image_url}" alt="${this.escapeHtml(name)}" class="avatar-img">` :
                                    `<span class="avatar-initials">${initials}</span>`}
                            </div>
                        </div>
                        
                        <div class="member-main-col">
                            <div class="member-name-row">
                                <span class="member-name">${this.escapeHtml(name)}</span>
                                ${isCurrentUser ? '<span class="self-status-badge">DU</span>' : ''}
                            </div>
                            <div class="member-meta-row">
                                <span class="status-indicator status-${m.status || 'active'}"></span>
                                <span class="text-xs text-secondary">${statusText}</span>
                            </div>
                        </div>

                        <div class="member-actions-col">
                            <div class="member-role-selector">
                                ${roleDisplay}
                            </div>
                            ${canManage && !isCurrentUser ? `
                                <button class="member-remove-btn" data-user-id="${m.user_id}" data-user-name="${this.escapeHtml(m.profile?.display_name || m.profile?.email)}" title="Entfernen">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                                        <path d="M3 6h18"></path>
                                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Bind actions
            if (canManage) {
                container.querySelectorAll('.role-select').forEach(select => {
                    select.onchange = (e) => this.handleUpdateMemberRole(select.dataset.userId, e.target.value);
                });
                container.querySelectorAll('.member-remove-btn').forEach(btn => {
                    btn.onclick = () => this.promptRemoveMember(btn.dataset.userId, btn.dataset.userName);
                });
            }

            // Also update the roles overview in settings
            this.renderRolesOverview(memberProfiles);

        } catch (error) {
            Logger.error('Error loading members:', error);
            container.innerHTML = '<p class="text-danger">Fehler beim Laden der Mitglieder.</p>';
        }
    },

    getRoleLabel(role) {
        const roles = {
            'admin': 'Administrator',
            'manager': 'Manager',
            'member': 'Mitglied'
        };
        return roles[role?.toLowerCase()] || role;
    },

    renderRolesOverview(memberProfiles) {
        const container = document.getElementById('orgRolesOverview');
        if (!container) {
            // If the element doesn't exist yet, we might need to add it to the settings tab
            const settingsTab = document.getElementById('org-settingsTab');
            if (settingsTab) {
                const rolesSection = document.createElement('div');
                rolesSection.className = 'section band-details-panel-section band-details-settings-panel mt-6';
                rolesSection.innerHTML = `
                    <div class="band-details-panel-head">
                        <div>
                            <span class="band-details-section-eyebrow">Struktur</span>
                            <h3>Rollen-Übersicht</h3>
                            <p class="band-details-section-note">Wer hat welche Berechtigungen?</p>
                        </div>
                    </div>
                    <div id="orgRolesOverview"></div>
                `;
                // Insert before the danger zone (last child usually)
                settingsTab.appendChild(rolesSection);
            }
        }
        
        const target = document.getElementById('orgRolesOverview');
        if (!target) return;

        const activeMembers = memberProfiles.filter(member => member.status === 'active');
        const roleGroups = {
            admin: activeMembers.filter(m => m.role === 'admin'),
            manager: activeMembers.filter(m => m.role === 'manager'),
            member: activeMembers.filter(m => m.role === 'member')
        };

        target.innerHTML = `
            <div class="roles-grid">
                ${Object.entries(roleGroups).map(([role, users]) => `
                    <div class="role-group-card">
                        <div class="role-group-header">
                            <span class="role-badge role-${role}">${this.getRoleLabel(role)}</span>
                            <span class="role-count">${users.length}</span>
                        </div>
                        <div class="role-group-users">
                            ${users.length > 0 ? users.map(u => {
                                const name = u.profile ? `${u.profile.first_name || ''} ${u.profile.last_name || ''}`.trim() || u.profile.email : 'Unbekannt';
                                return `<span class="role-user-tag">${this.escapeHtml(name)}</span>`;
                            }).join('') : '<span class="text-xs text-secondary">Niemand</span>'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    async handleUpdateMemberRole(userId, newRole) {
        if (!newRole) return;

        UI.showLoading('Rolle wird aktualisiert...');
        try {
            await Storage.updateOrganizationMemberRole(this.currentOrgId, userId, newRole);
            UI.showToast('Rolle erfolgreich aktualisiert', 'success');
            await this.loadMembers();
        } catch (error) {
            Logger.error('Error updating role:', error);
            UI.showToast('Fehler beim Aktualisieren der Rolle', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    promptRemoveMember(userId, userName) {
        this.memberToRemove = userId;
        document.getElementById('removeOrgMemberConfirmText').innerHTML = `Möchtest du <strong>${userName}</strong> wirklich aus der Organisation entfernen?`;
        UI.openModal('removeOrgMemberConfirmModal');
    },

    async handleRemoveMember() {
        if (!this.memberToRemove) return;
        const userId = this.memberToRemove;

        UI.showLoading('Mitglied wird entfernt...');
        try {
            await Storage.removeOrganizationMember(this.currentOrgId, userId);
            UI.showToast('Mitglied entfernt', 'success');
            UI.closeModal('removeOrgMemberConfirmModal');
            this.memberToRemove = null;
            await this.loadMembers();
        } catch (error) {
            Logger.error('Error removing member:', error);
            UI.showToast('Fehler beim Entfernen des Mitglieds', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async loadBands() {
        const container = document.getElementById('orgBandsList');
        if (!container) return;

        container.innerHTML = '<div class="loading-state-sm"><div class="spinner-sm"></div></div>';

        try {
            const permissions = await this.getCurrentOrgPermissions();
            const canManage = permissions.canManage;
            const bands = await Storage.getOrganizationBands(this.currentOrgId, { includePending: canManage });

            this.applyOrgPermissions(permissions);

            if (bands.length === 0) {
                container.innerHTML = `
                    <div class="bands-empty-state">
                        <div class="bands-empty-icon">🎸</div>
                        <h3>Keine Bands verknüpft</h3>
                        <p>Es sind noch keine Bands mit dieser Organisation verknüpft.</p>
                    </div>
                `;
                return;
            }

            const bandsWithMembers = await Promise.all(bands.map(async band => {
                const bandMembers = await Storage.getBandMembers(band.id);
                const profiles = await Promise.all(bandMembers.slice(0, 5).map(async m => {
                    const profile = await Storage.getById('users', m.userId);
                    return { ...m, profile };
                }));
                return { ...band, memberProfiles: profiles, totalMembers: bandMembers.length };
            }));

            const pendingBands = canManage
                ? bandsWithMembers.filter(band => band.linkStatus === 'pending')
                : [];
            const activeBands = bandsWithMembers.filter(band => band.linkStatus !== 'pending');

            const bandSummary = document.getElementById('orgDetailsBandsSummary');
            if (bandSummary) {
                if (pendingBands.length > 0 && activeBands.length > 0) {
                    bandSummary.textContent = `${activeBands.length} Band${activeBands.length !== 1 ? 's sind' : ' ist'} aktiv verknüpft, ${pendingBands.length} Einladung${pendingBands.length !== 1 ? 'en sind' : ' ist'} noch offen.`;
                } else if (pendingBands.length > 0) {
                    bandSummary.textContent = `${pendingBands.length} Band-Einladung${pendingBands.length !== 1 ? 'en warten' : ' wartet'} noch auf Annahme durch die Bandleitung.`;
                } else {
                    bandSummary.textContent = `${activeBands.length} Band${activeBands.length !== 1 ? 's sind' : ' ist'} mit dieser Organisation verknüpft.`;
                }
            }

            const renderBandCard = (band, index, isPending = false) => {
                const accentColor = band.color || 'var(--color-primary)';

                return `
                    <div class="band-card org-band-card ${isPending ? 'is-pending-invite' : 'is-active-link'} animated-fade-in mb-3" style="--band-accent: ${accentColor}; animation-delay: ${index * 0.05}s;">
                        <div class="band-card-header" style="cursor: default;">
                            <div class="band-card-identity">
                                <div class="band-card-avatar-shell">
                                    <div class="band-card-avatar" style="${band.image_url ? 'background: none;' : `background: ${accentColor};`}">
                                        ${band.image_url ? 
                                            `<img src="${band.image_url}" alt="${this.escapeHtml(band.name)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` : 
                                            UI.getUserInitials(band.name)}
                                    </div>
                                </div>
                                <div class="band-card-title-group">
                                    <div class="band-card-title-row">
                                        <h3>${this.escapeHtml(band.name)}</h3>
                                        ${isPending ? '<span class="org-band-status-pill is-pending">Einladung offen</span>' : '<span class="org-band-status-pill is-active">Aktiv verknüpft</span>'}
                                    </div>
                                    ${band.description ? `<p class="band-card-description">${this.escapeHtml(band.description)}</p>` : ''}
                                </div>
                            </div>
                            
                            ${canManage ? `
                                <button class="btn-icon unlink-band-btn ${isPending ? 'is-pending-action' : ''}" data-band-id="${band.id}" title="${isPending ? 'Ausstehende Einladung zurückziehen' : 'Band-Verknüpfung lösen'}">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
                                        <path d="M3 6h18"></path>
                                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>

                        ${isPending ? `
                            <div class="org-band-pending-notice">
                                <span class="org-band-pending-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <path d="M12 6v6l4 2"></path>
                                    </svg>
                                </span>
                                <div>
                                    <strong>Wartet auf Antwort der Bandleitung</strong>
                                    <span>Die Band ist noch nicht Teil der Organisation. Leiter und Co-Leiter können die Einladung in ihrer Benachrichtigungsbox annehmen oder ablehnen.</span>
                                </div>
                            </div>
                        ` : ''}

                        <div class="band-card-members-preview mt-4">
                            <div class="text-xs text-secondary mb-3">BANDMITGLIEDER (${band.totalMembers})</div>
                            <div class="band-card-members-list-compact">
                                ${band.memberProfiles.map(m => {
                                    const name = UI.getUserDisplayName(m.profile);
                                    return `
                                        <div class="band-member-mini-item">
                                            <div class="member-avatar-xs" style="${m.profile?.profile_image_url ? 'background: none;' : `background: ${UI.getAvatarColor(name)};`}">
                                                ${m.profile?.profile_image_url ? 
                                                    `<img src="${m.profile.profile_image_url}" alt="${this.escapeHtml(name)}">` : 
                                                    `<span>${UI.getUserInitials(name)}</span>`}
                                            </div>
                                            <div class="member-mini-info">
                                                <span class="member-mini-name">${this.escapeHtml(name)}</span>
                                                <span class="member-mini-role">${UI.getRoleDisplayName(m.role)}</span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                                ${band.totalMembers > 5 ? `<div class="member-mini-more">... und ${band.totalMembers - 5} weitere Mitglieder</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            };

            const sections = [];

            if (pendingBands.length > 0) {
                sections.push(`
                    <section class="org-band-link-section org-band-link-section-pending">
                        <div class="org-band-link-section-head">
                            <span class="org-band-link-section-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M12 6v6l4 2"></path>
                                </svg>
                            </span>
                            <div>
                                <h4>Ausstehende Einladungen</h4>
                                <p>Diese Bands wurden eingeladen, sind aber noch nicht aktiv mit der Organisation verknüpft.</p>
                            </div>
                        </div>
                        <div class="org-band-link-list">
                            ${pendingBands.map((band, index) => renderBandCard(band, index, true)).join('')}
                        </div>
                    </section>
                `);
            }

            if (activeBands.length > 0) {
                sections.push(`
                    <section class="org-band-link-section">
                        ${pendingBands.length > 0 ? `
                            <div class="org-band-link-section-head">
                                <span class="org-band-link-section-icon is-active" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M20 6 9 17l-5-5"></path>
                                    </svg>
                                </span>
                                <div>
                                    <h4>Aktiv verknüpfte Bands</h4>
                                    <p>Diese Bands sind bereits Teil der Organisation.</p>
                                </div>
                            </div>
                        ` : ''}
                        <div class="org-band-link-list">
                            ${activeBands.map((band, index) => renderBandCard(band, index + pendingBands.length, false)).join('')}
                        </div>
                    </section>
                `);
            }

            container.innerHTML = sections.join('');

            container.querySelectorAll('.unlink-band-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.handleUnlinkBand(btn.dataset.bandId);
                };
            });
        } catch (error) {
            Logger.error('[Organizations] Error loading bands:', error);
            container.innerHTML = '<p class="error-text">Bands konnten nicht geladen werden.</p>';
        }
    },

    async handleUnlinkBand(bandId) {
        const permissions = await this.getCurrentOrgPermissions();
        if (!permissions.canManage) {
            UI.showToast('Nur Admins oder Manager können Band-Verknüpfungen bearbeiten.', 'warning');
            return;
        }

        const band = await Storage.getBand(bandId);
        if (!band) return;

        const existingLink = await Storage.getOrganizationBandLink(this.currentOrgId, bandId);
        const isPendingInvite = existingLink?.status === 'pending';
        const members = await Storage.getBandMembers(bandId);
        const modal = document.getElementById('unlinkBandConfirmModal');
        const confirmBtn = document.getElementById('confirmUnlinkBandBtn');
        const cancelBtn = document.getElementById('cancelUnlinkBandBtn');
        const membersList = document.getElementById('unlinkBandMembersList');
        const confirmText = document.getElementById('unlinkBandConfirmText');
        const membersInfoLabel = document.getElementById('unlinkBandMembersInfoLabel');

        if (!modal || !confirmBtn || !cancelBtn || !membersList || !confirmText) return;

        // Set text
        confirmText.innerHTML = isPendingInvite
            ? `Möchtest du die noch offene Einladung an <strong>"${this.escapeHtml(band.name)}"</strong> zurückziehen? Die Band ist aktuell noch nicht mit der Organisation verknüpft.`
            : `Bist du sicher, dass du die Verknüpfung der Band <strong>"${this.escapeHtml(band.name)}"</strong> zur Organisation lösen möchtest?`;
        confirmBtn.textContent = isPendingInvite ? 'Einladung zurückziehen' : 'Verknüpfung lösen';
        if (membersInfoLabel) {
            membersInfoLabel.textContent = isPendingInvite
                ? 'MITGLIEDER DER EINGELADENEN BAND:'
                : 'FOLGENDE MITGLIEDER WERDEN DARÜBER INFORMIERT:';
        }

        // Load members list
        membersList.innerHTML = '<div class="loading-inline">Mitglieder werden geladen...</div>';
        
        try {
            const memberProfiles = await Promise.all(members.map(async m => {
                const profile = await Storage.getById('users', m.userId);
                return { ...m, profile };
            }));

            membersList.innerHTML = memberProfiles.map(m => {
                const name = UI.getUserDisplayName(m.profile);
                return `
                    <div class="compact-member-item">
                        <div class="compact-member-avatar" style="${m.profile?.profile_image_url ? 'background: none;' : `background: ${UI.getAvatarColor(name)};`}">
                            ${m.profile?.profile_image_url ? `<img src="${m.profile.profile_image_url}" alt="${this.escapeHtml(name)}">` : `<span>${UI.getUserInitials(name)}</span>`}
                        </div>
                        <div class="compact-member-info">
                            <span class="compact-member-name">${this.escapeHtml(name)}</span>
                            <span class="compact-member-role">${UI.getRoleDisplayName(m.role)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            membersList.innerHTML = '<p class="text-danger">Fehler beim Laden der Mitglieder.</p>';
        }

        // Action handlers
        const performUnlink = async () => {
            UI.showLoading(isPendingInvite ? 'Einladung wird zurückgezogen...' : 'Verknüpfung wird gelöst...');
            try {
                await Storage.unlinkBandFromOrganization(this.currentOrgId, bandId);
                const user = Auth.getCurrentUser();
                await Storage.logOrganizationActivity(this.currentOrgId, user.id, isPendingInvite ? 'withdraw_band_invite' : 'unlink_band', 'band', bandId);
                
                // Notify all band members about the unlink
                try {
                    const org = await Storage.getOrganization(this.currentOrgId);
                    if (!isPendingInvite && org && Array.isArray(members) && members.length > 0) {
                        const notifyPromises = members.map(member =>
                            Storage.createNotification({
                                userId: member.userId,
                                type: 'band_unlinked_from_org',
                                title: 'Band-Verknüpfung gelöst',
                                message: `Die Band "${band.name}" wurde von der Organisation "${org.name}" getrennt.`,
                                actorUserId: user.id,
                                actorName: UI.getUserDisplayName(user),
                                bandId: band.id,
                                bandName: band.name
                            })
                        );
                        await Promise.all(notifyPromises);
                    }
                    if (isPendingInvite) {
                        await Storage.updateNotificationsByOrgBandInvitation(this.currentOrgId, bandId, {
                            actionStatus: 'declined',
                            status: 'dismissed'
                        });
                    }
                    if (typeof Notifications !== 'undefined') {
                        await Notifications.refresh({ quiet: true, skipAutoRead: true });
                    }
                    if (typeof App !== 'undefined' && typeof App.updateDashboard === 'function') {
                        await App.updateDashboard();
                    }
                } catch (notifyErr) {
                    Logger.warn('[Organizations] Could not send unlink notifications:', notifyErr);
                }
                
                UI.showToast(isPendingInvite ? 'Einladung zurückgezogen' : 'Verknüpfung gelöst', 'success');
                UI.closeModal('unlinkBandConfirmModal');
                await this.loadBands();
            } catch (error) {
                Logger.error('[Organizations] Error unlinking band:', error);
                UI.showToast(isPendingInvite ? 'Fehler beim Zurückziehen der Einladung' : 'Fehler beim Lösen der Verknüpfung', 'error');
            } finally {
                UI.hideLoading();
            }
        };

        confirmBtn.onclick = performUnlink;
        cancelBtn.onclick = () => UI.closeModal('unlinkBandConfirmModal');

        UI.openModal('unlinkBandConfirmModal');
    },

    async loadSongpool() {
        const container = document.getElementById('orgSongpoolList');
        if (!container) return;

        container.innerHTML = '<div class="loading-inline">Songpool wird geladen...</div>';
        
        try {
            const user = Auth.getCurrentUser();
            const songs = await Storage.getSongpoolSongs(user.id, { organizationId: this.currentOrgId });
            const permissions = await this.getCurrentOrgPermissions();
            const canManage = permissions.canManage;

            this.applyOrgPermissions(permissions);

            if (songs.length === 0) {
                container.innerHTML = `
                    <div class="bands-empty-state">
                        <div class="bands-empty-icon">🎵</div>
                        <h3>Keine Songs im Pool</h3>
                        <p>${canManage ? 'Füge Songs hinzu, um sie mit der Organisation zu teilen.' : 'Sobald Songs hinzugefügt wurden, erscheinen sie hier.'}</p>
                    </div>
                `;
                return;
            }

            // EXACT parity with App.renderSongpoolView table structure
            let html = `
                <div class="band-setlist-workspace songpool-workspace" style="padding: 0;">
                    <div class="band-setlist-table-wrap">
                        <table class="songs-table band-setlist-table songpool-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="border-bottom: 2px solid var(--color-border);">
                                    ${canManage ? `
                                        <th style="padding: var(--spacing-sm); text-align: center; width: 40px;">
                                            <input type="checkbox" id="selectAllOrgSongpoolSongs">
                                        </th>
                                        <th style="padding: var(--spacing-sm); text-align: center; width: 60px;">Aktionen</th>
                                    ` : ''}
                                    <th style="padding: var(--spacing-sm); text-align: center; width: 40px;">PDF</th>
                                    <th style="padding: var(--spacing-sm); text-align: left;">Titel</th>
                                    <th style="padding: var(--spacing-sm); text-align: left;">Interpret</th>
                                    <th style="padding: var(--spacing-sm); text-align: center;">BPM</th>
                                    <th style="padding: var(--spacing-sm); text-align: center;">Tonart</th>
                                    <th style="padding: var(--spacing-sm); text-align: center;">Genre</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${songs.map((song) => `
                                    <tr style="border-bottom: 1px solid var(--color-border);">
                                        ${canManage ? `
                                            <td style="padding: var(--spacing-sm); text-align: center;">
                                                <input type="checkbox" class="org-songpool-song-checkbox-row" value="${song.id}">
                                            </td>
                                            <td style="padding: var(--spacing-sm); text-align: center;">
                                                <div style="display: flex; gap: 8px; justify-content: center;">
                                                    <button type="button" class="btn-icon edit-org-songpool-song" data-id="${song.id}" title="Bearbeiten">${App.getRundownInlineIcon('edit')}</button>
                                                    <button type="button" class="btn-icon delete-org-songpool-song" data-id="${song.id}" title="Löschen">${App.getRundownInlineIcon('trash')}</button>
                                                </div>
                                            </td>
                                        ` : ''}
                                        <td style="padding: var(--spacing-sm); text-align: center;">
                                            ${App.renderSongDocumentPreviewButtons(song)}
                                        </td>
                                        <td style="padding: var(--spacing-sm);">
                                            <div class="songpool-title-cell">
                                                <div class="songpool-title-main" style="font-weight: 600;">${this.escapeHtml(song.title)}</div>
                                                <div class="songpool-title-meta">
                                                    ${App.renderSongpoolDocumentBadges(song)}
                                                </div>
                                            </div>
                                        </td>
                                        <td style="padding: var(--spacing-sm);">${this.escapeHtml(song.artist || '-')}</td>
                                        <td style="padding: var(--spacing-sm); text-align: center;">${song.bpm || '-'}</td>
                                        <td style="padding: var(--spacing-sm); text-align: center;">${song.key || '-'}</td>
                                        <td style="padding: var(--spacing-sm); text-align: center;">
                                            <span class="badge badge-xs badge-outline">${this.escapeHtml(song.genre || '-')}</span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            container.innerHTML = html;

            if (canManage) {
                container.querySelectorAll('.edit-org-songpool-song').forEach(btn => {
                    btn.onclick = (e) => { e.stopPropagation(); App.openEditSongpoolSongModal(btn.dataset.id); };
                });
                container.querySelectorAll('.delete-org-songpool-song').forEach(btn => {
                    btn.onclick = (e) => { e.stopPropagation(); App.handleDeleteSongpoolSong(btn.dataset.id); };
                });
            }
        } catch (error) {
            Logger.error('[Organizations] Error loading songpool:', error);
            container.innerHTML = '<p class="error-text">Songs konnten nicht geladen werden.</p>';
        }
    },

    async loadMusikpool() {
        const container = document.getElementById('orgMusikpoolList');
        if (!container) return;

        container.innerHTML = '<div class="loading-state-sm"><div class="spinner-sm"></div></div>';
        
        try {
            const musicians = await Storage.getOrganizationMusicians(this.currentOrgId);
            if (musicians.length === 0) {
                container.innerHTML = `
                    <div class="bands-empty-state">
                        <div class="bands-empty-icon">🎤</div>
                        <h3>Musikerpool leer</h3>
                        <p>Noch keine Musiker in dieser Organisation gelistet.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = musicians.map((m, index) => {
                const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unbekannter Musiker';
                return `
                    <div class="member-row animated-fade-in" style="animation-delay: ${index * 0.05}s">
                        <div class="member-avatar-col">
                            <div class="member-avatar" style="background: ${UI.getAvatarColor(name)};">
                                <span class="avatar-initials">${UI.getUserInitials(name)}</span>
                            </div>
                        </div>
                        <div class="member-main-col">
                            <div class="member-name-row">
                                <span class="member-name">${this.escapeHtml(name)}</span>
                            </div>
                            <div class="member-meta-row">
                                <span class="text-xs text-secondary">${this.escapeHtml(m.instrument || 'Kein Instrument')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            Logger.error('[Organizations] Error loading musikpool:', error);
            container.innerHTML = '<p class="error-text">Musiker konnten nicht geladen werden.</p>';
        }
    },

    async loadLocations() {
        const container = document.getElementById('orgLocationsList');
        if (!container) return;

        container.innerHTML = '<div class="loading-state-sm"><div class="spinner-sm"></div></div>';

        try {
            const permissions = await this.getCurrentOrgPermissions();
            this.applyOrgPermissions(permissions);

            const locations = await Storage.getLocations(this.currentOrgId);
            if (locations.length === 0) {
                container.innerHTML = `
                    <div class="bands-empty-state">
                        <div class="bands-empty-icon">🏛️</div>
                        <h3>Keine Ressourcen</h3>
                        <p>Keine Räume oder Studios dieser Organisation zugeordnet.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = locations.map((loc, index) => `
                <div class="location-card animated-fade-in mb-3 p-4 card" style="animation-delay: ${index * 0.05}s">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="location-icon" style="font-size: 1.5rem;">🏛️</div>
                            <div>
                                <div class="font-bold">${this.escapeHtml(loc.name)}</div>
                                <div class="text-xs text-secondary">${this.escapeHtml(loc.address || 'Keine Adresse')}</div>
                            </div>
                        </div>
                        <span class="badge ${loc.type === 'studio' ? 'badge-studio' : 'badge-room'}" style="padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; background: var(--color-bg-tertiary);">
                            ${this.escapeHtml(loc.type === 'studio' ? 'Studio' : 'Raum')}
                        </span>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            Logger.error('[Organizations] Error loading locations:', error);
            container.innerHTML = '<p class="error-text">Ressourcen konnten nicht geladen werden.</p>';
        }
    },

    async loadHistory() {
        const container = document.getElementById('orgRecentActivity');
        if (!container) return;

        container.innerHTML = '<div class="loading-state-sm"><div class="spinner-sm"></div></div>';

        try {
            const logs = await Storage.getOrganizationActivityLog(this.currentOrgId);
            if (logs.length === 0) {
                container.innerHTML = '<p class="text-secondary p-8 text-center opacity-50">Noch keine Aktivitäten aufgezeichnet.</p>';
                return;
            }

            container.innerHTML = logs.slice(0, 10).map((log, index) => `
                <div class="activity-item animated-fade-in p-3 border-b last:border-0 border-white/5" style="animation-delay: ${index * 0.03}s">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-xs font-semibold text-primary uppercase tracking-wider">${this.formatAction(log.action)}</span>
                        <span class="text-xs text-secondary opacity-70">${new Date(log.created_at).toLocaleString('de-DE')}</span>
                    </div>
                    <p class="text-sm opacity-90">Aktion durch Benutzer</p>
                </div>
            `).join('');
        } catch (error) {
            Logger.error('[Organizations] Error loading history:', error);
            container.innerHTML = '<p class="error-text">Verlauf konnte nicht geladen werden.</p>';
        }
    },

    formatAction(action) {
        const actions = {
            'create_organization': 'Organisation erstellt',
            'update_settings': 'Einstellungen aktualisiert',
            'add_member': 'Mitglied hinzugefügt',
            'invite_member': 'Mitglied eingeladen',
            'accept_member_invite': 'Einladung angenommen',
            'decline_member_invite': 'Einladung abgelehnt',
            'accept_join_request': 'Beitrittsanfrage angenommen',
            'decline_join_request': 'Beitrittsanfrage abgelehnt',
            'remove_member': 'Mitglied entfernt',
            'link_band': 'Band verknüpft',
            'invite_band': 'Band eingeladen',
            'request_band_link': 'Band eingeladen',
            'accept_band_invite': 'Band-Einladung angenommen',
            'decline_band_invite': 'Band-Einladung abgelehnt',
            'withdraw_band_invite': 'Band-Einladung zurückgezogen',
            'unlink_band': 'Band-Verknüpfung gelöst'
        };
        return actions[action] || action;
    },

    async loadSettings() {
        const permissions = await this.getCurrentOrgPermissions();
        this.applyOrgPermissions(permissions);

        if (!permissions.canAdmin) {
            UI.showToast('Nur Admins können die Organisationseinstellungen bearbeiten.', 'warning');
            this.switchTab('org-overview');
            return;
        }

        const org = await Storage.getOrganization(this.currentOrgId);
        if (!org) return;

        const nameInput = document.getElementById('editOrgName');
        if (nameInput) nameInput.value = org.name;
        
        const descInput = document.getElementById('editOrgDescription');
        if (descInput) descInput.value = org.description || '';

        // Reset dirty state and image preview
        this.orgSettingsDirty = false;
        window._orgSettingsDirty = false;
        this.orgImageDraftFile = null;
        this.orgImageRemovalPending = false;
        this.updateImagePreview(org.image_url);
    },

    handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            UI.showToast('Bitte wähle ein gültiges Bild aus.', 'error');
            return;
        }

        this.orgImageDraftFile = file;
        this.orgImageRemovalPending = false;
        this.orgSettingsDirty = true;
        window._orgSettingsDirty = true;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.updateImagePreview(event.target.result);
        };
        reader.readAsDataURL(file);
    },

    updateImagePreview(url) {
        const preview = document.getElementById('orgSettingsImagePreview');
        const placeholder = document.getElementById('orgSettingsImagePlaceholder');
        if (!preview || !placeholder) return;

        if (url) {
            preview.style.backgroundImage = `url(${url})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            placeholder.style.display = 'none';
        } else {
            preview.style.backgroundImage = 'none';
            placeholder.style.display = 'flex';
        }
    },

    async handleSaveSettings() {
        const permissions = await this.getCurrentOrgPermissions();
        if (!permissions.canAdmin) {
            UI.showToast('Nur Admins können die Organisationseinstellungen bearbeiten.', 'warning');
            return;
        }

        const name = document.getElementById('editOrgName').value.trim();
        const description = document.getElementById('editOrgDescription').value.trim();
        const imageFile = document.getElementById('orgImageInput').files[0];

        if (!name) return;

        UI.showLoading('Einstellungen werden gespeichert...');
        try {
            let imageUrl = null;
            if (this.orgImageDraftFile) {
                imageUrl = await Storage.uploadOrganizationImage(this.currentOrgId, this.orgImageDraftFile);
            }

            const updates = { name, description };
            if (imageUrl) updates.image_url = imageUrl;
            if (this.orgImageRemovalPending) updates.image_url = null;

            await Storage.updateOrganization(this.currentOrgId, updates);
            await Storage.logOrganizationActivity(this.currentOrgId, Auth.getCurrentUser().id, 'update_settings');
            
            this.orgSettingsDirty = false;
            window._orgSettingsDirty = false;
            this.orgImageDraftFile = null;
            this.orgImageRemovalPending = false;

            UI.showToast('Einstellungen gespeichert', 'success');
            
            // Refresh view
            const org = await Storage.getOrganization(this.currentOrgId);
            document.getElementById('orgDetailsName').textContent = org.name;
            
            const coverEl = document.getElementById('orgDetailsCover');
            if (coverEl) {
                if (org.image_url) {
                    coverEl.style.backgroundImage = `url(${org.image_url})`;
                    coverEl.style.backgroundSize = 'cover';
                    coverEl.style.backgroundPosition = 'center';
                    coverEl.textContent = '';
                } else {
                    coverEl.style.backgroundImage = 'none';
                    coverEl.textContent = org.name ? org.name.charAt(0).toUpperCase() : 'O';
                }
            }

            this.renderOrganizations(true);
        } catch (error) {
            Logger.error('Error saving org settings:', error);
            UI.showToast('Fehler beim Speichern', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async handleDeleteOrganization() {
        const permissions = await this.getCurrentOrgPermissions();
        if (!permissions.canAdmin) {
            UI.showToast('Nur Admins können Organisationen löschen.', 'warning');
            return;
        }

        if (!confirm('Bist du sicher, dass du diese Organisation löschen möchtest? Alle Verknüpfungen gehen verloren.')) return;

        UI.showLoading('Organisation wird gelöscht...');
        try {
            await Storage.deleteOrganization(this.currentOrgId);
            UI.showToast('Organisation gelöscht', 'success');
            UI.closeModal('orgDetailsModal');
            this.renderOrganizations(true);
        } catch (error) {
            Logger.error('Error deleting organization:', error);
            UI.showToast('Fehler beim Löschen', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async handleInviteMember() {
        const identifier = document.getElementById('inviteOrgUserEmail').value.trim();
        const role = document.getElementById('inviteOrgRole').value;
        const user = Auth.getCurrentUser();

        if (!identifier) return;

        UI.showLoading('Einladung wird gesendet...');
        try {
            const permissions = await this.getCurrentOrgPermissions();
            if (!permissions.canManage) {
                UI.showToast('Nur Admins oder Manager können Mitglieder einladen.', 'warning');
                return;
            }
            if (role === 'admin' && !permissions.canAdmin) {
                UI.showToast('Nur Admins können weitere Admins einladen.', 'warning');
                return;
            }

            const invitedUser = await Storage.getUserByEmailOrUsername(identifier);
            if (!invitedUser) {
                UI.showToast('User mit dieser E-Mail oder diesem Benutzernamen nicht gefunden', 'error');
                return;
            }

            if (String(invitedUser.id) === String(user.id)) {
                UI.showToast('Du bist bereits Mitglied dieser Organisation.', 'warning');
                return;
            }

            const existingMembership = await Storage.getOrganizationMember(this.currentOrgId, invitedUser.id);
            if (existingMembership?.status === 'active') {
                UI.showToast('User ist bereits Mitglied dieser Organisation', 'warning');
                return;
            }
            if (existingMembership) {
                if (typeof Notifications !== 'undefined') {
                    await Notifications.ensurePendingOrgRequestNotifications(existingMembership, user.id);
                    await Notifications.refresh({ quiet: true, skipAutoRead: true });
                }
                UI.showToast('Für diesen User ist bereits eine Anfrage oder Einladung offen.', 'info');
                return;
            }

            const pendingMembership = await Storage.addOrganizationMember(this.currentOrgId, invitedUser.id, role, 'pending', user.id);
            await Storage.logOrganizationActivity(this.currentOrgId, user.id, 'invite_member', 'user', invitedUser.id, { role });
            
            try {
                const org = await Storage.getOrganization(this.currentOrgId);
                if (org) {
                    const roleLabel = this.getRoleLabel(role);
                    await Promise.all([
                        Storage.createNotification({
                            userId: invitedUser.id,
                            type: 'org_invite_received',
                            title: 'Organisations-Einladung',
                            message: `${UI.getUserDisplayName(user)} hat dich als ${roleLabel} zur Organisation "${org.name}" eingeladen.`,
                            actionType: 'respond_org_invite',
                            actionStatus: 'pending',
                            actorUserId: user.id,
                            actorName: UI.getUserDisplayName(user),
                            actorImageUrl: user.profile_image_url || '',
                            requestId: org.id,
                            organizationId: org.id,
                            organizationName: org.name,
                            targetUserId: invitedUser.id,
                            requestedRole: role
                        }),
                        Storage.createNotification({
                            userId: user.id,
                            type: 'org_invite_pending',
                            title: 'Organisations-Einladung versendet',
                            message: `${UI.getUserDisplayName(invitedUser)} wurde als ${roleLabel} zu "${org.name}" eingeladen.`,
                            actorUserId: invitedUser.id,
                            actorName: UI.getUserDisplayName(invitedUser),
                            actorImageUrl: invitedUser.profile_image_url || '',
                            requestId: org.id,
                            organizationId: org.id,
                            organizationName: org.name,
                            targetUserId: invitedUser.id,
                            requestedRole: role
                        })
                    ]);
                }
            } catch (notifyErr) {
                Logger.warn('[Organizations] Could not send member invite notification:', notifyErr);
                if (typeof Notifications !== 'undefined') {
                    await Notifications.ensurePendingOrgRequestNotifications(pendingMembership, user.id);
                }
            }
            
            UI.showToast('Einladung gesendet', 'success');
            UI.closeModal('inviteOrgMemberModal');
            document.getElementById('inviteOrgMemberForm').reset();
            await this.loadMembers();
        } catch (error) {
            Logger.error('Error inviting member:', error);
            UI.showToast('Fehler bei der Einladung', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async renderOrgBandSearchResults(query = '', append = false) {
        const container = document.getElementById('orgBandSearchResults');
        if (!container) return;

        if (!append) {
            this.orgBandSearchOffset = 0;
            this.orgBandSearchQuery = query;
            container.innerHTML = '<div class="text-center py-4 text-secondary">Suche...</div>';
        } else {
            const loadMoreBtn = document.getElementById('orgBandLoadMoreBtn');
            if (loadMoreBtn) loadMoreBtn.innerText = 'Lade...';
        }

        try {
            const [bands, linkedBands] = await Promise.all([
                Storage.searchBandsNotInOrg(this.orgBandSearchQuery, this.currentOrgId, this.orgBandSearchOffset, 20),
                append ? Promise.resolve([]) : Storage.getOrganizationBands(this.currentOrgId, { includePending: true })
            ]);

            const normalizedQuery = String(this.orgBandSearchQuery || '').trim().toLowerCase();
            const pendingBands = append
                ? []
                : (linkedBands || [])
                    .filter(band => band.linkStatus === 'pending')
                    .filter(band => !normalizedQuery || String(band.name || '').toLowerCase().includes(normalizedQuery));

            if (!append && (!bands || bands.length === 0) && pendingBands.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-4 text-secondary">
                        ${this.orgBandSearchQuery ? 'Keine passenden Bands gefunden.' : 'Keine weiteren Bands verfügbar.'}
                    </div>
                `;
                return;
            }

            const renderSearchItem = (band, isPending = false) => {
                const accentColor = band.color || 'var(--color-primary)';
                const avatarContent = band.image_url 
                    ? `<img src="${band.image_url}" alt="${this.escapeHtml(band.name)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`
                    : UI.getUserInitials(band.name);

                return `
                    <div class="org-band-search-item ${isPending ? 'is-pending' : ''}">
                        <div class="org-band-search-identity">
                            <div class="org-band-search-avatar" style="${band.image_url ? 'background: none;' : `background: ${accentColor};`}">
                                ${avatarContent}
                            </div>
                            <div class="org-band-search-copy">
                                <span>${this.escapeHtml(band.name)}</span>
                                ${isPending ? '<small>Einladung wurde gesendet und wartet auf Annahme.</small>' : '<small>Kann zur Organisation eingeladen werden.</small>'}
                            </div>
                        </div>
                        ${isPending ? `
                            <span class="org-band-search-status is-pending">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M12 6v6l4 2"></path>
                                </svg>
                                Ausstehend
                            </span>
                        ` : `
                            <button class="btn btn-primary btn-sm" onclick="Organizations.inviteBandToOrg('${band.id}')">
                                Einladen
                            </button>
                        `}
                    </div>
                `;
            };

            const pendingHtml = pendingBands.length > 0 ? `
                <div class="org-band-search-pending-block">
                    <div class="org-band-search-pending-head">
                        <strong>Bereits eingeladen</strong>
                        <span>Diese Anfrage ist noch offen und muss von der Bandleitung beantwortet werden.</span>
                    </div>
                    ${pendingBands.map(band => renderSearchItem(band, true)).join('')}
                </div>
            ` : '';

            const html = [
                pendingHtml,
                (bands || []).map(band => renderSearchItem(band, false)).join('')
            ].filter(Boolean).join('');

            if (!append) {
                container.innerHTML = html;
            } else {
                const loadMoreBtn = document.getElementById('orgBandLoadMoreBtn');
                if (loadMoreBtn) loadMoreBtn.remove();
                container.insertAdjacentHTML('beforeend', html);
            }

            if (bands.length === 20) {
                this.orgBandSearchOffset += 20;
                const safeQuery = this.orgBandSearchQuery ? this.orgBandSearchQuery.replace(/'/g, "\\'") : '';
                container.insertAdjacentHTML('beforeend', `
                    <button id="orgBandLoadMoreBtn" class="btn btn-secondary w-full mt-2" onclick="Organizations.renderOrgBandSearchResults('${safeQuery}', true)">Mehr laden</button>
                `);
            }

        } catch (error) {
            Logger.error('Error rendering band search results:', error);
            if (!append) {
                container.innerHTML = '<div class="text-center py-4 text-danger">Fehler beim Laden der Bands.</div>';
            }
        }
    },

    async inviteBandToOrg(bandId) {
        if (!bandId) return;

        UI.showLoading('Einladung wird gesendet...');
        try {
            const permissions = await this.getCurrentOrgPermissions();
            if (!permissions.canManage) {
                UI.showToast('Nur Admins oder Manager können Bands einladen.', 'warning');
                return;
            }

            const band = await Storage.getBand(bandId);
            if (!band) {
                UI.showToast('Band nicht gefunden', 'error');
                return;
            }

            const user = Auth.getCurrentUser();

            const existingLink = await Storage.getOrganizationBandLink(this.currentOrgId, band.id);
            if (existingLink?.status === 'active') {
                UI.showToast(`"${band.name}" ist bereits mit dieser Organisation verknüpft.`, 'info');
                return;
            }
            if (existingLink?.status === 'pending') {
                UI.showToast(`Für "${band.name}" ist bereits eine Einladung offen.`, 'info');
                return;
            }
            
            const org = await Storage.getOrganization(this.currentOrgId);
            const bandMembers = await Storage.getBandMembers(band.id);
            const leaders = Array.isArray(bandMembers)
                ? bandMembers.filter(m => ['leader', 'co-leader'].includes(m.role))
                : [];
            
            if (!org) {
                UI.showToast('Organisation nicht gefunden', 'error');
                return;
            }

            if (leaders.length === 0) {
                UI.showToast('Die Band hat keine Leiter. Einladung konnte nicht gesendet werden.', 'error');
                return;
            }

            await Storage.linkBandToOrganization(this.currentOrgId, band.id, user.id);
            await Storage.logOrganizationActivity(this.currentOrgId, user.id, 'invite_band', 'band', band.id);

            const invitePromises = leaders.map(leader =>
                Storage.createNotification({
                    userId: leader.userId,
                    type: 'org_band_invitation',
                    title: 'Organisationseinladung',
                    message: `Die Organisation "${org.name}" möchte deine Band "${band.name}" verknüpfen.`,
                    actorUserId: user.id,
                    actorName: UI.getUserDisplayName(user),
                    actorImageUrl: user.profile_image_url || '',
                    requestId: org.id,
                    organizationId: org.id,
                    organizationName: org.name,
                    bandId: band.id,
                    bandName: band.name,
                    actionType: 'review_org_band_invitation',
                    actionStatus: 'pending'
                })
            );
            await Promise.all(invitePromises);

            UI.showToast(`Einladung an "${band.name}" gesendet`, 'success');
            
            // Refresh notifications bell so band leader sees invitation immediately if on same account
            if (typeof Notifications !== 'undefined') {
                Notifications.refresh({ quiet: true, skipAutoRead: true });
            }
            
            // Reload the search results
            const searchInput = document.getElementById('orgBandSearchInput');
            await this.renderOrgBandSearchResults(searchInput ? searchInput.value.trim() : '');
            await this.loadBands();
            
        } catch (error) {
            Logger.error('Error inviting band:', error);
            UI.showToast('Fehler beim Einladen der Band', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async handleCreateLocation() {
        const nameInput = document.getElementById('orgLocationName');
        const addressInput = document.getElementById('orgLocationAddress');
        const calendarInput = document.getElementById('orgLocationCalendar');
        
        const name = nameInput?.value?.trim();
        if (!name) return;

        UI.showLoading('Ressource wird erstellt...');
        try {
            const permissions = await this.getCurrentOrgPermissions();
            if (!permissions.canManage) {
                UI.showToast('Nur Admins oder Manager können Ressourcen hinzufügen.', 'warning');
                return;
            }

            await Storage.createLocation({
                organization_id: this.currentOrgId,
                name: name,
                address: addressInput?.value?.trim(),
                linked_calendar: calendarInput?.value || null
            });

            UI.showToast('Ressource erfolgreich erstellt', 'success');
            UI.closeModal('createOrgLocationModal');
            document.getElementById('createOrgLocationForm').reset();
            await this.loadLocations();
        } catch (error) {
            Logger.error('Error creating location:', error);
            UI.showToast('Fehler beim Erstellen der Ressource', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async handleAddOrgSong() {
        if (!this.currentOrgId) {
            console.error('[Organizations] Cannot add song: currentOrgId is missing');
            UI.showToast('Fehler: Keine Organisation ausgewählt', 'error');
            return;
        }

        const permissions = await this.getCurrentOrgPermissions();
        if (!permissions.canManage) {
            UI.showToast('Nur Admins oder Manager können Songs hinzufügen.', 'warning');
            return;
        }

        if (Logger.debugMode) {
            console.log('[Organizations] handleAddOrgSong for org:', this.currentOrgId);
        }

        if (typeof App !== 'undefined' && App.openSongpoolAddEntryModal) {
            App.openSongpoolAddEntryModal({ organizationId: this.currentOrgId });
        } else {
            console.error('[Organizations] App.openSongpoolAddEntryModal not found');
            UI.showToast('Songpool-Funktion nicht verfügbar', 'error');
        }
    },

    async handleLinkBand() {
        const permissions = await this.getCurrentOrgPermissions();
        if (!permissions.canManage) {
            UI.showToast('Nur Admins oder Manager können Bands einladen.', 'warning');
            return;
        }

        UI.openModal('linkOrgBandModal');
        const searchInput = document.getElementById('orgBandSearchInput');
        if (searchInput) searchInput.value = '';
        await this.renderOrgBandSearchResults('');
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    async browseOrganizations() {
        UI.openModal('browseOrgsModal');
        const container = document.getElementById('browseOrgsList');
        if (container) container.innerHTML = '<div class="loading-state-sm"><div class="spinner-sm"></div></div>';

        try {
            const allOrgs = await Storage.getAll('organizations');
            const user = Auth.getCurrentUser();
            const [visibleOrgs, pendingMemberships] = await Promise.all([
                Storage.getOrganizations(user.id),
                Storage.getPendingOrgMembershipRequestsForUserContext(user.id, [])
            ]);
            const visibleOrgIds = visibleOrgs.map(o => o.id);
            const pendingOrgIds = (pendingMemberships || []).map(m => m.organization_id);

            this.browseCache = allOrgs.filter(o => !visibleOrgIds.includes(o.id) && !pendingOrgIds.includes(o.id));
            this.renderBrowseList(this.browseCache);
        } catch (error) {
            Logger.error('[Organizations] Browse error:', error);
            if (container) container.innerHTML = '<p class="error-text">Organisationen konnten nicht geladen werden.</p>';
        }
    },

    renderBrowseList(orgs) {
        const container = document.getElementById('browseOrgsList');
        if (!container) return;
        if (orgs.length === 0) {
            container.innerHTML = '<p class="text-center py-8 opacity-50">Keine weiteren Organisationen gefunden.</p>';
            return;
        }

        container.innerHTML = orgs.map((org, index) => {
            const avatarContent = org.image_url 
                ? `<img src="${org.image_url}" alt="${this.escapeHtml(org.name)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`
                : UI.getUserInitials(org.name);

            return `
            <div class="band-list-item flex items-center justify-between p-3 rounded-lg border border-border bg-card mb-2" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--color-bg-secondary); border-radius: 8px; border: 1px solid var(--color-border-subtle);">
                <div class="flex items-center gap-3" style="display: flex; align-items: center; gap: 12px;">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0 overflow-hidden" style="width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; background: var(--color-bg-tertiary); color: var(--color-primary); flex-shrink: 0; overflow: hidden;">
                        ${avatarContent}
                    </div>
                    <div>
                        <div class="font-bold" style="font-weight: 600;">${this.escapeHtml(org.name)}</div>
                        <div class="text-xs text-secondary">${this.escapeHtml(org.type || 'Organisation')}</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="Organizations.sendJoinRequestDirectly('${org.id}')">
                    Anfragen
                </button>
            </div>
            `;
        }).join('');
    },

    filterBrowseList(query) {
        if (!this.browseCache) return;
        const filtered = this.browseCache.filter(o => 
            o.name.toLowerCase().includes(query.toLowerCase())
        );
        this.renderBrowseList(filtered);
    },

    async showOrgPreview(orgId) {
        const org = this.browseCache.find(o => o.id === orgId);
        if (!org) return;

        this.previewOrgId = orgId;
        const nameEl = document.getElementById('previewOrgName');
        if (nameEl) nameEl.textContent = org.name;
        
        const descEl = document.getElementById('previewOrgDescription');
        if (descEl) descEl.textContent = org.description || 'Keine Beschreibung verfügbar.';
        
        const avatar = document.getElementById('previewOrgAvatar');
        if (avatar) {
            avatar.textContent = UI.getUserInitials(org.name);
            avatar.style.background = 'var(--color-bg-secondary)';
            avatar.style.color = 'var(--color-primary)';
        }

        UI.openModal('orgPreviewModal');
    },

    async sendJoinRequest() {
        if (!this.previewOrgId) return;
        await this.sendJoinRequestDirectly(this.previewOrgId);
    },

    async sendJoinRequestDirectly(orgId) {
        if (!orgId) return;
        
        const user = Auth.getCurrentUser();
        UI.showLoading('Anfrage wird gesendet...');
        try {
            const existingMembership = await Storage.getOrganizationMember(orgId, user.id);
            if (existingMembership?.status === 'active') {
                UI.showToast('Du bist bereits Mitglied dieser Organisation.', 'info');
                return;
            }
            if (existingMembership) {
                if (typeof Notifications !== 'undefined') {
                    await Notifications.ensurePendingOrgRequestNotifications(existingMembership, user.id);
                    await Notifications.refresh({ quiet: true, skipAutoRead: true });
                }
                UI.showToast('Deine Beitrittsanfrage ist bereits offen.', 'info');
                return;
            }

            const pendingMembership = await Storage.addOrganizationJoinRequest(orgId, user.id);
            if (typeof Notifications !== 'undefined') {
                await Notifications.ensurePendingOrgRequestNotifications(pendingMembership, user.id);
                await Notifications.refresh({ quiet: true, skipAutoRead: true });
            }

            UI.showToast('Beitrittsanfrage gesendet', 'success');
            UI.closeModal('orgPreviewModal');
            UI.closeModal('browseOrgsModal');
            
            // Remove the org from the current list so the user knows it worked
            if (this.browseCache) {
                this.browseCache = this.browseCache.filter(o => o.id !== orgId);
                const searchInput = document.getElementById('searchOrgsInput');
                this.filterBrowseList(searchInput ? searchInput.value.trim() : '');
            }
        } catch (error) {
            Logger.error('[Organizations] Join request error:', error);
            UI.showToast('Fehler beim Senden der Anfrage', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};

window.Organizations = Organizations;
document.addEventListener('DOMContentLoaded', () => Organizations.init());
