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

        // Clean headers before setting them
        const headersToRemove = [
            'x-frame-options', 'content-security-policy', 'strict-transport-security',
            'content-security-policy-report-only', 'expect-ct', 'x-content-type-options',
            'cross-origin-opener-policy', 'cross-origin-embedder-policy'
        ];
        headersToRemove.forEach(h => delete response.headers[h]);

        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', contentType);

        if (contentType && contentType.includes('text/html')) {
            let html = response.data.toString();
            // Automatically proxy any URL found inside quotes (covers fonts and background images)
            html = html.replace(/url\(['"]?(\/[^'"]+)['"]?\)/g, (match, p1) => {
                return `url("${window.location.origin}/proxy?url=${encodeURIComponent(origin + p1)}")`;
            });

            const superScript = `
        <script>
            // PART A: The CORS / Fetch Fixer
            const _p = (u) => {
                if (!u) return u;
                if (u.includes('/proxy?url=') || u.includes('nautilus-browsing.onrender.com')) return u;

                try {
                    let absoluteUrl = u;
                    if (u.startsWith('/') && !u.startsWith('//')) {
                        absoluteUrl = '${origin}' + u; 
                    } else {
                        absoluteUrl = new URL(u, window.location.href).href;
                    }
                    return window.location.origin + '/proxy?url=' + encodeURIComponent(absoluteUrl);
                } catch(e) { 
                    return u; 
                }
            };

            const { fetch: origFetch } = window;
window.fetch = async (...args) => {
    if (typeof args[0] === 'string') {
        args[0] = _p(args[0]);
    } else if (args[0] instanceof Request) {
        // We have to create a NEW request because the URL property is read-only
        const newUrl = _p(args[0].url);
        args[0] = new Request(newUrl, args[0]);
    }
    return origFetch(...args);
};

            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(m, u) {
                return origOpen.apply(this, [m, _p(u), ...Array.from(arguments).slice(2)]);
            };

            // PART B: The Upgraded Click Hijacker
            document.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (link && link.href && !link.href.includes('/proxy?url=')) {
                    e.preventDefault();
                    window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(link.href);
                }
            });

                        // PART C: The Aggressive Form Hijacker
            // We use 'true' at the end to "Capture" the event before DDG's scripts can cancel it
            document.addEventListener('submit', e => {
                const form = e.target.closest('form');
                if (form && form.action) {
                    e.preventDefault();
                    e.stopImmediatePropagation(); // Tell other scripts to back off
                    
                    const tUrl = new URL(form.action, window.location.href); 
                    const formData = new FormData(form);
                    const params = new URLSearchParams(formData);
                    
                    // Ensure we are sending the search to OUR proxy
                    const finalSearchUrl = tUrl.origin + tUrl.pathname + '?' + params.toString();
                    window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(finalSearchUrl);
                }
            }, true);

            // PART D: Soft Security Neutralizer
            const wrapHistory = (method) => {
                const original = window.history[method];
                window.history[method] = function(state, title, url) {
                    try {
                        if (url && (url.startsWith('/') || url.includes(window.location.origin))) {
                            return original.apply(this, arguments);
                        }
                    } catch (e) {
                        console.warn('History.' + method + ' blocked to prevent crash');
                    }
                };
            };
            wrapHistory('pushState');
            wrapHistory('replaceState');

            window.location.assign = function(url) {
                window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(_p(url));
            };
            window.location.replace = function(url) {
                window.location.href = window.location.origin + '/proxy?url=' + encodeURIComponent(_p(url));
            };

                        // PART E: The Crash Shim
            // This prevents "syncWithLegacyHistory" from breaking the page
            window.DDG = window.DDG || {};
            window.DDG.Pages = window.DDG.Pages || {};
            window.DDG.Pages.SERP = window.DDG.Pages.SERP || { 
                ready: function() { console.log("DDG Shim: SERP Ready caught"); },
                syncWithLegacyHistory: function() { return true; }
            };
        </script>
    `;

            html = html.replace(/<base[^>]*>/gi, '');
            html = html.replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '');
            html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
            
            const injection = `<head><base href="${origin}/">${superScript}`;
            html = html.replace(/<head[^>]*>/i, injection);

            // Inside your app.get('/proxy'...) 
// Right before res.send(html) or res.send(response.data)

res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', '*');

            res.send(html);
        } else {
            res.send(response.data);
        }
    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(502).send("Proxy error: " + error.message);
    }
});

// The "Safety Net" for relative paths
app.all('*', (req, res, next) => {
    // If the request isn't for / or /proxy, and it's not a static file...
    if (req.url === '/' || req.url.startsWith('/proxy')) return next();
    
    // Redirect it to our proxy!
    const fallbackUrl = 'https://duckduckgo.com' + req.url;
    console.log("Redirecting missed request:", fallbackUrl);
    res.redirect('/proxy?url=' + encodeURIComponent(fallbackUrl));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});