// Socket.io initialization (only if client library is loaded)
let socket;
if (typeof io !== 'undefined') {
    socket = io();
}

// Helper to get current user
const getCurrentUser = () => {
    const userStr = localStorage.getItem('hemoUser');
    return userStr ? JSON.parse(userStr) : null;
};

// Check auth on protected pages
const path = window.location.pathname;
if (path.includes('home.html') || path.includes('search.html')) {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
    } else {
        // Connect socket with user ID
        if (socket) {
            socket.emit('register_user', user.id);

            // Listen for notifications
            socket.on('notification', (data) => {
                showNotification(data.message);
            });
        }

        // Update UI logic for Home
        if (path.includes('home.html')) {
            document.getElementById('userName').innerText = user.name;
            document.getElementById('userBloodGroup').innerText = user.bloodGroup;

            document.getElementById('logoutBtn').addEventListener('click', () => {
                localStorage.removeItem('hemoUser');
                window.location.href = 'index.html';
            });
        }
    }
}

// Notification UI
function showNotification(message) {
    const area = document.getElementById('notificationArea') || document.body;
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.innerText = message;
    area.appendChild(notif);

    // Play sound (optional, browser policy dependent)
    // const audio = new Audio('notification.mp3');
    // audio.play().catch(e => console.log('Audio play failed', e));

    setTimeout(() => {
        notif.remove();
    }, 5000);
}


// Login Logic
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('phone').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('hemoUser', JSON.stringify(data.user));
                window.location.href = 'home.html';
            } else {
                alert(data.error || 'Login failed');
            }
        } catch (err) {
            console.error(err);
            alert('Error connecting to server');
        }
    });
}

// Register Logic
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const isDonor = document.getElementById('isDonor').checked;
        const body = {
            name: document.getElementById('name').value,
            bloodGroup: document.getElementById('bloodGroup').value,
            phone: document.getElementById('phone').value,
            password: document.getElementById('password').value,
            city: document.getElementById('city').value,
            gender: document.getElementById('gender').value,
            age: document.getElementById('age').value,
            isDonor: isDonor,
            available: isDonor // Default available if donor
        };

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                alert('Registration successful! Please login.');
                window.location.href = 'index.html';
            } else {
                alert(data.error || 'Registration failed');
            }
        } catch (err) {
            console.error(err);
            alert('Error connecting to server');
        }
    });
}

// Search Logic
async function searchDonors() {
    const bloodGroup = document.getElementById('searchBloodGroup').value;
    const city = document.getElementById('searchCity').value;
    const resultsList = document.getElementById('resultsList');

    // Basic client-side validation
    if (!bloodGroup && !city) {
        alert('Please select at least one filter.');
        return;
    }

    resultsList.innerHTML = '<p>Searching...</p>';

    try {
        const query = new URLSearchParams({ bloodGroup, city }).toString();
        const res = await fetch(`/api/donors?${query}`);
        const donors = await res.json();

        resultsList.innerHTML = '';
        if (donors.length === 0) {
            resultsList.innerHTML = '<p>No donors found matching criteria.</p>';
            return;
        }

        donors.forEach(donor => {
            const div = document.createElement('div');
            div.className = 'donor-item';
            div.innerHTML = `
                <div class="donor-info">
                    <strong>${donor.name}</strong> (${donor.bloodGroup})<br>
                    <small>${donor.city}</small>
                </div>
                <div>
                   <button onclick="requestDonor(${donor.id})" style="width: auto; padding: 8px 15px; font-size: 0.8rem;">Request</button>
                </div>
            `;
            resultsList.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        resultsList.innerHTML = '<p>Error searching donors.</p>';
    }
}

// Request Donor Logic
async function requestDonor(donorId) {
    const user = getCurrentUser();
    if (!user) return;

    if (!confirm('Send an urgent blood request notification to this donor?')) return;

    try {
        const res = await fetch('/api/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requesterId: user.id,
                donorIds: [donorId]
            })
        });
        const data = await res.json();
        if (data.success) {
            alert('Request sent successfully!');
        } else {
            alert('Failed to send request.');
        }
    } catch (err) {
        console.error(err);
        alert('Error sending request.');
    }
}

// Profile Logic
async function loadProfile() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    try {
        // Fetch fresh data
        const res = await fetch(`/api/user/${user.id}`);
        const data = await res.json();

        if (data.error) {
            alert('Error loading profile');
            return;
        }

        document.getElementById('pName').innerText = data.name;
        document.getElementById('pBlood').innerText = data.bloodGroup;
        document.getElementById('pPhone').innerText = data.phone;
        document.getElementById('pCity').innerText = data.city;

        if (data.isDonor) {
            const container = document.getElementById('availabilityContainer');
            const checkbox = document.getElementById('pAvailability');

            container.style.display = 'flex';
            checkbox.checked = !!data.available;

            // Add change listener
            checkbox.addEventListener('change', async (e) => {
                const newStatus = e.target.checked;
                updateAvailability(user.id, newStatus);
            });
        }

    } catch (err) {
        console.error(err);
    }
}

async function updateAvailability(userId, isAvailable) {
    const msg = document.getElementById('statusMsg');
    msg.innerText = 'Updating...';

    try {
        const res = await fetch('/api/user/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, available: isAvailable })
        });
        const data = await res.json();

        if (data.success) {
            msg.innerText = isAvailable ? 'You are now AVAILABLE for donations.' : 'You are currently UNAVAILABLE.';
            msg.style.color = isAvailable ? '#4cc9f0' : '#e63946';
        } else {
            msg.innerText = 'Failed to update status.';
        }
    } catch (err) {
        console.error(err);
        msg.innerText = 'Error connecting to server.';
    }
}

// Allow global access to search functions
window.searchDonors = searchDonors;
window.requestDonor = requestDonor;
window.loadProfile = loadProfile;
