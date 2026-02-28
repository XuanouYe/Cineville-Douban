const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function handleMovieFetch(originalTitle) {
    let imdbTitle = "", year = "", director = "", ttId = "";
    let dbTitle = "", rating = "无", doubanId = "";

    try {
        // 轻微错开并发，防止瞬间挤爆网络请求
        await sleep(Math.floor(Math.random() * 500) + 100);

        // ==========================================
        // 1. IMDb Suggest -> 拿 ttId + 英文名 + 年份
        // ==========================================
        let formattedQuery = encodeURIComponent(originalTitle.toLowerCase().replace(/\s+/g, '_'));
        const firstLetter = formattedQuery.charAt(0).match(/[a-z]/) ? formattedQuery.charAt(0) : 'x';
        const imdbUrl = `https://v3.sg.media-imdb.com/suggestion/${firstLetter}/${formattedQuery}.json`;

        const imdbRes = await fetch(imdbUrl);
        if (imdbRes.ok) {
            const imdbData = await imdbRes.json();
            if (imdbData.d && imdbData.d.length > 0) {
                const validMovies = imdbData.d.filter(item => item.id && item.id.startsWith('tt'));
                if (validMovies.length > 0) {
                    const firstMatch = validMovies[0];
                    imdbTitle = firstMatch.l || originalTitle;
                    year = firstMatch.y || "";
                    ttId = firstMatch.id;
                }
            }
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
                            director = dirs
                                .filter(d => d['@type'] === 'Person' && d.name)
                                .map(d => d.name)
                                .join(" / ");
                        }
                    }
                }
            } catch (e) {
                console.error("IMDb 导演抓取失败", e);
            }
        }

        // ==========================================
        // 3. 豆瓣网页直接抓取 (绕过 API 拦截)
        // ==========================================
        const searchTarget = ttId || imdbTitle || originalTitle;
        const searchUrl = `https://www.douban.com/search?cat=1002&q=${encodeURIComponent(searchTarget)}`;
        
        await sleep(300);
        const searchRes = await fetch(searchUrl);
        if (searchRes.ok) {
            const html = await searchRes.text();
            // 匹配搜到的第一个条目 ID
            const linkMatch = html.match(/url=https%3A%2F%2Fmovie\.douban\.com%2Fsubject%2F(\d+)%2F/);
            
            if (linkMatch && linkMatch[1]) {
                doubanId = linkMatch[1];
                await sleep(200);
                const detailRes = await fetch(`https://movie.douban.com/subject/${doubanId}/`);
                if (detailRes.ok) {
                    const detailHtml = await detailRes.text();
                    
                    // 抓取纯中文名
                    const titleMatch = detailHtml.match(/<span property="v:itemreviewed">([^<]+)<\/span>/);
                    if (titleMatch && titleMatch[1]) {
                        dbTitle = titleMatch[1].split(' ')[0]; 
                    }
                    
                    // 抓取评分
                    const ratingMatch = detailHtml.match(/<strong[^>]*property="v:average"[^>]*>([\d.]+)<\/strong>/i);
                    if (ratingMatch && ratingMatch[1]) {
                        rating = ratingMatch[1];
                    }
                }
            }
        }

        // 整理直达链接
        let doubanLink = doubanId ? `https://movie.douban.com/subject/${doubanId}/` : "";

        return { 
            success: true, 
            imdbTitle, 
            year, 
            director, 
            dbTitle, 
            rating,
            ttId,
            doubanLink
        };

    } catch (err) {
        return { success: false };
    }
}

// 接收来自前台的抓取指令
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FETCH_INFO") {
        // 执行异步任务后返回结果
        handleMovieFetch(request.title).then(result => {
            sendResponse(result);
        }).catch(() => {
            sendResponse({ success: false });
        });
        
        // 必须返回 true 以表明存在异步响应，防止端口过早关闭
        return true; 
    }
});
