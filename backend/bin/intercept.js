#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const command = process.argv[2];
const pidFile = path.join(__dirname, '..', 'server.pid');
const indexPath = path.join(__dirname, '..', 'index.js');

// Get the real global IPv6 address (not loopback ::1, not link-local fe80::)
function getIPv6() {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
        for (const addr of iface) {
            if (addr.family === 'IPv6' && !addr.internal && !addr.address.startsWith('fe80')) {
                return addr.address;
            }
        }
    }
    return null;
}

function getIPv4() {
    return Object.values(os.networkInterfaces()).flat()
        .find(i => (i.family === 'IPv4' || i.family === 4) && !i.internal)?.address || 'localhost';
}

function printLinks(pid) {
    const ipv4 = getIPv4();
    const ipv6 = getIPv6();
    if (pid) console.log(`Intercept Server is RUNNING (PID: ${pid})\n`);
    console.log(`🔒 Intercept Web (HTTPS) Access Links:`);
    console.log(`   ➜  Local:    https://localhost:3443`);
    console.log(`   ➜  Network:  https://${ipv4}:3443`);
    if (ipv6) {
        console.log(`   ➜  IPv6:     https://[${ipv6}]:3443`);
    } else {
        console.log(`   ➜  IPv6:     (no global IPv6 address detected)`);
    }
    console.log(`\n   ⚠  First visit: browser will warn about self-signed cert.`);
    console.log(`      Click 'Advanced' → 'Proceed' to accept it once.\n`);
}


if (command === 'start') {
    if (fs.existsSync(pidFile)) {
        console.log('Server is already running based on pidfile.');
        process.exit(0);
    }
    console.log('Starting Intercept Web Server (IPv6 ready)...');
    
    const out = fs.openSync(path.join(__dirname, '..', 'server.log'), 'a');
    const err = fs.openSync(path.join(__dirname, '..', 'server.err'), 'a');
    
    const child = spawn('node', [indexPath], {
        detached: true,
        stdio: ['ignore', out, err]
    });
    
    child.unref();
    fs.writeFileSync(pidFile, child.pid.toString());
    console.log(`Server started in background with PID: ${child.pid}`);
    console.log(`Logs available at backend/server.log`);
    printLinks();

} else if (command === 'stop') {
    if (!fs.existsSync(pidFile)) {
        console.log('No server pidfile found.');
        process.exit(0);
    }
    const pid = fs.readFileSync(pidFile, 'utf8');
    try {
        process.kill(pid);
        console.log(`Stopped server with PID: ${pid}`);
    } catch (e) {
        console.log(`Failed to stop PID ${pid}. It might not be running.`);
    }
    fs.unlinkSync(pidFile);
} else if (command === 'status') {
    if (fs.existsSync(pidFile)) {
        const pid = fs.readFileSync(pidFile, 'utf8');
        try {
            process.kill(pid, 0); // test if running
            printLinks(pid);
        } catch(e) {
            console.log(`Intercept Server is STOPPED (Stale PID file deleted)`);
            fs.unlinkSync(pidFile);
        }
    } else {
        console.log('Intercept Server is STOPPED.');
    }
} else {
    console.log(`Usage: intercept <start|stop|status>`);
}
