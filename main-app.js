/**
 * KGI Life Pure Case Query Tool
 * A modular bookmarklet application for querying case data.
 */
const KgiQueryTool = (function() {
    'use strict';

    /**
     * @module Config
     * @description Centralized configuration for the application.
     */
    const Config = {
        APP_ID: 'kgilife-query-tool-container',
        API_URLS: {
            UAT: 'https://euisv-uat.apps.tocp4.kgilife.com.tw/euisw/euisb/api/caseQuery/query',
            PROD: 'https://euisv.apps.ocp4.kgilife.com.tw/euisw/euisb/api/caseQuery/query',
        },
        STORAGE_KEYS: {
            TOKEN: 'euisToken',
            ENV: 'kqt_environment',
        },
        QUERY_FIELDS: [
            { key: 'receiptNumber', label: '送金單號碼' },
            { key: 'applyNumber', label: '受理號碼' },
            { key: 'policyNumber', label: '保單號碼' },
            { key: 'approvalNumber', label: '確認書編號' },
            { key: 'insuredId', label: '被保人ID' },
        ],
        DISPLAY_HEADERS: ['序號', '查詢值', '受理號碼', '保單號碼', '確認書編號', '送金單', '被保人ＩＤ', '狀態', '分公司', '核保員', '覆核', '查詢結果'],
        FIELD_NAMES_MAP: {
            NO: '序號',
            _queriedValue_: '查詢值',
            _apiQueryStatus: '查詢結果',
            applyNumber: '受理號碼',
            policyNumber: '保單號碼',
            approvalNumber: '確認書編號',
            receiptNumber: '送金單',
            insuredId: '被保人ＩＤ',
            statusCombined: '狀態',
            uwApproverUnit: '分公司',
            uwApprover: '核保員',
            approvalUser: '覆核',
        },
        RETRY_COUNT: 3,
        API_DELAY_MS: 300,
    };

    /**
     * @module State
     * @description Manages the application's state.
     */
    const State = {
        apiToken: null,
        currentEnv: 'UAT',
        queryResults: [],
        isLoading: false,
        sort: { key: 'NO', direction: 'asc' },
        drag: { dragging: false, x: 0, y: 0, initialX: 0, initialY: 0 },
    };

    /**
     * @module Utils
     * @description General helper functions.
     */
    const Utils = {
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        escapeHtml: (unsafe) => unsafe === null || unsafe === undefined ? '' : String(unsafe).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),
    };

    /**
     * @module UI
     * @description Handles all DOM creation and manipulation.
     */
    const UI = {
        elements: {},
        
        init() {
            this.createMainContainer();
            this.bindCoreEventListeners();
            this.updateStatusBar();
        },

        createMainContainer() {
            if (document.getElementById(Config.APP_ID)) return;
            const container = document.createElement('div');
            container.id = Config.APP_ID;
            
            container.innerHTML = `
                <div class="kqt-header">
                    <span class="kqt-header-title">案件批次查詢工具</span>
                    <button class="kqt-close-btn">&times;</button>
                </div>
                <div class="kqt-main-content">
                    <div class="kqt-toolbar">
                        <button class="kqt-button" data-action="query">批次查詢</button>
                        <div class="kqt-toolbar-separator"></div>
                        <button class="kqt-button secondary" data-action="copy">複製表格</button>
                        <button class="kqt-button secondary" data-action="export-excel">下載 Excel</button>
                        <button class="kqt-button secondary" data-action="settings">⚙️ 設定</button>
                        <div class="kqt-status-bar"></div>
                    </div>
                    <div class="kqt-table-wrapper">
                        <table class="kqt-table">
                            <thead></thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            `;
            document.body.appendChild(container);
            this.elements.container = container;
            this.elements.header = container.querySelector('.kqt-header');
            this.elements.closeBtn = container.querySelector('.kqt-close-btn');
            this.elements.toolbar = container.querySelector('.kqt-toolbar');
            this.elements.tableWrapper = container.querySelector('.kqt-table-wrapper');
            this.elements.tableHead = container.querySelector('.kqt-table thead');
            this.elements.tableBody = container.querySelector('.kqt-table tbody');
            this.elements.statusBar = container.querySelector('.kqt-status-bar');
        },

        bindCoreEventListeners() {
            this.elements.header.addEventListener('mousedown', Controller.handleDragStart);
            this.elements.closeBtn.addEventListener('click', () => this.elements.container.style.display = 'none');
            this.elements.toolbar.addEventListener('click', Controller.handleToolbarClick);
            this.elements.tableHead.addEventListener('click', Controller.handleSort);
        },
        
        renderTable() {
            // Header
            this.elements.tableHead.innerHTML = '';
            const headerRow = document.createElement('tr');
            Config.DISPLAY_HEADERS.forEach(headerText => {
                const key = Object.keys(Config.FIELD_NAMES_MAP).find(k => Config.FIELD_NAMES_MAP[k] === headerText);
                const th = document.createElement('th');
                th.textContent = headerText;
                if(key) th.dataset.sortKey = key;

                if (key === State.sort.key) {
                    const indicator = State.sort.direction === 'asc' ? ' ▲' : ' ▼';
                    th.innerHTML += `<span class="sort-indicator">${indicator}</span>`;
                }
                headerRow.appendChild(th);
            });
            this.elements.tableHead.appendChild(headerRow);

            // Body
            this.elements.tableBody.innerHTML = '';
            State.queryResults.forEach(item => {
                const row = document.createElement('tr');
                Config.DISPLAY_HEADERS.forEach(headerText => {
                    const key = Object.keys(Config.FIELD_NAMES_MAP).find(k => Config.FIELD_NAMES_MAP[k] === headerText);
                    const td = document.createElement('td');
                    td.textContent = item[key] !== undefined ? item[key] : '';
                    row.appendChild(td);
                });
                this.elements.tableBody.appendChild(row);
            });
        },

        updateStatusBar(text = '準備就緒') {
            const envText = `環境: ${State.currentEnv}`;
            this.elements.statusBar.textContent = `${text} | ${envText}`;
        },

        showNotification(message, type = 'info', duration = 3000) {
            const notification = document.createElement('div');
            notification.className = `kqt-notification ${type}`;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => notification.classList.add('show'), 50);
            setTimeout(() => {
                notification.classList.remove('show');
                notification.addEventListener('transitionend', () => notification.remove());
            }, duration);
        },

        createDialog({ title, bodyHTML, footerHTML, onOpen }) {
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.className = 'kqt-dialog-overlay';
                
                overlay.innerHTML = `
                    <div class="kqt-dialog">
                        <h3 class="kqt-dialog-title">${title}</h3>
                        <div class="kqt-dialog-body">${bodyHTML}</div>
                        <div class="kqt-dialog-footer">${footerHTML}</div>
                    </div>
                `;
                
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        overlay.remove();
                        resolve({ action: 'close' });
                    }
                });
                
                document.body.appendChild(overlay);
                if (onOpen) onOpen(overlay);

                overlay.querySelector('.kqt-dialog-footer').addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON') {
                        const action = e.target.dataset.action;
                        const dialogBody = overlay.querySelector('.kqt-dialog-body');
                        overlay.remove();
                        resolve({ action, body: dialogBody });
                    }
                });
            });
        },
        
        toggleLoading(isLoading) {
            State.isLoading = isLoading;
            const buttons = this.elements.toolbar.querySelectorAll('button');
            buttons.forEach(btn => btn.disabled = isLoading);
            this.updateStatusBar(isLoading ? '查詢中...' : `${State.queryResults.length} 筆結果`);
        }
    };
    
    /**
     * @module API
     * @description Handles API interactions.
     */
    const API = {
        async query(params) {
            const url = Config.API_URLS[State.currentEnv];
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${State.apiToken}`
                },
                body: JSON.stringify({ currentPage: 1, pageSize: 50, ...params })
            });

            if (!response.ok) {
                throw new Error(`API 請求失敗: ${response.status}`);
            }
            return response.json();
        },

        async batchQuery(items, queryKey) {
            const results = [];
            let counter = 1;
            for (const itemValue of items) {
                let success = false;
                let retries = Config.RETRY_COUNT;
                let recordData = {};

                while(retries > 0 && !success) {
                    try {
                        const response = await this.query({ [queryKey]: itemValue });
                        if (response.records && response.records.length > 0) {
                            recordData = { ...response.records[0], _apiQueryStatus: '成功' };
                        } else {
                            recordData = { _apiQueryStatus: '查無資料' };
                        }
                        success = true;
                    } catch (error) {
                        console.error(`查詢 ${itemValue} 失敗`, error);
                        retries--;
                        if (retries === 0) {
                             recordData = { _apiQueryStatus: `查詢失敗 (${error.message})` };
                        } else {
                            await Utils.sleep(Config.API_DELAY_MS * 2); // Longer sleep on error
                        }
                    }
                }
                
                results.push({
                    ...recordData,
                    NO: counter++,
                    _queriedValue_: itemValue
                });
                
                await Utils.sleep(Config.API_DELAY_MS);
            }
            return results;
        },
    };

    /**
     * @module Controller
     * @description Main application controller.
     */
    const Controller = {
        init() {
            State.apiToken = localStorage.getItem(Config.STORAGE_KEYS.TOKEN);
            if (!State.apiToken) {
                alert('找不到登入憑證 (euisToken)，請先登入目標系統。');
                return;
            }
            State.currentEnv = localStorage.getItem(Config.STORAGE_KEYS.ENV) || 'UAT';
            UI.init();
            UI.showNotification(`工具已載入`, 'info');
        },

        handleDragStart(e) {
            if (e.target !== UI.elements.header && e.target !== UI.elements.header.querySelector('.kqt-header-title')) return;
            e.preventDefault();
            State.drag.dragging = true;
            State.drag.initialX = e.clientX - UI.elements.container.offsetLeft;
            State.drag.initialY = e.clientY - UI.elements.container.offsetTop;
            document.addEventListener('mousemove', Controller.handleDragMove);
            document.addEventListener('mouseup', Controller.handleDragEnd);
        },

        handleDragMove(e) {
            if (!State.drag.dragging) return;
            e.preventDefault();
            const newX = e.clientX - State.drag.initialX;
            const newY = e.clientY - State.drag.initialY;
            UI.elements.container.style.left = `${newX}px`;
            UI.elements.container.style.top = `${newY}px`;
        },

        handleDragEnd() {
            State.drag.dragging = false;
            document.removeEventListener('mousemove', Controller.handleDragMove);
            document.removeEventListener('mouseup', Controller.handleDragEnd);
        },

        async handleToolbarClick(e) {
            if (e.target.tagName !== 'BUTTON') return;
            const action = e.target.dataset.action;
            if (State.isLoading && action !== 'settings') return;

            switch (action) {
                case 'query': await this.handleQuery(); break;
                case 'copy': this.handleCopy(); break;
                case 'export-excel': await this.handleExportExcel(); break;
                case 'settings': await this.handleSettings(); break;
            }
        },
        
        async handleQuery() {
            const queryFieldsHTML = Config.QUERY_FIELDS.map((field, index) => `
                <label>
                    <input type="radio" name="queryField" value="${field.key}" ${index === 0 ? 'checked' : ''}>
                    ${field.label}
                </label>
            `).join('');

            const result = await UI.createDialog({
                title: '批次查詢',
                bodyHTML: `
                    <p>請選擇查詢欄位，並在下方貼上單號 (每筆一行或用逗號分隔)</p>
                    <div>${queryFieldsHTML}</div>
                    <textarea id="kqt-query-input" rows="10"></textarea>
                `,
                footerHTML: `
                    <button class="kqt-button secondary" data-action="cancel">取消</button>
                    <button class="kqt-button" data-action="ok">開始查詢</button>
                `,
                onOpen: (dialog) => dialog.querySelector('textarea').focus()
            });
            
            if (result.action !== 'ok') return;
            
            const queryKey = result.body.querySelector('input[name="queryField"]:checked').value;
            const inputValues = result.body.querySelector('#kqt-query-input').value;
            const items = inputValues.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

            if (items.length === 0) {
                UI.showNotification('未輸入任何查詢值', 'error');
                return;
            }

            UI.toggleLoading(true);
            State.queryResults = await API.batchQuery(items, queryKey);
            State.sort = { key: 'NO', direction: 'asc' }; // Reset sort
            UI.renderTable();
            UI.toggleLoading(false);
        },
        
        handleCopy() {
            if (State.queryResults.length === 0) return UI.showNotification('沒有資料可複製', 'error');
            const headers = Config.DISPLAY_HEADERS.join('\t');
            const rows = State.queryResults.map(item =>
                Config.DISPLAY_HEADERS.map(headerText => {
                    const key = Object.keys(Config.FIELD_NAMES_MAP).find(k => Config.FIELD_NAMES_MAP[k] === headerText);
                    return item[key] !== undefined ? String(item[key]).replace(/\s/g, ' ') : '';
                }).join('\t')
            ).join('\n');

            navigator.clipboard.writeText(`${headers}\n${rows}`).then(() => {
                UI.showNotification('已成功複製到剪貼簿', 'success');
            }).catch(() => {
                UI.showNotification('複製失敗', 'error');
            });
        },
        
        async handleExportExcel() {
            if (State.queryResults.length === 0) return UI.showNotification('沒有資料可匯出', 'error');
            
            // Dynamically load SheetJS
            if (typeof XLSX === 'undefined') {
                UI.showNotification('正在載入 Excel 函式庫...', 'info');
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.body.appendChild(script);
                }).catch(() => {
                    UI.showNotification('Excel 函式庫載入失敗', 'error');
                    return;
                });
            }
            
            const dataToExport = State.queryResults.map(item => {
                const row = {};
                Config.DISPLAY_HEADERS.forEach(headerText => {
                    const key = Object.keys(Config.FIELD_NAMES_MAP).find(k => Config.FIELD_NAMES_MAP[k] === headerText);
                    row[headerText] = item[key];
                });
                return row;
            });
            
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "查詢結果");
            XLSX.writeFile(workbook, `案件查詢結果_${new Date().toISOString().slice(0, 10)}.xlsx`);
        },
        
        async handleSettings() {
            const result = await UI.createDialog({
                title: '設定',
                bodyHTML: `
                    <label for="kqt-env-select">API 環境</label>
                    <select id="kqt-env-select">
                        <option value="UAT" ${State.currentEnv === 'UAT' ? 'selected' : ''}>測試環境 (UAT)</option>
                        <option value="PROD" ${State.currentEnv === 'PROD' ? 'selected' : ''}>正式環境 (PROD)</option>
                    </select>
                `,
                footerHTML: `
                    <button class="kqt-button secondary" data-action="cancel">取消</button>
                    <button class="kqt-button" data-action="save">儲存</button>
                `
            });

            if (result.action !== 'save') return;
            
            State.currentEnv = result.body.querySelector('#kqt-env-select').value;
            localStorage.setItem(Config.STORAGE_KEYS.ENV, State.currentEnv);
            UI.updateStatusBar();
            UI.showNotification('設定已儲存', 'success');
        },
        
        handleSort(e) {
            const th = e.target.closest('th');
            if (!th || !th.dataset.sortKey) return;
            
            const key = th.dataset.sortKey;
            let direction = 'asc';
            if (State.sort.key === key && State.sort.direction === 'asc') {
                direction = 'desc';
            }
            
            State.sort = { key, direction };
            
            State.queryResults.sort((a, b) => {
                const valA = a[key];
                const valB = b[key];

                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
            });

            UI.renderTable();
        }
    };

    return {
        init: Controller.init,
    };
})();

// Assign to window for the loader to find it and initialize
window.KgiQueryTool = KgiQueryTool;
