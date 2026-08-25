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

let recorder;
let chunks = [];
let stream;
let audio;
let audioUrl;
let startedAt = 0;
let duration = 0;
let playing = false;
let playbackGeneration = 0;

function setState(state, message) {
  stateLabel.textContent = state;
  hint.textContent = message;
  document.body.dataset.state = state.toLowerCase();
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function currentPosition() {
  return audio?.currentTime || 0;
}

function updateProgress() {
  if (!audio || !duration) return;
  progressBar.style.width = `${(audio.currentTime / duration) * 100}%`;
  timeDisplay.textContent = formatTime(audio.currentTime);
}

function playLoop() {
  if (!audio) return;
  const generation = playbackGeneration;
  audio.play().then(() => {
    if (!audio || generation !== playbackGeneration) return;
    playing = true;
    playButton.classList.add('is-playing');
    playIcon.textContent = 'Ⅱ';
    playLabel.textContent = 'PAUSE';
    setState('LOOPING', 'Loop is playing');
  }).catch(() => setState('READY', 'Tap PLAY to start the loop'));
}

function pauseLoop() {
  if (!audio) return;
  audio.pause();
  playing = false;
  playButton.classList.remove('is-playing');
  playIcon.textContent = '▶';
  playLabel.textContent = 'PLAY';
  setState('PAUSED', 'Loop paused');
}

async function startRecording() {
  if (recorder?.state === 'recording') return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setState('ERROR', 'This browser cannot record audio');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(MediaRecorder.isTypeSupported) || '';
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener('stop', finishRecording, { once: true });
    recorder.start();
    startedAt = performance.now();
    recordButton.classList.add('is-recording');
    recordIcon.classList.add('is-stop');
    buttonLabel.innerHTML = 'TAP TO<br>STOP';
    recordButton.setAttribute('aria-label', '録音を停止');
    setState('RECORDING', 'Capturing your take');
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    setState('ERROR', error.name === 'NotAllowedError' ? 'Allow microphone access to record' : 'Microphone unavailable');
  }
}

function stopRecording() {
  if (!recorder || recorder.state !== 'recording') return;
  duration = (performance.now() - startedAt) / 1000;
  recorder.stop();
  recordButton.classList.remove('is-recording');
  recordIcon.classList.remove('is-stop');
  buttonLabel.innerHTML = 'PLAYING<br>LOOP';
  setState('LOOPING', 'Playing your loop');
}

async function finishRecording() {
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(blob);
  audio = new Audio(audioUrl);
  audio.loop = true;
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('play', () => { playing = true; });
  audio.addEventListener('pause', () => { playing = false; });
  trackName.textContent = `LOOP 01 / ${formatTime(duration)}`;
  timeDisplay.textContent = formatTime(duration);
  clearButton.disabled = false;
  playButton.disabled = false;
  buttonLabel.innerHTML = 'TAP TO<br>RECORD AGAIN';
  recordButton.setAttribute('aria-label', '録音をやり直す');
  playLoop();
}

function clearLoop() {
  playbackGeneration += 1;
  playing = false;
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audio = null;
  audioUrl = null;
  duration = 0;
  playButton.classList.remove('is-playing');
  playIcon.textContent = '▶';
  playLabel.textContent = 'PLAY';
  progressBar.style.width = '0%';
  timeDisplay.textContent = '00:00';
  trackName.textContent = 'NO LOOP CAPTURED';
  clearButton.disabled = true;
  playButton.disabled = true;
  buttonLabel.innerHTML = 'TAP TO<br>RECORD';
  recordButton.setAttribute('aria-label', '録音を開始');
  setState('READY', 'Microphone ready');
}

recordButton.addEventListener('click', () => recorder?.state === 'recording' ? stopRecording() : startRecording());
playButton.addEventListener('click', () => playing ? pauseLoop() : playLoop());
clearButton.addEventListener('click', clearLoop);
