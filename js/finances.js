/**
 * Finance Module for Bandmate
 * Handles both Band and Private finance contexts with a unified UI.
 */

const Finances = {
    currentContext: null, // 'band' or 'private'
    currentBandId: null,
    entries: [],
    userCache: {},
    splitItems: [],
    receiptFile: null,
    currentView: 'list', // 'list' or 'settlement'
    
    categories: {
        income: ['Gage', 'Merch', 'Tickets', 'Streaming', 'Sponsoring', 'Spenden', 'Fördergelder', 'Erstattung', 'Privat', 'Sonstiges'],
        expense: ['Proberaum', 'Fahrtkosten', 'Unterkunft', 'Verpflegung', 'Equipment', 'Studio', 'Produktion', 'Werbung', 'Merch-Produktion', 'Gebühren', 'Software', 'Erstattung', 'Sonstiges'],
        transfer: ['Umbuchung', 'Einlage', 'Entnahme']
    },

    paymentMethods: ['Bar', 'Überweisung', 'PayPal', 'Stripe', 'Karte', 'Sonstiges'],

    init() {
        Logger.info('[Finances] Module initialized');
        this.bindGlobalEvents();
    },

    bindGlobalEvents() {
        const form = document.getElementById('financeEntryForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEntry();
            });
        }
    },

    /**
     * Main entry point for rendering the finance module
     */
    async render(context, id) {
        if (!context || !id) {
            Logger.warn('[Finances] Render called without context or ID', { context, id });
            return;
        }

        Logger.info(`[Finances] Rendering ${context} context with ID: ${id}`);
        this.currentContext = context;
        
        // Ensure the ID is correctly assigned to the right context property
        if (context === 'band') {
            this.currentBandId = id;
        } else {
            this.currentBandId = null; // Clear band ID when in private context
        }
        
        const containerId = (context === 'band') ? 'bandFinanzenContainer' : 'privateFinanzenContainer';
        const container = document.getElementById(containerId);
        
        if (!container) {
            Logger.warn(`[Finances] Container ${containerId} not found in DOM`);
            return;
        }

        this.userCache = {};
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Lade Finanzen...</p></div>';
        
        try {
            await this.loadData();
            
            if (context === 'band') {
                const members = await Storage.getBandMembers(this.currentBandId);
                const userPromises = members.map(m => Storage.getById('users', m.userId));
                const users = await Promise.all(userPromises);
                this.userCache = users.reduce((acc, u) => {
                    if (u) acc[u.id] = u;
                    return acc;
                }, {});
            }
            
            Logger.info(`[Finances] Data loaded: ${this.entries.length} entries`);
            
            this.renderLayout(container);
            this.renderDashboard();
            
            if (this.currentView === 'settlement' && context === 'band') {
                await this.showSettlement();
            } else {
                this.renderList();
            }
        } catch (error) {
            Logger.error('[Finances] Error rendering finance module:', error);
            container.innerHTML = `<div class="error-state"><p>Fehler beim Laden der Finanzen: ${error.message}</p></div>`;
        }
    },

    async loadData() {
        const user = Auth.getCurrentUser();
        if (!user) throw new Error('Nicht eingeloggt');

        let query = SupabaseClient.client
            .from('finance_entries')
            .select('*, finance_split_items(*)');

        if (this.currentContext === 'band') {
            query = query.eq('context_type', 'band').eq('band_id', this.currentBandId);
        } else {
            query = query.eq('context_type', 'private').eq('user_id', user.id);
        }

        const { data, error } = await query
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        this.entries = data || [];
    },

    renderLayout(container) {
        container.innerHTML = `
            <div class="finance-layout">
                <!-- Dashboard Section -->
                <div id="financeDashboard_${this.currentContext}" class="finance-dashboard-grid"></div>
                
                <!-- Action Bar -->
                <div class="finance-actions-bar">
                    <div class="finance-quick-actions">
                        <button class="btn btn-primary" onclick="Finances.openEntryModal('income')" title="Neue Einnahme erfassen">
                            <i data-lucide="plus-circle" style="width: 18px; height: 18px;"></i> Einnahme
                        </button>
                        <button class="btn btn-secondary" onclick="Finances.openEntryModal('expense')" title="Neue Ausgabe erfassen">
                            <i data-lucide="minus-circle" style="width: 18px; height: 18px;"></i> Ausgabe
                        </button>
                        <button class="btn btn-secondary" onclick="Finances.openEntryModal('transfer')" title="Geldtransfer zwischen Konten">
                            <i data-lucide="repeat" style="width: 18px; height: 18px;"></i> Transfer
                        </button>
                    </div>
                    
                    <div class="finance-export-actions">
                        <button class="btn btn-icon-only" title="Liste als CSV-Datei exportieren (Excel)" onclick="Finances.export('csv')">
                            <i data-lucide="file-spreadsheet" style="width: 18px; height: 18px;"></i>
                        </button>
                        <button class="btn btn-icon-only" title="Finanzbericht als PDF generieren" onclick="Finances.export('pdf')">
                            <i data-lucide="file-text" style="width: 18px; height: 18px;"></i>
                        </button>
                    </div>
                </div>

                <!-- Filter Bar -->
                <div class="finance-filter-bar">
                    <div class="filter-group">
                        <select id="financeFilterType_${this.currentContext}" class="form-select-sm" onchange="Finances.filterChanged()">
                            <option value="all">Alle Typen</option>
                            <option value="income">Einnahmen</option>
                            <option value="expense">Ausgaben</option>
                            <option value="transfer">Transfers</option>
                        </select>
                        <select id="financeFilterStatus_${this.currentContext}" class="form-select-sm" onchange="Finances.filterChanged()">
                            <option value="all">Alle Status</option>
                            <option value="open">Offen</option>
                            <option value="paid">Bezahlt</option>
                        </select>
                    </div>
                    <div class="search-group">
                        <input type="text" id="financeSearch_${this.currentContext}" class="form-input-sm" placeholder="Suchen..." oninput="Finances.filterChanged()">
                    </div>
                </div>

                ${this.currentContext === 'band' ? `
                <div class="finance-view-switcher">
                    <button class="switcher-btn ${this.currentView === 'list' ? 'active' : ''}" onclick="Finances.switchView('list')">Transaktionen</button>
                    <button class="switcher-btn ${this.currentView === 'settlement' ? 'active' : ''}" onclick="Finances.switchView('settlement')">Abrechnung</button>
                </div>
                ` : ''}

                <!-- List Section -->
                <div id="financeList_${this.currentContext}" class="finance-list-container"></div>
            </div>
        `;
        
        if (window.lucide) lucide.createIcons();
    },

    renderDashboard() {
        const dashboard = document.getElementById(`financeDashboard_${this.currentContext}`);
        if (!dashboard) return;

        const stats = this.calculateStats();
        
        dashboard.innerHTML = `
            <div class="finance-card stat-card">
                <span class="stat-label">Saldo</span>
                <span class="stat-value ${stats.balance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.balance)}</span>
            </div>
            <div class="finance-card stat-card">
                <span class="stat-label">Einnahmen</span>
                <span class="stat-value positive">${this.formatCurrency(stats.totalIncome)}</span>
            </div>
            <div class="finance-card stat-card">
                <span class="stat-label">Ausgaben</span>
                <span class="stat-value negative">${this.formatCurrency(stats.totalExpense)}</span>
            </div>
            <div class="finance-card stat-card">
                <span class="stat-label">Offen</span>
                <span class="stat-value warning">${this.formatCurrency(stats.totalOpen)}</span>
            </div>
        `;
    },

    switchView(view) {
        this.currentView = view;
        const id = this.currentContext === 'band' ? this.currentBandId : Auth.getCurrentUser().id;
        this.render(this.currentContext, id);
    },

    calculateStats() {
        let balance = 0;
        let totalIncome = 0;
        let totalExpense = 0;
        let totalOpen = 0;

        this.entries.forEach(entry => {
            const amount = parseFloat(entry.amount) || 0;
            if (entry.type === 'income') {
                totalIncome += amount;
                balance += amount;
                if (entry.status === 'open') totalOpen += amount;
            } else if (entry.type === 'expense') {
                totalExpense += amount;
                balance -= amount;
                if (entry.status === 'open') totalOpen -= amount;
            }
        });

        return { balance, totalIncome, totalExpense, totalOpen };
    },

    renderList() {
        const listContainer = document.getElementById(`financeList_${this.currentContext}`);
        if (!listContainer) return;

        if (this.entries.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="piggy-bank" style="width: 48px; height: 48px; opacity: 0.2; margin-bottom: 1rem;"></i>
                    <p>Noch keine Finanzeinträge vorhanden.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        const filteredEntries = this.getFilteredEntries();

        listContainer.innerHTML = `
            <div class="table-responsive">
                <table class="finance-table">
                    <thead>
                        <tr>
                            <th>Datum</th>
                            ${this.currentContext === 'band' ? '<th>Person</th>' : ''}
                            <th>Kategorie</th>
                            <th class="text-center">Beleg</th>
                            <th>Beschreibung</th>
                            <th>Status</th>
                            <th class="text-right">Betrag</th>
                            <th class="text-right">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredEntries.map(entry => `
                            <tr class="finance-row type-${entry.type}" onclick="Finances.openEntryModal(null, '${entry.id}')">
                                <td class="cell-date">${this.formatDate(entry.date)}</td>
                                ${this.currentContext === 'band' ? `<td class="cell-user"><span class="text-xs font-medium">${this.getUserName(entry.user_id)}</span></td>` : ''}
                                <td class="cell-category">
                                    <span class="badge badge-outline">${entry.category}</span>
                                </td>
                                <td class="cell-receipt text-center">
                                    ${entry.receipt_url ? `
                                        <button class="btn-icon btn-receipt" onclick="event.stopPropagation(); Finances.previewReceipt('${entry.receipt_url}')" title="Beleg ansehen">
                                            <i data-lucide="file-text" style="width: 18px; height: 18px;"></i>
                                        </button>
                                    ` : '<span class="text-muted" style="opacity: 0.3;">—</span>'}
                                </td>
                                <td class="cell-desc">
                                    <div class="desc-text">${this.escapeHtml(entry.description || '')}</div>
                                    <div class="desc-meta">
                                        ${entry.payment_method} 
                                        ${entry.tax_relevant ? '• <span class="tax-tag">Steuer</span>' : ''}
                                    </div>
                                </td>
                                <td class="cell-status">
                                    <span class="status-indicator status-${entry.status}">${entry.status === 'paid' ? 'Bezahlt' : entry.status === 'open' ? 'Offen' : 'Teilweise'}</span>
                                </td>
                                <td class="cell-amount text-right ${entry.type === 'income' ? 'positive' : 'negative'}">
                                    ${entry.type === 'income' ? '+' : entry.type === 'expense' ? '-' : ''}${this.formatCurrency(entry.amount)}
                                </td>
                                <td class="cell-actions text-right">
                                    <button class="btn-icon" onclick="event.stopPropagation(); Finances.openEntryModal(null, '${entry.id}')" title="Eintrag bearbeiten">
                                        <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                                    </button>
                                    <button class="btn-icon" onclick="event.stopPropagation(); Finances.duplicateEntry('${entry.id}')" title="Eintrag kopieren">
                                        <i data-lucide="copy-plus" style="width: 14px; height: 14px;"></i>
                                    </button>
                                    <button class="btn-icon btn-danger" onclick="event.stopPropagation(); Finances.confirmDelete('${entry.id}')" title="Eintrag löschen">
                                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        if (window.lucide) lucide.createIcons();
    },

    getUserName(userId) {
        if (!userId) return 'System';
        const user = this.userCache[userId];
        if (!user) return 'Unbekannt';
        return UI.getUserDisplayName(user);
    },

    getFilteredEntries() {
        const type = document.getElementById(`financeFilterType_${this.currentContext}`)?.value || 'all';
        const status = document.getElementById(`financeFilterStatus_${this.currentContext}`)?.value || 'all';
        const search = (document.getElementById(`financeSearch_${this.currentContext}`)?.value || '').toLowerCase();

        return this.entries.filter(entry => {
            if (type !== 'all' && entry.type !== type) return false;
            if (status !== 'all' && entry.status !== status) return false;
            if (search) {
                const desc = (entry.description || '').toLowerCase();
                const cat = (entry.category || '').toLowerCase();
                if (!desc.includes(search) && !cat.includes(search)) return false;
            }
            return true;
        });
    },

    filterChanged() {
        this.renderList();
    },

    // CRUD Logic
    async openEntryModal(type = 'income', editId = null) {
        window.isFinanceDirty = false;
        const modal = document.getElementById('financeEntryModal');
        const form = document.getElementById('financeEntryForm');
        const title = document.getElementById('financeModalTitle');
        
        form.reset();
        this.splitItems = [];
        document.getElementById('financeEntryId').value = editId || '';
        document.getElementById('financeSplitSection').style.display = 'none';
        document.getElementById('receiptPreview').style.display = 'none';
        
        // Add change listeners for dirty check
        form.oninput = () => { window.isFinanceDirty = true; };

        // Categories are static, no need to load them

        if (editId) {
            title.textContent = 'Eintrag bearbeiten';
            const entry = this.entries.find(e => e.id === editId);
            if (entry) {
                document.getElementById('financeType').value = entry.type;
                document.getElementById('financeAmount').value = entry.amount;
                document.getElementById('financeDate').value = entry.date;
                document.getElementById('financeDescription').value = entry.description || '';
                document.getElementById('financeCategory').value = entry.category;
                document.getElementById('financePaymentMethod').value = entry.payment_method;
                document.getElementById('financeStatus').value = entry.status;
                document.getElementById('financeTaxRelevant').checked = entry.tax_relevant;
                
                if (entry.finance_split_items && entry.finance_split_items.length > 0) {
                    this.splitItems = [...entry.finance_split_items];
                    this.renderSplitUI();
                    document.getElementById('financeSplitSection').style.display = 'block';
                }
            }
        } else {
            title.textContent = 'Neuer Eintrag';
            document.getElementById('financeType').value = type;
            document.getElementById('financeDate').value = new Date().toISOString().split('T')[0];
        }

        this.handleTypeChange();
        UI.openModal('financeEntryModal');
    },

    handleTypeChange() {
        const type = document.getElementById('financeType').value;
        const categorySelect = document.getElementById('financeCategory');
        const paymentSelect = document.getElementById('financePaymentMethod');
        const splitSection = document.getElementById('financeSplitSection');

        // Populate Categories
        const cats = this.categories[type] || this.categories.expense;
        categorySelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

        // Populate Payment Methods
        paymentSelect.innerHTML = this.paymentMethods.map(p => `<option value="${p}">${p}</option>`).join('');

        // Show split section only for Band and if not transfer
        if (this.currentContext === 'band' && type !== 'transfer') {
            splitSection.style.display = 'block';
        } else {
            splitSection.style.display = 'none';
        }
    },

    async addSplitItem() {
        if (this.currentContext !== 'band' || !this.currentBandId) return;
        
        this.splitItems.push({ person_id: '', amount: 0 });
        this.renderSplitUI();
        window.isFinanceDirty = true;
    },

    async renderSplitUI() {
        const container = document.getElementById('splitItemsContainer');
        if (!container) return;
        
        const members = await Storage.getBandMembers(this.currentBandId);
        const userPromises = members.map(m => Storage.getById('users', m.userId));
        const users = await Promise.all(userPromises);
        
        container.innerHTML = this.splitItems.map((item, index) => `
            <div class="split-item-row animated-fade-in">
                <div class="form-group" style="margin-bottom: 0;">
                    <select onchange="Finances.updateSplitItem(${index}, 'person_id', this.value)" required>
                        <option value="">Mitglied wählen...</option>
                        ${users.map(u => `<option value="${u.id}" ${item.person_id === u.id ? 'selected' : ''}>${UI.getUserDisplayName(u)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <input type="number" step="0.01" value="${item.amount || ''}" placeholder="0,00 €" oninput="Finances.updateSplitItem(${index}, 'amount', this.value)">
                </div>
                <button type="button" class="btn-icon btn-danger" onclick="Finances.removeSplitItem(${index})" title="Entfernen">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `).join('');
        
        if (window.lucide) lucide.createIcons();
        this.updateSplitSummary();
    },

    updateSplitItem(index, field, value) {
        if (this.splitItems[index]) {
            this.splitItems[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
            this.updateSplitSummary();
            window.isFinanceDirty = true;
        }
    },

    removeSplitItem(index) {
        this.splitItems.splice(index, 1);
        this.renderSplitUI();
        window.isFinanceDirty = true;
    },
    updateSplitSummary() {
        const summary = document.getElementById('splitSummary');
        const totalAmount = parseFloat(document.getElementById('financeAmount').value) || 0;
        const splitTotal = this.splitItems.reduce((sum, item) => sum + (item.amount || 0), 0);
        
        if (!summary) return;

        if (splitTotal > 0) {
            const diff = (totalAmount - splitTotal).toFixed(2);
            if (diff == 0) {
                summary.innerHTML = `<span class="positive">Gesamtbetrag vollständig aufgeteilt.</span>`;
            } else if (diff > 0) {
                summary.innerHTML = `<span class="warning">Noch ${this.formatCurrency(diff)} offen.</span>`;
            } else {
                summary.innerHTML = `<span class="negative">Aufteilung übersteigt Gesamtbetrag um ${this.formatCurrency(Math.abs(diff))}.</span>`;
            }
        } else {
            summary.innerHTML = '';
        }
    },

    handleReceiptSelect(input) {
        if (input.files && input.files[0]) {
            this.receiptFile = input.files[0];
            const preview = document.getElementById('receiptPreview');
            if (preview) {
                preview.style.display = 'block';
                preview.innerHTML = `<div class="preview-item"><span>📄 ${this.receiptFile.name}</span></div>`;
            }
        }
    },

    async uploadReceipt(entryId) {
        if (!this.receiptFile) return null;

        const file = this.receiptFile;
        const fileExt = file.name.split('.').pop();
        const fileName = `${entryId}_${Date.now()}.${fileExt}`;
        const filePath = `${this.currentContext === 'band' ? 'bands/' + this.currentBandId : 'private'}/${fileName}`;

        const { data, error } = await SupabaseClient.client
            .storage
            .from('bandmate-assets')
            .upload(filePath, file);

        if (error) {
            if (error.message.includes('bucket not found')) {
                Logger.warn('[Finances] Bucket bandmate-assets not found');
            }
            throw error;
        }

        const { data: urlData } = SupabaseClient.client
            .storage
            .from('bandmate-assets')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    },

    async saveEntry() {
        const id = document.getElementById('financeEntryId').value;
        const type = document.getElementById('financeType').value;
        const amount = parseFloat(document.getElementById('financeAmount').value);
        const date = document.getElementById('financeDate').value;
        const category = document.getElementById('financeCategory').value;
        const description = document.getElementById('financeDescription').value;
        const paymentMethod = document.getElementById('financePaymentMethod').value;
        const status = document.getElementById('financeStatus').value;
        const taxRelevant = document.getElementById('financeTaxRelevant').checked;

        const user = Auth.getCurrentUser();
        
        const entryData = {
            context_type: this.currentContext,
            band_id: this.currentContext === 'band' ? this.currentBandId : null,
            user_id: user.id,
            type,
            amount: amount || 0,
            date,
            category,
            description,
            payment_method: paymentMethod,
            status,
            tax_relevant: taxRelevant,
            created_by: user.id,
            updated_at: new Date().toISOString()
        };

        try {
            UI.showLoading('Eintrag wird gespeichert...');
            
            let result;
            if (id) {
                const { data, error } = await SupabaseClient.client
                    .from('finance_entries')
                    .update(entryData)
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                result = data;
            } else {
                const { data, error } = await SupabaseClient.client
                    .from('finance_entries')
                    .insert([entryData])
                    .select()
                    .single();
                if (error) throw error;
                result = data;
            }

            // Handle Receipt Upload
            if (this.receiptFile) {
                try {
                    const receiptUrl = await this.uploadReceipt(result.id);
                    if (receiptUrl) {
                        await SupabaseClient.client
                            .from('finance_entries')
                            .update({ receipt_url: receiptUrl })
                            .eq('id', result.id);
                    }
                } catch (uploadError) {
                    Logger.error('[Finances] Receipt upload failed:', uploadError);
                    UI.showToast('Beleg-Upload fehlgeschlagen, Eintrag wurde trotzdem gespeichert.', 'warning');
                }
            }

            // Save Splits if any
            if (this.currentContext === 'band' && this.splitItems.length > 0) {
                // Delete old splits first
                await SupabaseClient.client.from('finance_split_items').delete().eq('entry_id', result.id);
                
                const splits = this.splitItems
                    .filter(s => s.person_id && s.amount > 0)
                    .map(s => ({
                        entry_id: result.id,
                        person_id: s.person_id,
                        amount: s.amount,
                        status: 'open'
                    }));
                
                if (splits.length > 0) {
                    await SupabaseClient.client.from('finance_split_items').insert(splits);
                }
            }

            window.isFinanceDirty = false;
            UI.hideLoading();
            UI.closeModal('financeEntryModal');
            UI.showToast('Eintrag gespeichert', 'success');
            await this.render(this.currentContext, this.currentBandId || user.id);
        } catch (error) {
            Logger.error('[Finances] Error saving entry:', error);
            UI.hideLoading();
            UI.showToast('Fehler beim Speichern: ' + error.message, 'error');
        }
    },

    async duplicateEntry(id) {
        const entry = this.entries.find(e => e.id === id);
        if (!entry) return;
        
        await this.openEntryModal(entry.type);
        document.getElementById('financeAmount').value = entry.amount;
        document.getElementById('financeDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('financeDescription').value = entry.description ? `${entry.description} (Kopie)` : 'Kopie';
        document.getElementById('financeCategory').value = entry.category;
        document.getElementById('financePaymentMethod').value = entry.payment_method;
        document.getElementById('financeTaxRelevant').checked = entry.tax_relevant;
        
        UI.showToast('Eintrag wurde als Kopie geladen. Bitte prüfen und speichern.', 'info');
    },

    confirmDelete(id) {
        const confirmBtn = document.getElementById('financeConfirmDeleteBtn');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                this.deleteEntry(id);
                UI.closeModal('financeDeleteModal');
            };
        }
        UI.openModal('financeDeleteModal');
    },

    async deleteEntry(id) {
        UI.showLoading('Eintrag wird gelöscht...');
        try {
            const { error } = await SupabaseClient.client
                .from('finance_entries')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            UI.showToast('Eintrag gelöscht', 'success');
            await this.render(this.currentContext, this.currentBandId || Auth.getCurrentUser().id);
        } catch (e) {
            UI.showToast('Fehler beim Löschen', 'error');
        } finally {
            UI.hideLoading();
        }
    },

     async showSettlement() {
        if (this.currentContext !== 'band') return;

        const members = await Storage.getBandMembers(this.currentBandId);
        const userPromises = members.map(m => Storage.getById('users', m.userId));
        const users = await Promise.all(userPromises);
        const userMap = users.reduce((acc, u) => ({ ...acc, [u.id]: UI.getUserDisplayName(u) }), {});

        // Calculate balances
        const balances = {};
        users.forEach(u => balances[u.id] = 0);

        this.entries.forEach(entry => {
            if (entry.finance_split_items && entry.finance_split_items.length > 0) {
                entry.finance_split_items.forEach(split => {
                    if (balances[split.person_id] !== undefined) {
                        balances[split.person_id] -= parseFloat(split.amount);
                    }
                });
            }
        });

        const container = document.getElementById(`financeList_${this.currentContext}`);
        container.innerHTML = `
            <div class="settlement-view animated-fade-in" style="padding-top: 0;">
                <div class="settlement-grid">
                    ${Object.entries(balances).map(([userId, balance]) => `
                        <div class="settlement-card ${balance >= 0 ? 'positive' : 'negative'}">
                            <span class="member-name">${userMap[userId]}</span>
                            <span class="member-balance">${this.formatCurrency(balance)}</span>
                            <span class="balance-status">${balance === 0 ? 'Ausgeglichen' : balance > 0 ? 'Bekommt Geld' : 'Schuldet Geld'}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="help-text">
                    <p>Diese Übersicht zeigt die Summe aller offenen Aufteilungen. Ein negativer Betrag bedeutet, dass das Mitglied diesen Betrag in die Bandkasse einzahlen oder anderen Mitgliedern erstatten muss.</p>
                </div>
            </div>
        `;
    },

    // UI Helpers
    formatCurrency(amount) {
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
    },

    formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    },

    previewReceipt(url) {
        const container = document.getElementById('receiptPreviewFrameContainer');
        const downloadBtn = document.getElementById('downloadReceiptBtn');
        
        if (!container) return;
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        
        // Detect if it's a PDF or Image (based on extension or Supabase URL)
        const isPdf = url.toLowerCase().includes('.pdf') || url.includes('type=pdf');
        
        if (isPdf) {
            container.innerHTML = `<iframe src="${url}" style="width: 100%; height: 100%; border: none; background: white; border-radius: 4px;"></iframe>`;
        } else {
            container.innerHTML = `
                <div class="receipt-image-wrapper">
                    <img src="${url}" alt="Beleg">
                </div>
            `;
        }
        
        downloadBtn.onclick = () => window.open(url, '_blank');
        UI.openModal('financeReceiptPreviewModal');
    },

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    },

     export(format) {
        if (this.entries.length === 0) {
            UI.showToast('Keine Daten zum Exportieren vorhanden.', 'warning');
            return;
        }

        const filteredEntries = this.getFilteredEntries();
        const filename = `Finanzen_${this.currentContext === 'band' ? 'Band' : 'Privat'}_${new Date().toISOString().split('T')[0]}`;
        
        this.showExportPreview(format, filteredEntries, filename);
    },

    showExportPreview(format, entries, filename) {
        const container = document.getElementById('financeExportPreviewContainer');
        const confirmBtn = document.getElementById('financeConfirmExportBtn');
        const title = document.getElementById('financeExportTitle');
        const kicker = document.getElementById('financeExportKicker');
        
        const contextLabel = this.currentContext === 'band' ? 'Band' : 'Privat';
        title.textContent = `${contextLabel} Finanzen`;
        kicker.textContent = `${format.toUpperCase()}-Bericht`;
        
        // Build Preview Markup
        let previewHtml = '';
        const stats = this.calculateStats();
        const dateStr = new Date().toLocaleDateString('de-DE');
        
        // Mock the Bandmate PDF header
        previewHtml = `
            <div style="font-family: 'Inter', sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px;">
                    <div>
                        <div style="color: #2954a3; font-weight: 900; letter-spacing: 0.18em; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; background: #edf4ff; padding: 5px 12px; border-radius: 999px; display: inline-block;">Finanzbericht</div>
                        <h1 style="margin: 10px 0 5px; font-size: 32px; font-weight: 800; letter-spacing: -0.03em;">${contextLabel} Finanzen</h1>
                        <p style="margin: 0; color: #64748b; font-size: 14px; font-weight: 500;">Erstellt am ${dateStr}</p>
                    </div>
                    <img src="${PDFGenerator.getRundownBrandLogoUrl()}" style="height: 45px;" alt="Bandmate">
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px;">
                    <div style="background: #f8fafc; padding: 20px; border-radius: 18px; border: 1px solid #dbe3ef;">
                        <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em;">Saldo</div>
                        <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 10px;">${this.formatCurrency(stats.balance)}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 18px; border: 1px solid #dbe3ef;">
                        <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em;">Einnahmen</div>
                        <div style="font-size: 22px; font-weight: 700; color: #10b981; margin-top: 10px;">${this.formatCurrency(stats.totalIncome)}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 18px; border: 1px solid #dbe3ef;">
                        <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em;">Ausgaben</div>
                        <div style="font-size: 22px; font-weight: 700; color: #ef4444; margin-top: 10px;">${this.formatCurrency(stats.totalExpense)}</div>
                    </div>
                </div>

                <table class="preview-table">
                    <thead>
                        <tr>
                            <th style="padding-bottom: 12px;">Datum</th>
                            <th style="padding-bottom: 12px;">Typ</th>
                            <th style="padding-bottom: 12px;">Kategorie</th>
                            <th style="padding-bottom: 12px;">Beschreibung</th>
                            <th style="padding-bottom: 12px; text-align: right;">Betrag</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map(e => `
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7;">${this.formatDate(e.date)}</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7;"><span style="font-weight: 700; font-size: 10px; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background: ${e.type === 'income' ? '#ecfdf5' : e.type === 'expense' ? '#fef2f2' : '#f5f3ff'}; color: ${e.type === 'income' ? '#065f46' : e.type === 'expense' ? '#991b1b' : '#5b21b6'}">${e.type === 'income' ? 'Einnahme' : e.type === 'expense' ? 'Ausgabe' : 'Transfer'}</span></td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7;">${e.category}</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7;">${e.description || '-'}</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: 700; color: ${e.type === 'income' ? '#10b981' : e.type === 'expense' ? '#ef4444' : '#0f172a'};">${e.type === 'expense' ? '-' : ''}${this.formatCurrency(e.amount)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div style="position: absolute; bottom: 60px; left: 60px; right: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b;">
                    <div>Erstellt mit <strong>Bandmate</strong></div>
                    <div>&copy; ${new Date().getFullYear()} Bandmate Finanzwesen</div>
                    <div>Seite 1 / 1</div>
                </div>
            </div>
        `;
        
        container.innerHTML = previewHtml;
        
        confirmBtn.onclick = () => {
            if (format === 'csv') this.exportCSV(entries, filename);
            else this.exportPDF(entries, filename);
            UI.closeModal('financeExportPreviewModal');
        };
        
        UI.openModal('financeExportPreviewModal');
    },

    exportCSV(entries, filename) {
        const headers = ['Datum', 'Typ', 'Kategorie', 'Beschreibung', 'Betrag', 'Währung', 'Status', 'Zahlungsmethode', 'Steuerrelevant'];
        const rows = entries.map(e => [
            e.date,
            e.type === 'income' ? 'Einnahme' : e.type === 'expense' ? 'Ausgabe' : 'Transfer',
            e.category,
            e.description || '',
            e.amount,
            'EUR',
            e.status === 'paid' ? 'Bezahlt' : 'Offen',
            e.payment_method,
            e.tax_relevant ? 'Ja' : 'Nein'
        ]);

        const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        UI.showToast('CSV-Export abgeschlossen', 'success');
    },

    async exportPDF(entries, filename) {
        if (typeof jsPDF === 'undefined') {
            UI.showToast('PDF-Bibliothek nicht geladen.', 'error');
            return;
        }

        UI.showLoading('PDF wird generiert...');
        
        const stats = this.calculateStats();
        const contextLabel = this.currentContext === 'band' ? 'Band' : 'Privat';
        const dateStr = new Date().toLocaleDateString('de-DE');

        // Create the markup for the PDF generator
        const bodyHtml = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px;">
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Saldo</div>
                    <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px;">${this.formatCurrency(stats.balance)}</div>
                </div>
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Einnahmen</div>
                    <div style="font-size: 16px; font-weight: 700; color: #10b981; margin-top: 4px;">${this.formatCurrency(stats.totalIncome)}</div>
                </div>
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Ausgaben</div>
                    <div style="font-size: 16px; font-weight: 700; color: #ef4444; margin-top: 4px;">${this.formatCurrency(stats.totalExpense)}</div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                    <tr style="border-bottom: 2px solid #e2e8f0;">
                        <th style="text-align: left; padding: 12px 4px; color: #64748b; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">Datum</th>
                        <th style="text-align: left; padding: 12px 4px; color: #64748b; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">Typ</th>
                        <th style="text-align: left; padding: 12px 4px; color: #64748b; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">Kategorie</th>
                        <th style="text-align: left; padding: 12px 4px; color: #64748b; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">Beschreibung</th>
                        <th style="text-align: right; padding: 12px 4px; color: #64748b; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">Betrag</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(e => `
                        <tr style="border-bottom: 1px solid #edf2f7;">
                            <td style="padding: 10px 4px;">${this.formatDate(e.date)}</td>
                            <td style="padding: 10px 4px;">
                                <span style="font-weight: 700; font-size: 8px; text-transform: uppercase; padding: 2px 5px; border-radius: 3px; background: ${e.type === 'income' ? '#ecfdf5' : e.type === 'expense' ? '#fef2f2' : '#f5f3ff'}; color: ${e.type === 'income' ? '#065f46' : e.type === 'expense' ? '#991b1b' : '#5b21b6'}">
                                    ${e.type === 'income' ? 'Einnahme' : e.type === 'expense' ? 'Ausgabe' : 'Transfer'}
                                </span>
                            </td>
                            <td style="padding: 10px 4px;">${e.category}</td>
                            <td style="padding: 10px 4px;">${e.description || '-'}</td>
                            <td style="padding: 10px 4px; text-align: right; font-weight: 700; color: ${e.type === 'income' ? '#10b981' : e.type === 'expense' ? '#ef4444' : '#0f172a'};">
                                ${e.type === 'expense' ? '-' : ''}${this.formatCurrency(e.amount)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const pageMarkup = PDFGenerator.buildRundownPDFPageMarkup({
            title: `${contextLabel} Finanzen`,
            subtitle: `Finanzbericht erstellt am ${dateStr}`,
            pageNumber: 1,
            totalPages: 1,
            eyebrowLabel: 'Finanzbericht',
            bodyHtml: bodyHtml,
            footerMeta: `Stand: ${dateStr}`
        });

        try {
            await PDFGenerator.renderMarkupToPDF({
                markup: pageMarkup,
                filename: `${filename}.pdf`,
                orientation: 'p'
            });
            UI.showToast('PDF-Export abgeschlossen', 'success');
        } catch (err) {
            Logger.error('[Finances] PDF Generation failed:', err);
            UI.showToast('Fehler bei der PDF-Generierung', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};

window.Finances = Finances;
Finances.init();
