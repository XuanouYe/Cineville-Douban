chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FETCH_DOUBAN") {
        const query = encodeURIComponent(request.title);
        
        // 使用豆瓣公开的移动端 Frodo API 接口进行检索（包含了通用的公共 apiKey）
        const apiUrl = `https://frodo.douban.com/api/v2/search/movie?q=${query}&apiKey=054022eaeae0b00e0fc068c0c0a2102a`;
        
        fetch(apiUrl)
            .then(res => res.json())
            .then(data => {
                if (data.subjects && data.subjects.length > 0) {
                    const firstMatch = data.subjects[0];
                    sendResponse({ 
                        success: true,
                        rating: firstMatch.rating ? firstMatch.rating.value : "无",
                        chineseTitle: firstMatch.title
                    });
                } else {
                    sendResponse({ success: false });
                }
            })
            .catch(err => {
                console.error("Douban API fetch failed:", err);
                sendResponse({ success: false });
            });

        // 必须返回 true，告诉 Chrome 此响应是异步的
        return true; 
    }
});
