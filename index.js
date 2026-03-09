const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "*");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No URL provided.");

    try {
        if (targetUrl.startsWith('https://https://')) {
            targetUrl = targetUrl.replace('https://https://', 'https://');
        }

        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
            responseType: 'arraybuffer', 
            maxRedirects: 5 
        });

        const finalUrl = response.request.res.responseUrl || targetUrl;
        const origin = new URL(finalUrl).origin;

        // 1. STRIP SECURITY HEADERS
        const headersToRemove = [
            'x-frame-options', 'content-security-policy', 'strict-transport-security',
            'content-security-policy-report-only', 'expect-ct', 'x-content-type-options',
            'cross-origin-opener-policy', 'cross-origin-embedder-policy'
        ];
        headersToRemove.forEach(h => delete response.headers[h]);

        // 2. THE CORS CHECK & FORCE (Set to "yes"!)
        // We ensure we ALWAYS allow the origin so the browser doesn't block us
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        const contentType = response.headers['content-type'] || '';
        res.setHeader('Content-Type', contentType);

        let rawData = response.data;

        // --- CASE A: IF IT'S HTML ---
        if (contentType.includes('text/html')) {
            let htmlStr = rawData.toString('utf8');

            // Rewrite basic attributes
            htmlStr = htmlStr.replace(/(src|href)=["'](\/[^"']+)["']/g, (match, attr, path) => {
                return `${attr}="/proxy?url=${encodeURIComponent(origin + path)}"`;
            });
            
            // Rewrite inline styles
            htmlStr = htmlStr.replace(/style=["'][^"']*url\(['"]?(\/[^'"]+)['"]?\)[^"']*["']/g, (match) => {
                return match.replace(/url\(['"]?(\/[^'"]+)['"]?\)/g, (m, p) => `url("/proxy?url=${encodeURIComponent(origin + p)}")`);
            });

            const superScript = `
            <script>
                const _p = (u) => {
                    if (!u || u.includes('/proxy?url=') || u.includes(window.location.hostname)) return u;
                    try {
                        let absoluteUrl = u.startsWith('/') && !u.startsWith('//') ? '${origin}' + u : new URL(u, window.location.href).href;
                        return window.location.origin + '/proxy?url=' + encodeURIComponent(absoluteUrl);
                    } catch(e) { return u; }
                };

                const { fetch: origFetch } = window;
                window.fetch = async (...args) => {
                    if (typeof args[0] === 'string') args[0] = _p(args[0]);
                    else if (args[0] instanceof Request) args[0] = new Request(_p(args[0].url), args[0]);
                    return origFetch(...args);
                };
                const origOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(m, u) {
                    return origOpen.apply(this, [m, _p(u), ...Array.from(arguments).slice(2)]);
                };

                document.addEventListener('click', e => {
                    const link = e.target.closest('a');
                    if (link && link.href && !link.href.includes('/proxy?url=')) {
                        e.preventDefault();
                        window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(link.href);
                    }
                }, true);

                document.addEventListener('submit', e => {
                    const form = e.target.closest('form');
                    if (form && form.action) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        const tUrl = new URL(form.action, window.location.href);
                        const params = new URLSearchParams(new FormData(form));
                        window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(tUrl.origin + tUrl.pathname + '?' + params.toString());
                    }
                }, true);

                const wrapHistory = (method) => {
                    const original = window.history[method];
                    window.history[method] = function(state, title, url) {
                        try {
                            if (url && (url.startsWith('/') || url.includes(window.location.origin))) return original.apply(this, arguments);
                        } catch (e) { console.warn('History.' + method + ' blocked'); }
                    };
                };
                wrapHistory('pushState'); wrapHistory('replaceState');
                window.location.assign = (url) => { window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(_p(url)); };
                window.location.replace = (url) => { window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(_p(url)); };

                const createOmni = () => new Proxy(() => {}, {
                    get: (t, p) => (p === 'then' ? undefined : (p in t ? t[p] : (t[p] = createOmni()))),
                    set: (t, p, v) => { t[p] = v; return true; }
                });
                window.DDG = window.DDG || createOmni();
                window.DDG_Settings = window.DDG_Settings || createOmni();
                window.next = window.next || createOmni();
            </script>`;

            htmlStr = htmlStr.replace(/<base[^>]*>/gi, '')
                             .replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '')
                             .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
            htmlStr = htmlStr.replace(/<head[^>]*>/i, `<head><base href="${origin}/">${superScript}`);
            res.send(htmlStr);

        // --- CASE B: IF IT'S CSS ---
        } else if (contentType.includes('text/css')) {
            let cssStr = rawData.toString('utf8');
            cssStr = cssStr.replace(/url\(['"]?(\/[^'"]+)['"]?\)/g, (match, p) => `url("/proxy?url=${encodeURIComponent(origin + p)}")`);
            res.send(cssStr);

        // --- CASE C: IF IT'S JAVASCRIPT (The Missing Piece!) ---
        } else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
            let jsStr = rawData.toString('utf8');
            
            // Injecting _p so that internal script requests are also proxied
            const jsHelper = `const _p = (u) => {
                if (!u || u.includes('/proxy?url=') || u.includes(window.location.hostname)) return u;
                try {
                    let absoluteUrl = u.startsWith('/') && !u.startsWith('//') ? '${origin}' + u : new URL(u, window.location.href).href;
                    return window.location.origin + '/proxy?url=' + encodeURIComponent(absoluteUrl);
                } catch(e) { return u; }
            };\n`;
            res.send(jsHelper + jsStr);

        // --- CASE D: EVERYTHING ELSE (Images, Fonts) ---
        } else {
            res.send(rawData);
        }

    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(502).send("Proxy error: " + error.message);
    }
});

app.all('*', (req, res, next) => {
    if (req.url === '/' || req.url.startsWith('/proxy')) return next();
    const fallbackUrl = 'https://duckduckgo.com' + req.url;
    res.redirect('/proxy?url=' + encodeURIComponent(fallbackUrl));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});