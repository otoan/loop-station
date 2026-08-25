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

let audioContext;
let captureSource;
let captureProcessor;
let stream;
let recordedSamples = [];
let audioBuffer;
let playbackSource;
let outputGain;
let recordingStartedAt = 0;
let duration = 0;
let playbackPosition = 0;
let playbackStartedAt = 0;
let playing = false;
let countingDown = false;
let countdownTimer;
let progressFrame;

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
  if (!audioBuffer || !playing) return playbackPosition;
  return (audioContext.currentTime - playbackStartedAt + playbackPosition) % audioBuffer.duration;
}

function updateProgress() {
  if (!duration) return;
  const position = currentPosition();
  progressBar.style.width = `${(position / duration) * 100}%`;
  timeDisplay.textContent = formatTime(position);
  if (playing) progressFrame = requestAnimationFrame(updateProgress);
}

function stopPlaybackSource() {
  if (!playbackSource) return;
  try { playbackSource.stop(); } catch {}
  playbackSource.disconnect();
  playbackSource = null;
}

async function playLoop() {
  if (!audioBuffer) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();
  stopPlaybackSource();
  playbackSource = audioContext.createBufferSource();
  playbackSource.buffer = audioBuffer;
  playbackSource.loop = true;
  outputGain ||= audioContext.createGain();
  outputGain.gain.value = 1.25;
  playbackSource.connect(outputGain).connect(audioContext.destination);
  playbackStartedAt = audioContext.currentTime;
  playbackSource.start(0, playbackPosition % audioBuffer.duration);
  playing = true;
  playButton.classList.add('is-playing');
  playIcon.textContent = 'Ⅱ';
  playLabel.textContent = 'PAUSE';
  setState('LOOPING', 'Loop is playing');
  updateProgress();
}

function pauseLoop() {
  if (!playing) return;
  playbackPosition = currentPosition();
  playing = false;
  stopPlaybackSource();
  cancelAnimationFrame(progressFrame);
  playButton.classList.remove('is-playing');
  playIcon.textContent = '▶';
  playLabel.textContent = 'PLAY';
  setState('PAUSED', 'Loop paused');
}

function finishCapture() {
  captureProcessor.disconnect();
  captureSource.disconnect();
  captureProcessor.onaudioprocess = null;
  captureProcessor = null;
  captureSource = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  const sampleCount = recordedSamples.reduce((total, samples) => total + samples.length, 0);
  audioBuffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const samples = new Float32Array(sampleCount);
  let offset = 0;
  recordedSamples.forEach(chunk => {
    samples.set(chunk, offset);
    offset += chunk.length;
  });
  audioBuffer.copyToChannel(samples, 0);
  duration = audioBuffer.duration;
  recordedSamples = [];
  playbackPosition = 0;
  trackName.textContent = `LOOP 01 / ${formatTime(duration)}`;
  timeDisplay.textContent = formatTime(duration);
  clearButton.disabled = false;
  playButton.disabled = false;
  buttonLabel.innerHTML = 'TAP TO<br>RECORD AGAIN';
  recordButton.setAttribute('aria-label', '録音をやり直す');
  playLoop();
}

async function startRecording() {
  if (countingDown || captureProcessor) return;
  if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
    setState('ERROR', 'This browser cannot record audio');
    return;
  }
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    countingDown = true;
    recordButton.classList.add('is-counting-down');
    countdownFill.style.width = '0%';
    buttonLabel.textContent = 'GET READY';
    setState('WAITING', 'Recording starts in 2 seconds');
    await new Promise(resolve => { countdownTimer = setTimeout(resolve, 2000); });
    if (!countingDown) return;
    countingDown = false;
    recordButton.classList.remove('is-counting-down');
    countdownFill.style.width = '0%';
    recordedSamples = [];
    captureSource = audioContext.createMediaStreamSource(stream);
    captureProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    captureProcessor.onaudioprocess = event => {
      recordedSamples.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      event.outputBuffer.getChannelData(0).fill(0);
    };
    captureSource.connect(captureProcessor);
    captureProcessor.connect(audioContext.destination);
    recordingStartedAt = audioContext.currentTime;
    recordButton.classList.add('is-recording');
    recordIcon.classList.add('is-stop');
    buttonLabel.innerHTML = 'TAP TO<br>STOP';
    recordButton.setAttribute('aria-label', '録音を停止');
    setState('RECORDING', 'Capturing your take');
  } catch (error) {
    countingDown = false;
    clearTimeout(countdownTimer);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    setState('ERROR', error.name === 'NotAllowedError' ? 'Allow microphone access to record' : 'Microphone unavailable');
  }
}

function stopRecording() {
  if (countingDown) {
    clearTimeout(countdownTimer);
    countingDown = false;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    recordButton.classList.remove('is-counting-down');
    countdownFill.style.width = '0%';
    buttonLabel.innerHTML = 'TAP TO<br>RECORD';
    setState('READY', 'Microphone ready');
    return;
  }
  if (!captureProcessor) return;
  duration = audioContext.currentTime - recordingStartedAt;
  recordButton.classList.remove('is-recording');
  recordIcon.classList.remove('is-stop');
  buttonLabel.innerHTML = 'PLAYING<br>LOOP';
  setState('LOOPING', 'Playing your loop');
  finishCapture();
}

function clearLoop() {
  pauseLoop();
  captureProcessor?.disconnect();
  captureSource?.disconnect();
  captureProcessor = null;
  captureSource = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  audioBuffer = null;
  recordedSamples = [];
  duration = 0;
  playbackPosition = 0;
  progressBar.style.width = '0%';
  timeDisplay.textContent = '00:00';
  trackName.textContent = 'NO LOOP CAPTURED';
  clearButton.disabled = true;
  playButton.disabled = true;
  buttonLabel.innerHTML = 'TAP TO<br>RECORD';
  recordButton.setAttribute('aria-label', '録音を開始');
  setState('READY', 'Microphone ready');
}

recordButton.addEventListener('click', () => countingDown || captureProcessor ? stopRecording() : startRecording());
playButton.addEventListener('click', () => playing ? pauseLoop() : playLoop());
clearButton.addEventListener('click', clearLoop);
