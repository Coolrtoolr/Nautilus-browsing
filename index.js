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

    // 1. Remove any existing <base> tags so they don't conflict with ours
    html = html.replace(/<base[^>]*>/gi, '');

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