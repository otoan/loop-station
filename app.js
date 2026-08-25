const recordButton = document.getElementById('recordButton');
const clearButton = document.getElementById('clearButton');
const playButton = document.getElementById('playButton');
const addTrackButton = document.getElementById('addTrackButton');
const countInToggle = document.getElementById('countInToggle');
const trackList = document.getElementById('trackList');
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
let previewAudio;
let previewUrl;
let pendingStream;
let recordingStream;
let audioContext;
let tracks = [];
let sourceNodes = [];
let gainNodes = [];
let loopPosition = 0;
let playbackStartedAt = 0;
let recordingStartedAt = 0;
let recordingMode = 'base';
let loopDuration = 0;
let timerId;
let countdownTimerId;
let isCountingDown = false;
let isPlaying = false;

function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function getLoopPosition() {
  if (!isPlaying || !loopDuration) return loopPosition;
  return (audioContext.currentTime - playbackStartedAt + loopPosition) % loopDuration;
}

function updateProgress() {
  if (!loopDuration) return;
  progressBar.style.width = `${(getLoopPosition() / loopDuration) * 100}%`;
  if (isPlaying) timerId = requestAnimationFrame(updateProgress);
}

function stopProgress() {
  cancelAnimationFrame(timerId);
  timerId = null;
}

function stopSources() {
  sourceNodes.forEach(source => { try { source.stop(); } catch {} });
  sourceNodes = [];
  gainNodes = [];
}

function startSources(position = getLoopPosition()) {
  if (!audioContext || !loopDuration || !tracks.length) return;
  stopSources();
  const startAt = audioContext.currentTime + 0.03;
  playbackStartedAt = startAt;
  loopPosition = position % loopDuration;
  tracks.forEach(track => {
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    source.buffer = track.audioBuffer;
    source.loop = true;
    gain.gain.value = track.muted ? 0 : track.volume;
    source.connect(gain).connect(audioContext.destination);
    source.start(startAt, loopPosition);
    sourceNodes.push(source);
    gainNodes.push(gain);
  });
}

async function playLoop() {
  if (!tracks.length) return;
  audioContext ||= createAudioContext();
  if (!audioContext) return;
  await audioContext.resume();
  isPlaying = true;
  startSources(loopPosition);
  playButton.classList.add('is-playing');
  playIcon.textContent = 'Ⅱ';
  playLabel.textContent = 'PAUSE';
  setState('LOOPING', 'Loop is playing');
  updateProgress();
}

function pauseLoop() {
  if (!isPlaying) return;
  loopPosition = getLoopPosition();
  isPlaying = false;
  stopSources();
  stopProgress();
  playButton.classList.remove('is-playing');
  playIcon.textContent = '▶';
  playLabel.textContent = 'PLAY';
  setState('PAUSED', 'Loop paused');
}

function setState(state, message) {
  stateLabel.textContent = state;
  hint.textContent = message;
  document.body.dataset.state = state.toLowerCase();
}

async function startRecording() {
  if (isCountingDown || mediaRecorder?.state === 'recording') return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !(window.AudioContext || window.webkitAudioContext)) {
    setState('ERROR', 'This browser cannot record audio');
    return;
  }
  recordingMode = tracks.length ? 'overdub' : 'base';
  try {
    pendingStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    isCountingDown = true;
    if (countInToggle.checked) {
      recordButton.classList.add('is-counting-down');
      setState('WAITING', recordingMode === 'base' ? 'Recording starts in 2 seconds' : 'Syncing to next loop');
      buttonLabel.textContent = 'GET READY';
      countdownFill.style.width = '0%';
      await new Promise(resolve => { countdownTimerId = setTimeout(resolve, 2000); });
    }
    if (!isCountingDown) return;
    if (recordingMode === 'overdub') {
      if (!isPlaying) await playLoop();
      const wait = (loopDuration - getLoopPosition()) * 1000;
      setState('WAITING', 'Starting on the beat');
      await new Promise(resolve => { countdownTimerId = setTimeout(resolve, wait); });
      if (!isCountingDown) return;
    }
    isCountingDown = false;
    recordButton.classList.remove('is-counting-down');
    countdownFill.style.width = '0%';
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(MediaRecorder.isTypeSupported) || '';
    recordingStream = pendingStream;
    mediaRecorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
    pendingStream = null;
    audioChunks = [];
    mediaRecorder.addEventListener('dataavailable', event => {
      if (event.data.size > 0) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener('stop', finishRecording, { once: true });
    mediaRecorder.start();
    recordingStartedAt = performance.now();
    recordButton.classList.add('is-recording');
    recordIcon.classList.add('is-stop');
    buttonLabel.innerHTML = 'TAP TO<br>STOP';
    recordButton.setAttribute('aria-label', '録音を停止');
    setState('RECORDING', recordingMode === 'base' ? 'Capturing rhythm' : 'Capturing new layer');
  } catch (error) {
    pendingStream?.getTracks().forEach(track => track.stop());
    pendingStream = null;
    isCountingDown = false;
    clearTimeout(countdownTimerId);
    recordButton.classList.remove('is-counting-down');
    countdownFill.style.width = '0%';
    setState('ERROR', error.name === 'NotAllowedError' ? 'Allow microphone access to record' : 'Microphone unavailable');
    renderTracks();
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
    buttonLabel.innerHTML = tracks.length ? 'TAP TO<br>ADD TRACK' : 'TAP TO<br>RECORD';
    setState('READY', 'Microphone ready');
    renderTracks();
    return;
  }
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  const capturedDuration = (performance.now() - recordingStartedAt) / 1000;
  if (recordingMode === 'base') loopDuration = capturedDuration;
  mediaRecorder.stop();
  recordButton.classList.remove('is-recording');
  recordIcon.classList.remove('is-stop');
  buttonLabel.innerHTML = 'PLAYING<br>LOOP';
  setState('LOOPING', 'Playing your loop');
}

async function finishRecording() {
  const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  recordingStream?.getTracks().forEach(track => track.stop());
  recordingStream = null;
  previewUrl = URL.createObjectURL(blob);
  previewAudio = new Audio(previewUrl);
  previewAudio.loop = true;
  previewAudio.play().catch(() => {});
  try {
    audioContext ||= createAudioContext();
    const decodedBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const frameCount = Math.max(1, Math.floor(loopDuration * decodedBuffer.sampleRate));
    const buffer = audioContext.createBuffer(decodedBuffer.numberOfChannels, frameCount, decodedBuffer.sampleRate);
    for (let channel = 0; channel < decodedBuffer.numberOfChannels; channel += 1) {
      buffer.copyToChannel(decodedBuffer.getChannelData(channel).subarray(0, frameCount), channel);
    }
    tracks.push({ id: Date.now(), name: recordingMode === 'base' ? 'RHYTHM' : `TRACK ${String(tracks.length + 1).padStart(2, '0')}`, audioBuffer: buffer, volume: 1, muted: false });
    previewAudio.pause();
    previewAudio = null;
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    loopPosition = 0;
    renderTracks();
    buttonLabel.innerHTML = 'TAP TO<br>ADD TRACK';
    recordButton.setAttribute('aria-label', 'トラックを追加');
    await playLoop();
  } catch {
    setState('ERROR', 'Could not prepare this track');
    buttonLabel.innerHTML = tracks.length ? 'TAP TO<br>ADD TRACK' : 'TAP TO<br>RECORD';
    renderTracks();
  }
}

function renderTracks() {
  trackList.innerHTML = tracks.map((track, index) => `<div class="track-row${track.muted ? ' is-muted' : ''}" data-track-id="${track.id}"><span class="track-number">${String(index + 1).padStart(2, '0')}</span><span class="track-title">${track.name}</span><span class="track-length">${formatTime(loopDuration)}</span><button class="track-mute" type="button" data-action="mute">${track.muted ? 'MUTED' : 'LIVE'}</button><button class="track-delete" type="button" data-action="delete" aria-label="Delete ${track.name}">×</button></div>`).join('');
  trackName.textContent = tracks.length ? `${tracks.length} TRACK${tracks.length === 1 ? '' : 'S'} / ${formatTime(loopDuration)}` : 'NO LOOP CAPTURED';
  timeDisplay.textContent = formatTime(loopDuration);
  clearButton.disabled = !tracks.length;
  playButton.disabled = !tracks.length;
  addTrackButton.disabled = !tracks.length || isCountingDown || mediaRecorder?.state === 'recording';
}

function deleteTrack(id) {
  tracks = tracks.filter(track => track.id !== id);
  if (!tracks.length) {
    clearLoop();
    return;
  }
  if (isPlaying) startSources(getLoopPosition());
  renderTracks();
}

function clearLoop() {
  pauseLoop();
  previewAudio?.pause();
  previewAudio = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  tracks = [];
  loopDuration = 0;
  loopPosition = 0;
  progressBar.style.width = '0%';
  timeDisplay.textContent = '00:00';
  buttonLabel.innerHTML = 'TAP TO<br>RECORD';
  recordButton.setAttribute('aria-label', '録音を開始');
  setState('READY', 'Microphone ready');
  renderTracks();
}

recordButton.addEventListener('click', () => {
  if (mediaRecorder?.state === 'recording' || isCountingDown) stopRecording();
  else startRecording();
});
addTrackButton.addEventListener('click', startRecording);
playButton.addEventListener('click', () => { if (isPlaying) pauseLoop(); else playLoop(); });
clearButton.addEventListener('click', clearLoop);
trackList.addEventListener('click', event => {
  const button = event.target.closest('button');
  const row = event.target.closest('.track-row');
  if (!button || !row) return;
  const track = tracks.find(item => item.id === Number(row.dataset.trackId));
  if (!track) return;
  if (button.dataset.action === 'mute') {
    track.muted = !track.muted;
    renderTracks();
    if (isPlaying) startSources(getLoopPosition());
  } else if (button.dataset.action === 'delete') deleteTrack(track.id);
});

renderTracks();
