javascript:(function() {
    const APP_ID = 'kgilife-query-tool-container';
    const SCRIPT_ID = 'kgilife-query-tool-script';
    const STYLE_ID = 'kgilife-query-tool-style';

    /* --- 設定區 --- */
    // 請將下方兩個 URL 換成您自己託管檔案的真實 URL
    const SCRIPT_URL = '在此貼上您 main-app.js 的 URL';
    const STYLE_URL = '在此貼上您 styles.css 的 URL';
    /* --- 設定區結束 --- */
    
    // 如果工具UI已存在，則顯示/隱藏它，而不是重新載入
    const existingApp = document.getElementById(APP_ID);
    if (existingApp) {
        existingApp.style.display = existingApp.style.display === 'none' ? 'flex' : 'none';
        return;
    }

    // 避免重複注入 Script 和 Style
    if (document.getElementById(SCRIPT_ID)) return;

    // 使用時間戳記作為快取清除器，方便開發時更新
    const cacheBuster = '?v=' + new Date().getTime();

    // 注入 CSS
    const style = document.createElement('link');
    style.id = STYLE_ID;
    style.rel = 'stylesheet';
    style.type = 'text/css';
    style.href = STYLE_URL + cacheBuster;
    document.head.appendChild(style);
    
    // 注入 JavaScript
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL + cacheBuster;
    script.onload = () => {
        // 載入成功後，可以呼叫 App 的初始化方法
        if (window.KgiQueryTool && typeof window.KgiQueryTool.init === 'function') {
            window.KgiQueryTool.init();
        }
    };
    script.onerror = () => {
        alert('工具主程式載入失敗，請檢查 URL 或網路連線。');
        // 載入失敗時移除殘留的 CSS
        const styleElement = document.getElementById(STYLE_ID);
        if (styleElement) styleElement.remove();
    };
    document.body.appendChild(script);
})();
