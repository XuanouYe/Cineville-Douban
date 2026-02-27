// 核心注入函数
function addDoubanLinks() {
    // 寻找所有 href 包含 /films/ 的超链接，并排除单纯的导航栏 /films 链接
    const movieLinks = Array.from(document.querySelectorAll('a[href*="/films/"]')).filter(a => {
        return a.getAttribute('href').match(/\/films\/.+/);
    });
    
    movieLinks.forEach(link => {
        // 防止重复注入
        if (link.dataset.doubanInjected) return;
        
        const movieTitle = link.innerText.trim();
        if (!movieTitle) return;

        // 标记该元素已处理
        link.dataset.doubanInjected = "true";
        
        // 清理片名（有时可能包含换行或其他时间标记）
        const cleanTitle = movieTitle.split('\n')[0].trim();

        // 1. 创建基础的豆瓣跳转按钮
        const doubanBtn = document.createElement('a');
        doubanBtn.href = `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(cleanTitle)}`;
        doubanBtn.target = "_blank";
        doubanBtn.className = "douban-cineville-btn";
        doubanBtn.innerText = "豆瓣";
        doubanBtn.title = `在豆瓣中搜索: ${cleanTitle}`;
        
        // 将按钮插入到电影链接的后面
        link.parentNode.appendChild(doubanBtn);
        
        // 2. 发送消息给后台，尝试静默获取中文名和评分
        chrome.runtime.sendMessage({ type: "FETCH_DOUBAN", title: cleanTitle }, (response) => {
            if (response && response.success) {
                // 如果成功抓取，显示评分
                if (response.rating && response.rating !== "无") {
                    const ratingSpan = document.createElement('span');
                    ratingSpan.className = "douban-rating";
                    ratingSpan.innerText = ` ⭐️ ${response.rating}`;
                    doubanBtn.appendChild(ratingSpan);
                }
                
                // 如果成功抓取，且中文片名和原名不同，则在旁边显示中文名
                if (response.chineseTitle && !cleanTitle.includes(response.chineseTitle)) {
                    const cnTitleSpan = document.createElement('span');
                    cnTitleSpan.className = "douban-cn-title";
                    cnTitleSpan.innerText = ` （${response.chineseTitle}）`;
                    link.parentNode.appendChild(cnTitleSpan);
                }
            }
        });
    });
}

// 由于 Cineville 是动态加载的 SPA，使用 MutationObserver 监控 DOM 变化
const observer = new MutationObserver((mutations) => {
    // 页面节点变化时重新执行寻找和注入
    addDoubanLinks();
});

// 监听 body 的子节点变化
observer.observe(document.body, { childList: true, subtree: true });

// 初始执行一次
addDoubanLinks();
