const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bot = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

io.on('connection', (socket) => {
    console.log('Client connected');

    // Send current status on connection
    socket.emit('status', bot.getStatus());

    socket.on('start', (config) => {
        console.log('Starting bot with config:', config);
        bot.start(
            config,
            (log) => io.emit('log', log),
            (status) => io.emit('status', status)
        );
    });

    socket.on('stop', () => {
        console.log('Stopping bot');
        bot.stop(
            (status) => io.emit('status', status),
            (log) => io.emit('log', log)
        );
    });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    await bot.stop();
    process.exit();
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
