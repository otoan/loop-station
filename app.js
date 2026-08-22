const recordButton = document.getElementById('recordButton');
const clearButton = document.getElementById('clearButton');
const playButton = document.getElementById('playButton');
const buttonLabel = document.getElementById('buttonLabel');
const recordIcon = document.getElementById('recordIcon');
const countdownFill = document.getElementById('countdownFill');
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
let audioContext;
let audioBuffer;
let sourceNode;
let playbackOffset = 0;
let playbackStartedAt = 0;
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
    buttonLabel.textContent = 'GET READY';
    countdownFill.style.width = '0%';
    await new Promise(resolve => { countdownTimerId = setTimeout(resolve, 2000); });
    isCountingDown = false;
    pendingStream = null;
    recordButton.classList.remove('is-counting-down');
    countdownFill.style.width = '0%';
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
    countdownFill.style.width = '0%';
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
    countdownFill.style.width = '0%';
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

async function finishRecording() {
  const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  sourceNode?.stop();
  sourceNode = null;
  playbackOffset = 0;
  if (loopUrl) URL.revokeObjectURL(loopUrl);
  loopUrl = URL.createObjectURL(blob);
  audio = new Audio(loopUrl);
  audio.loop = true;
  try {
    audioContext ||= new AudioContext();
    audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
  } catch {
    audioBuffer = null;
  }
  trackName.textContent = `LOOP 01 / ${formatTime(loopDuration)}`;
  timeDisplay.textContent = formatTime(loopDuration);
  clearButton.disabled = false;
  playButton.disabled = false;
  buttonLabel.innerHTML = 'TAP TO<br>REPLACE';
  recordButton.setAttribute('aria-label', '録音をやり直す');
  setState('LOOPING', 'Your loop is ready');
  playLoop();
}

function setPlayingState(isPlaying) {
  playButton.classList.toggle('is-playing', isPlaying);
  playIcon.textContent = isPlaying ? 'Ⅱ' : '▶';
  playLabel.textContent = isPlaying ? 'PAUSE' : 'PLAY';
  if (isPlaying) setState('LOOPING', 'Loop is playing');
  else setState('PAUSED', 'Loop paused');
}

function playLoop() {
  if (audioBuffer) {
    audioContext.resume();
    sourceNode?.stop();
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.loop = true;
    sourceNode.connect(audioContext.destination);
    playbackStartedAt = audioContext.currentTime;
    sourceNode.start(0, playbackOffset % audioBuffer.duration);
    setPlayingState(true);
    updateProgress();
    return;
  }
  audio?.play().then(() => setPlayingState(true)).catch(() => setPlayingState(false));
}

function pauseLoop() {
  if (audioBuffer && sourceNode) {
    playbackOffset = (audioContext.currentTime - playbackStartedAt + playbackOffset) % audioBuffer.duration;
    sourceNode.stop();
    sourceNode = null;
    setPlayingState(false);
    return;
  }
  audio?.pause();
  setPlayingState(false);
}

function updateProgress() {
  if (audioBuffer) {
    const currentTime = sourceNode
      ? (audioContext.currentTime - playbackStartedAt + playbackOffset) % audioBuffer.duration
      : playbackOffset;
    progressBar.style.width = `${(currentTime / audioBuffer.duration) * 100}%`;
    if (sourceNode) requestAnimationFrame(updateProgress);
    return;
  }
  if (audio?.duration) progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
}

function clearLoop() {
  pauseLoop();
  sourceNode = null;
  audioBuffer = null;
  playbackOffset = 0;
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
  if (sourceNode || !audio.paused) pauseLoop();
  else playLoop();
});
clearButton.addEventListener('click', clearLoop);
