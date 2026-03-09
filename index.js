const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    try {
        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer' // Keep data raw/binary
        });

        // 1. Pass the Content-Type header from DuckDuckGo to our user
        res.setHeader('Content-Type', response.headers['content-type']);
        
        // 2. Send the raw data as-is
        res.send(response.data);

    } catch (error) {
        res.status(500).send("Error fetching resource");
    }
});

/*app.all('*', (req, res, next) => {
    if (req.url === '/' || req.url.startsWith('/proxy')) return next();
    const fallbackUrl = 'https://duckduckgo.com' + req.url;
    res.redirect('/proxy?url=' + encodeURIComponent(fallbackUrl));
});*/

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});