const titleSelector = 'h1,h2,h3,h4,h5,h6,.card__title,.title';
const excluded = 'nav,footer,[role="navigation"],[role="menu"],[role="button"],button,[data-cineville-tools]';
const is18Tickets = /(^|\.)18tickets\.it$/.test(location.hostname);
const filmPath = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:films?|filme|filmer|movie)\/([^/]+)\/?$/i;
const ticketPath = /^\/film\/\d+(?:\/[a-z\d-]+)?\/?$/i;
const entries = new Map();

function slugWords(text) {
    return text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
}

function filmTitle(link) {
    const href = link.getAttribute('href')?.trim();
    if (!href || /^[?#]/.test(href) || link.closest(excluded)) return '';
    let url;
    try {
        url = new URL(href, document.baseURI);
    } catch {
        return '';
    }
    if (url.origin !== location.origin) return '';
    const match = url.pathname.match(filmPath);
    if (is18Tickets ? !ticketPath.test(url.pathname) : !match) return '';

    // A poster may wrap the heading, or the heading may wrap a text link.
    const inner = link.querySelector(titleSelector);
    const titled = inner || link.closest(titleSelector);
    if (!inner && link.querySelector('img,picture') && !titled) return '';
    const text = (inner || link).textContent.replace(/^[\uf000-\uf8ff▶▷\s]+/, '').trim();
    const title = text.replace(/\s*-\s*V\.\s*O\.$/i, '').replace(/\(ED\..*?\)/i, '').replace(/\s+/g, ' ').trim();
    if (!title || /^\d{1,2}[:.]\d{2}(?:\s|$)/.test(title) || /^sala\s+\d+$/i.test(title)) return '';
    if (titled) return title;
    if (is18Tickets) return '';
    // Plain showtime links have no heading. Require their text to identify the film.
    try {
        const slug = decodeURIComponent(match[1]);
        const titleKey = slugWords(title);
        if (!titleKey) return '';
        const withoutYear = slug.replace(/[-_](?:19|20)\d{2}$/, '');
        return [slugWords(slug), slugWords(withoutYear)].includes(titleKey) ? title : '';
    } catch {
        return '';
    }
}

function addButton(group, label, className, href) {
    const button = document.createElement(href ? 'a' : 'button');
    button.textContent = label;
    button.className = className;
    if (href) {
        button.href = href;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';
    } else {
        button.type = 'button';
    }
    group.append(button);
    return button;
}

function appendInfo(group, className, text) {
    if (!text) return;
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    group.append(span);
}

function mount(link, title) {
    const query = encodeURIComponent(title);
    const group = document.createElement('span');
    group.dataset.cinevilleTools = '';
    group.addEventListener('click', event => event.stopPropagation());
    const doubanSearch = 'https://search.douban.com/movie/subject_search?search_text=';
    const douban = addButton(group, '豆瓣', 'douban-cineville-btn', doubanSearch + query);
    const lb = addButton(group, 'LB', 'letterboxd-cineville-btn');
    lb.setAttribute('aria-label', 'Letterboxd · ' + title);
    let lbUrl = 'https://letterboxd.com/search/' + query + '/';
    lb.addEventListener('click', () => window.open(lbUrl, '_blank', 'noopener,noreferrer'));
    const imdb = addButton(group, 'IMDb', 'imdb-cineville-btn', 'https://www.imdb.com/find?q=' + query);
    link.after(group);
    chrome.runtime.sendMessage({type: 'FETCH_INFO', title}).then(info => {
        if (!info?.success || !group.isConnected) return;
        if (/^tt\d+$/.test(info.ttId)) {
            lbUrl = 'https://letterboxd.com/imdb/' + info.ttId + '/';
            imdb.href = 'https://www.imdb.com/title/' + info.ttId + '/';
            if (!info.doubanBlocked) douban.href = doubanSearch + info.ttId;
        }
        if (info.doubanLink) douban.href = info.doubanLink;
        if (info.rating && info.rating !== '无') appendInfo(douban, 'douban-rating', ' ⭐️ ' + info.rating);
        const english = info.imdbTitle || '';
        const names = [info.dbTitle];
        if (english.toLowerCase() !== (info.dbTitle || title).toLowerCase()) names.push(english);
        appendInfo(group, 'douban-cn-title', names.filter(Boolean).join(' · '));
        const details = [info.year, info.director].filter(Boolean);
        if (details.length) appendInfo(group, 'douban-extra-info', ' · ' + details.join(' · '));
    }).catch(() => {}); // Search controls also work when the worker is unavailable.
    return group;
}

function update(link) {
    const previous = entries.get(link);
    const title = link.isConnected ? filmTitle(link) : '';
    if (previous && title === previous.title && previous.group === link.nextElementSibling) return;
    if (previous) {
        previous.group.remove();
        entries.delete(link);
    }
    if (title) entries.set(link, {title, group: mount(link, title)});
}

function collect(node, links) {
    if (node.nodeType !== Node.ELEMENT_NODE || node.closest('[data-cineville-tools]')) return;
    if (node.matches('a')) links.add(node);
    node.querySelectorAll('a[href]').forEach(link => links.add(link));
}

new MutationObserver(records => {
    const links = new Set();
    for (const record of records) {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (!target || target.closest('[data-cineville-tools]')) continue;
        const owner = target.closest('a');
        if (owner) links.add(owner);
        record.addedNodes.forEach(node => collect(node, links));
        record.removedNodes.forEach(node => collect(node, links));
        // Frameworks sometimes remove the injected sibling while retaining the source link.
        if (record.previousSibling && entries.has(record.previousSibling)) links.add(record.previousSibling);
    }
    links.forEach(update);
}).observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href']});

document.querySelectorAll('a[href]').forEach(update);
