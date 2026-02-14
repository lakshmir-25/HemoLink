const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const db = new sqlite3.Database('./hemolink.db', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            bloodGroup TEXT,
            phone TEXT UNIQUE,
            password TEXT,
            city TEXT,
            gender TEXT,
            age INTEGER,
            isDonor INTEGER,
            available INTEGER
        )`);
    }
});

// Socket.io
let connectedUsers = {}; // Map socket ID to user ID or info

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('register_user', (userId) => {
        connectedUsers[userId] = socket.id;
        console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove from connectedUsers if necessary
        for (let userId in connectedUsers) {
            if (connectedUsers[userId] === socket.id) {
                delete connectedUsers[userId];
                break;
            }
        }
    });
});

// Routes

// Register
app.post('/api/register', (req, res) => {
    const { name, bloodGroup, phone, password, city, gender, age, isDonor, available } = req.body;
    const stmt = db.prepare('INSERT INTO users (name, bloodGroup, phone, password, city, gender, age, isDonor, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(name, bloodGroup, phone, password, city, gender, age, isDonor ? 1 : 0, available ? 1 : 0, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Phone number already registered.' });
            }
            return res.status(500).json({ error: 'Database error.' });
        }
        res.json({ id: this.lastID, success: true });
    });
    stmt.finalize();
});

// Login
app.post('/api/login', (req, res) => {
    const { phone, password } = req.body;
    db.get('SELECT * FROM users WHERE phone = ? AND password = ?', [phone, password], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error.' });
        }
        if (row) {
            res.json({ success: true, user: row });
        } else {
            res.status(401).json({ error: 'Invalid credentials.' });
        }
    });
});

// Search Donors
app.get('/api/donors', (req, res) => {
    const { bloodGroup, city } = req.query;
    let query = 'SELECT * FROM users WHERE isDonor = 1 AND available = 1';
    let params = [];

    if (bloodGroup) {
        query += ' AND bloodGroup = ?';
        params.push(bloodGroup);
    }
    if (city) {
        query += ' AND city LIKE ?';
        params.push(`%${city}%`);
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error.' });
        }
        res.json(rows);
    });
});

// Request (Broadcast)
app.post('/api/request', (req, res) => {
    const { requesterId, donorIds } = req.body;
    
    // In a real app, you might look up requester info details
    // For now, we assume frontend sends necessary info or we just send a generic alert
    
    // Broadcast to specific donors if they are online
    // In this simple prototype, we might try to find them in `connectedUsers`
    // Since we don't have a robust auth token system to map socket to user ID strictly effectively in this snippet without more client logic,
    // we will rely on client sending their user ID on connection.

    // Currently `donorIds` is an array of IDs to notify.
    let notifiedCount = 0;
    donorIds.forEach(donorId => {
        const socketId = connectedUsers[donorId];
        if (socketId) {
            io.to(socketId).emit('notification', {
                message: 'URGENT: Someone in your area needs blood! Please check your dashboard.',
                requesterId: requesterId
            });
            notifiedCount++;
        }
    });

    res.json({ success: true, notified: notifiedCount });
});


server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
