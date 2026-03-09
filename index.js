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
            responseType: 'arraybuffer', // FETCH AS RAW BINARY DATA!
            maxRedirects: 5 
        });

        const finalUrl = response.request.res.responseUrl || targetUrl;
        const origin = new URL(finalUrl).origin;

        const headersToRemove = [
            'x-frame-options', 'content-security-policy', 'strict-transport-security',
            'content-security-policy-report-only', 'expect-ct', 'x-content-type-options',
            'cross-origin-opener-policy', 'cross-origin-embedder-policy'
        ];
        headersToRemove.forEach(h => delete response.headers[h]);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        const contentType = response.headers['content-type'] || '';
        res.setHeader('Content-Type', contentType);

        let rawData = response.data; // Keep it as raw binary for now

        // --- CASE A: IF IT'S HTML ---
        if (contentType.includes('text/html')) {
            let htmlStr = rawData.toString('utf8'); // Convert binary to string safely

            htmlStr = htmlStr.replace(/(src|href)=["'](\/[^"']+)["']/g, (match, attribute, path) => {
                return `${attribute}="/proxy?url=${encodeURIComponent(origin + path)}"`;
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

                // PART D: Soft Security Neutralizer (PUT BACK!)
                const wrapHistory = (method) => {
                    const original = window.history[method];
                    window.history[method] = function(state, title, url) {
                        try {
                            if (url && (url.startsWith('/') || url.includes(window.location.origin))) return original.apply(this, arguments);
                        } catch (e) { console.warn('History.' + method + ' blocked to prevent crash'); }
                    };
                };
                wrapHistory('pushState');
                wrapHistory('replaceState');
                window.location.assign = function(url) { window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(_p(url)); };
                window.location.replace = function(url) { window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(_p(url)); };

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
            cssStr = cssStr.replace(/url\(['"]?(\/[^'"]+)['"]?\)/g, (match, p1) => {
                return `url("/proxy?url=${encodeURIComponent(origin + p1)}")`;
            });
            res.send(cssStr);

        // --- CASE C: EVERYTHING ELSE (Images, Fonts, JS) ---
        } else {
            // Because we used 'arraybuffer', images and fonts will send perfectly!
            res.send(rawData);
        }

    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(502).send("Proxy error: " + error.message);
    }
});

// SAFETY NET (PUT BACK!)
app.all('*', (req, res, next) => {
    if (req.url === '/' || req.url.startsWith('/proxy')) return next();
    const fallbackUrl = 'https://duckduckgo.com' + req.url;
    res.redirect('/proxy?url=' + encodeURIComponent(fallbackUrl));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});