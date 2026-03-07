const express = require('express');
const path = require('path');
const axios = require('axios'); // 1. Add this!
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Add the Proxy Route here!
app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No URL provided.");

    try {
        // 1. Safety Check (Cleaning the URL)
        if (targetUrl.startsWith('https://https://')) {
            targetUrl = targetUrl.replace('https://https://', 'https://');
        }

        // 2. Fetch the external site
        // 2. Fetch the external site
        const response = await axios.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
        responseType: 'arraybuffer',
        maxRedirects: 5 // Ensure we follow those "www" jumps
        });

        // Get the actual URL we landed on (handles the "www" issue!)
        const finalUrl = response.request.res.responseUrl || targetUrl;
        const origin = new URL(finalUrl).origin;
        const headersToRemove = ['x-frame-options', 'content-security-policy', 'strict-transport-security',
            'content-security-policy-report-only','expect-ct','x-content-type-options','cross-origin-opener-policy', 
            'cross-origin-embedder-policy'
        ];// Delete EVERY known header that can block an iframe

        // Delete the security headers that block iframes
        delete response.headers[headersToRemove];
        // Inside your app.get('/proxy'...)

headersToRemove.forEach(h => delete response.headers[h]);
        // 3. Set the Content-Type (The "Grabber")
        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', contentType);

        let data = response.data;

        // 4. Modify if it's HTML
        if (contentType && contentType.includes('text/html')) {
    let html = data.toString();

    // 1. Define the Super Script (Combines both your helper and CORS fixer)
    const superScript = `
        <script>
        // Construct the full URL with the search terms
        const url = new URL(form.action, window.location.href);
        const formData = new FormData(form);
        const params = new URLSearchParams(formData);
            // PART A: The CORS / Fetch Fixer
            const _p = (u) => {
                if (!u || u.startsWith(window.location.origin) || u.startsWith('/proxy')) return u;
                try {
                    const full = new URL(u, window.location.href).href;
                    return '/proxy?url=' + encodeURIComponent(full);
                } catch(e) { return u; }
            };
            const { fetch: origFetch } = window;
            window.fetch = async (...args) => {
                args[0] = typeof args[0] === 'string' ? _p(args[0]) : args[0];
                return origFetch(...args);
            };
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(m, u) {
                return origOpen.apply(this, [m, _p(u), ...Array.from(arguments).slice(2)]);
            };

            // PART B: The Click Hijacker
            document.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (link && link.href && !link.href.includes('/proxy?url=')) {
                    e.preventDefault();
                    window.location.href = '/proxy?url=' + encodeURIComponent(link.href);
                }
            });
            // PART C: The Form Hijacker
document.addEventListener('submit', e => {
    const form = e.target.closest('form');
    if (form && form.action && !form.action.includes('/proxy?url=')) {
        e.preventDefault(); // Stop the browser from leaving the page
        
        // Inside your submit event listener
const proxyBase = window.location.origin + '/proxy?url=';
const target = url.origin + url.pathname + '?' + params.toString();

window.location.href = proxyBase + encodeURIComponent(target);
        
        // Redirect the IFRAME to the proxied search results
        window.location.href = '/proxy?url=' + encodeURIComponent(url.origin + url.pathname + '?' + params.toString());
    }
});
        </script>
    `;

    // 2. Clean up: Remove any existing <base> tags
    html = html.replace(/<base[^>]*>/gi, '');
    
    // 2.5 Scrub security meta tags from the HTML string
    html = html.replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '');
    html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '<!-- scrubbed -->');
    
    // 3. Inject: Put our <base> and <script> right at the top of <head>
    const injection = `<head><base href="${origin}/">${superScript}`;
    html = html.replace(/<head[^>]*>/i, injection);

    // 4. Send the final result ONCE
    res.send(html);

} else {
    // If it's not HTML (like an image or JS file), just send the raw data
    res.send(data);
}
    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(502).send("Proxy error: " + error.message);
    }
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});