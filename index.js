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
        headers: { 'User-Agent': 'Mozilla/5.0...' }
    });

    let html = response.data;

    // This creates a URL object to get the 'origin' (e.g., https://www.google.com)
    const origin = new URL(targetUrl).origin;

    // Inject the <base> tag right after the opening <head> tag
    html = html.replace('<head>', `<head><base href="${origin}/">`);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
} catch (error) {
    res.status(500).send("Error fetching the site.");
}
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});