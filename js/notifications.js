const Notifications = {
    initialized: false,
    isOpen: false,
    pollIntervalMs: 10000,
    pollTimer: null,
    currentNotifications: [],
    unreadCount: 0,
    repairDisabled: false,
    pendingActionRequestIds: new Set(),
    processedMembershipNotificationIds: new Set(),
    lastUserId: null,
    hoverOpenTimer: null,
    hoverCloseTimer: null,

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const bellButton = document.getElementById('notificationBellBtn');
        const dropdown = document.getElementById('notificationDropdown');
        const list = document.getElementById('notificationList');
        const hoverContainer = bellButton?.closest('.header-notifications');

        if (!bellButton || !dropdown || !list) return;

        bellButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.toggleDropdown();
        });

        if (hoverContainer && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            hoverContainer.addEventListener('mouseenter', () => {
                window.clearTimeout(this.hoverCloseTimer);
                this.hoverCloseTimer = null;

                if (this.isOpen) return;

                window.clearTimeout(this.hoverOpenTimer);
                this.hoverOpenTimer = window.setTimeout(() => {
                    this.toggleDropdown(true).catch(error => {
                        Logger.error('[Notifications] Hover open failed:', error);
                    });
                }, 80);
            });

            hoverContainer.addEventListener('mouseleave', () => {
                window.clearTimeout(this.hoverOpenTimer);
                this.hoverOpenTimer = null;

                window.clearTimeout(this.hoverCloseTimer);
                this.hoverCloseTimer = window.setTimeout(() => {
                    this.closeDropdown();
                }, 120);
            });
        }

        dropdown.addEventListener('click', (event) => {
            const closeButton = event.target.closest('[data-notification-close]');
            if (closeButton) {
                event.preventDefault();
                this.closeDropdown();
                return;
            }
            event.stopPropagation();
        });

        list.addEventListener('click', async (event) => {
            const removeButton = event.target.closest('[data-notification-remove]');
            if (removeButton) {
                event.preventDefault();
                event.stopPropagation();
                await this.handleRemoveButton(removeButton);
                return;
            }

            const actionButton = event.target.closest('[data-notification-action]');
            if (actionButton) {
                event.preventDefault();
                event.stopPropagation();
                await this.handleActionButton(actionButton);
                return;
            }

            const item = event.target.closest('.notification-item[data-notification-id]');
            if (item) {
                await this.markNotificationRead(item.dataset.notificationId);
            }
        });

        document.addEventListener('pointerdown', (event) => {
            if (!this.isOpen) return;
            if (dropdown.contains(event.target) || bellButton.contains(event.target)) return;
            this.closeDropdown();
        }, true);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isOpen) {
                this.closeDropdown();
            }
        });
    },

    async start() {
        this.init();

        const user = Auth.getCurrentUser();
        if (!user) {
            this.stop();
            return;
        }

        if (this.lastUserId !== user.id) {
            this.processedMembershipNotificationIds.clear();
            this.repairDisabled = false;
        }

        this.lastUserId = user.id;
        await this.refresh({ quiet: true });
        this.startPolling();
    },

    startPolling() {
        this.stopPolling();
        this.pollTimer = window.setInterval(() => {
            this.refresh({ quiet: true });
        }, this.pollIntervalMs);
    },

    stopPolling() {
        if (this.pollTimer) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    },

    stop() {
        this.stopPolling();
        window.clearTimeout(this.hoverOpenTimer);
        window.clearTimeout(this.hoverCloseTimer);
        this.hoverOpenTimer = null;
        this.hoverCloseTimer = null;
        this.isOpen = false;
        this.currentNotifications = [];
        this.unreadCount = 0;
        this.repairDisabled = false;
        this.pendingActionRequestIds.clear();
        this.processedMembershipNotificationIds.clear();
        this.lastUserId = null;

        const bellButton = document.getElementById('notificationBellBtn');
        const dropdown = document.getElementById('notificationDropdown');
        if (bellButton) bellButton.setAttribute('aria-expanded', 'false');
        if (dropdown) dropdown.hidden = true;

        this.renderNotifications([]);
        this.updateBadge(0);
    },

    async refresh(options = {}) {
        const { quiet = false } = options;
        const user = Auth.getCurrentUser();

        if (!user) {
            this.stop();
            return;
        }

        try {
            let [notifications, unreadCount] = await Promise.all([
                Storage.getNotificationsForUser(user.id, { limit: 30 }),
                Storage.getUnreadNotificationCount(user.id)
            ]);

            const [repairedBands, repairedOrgs] = await Promise.all([
                this.repairDisabled ? 0 : this.repairPendingMembershipNotifications(user),
                this.repairDisabled ? 0 : this.repairPendingOrgMembershipNotifications(user)
            ]);
            
            if (repairedBands > 0 || repairedOrgs > 0) {
                [notifications, unreadCount] = await Promise.all([
                    Storage.getNotificationsForUser(user.id, { limit: 30 }),
                    Storage.getUnreadNotificationCount(user.id)
                ]);
            }

            const dismissedIds = this.getDismissedNotificationIds(user.id);
            const visibleNotifications = Array.isArray(notifications)
                ? notifications.filter((notification) => !dismissedIds.has(String(notification?.id || '')))
                : [];

            this.currentNotifications = await this.enrichNotificationsWithRequestState(visibleNotifications);
            const unreadFromQuery = Number.isFinite(Number(unreadCount)) ? Number(unreadCount) : 0;
            const unreadFromList = this.currentNotifications.filter(notification => notification.status === 'unread').length;
            this.unreadCount = Math.max(unreadFromQuery, unreadFromList);
            this.renderNotifications(this.currentNotifications);
            this.updateBadge(this.unreadCount);
            await this.syncMembershipContext(this.currentNotifications);
        } catch (error) {
            Logger.error('[Notifications.refresh] Error:', error);
            if (!quiet && typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast('Benachrichtigungen konnten nicht geladen werden', 'error');
            }
        }
    },

    async repairPendingMembershipNotifications(user) {
        if (!user?.id) return 0;

        try {
            const userBands = await Storage.getUserBands(user.id);
            const leaderBandIds = (Array.isArray(userBands) ? userBands : [])
                .filter((band) => band && ['leader', 'co-leader'].includes(String(band.role || '').toLowerCase()))
                .map((band) => band.id)
                .filter(Boolean);

            const pendingRequests = await Storage.getPendingMembershipRequestsForUserContext(user.id, leaderBandIds);
            if (!Array.isArray(pendingRequests) || pendingRequests.length === 0) return 0;

            let repairedCount = 0;
            for (const request of pendingRequests) {
                try {
                    repairedCount += await this.ensurePendingRequestNotifications(request, {
                        currentUserId: user.id,
                        scope: 'self'
                    });
                } catch (error) {
                    const message = String(error?.message || error || '');
                    if (message.includes('row-level security policy for table "notifications"')) {
                        this.repairDisabled = true;
                        Logger.warn('[Notifications] Repair disabled until reload because notifications RLS is not fully applied yet.');
                        break;
                    }
                    throw error;
                }
            }

            return repairedCount;
        } catch (error) {
            Logger.error('[Notifications.repairPendingMembershipNotifications] Error:', error);
            return 0;
        }
    },

    async repairPendingOrgMembershipNotifications(user) {
        if (!user?.id) return 0;

        try {
            const userOrgs = await Storage.getOrganizations(user.id);
            const leaderOrgIds = (Array.isArray(userOrgs) ? userOrgs : [])
                .filter(o => o.role === 'admin' || o.role === 'manager')
                .map(o => o.id);

            const pendingRequests = await Storage.getPendingOrgMembershipRequestsForUserContext(user.id, leaderOrgIds);
            if (!Array.isArray(pendingRequests) || pendingRequests.length === 0) return 0;

            let repairedCount = 0;
            for (const request of pendingRequests) {
                try {
                    repairedCount += await this.ensurePendingOrgRequestNotifications(request, user.id);
                } catch (error) {
                    if (String(error?.message).includes('notifications"')) {
                        this.repairDisabled = true;
                        break;
                    }
                    throw error;
                }
            }
            return repairedCount;
        } catch (error) {
            Logger.error('[Notifications.repairPendingOrgMembershipNotifications] Error:', error);
            return 0;
        }
    },

    async ensurePendingOrgRequestNotifications(request, currentUserId) {
        if (!request || request.status === 'active') return 0;

        const [existing, org, targetUser] = await Promise.all([
            Storage.getNotificationsByOrgRequest(request.organization_id, request.user_id),
            Storage.getOrganization(request.organization_id),
            Storage.getById('users', request.user_id)
        ]);

        if (!org || !targetUser) return 0;

        const requestCreatedAt = new Date(request.created_at || request.joined_at || 0).getTime();
        const existingByUserAndType = new Set(
            (Array.isArray(existing) ? existing : [])
                .filter(notification => {
                    if (!Number.isFinite(requestCreatedAt) || requestCreatedAt <= 0) return true;
                    const notificationCreatedAt = new Date(notification.createdAt || 0).getTime();
                    return Number.isFinite(notificationCreatedAt) && notificationCreatedAt >= requestCreatedAt;
                })
                .map(notification => `${String(notification.userId || '')}::${String(notification.type || '')}`)
        );
        const notificationsToCreate = [];
        const targetName = UI.getUserDisplayName(targetUser);
        const targetImage = targetUser.profile_image_url || '';
        const requestedRole = request.role || 'member';
        const requestedRoleLabel = this.getOrgRoleLabel(requestedRole);
        const hasNotification = (userId, type) => existingByUserAndType.has(`${String(userId || '')}::${String(type || '')}`);

        const legacyInviterId = request.status && !['active', 'pending'].includes(String(request.status))
            ? request.status
            : null;
        const invitedBy = request.invited_by || legacyInviterId;

        if (invitedBy) {
            const inviter = await Storage.getById('users', invitedBy);
            const inviterName = UI.getUserDisplayName(inviter || { name: 'Bandmate' });

            if (String(request.user_id) === String(currentUserId) && !hasNotification(currentUserId, 'org_invite_received')) {
                notificationsToCreate.push({
                    userId: request.user_id,
                    type: 'org_invite_received',
                    title: 'Organisations-Einladung',
                    message: `${inviterName} hat dich als ${requestedRoleLabel} zur Organisation "${org.name}" eingeladen.`,
                    actionType: 'respond_org_invite',
                    actionStatus: 'pending',
                    actorUserId: invitedBy,
                    actorName: inviterName,
                    actorImageUrl: inviter?.profile_image_url || '',
                    requestId: org.id,
                    organizationId: org.id,
                    organizationName: org.name,
                    targetUserId: request.user_id,
                    requestedRole
                });
            }

            if (String(invitedBy) === String(currentUserId) && !hasNotification(currentUserId, 'org_invite_pending')) {
                notificationsToCreate.push({
                    userId: invitedBy,
                    type: 'org_invite_pending',
                    title: 'Organisations-Einladung versendet',
                    message: `${targetName} wurde als ${requestedRoleLabel} zu "${org.name}" eingeladen.`,
                    actorUserId: request.user_id,
                    actorName: targetName,
                    actorImageUrl: targetImage,
                    requestId: org.id,
                    organizationId: org.id,
                    organizationName: org.name,
                    targetUserId: request.user_id,
                    requestedRole
                });
            }
        } else {
            const currentUserMember = await Storage.getOrganizationMember(request.organization_id, currentUserId);
            const isLeader = currentUserMember?.status === 'active'
                && ['admin', 'manager'].includes(String(currentUserMember.role || '').toLowerCase());

            if (isLeader && !hasNotification(currentUserId, 'org_join_request_received')) {
                notificationsToCreate.push({
                    userId: currentUserId,
                    type: 'org_join_request_received',
                    title: 'Neue Org-Anfrage',
                    message: `${targetName} möchte der Organisation "${org.name}" beitreten.`,
                    actionType: 'review_org_join_request',
                    actionStatus: 'pending',
                    actorUserId: request.user_id,
                    actorName: targetName,
                    actorImageUrl: targetImage,
                    requestId: org.id,
                    organizationId: org.id,
                    organizationName: org.name,
                    targetUserId: request.user_id,
                    requestedRole
                });
            }

            if (String(request.user_id) === String(currentUserId) && !hasNotification(currentUserId, 'org_join_request_pending')) {
                notificationsToCreate.push({
                    userId: currentUserId,
                    type: 'org_join_request_pending',
                    title: 'Org-Anfrage gesendet',
                    message: `Deine Anfrage für "${org.name}" wartet auf Freigabe.`,
                    actorUserId: currentUserId,
                    actorName: targetName,
                    actorImageUrl: targetImage,
                    requestId: org.id,
                    organizationId: org.id,
                    organizationName: org.name,
                    targetUserId: request.user_id,
                    requestedRole
                });
            }
        }

        if (notificationsToCreate.length === 0) return 0;
        await Promise.all(notificationsToCreate.map(notification => Storage.createNotification(notification)));
        return notificationsToCreate.length;
    },

    async ensurePendingRequestNotifications(request, options = {}) {
        if (!request || request.status !== 'pending') return 0;

        const currentUserId = String(options.currentUserId || '');
        const scope = options.scope || 'all';
        const existingNotifications = await Storage.getNotificationsByRequest(request.id);
        const existingByUserAndType = new Set(
            (Array.isArray(existingNotifications) ? existingNotifications : [])
                .map((notification) => `${String(notification.userId || '')}::${String(notification.type || '')}`)
        );

        const band = options.band || await Storage.getBand(request.bandId);
        if (!band) return 0;

        const requestedRole = request.requestedRole || 'member';
        const roleLabel = UI.getRoleDisplayName(requestedRole);
        const notificationsToCreate = [];

        const hasNotification = (userId, type) => existingByUserAndType.has(`${String(userId || '')}::${String(type || '')}`);
        const shouldIncludeRecipient = (userId) => scope === 'all' || String(userId || '') === currentUserId;

        if (request.type === 'invite') {
            const inviter = options.inviter || await Storage.getById('users', request.createdByUserId);
            const invitee = options.invitee || await Storage.getById('users', request.targetUserId);
            const inviterName = UI.getUserDisplayName(inviter || { name: 'Bandmate' });
            const inviteeName = UI.getUserDisplayName(invitee || { name: 'Mitglied' });
            const inviterImage = inviter?.profile_image_url || '';
            const inviteeImage = invitee?.profile_image_url || '';

            if (!hasNotification(request.targetUserId, 'invite_received') && shouldIncludeRecipient(request.targetUserId)) {
                notificationsToCreate.push({
                    userId: request.targetUserId,
                    requestId: request.id,
                    bandId: request.bandId,
                    type: 'invite_received',
                    title: `Einladung zu ${band.name}`,
                    message: `${inviterName} hat dich als ${roleLabel} zur Band ${band.name} eingeladen.`,
                    actionType: 'respond_invite',
                    actionStatus: 'pending',
                    actorUserId: request.createdByUserId,
                    actorName: inviterName,
                    actorImageUrl: inviterImage,
                    bandName: band.name,
                    requestedRole
                });
            }

            if (!hasNotification(request.createdByUserId, 'invite_pending') && shouldIncludeRecipient(request.createdByUserId)) {
                notificationsToCreate.push({
                    userId: request.createdByUserId,
                    requestId: request.id,
                    bandId: request.bandId,
                    type: 'invite_pending',
                    title: 'Einladung versendet',
                    message: `${inviteeName} wurde eingeladen und muss die Anfrage fuer ${band.name} noch bestaetigen.`,
                    actorUserId: request.targetUserId,
                    actorName: inviteeName,
                    actorImageUrl: inviteeImage,
                    bandName: band.name,
                    requestedRole
                });
            }
        } else if (request.type === 'join_request') {
            const requester = options.requester || await Storage.getById('users', request.createdByUserId);
            const leadershipMembers = options.leadershipMembers || await Storage.getBandLeadershipMembers(request.bandId);
            const requesterName = UI.getUserDisplayName(requester || { name: 'Bandmate' });
            const requesterImage = requester?.profile_image_url || '';

            (Array.isArray(leadershipMembers) ? leadershipMembers : []).forEach((member) => {
                if (!member?.userId || hasNotification(member.userId, 'join_request_received') || !shouldIncludeRecipient(member.userId)) return;
                notificationsToCreate.push({
                    userId: member.userId,
                    requestId: request.id,
                    bandId: request.bandId,
                    type: 'join_request_received',
                    title: 'Neue Beitrittsanfrage',
                    message: `${requesterName} moechte der Band ${band.name} als ${roleLabel} beitreten.`,
                    actionType: 'review_join_request',
                    actionStatus: 'pending',
                    actorUserId: request.createdByUserId,
                    actorName: requesterName,
                    actorImageUrl: requesterImage,
                    bandName: band.name,
                    requestedRole
                });
            });

            if (!hasNotification(request.createdByUserId, 'join_request_pending') && shouldIncludeRecipient(request.createdByUserId)) {
                notificationsToCreate.push({
                    userId: request.createdByUserId,
                    requestId: request.id,
                    bandId: request.bandId,
                    type: 'join_request_pending',
                    title: 'Anfrage gesendet',
                    message: `Deine Anfrage fuer ${band.name} wartet jetzt auf die Rueckmeldung der Bandleitung.`,
                    actorUserId: request.createdByUserId,
                    actorName: requesterName,
                    actorImageUrl: requesterImage,
                    bandName: band.name,
                    requestedRole
                });
            }
        }

        if (notificationsToCreate.length === 0) return 0;

        await Promise.all(notificationsToCreate.map((notification) => Storage.createNotification(notification)));
        return notificationsToCreate.length;
    },

    async enrichNotificationsWithRequestState(notifications) {
        if (!Array.isArray(notifications) || notifications.length === 0) return [];

        const requestIds = [...new Set(
            notifications
                .map(notification => notification?.requestId)
                .filter(Boolean)
                .map(value => String(value))
        )];

        const orgRequests = notifications.filter(n => (
            n?.type === 'org_join_request_received'
            || n?.type === 'org_invite_received'
            || n?.actionType === 'review_org_join_request'
            || n?.actionType === 'respond_org_invite'
        ));

        let requestMap = new Map();
        if (requestIds.length > 0) {
            const requests = await Storage.getBatchByIds('bandMembershipRequests', requestIds);
            requestMap = new Map(
                (Array.isArray(requests) ? requests : [])
                    .filter(request => request?.id)
                    .map(request => [String(request.id), request])
            );
        }

        const orgMemberPromises = orgRequests.map(async (n) => {
            try {
                const targetUserId = n.targetUserId || n.bandId;
                const orgId = n.organizationId || n.requestId;
                if (orgId && targetUserId) {
                    return await Storage.getOrganizationMembershipRequest(orgId, targetUserId);
                }
                return null;
            } catch (e) {
                return null;
            }
        });
        const orgMembers = await Promise.all(orgMemberPromises);
        const orgMemberMap = new Map();
        orgRequests.forEach((n, i) => {
            if (orgMembers[i]) {
                orgMemberMap.set(`${n.organizationId || n.requestId}:${n.targetUserId || n.bandId}`, orgMembers[i]);
            }
        });

        return notifications.map(notification => {
            if (
                notification.type === 'org_join_request_received'
                || notification.type === 'org_invite_received'
                || notification.actionType === 'review_org_join_request'
                || notification.actionType === 'respond_org_invite'
            ) {
                const member = orgMemberMap.get(`${notification.organizationId || notification.requestId}:${notification.targetUserId || notification.bandId}`);
                const status = member ? (member.status === 'active' ? 'accepted' : 'pending') : 'declined';
                return {
                    ...notification,
                    requestStatus: status,
                    actionStatus: status
                };
            }

            if (!notification?.requestId) return notification;

            const request = requestMap.get(String(notification.requestId));
            if (!request) return notification;

            const requestStatus = request.status === 'accepted' || request.status === 'declined'
                ? request.status
                : 'pending';

            const nextNotification = {
                ...notification,
                requestStatus
            };

            if (notification.actionType) {
                nextNotification.actionStatus = requestStatus;
            }

            return nextNotification;
        });
    },

    async toggleDropdown(forceState = null) {
        window.clearTimeout(this.hoverOpenTimer);
        window.clearTimeout(this.hoverCloseTimer);
        this.hoverOpenTimer = null;
        this.hoverCloseTimer = null;

        const nextState = forceState === null ? !this.isOpen : Boolean(forceState);
        if (!nextState) {
            this.closeDropdown();
            return;
        }

        const bellButton = document.getElementById('notificationBellBtn');
        const dropdown = document.getElementById('notificationDropdown');
        if (!bellButton || !dropdown) return;

        this.isOpen = true;
        bellButton.setAttribute('aria-expanded', 'true');
        dropdown.hidden = false;

        await this.refresh({ quiet: true });
    },

    closeDropdown() {
        this.isOpen = false;

        const bellButton = document.getElementById('notificationBellBtn');
        const dropdown = document.getElementById('notificationDropdown');
        if (bellButton) bellButton.setAttribute('aria-expanded', 'false');
        if (dropdown) dropdown.hidden = true;
    },

    updateBadge(count) {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;

        const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
        if (safeCount > 0) {
            badge.hidden = false;
            badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
        } else {
            badge.hidden = true;
            badge.textContent = '0';
        }
    },

    getDismissedStorageKey(userId) {
        return userId ? `bandmate.notifications.dismissed.${userId}` : '';
    },

    getDismissedNotificationIds(userId) {
        const storageKey = this.getDismissedStorageKey(userId);
        if (!storageKey) return new Set();

        try {
            const rawValue = localStorage.getItem(storageKey);
            if (!rawValue) return new Set();
            const parsedValue = JSON.parse(rawValue);
            if (!Array.isArray(parsedValue)) return new Set();
            return new Set(parsedValue.map((value) => String(value)));
        } catch (error) {
            Logger.warn('[Notifications] Could not read dismissed notification ids:', error);
            return new Set();
        }
    },

    persistDismissedNotificationId(userId, notificationId) {
        const storageKey = this.getDismissedStorageKey(userId);
        if (!storageKey || !notificationId) return;

        try {
            const dismissedIds = this.getDismissedNotificationIds(userId);
            dismissedIds.add(String(notificationId));
            localStorage.setItem(storageKey, JSON.stringify([...dismissedIds]));
        } catch (error) {
            Logger.warn('[Notifications] Could not persist dismissed notification id:', error);
        }
    },

    renderNotifications(notifications) {
        const list = document.getElementById('notificationList');
        if (!list) return;

        if (!Array.isArray(notifications) || notifications.length === 0) {
            list.innerHTML = `
                <div class="notification-empty-state">
                    <strong>Noch nichts neu</strong>
                    <p>Sobald es Einladungen oder Anfragen gibt, tauchen sie hier auf.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = notifications.map(notification => this.buildNotificationMarkup(notification)).join('');
    },

    buildNotificationMarkup(notification) {
        const actorName = notification.actorName || 'Bandmate';
        const title = this.escapeHtml(notification.title || 'Benachrichtigung');
        const message = this.escapeHtml(notification.message || '');
        const timestamp = this.escapeHtml(this.formatTimestamp(notification.createdAt));
        const unreadClass = notification.status === 'unread' ? ' is-unread' : '';
        const actionableClass = this.shouldShowActions(notification) ? ' is-actionable' : '';
        const badgeMarkup = (notification.bandName || notification.organizationName)
            ? `<span class="notification-meta-pill">${this.escapeHtml(notification.bandName || notification.organizationName)}</span>`
            : '';
        const statusMarkup = this.getStatusMarkup(notification);
        const actionsMarkup = this.getActionsMarkup(notification);

        return `
            <article class="notification-item${unreadClass}${actionableClass}" data-notification-id="${this.escapeHtml(notification.id)}">
                <div class="notification-item-media">
                    ${this.getActorAvatarMarkup(notification, actorName)}
                </div>
                <div class="notification-item-body">
                    <div class="notification-item-topline">
                        <div class="notification-item-meta">
                            ${badgeMarkup}
                            ${statusMarkup}
                        </div>
                        <div class="notification-item-top-actions">
                            <span class="notification-item-time">${timestamp}</span>
                            <button
                                type="button"
                                class="notification-remove-btn"
                                data-notification-remove="true"
                                data-notification-id="${this.escapeHtml(notification.id)}"
                                aria-label="Benachrichtigung löschen"
                                title="Benachrichtigung löschen"
                            >
                                <svg viewBox="0 0 20 20" aria-hidden="true">
                                    <path d="M5 5L15 15M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <h4 class="notification-item-title">${title}</h4>
                    <p class="notification-item-copy">${message}</p>
                    ${actionsMarkup}
                </div>
            </article>
        `;
    },

    getActorAvatarMarkup(notification, actorName) {
        if (notification.actorImageUrl) {
            return `
                <img
                    src="${this.escapeHtml(notification.actorImageUrl)}"
                    alt="${this.escapeHtml(actorName)}"
                    class="notification-avatar-img"
                >
            `;
        }

        const initials = this.escapeHtml(UI.getUserInitials(actorName));
        const background = this.escapeHtml(UI.getAvatarColor(actorName));
        return `
            <span class="notification-avatar-fallback" style="background: ${background};">
                ${initials}
            </span>
        `;
    },

    getStatusMarkup(notification) {
        const effectiveStatus = this.getEffectiveActionStatus(notification);

        if (effectiveStatus === 'accepted') {
            return '<span class="notification-status-chip is-success">Angenommen</span>';
        }

        if (effectiveStatus === 'declined') {
            return '<span class="notification-status-chip is-danger">Abgelehnt</span>';
        }

        if (this.shouldShowActions(notification)) {
            return '<span class="notification-status-chip is-pending">Offen</span>';
        }

        return '';
    },

    getActionsMarkup(notification) {
        if (!this.shouldShowActions(notification)) return '';

        const isBusy = this.pendingActionRequestIds.has(notification.requestId);
        const disabled = isBusy ? ' disabled' : '';

        return `
            <div class="notification-item-actions">
                <button
                    type="button"
                    class="notification-action-btn is-accept"
                    data-notification-action="accept"
                    data-notification-id="${this.escapeHtml(notification.id)}"
                    data-request-id="${this.escapeHtml(notification.requestId)}"${disabled}
                >
                    ${isBusy ? 'Pruefe...' : 'Annehmen'}
                </button>
                <button
                    type="button"
                    class="notification-action-btn is-decline"
                    data-notification-action="decline"
                    data-notification-id="${this.escapeHtml(notification.id)}"
                    data-request-id="${this.escapeHtml(notification.requestId)}"${disabled}
                >
                    Ablehnen
                </button>
            </div>
        `;
    },

    shouldShowActions(notification) {
        return Boolean(
            notification &&
            notification.actionType &&
            this.getEffectiveActionStatus(notification) === 'pending'
        );
    },

    getEffectiveActionStatus(notification) {
        if (!notification) return null;
        if (notification.requestStatus === 'accepted' || notification.requestStatus === 'declined' || notification.requestStatus === 'pending') {
            return notification.requestStatus;
        }
        if (notification.actionStatus === 'accepted' || notification.actionStatus === 'declined' || notification.actionStatus === 'pending') {
            return notification.actionStatus;
        }
        return null;
    },

    async markVisibleAsRead() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const unreadIds = this.currentNotifications
            .filter(notification => notification.status === 'unread')
            .map(notification => notification.id);

        if (unreadIds.length === 0) return;

        const marked = await Storage.markNotificationsRead(user.id, unreadIds);
        if (!marked) return;

        const timestamp = new Date().toISOString();
        const unreadIdSet = new Set(unreadIds);
        this.currentNotifications = this.currentNotifications.map(notification => (
            unreadIdSet.has(notification.id)
                ? { ...notification, status: 'read', readAt: timestamp }
                : notification
        ));

        this.renderNotifications(this.currentNotifications);
        this.unreadCount = Math.max(0, this.unreadCount - unreadIds.length);
        this.updateBadge(this.unreadCount);
    },

    async markNotificationRead(notificationId) {
        const user = Auth.getCurrentUser();
        if (!user || !notificationId) return;

        const target = this.currentNotifications.find(notification => notification.id === notificationId);
        if (!target || target.status !== 'unread') return;

        const marked = await Storage.markNotificationsRead(user.id, [notificationId]);
        if (!marked) return;

        const timestamp = new Date().toISOString();
        this.currentNotifications = this.currentNotifications.map(notification => (
            notification.id === notificationId
                ? { ...notification, status: 'read', readAt: timestamp }
                : notification
        ));

        this.renderNotifications(this.currentNotifications);
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.updateBadge(this.unreadCount);
    },

    async handleActionButton(button) {
        const requestId = button.dataset.requestId;
        const notificationId = button.dataset.notificationId;
        const action = button.dataset.notificationAction;

        if (!notificationId || !action) return;

        const notification = this.currentNotifications.find(n => String(n.id) === String(notificationId));
        
        if (notification && notification.type === 'org_band_invitation') {
            await this.respondToOrgBandInvitation(notification, action);
            return;
        }

        if (notification && ['org_join_request_received', 'org_invite_received'].includes(notification.type)) {
            await this.respondToOrgMembershipNotification(notification, action);
            return;
        }

        if (!requestId) return;

        await this.respondToRequest(requestId, action, notificationId);
    },

    async respondToOrgMembershipNotification(notification, action) {
        const user = Auth.getCurrentUser();
        if (!user || !notification) return;

        const orgId = notification.organizationId || notification.requestId;
        const targetUserId = notification.targetUserId || notification.bandId || notification.userId;
        if (!orgId || !targetUserId) {
            UI.showToast('Die Organisationsanfrage ist unvollständig.', 'error');
            return;
        }

        const busyKey = `org_membership_${orgId}_${targetUserId}`;
        if (this.pendingActionRequestIds.has(busyKey)) return;

        this.pendingActionRequestIds.add(busyKey);
        this.pendingActionRequestIds.add(String(orgId));
        this.renderNotifications(this.currentNotifications);

        try {
            const [membership, org] = await Promise.all([
                Storage.getOrganizationMembershipRequest(orgId, targetUserId),
                Storage.getOrganization(orgId)
            ]);

            if (!org) {
                throw new Error('Die Organisation wurde nicht gefunden.');
            }

            if (!membership || membership.status === 'active') {
                const status = membership?.status === 'active' ? 'accepted' : 'declined';
                await Storage.updateNotificationsByOrgRequest(orgId, targetUserId, { actionStatus: status });
                await this.markNotificationRead(notification.id);
                UI.showToast(
                    status === 'accepted' ? 'Diese Anfrage wurde bereits angenommen.' : 'Diese Anfrage wurde bereits abgelehnt.',
                    'info'
                );
                await this.refresh({ quiet: true, skipAutoRead: true });
                return;
            }

            const decision = action === 'accept' ? 'accepted' : 'declined';
            const actorName = UI.getUserDisplayName(user);
            const actorImageUrl = user.profile_image_url || '';
            const requestedRole = membership.role && membership.role !== 'pending'
                ? membership.role
                : (notification.requestedRole || 'member');

            if (notification.type === 'org_join_request_received' || notification.actionType === 'review_org_join_request') {
                const reviewerMembership = await Storage.getOrganizationMember(orgId, user.id);
                const canReview = reviewerMembership?.status === 'active'
                    && ['admin', 'manager'].includes(String(reviewerMembership.role || '').toLowerCase());

                if (!canReview && !Auth.isAdmin()) {
                    throw new Error('Nur Admins oder Manager dürfen diese Anfrage beantworten.');
                }

                if (decision === 'accepted') {
                    await Storage.updateOrganizationMemberStatus(orgId, targetUserId, requestedRole || 'member');
                } else {
                    await Storage.removeOrganizationMember(orgId, targetUserId);
                }

                await Storage.updateNotificationsByOrgRequest(orgId, targetUserId, { actionStatus: decision });
                await Storage.logOrganizationActivity(
                    orgId,
                    user.id,
                    decision === 'accepted' ? 'accept_join_request' : 'decline_join_request',
                    'user',
                    targetUserId
                );

                await Storage.createNotification({
                    userId: targetUserId,
                    type: decision === 'accepted' ? 'org_join_request_accepted' : 'org_join_request_declined',
                    title: decision === 'accepted' ? 'Org-Anfrage angenommen' : 'Org-Anfrage abgelehnt',
                    message: decision === 'accepted'
                        ? `Deine Anfrage für "${org.name}" wurde angenommen.`
                        : `Deine Anfrage für "${org.name}" wurde abgelehnt.`,
                    actorUserId: user.id,
                    actorName,
                    actorImageUrl,
                    requestId: orgId,
                    organizationId: orgId,
                    organizationName: org.name,
                    targetUserId
                });

                UI.showToast(
                    decision === 'accepted' ? 'Beitrittsanfrage angenommen.' : 'Beitrittsanfrage abgelehnt.',
                    decision === 'accepted' ? 'success' : 'info'
                );
            } else if (notification.type === 'org_invite_received' || notification.actionType === 'respond_org_invite') {
                if (String(user.id) !== String(targetUserId) && !Auth.isAdmin()) {
                    throw new Error('Nur der eingeladene Benutzer kann auf diese Einladung reagieren.');
                }

                if (decision === 'accepted') {
                    await Storage.updateOrganizationMemberStatus(orgId, targetUserId, requestedRole || 'member');
                } else {
                    await Storage.removeOrganizationMember(orgId, targetUserId);
                }

                await Storage.updateNotificationsByOrgRequest(orgId, targetUserId, { actionStatus: decision });
                await Storage.logOrganizationActivity(
                    orgId,
                    user.id,
                    decision === 'accepted' ? 'accept_member_invite' : 'decline_member_invite',
                    'user',
                    targetUserId
                );

                const legacyInviterId = membership.status && !['active', 'pending'].includes(String(membership.status))
                    ? membership.status
                    : null;
                const invitedBy = membership.invited_by || legacyInviterId;

                if (invitedBy) {
                    await Storage.createNotification({
                        userId: invitedBy,
                        type: decision === 'accepted' ? 'org_invite_accepted' : 'org_invite_declined',
                        title: decision === 'accepted' ? 'Org-Einladung angenommen' : 'Org-Einladung abgelehnt',
                        message: `${actorName} hat die Einladung zu "${org.name}" ${decision === 'accepted' ? 'angenommen' : 'abgelehnt'}.`,
                        actorUserId: user.id,
                        actorName,
                        actorImageUrl,
                        requestId: orgId,
                        organizationId: orgId,
                        organizationName: org.name,
                        targetUserId
                    });
                }

                UI.showToast(
                    decision === 'accepted' ? `Du bist jetzt Mitglied von "${org.name}".` : `Einladung zu "${org.name}" abgelehnt.`,
                    decision === 'accepted' ? 'success' : 'info'
                );
            } else {
                throw new Error('Unbekannter Organisationstyp.');
            }

            await this.markNotificationRead(notification.id);
            await this.refreshOrganizationContext(orgId);
            await this.refresh({ quiet: true, skipAutoRead: true });
        } catch (error) {
            Logger.error('[Notifications] Error responding to org membership notification:', error);
            UI.showToast(error.message || 'Die Organisationsanfrage konnte nicht verarbeitet werden.', 'error');
        } finally {
            this.pendingActionRequestIds.delete(busyKey);
            this.pendingActionRequestIds.delete(String(orgId));
            this.renderNotifications(this.currentNotifications);
        }
    },

    async respondToOrgBandInvitation(notification, action) {
        const user = Auth.getCurrentUser();
        if (!user) return;
        
        const isBusyKey = `org_invite_${notification.id}`;
        if (this.pendingActionRequestIds.has(isBusyKey)) return;

        this.pendingActionRequestIds.add(isBusyKey);
        this.renderNotifications(this.currentNotifications);

        try {
            const decision = action === 'accept' ? 'accepted' : 'declined';
            
            const orgId = notification.organizationId || notification.requestId;
            const link = await Storage.getOrganizationBandLink(orgId, notification.bandId);
            if (!link) {
                throw new Error('Verknüpfung nicht gefunden.');
            }

            if (link.status !== 'pending') {
                await Storage.updateNotificationsByOrgBandInvitation(orgId, notification.bandId, {
                    actionStatus: link.status === 'active' ? 'accepted' : link.status
                });
                UI.showToast(`Diese Anfrage wurde bereits ${link.status === 'active' ? 'angenommen' : 'abgelehnt'}.`, 'info');
                await this.refresh({ quiet: true, skipAutoRead: true });
                return;
            }

            if (decision === 'accepted') {
                await Storage.updateOrganizationBandStatus(orgId, notification.bandId, 'active');
                
                // Notify all band members about the successful link
                const bandMembers = await Storage.getBandMembers(notification.bandId);
                if (Array.isArray(bandMembers)) {
                    const notifyPromises = bandMembers.map(member => 
                        Storage.createNotification({
                            userId: member.userId,
                            type: 'band_linked_to_org',
                            title: 'Band verknüpft',
                            message: `Deine Band "${notification.bandName}" wurde mit einer Organisation verknüpft.`,
                            actorUserId: user.id,
                            actorName: UI.getUserDisplayName(user),
                            organizationId: orgId,
                            organizationName: notification.organizationName || '',
                            bandId: notification.bandId,
                            bandName: notification.bandName
                        })
                    );
                    await Promise.all(notifyPromises);
                }
                
                await Storage.logOrganizationActivity(orgId, user.id, 'accept_band_invite', 'band', notification.bandId);
                UI.showToast('Band erfolgreich verknüpft.', 'success');
            } else {
                await Storage.unlinkBandFromOrganization(orgId, notification.bandId);
                await Storage.logOrganizationActivity(orgId, user.id, 'decline_band_invite', 'band', notification.bandId);
                UI.showToast('Einladung zur Organisation abgelehnt.', 'info');
            }

            // Update the notification status
            await Storage.updateNotificationsByOrgBandInvitation(orgId, notification.bandId, { actionStatus: decision });
            await this.refresh({ quiet: true, skipAutoRead: true });

            if (typeof Organizations !== 'undefined' && Organizations.currentOrgId === orgId) {
                await Organizations.loadBands();
            }
        } catch (error) {
            Logger.error('[Notifications] Error responding to org band invitation:', error);
            UI.showToast(error.message || 'Fehler beim Antworten auf die Einladung.', 'error');
        } finally {
            this.pendingActionRequestIds.delete(isBusyKey);
            this.renderNotifications(this.currentNotifications);
        }
    },

    async handleRemoveButton(button) {
        const notificationId = button.dataset.notificationId;
        if (!notificationId) return;
        await this.deleteNotification(notificationId);
    },

    async deleteNotification(notificationId) {
        const user = Auth.getCurrentUser();
        if (!user || !notificationId) return;

        const target = this.currentNotifications.find(notification => String(notification.id) === String(notificationId));
        if (target?.status === 'unread') {
            const marked = await Storage.markNotificationsRead(user.id, [notificationId]);
            if (!marked) {
                UI.showToast('Benachrichtigung konnte nicht entfernt werden.', 'error');
                return;
            }
        }

        this.persistDismissedNotificationId(user.id, notificationId);

        this.currentNotifications = this.currentNotifications.filter(
            notification => String(notification.id) !== String(notificationId)
        );

        if (target?.status === 'unread') {
            this.unreadCount = Math.max(0, this.unreadCount - 1);
        }

        this.renderNotifications(this.currentNotifications);
        this.updateBadge(this.unreadCount);
        UI.showToast('Benachrichtigung entfernt.', 'success');
    },

    async respondToRequest(requestId, action, sourceNotificationId = null) {
        const user = Auth.getCurrentUser();
        if (!user) return;
        if (this.pendingActionRequestIds.has(requestId)) return;

        this.pendingActionRequestIds.add(requestId);
        this.renderNotifications(this.currentNotifications);

        try {
            const request = await Storage.getBandMembershipRequest(requestId);
            if (!request) {
                throw new Error('Die Anfrage wurde nicht gefunden.');
            }

            const band = await Storage.getBand(request.bandId);
            if (!band) {
                throw new Error('Die zugehörige Band wurde nicht gefunden.');
            }

            if (request.status !== 'pending') {
                await Storage.updateNotificationsByRequest(requestId, { actionStatus: request.status });
                if (sourceNotificationId) {
                    await this.markNotificationRead(sourceNotificationId);
                }
                UI.showToast(
                    `Diese Anfrage wurde bereits ${request.status === 'accepted' ? 'angenommen' : 'abgelehnt'}.`,
                    'info'
                );
                await this.refresh({ quiet: true, skipAutoRead: true });
                return;
            }

            const decision = action === 'accept' ? 'accepted' : 'declined';
            const actorName = UI.getUserDisplayName(user);
            const actorImageUrl = user.profile_image_url || '';
            const requestedRole = request.requestedRole || 'member';

            if (request.type === 'invite') {
                if (user.id !== request.targetUserId && !Auth.isAdmin()) {
                    throw new Error('Nur der eingeladene Benutzer kann auf diese Einladung reagieren.');
                }

                if (decision === 'accepted') {
                    const existingRole = await Storage.getUserRoleInBand(request.targetUserId, request.bandId);
                    if (!existingRole) {
                        await Storage.addBandMember(request.bandId, request.targetUserId, requestedRole);
                    }
                }

                await Storage.updateBandMembershipRequest(requestId, {
                    status: decision,
                    respondedByUserId: user.id,
                    respondedAt: new Date().toISOString()
                });

                await Storage.updateNotificationsByRequest(requestId, {
                    actionStatus: decision
                });

                await Storage.createNotification({
                    userId: request.createdByUserId,
                    requestId,
                    bandId: request.bandId,
                    type: decision === 'accepted' ? 'invite_accepted' : 'invite_declined',
                    title: decision === 'accepted' ? 'Einladung angenommen' : 'Einladung abgelehnt',
                    message: `${actorName} hat deine Einladung fuer ${band.name} ${decision === 'accepted' ? 'angenommen' : 'abgelehnt'}.`,
                    actorUserId: user.id,
                    actorName,
                    actorImageUrl,
                    bandName: band.name,
                    requestedRole
                });

                if (decision === 'accepted') {
                    await this.refreshBandMembershipContext();
                    UI.showToast(`Du bist jetzt Mitglied von "${band.name}".`, 'success');
                } else {
                    UI.showToast(`Einladung fuer "${band.name}" abgelehnt.`, 'info');
                }
            } else if (request.type === 'join_request') {
                const canApprove = Auth.isAdmin() || await Auth.canManageBand(request.bandId);
                if (!canApprove) {
                    throw new Error('Nur Leiter oder Co-Leiter duerfen diese Anfrage beantworten.');
                }

                if (decision === 'accepted') {
                    const existingRole = await Storage.getUserRoleInBand(request.targetUserId, request.bandId);
                    if (!existingRole) {
                        await Storage.addBandMember(request.bandId, request.targetUserId, requestedRole);
                    }
                }

                await Storage.updateBandMembershipRequest(requestId, {
                    status: decision,
                    respondedByUserId: user.id,
                    respondedAt: new Date().toISOString()
                });

                await Storage.updateNotificationsByRequest(requestId, {
                    actionStatus: decision
                });

                await Storage.createNotification({
                    userId: request.targetUserId,
                    requestId,
                    bandId: request.bandId,
                    type: decision === 'accepted' ? 'join_request_accepted' : 'join_request_declined',
                    title: decision === 'accepted' ? 'Beitrittsanfrage angenommen' : 'Beitrittsanfrage abgelehnt',
                    message: decision === 'accepted'
                        ? `Deine Anfrage fuer ${band.name} wurde angenommen.`
                        : `Deine Anfrage fuer ${band.name} wurde abgelehnt.`,
                    actorUserId: user.id,
                    actorName,
                    actorImageUrl,
                    bandName: band.name,
                    requestedRole
                });

                if (decision === 'accepted' && typeof Bands !== 'undefined') {
                    if (Bands.currentBandId === request.bandId && typeof Bands.renderBandMembers === 'function') {
                        await Bands.renderBandMembers(request.bandId);
                    }
                    if (typeof Bands.invalidateCache === 'function') {
                        Bands.invalidateCache();
                    }
                    if (document.getElementById('bandsView')?.classList.contains('active') && typeof Bands.renderBands === 'function') {
                        await Bands.renderBands(true);
                    }
                }

                UI.showToast(
                    decision === 'accepted' ? 'Mitglied erfolgreich freigegeben.' : 'Anfrage abgelehnt.',
                    decision === 'accepted' ? 'success' : 'info'
                );
            } else {
                throw new Error('Unbekannter Anfragetyp.');
            }

            if (sourceNotificationId) {
                await this.markNotificationRead(sourceNotificationId);
            }

            await this.refresh({ quiet: true, skipAutoRead: true });
        } catch (error) {
            Logger.error('[Notifications.respondToRequest] Error:', error);
            UI.showToast(error.message || 'Die Anfrage konnte nicht verarbeitet werden.', 'error');
        } finally {
            this.pendingActionRequestIds.delete(requestId);
            this.renderNotifications(this.currentNotifications);
        }
    },

    async sendBandInvite(bandId, invitedUser, requestedRole = 'member') {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser) {
            throw new Error('Du musst angemeldet sein.');
        }

        if (!bandId || !invitedUser?.id) {
            throw new Error('Die Einladung ist unvollstaendig.');
        }

        if (currentUser.id === invitedUser.id) {
            throw new Error('Du kannst dich nicht selbst einladen.');
        }

        const band = await Storage.getBand(bandId);
        if (!band) {
            throw new Error('Die Band wurde nicht gefunden.');
        }

        const pendingRequest = await Storage.getPendingBandMembershipRequest(bandId, invitedUser.id);
        if (pendingRequest) {
            await this.ensurePendingRequestNotifications(pendingRequest, {
                band,
                currentUserId: currentUser.id,
                scope: 'all',
                inviter: currentUser,
                invitee: invitedUser
            });
            await this.refresh({ quiet: true });
            throw new Error(this.getDuplicateRequestMessage(pendingRequest, band.name, 'invite'));
        }

        const inviterName = UI.getUserDisplayName(currentUser);
        const inviteeName = UI.getUserDisplayName(invitedUser);
        const roleLabel = UI.getRoleDisplayName(requestedRole);

        const request = await Storage.createBandMembershipRequest({
            bandId,
            type: 'invite',
            targetUserId: invitedUser.id,
            requestedRole,
            createdByUserId: currentUser.id
        });

        await Promise.all([
            Storage.createNotification({
                userId: invitedUser.id,
                requestId: request.id,
                bandId,
                type: 'invite_received',
                title: `Einladung zu ${band.name}`,
                message: `${inviterName} hat dich als ${roleLabel} zur Band ${band.name} eingeladen.`,
                actionType: 'respond_invite',
                actionStatus: 'pending',
                actorUserId: currentUser.id,
                actorName: inviterName,
                actorImageUrl: currentUser.profile_image_url || '',
                bandName: band.name,
                requestedRole
            }),
            Storage.createNotification({
                userId: currentUser.id,
                requestId: request.id,
                bandId,
                type: 'invite_pending',
                title: 'Einladung versendet',
                message: `${inviteeName} wurde eingeladen und muss die Anfrage fuer ${band.name} noch bestaetigen.`,
                actorUserId: invitedUser.id,
                actorName: inviteeName,
                actorImageUrl: invitedUser.profile_image_url || '',
                bandName: band.name,
                requestedRole
            })
        ]);

        await this.refresh({ quiet: true, skipAutoRead: true });
        return request;
    },

    async createJoinRequest(bandId, requestedRole = 'member') {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser) {
            throw new Error('Du musst angemeldet sein.');
        }

        const band = await Storage.getBand(bandId);
        if (!band) {
            throw new Error('Die Band wurde nicht gefunden.');
        }

        const pendingRequest = await Storage.getPendingBandMembershipRequest(bandId, currentUser.id);
        if (pendingRequest) {
            await this.ensurePendingRequestNotifications(pendingRequest, {
                band,
                currentUserId: currentUser.id,
                scope: 'all',
                requester: currentUser
            });
            await this.refresh({ quiet: true });
            throw new Error(this.getDuplicateRequestMessage(pendingRequest, band.name, 'join'));
        }

        const leadershipMembers = await Storage.getBandLeadershipMembers(bandId);
        if (!Array.isArray(leadershipMembers) || leadershipMembers.length === 0) {
            throw new Error('Fuer diese Band konnte keine Bandleitung gefunden werden.');
        }

        const requesterName = UI.getUserDisplayName(currentUser);
        const roleLabel = UI.getRoleDisplayName(requestedRole);

        const request = await Storage.createBandMembershipRequest({
            bandId,
            type: 'join_request',
            targetUserId: currentUser.id,
            requestedRole,
            createdByUserId: currentUser.id
        });

        const leaderNotificationPromises = leadershipMembers.map(member =>
            Storage.createNotification({
                userId: member.userId,
                requestId: request.id,
                bandId,
                type: 'join_request_received',
                title: 'Neue Beitrittsanfrage',
                message: `${requesterName} moechte der Band ${band.name} als ${roleLabel} beitreten.`,
                actionType: 'review_join_request',
                actionStatus: 'pending',
                actorUserId: currentUser.id,
                actorName: requesterName,
                actorImageUrl: currentUser.profile_image_url || '',
                bandName: band.name,
                requestedRole
            })
        );

        await Promise.all([
            ...leaderNotificationPromises,
            Storage.createNotification({
                userId: currentUser.id,
                requestId: request.id,
                bandId,
                type: 'join_request_pending',
                title: 'Anfrage gesendet',
                message: `Deine Anfrage fuer ${band.name} wartet jetzt auf die Rueckmeldung der Bandleitung.`,
                actorUserId: currentUser.id,
                actorName: requesterName,
                actorImageUrl: currentUser.profile_image_url || '',
                bandName: band.name,
                requestedRole
            })
        ]);

        await this.refresh({ quiet: true, skipAutoRead: true });
        return request;
    },

    getDuplicateRequestMessage(request, bandName, context = '') {
        if (!request) {
            return `Fuer ${bandName} existiert bereits eine offene Anfrage.`;
        }

        if (request.type === 'invite' && context === 'join') {
            return `Fuer ${bandName} hast du bereits eine Einladung. Antworte direkt in den Benachrichtigungen.`;
        }

        if (request.type === 'join_request' && context === 'invite') {
            return `Fuer diesen Benutzer liegt bereits eine offene Beitrittsanfrage zu ${bandName} vor.`;
        }

        if (request.type === 'invite') {
            return `Fuer diesen Benutzer gibt es bereits eine offene Einladung zu ${bandName}.`;
        }

        return `Es gibt bereits eine offene Beitrittsanfrage fuer ${bandName}.`;
    },

    getOrgRoleLabel(role) {
        const labels = {
            admin: 'Admin',
            manager: 'Manager',
            member: 'Mitglied'
        };
        return labels[String(role || '').toLowerCase()] || 'Mitglied';
    },

    async refreshOrganizationContext(orgId = null) {
        if (typeof Organizations !== 'undefined') {
            Organizations.organizationsCache = null;

            if (Organizations.currentOrgId && (!orgId || String(Organizations.currentOrgId) === String(orgId))) {
                try {
                    await Organizations.showOrgDetail(Organizations.currentOrgId);
                } catch (error) {
                    Logger.warn('[Notifications] Could not refresh organization detail:', error);
                }
            }

            if (document.getElementById('organizationsView')?.classList.contains('active') && typeof Organizations.renderOrganizations === 'function') {
                await Organizations.renderOrganizations(true);
            }
        }

        if (typeof App !== 'undefined' && typeof App.updateDashboard === 'function') {
            await App.updateDashboard();
        }
    },

    async refreshBandMembershipContext() {
        if (typeof Auth !== 'undefined' && typeof Auth.updateCurrentUser === 'function') {
            await Auth.updateCurrentUser();
        }

        if (typeof Bands !== 'undefined' && typeof Bands.invalidateCache === 'function') {
            Bands.invalidateCache();
        }

        if (typeof Bands !== 'undefined' && typeof Bands.updateNavVisibility === 'function') {
            await Bands.updateNavVisibility();
        }

        if (typeof App !== 'undefined') {
            if (typeof App.updateDashboard === 'function') {
                await App.updateDashboard();
            }
            if (typeof App.updateNavigationVisibility === 'function') {
                await App.updateNavigationVisibility();
            }
        }

        if (typeof Bands !== 'undefined' && document.getElementById('bandsView')?.classList.contains('active') && typeof Bands.renderBands === 'function') {
            await Bands.renderBands(true);
        }
    },

    async syncMembershipContext(notifications) {
        const membershipNotifications = (notifications || []).filter(notification => (
            notification &&
            (
                notification.type === 'join_request_accepted' ||
                notification.type === 'org_join_request_accepted' ||
                notification.type === 'org_invite_accepted' ||
                (notification.actionType === 'respond_invite' && notification.actionStatus === 'accepted')
                || (notification.type === 'org_invite_received' && notification.actionStatus === 'accepted')
                || (notification.actionType === 'respond_org_invite' && notification.actionStatus === 'accepted')
            )
        ));

        const freshNotifications = membershipNotifications.filter(notification => !this.processedMembershipNotificationIds.has(notification.id));
        if (freshNotifications.length === 0) return;

        freshNotifications.forEach(notification => {
            this.processedMembershipNotificationIds.add(notification.id);
        });

        await Promise.all([
            this.refreshBandMembershipContext(),
            this.refreshOrganizationContext()
        ]);
    },

    formatTimestamp(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        const diffMs = Date.now() - date.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);

        if (diffMinutes < 1) return 'Gerade eben';
        if (diffMinutes < 60) return `vor ${diffMinutes} Min`;
        if (diffHours < 24) return `vor ${diffHours} Std`;
        return UI.formatDateShort(value);
    },

    escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }
};
