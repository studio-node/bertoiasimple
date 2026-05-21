document.addEventListener("DOMContentLoaded", () => {
    const gridContainer = document.getElementById("instrument-grid");
    const canvas = document.getElementById("spectrogram-canvas");
    const ctx = canvas.getContext("2d");
    const currentlyPlayingInfo = document.getElementById("currently-playing-info");

    // ── Splash Screen ──────────────────────────────────────────
    const splashScreen = document.getElementById("splash-screen");
    const splashStatus = document.getElementById("splash-status");
    const splashEnter = document.getElementById("splash-enter");

    function dismissSplash() {
        splashScreen.classList.add("hidden");
        setTimeout(() => splashScreen.remove(), 700);
    }

    splashEnter.addEventListener("click", dismissSplash);

    // Track instrument images — we'll register them after the grid renders
    function trackImageLoading(images) {
        if (images.length === 0) {
            splashStatus.style.display = "none";
            splashEnter.style.display = "inline-block";
            return;
        }
        let loaded = 0;
        const onLoad = () => {
            loaded++;
            if (loaded >= images.length) {
                splashStatus.style.display = "none";
                splashEnter.style.display = "inline-block";
            }
        };
        images.forEach(img => {
            if (img.complete) { onLoad(); }
            else {
                img.addEventListener("load", onLoad);
                img.addEventListener("error", onLoad); // count errors too
            }
        });
    }


    // Resize canvas to match its display size
    let canvasTransitioning = false;
    const CANVAS_FINAL_HEIGHT = 750; // matches .top-row.visible height in CSS

    const resizeCanvas = () => {
        if (!canvas) return;
        if (canvasTransitioning) return; // don't resize mid-animation
        canvas.width = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
        canvas.height = canvas.clientHeight || CANVAS_FINAL_HEIGHT;
    };
    window.addEventListener("resize", resizeCanvas);
    
    if (window.ResizeObserver && canvas.parentElement) {
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
        });
        resizeObserver.observe(canvas.parentElement);
    } else {
        resizeCanvas();
    }

    // Pre-sizes canvas to its final dimensions before the reveal animation
    // so overflow:hidden clips a fully-rendered canvas instead of a growing one
    function primeCanvasForReveal() {
        canvasTransitioning = true;
        const container = canvas.parentElement;
        canvas.width = container?.clientWidth || window.innerWidth * 0.65;
        canvas.height = CANVAS_FINAL_HEIGHT;
        // After transition completes (1.6s + buffer), unlock resizing
        setTimeout(() => {
            canvasTransitioning = false;
            resizeCanvas();
        }, 1800);
    }

    const fullscreenBtn = document.getElementById("fullscreen-btn");
    const canvasContainer = document.querySelector(".canvas-container");
    if (fullscreenBtn && canvasContainer) {
        fullscreenBtn.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                canvasContainer.requestFullscreen().catch(err => {
                    console.error("Error enabling fullscreen:", err);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    // 1. Setup Web Audio API
    let audioCtx;
    let analyser;
    let dataArray;
    let isAudioInitialized = false;

    // Instruments Configuration
    const instruments = [
        // GONGS
        { id: 'gong-verdigris', category: 'gongs', image: "Instruments/GONGS/verdigris/verdigris_transp.png", sound: "Instruments/GONGS/verdigris/1 Verdigris.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Verdigris", material: "Unknown", year: "Unknown" },
        { id: 'gong-catgong', category: 'gongs', image: "Instruments/GONGS/catgong/catgong.png", sound: "Instruments/GONGS/catgong/1m15s_Cat_Gong_edit2.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Cat Gong", material: "Unknown", year: "Unknown" },
        { id: 'gong-blue', category: 'gongs', image: "Instruments/GONGS/blue/blue.png", sound: "Instruments/GONGS/blue/blue.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Blue", material: "Unknown", year: "Unknown" },
        { id: 'gong-2plytall', category: 'gongs', image: "Instruments/GONGS/2 Ply Tall/2plytall.png", sound: "Instruments/GONGS/2 Ply Tall/1 (1).ogg", buffer: null, activeInstances: [], isLooping: false, name: "2 Ply Tall", material: "Unknown", year: "Unknown" },
        { id: 'gong-2plysquare', category: 'gongs', image: "Instruments/GONGS/2 ply square/2plysquare.png", sound: "Instruments/GONGS/2 ply square/2plysquare.wav", buffer: null, activeInstances: [], isLooping: false, name: "2 Ply Square", material: "Unknown", year: "Unknown" },
        { id: 'gong-round', category: 'gongs', image: "Instruments/GONGS/round gong by door/HUB_1151_GONG_TRANSP.png", sound: "Instruments/GONGS/round gong by door/1.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Round Gong", material: "Unknown", year: "Unknown" },
        { id: 'gong-gravegong', category: 'gongs', image: "Instruments/GONGS/gravegong/gravegong.png", sound: "Instruments/GONGS/gravegong/3s.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Grave Gong", material: "Unknown", year: "Unknown" },

        // SINGING BARS
        { id: 'bars-1', category: 'singing-bars', image: "Instruments/SINGING BARS/singingbars1/Screenshot 2026-03-17 at 5.14.01 PM.png", sound: "Instruments/SINGING BARS/singingbars1/1m16s_swinging bars_gong_drone_rods_LP.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Singing Bars 1", material: "Unknown", year: "Unknown" },

        // TONALS - TOPS
        { id: 'tops-1', category: 'tonals-tops', image: "Instruments/TONALS/tops/1 HUB_0531/1 HUB_0531-transparent.png", sound: "Instruments/TONALS/tops/1 HUB_0531/1 HUB_0531.ogg", buffer: null, activeInstances: [], isLooping: false, name: "1 HUB 0531", material: "Unknown", year: "Unknown" },
        { id: 'tops-2', category: 'tonals-tops', image: "Instruments/TONALS/tops/6 HUB_729/6 HUB_0729_transparent.png", sound: "Instruments/TONALS/tops/6 HUB_729/6 HUB_0729.ogg", buffer: null, activeInstances: [], isLooping: false, name: "6 HUB 0729", material: "Unknown", year: "Unknown" },
        { id: 'tops-3', category: 'tonals-tops', image: "Instruments/TONALS/tops/7 HUB_949/7 HUB_0949_transparent.png", sound: "Instruments/TONALS/tops/7 HUB_949/7 HUB_0949.ogg", buffer: null, activeInstances: [], isLooping: false, name: "7 HUB 0949", material: "Unknown", year: "Unknown" },
        { id: 'tops-4', category: 'tonals-tops', image: "Instruments/TONALS/tops/9 HUB_696/HUB_0696_transparent.png", sound: "Instruments/TONALS/tops/9 HUB_696/c 20s_thick tops_one hit_knocking decay_9.ogg", buffer: null, activeInstances: [], isLooping: false, name: "9 HUB 0696", material: "Unknown", year: "Unknown" },
        { id: 'tops-5', category: 'tonals-tops', image: "Instruments/TONALS/tops/3 HUB_960/3 HUB_0960_transparent.png", sound: "Instruments/TONALS/tops/3 HUB_960/3 HUB_0360.ogg", buffer: null, activeInstances: [], isLooping: false, name: "3 HUB 0960", material: "Unknown", year: "Unknown" },
        { id: 'tops-6', category: 'tonals-tops', image: "Instruments/TONALS/tops/8 HUB_584/a HUB_0584_transparent.png", sound: "Instruments/TONALS/tops/8 HUB_584/a 1m_thin tops  shimmering_UH_IB_1m.ogg", buffer: null, activeInstances: [], isLooping: false, name: "8 HUB 0584", material: "Unknown", year: "Unknown" },
        { id: 'tops-7', category: 'tonals-tops', image: "Instruments/TONALS/tops/4 HUB_749/4 HUB_0749_transparent.png", sound: "Instruments/TONALS/tops/4 HUB_749/4 HUB_0749.ogg", buffer: null, activeInstances: [], isLooping: false, name: "4 HUB 0749", material: "Unknown", year: "Unknown" },

        // TONALS - RODS
        { id: 'rods-1', category: 'tonals-rods', image: "Instruments/TONALS/rods/4 HUB_514/4 HUB_0514_transparent.png", sound: "Instruments/TONALS/rods/4 HUB_514/4_HUB_0514.ogg", buffer: null, activeInstances: [], isLooping: false, name: "4 HUB 0514", material: "Unknown", year: "Unknown" },
        { id: 'rods-2', category: 'tonals-rods', image: "Instruments/TONALS/rods/3 HUB_724/3 HUB_0724_transparent.png", sound: "Instruments/TONALS/rods/3 HUB_724/3_HUB_0724.ogg", buffer: null, activeInstances: [], isLooping: false, name: "3 HUB 0724", material: "Unknown", year: "Unknown" },
        { id: 'rods-3', category: 'tonals-rods', image: "Instruments/TONALS/rods/1 HUB_399/1 HUB_0399_transparent.png", sound: "Instruments/TONALS/rods/1 HUB_399/1_HUB_0399.ogg", buffer: null, activeInstances: [], isLooping: false, name: "1 HUB 0399", material: "Unknown", year: "Unknown" },
        { id: 'rods-4', category: 'tonals-rods', image: "Instruments/TONALS/rods/10 HUB_521/10 HUB_0521_transparent.png", sound: "Instruments/TONALS/rods/10 HUB_521/10 HUB_0521.ogg", buffer: null, activeInstances: [], isLooping: false, name: "10 HUB 0521", material: "Unknown", year: "Unknown" },
        { id: 'rods-5', category: 'tonals-rods', image: "Instruments/TONALS/rods/5 HUB_663/5 HUB_0663_transparent.png", sound: "Instruments/TONALS/rods/5 HUB_663/5_HUB_0663.ogg", buffer: null, activeInstances: [], isLooping: false, name: "5 HUB 0663", material: "Unknown", year: "Unknown" },
        { id: 'rods-6', category: 'tonals-rods', image: "Instruments/TONALS/rods/2A HUB_854/2 HUB_0854_transparent.png", sound: "Instruments/TONALS/rods/2A HUB_854/2A_HUB_0854.ogg", buffer: null, activeInstances: [], isLooping: false, name: "2A HUB 0854", material: "Unknown", year: "Unknown" },
        { id: 'rods-7', category: 'tonals-rods', image: "Instruments/TONALS/rods/2 HUB_0663/2 HUB_0663_transparent.png", sound: "Instruments/TONALS/rods/2 HUB_0663/2 vidsource2.ogg", buffer: null, activeInstances: [], isLooping: false, name: "2 HUB 0663", material: "Unknown", year: "Unknown" }
    ];
    if (currentlyPlayingInfo) {
        currentlyPlayingInfo.addEventListener("click", (e) => {
            const stopBtn = e.target.closest('.stop-btn');
            if (stopBtn) {
                e.preventDefault();
                const id = stopBtn.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item && item.activeInstances.length > 0) {
                    const tile = document.querySelector(`.instrument-tile[data-id="${id}"]`);
                    if (tile) handleTileClick(item, tile);
                }
            }

            const loopBtn = e.target.closest('.loop-btn');
            if (loopBtn) {
                e.preventDefault();
                const id = loopBtn.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item) {
                    item.isLooping = !item.isLooping;
                    item.activeInstances.forEach(inst => {
                        if (inst.source) inst.source.loop = item.isLooping;
                    });
                    renderCurrentlyPlaying();
                }
            }

            const pauseBtn = e.target.closest('.pause-btn');
            if (pauseBtn) {
                e.preventDefault();
                const id = pauseBtn.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item && item.activeInstances.length > 0) {
                    const instance = item.activeInstances[0];
                    const tile = document.querySelector(`.instrument-tile[data-id="${id}"]`);
                    
                    if (instance.isPaused) {
                        // Resume playback
                        playAtOffset(item, tile, instance.pauseOffset);
                    } else {
                        // Pause playback
                        instance.isPaused = true;
                        let elapsed = audioCtx.currentTime - instance.startTime;
                        if (item.isLooping) elapsed = elapsed % instance.duration;
                        instance.pauseOffset = Math.min(elapsed, instance.duration);
                        stopInstance(instance, 0.1); 
                        renderCurrentlyPlaying();
                    }
                }
            }
        });

        currentlyPlayingInfo.addEventListener("input", (e) => {
            if (e.target.classList.contains('scrubber')) {
                const id = e.target.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item) item.isScrubbing = true;
            }
        });

        currentlyPlayingInfo.addEventListener("change", (e) => {
            if (e.target.classList.contains('scrubber')) {
                const id = e.target.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item && item.activeInstances.length > 0) {
                    const tile = document.querySelector(`.instrument-tile[data-id="${id}"]`);
                    const instance = item.activeInstances[0];
                    const newOffset = (parseFloat(e.target.value) / 100) * instance.duration;
                    
                    item.isScrubbing = false;
                    
                    if (!instance.isPaused) {
                        stopInstance(instance, 0.1);
                        playAtOffset(item, tile, newOffset);
                    } else {
                        instance.pauseOffset = newOffset;
                    }
                }
            }
        });
    }
    function renderCurrentlyPlaying() {
        if (!currentlyPlayingInfo) return;
        
        const playingInstruments = instruments.filter(inst => inst.activeInstances.length > 0);
        const topRow = document.querySelector(".top-row");
        
        if (playingInstruments.length === 0) {
            currentlyPlayingInfo.innerHTML = '';
            return;
        }

        if (topRow) topRow.classList.add("visible");
        
        currentlyPlayingInfo.innerHTML = playingInstruments.map(item => {
            const materialStr = item.material === 'Unknown' ? '' : `<p>material: ${item.material}</p>`;
            const yearStr = item.year === 'Unknown' ? '' : `<p>made ${item.year}</p>`;
            const isPaused = item.activeInstances[0]?.isPaused;

            return `
                <div class="playing-item">
                    <img src="${item.image || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="${item.name}">
                    <div class="info-details">
                        <p><strong>${item.name}</strong></p>
                        <input type="range" id="prog-${item.id}" class="mini-progress scrubber" min="0" max="100" value="0" step="0.1" data-id="${item.id}">
                        <div class="playing-controls">
                            <button class="control-btn loop-btn ${item.isLooping ? 'active' : ''}" data-id="${item.id}" title="Toggle Loop">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                            </button>
                            <button class="control-btn pause-btn" data-id="${item.id}" title="${isPaused ? 'Play' : 'Pause'}">
                                ${isPaused ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'}
                            </button>
                            <button class="control-btn stop-btn" data-id="${item.id}" title="Stop Audio">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
                            </button>
                        </div>
                        ${materialStr}
                        ${yearStr}
                    </div>
                </div>
            `;
        }).join('');
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

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

    const categoryVolumes = {
        'gongs': 0.8,
        'singing-bars': 0.9,
        'tonals-tops': 0.7,
        'tonals-rods': 0.8
    };

    function stopInstance(instance, fadeOutDuration = 1.5) {
        instance.manualStop = true;
        if (instance.gainNode && !instance.isPaused) {
            const now = audioCtx.currentTime;
            instance.gainNode.gain.cancelScheduledValues(now);
            instance.gainNode.gain.setValueAtTime(instance.gainNode.gain.value, now);
            instance.gainNode.gain.linearRampToValueAtTime(0, now + fadeOutDuration);
            setTimeout(() => {
                try { instance.source.stop(); } catch (e) {}
                instance.gainNode.disconnect();
            }, fadeOutDuration * 1000 + 50);
        } else {
            try { instance.source.stop(); } catch (e) {}
        }
    }

    async function playAtOffset(item, tileElement, offset = 0) {
        const buffer = await loadAudioBuffer(item);
        if (!buffer) return;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        
        const gainNode = audioCtx.createGain();
        const targetVolume = categoryVolumes[item.category] || 1.0;
        
        // Fade in
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(targetVolume, audioCtx.currentTime + 0.15);
        
        // Natural end fade out (1s) if not looping
        if (!item.isLooping && offset < buffer.duration) {
            const timeRemaining = buffer.duration - offset;
            if (timeRemaining > 1.0) {
                gainNode.gain.setValueAtTime(targetVolume, audioCtx.currentTime + timeRemaining - 1.0);
                gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + timeRemaining);
            }
        }
        
        source.connect(gainNode);
        gainNode.connect(analyser); // Connect straight to master visualizer

        const instance = {
            source: source,
            gainNode: gainNode,
            startTime: audioCtx.currentTime - offset,
            duration: buffer.duration,
            isPaused: false,
            pauseOffset: 0
        };

        if (item.isLooping) {
            source.loop = true;
        }

        source.onended = () => {
            if (instance.isPaused || instance.manualStop) return;

            const index = item.activeInstances.indexOf(instance);
            if (index > -1) {
                item.activeInstances.splice(index, 1);
            }

            if (item.activeInstances.length === 0) {
                if (tileElement) tileElement.classList.remove("active");
            }
            renderCurrentlyPlaying();
        };

        source.start(0, offset);
        startAnimate(); // Wake the visualizer loop
        if (item.activeInstances.length > 0) {
            item.activeInstances[0] = instance; // Replace paused instance
        } else {
            item.activeInstances.push(instance);
        }
        
        if (tileElement) tileElement.classList.add("active");
        renderCurrentlyPlaying();
    }

    // Handles both starting and stopping sounds (toggle)
    function handleTileClick(item, tileElement) {
        if (!audioCtx) initAudio();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (item.activeInstances.length > 0) {
            const instance = item.activeInstances[0];
            stopInstance(instance, 1.5); // 1.5s manual stop fade
            item.activeInstances = [];
            tileElement.classList.remove("active");
            renderCurrentlyPlaying();
            return;
        }

        // Pre-size canvas & lock resizing so the grow animation is glitch-free
        primeCanvasForReveal();

        // Reveal visualizer & start animation immediately — don't wait for buffer load
        const topRow = document.querySelector(".top-row");
        if (topRow) topRow.classList.add("visible");
        startAnimate();

        playAtOffset(item, tileElement, 0);
    }

    // Update mini progress bars in the Currently Playing section
    function updateProgressBars() {
        if (audioCtx) {
            const currentTime = audioCtx.currentTime;

            instruments.forEach(item => {
                if (item.activeInstances.length === 0) return;

                const instance = item.activeInstances[0];
                const progEl = document.getElementById(`prog-${item.id}`);
                
                if (progEl && !item.isScrubbing) {
                    let progress = 0;
                    if (instance.isPaused) {
                        progress = instance.pauseOffset / instance.duration;
                    } else {
                        const elapsed = currentTime - instance.startTime;
                        const currentLoopPos = elapsed % instance.duration;
                        progress = Math.min(1, Math.max(0, currentLoopPos / instance.duration));
                    }
                    progEl.value = progress * 100;
                    // Update visual background of range slider
                    progEl.style.background = `linear-gradient(to right, #b87333 ${progEl.value}%, var(--placeholder-bg) ${progEl.value}%)`;
                }
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
            img.loading = "lazy"; // Defer off-screen images
        } else {
            // Placeholder tiny transparent pixel if no img
            img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            tile.classList.add("placeholder");
        }
        img.alt = `Instrument ${item.id}`;

        tile.appendChild(img);
        
        // Append to specific category grid
        let targetContainerId = "grid-gongs"; // Default
        if (item.category === 'singing-bars') targetContainerId = "grid-singing-bars";
        else if (item.category === 'tonals-tops') targetContainerId = "grid-tonals-tops";
        else if (item.category === 'tonals-rods') targetContainerId = "grid-tonals-rods";

        const targetContainer = document.getElementById(targetContainerId);
        
        // Wrap tile
        const wrapper = document.createElement("div");
        wrapper.classList.add("tile-wrapper");
        
        wrapper.appendChild(tile);
        if (targetContainer) targetContainer.appendChild(wrapper);

        if (item.image) {
            tile.addEventListener("click", () => handleTileClick(item, tile));
        }
    });

    // Start tracking image loads for the splash screen
    const allTileImages = Array.from(document.querySelectorAll(".instrument-tile img[loading='lazy']"));
    trackImageLoading(allTileImages);

    // 4. Spectrogram Animation Loop
    let time = 0;
    let animating = false;

    // We will keep a history (or inertia) for each line to give it elastic physics
    const numLines = 65;
    const lineInertia = Array(numLines).fill(0);

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
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

        const verticalPadding = 20; // Minimal padding so lines fill the canvas
        const availableHeight = canvas.height - (verticalPadding * 2);
        const lineSpacing = availableHeight / numLines;
        const lineSegments = 40;
        const segmentWidth = canvas.width / lineSegments;

        for (let i = 0; i < numLines; i++) {
            // i=0 is lowest frequency (bottom of screen)
            const baseY = canvas.height - verticalPadding - (i * lineSpacing) - (lineSpacing / 2);

            let targetAmplitude = 0;
            if (isAudioInitialized) {
                const freqIndex = Math.floor((i / numLines) * 60);
                const rawAmp = dataArray[freqIndex] / 255;
                targetAmplitude = Math.pow(rawAmp, 1.5);
            }

            lineInertia[i] += (targetAmplitude - lineInertia[i]) * 0.1;
            const amplitude = lineInertia[i];

            ctx.beginPath();

            for (let j = 0; j <= lineSegments; j++) {
                const x = j * segmentWidth;
                let y = baseY;

                const waveScale = amplitude * 40;
                if (waveScale > 0.1) {
                    const ripple = Math.sin((j * 0.2) - (time * 5) + (i * 0.1)) * waveScale;
                    const detailRipple = Math.cos((j * 0.5) - (time * 2)) * (waveScale * 0.3);
                    const edgeTaper = Math.sin((j / lineSegments) * Math.PI);

                    y -= (ripple + detailRipple) * edgeTaper;
                }

                y += Math.sin(time + (i * 0.2) + (j * 0.1)) * 1.5;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            // Thickness increases slightly with volume
            const baseLineWidth = 1 + (amplitude * 6);

            // Copper orange: hue in orange-copper range, punchier saturation
            const irid = Math.sin(time * 0.6 + i * 0.12) * 2.5;
            const h = 22 + irid;
            const s = Math.floor(38 + amplitude * 28);
            const l = Math.floor(34 + amplitude * 24 + Math.min(20, amplitude * amplitude * 36));
            const a = 0.42 + amplitude * 0.48;

            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            // To optimize heavily, we skip the shadowBlur API entirely.
            // Fake a glow by drawing a transparent fat line underneath, then the core outline on top.
            const isMobile = window.innerWidth <= 768;

            if (amplitude > 0.05) {
                const glowGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
                glowGrad.addColorStop(0, `hsla(${h}, 40%, 48%, 0.11)`);
                if (isMobile) {
                    glowGrad.addColorStop(1, `hsla(${h}, 40%, 48%, 0.11)`);
                } else {
                    glowGrad.addColorStop(0.9, `hsla(${h}, 40%, 48%, 0.11)`);
                    glowGrad.addColorStop(1, `hsla(${h}, 40%, 48%, 0)`);
                }

                ctx.lineWidth = baseLineWidth + (amplitude * 20);
                ctx.strokeStyle = glowGrad;
                ctx.stroke();
            }

            // Core visible line
            const coreGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
            coreGrad.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, ${a})`);
            if (isMobile) {
                coreGrad.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, ${a})`);
            } else {
                coreGrad.addColorStop(0.9, `hsla(${h}, ${s}%, ${l}%, ${a})`);
                coreGrad.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);
            }

        ctx.lineWidth = baseLineWidth;
        ctx.strokeStyle = coreGrad;
        ctx.stroke();
        }

        // Check if any lines still have inertia - if not and no audio, we can rest
        const stillMoving = lineInertia.some(v => v > 0.001);
        if (isAudioInitialized && instruments.some(i => i.activeInstances.length > 0)) {
            requestAnimationFrame(animate);
        } else if (stillMoving) {
            requestAnimationFrame(animate);
        } else {
            // Clear to white and stop looping until next play
            animating = false;
        }
    }

    function startAnimate() {
        if (!animating) {
            animating = true;
            requestAnimationFrame(animate);
        }
    }

    // Start animation loop
    startAnimate();
});
