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

        // Delete the security headers that block iframes
        delete response.headers['x-frame-options'];
        delete response.headers['content-security-policy'];

        // 3. Set the Content-Type (The "Grabber")
        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', contentType);

        let data = response.data;

        // 4. Modify if it's HTML
        if (contentType && contentType.includes('text/html')) {
    let html = data.toString();
    const origin = new URL(targetUrl).origin;
            // Create a script that "overrides" the browser's fetch and window.location
    const helperScript = `
        <script>
            // This captures all clicks on <a> tags
            document.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (link && link.href && !link.href.includes('/proxy?url=')) {
                    e.preventDefault();
                    window.location.href = '/proxy?url=' + encodeURIComponent(link.href);
                }
            });
        </script>
    `;

    // Inject both the base tag and our helper script
    html = `<head><base href="${origin}/">${helperScript}` + html.replace('<head>', '');
    // 1. Remove any existing <base> tags so they don't conflict with ours
    html = html.replace(/<base[^>]*>/gi, '');

        if (contentType && contentType.includes('text/html')) {
    let html = data.toString();
    
    // This script intercepts "fetch" and "XMLHttpRequest" 
    // and forces them through your /proxy route
    const corsFixerScript = `
    <script>
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
    </script>`;

    // Inject everything into the top of the page
    html = `<head><base href="${origin}/">` + corsFixerScript + html.replace('<head>', '');
    
    res.send(html);
}
    // 2. Inject our base tag right after the <head> tag
    // If <head> doesn't exist, we'll just put it at the very top
    if (html.includes('<head>')) {
        html = html.replace('<head>', `<head><base href="${origin}/">`);
    } else {
        html = `<base href="${origin}/">` + html;
    }

    res.send(html);
}else {
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