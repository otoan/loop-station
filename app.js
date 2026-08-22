const recordButton = document.getElementById('recordButton');
const clearButton = document.getElementById('clearButton');
const playButton = document.getElementById('playButton');
const buttonLabel = document.getElementById('buttonLabel');
const recordIcon = document.getElementById('recordIcon');
const playIcon = document.getElementById('playIcon');
const playLabel = document.getElementById('playLabel');
const stateLabel = document.getElementById('stateLabel');
const hint = document.getElementById('hint');
const trackName = document.getElementById('trackName');
const timeDisplay = document.getElementById('timeDisplay');
const progressBar = document.getElementById('progressBar');

let mediaRecorder;
let audioChunks = [];
let audio;
let loopUrl;
let pendingStream;
let startedAt = 0;
let loopDuration = 0;
let timerId;
let countdownTimerId;
let isCountingDown = false;

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function updateTimer() {
  if (!startedAt) return;
  const elapsed = (performance.now() - startedAt) / 1000;
  timeDisplay.textContent = formatTime(elapsed);
  timerId = requestAnimationFrame(updateTimer);
}

function stopTimer() {
  cancelAnimationFrame(timerId);
  timerId = null;
}

function setState(state, message) {
  stateLabel.textContent = state;
  hint.textContent = message;
  document.body.dataset.state = state.toLowerCase();
}

async function startRecording() {
  if (isCountingDown) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setState('ERROR', 'This browser cannot record audio');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    pendingStream = stream;
    isCountingDown = true;
    recordButton.classList.add('is-counting-down');
    setState('WAITING', 'Recording starts in 2 seconds');
    await new Promise(resolve => {
      let remaining = 2;
      const updateCountdown = () => {
        recordButton.style.setProperty('--countdown-progress', `${((2 - remaining) / 2) * 100}%`);
        buttonLabel.innerHTML = `${remaining}<br>GET READY`;
        if (remaining === 0) {
          setTimeout(resolve, 100);
          return;
        }
        remaining -= 1;
        countdownTimerId = setTimeout(updateCountdown, 1000);
      };
      updateCountdown();
    });
    isCountingDown = false;
    pendingStream = null;
    recordButton.classList.remove('is-counting-down');
    recordButton.style.removeProperty('--countdown-progress');
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(MediaRecorder.isTypeSupported) || '';
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    audioChunks = [];
    mediaRecorder.addEventListener('dataavailable', event => {
      if (event.data.size > 0) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener('stop', finishRecording, { once: true });
    mediaRecorder.start();
    startedAt = performance.now();
    recordButton.classList.add('is-recording');
    recordIcon.classList.add('is-stop');
    buttonLabel.innerHTML = 'TAP TO<br>STOP';
    recordButton.setAttribute('aria-label', '録音を停止');
    setState('RECORDING', 'Capturing your take');
    updateTimer();
  } catch (error) {
    pendingStream?.getTracks().forEach(track => track.stop());
    pendingStream = null;
    isCountingDown = false;
    clearTimeout(countdownTimerId);
    recordButton.classList.remove('is-counting-down');
    recordButton.style.removeProperty('--countdown-progress');
    setState('ERROR', error.name === 'NotAllowedError' ? 'Allow microphone access to record' : 'Microphone unavailable');
  }
}

function stopRecording() {
  if (isCountingDown) {
    pendingStream?.getTracks().forEach(track => track.stop());
    pendingStream = null;
    clearTimeout(countdownTimerId);
    isCountingDown = false;
    recordButton.classList.remove('is-counting-down');
    recordButton.style.removeProperty('--countdown-progress');
    buttonLabel.innerHTML = 'TAP TO<br>RECORD';
    setState('READY', 'Microphone ready');
    return;
  }
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  loopDuration = (performance.now() - startedAt) / 1000;
  stopTimer();
  mediaRecorder.stream.getTracks().forEach(track => track.stop());
  mediaRecorder.stop();
  recordButton.classList.remove('is-recording');
  recordIcon.classList.remove('is-stop');
  buttonLabel.innerHTML = 'SAVING<br>LOOP';
  setState('SAVING', 'Preparing your loop');
}

function finishRecording() {
  const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  if (loopUrl) URL.revokeObjectURL(loopUrl);
  loopUrl = URL.createObjectURL(blob);
  audio = new Audio(loopUrl);
  audio.loop = true;
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('play', () => setPlayingState(true));
  audio.addEventListener('pause', () => setPlayingState(false));
  trackName.textContent = `LOOP 01 / ${formatTime(loopDuration)}`;
  timeDisplay.textContent = formatTime(loopDuration);
  clearButton.disabled = false;
  playButton.disabled = false;
  buttonLabel.innerHTML = 'TAP TO<br>REPLACE';
  recordButton.setAttribute('aria-label', '録音をやり直す');
  setState('LOOPING', 'Your loop is ready');
  audio.play().catch(() => setPlayingState(false));
}

function setPlayingState(isPlaying) {
  playButton.classList.toggle('is-playing', isPlaying);
  playIcon.textContent = isPlaying ? 'Ⅱ' : '▶';
  playLabel.textContent = isPlaying ? 'PAUSE' : 'PLAY';
  if (isPlaying) setState('LOOPING', 'Loop is playing');
  else setState('PAUSED', 'Loop paused');
}

function updateProgress() {
  if (!audio || !audio.duration) return;
  progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
}

function clearLoop() {
  if (audio) audio.pause();
  if (loopUrl) URL.revokeObjectURL(loopUrl);
  audio = null;
  loopUrl = null;
  loopDuration = 0;
  startedAt = 0;
  stopTimer();
  timeDisplay.textContent = '00:00';
  trackName.textContent = 'NO LOOP CAPTURED';
  progressBar.style.width = '0%';
  clearButton.disabled = true;
  playButton.disabled = true;
  buttonLabel.innerHTML = 'TAP TO<br>RECORD';
  recordButton.setAttribute('aria-label', '録音を開始');
  setState('READY', 'Microphone ready');
}

recordButton.addEventListener('click', () => {
  if (mediaRecorder?.state === 'recording') stopRecording();
  else startRecording();
});
playButton.addEventListener('click', () => {
  if (!audio) return;
  if (audio.paused) audio.play();
  else audio.pause();
});
clearButton.addEventListener('click', clearLoop);
