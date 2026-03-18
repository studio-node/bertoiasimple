document.addEventListener("DOMContentLoaded", () => {
    const gridContainer = document.getElementById("instrument-grid");
    const canvas = document.getElementById("spectrogram-canvas");
    const ctx = canvas.getContext("2d");

    // Resize canvas to match its display size
    const resizeCanvas = () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // 1. Setup Web Audio API
    let audioCtx;
    let analyser;
    let dataArray;
    let isAudioInitialized = false;

    // Instruments Configuration
    const instruments = [
        // Tonals
        { id: 'tonal-1', category: 'tonals', image: "top1/tonal1.png", sound: "top1/1m_heavy strumming_percussive_drones_IH_t46.wav", buffer: null, activeInstances: [] },
        { id: 'tonal-2', category: 'tonals', image: null, sound: "top1/1m_heavy strumming_percussive_drones_IH_t46.wav", buffer: null, activeInstances: [] },
        { id: 'tonal-3', category: 'tonals', image: null, sound: "top1/1m_heavy strumming_percussive_drones_IH_t46.wav", buffer: null, activeInstances: [] },

        // Gongs
        { id: 'gong-1', category: 'gongs', image: "gong1/Screenshot 2026-03-17 at 4.57.04 PM.png", sound: "gong1/1m15s_gong_rods strummed_percussive gong.wav", buffer: null, activeInstances: [] },
        { id: 'gong-2', category: 'gongs', image: null, sound: "gong1/1m15s_gong_rods strummed_percussive gong.wav", buffer: null, activeInstances: [] },
        { id: 'gong-3', category: 'gongs', image: null, sound: "gong1/1m15s_gong_rods strummed_percussive gong.wav", buffer: null, activeInstances: [] },

        // Singing Bars
        { id: 'bar-1', category: 'singing-bars', image: "swinging bars1/Screenshot 2026-03-17 at 5.14.01 PM.png", sound: "swinging bars1/1m16s_swinging bars_gong_drone_rods_LP.wav", buffer: null, activeInstances: [] },
        { id: 'bar-2', category: 'singing-bars', image: null, sound: "swinging bars1/1m16s_swinging bars_gong_drone_rods_LP.wav", buffer: null, activeInstances: [] },
        { id: 'bar-3', category: 'singing-bars', image: null, sound: "swinging bars1/1m16s_swinging bars_gong_drone_rods_LP.wav", buffer: null, activeInstances: [] }
    ];

    // 2. Custom Spectrogram Setup
    // No explicit initialization needed, we will draw lines based on canvas dimensions dynamically.

    function initAudio() {
        if (isAudioInitialized) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024; // 512 frequency bins
        analyser.smoothingTimeConstant = 0.8;
        analyser.connect(audioCtx.destination);

        dataArray = new Uint8Array(analyser.frequencyBinCount);
        isAudioInitialized = true;
    }

    async function loadAudioBuffer(item) {
        if (item.buffer) return item.buffer;
        try {
            const response = await fetch(item.sound);
            const arrayBuffer = await response.arrayBuffer();
            item.buffer = await audioCtx.decodeAudioData(arrayBuffer);
            return item.buffer;
        } catch (error) {
            console.error("Error loading audio buffer:", error);
        }
    }

    // Handles both starting and stopping sounds
    function handleTileClick(item, tileElement) {
        if (!audioCtx) initAudio();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (item.activeInstances.length > 0) {
            const oldestInstance = item.activeInstances.shift();
            oldestInstance.source.stop();
            return;
        }

        const play = async () => {
            const buffer = await loadAudioBuffer(item);
            if (!buffer) return;

            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(analyser); // Connect straight to master visualizer

            const instance = {
                source: source,
                startTime: audioCtx.currentTime,
                duration: buffer.duration
            };

            item.activeInstances.push(instance);
            tileElement.classList.add("active");

            source.onended = () => {
                const index = item.activeInstances.indexOf(instance);
                if (index > -1) {
                    item.activeInstances.splice(index, 1);
                }

                if (item.activeInstances.length === 0) {
                    tileElement.classList.remove("active");
                }
            };

            source.start(0);
        };
        play();
    }

    // Wavy Liquid Progress Fill (Gentle depleting wave)
    function updateProgressBars() {
        if (audioCtx) {
            const currentTime = audioCtx.currentTime;

            instruments.forEach(item => {
                const c = item.canvas;
                const ctx = item.canvasCtx;
                if (!ctx || !c) return;

                if (item.activeInstances.length === 0) {
                    if (item.wasActive) {
                        ctx.clearRect(0, 0, c.width, c.height);
                        item.wasActive = false;
                    }
                    return;
                }

                item.wasActive = true;
                ctx.clearRect(0, 0, c.width, c.height);

                // 2. Draw a flat depleting line per active playback (stacked/overlayed)
                item.activeInstances.forEach((instance, index) => {
                    const elapsed = currentTime - instance.startTime;
                    // Ensure we stay within 0-1 bounds
                    const progress = Math.min(1, Math.max(0, elapsed / instance.duration));

                    const fillRatio = 1 - progress;
                    const targetY = c.height - (c.height * fillRatio);

                    ctx.beginPath();
                    ctx.moveTo(0, targetY);
                    ctx.lineTo(c.width, targetY);

                    // Complete the polygon down to the bounding box bottom
                    ctx.lineTo(c.width, c.height);
                    ctx.lineTo(0, c.height);
                    ctx.closePath();

                    // Fill style representing the water
                    ctx.fillStyle = `rgba(144, 202, 249, 0.35)`;
                    ctx.fill();

                    // Draw a crisp solid line on top to define edge
                    ctx.beginPath();
                    ctx.moveTo(0, targetY);
                    ctx.lineTo(c.width, targetY);
                    ctx.strokeStyle = `rgba(173, 216, 230, 0.8)`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });
            });
        }
        requestAnimationFrame(updateProgressBars);
    }
    updateProgressBars();

    // 3. Render Grid
    instruments.forEach((item) => {
        const tile = document.createElement("div");
        tile.classList.add("instrument-tile");
        tile.dataset.id = item.id;
        item.wasActive = false;

        // Start them visually as blank squares to match the Figma closely when no instrument image is assigned, 
        // using the background-color and ensuring the container size holds.
        const img = document.createElement("img");
        if (item.image) {
            img.src = item.image;
        } else {
            // Placeholder tiny transparent pixel if no img
            img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            tile.style.background = "#ffffff"; // Blank white tile as per Figma design
            tile.classList.add("placeholder");
        }
        img.alt = `Instrument ${item.id}`;

        // Setup canvas overlay for liquid wave
        const progressCanvas = document.createElement("canvas");
        progressCanvas.classList.add("progress-canvas");
        // Fixed dimension matching layout eliminates layout thrashing in rAF
        progressCanvas.width = 118; // Scaled down 25% from 157px
        progressCanvas.height = 118;

        item.canvas = progressCanvas;
        item.canvasCtx = progressCanvas.getContext('2d', { alpha: true });

        tile.appendChild(img);
        tile.appendChild(progressCanvas);

        // Append to specific category grid
        let targetContainerId = "grid-tonals"; // Default
        if (item.category === 'gongs') targetContainerId = "grid-gongs";
        else if (item.category === 'singing-bars') targetContainerId = "grid-singing-bars";

        const targetContainer = document.getElementById(targetContainerId);
        if (targetContainer) targetContainer.appendChild(tile);

        if (item.image) {
            tile.addEventListener("click", () => {
                handleTileClick(item, tile);
            });
        }
    });

    // 4. Spectrogram Animation Loop
    let time = 0;

    // We will keep a history (or inertia) for each line to give it elastic physics
    const numLines = 65;
    const lineInertia = Array(numLines).fill(0);

    function animate() {
        requestAnimationFrame(animate);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Deep black/grey background to match mockup
        const bgGrad = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, canvas.width
        );
        bgGrad.addColorStop(0, "rgba(10, 15, 20, 1)");
        bgGrad.addColorStop(1, "rgba(0, 5, 10, 1)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let overallEnergy = 0;

        if (isAudioInitialized) {
            analyser.getByteFrequencyData(dataArray);
            for (let i = 0; i < dataArray.length; i++) {
                overallEnergy += dataArray[i];
            }
            overallEnergy /= dataArray.length;
        }

        // Speed of the organic "breathing" increases slightly with volume
        time += 0.01 + ((overallEnergy / 255) * 0.03);

        const lineSpacing = canvas.height / numLines;
        const lineSegments = 40; // Break line into segments to curve it
        const segmentWidth = canvas.width / lineSegments;

        for (let i = 0; i < numLines; i++) {
            // i=0 is lowest frequency (bottom of screen)
            const baseY = canvas.height - (i * lineSpacing) - (lineSpacing / 2);

            let targetAmplitude = 0;
            if (isAudioInitialized) {
                // Focus tightly on the very low end (bass/ambient drones)
                // By multiplying by only 50 bins instead of 200, we stretch the lowest
                // frequencies across the entire vertical height of the 65 lines.
                // This means deep drones will hit the middle and upper lines too.
                const freqIndex = Math.floor((i / numLines) * 60);
                const rawAmp = dataArray[freqIndex] / 255;
                targetAmplitude = Math.pow(rawAmp, 1.5);
            }

            // Smooth physics interpolation for the amplitude (elasticity)
            lineInertia[i] += (targetAmplitude - lineInertia[i]) * 0.1;
            const amplitude = lineInertia[i];

            ctx.beginPath();

            for (let j = 0; j <= lineSegments; j++) {
                const x = j * segmentWidth;
                let y = baseY;

                // Add an organic flowing wave that runs left-to-right
                // The wave gets much larger based on the frequency amplitude
                const waveScale = amplitude * 40;
                if (waveScale > 0.1) {
                    const ripple = Math.sin((j * 0.2) - (time * 5) + (i * 0.1)) * waveScale;
                    const detailRipple = Math.cos((j * 0.5) - (time * 2)) * (waveScale * 0.3);
                    const edgeTaper = Math.sin((j / lineSegments) * Math.PI);

                    y -= (ripple + detailRipple) * edgeTaper;
                }

                // Also add a subtle "breathing" even when silent
                y += Math.sin(time + (i * 0.2) + (j * 0.1)) * 1.5;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            // Thickness increases slightly with volume
            const baseLineWidth = 1 + (amplitude * 6);

            // Color brightens and shifts with volume
            let h = 210; // Blue/Cyan
            let s = Math.floor(amplitude * 80);
            let l = Math.floor(40 + Math.min(60, amplitude * 120));
            let a = 0.3 + (amplitude * 0.7);

            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            // To optimize heavily, we skip the shadowBlur API entirely.
            // Fake a glow by drawing a transparent fat line underneath, then the core outline on top.
            if (amplitude > 0.05) {
                ctx.lineWidth = baseLineWidth + (amplitude * 20); // Fat underlying glow
                ctx.strokeStyle = `hsla(${h}, 100%, 70%, 0.15)`;
                ctx.stroke();
            }

            // Core visible line
            ctx.lineWidth = baseLineWidth;
            ctx.strokeStyle = `hsla(${h}, ${s}%, ${l}%, ${a})`;
            ctx.stroke();
        }
    }

    // Start animation loop
    animate();
});
