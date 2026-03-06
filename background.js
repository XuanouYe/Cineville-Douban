const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function handleMovieFetch(originalTitle) {
    let imdbTitle = "", year = "", director = "", ttId = "";
    let dbTitle = "", rating = "无", doubanId = "";
    // 标记豆瓣是否遇到了验证码或 403 拦截，避免把失败结果存入缓存
    let doubanBlocked = false;

    try {
        await sleep(Math.floor(Math.random() * 500) + 100);

        // ==========================================
        // 1. IMDb Suggest -> 拿 ttId + 英文名 + 年份
        // ==========================================
        let formattedQuery = encodeURIComponent(originalTitle.toLowerCase().replace(/\s+/g, '_'));
        const firstLetter = formattedQuery.charAt(0).match(/[a-z]/) ? formattedQuery.charAt(0) : 'x';
        const imdbUrl = `https://v3.sg.media-imdb.com/suggestion/${firstLetter}/${formattedQuery}.json`;

        try {
            const imdbRes = await fetch(imdbUrl);
            if (imdbRes.ok) {
                const imdbData = await imdbRes.json();
                if (imdbData.d && imdbData.d.length > 0) {
                    // 只要第一条带 tt 前缀的有效电影
                    const validMovies = imdbData.d.filter(item => item.id && item.id.startsWith('tt'));
                    if (validMovies.length > 0) {
                        const firstMatch = validMovies[0];
                        imdbTitle = firstMatch.l || originalTitle;
                        year = firstMatch.y || "";
                        ttId = firstMatch.id;
                    }
                }
            }
        } catch (e) {
            console.error("IMDb Search 网络失败:", e);
        }

        // ==========================================
        // 2. IMDb 详情页 JSON-LD -> 精确抓取多位导演
        // ==========================================
        if (ttId) {
            await sleep(200);
            try {
                const detailRes = await fetch(`https://www.imdb.com/title/${ttId}/`);
                if (detailRes.ok) {
                    const html = await detailRes.text();
                    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
                    if (ldMatch && ldMatch[1]) {
                        const jsonData = JSON.parse(ldMatch[1]);
                        let dirs = jsonData.director;
                        if (dirs) {
                            if (!Array.isArray(dirs)) dirs = [dirs];
                            director = dirs.filter(d => d['@type'] === 'Person' && d.name).map(d => d.name).join(" / ");
                        }
                    }
                }
            } catch (e) {
                console.error("IMDb 导演详情抓取失败:", e);
            }
        }

        // ==========================================
        // 3. 豆瓣网页直接抓取 (智能识别拦截状态)
        // ==========================================
        const searchTarget = ttId || imdbTitle || originalTitle;
        const searchUrl = `https://www.douban.com/search?cat=1002&q=${encodeURIComponent(searchTarget)}`;
        
        await sleep(300);
        try {
            const searchRes = await fetch(searchUrl);
            
            // 拦截判定 1：直接返回了 403 或者是跳到了安全验证域名
            if (searchRes.url.includes("sec.douban.com") || searchRes.status === 403 || searchRes.status === 404) {
                doubanBlocked = true;
            } else if (searchRes.ok) {
                const html = await searchRes.text();
                // 拦截判定 2：网页正文里有验证码等字眼
                if (html.includes('验证码') || html.includes('异常请求')) {
                    doubanBlocked = true;
                } else {
                    const linkMatch = html.match(/url=https%3A%2F%2Fmovie\.douban\.com%2Fsubject%2F(\d+)%2F/);
                    if (linkMatch && linkMatch[1]) {
                        doubanId = linkMatch[1];
                        await sleep(200);
                        const detailRes = await fetch(`https://movie.douban.com/subject/${doubanId}/`);
                        if (detailRes.ok) {
                            const detailHtml = await detailRes.text();
                            const titleMatch = detailHtml.match(/<span property="v:itemreviewed">([^<]+)<\/span>/);
                            if (titleMatch && titleMatch[1]) dbTitle = titleMatch[1].split(' ')[0]; 
                            const ratingMatch = detailHtml.match(/<strong[^>]*property="v:average"[^>]*>([\d.]+)<\/strong>/i);
                            if (ratingMatch && ratingMatch[1]) rating = ratingMatch[1];
                        }
                    }
                }
            }
        } catch (doubanError) {
            // 网络彻底断开或者跨域阻断，都算作被拦截
            doubanBlocked = true;
        }

        let doubanLink = doubanId ? `https://movie.douban.com/subject/${doubanId}/` : "";
        
        return { 
            success: true, 
            imdbTitle, 
            year, 
            director, 
            dbTitle, 
            rating, 
            ttId, 
            doubanLink,
            doubanBlocked // 将这个状态返回，告知上层不要存入缓存
        };

    } catch (err) {
        return { success: false };
    }
}

// 接收来自前台的抓取指令并接管缓存逻辑
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FETCH_INFO") {
        // v2_cache 强制避开你之前存留的任何错误缓存数据
        const cacheKey = "v2_cache_" + request.title;
        
        // 使用回调函数而不用 promise，防止 V3 在休眠时切断通道
        chrome.storage.local.get([cacheKey], (res) => {
            if (res && res[cacheKey]) {
                // 如果找到正确的缓存数据，秒级返回
                sendResponse(res[cacheKey]);
            } else {
                handleMovieFetch(request.title).then(result => {
                    // 如果抓取成功，而且没有被豆瓣的验证码拦截，才把数据永久写进本地 Storage
                    if (result && result.success && !result.doubanBlocked) {
                        chrome.storage.local.set({ [cacheKey]: result });
                    }
                    sendResponse(result);
                }).catch(() => {
                    sendResponse({ success: false });
                });
            }
        });
        
        // 这一句极其重要，告诉 Chrome 这是一个异步响应，别过早关闭通信端口
        return true; 
    }
});
