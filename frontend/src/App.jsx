import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './index.css';

// In production, the backend serves the UI on the same origin (https).
// In dev mode, point directly at the HTTPS backend.
const SERVER_URL = import.meta.env.DEV ? 'https://localhost:3443' : window.location.origin;

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [errorMsg, setErrorMsg] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [recordings, setRecordings] = useState([]);
  
  const socketRef = useRef(null);
  const micRecorderRef = useRef(null);
  const sysRecorderRef = useRef(null);
  const streamsRef = useRef([]);

  const fetchRecordings = async () => {
      try {
          const res = await fetch(`${SERVER_URL}/api/recordings`);
          const data = await res.json();
          setRecordings(data || []);
      } catch (err) {
          console.warn("Failed to fetch recordings", err);
      }
  };

  useEffect(() => {
    fetchRecordings();
    socketRef.current = io(SERVER_URL);
    
    socketRef.current.on('connect', () => {
        setStatus('Connected to Server');
    });

    socketRef.current.on('recording-ready', (filename) => {
        setStatus('Finalizing Audio...');
        setTimeout(() => {
            setDownloadUrl(`${SERVER_URL}/download/${filename}`);
            setStatus('Recording Ready');
            fetchRecordings();
        }, 1000);
    });

    socketRef.current.on('recording-error', (msg) => {
        setErrorMsg(`Server Error: ${msg}`);
        setStatus('Error');
    });

    return () => {
        socketRef.current.disconnect();
    };
  }, []);

  const getMediaStreams = async () => {
      let micStream = null;
      let sysStream = null;

      try {
          // Get Microphone (Optimized settings to better capture speakerphone audio)
          micStream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: true
              } 
          });
          streamsRef.current.push(micStream);
      } catch (err) {
          setErrorMsg('Microphone access denied or unavailable.');
          return null;
      }

      try {
          // Get System Audio
          // We ask for display media (screen/tab sharing) and extract the audio track.
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true, // often required to prompt the dialog
              audio: true
          });
          
          const audioTracks = displayStream.getAudioTracks();
          if (audioTracks.length > 0) {
              sysStream = new MediaStream([audioTracks[0]]);
          } else {
              setErrorMsg('⚠️ No System Audio found! You MUST check the "Share tab/system audio" checkbox in the browser prompt. Recording Mic only.');
          }
          
          // Stop video tracks immediately as we don't need the visual screen recording
          displayStream.getVideoTracks().forEach(track => track.stop());
          streamsRef.current.push(sysStream);

      } catch (err) {
          console.warn('System audio not captured:', err);
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile) {
              setErrorMsg('⚠️ Mobile browsers lack screen-audio APIs. Put the call on SPEAKERPHONE so the optimized microphone can hear both sides!');
          } else {
              setErrorMsg('System audio skipped/denied. Recording mic only.');
          }
      }

      return { micStream, sysStream };
  };

  const startRecording = async () => {
      setErrorMsg(null);
      setDownloadUrl(null);
      setStatus('Requesting Permissions...');
      
      const streams = await getMediaStreams();
      if (!streams || !streams.micStream) {
          setStatus('Failed');
          return;
      }

      socketRef.current.emit('start-recording');

      // Initialize Mic Recorder
      micRecorderRef.current = new MediaRecorder(streams.micStream, { mimeType: 'audio/webm' });
      micRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
              socketRef.current.emit('audio-chunk-mic', e.data);
          }
      };
      micRecorderRef.current.start(1000); // 1-second chunks

      // Initialize Sys Recorder if available
      if (streams.sysStream) {
          sysRecorderRef.current = new MediaRecorder(streams.sysStream, { mimeType: 'audio/webm' });
          sysRecorderRef.current.ondataavailable = (e) => {
              if (e.data.size > 0) {
                  socketRef.current.emit('audio-chunk-system', e.data);
              }
          };
          sysRecorderRef.current.start(1000);
      }

      setIsRecording(true);
      setStatus('Recording...');
  };

  const stopRecording = () => {
      if (micRecorderRef.current && micRecorderRef.current.state !== 'inactive') {
          micRecorderRef.current.stop();
      }
      if (sysRecorderRef.current && sysRecorderRef.current.state !== 'inactive') {
          sysRecorderRef.current.stop();
      }
      
      // Stop all tracks
      streamsRef.current.forEach(stream => {
          if (stream) stream.getTracks().forEach(track => track.stop());
      });
      streamsRef.current = [];

      socketRef.current.emit('stop-recording');
      setIsRecording(false);
      setStatus('Mixing Audio...');
  };

  return (
    <div className="app-container">
      <div className="logo-container">
        <div className="logo-icon">🎙️</div>
        <h1>Intercept</h1>
        <div className="subtitle">Remote Call & Audio Capture</div>
      </div>

      <div className={`status-badge ${isRecording ? 'recording' : ''} ${downloadUrl ? 'ready' : ''}`}>
        <div className="pulse-dot"></div>
        {status}
      </div>

      {!isRecording ? (
        <button className="record-btn" onClick={startRecording}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <circle cx="12" cy="12" r="10"></circle>
             <circle cx="12" cy="12" r="3"></circle>
          </svg>
          Start Intercept
        </button>
      ) : (
        <button className="record-btn stop" onClick={stopRecording}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12"></rect>
          </svg>
          Stop Recording
        </button>
      )}

      {errorMsg && <div className="error-text">{errorMsg}</div>}

      {downloadUrl && (
        <a href={downloadUrl} className="download-btn" download>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Download Latest Audio
        </a>
      )}

      <div className="recordings-gallery">
        <h3>Recent Intercepts</h3>
        {recordings.length > 0 ? (
          <div className="recordings-list">
            {recordings.map((file, idx) => (
              <div key={idx} className="recording-item">
                <div className="recording-name">{file}</div>
                <div className="recording-actions">
                  <audio controls src={`${SERVER_URL}/download/${file}`} preload="none" />
                  <a href={`${SERVER_URL}/download/${file}`} download className="small-download-btn">Save</a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No recordings yet. Completed intercepts will appear here!</p>
        )}
      </div>
    </div>
  );
}

export default App;
