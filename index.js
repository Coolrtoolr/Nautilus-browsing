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
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send("No URL provided.");
    }

try {
    const response = await axios.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0...' },
        responseType: 'arraybuffer' 
    });

    const contentType = response.headers['content-type'];
    res.setHeader('Content-Type', contentType);

    let data = response.data;

    // Only rewrite if we are dealing with a web page (HTML)
    if (contentType && contentType.includes('text/html')) {
        let html = data.toString();
        const origin = new URL(targetUrl).origin;

        // 1. Inject the <base> tag to help with images/styles
        html = html.replace('<head>', `<head><base href="${origin}/">`);

        // 2. Hijack the search forms! 
        // This looks for 'action="/' and changes it to 'action="/proxy?url=https://site.com/'
        html = html.replace(/action="\//g, `action="/proxy?url=${origin}/`);

        res.send(html);
    } else {
        // If it's an image, script, or CSS, send the raw bytes
        res.send(data);
    }
} catch (error) {
    res.status(500).send("Proxy error: " + error.message);
}
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});