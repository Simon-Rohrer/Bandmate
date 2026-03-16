// Musikerpool Module - ChurchTools Group Members Display

const Musikpool = {
    groupId: 2445,
    members: [],
    groupInfo: null,

    async init() {
        // Initialize ChurchTools API
        ChurchToolsAPI.init();
        await this.loadGroupData();
    },

    async loadGroupData(forceRefresh = false) {
        if (forceRefresh) {
            this.members = [];
            this.groupInfo = null;
        }

        // Nur laden, wenn noch keine Mitglieder im Speicher
        if (!forceRefresh && this.members && Array.isArray(this.members) && this.members.length > 0) {
            this.renderMembers();
            return;
        }
        const container = document.getElementById('musikpoolContainer');
        if (!container) return;
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Lade Musikerpool-Mitglieder...</p></div>';
        try {
            // Fetch group details and members
            const [groupResult, membersResult] = await Promise.all([
                ChurchToolsAPI.fetchGroupDetails(this.groupId),
                ChurchToolsAPI.fetchGroupMembers(this.groupId)
            ]);
            if (!membersResult.success) {
                throw new Error(membersResult.error || 'Fehler beim Laden der Mitglieder');
            }
            this.groupInfo = groupResult.success ? groupResult.group : null;
            this.members = membersResult.members;
            this.renderMembers();
        } catch (error) {
            console.error('Error loading Musikerpool:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>Musikerpool-Daten konnten nicht geladen werden.</p>
                    <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                        ${this.escapeHtml(error.message)}
                    </p>
                    <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 1rem;">
                        Dies kann an fehlenden Berechtigungen oder Netzwerkproblemen liegen.
                    </p>
                    <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center;">
                        <button onclick="Musikpool.loadGroupData(true)" class="btn btn-primary">
                            Erneut versuchen
                        </button>
                        <a href="https://jms-altensteig.church.tools/publicgroup/${this.groupId}" target="_blank" class="btn btn-secondary">
                            ChurchTools öffnen
                        </a>
                    </div>
                </div>
            `;
        }
    },

    renderMembers() {
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

        let html = '';

        // Group info header if available
        if (this.groupInfo) {
            html += `
                <div class="musikpool-header" style="margin-bottom: var(--spacing-xl);">
                    <span class="musikpool-header-kicker">ChurchTools</span>
                    <h3>${this.escapeHtml(this.groupInfo.name || 'Musikpool')}</h3>
                    ${this.groupInfo.information ? `
                        <p class="musikpool-header-copy">
                            ${this.escapeHtml(this.groupInfo.information)}
                        </p>
                    ` : ''}
                    <p class="musikpool-header-meta">
                        ${this.members.length} Mitglied${this.members.length !== 1 ? 'er' : ''}
                    </p>
                </div>
            `;
        }

        // Members grid
        html += '<div class="musikpool-members-grid">';
        
        this.members.forEach(member => {
            const person = member.person || {};
            const name = `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unbekannt';
            const role = member.groupTypeRoleName || '';
            const imageUrl = person.imageUrl || '';
            
            html += `
                <div class="musikpool-member-card">
                    <div class="member-avatar">
                        ${imageUrl ? `
                            <img src="https://jms-altensteig.church.tools${imageUrl}" alt="${this.escapeHtml(name)}" />
                        ` : `
                            <div class="member-avatar-placeholder">
                                ${name.charAt(0).toUpperCase()}
                            </div>
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
        });

        html += '</div>';

        container.innerHTML = html;
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
