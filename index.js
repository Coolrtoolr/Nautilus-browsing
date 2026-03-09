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
            responseType: 'text',
            maxRedirects: 5 
        });

        const finalUrl = response.request.res.responseUrl || targetUrl;
        const origin = new URL(finalUrl).origin;

        // 1. Clean security headers
        const headersToRemove = [
            'x-frame-options', 'content-security-policy', 'strict-transport-security',
            'content-security-policy-report-only', 'expect-ct', 'x-content-type-options',
            'cross-origin-opener-policy', 'cross-origin-embedder-policy'
        ];
        headersToRemove.forEach(h => delete response.headers[h]);

        // 2. Set permissive CORS headers for the browser
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        const contentType = response.headers['content-type'] || '';
        res.setHeader('Content-Type', contentType);

        let data = response.data.toString();

        // --- CASE A: IF IT'S HTML ---
        if (contentType.includes('text/html')) {
            const superScript = `
            <script>
                const _p = (u) => {
                    if (!u || u.includes('/proxy?url=') || u.includes(window.location.hostname)) return u;
                    try {
                        let absoluteUrl = u.startsWith('/') && !u.startsWith('//') ? '${origin}' + u : new URL(u, window.location.href).href;
                        return window.location.origin + '/proxy?url=' + encodeURIComponent(absoluteUrl);
                    } catch(e) { return u; }
                };

                // Fetch & XHR Interceptors
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

                // Hijackers
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

                // Omni-Shim (The "Yes Man")
                const createOmni = () => new Proxy(() => {}, {
                    get: (t, p) => (p === 'then' ? undefined : (p in t ? t[p] : (t[p] = createOmni()))),
                    set: (t, p, v) => { t[p] = v; return true; }
                });
                window.DDG = window.DDG || createOmni();
                window.DDG_Settings = window.DDG_Settings || createOmni();
                window.next = window.next || createOmni();
            </script>`;

            data = data.replace(/<base[^>]*>/gi, '')
                       .replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '')
                       .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
            
            data = data.replace(/<head[^>]*>/i, `<head><base href="${origin}/">${superScript}`);
            res.send(data);

        // --- CASE B: IF IT'S CSS ---
        } else if (contentType.includes('text/css')) {
            // Rewrite font URLs so they go through our proxy
            const css = data.replace(/url\(['"]?(\/[^'"]+)['"]?\)/g, (match, p1) => {
                return `url("/proxy?url=${encodeURIComponent(origin + p1)}")`;
            });
            res.send(css);

        // --- CASE C: EVERYTHING ELSE (Images, JS, etc.) ---
        } else {
            res.send(response.data);
        }

    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(502).send("Proxy error: " + error.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});