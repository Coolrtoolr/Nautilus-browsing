const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// This tells the server to serve files from the current directory
app.use(express.static(__dirname));

// This ensures that when someone visits your site, they see the index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});