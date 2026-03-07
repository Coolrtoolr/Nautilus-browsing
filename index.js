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
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0...' },
            responseType: 'arraybuffer' 
        });

        // 3. Set the Content-Type (The "Grabber")
        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', contentType);

        let data = response.data;

        // 4. Modify if it's HTML
        if (contentType && contentType.includes('text/html')) {
    let html = data.toString();
    const origin = new URL(targetUrl).origin;

    // 1. Force the base tag at the very top
    html = `<base href="${origin}/">` + html;

    // 2. Hijack all relative Links and Images
    // This finds src="/..." or href="/..." and turns them into absolute proxy links
    html = html.replace(/(href|src|action)=["']([^"']+)["']/g, (match, attr, path) => {
    // 1. If it's already a proxy link, don't double-wrap it
    if (path.includes('/proxy?url=')) return match;
    
    // 2. Build the target URL
    let absoluteUrl;
    try {
        // This handles both "/search" and "https://google.com/search"
        absoluteUrl = new URL(path, origin).href;
    } catch (e) {
        return match; // If it's not a valid link (like "javascript:void(0)"), leave it alone
    }

    // 3. Wrap it in our proxy
    return `${attr}="/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
});

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