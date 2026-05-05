// Musikerpool Module - Organization musicians plus optional ChurchTools group members

const Musikpool = {
    groupId: 2445,
    members: [],
    organizationMusicians: [],
    organizationMusiciansUserId: null,
    groupInfo: null,

    async init() {
        ChurchToolsAPI.init();
        await this.loadGroupData();
    },

    async loadGroupData(forceRefresh = false) {
        if (forceRefresh) {
            this.members = [];
            this.organizationMusicians = [];
            this.organizationMusiciansUserId = null;
            this.groupInfo = null;
        }

        await this.loadOrganizationMusicians(forceRefresh);

        const churchToolsSection = document.getElementById('churchToolsMusikpoolSection');
        if (!Auth.isAdmin()) {
            if (churchToolsSection) churchToolsSection.style.display = 'none';
            return;
        }

        if (churchToolsSection) churchToolsSection.style.display = 'block';
        await this.loadChurchToolsMembers(forceRefresh);
    },

    async loadOrganizationMusicians(forceRefresh = false) {
        const container = document.getElementById('ownMembersContainer');
        if (!container) return;

        const user = Auth.getCurrentUser();
        const userId = user?.id || null;

        if (!forceRefresh && this.organizationMusiciansUserId === userId && this.organizationMusicians.length > 0) {
            this.renderOrganizationMusicians();
            return;
        }

        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Lade Organisations-Musiker...</p></div>';

        try {
            this.organizationMusiciansUserId = userId;
            this.organizationMusicians = userId
                ? await Storage.getOrganizationMusiciansForUser(userId)
                : [];
            this.renderOrganizationMusicians();
        } catch (error) {
            Logger.error('Error loading organization musicians:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>Organisations-Musiker konnten nicht geladen werden.</p>
                    <p class="empty-state-note">${this.escapeHtml(error.message || 'Bitte prüfe die Verbindung oder Supabase-Konfiguration.')}</p>
                </div>
            `;
        }
    },

    async loadChurchToolsMembers(forceRefresh = false) {
        if (!forceRefresh && this.members.length > 0) {
            this.renderChurchToolsMembers();
            return;
        }

        const container = document.getElementById('musikpoolContainer');
        if (!container) return;
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Lade Musikerpool-Mitglieder...</p></div>';

        try {
            ChurchToolsAPI.init();
            const [groupResult, membersResult] = await Promise.all([
                ChurchToolsAPI.fetchGroupDetails(this.groupId),
                ChurchToolsAPI.fetchGroupMembers(this.groupId)
            ]);
            if (!membersResult.success) {
                throw new Error(membersResult.error || 'Fehler beim Laden der Mitglieder');
            }
            this.groupInfo = groupResult.success ? groupResult.group : null;
            this.members = membersResult.members || [];
            this.renderChurchToolsMembers();
        } catch (error) {
            Logger.error('Error loading Musikerpool:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>Musikerpool-Daten konnten nicht geladen werden.</p>
                    <p class="empty-state-note">${this.escapeHtml(error.message)}</p>
                    <p class="empty-state-note">Dies kann an fehlenden Berechtigungen oder Netzwerkproblemen liegen.</p>
                    <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center;">
                        <button onclick="Musikpool.loadGroupData(true)" class="btn btn-primary">Erneut versuchen</button>
                        <a href="https://jms-altensteig.church.tools/publicgroup/${this.groupId}" target="_blank" class="btn btn-secondary">ChurchTools öffnen</a>
                    </div>
                </div>
            `;
        }
    },

    renderOrganizationMusicians() {
        const container = document.getElementById('ownMembersContainer');
        if (!container) return;

        if (this.organizationMusicians.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Noch keine Organisations-Musiker sichtbar</p>
                    <p class="empty-state-note">Sobald in deiner Organisation Musiker angelegt wurden, erscheinen sie hier.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="musikpool-members-grid">
                ${this.organizationMusicians.map(musician => this.renderOrganizationMusicianCard(musician)).join('')}
            </div>
        `;
    },

    renderOrganizationMusicianCard(musician = {}) {
        const name = `${musician.first_name || ''} ${musician.last_name || ''}`.trim() || 'Unbekannt';
        const instruments = this.getInstrumentText(musician);
        const organizationName = musician.organizationName || 'Organisation';
        const sourceLabel = musician.source === 'organization_musician' ? 'Pool-Musiker' : 'Mitglied';

        return `
            <div class="musikpool-member-card">
                <div class="member-avatar">
                    <div class="member-avatar-placeholder" style="background: ${UI.getAvatarColor(name)};">
                        ${this.escapeHtml(UI.getUserInitials(name))}
                    </div>
                </div>
                <div class="member-info">
                    <div class="member-info-top">
                        <h4 class="member-name">${this.escapeHtml(name)}</h4>
                        <span class="member-role">${this.escapeHtml(sourceLabel)}</span>
                    </div>
                    <span class="member-email">${this.escapeHtml(instruments || 'Kein Instrument')}</span>
                    <span class="member-source">${this.escapeHtml(organizationName)}</span>
                </div>
            </div>
        `;
    },

    renderMembers() {
        this.renderChurchToolsMembers();
    },

    renderChurchToolsMembers() {
        const container = document.getElementById('musikpoolContainer');
        if (!container) return;

        if (this.members.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Keine Mitglieder gefunden</p>
                    <a href="https://jms-altensteig.church.tools/publicgroup/${this.groupId}" target="_blank" class="btn btn-secondary" style="margin-top: 1rem;">
                        Gruppe auf ChurchTools ansehen
                    </a>
                </div>
            `;
            return;
        }

        const groupHeader = this.groupInfo ? `
            <div class="musikpool-header">
                <span class="musikpool-header-kicker">ChurchTools</span>
                <h3>${this.escapeHtml(this.groupInfo.name || 'Musikpool')}</h3>
                ${this.groupInfo.information ? `<p class="musikpool-header-copy">${this.escapeHtml(this.groupInfo.information)}</p>` : ''}
                <p class="musikpool-header-meta">${this.members.length} Mitglied${this.members.length !== 1 ? 'er' : ''}</p>
            </div>
        ` : '';

        container.innerHTML = `
            ${groupHeader}
            <div class="musikpool-members-grid">
                ${this.members.map(member => this.renderChurchToolsMemberCard(member)).join('')}
            </div>
        `;
    },

    renderChurchToolsMemberCard(member = {}) {
        const person = member.person || {};
        const name = `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unbekannt';
        const role = member.groupTypeRoleName || '';
        const imageUrl = person.imageUrl || '';

        return `
            <div class="musikpool-member-card">
                <div class="member-avatar">
                    ${imageUrl ? `
                        <img src="https://jms-altensteig.church.tools${imageUrl}" alt="${this.escapeHtml(name)}" />
                    ` : `
                        <div class="member-avatar-placeholder">${this.escapeHtml(UI.getUserInitials(name))}</div>
                    `}
                </div>
                <div class="member-info">
                    <div class="member-info-top">
                        <h4 class="member-name">${this.escapeHtml(name)}</h4>
                        ${role ? `<span class="member-role">${this.escapeHtml(role)}</span>` : ''}
                    </div>
                    ${person.email ? `
                        <a href="mailto:${this.escapeHtml(person.email)}" class="member-email" title="E-Mail senden">
                            ${this.escapeHtml(person.email)}
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    },

    getInstrumentText(musician = {}) {
        if (Array.isArray(musician.instruments)) {
            return musician.instruments.filter(Boolean).join(', ');
        }
        return musician.instruments || musician.instrument || musician.instrumentType || '';
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
