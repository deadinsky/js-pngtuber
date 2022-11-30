// configure this to match your local folder
// each DeadXXX string here is the name of a png file
const localFolder = 'images/';
const pngtuber = {
    "normal": {
        "static": "DeadNormal"
    },
    "tick": {
        "ears": "DeadEars"
    },
    "excited": {
        "static": "DeadExcited",
        "entering": ["DeadUp1", "DeadUp2", "DeadUp3", "DeadUp4"],
        "exiting": ["DeadDown1", "DeadDown2"]
    },
    "eyes": {
        "blink": ["DeadEyes1", "DeadEyes2", "DeadEyes3", "DeadEyes4", "DeadEyes5"]
    },
    "mouth": {
        "talk": ["DeadMouth1", "DeadMouth2", "DeadMouth3"]
    }
}

function randomLinear(max, min) {
    return Math.floor(Math.random() * (max - min) + min);
}

function jsonToDivs(json) {
    document.write("<br><br>array index: " + json);
}

function hideAll(elements) {
    for (const frame of elements) {
        frame.style.display = 'none';
    }
}

function hideAll(elements, indexToShow) {
    for (let i = 0; i < elements.length; ++i) {
        const element = elements[i];
        element.style.display = (i == indexToShow) ? 'initial' : 'none';
    }
}

//credit to https://stackoverflow.com/a/722732
function process(key,value,lastkey) {
    const imgName = ("static".localeCompare(key) == 0) ? value : key;
    document.write('<div class="pngtuber ' + lastkey + '" id="' + value + '" style="background-image:url(\'' + localFolder + value + '.png\')"></div>');
}

function traverse(o,func,lastkey) {
    for (var i in o) {
        if (o[i] !== null && typeof(o[i])=="object") {
            //going one step down in the object tree!!
            traverse(o[i],func,(i.length <= 3) ? lastkey : i);
        } else {
            if ("".localeCompare(o[i]) != 0) {
                func.apply(this,[i,o[i],lastkey]);
            }
        }
    }
}

traverse(pngtuber,process,"pngtuber");

// credit to https://stackoverflow.com/questions/33322681/checking-microphone-volume-in-javascript/64650826#64650826 for the volume code
// Value range: 127 = analyser.maxDecibels - analyser.minDecibels;
// volumeVisualizer.style.setProperty('--volume', (averageVolume * 100 / 127) + '%');
// please edit all values below with this scale in mind to fine tune it to your needs
(async () => {
    // How often each audio process will poll (in ms)
    // Will be referring to each poll as a frame
    let volumePollTimeBlink = 45;
    let volumePollTimeTalk = 75;
    let volumePollTimePose = 60;

    // smoothing factor for audio processor
    let smoothingTimeConstantBlink = 0;
    let smoothingTimeConstantTalk = 0;
    let smoothingTimeConstantPose = 0.8;

    // thresholds for talking (mouth) and shouting (pose)
    // SmoothStart gives a buffer frame for two consecutive polls at a lower threshold
    let thresholdTalk = 50;
    let thresholdTalkSmoothStart = 45;
    let thresholdShoutStart = 70;
    let thresholdShoutSmoothStart = 60;
    let thresholdShoutEnd = 55;

    // How many frames after shout threshold is no longer met before exiting excited pose
    let maxExcitedEndBuffer = 8;
    let minExcitedEndBuffer = 3;
    let currentExcitedEndBuffer = 0;

    // How many frames of mouth while talking before a frame of closed mouth (no image)
    let minTalkIntervals = 2;
    let maxTalkIntervals = 4;
    let currentTalkIntervals = 0;

    // Failsafe so you don't get only one frame of mouth if you talk then immediately stop
    let minTalkLength = 3;
    let currentTalkLength = 0;

    // How many times your tick can appear consecutively, how many frames between each tick/each blink
    let tickQuantityMax = 3;
    let tickQuantityMin = 1;
    let tickDelayMax = 100;
    let tickDelayMin = 50;
    let blinkDelayMax = 80;
    let blinkDelayMin = 45;

    // Keep the rest of these as is, these are state variables
    let currentExitingIntervals = 0;
    let currentEnteringIntervals = 0;
    let currentTickDelay = 0;
    let currentTickQuantity = 0;
    let currentTickInterval = 0;
    let currentBlinkDelay = 0;
    let currentBlinkInterval = 0;

    let isTalk = false;
    let isTalkSmoothBuffer = false;
    let isTick = false;
    let isExcitedSmoothBuffer = false;
    let isExcited = false;
    let isNormal = true;

    let volumeCallbackBlink = null;
    let volumeCallbackTalk = null;
    let volumeCallbackPose = null;
    let volumeIntervalBlink = null;
    let volumeIntervalTalk = null;
    let volumeIntervalPose = null;

    let fftSize = 512;
    let minDecibels = -127;
    let maxDecibels = 0;

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false
        }
      });
      const audioContext = new AudioContext();
      const audioSource = audioContext.createMediaStreamSource(audioStream);

      const analyserBlink = audioContext.createAnalyser();
      analyserBlink.fftSize = fftSize;
      analyserBlink.minDecibels = minDecibels;
      analyserBlink.maxDecibels = maxDecibels;
      analyserBlink.smoothingTimeConstant = smoothingTimeConstantBlink;
      audioSource.connect(analyserBlink);
      volumeCallbackBlink = () => {
        // blink
        if (currentBlinkDelay == 0){
            if (currentBlinkInterval <= document.getElementsByClassName('blink').length) {
                hideAll(document.getElementsByClassName('blink'), currentBlinkInterval);
                currentBlinkInterval++;
            }
            if (currentBlinkInterval > document.getElementsByClassName('blink').length) {
                currentBlinkDelay = randomLinear(blinkDelayMax, blinkDelayMin);
                currentBlinkInterval = 0;
            }
        } else {
            currentBlinkDelay--;
        }
      };

      const analyserTalk = audioContext.createAnalyser();
      analyserTalk.fftSize = fftSize;
      analyserTalk.minDecibels = minDecibels;
      analyserTalk.maxDecibels = maxDecibels;
      analyserTalk.smoothingTimeConstant = smoothingTimeConstantTalk;
      audioSource.connect(analyserTalk);
      const volumesTalk = new Uint8Array(analyserTalk.frequencyBinCount);
      volumeCallbackTalk = () => {
        analyserTalk.getByteFrequencyData(volumesTalk);
        let volumeSum = 0;
        for(const volume of volumesTalk)
            volumeSum += volume;
        const averageVolume = volumeSum / volumesTalk.length;
        //console.log(averageVolume)

        isTalk = averageVolume >= thresholdTalk || (isTalkSmoothBuffer && averageVolume >= thresholdTalkSmoothStart)
                || (isTalk && (currentTalkIntervals != 0 || currentTalkLength < minTalkLength));
        currentTalkLength = isTalk ? currentTalkLength + 1 : 0;

        // talk
        if (isTalk && currentTalkIntervals != 0) {
            const frame = randomLinear(document.getElementsByClassName('talk').length, 0);
            hideAll(document.getElementsByClassName('talk'), frame);
            currentTalkIntervals--;
        } else if (currentTalkIntervals == 0) {
            hideAll(document.getElementsByClassName('talk'))
            currentTalkIntervals = isTalk ? randomLinear(maxTalkIntervals, minTalkIntervals) : 0;
        }

        isTalkSmoothBuffer = (averageVolume >= thresholdTalkSmoothStart);
      };

      const analyserPose = audioContext.createAnalyser();
      analyserPose.fftSize = fftSize;
      analyserPose.minDecibels = minDecibels;
      analyserPose.maxDecibels = maxDecibels;
      analyserPose.smoothingTimeConstant = smoothingTimeConstantPose;
      audioSource.connect(analyserPose);
      const volumesPose = new Uint8Array(analyserPose.frequencyBinCount);
      volumeCallbackPose = () => {
        analyserPose.getByteFrequencyData(volumesPose);
        let volumeSum = 0;
        for(const volume of volumesPose)
            volumeSum += volume;
        const averageVolume = volumeSum / volumesPose.length;
        //console.log(averageVolume)

        // entering
        if ((averageVolume >= thresholdShoutStart || (isExcitedSmoothBuffer && averageVolume >= thresholdShoutSmoothStart)
                || currentEnteringIntervals != 0) && !isExcited) {
            isNormal = false;
            document.getElementById(pngtuber["normal"]["static"]).style.display = 'none';
            isExcited = currentEnteringIntervals == document.getElementsByClassName('entering').length;
            if (currentEnteringIntervals <= document.getElementsByClassName('entering').length) {
                hideAll(document.getElementsByClassName('entering'), currentEnteringIntervals);
                currentEnteringIntervals++;
            }
            currentExitingIntervals = 0;
            hideAll(document.getElementsByClassName('exiting'));
            hideAll(document.getElementsByClassName('tick'));
            currentExcitedEndBuffer = randomLinear(maxExcitedEndBuffer, minExcitedEndBuffer);
            
            // excited
            if (isExcited) {
                document.getElementById(pngtuber["excited"]["static"]).style.display = 'initial';
            }
        }

        isExcitedSmoothBuffer = (averageVolume >= thresholdShoutSmoothStart);

        // exiting
        if (averageVolume < thresholdShoutEnd && !isNormal) {
            if (currentExcitedEndBuffer > 0) {
                currentExcitedEndBuffer--;
            } else {
                isExcited = false;
                document.getElementById(pngtuber["excited"]["static"]).style.display = 'none';
                isNormal = currentExitingIntervals == document.getElementsByClassName('exiting').length;
                if (currentExitingIntervals <= document.getElementsByClassName('exiting').length) {
                    hideAll(document.getElementsByClassName('exiting'), currentExitingIntervals);
                    currentExitingIntervals++;
                }
                currentEnteringIntervals = 0;
                hideAll(document.getElementsByClassName('entering'));

                // normal
                if (isNormal) {
                    document.getElementById(pngtuber["normal"]["static"]).style.display = 'initial';
                }
            }
        }

        if (currentTickQuantity == 0){
            isTick = false;
            currentTickDelay = randomLinear(tickDelayMax, tickDelayMin);
            currentTickQuantity = randomLinear(tickQuantityMax, tickQuantityMin);
        }
        
        // tick
        if (isNormal && !isTick) {
            currentTickDelay--;
            isTick = currentTickDelay == 0;
        }

        if (isNormal && isTick) {
            if (currentTickInterval <= document.getElementsByClassName('tick').length) {
                document.getElementById(pngtuber["normal"]["static"]).style.display = 'none';
                hideAll(document.getElementsByClassName('tick'), currentTickInterval);
                currentTickInterval++;
            }
            if (currentTickInterval > document.getElementsByClassName('tick').length) {
                document.getElementById(pngtuber["normal"]["static"]).style.display = 'initial';
                currentTickInterval = 0;
                currentTickQuantity--;
            }
        }
      };
    } catch(e) {
      console.error('Failed to initialize volume visualizer..', e);
    }
    volumeIntervalBlink = setInterval(volumeCallbackBlink, volumePollTimeBlink);
    volumeIntervalTalk = setInterval(volumeCallbackTalk, volumePollTimeTalk);
    volumeIntervalPose = setInterval(volumeCallbackPose, volumePollTimePose);
  })();