function addLinks() {
    // 采用广泛的选择器覆盖多国语言变体，并通过 :not() 严格剔除自己注入的按钮，防止死循环
    const possibleSelectors = [
        'a[href*="/films/"]:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)', 
        'a[href*="/filme/"]:not(.douban-cineville-btn):not(.letterboxd-cineville-btn)', 
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
        // 二重防御：如果抓到的还是我们自己创建的按钮，直接跳过
        if (link.classList.contains('douban-cineville-btn') || link.classList.contains('letterboxd-cineville-btn')) {
            return;
        }

        // 如果该节点已经被注入过信息，跳过
        if (link.dataset.injected === "true") return;
        
        const movieTitle = link.innerText.trim();
        if (!movieTitle) return;

        // 屏蔽掉包裹着图片(如海报封面)的纯链接
        if (link.querySelector('img') || link.querySelector('svg')) return;
        
        // 判断它是不是排片表里的标题，避免污染顶部导航栏等无辜区域
        const parentTag = link.parentElement ? link.parentElement.tagName.toLowerCase() : '';
        const isHeading = ['h1', 'h2', 'h3', 'h4', 'h5'].includes(parentTag);
        const hasTitleClass = link.classList.contains('title') || (link.parentElement && link.parentElement.classList.contains('title'));
        const isAgendaPage = window.location.href.match(/filmagenda|horaires|programm|showtimes|films/i);
        
        if (!isHeading && !hasTitleClass && !isAgendaPage) return;

        // 立即锁住该节点，彻底防止重复执行
        link.dataset.injected = "true";
        
        // 过滤掉原网页中的换行或者多余标签，只取第一行文字
        const cleanTitle = movieTitle.split('\n')[0].trim();

        // 1. 豆瓣按钮 (默认片名搜索兜底)
        const doubanBtn = document.createElement('a');
        doubanBtn.href = `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(cleanTitle)}`;
        doubanBtn.target = "_blank";
        doubanBtn.className = "douban-cineville-btn";
        doubanBtn.innerText = "豆瓣";
        doubanBtn.addEventListener('click', (e) => e.stopPropagation());

        // 2. Letterboxd 按钮 (保留片名搜索)
        const letterboxdBtn = document.createElement('a');
        letterboxdBtn.href = `https://letterboxd.com/search/${encodeURIComponent(cleanTitle)}/`;
        letterboxdBtn.target = "_blank";
        letterboxdBtn.className = "letterboxd-cineville-btn";
        letterboxdBtn.innerText = "LB";
        letterboxdBtn.addEventListener('click', (e) => e.stopPropagation());

        // 3. IMDb 按钮 (默认片名搜索兜底)
        const imdbBtn = document.createElement('a');
        imdbBtn.href = `https://www.imdb.com/find?q=${encodeURIComponent(cleanTitle)}`;
        imdbBtn.target = "_blank";
        imdbBtn.className = "letterboxd-cineville-btn"; 
        imdbBtn.style.backgroundColor = "#f5c518"; 
        imdbBtn.style.color = "#000000";
        imdbBtn.style.marginLeft = "4px"; 
        imdbBtn.innerText = "IMDb";
        imdbBtn.addEventListener('click', (e) => e.stopPropagation());

        // 先注入基础按钮
        link.parentNode.appendChild(doubanBtn);
        link.parentNode.appendChild(letterboxdBtn);
        link.parentNode.appendChild(imdbBtn);
        
        // -------------------------------------------------------------
        // 使用 Manifest V3 async/await 方式通信，等待后台爬取完毕
        // -------------------------------------------------------------
        (async () => {
            try {
                const response = await chrome.runtime.sendMessage({ type: "FETCH_INFO", title: cleanTitle });
                
                if (!response || !response.success) return;

                // 🌟 核心优化：动态替换按钮链接 🌟
                if (response.doubanLink) {
                    // 如果找到了明确的豆瓣主页，直接跳过去
                    doubanBtn.href = response.doubanLink;
                } else if (response.ttId) {
                    // 如果没找到主页，但有 ttId，改用 ttId 搜豆瓣
                    doubanBtn.href = `https://search.douban.com/movie/subject_search?search_text=${response.ttId}`;
                }

                if (response.ttId) {
                    // 将 IMDb 按钮从模糊搜索替换为直达详情页
                    imdbBtn.href = `https://www.imdb.com/title/${response.ttId}/`;
                }

                // 回填：豆瓣评分
                if (response.rating && response.rating !== "无") {
                    const ratingSpan = document.createElement('span');
                    ratingSpan.className = "douban-rating";
                    ratingSpan.innerText = ` ⭐️ ${response.rating}`;
                    doubanBtn.appendChild(ratingSpan);
                }

                // 回填：中文名 · 英文名
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

                // 回填：年份 · 导演
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
                // 通信断开时忽略
            }
        })();
    });
}

// -------------------------------------------------------------
// 页面动态变化监听：适配单页应用 (React/Vue)
// -------------------------------------------------------------
let debounceTimer = null;
const observer = new MutationObserver((mutations) => {
    // 只要有节点被添加进 DOM 树
    const hasAddedNodes = mutations.some(mutation => mutation.addedNodes.length > 0);
    
    if (hasAddedNodes) {
        if (debounceTimer) clearTimeout(debounceTimer);
        // 防抖：等 300 毫秒页面安分下来后再批量执行
        debounceTimer = setTimeout(() => {
            addLinks();
        }, 300);
    }
});

// 监听整个 body 元素的变动
observer.observe(document.body, { childList: true, subtree: true });

// 兜底法：每隔两秒检查一次页面是否有新卡片，保证 SPA 页面切换语言或日期后绝对生效
setInterval(addLinks, 2000);

// 初次打开网页时立刻执行一次
setTimeout(addLinks, 500);
