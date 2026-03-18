const express = require('express');
const https = require('https');
const { Server } = require('socket.io');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const cors = require('cors');
const selfsigned = require('selfsigned');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const tmpDir = path.join(__dirname, 'tmp');
const recDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
if (!fs.existsSync(recDir)) fs.mkdirSync(recDir);

app.get('/download/:filename', (req, res) => {
    const filePath = path.join(recDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

app.get('/api/recordings', (req, res) => {
    fs.readdir(recDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read recordings' });
        // Return .mp3 files sorted newest first
        const mp3Files = files.filter(f => f.endsWith('.mp3')).sort().reverse();
        res.json(mp3Files);
    });
});

async function start() {
    // --- Generate or load self-signed cert ---
    const certDir = path.join(__dirname, 'certs');
    const certFile = path.join(certDir, 'cert.pem');
    const keyFile  = path.join(certDir, 'key.pem');

    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir);

    let sslCreds;
    if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
        sslCreds = {
            cert: fs.readFileSync(certFile),
            key:  fs.readFileSync(keyFile)
        };
        console.log('[SSL] Loaded existing self-signed certificate.');
    } else {
        console.log('[SSL] Generating new self-signed certificate (this takes a moment)...');
        const attrs = [
            { name: 'commonName', value: 'intercept.local' },
            { name: 'organizationName', value: 'Intercept Web' }
        ];
        try {
            const pems = await selfsigned.generate(attrs, {
                keySize: 2048,
                days: 365,
                algorithm: 'sha256'
            });
            fs.writeFileSync(certFile, pems.cert);
            fs.writeFileSync(keyFile, pems.private);
            sslCreds = { cert: pems.cert, key: pems.private };
            console.log('[SSL] Certificate saved to backend/certs/');
        } catch (err) {
            console.error('[SSL Error]', err);
            process.exit(1);
        }
    }

    // --- HTTPS Server ---
    const httpsServer = https.createServer(sslCreds, app);
    const io = new Server(httpsServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    // --- WebSocket Logic ---
    io.on('connection', (socket) => {
        console.log('[+] Client connected:', socket.id);

        const micFile = path.join(tmpDir, `${socket.id}_mic.webm`);
        const sysFile = path.join(tmpDir, `${socket.id}_sys.webm`);
        let finalFilename = '';
        let outputFile = '';

        socket.on('start-recording', () => {
            console.log(`[>>] Recording started: ${socket.id}`);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            finalFilename = `Intercept_${timestamp}.mp3`;
            outputFile = path.join(recDir, finalFilename);
            if (fs.existsSync(micFile)) fs.unlinkSync(micFile);
            if (fs.existsSync(sysFile)) fs.unlinkSync(sysFile);
        });

        socket.on('audio-chunk-mic', (chunk) => {
            fs.appendFileSync(micFile, Buffer.from(chunk));
        });

        socket.on('audio-chunk-system', (chunk) => {
            fs.appendFileSync(sysFile, Buffer.from(chunk));
        });

        socket.on('stop-recording', () => {
            console.log(`[||] Recording stopped: ${socket.id}`);
            setTimeout(() => {
                const hasMic = fs.existsSync(micFile) && fs.statSync(micFile).size > 0;
                const hasSys = fs.existsSync(sysFile) && fs.statSync(sysFile).size > 0;

                const onDone = () => {
                    console.log(`[v] Saved: ${outputFile}`);
                    socket.emit('recording-ready', finalFilename);
                    if (fs.existsSync(micFile)) fs.unlinkSync(micFile);
                    if (fs.existsSync(sysFile)) fs.unlinkSync(sysFile);
                };

                if (hasMic && hasSys) {
                    console.log(`[*] Mixing ${socket.id} streams into permanent storage...`);
                    // Use amerge with volume normalization to prevent amix from halving system audio volume
                    ffmpeg()
                        .input(micFile)
                        .input(sysFile)
                        .complexFilter('[0:a][1:a]amix=inputs=2:duration=longest[a]')
                        .map('[a]')
                        .save(outputFile)
                        .on('end', onDone)
                        .on('error', (err) => {
                            console.error('[-] FFmpeg error:', err.message);
                            socket.emit('recording-error', err.message);
                        });
                } else if (hasMic) {
                    ffmpeg(micFile)
                        .save(outputFile)
                        .on('end', onDone)
                        .on('error', (err) => socket.emit('recording-error', err.message));
                } else {
                    console.log('[-] No audio chunks received.');
                }
            }, 1000);
        });

        socket.on('disconnect', () => {
            console.log('[-] Client disconnected:', socket.id);
        });
    });

    const PORT = process.env.PORT || 3443;
    const HOST = process.env.HOST || '::';

    httpsServer.listen(PORT, HOST, () => {
        console.log(`\n[Intercept] HTTPS server on https://[${HOST}]:${PORT}`);
        console.log(`[Intercept] Frontend served at same address. Self-signed cert auto-generated.`);
    });
}

start();
