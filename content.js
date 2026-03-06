function addLinks() {
    const possibleSelectors = [
        'a[href*="/films/"]:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)', 
        'a[href*="/filme/"]:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)', 
        'a[href*="/filmer/"]:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)', 
        'a[href*="/film/"]:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)',
        'a[href*="/movie/"]:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)',
        '.agenda-item h3 a:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)', 
        '.card__title a:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)',
        '.film-card h3 a:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)',
        'h3.title a:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)',
        'h2.title a:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)'
    ].join(', ');

    const safeLinks = document.querySelectorAll(possibleSelectors);
    
    safeLinks.forEach(link => {
        // 二次防御：如果你本身就是我生成的按钮，跳过
        if (link.classList.contains('douban-cineville-btn') || link.classList.contains('letterboxd-cineville-btn')) return;
        
        // 防重复注入标签
        if (link.dataset.injected === "true") return;
        
        // 意大利网站常常前面有乱七八糟的播放图标和空格，清洗掉
        let movieTitle = link.innerText.trim().replace(/^[\uf000-\uf8ff\u25b6\u25b7\s]+/, '');
        if (!movieTitle) return;

        // 屏蔽掉包含图片的链接（海报封面等）
        if (link.querySelector('img') || link.querySelector('svg')) return;

        // 【通用防误伤】排片表里时间段或者影厅名称不能送去搜索
        if (/^\d{2}:\d{2}/.test(movieTitle) || movieTitle.toLowerCase().includes('sala')) return;

        // 清洗纯净片名用于搜索
        const cleanTitle = movieTitle.split('\n')[0].replace(/\s*-\s*V\.\s*O\.$/i, '').replace(/\(ED\..*?\)/i, '').trim();

        // 屏蔽查看全部排片的无用导航按钮
        if (cleanTitle.toLowerCase().includes('programmazione') || cleanTitle.toLowerCase().includes('completa')) return;

        // --------------------------------------------------------
        // 隔离策略：根据网站结构决定严格还是宽松的标题判定
        // --------------------------------------------------------
        const is18Tickets = window.location.href.includes('18tickets.it');
        
        if (is18Tickets) {
            // 针对 18tickets：必须严格在 h1~h6 标签内或者是 title 类，防误伤纯文字介绍
            const parentTag = link.parentElement ? link.parentElement.tagName.toLowerCase() : '';
            const isHeadingParent = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(parentTag);
            const hasHeadingChild = link.querySelector('h1, h2, h3, h4, h5, h6') !== null;
            const hasTitleClass = link.classList.contains('title') || (link.parentElement && link.parentElement.classList.contains('title'));
            
            if (!isHeadingParent && !hasHeadingChild && !hasTitleClass) return;
        } else {
            // 针对 Cineville 站点：只要我们在电影排期或首页就放行（因为它们的 DOM 很随机）
            const isAgendaPage = window.location.href.match(/filmagenda|horaires|programm|showtimes|films|filmer|se/i) || 
                                 window.location.pathname === '/' || window.location.pathname === '/sv-SE/';
            if (!isAgendaPage) return;
        }

        // 加锁，彻底防止 SPA 重复执行死循环
        link.dataset.injected = "true";

        // 生成豆瓣按钮 (带片名兜底)
        const doubanBtn = document.createElement('a');
        doubanBtn.href = `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(cleanTitle)}`;
        doubanBtn.target = "_blank";
        doubanBtn.className = "douban-cineville-btn";
        doubanBtn.innerText = "豆瓣";
        doubanBtn.addEventListener('click', (e) => e.stopPropagation());

        // 生成 Letterboxd 按钮
        const letterboxdBtn = document.createElement('a');
        letterboxdBtn.href = `https://letterboxd.com/search/${encodeURIComponent(cleanTitle)}/`;
        letterboxdBtn.target = "_blank";
        letterboxdBtn.className = "letterboxd-cineville-btn";
        letterboxdBtn.innerText = "LB";
        letterboxdBtn.addEventListener('click', (e) => e.stopPropagation());

        // 生成 IMDb 按钮 (带片名兜底)
        const imdbBtn = document.createElement('a');
        imdbBtn.href = `https://www.imdb.com/find?q=${encodeURIComponent(cleanTitle)}`;
        imdbBtn.target = "_blank";
        imdbBtn.className = "letterboxd-cineville-btn"; 
        imdbBtn.style.backgroundColor = "#f5c518"; 
        imdbBtn.style.color = "#000000";
        imdbBtn.style.marginLeft = "4px"; 
        imdbBtn.innerText = "IMDb";
        imdbBtn.addEventListener('click', (e) => e.stopPropagation());

        // 为了意大利站的美观加个微小的间距
        doubanBtn.style.marginLeft = "8px";
        link.parentNode.appendChild(doubanBtn);
        link.parentNode.appendChild(letterboxdBtn);
        link.parentNode.appendChild(imdbBtn);
        
        // --------------------------------------------------------
        // Manifest V3 标准通信 + 动态替换链接
        // --------------------------------------------------------
        (async () => {
            try {
                const response = await chrome.runtime.sendMessage({ type: "FETCH_INFO", title: cleanTitle });
                if (!response || !response.success) return;

                // 回填：如果有准确的关联信息，替换为直达详情页
                if (response.doubanLink) {
                    doubanBtn.href = response.doubanLink;
                } else if (response.ttId && !response.doubanBlocked) {
                    // 如果有豆瓣阻断标记，就不替换成 ttId，保持片名兜底
                    doubanBtn.href = `https://search.douban.com/movie/subject_search?search_text=${response.ttId}`;
                }

                if (response.ttId) {
                    imdbBtn.href = `https://www.imdb.com/title/${response.ttId}/`;
                }

                // 渲染：如果有评分就打出星星
                if (response.rating && response.rating !== "无") {
                    const ratingSpan = document.createElement('span');
                    ratingSpan.className = "douban-rating";
                    ratingSpan.innerText = ` ⭐️ ${response.rating}`;
                    doubanBtn.appendChild(ratingSpan);
                }

                // 渲染：中英文混排标题
                const titleSpan = document.createElement('span');
                titleSpan.className = "douban-cn-title";
                
                let displayName = "";
                if (response.dbTitle) {
                    displayName = response.imdbTitle && (response.imdbTitle.toLowerCase() !== response.dbTitle.toLowerCase()) 
                                  ? `${response.dbTitle} · ${response.imdbTitle}` 
                                  : `${response.dbTitle}`;
                } else if (response.imdbTitle && response.imdbTitle.toLowerCase() !== cleanTitle.toLowerCase()) {
                    displayName = `${response.imdbTitle}`;
                }
                
                if (displayName) {
                    titleSpan.innerText = displayName;
                    link.parentNode.appendChild(titleSpan);
                }

                // 渲染：年份和导演
                let extraInfo = [];
                if (response.year) extraInfo.push(response.year);
                if (response.director) extraInfo.push(response.director);

                if (extraInfo.length > 0) {
                    const extraSpan = document.createElement('span');
                    extraSpan.className = "douban-extra-info";
                    extraSpan.innerText = ` · ${extraInfo.join(" · ")}`;
                    link.parentNode.appendChild(extraSpan);
                }
            } catch (error) {
                // 如果插件刚刚重启，静默忽略这个孤儿请求
            }
        })();
    });
}

// -------------------------------------------------------------
// 高频防漏：单页应用 (SPA) 动态追踪器
// -------------------------------------------------------------
let debounceTimer = null;
const observer = new MutationObserver((mutations) => {
    const hasAddedNodes = mutations.some(mutation => mutation.addedNodes.length > 0);
    if (hasAddedNodes) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            addLinks();
        }, 300);
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// SPA 兜底：每两秒自动扫描一次，保证切换语言或日期后功能绝不失效
setInterval(addLinks, 2000);
setTimeout(addLinks, 500);
