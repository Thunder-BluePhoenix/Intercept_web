const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const streamsDir = path.join(__dirname, 'streams');
if (!fs.existsSync(streamsDir)) {
    fs.mkdirSync(streamsDir);
}

const clientStreams = new Map();

wss.on('connection', (ws) => {
    console.log('Client connected for recording');
    const sessionId = Date.now().toString();
    
    const micPath = path.join(streamsDir, `${sessionId}_mic.webm`);
    const sysPath = path.join(streamsDir, `${sessionId}_sys.webm`);
    const outputPath = path.join(streamsDir, `${sessionId}_mixed.mp3`);
    
    const micStream = fs.createWriteStream(micPath, { flags: 'a' });
    const sysStream = fs.createWriteStream(sysPath, { flags: 'a' });
    
    clientStreams.set(ws, { micStream, sysStream, micPath, sysPath, outputPath, sessionId });

    ws.on('message', (message, isBinary) => {
        if (!isBinary) {
            try {
                 const data = JSON.parse(message.toString());
                 if (data.type === 'stop') {
                     console.log('Stop signal received from client');
                     finishRecording(ws);
                 }
                 return;
            } catch (e) {
                 console.error(e);
            }
        }

        if (isBinary && message.length > 1) {
            const streamId = message[0];
            const chunk = message.slice(1);
            
            const streams = clientStreams.get(ws);
            if (streams) {
                if (streamId === 0) {
                    streams.micStream.write(chunk);
                } else if (streamId === 1) {
                    streams.sysStream.write(chunk);
                }
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        finishRecording(ws);
    });
});

function finishRecording(ws) {
    const streams = clientStreams.get(ws);
    if (!streams) return; 
    
    clientStreams.delete(ws);
    
    streams.micStream.end();
    streams.sysStream.end();
    
    console.log(`Starting FFmpeg mix for session ${streams.sessionId}...`);
    
    setTimeout(() => {
        const hasMic = fs.existsSync(streams.micPath) && fs.statSync(streams.micPath).size > 0;
        const hasSys = fs.existsSync(streams.sysPath) && fs.statSync(streams.sysPath).size > 0;

        if (hasMic && hasSys) {
            ffmpeg()
                .input(streams.micPath)
                .input(streams.sysPath)
                .complexFilter('amix=inputs=2:duration=longest')
                .save(streams.outputPath)
                .on('end', () => {
                    console.log(`Mixing complete: ${streams.outputPath}`);
                })
                .on('error', (err) => {
                    console.error('Error mixing audio:', err);
                });
        } else if (hasMic) {
            console.log('Only mic audio received.');
        } else if (hasSys) {
            console.log('Only sys audio received.');
        } else {
            console.log('No audio received.');
        }
    }, 1000);
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Intercept Web Server listening on http://localhost:${PORT}`);
});
