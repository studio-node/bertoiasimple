document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("spectrogram-canvas");
    const ctx = canvas.getContext("2d");
    const currentlyPlayingInfo = document.getElementById("currently-playing-info");

    // ── Splash Screen ──────────────────────────────────────────
    const splashScreen = document.getElementById("splash-screen");
    const splashStatus = document.getElementById("splash-status");
    const splashEnter = document.getElementById("splash-enter");

    function dismissSplash() {
        document.body.classList.remove("splash-active");
        document.body.style.overflow = "";
        if (splashScreen) {
            splashScreen.classList.add("hidden");
            setTimeout(() => splashScreen.remove(), 700);
        }
    }

    if (splashScreen) {
        splashScreen.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
        splashEnter.addEventListener("click", dismissSplash);
    }

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


    // Dynamic canvas height calculation for desktop, mobile, and fullscreen modes
    const CANVAS_DESKTOP_HEIGHT = 540;
    const CANVAS_MOBILE_HEIGHT = 220;
    let maskGrad = null;

    const fullscreenBtn = document.getElementById("fullscreen-btn");
    const canvasContainer = document.querySelector(".canvas-container");

    const getTargetCanvasHeight = () => {
        if (document.fullscreenElement || canvasContainer?.classList.contains("fullscreen-active")) {
            return window.innerHeight;
        }
        if (window.innerWidth <= 768) {
            return CANVAS_MOBILE_HEIGHT;
        }
        return CANVAS_DESKTOP_HEIGHT;
    };

    let numLines = 65;
    let lineSegments = 40;
    let edgeTaperCache = Array.from({ length: 41 }, (_, j) => Math.sin((j / 40) * Math.PI));
    let lineInertia = Array(numLines).fill(0);

    function updateLineCount() {
        if (!canvas) return;
        const targetHeight = canvas.height || 540;
        const calculatedLines = Math.max(32, Math.floor(targetHeight / 8.3));
        if (calculatedLines !== numLines || lineInertia.length !== numLines) {
            numLines = calculatedLines;
            lineInertia = Array(numLines).fill(0);
        }
    }

    const resizeCanvas = () => {
        if (!canvas) return;
        canvas.width = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
        const targetHeight = getTargetCanvasHeight();
        canvas.height = targetHeight;
        
        updateLineCount();
        
        const isMobile = window.innerWidth <= 768;
        maskGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        maskGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        if (isMobile) {
            maskGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
        } else {
            maskGrad.addColorStop(0.9, 'rgba(0, 0, 0, 1)');
            maskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const preventFullscreenTouch = (e) => {
        if (e.target.closest('#fullscreen-btn')) return;
        e.preventDefault();
    };

    function toggleFullscreenState(isFullscreen) {
        if (!fullscreenBtn || !canvasContainer) return;
        const textSpan = fullscreenBtn.querySelector('.fullscreen-text');
        if (isFullscreen) {
            if (textSpan) textSpan.textContent = "Exit full screen";
            canvasContainer.classList.add("fullscreen-active");
            document.body.classList.add("fullscreen-open");
            document.body.style.overflow = "hidden";
            window.addEventListener("touchmove", preventFullscreenTouch, { passive: false });
        } else {
            if (textSpan) textSpan.textContent = "Go full screen";
            canvasContainer.classList.remove("fullscreen-active");
            document.body.classList.remove("fullscreen-open");
            document.body.style.overflow = "";
            window.removeEventListener("touchmove", preventFullscreenTouch);
        }
        resizeCanvas();
    }

    if (fullscreenBtn && canvasContainer) {
        fullscreenBtn.addEventListener("click", async () => {
            const isFallbackActive = canvasContainer.classList.contains("fullscreen-active");
            
            if (isFallbackActive || document.fullscreenElement) {
                if (document.fullscreenElement && document.exitFullscreen) {
                    try { await document.exitFullscreen(); } catch (e) {}
                }
                toggleFullscreenState(false);
                return;
            }

            // Try native Fullscreen API first
            if (canvasContainer.requestFullscreen) {
                try {
                    await canvasContainer.requestFullscreen();
                    toggleFullscreenState(true);
                } catch (err) {
                    console.warn("Native requestFullscreen failed, enabling fallback fullscreen:", err);
                    toggleFullscreenState(true);
                }
            } else if (canvasContainer.webkitRequestFullscreen) {
                try {
                    canvasContainer.webkitRequestFullscreen();
                    toggleFullscreenState(true);
                } catch (err) {
                    toggleFullscreenState(true);
                }
            } else {
                // Fallback for iOS Safari / restricted browsers
                toggleFullscreenState(true);
            }
        });

        document.addEventListener("fullscreenchange", () => {
            const isNativeFull = !!document.fullscreenElement;
            if (!isNativeFull && canvasContainer.classList.contains("fullscreen-active")) {
                toggleFullscreenState(false);
            } else if (isNativeFull) {
                toggleFullscreenState(true);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && canvasContainer.classList.contains("fullscreen-active")) {
                if (document.fullscreenElement && document.exitFullscreen) {
                    try { document.exitFullscreen(); } catch (err) {}
                }
                toggleFullscreenState(false);
            }
        });
    }

    // 1. Setup Web Audio API
    let audioCtx;
    let analyser;
    let dataArray;
    let isAudioInitialized = false;

    // Instruments Configuration
    // Instruments Configuration
    const instruments = [
        // GONGS
        { id: 'single-ply', category: 'gongs', image: "Instruments/Gongs/Single Ply/verdigris_transp.webp", sound: "Instruments/Gongs/Single Ply/1 Verdigris.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Single Ply", material: "Bronze", year: "Made in the 1970s", size: "48 × .125 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=339" },
        { id: 'cat-gong', category: 'gongs', image: "Instruments/Gongs/Cat Gong/catgong.webp", sound: "Instruments/Gongs/Cat Gong/1m15s_Cat_Gong_edit2.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Cat Gong", material: "Copper and bronze", year: "Made in the 1970s", size: "120 1/2 × 34 in. (306.1 × 86.4 cm)", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=3856" },
        // { id: 'blue', category: 'gongs', image: "Instruments/Gongs/Blue/blue.webp", sound: "Instruments/Gongs/Blue/blue.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Blue", material: "Unknown", year: "Unknown" },
        { id: 'double-walled', category: 'gongs', image: "Instruments/Gongs/Double Walled/2plytall.webp", sound: "Instruments/Gongs/Double Walled/1 (1).ogg", buffer: null, activeInstances: [], isLooping: false, name: "Double Walled", material: "Silicon bronze", year: "Made in the 1970s", size: "72 × .5 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=217" },
        { id: 'square', category: 'gongs', image: "Instruments/Gongs/Square/2plysquare.webp", sound: "Instruments/Gongs/Square/2plysquare.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Square", material: "Silicon bronze", year: "Made in the 1970s", size: "48 × 48 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=187" },
        // { id: 'round-gong', category: 'gongs', image: "Instruments/Gongs/Round Gong/HUB_1151_GONG_TRANSP.webp", sound: "Instruments/Gongs/Round Gong/1.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Round Gong", material: "Unknown", year: "Unknown" },
        { id: 'grave-gong', category: 'gongs', image: "Instruments/Gongs/Grave Gong/gravegongfooter.webp", sound: "Instruments/Gongs/Grave Gong/3s.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Grave Gong", material: "Bronze", year: "Made in 1975", size: "120 × 4 in.", link: "https://harrybertoia.org/gongs/" },

        // SINGING BARS
        { id: 'short-thicker', category: 'singing-bars', image: "Instruments/Singing Bars/Short Thicker/singingbar1.webp", sound: "Instruments/Singing Bars/Short Thicker/shortthickSOSB2.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Short Thicker", material: "Beryllium copper", year: "Made in the 1970s", size: "8 × 7/8 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=333" },
        { id: 'short-thick', category: 'singing-bars', image: "Instruments/Singing Bars/Short Thick/sb01.webp", sound: "Instruments/Singing Bars/Short Thick/sosb11.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Short Thick", material: "Beryllium copper", year: "Made in the 1970s", size: "8.75 × 1.125 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=334" },
        { id: 'long-bars', category: 'singing-bars', image: "Instruments/Singing Bars/Long Bars/singingbar3.webp", sound: "Instruments/Singing Bars/Long Bars/longbarsSOSB4.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Long Bars", material: "Beryllium copper", year: "Made in the 1970s", size: "13.5 × .75 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=336" },
        { id: 'skinny-bars', category: 'singing-bars', image: "Instruments/Singing Bars/Skinny Bars/singingbar2.webp", sound: "Instruments/Singing Bars/Skinny Bars/skinnybarsSOSB7.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Skinny Bars", material: "Beryllium copper", year: "Made in the 1970s", size: "15 × .5 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=2714" },

        // COMBINATIONS
        { id: 'gong-and-bars', category: 'combinations', image: "Instruments/Combinations/Gong & Bars/Combination1.webp", sound: "Instruments/Combinations/Gong & Bars/1m16s_swinging bars_gong_drone_rods_LP.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Gong & Bars", material: "Copper and bronze", year: "Made in the 1970s", size: "Varied" },
        { id: 'gong-and-bars-2', category: 'combinations', image: "Instruments/Combinations/Gong & Bars 2/combo2.webp", sound: "Instruments/Combinations/Gong & Bars 2/45s_swinging bars LP opening edit.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Gong & Bars 2", material: "Copper and bronze", year: "Made in the 1970s", size: "Varied" },

        // TONALS - TOPS
        { id: 'uneven-tops', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Uneven Tops/6 HUB_0729_transparent.webp", sound: "Instruments/Tonals/Tops/Uneven Tops/6 HUB_0729.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Uneven Tops", material: "Inconel and monel", year: "Made in the 1970s", size: "63.75 × 12 × 12 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=330" },
        { id: 'mushroom-tops', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Mushroom Tops/1 HUB_0531-transparent.webp", sound: "Instruments/Tonals/Tops/Mushroom Tops/1 HUB_0531.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Mushroom Tops", material: "Beryllium copper", year: "Made in the 1970s", size: "39.5 × 9 × 9 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=221" },
        { id: 'two-rows', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Two Rows/7 HUB_0949_transparent.webp", sound: "Instruments/Tonals/Tops/Two Rows/7 HUB_0949.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Two Rows", material: "Beryllium copper", year: "Made in the 1970s", size: "65.25 × 16 × 8 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=307" },
        { id: 'cylinders', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Cylinders/HUB_0696_transparent.webp", sound: "Instruments/Tonals/Tops/Cylinders/c 20s_thick tops_one hit_knocking decay_9.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Cylinders", material: "Beryllium copper", year: "Made in the 1970s", size: "60 × 12 × 12 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=300" },
        { id: 'heavy-duty', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Heavy Duty/3 HUB_0960_transparent.webp", sound: "Instruments/Tonals/Tops/Heavy Duty/3 HUB_0360.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Heavy Duty", material: "Bronze and beryllium copper", year: "Made c. 1975", size: "30.75 × 12 × 12 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=222" },
        { id: 'cattails', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Cattails/a HUB_0584_transparent.webp", sound: "Instruments/Tonals/Tops/Cattails/a 1m_thin tops  shimmering_UH_IB_1m.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Cattails", material: "Inconel", year: "Made in the 1970s", size: "48 × 12 × 12 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=326" },
        { id: 'tall-cattails', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Tall Cattails/4 HUB_0749_transparent.webp", sound: "Instruments/Tonals/Tops/Tall Cattails/4 HUB_0749.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Tall Cattails", material: "Beryllium copper", year: "Made in the 1970s", size: "54.5 × 11 × 11 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=325" },

        // TONALS - RODS
        { id: 'nickel-rods', category: 'tonals-rods', image: "Instruments/Tonals/Rods/Nickel Rods/3 HUB_0724_transparent.webp", sound: "Instruments/Tonals/Rods/Nickel Rods/3_HUB_0724.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Nickel Rods", material: "Nickel alloy", year: "Made in the 1970s", size: "62.25 × 12 × 12 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=192" },
        { id: 'reed-rods', category: 'tonals-rods', image: "Instruments/Tonals/Rods/Reed Rods/4 HUB_0514_transparent.webp", sound: "Instruments/Tonals/Rods/Reed Rods/4_HUB_0514.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Reed Rods", material: "Bronze", year: "Made in the 1970s", size: "30.5 × 8 × 8 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=182" },
        { id: 'tall-tonal', category: 'tonals-rods', image: "Instruments/Tonals/Rods/Tall Tonal/1 HUB_0399_transparent.webp", sound: "Instruments/Tonals/Rods/Tall Tonal/1_HUB_0399.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Tall Tonal", material: "Monel", year: "Made c. 1975", size: "103 × 14 × 14 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=195" },
        { id: 'baby', category: 'tonals-rods', image: "Instruments/Tonals/Rods/Baby/10 HUB_0521_transparent.webp", sound: "Instruments/Tonals/Rods/Baby/10 HUB_0521.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Baby", material: "Bronze", year: "Made c. 1970", size: "25 × 14 × 6 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=183" },
        { id: 'simple-square', category: 'tonals-rods', image: "Instruments/Tonals/Rods/Simple Square/5 HUB_0663_transparent.webp", sound: "Instruments/Tonals/Rods/Simple Square/5_HUB_0663.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Simple Square", material: "Beryllium copper", year: "Made in the 1970s", size: "61 × 10 × 10 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=193" },
        { id: 'big-square', category: 'tonals-rods', image: "Instruments/Tonals/Rods/Big Square/2 HUB_0854_transparent.webp", sound: "Instruments/Tonals/Rods/Big Square/2A_HUB_0854.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Big Square", material: "Beryllium copper", year: "Made in the 1970s", size: "72.5 × 13 × 13 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=184" },
        // NEW ADDITIONS
        { id: 'tall-boy', category: 'tonals-rods', image: "Instruments/Tonals/Rods/Tall Boy/so15finalimg.webp", sound: "Instruments/Tonals/Rods/Tall Boy/SOTO15.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Tall Boy", material: "Beryllium copper", year: "Made in the 1970s", size: "72.25 × 10.5 × 10.5 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=185" },
        { id: '22-rods', category: 'tonals-rods', image: "Instruments/Tonals/Rods/22 Rods/so37finalimg.webp", sound: "Instruments/Tonals/Rods/22 Rods/SOTO37.ogg", buffer: null, activeInstances: [], isLooping: false, name: "22 Rods", material: "Beryllium copper", year: "Made in the 1970s", size: "73.5 × 14 × 14 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=215" },
        { id: 'church-bells', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Church Bells/soto60finalimg.webp", sound: "Instruments/Tonals/Tops/Church Bells/SOTO60.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Church Bells", material: "Beryllium copper", year: "Made in the 1970s", size: "52.125 × 12 × 12 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=273" },
        { id: 'thick-cattails', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Thick Cattails/so74finalimg.webp", sound: "Instruments/Tonals/Tops/Thick Cattails/SOTO74.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Thick Cattails", material: "Monel and beryllium copper", year: "Made in the 1970s", size: "70.5 × 14 × 14 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=289" },
        { id: 'double-rows', category: 'tonals-tops', image: "Instruments/Tonals/Tops/Double Rows/so82finalimg.webp", sound: "Instruments/Tonals/Tops/Double Rows/SOTO82.ogg", buffer: null, activeInstances: [], isLooping: false, name: "Double Rows", material: "Beryllium copper", year: "Made in the 1970s", size: "60.875 × 17 × 5 in.", link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=308" }
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
                        
                        if (inst.gainNode) {
                            const now = audioCtx.currentTime;
                            const targetVolume = (categoryVolumes[item.category] || 1.0) * (item.volumeMultiplier || 1);
                            if (item.isLooping) {
                                // Cancel scheduled fade-out so it doesn't mute at the end of the loop
                                inst.gainNode.gain.cancelScheduledValues(now);
                                inst.gainNode.gain.setValueAtTime(targetVolume, now);
                            } else {
                                // Schedule fade-out for the end of the current iteration
                                const elapsed = now - inst.startTime;
                                const currentLoopPos = elapsed % inst.duration;
                                const timeRemaining = inst.duration - currentLoopPos;
                                if (timeRemaining > 1.0) {
                                    inst.gainNode.gain.setValueAtTime(targetVolume, now + timeRemaining - 1.0);
                                    inst.gainNode.gain.linearRampToValueAtTime(0, now + timeRemaining);
                                }
                            }
                        }
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

            const volUpBtn = e.target.closest('.vol-up-btn');
            if (volUpBtn) {
                e.preventDefault();
                const id = volUpBtn.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item && item.activeInstances.length > 0) {
                    if (item.volLevel === undefined) item.volLevel = 1; // Default is Medium (level 1)
                    if (item.volLevel < 2) item.volLevel++;
                    item.volumeMultiplier = 0.5 + (item.volLevel * 0.5); // levels map to 0.5, 1.0, 1.5
                    
                    const instance = item.activeInstances[0];
                    if (instance.gainNode && !instance.isPaused) {
                        const targetVolume = (categoryVolumes[item.category] || 1.0) * item.volumeMultiplier;
                        instance.gainNode.gain.setValueAtTime(targetVolume, audioCtx.currentTime);
                    }
                    renderCurrentlyPlaying();
                }
            }

            const volDownBtn = e.target.closest('.vol-down-btn');
            if (volDownBtn) {
                e.preventDefault();
                const id = volDownBtn.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item && item.activeInstances.length > 0) {
                    if (item.volLevel === undefined) item.volLevel = 1; // Default is Medium (level 1)
                    if (item.volLevel > 0) item.volLevel--;
                    item.volumeMultiplier = 0.5 + (item.volLevel * 0.5);

                    const instance = item.activeInstances[0];
                    if (instance.gainNode && !instance.isPaused) {
                        const targetVolume = (categoryVolumes[item.category] || 1.0) * item.volumeMultiplier;
                        instance.gainNode.gain.setValueAtTime(targetVolume, audioCtx.currentTime);
                    }
                    renderCurrentlyPlaying();
                }
            }
        });

        function updateProgressFill(progEl) {
            if (!progEl) return;
            const val = progEl.value;
            progEl.style.background = `linear-gradient(to right, #b87333 ${val}%, var(--placeholder-bg) ${val}%)`;
        }

        currentlyPlayingInfo.addEventListener("input", (e) => {
            if (e.target.classList.contains('scrubber')) {
                const id = e.target.dataset.id;
                const item = instruments.find(i => i.id === id);
                if (item) item.isScrubbing = true;
                updateProgressFill(e.target);
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
                        updateProgressFill(e.target);
                    }
                }
            }
        });
    }

    // Keep scroll position anchored when visualizer collapses/expands
    const topRowContainer = document.querySelector(".top-row");
    if (topRowContainer) {
        let prevHeight = topRowContainer.getBoundingClientRect().height;
        let prevMargin = parseFloat(window.getComputedStyle(topRowContainer).marginBottom) || 0;

        const observer = new ResizeObserver(() => {
            const currentHeight = topRowContainer.getBoundingClientRect().height;
            const currentMargin = parseFloat(window.getComputedStyle(topRowContainer).marginBottom) || 0;

            const currentTotal = currentHeight + currentMargin;
            const prevTotal = prevHeight + prevMargin;
            const diff = prevTotal - currentTotal;

            // Only compensate scroll when the visualizer is collapsing (diff > 0). 
            // When expanding, let the page naturally grow so the visualizer stays in view.
            if (diff > 0.1 && window.scrollY > 0) {
                window.scrollBy(0, -diff);
            }

            prevHeight = currentHeight;
            prevMargin = currentMargin;
        });
        observer.observe(topRowContainer);
    }

    function collapseVisualizer() {
        const topRow = document.querySelector(".top-row");
        if (!topRow || !topRow.classList.contains("visible")) return;
        topRow.classList.remove("visible");
    }

    function renderCurrentlyPlaying() {
        if (!currentlyPlayingInfo) return;

        const playingInstruments = instruments.filter(inst => inst.activeInstances.length > 0);
        const topRow = document.querySelector(".top-row");

        if (playingInstruments.length === 0) {
            // Check if anything is even loaded (paused counts as still in session)
            const anyActive = instruments.some(inst => inst.activeInstances.length > 0);
            if (!anyActive) {
                currentlyPlayingInfo.innerHTML = '';
                collapseVisualizer();
                return;
            }
        }

        if (topRow) {
            topRow.classList.add("visible");
            resizeCanvas();
            startAnimate();
        }

        const playingTitleEl = document.querySelector(".currently-playing-title");
        if (playingTitleEl) {
            if (playingInstruments.length > 1) {
                playingTitleEl.innerHTML = `Currently playing (${playingInstruments.length}): <span class="scroll-hint">(scroll for more &darr;)</span>`;
            } else {
                playingTitleEl.textContent = "Currently playing:";
            }
        }

        currentlyPlayingInfo.innerHTML = playingInstruments.map(item => {
            const materialStr = item.material === 'Unknown' ? '' : `<p>${item.material}</p>`;
            const yearStr = item.year === 'Unknown' ? '' : `<p>${item.year}</p>`;
            const sizeStr = item.size ? `<p>${item.size}</p>` : '';
            const linkStr = item.link ? `<p><a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; font-style: italic; font-weight: 600;">Learn more</a></p>` : '';
            const nameStr = item.name ? `<p><strong>${item.name}</strong></p>` : '';
            const isPaused = item.activeInstances[0]?.isPaused;

            let volIconPath = "M5 9v6h4l5 5V4L9 9H5zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z";
            const volLevel = item.volLevel === undefined ? 1 : item.volLevel;
            if (volLevel === 0) {
                // Low (no waves)
                volIconPath = "M7 9v6h4l5 5V4l-5 5H7z";
            } else if (volLevel === 1) {
                // Medium (1 wave)
                volIconPath = "M5 9v6h4l5 5V4L9 9H5zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z";
            } else if (volLevel >= 2) {
                // High (2 waves)
                volIconPath = "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
            }

            return `
                <div class="playing-item">
                    <img src="${item.image || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="${item.name}">
                    <div class="info-details">
                        ${nameStr}
                        ${!item.sound ? `<div style="font-size: 13px; color: #888; font-style: italic; margin: 10px 0;">Audio coming soon...</div>` : `
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
                            <div style="display:flex; align-items:center; margin-left: 8px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="opacity: 0.3;"><path d="${volIconPath}"/></svg>
                                <button class="control-btn vol-down-btn" data-id="${item.id}" title="Volume Down" style="font-size:18px; font-weight:600; line-height:1; margin-left:4px; padding:0 4px;">−</button>
                                <button class="control-btn vol-up-btn" data-id="${item.id}" title="Volume Up" style="font-size:18px; font-weight:600; line-height:1; margin-left:2px; padding:0 4px;">+</button>
                            </div>
                        </div>
                        `}
                        ${materialStr}
                        ${sizeStr}
                        ${yearStr}
                        ${linkStr}
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

    // iOS Silent Switch Bypass:
    // Playing a tiny HTML5 audio clip on user interaction forces iOS Safari to switch
    // the audio session from Ambient to Playback category, allowing Web Audio API
    // sound to play even when the physical iPhone silent/ringer switch is ON.
    let iosAudioUnlocked = false;
    function unlockIOSAudioSession() {
        if (iosAudioUnlocked) return;
        try {
            const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
            silentAudio.play().then(() => {
                silentAudio.pause();
                iosAudioUnlocked = true;
            }).catch(() => {});
        } catch (e) {}
    }

    window.addEventListener('touchstart', unlockIOSAudioSession, { once: true, passive: true });
    window.addEventListener('pointerdown', unlockIOSAudioSession, { once: true, passive: true });
    window.addEventListener('click', unlockIOSAudioSession, { once: true, passive: true });

    function initAudio() {
        if (isAudioInitialized) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024; // 512 frequency bins
        analyser.smoothingTimeConstant = 0.8;
        analyser.connect(audioCtx.destination);

        dataArray = new Uint8Array(analyser.frequencyBinCount);
        isAudioInitialized = true;

        unlockIOSAudioSession();
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
                try { instance.source.stop(); } catch (e) { }
                instance.gainNode.disconnect();
            }, fadeOutDuration * 1000 + 50);
        } else {
            try { instance.source.stop(); } catch (e) { }
        }
    }

    async function playAtOffset(item, tileElement, offset = 0) {
        const buffer = await loadAudioBuffer(item);
        
        // If loading was cancelled while fetching the audio, exit early
        if (!item.isLoading && offset === 0) {
            if (tileElement) tileElement.classList.remove("loading");
            return;
        }
        
        item.isLoading = false;
        
        if (!buffer) {
            if (tileElement) {
                tileElement.classList.remove("loading");
                tileElement.classList.remove("active");
            }
            const anyActive = instruments.some(i => i.activeInstances.length > 0 || i.isLoading);
            if (!anyActive) collapseVisualizer();
            return;
        }

        if (tileElement) {
            tileElement.classList.remove("loading");
            tileElement.classList.add("active");
        }
        
        if (!buffer) return;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const gainNode = audioCtx.createGain();
        const targetVolume = (categoryVolumes[item.category] || 1.0) * (item.volumeMultiplier || 1);

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
        startProgressLoop(); // Wake the progress bar updates
        if (item.activeInstances.length > 0) {
            item.activeInstances[0] = instance; // Replace paused instance
        } else {
            item.activeInstances.push(instance);
        }

        renderCurrentlyPlaying();
    }

    // Handles both starting and stopping sounds (toggle)
    function handleTileClick(item, tileElement) {
        if (!item.sound) {
            if (item.activeInstances.length > 0) {
                item.activeInstances = [];
                tileElement.classList.remove("active");
                renderCurrentlyPlaying();
                if (!instruments.some(i => i.activeInstances.length > 0 || i.isLoading)) collapseVisualizer();
            } else {
                item.activeInstances = [{ isDummy: true }];
                tileElement.classList.add("active");
                renderCurrentlyPlaying();
                
                const topRow = document.querySelector(".top-row");
                if (topRow && !topRow.classList.contains("visible")) {
                    topRow.classList.add("visible");
                    setTimeout(() => {
                        const header = document.querySelector(".site-header");
                        let targetY = topRow.getBoundingClientRect().top + window.scrollY - 20;
                        if (header) targetY = header.getBoundingClientRect().bottom + window.scrollY;
                        window.scrollTo({ top: targetY, behavior: 'smooth' });
                    }, 50);
                }
            }
            return;
        }

        if (!audioCtx) initAudio();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        // Handle click while loading (cancellation)
        if (item.isLoading) {
            item.isLoading = false;
            tileElement.classList.remove("loading");
            // If visualizer was started but nothing is playing or loading, collapse it
            const anyActive = instruments.some(i => i.activeInstances.length > 0 || i.isLoading);
            if (!anyActive) collapseVisualizer();
            return;
        }

        if (item.activeInstances.length > 0) {
            const instance = item.activeInstances[0];
            stopInstance(instance, 1.5); // 1.5s manual stop fade
            item.activeInstances = [];
            tileElement.classList.remove("active");
            renderCurrentlyPlaying();
            // If nothing else is playing or loading, collapse immediately
            const anyStillPlaying = instruments.some(i => i.activeInstances.length > 0 || i.isLoading);
            if (!anyStillPlaying) collapseVisualizer();
            return;
        }

        // Reveal visualizer & start animation immediately — don't wait for buffer load
        const topRow = document.querySelector(".top-row");
        if (topRow) {
            const isFirstPlay = !topRow.classList.contains("visible");
            topRow.classList.add("visible");
            
            if (isFirstPlay) {
                // Disable scroll anchoring temporarily so it doesn't fight the smooth scroll
                document.body.style.overflowAnchor = "none";
                
                setTimeout(() => {
                    const header = document.querySelector(".site-header");
                    let targetY = topRow.getBoundingClientRect().top + window.scrollY - 20;
                    if (header) {
                        targetY = header.getBoundingClientRect().bottom + window.scrollY;
                    }
                    
                    window.scrollTo({ top: targetY, behavior: 'smooth' });
                    
                    // Re-enable scroll anchoring after the expansion transition finishes
                    setTimeout(() => {
                        document.body.style.overflowAnchor = "";
                    }, 1800);
                }, 50);
            }
        }
        startAnimate();

        // Mark as loading and play
        item.isLoading = true;
        tileElement.classList.add("loading");
        playAtOffset(item, tileElement, 0);
    }

    // Update mini progress bars in the Currently Playing section (only runs when audio is active)
    let isProgressLoopRunning = false;

    function updateProgressBars() {
        if (!audioCtx) {
            isProgressLoopRunning = false;
            return;
        }

        const currentTime = audioCtx.currentTime;
        let anyPlaying = false;

        instruments.forEach(item => {
            if (item.activeInstances.length === 0) return;

            const instance = item.activeInstances[0];
            if (!instance.isPaused) {
                anyPlaying = true;
            }

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
                updateProgressFill(progEl);
            }
        });

        if (anyPlaying) {
            requestAnimationFrame(updateProgressBars);
        } else {
            isProgressLoopRunning = false;
        }
    }

    function startProgressLoop() {
        if (!isProgressLoopRunning) {
            isProgressLoopRunning = true;
            requestAnimationFrame(updateProgressBars);
        }
    }

    const instrumentCategoriesContainer = document.getElementById('instrument-categories');
    const gridAllRows = document.getElementById('grid-all-rows');
    const graveGongSection = document.getElementById('grave-gong-section');

    function renderInstruments(mode) {
        // Clear containers
        const containers = [
            document.getElementById("grid-gongs"),
            document.getElementById("grid-singing-bars"),
            document.getElementById("grid-combinations"),
            document.getElementById("grid-tonals-tops"),
            document.getElementById("grid-tonals-rods"),
            document.getElementById("grave-gong-footer"),
            gridAllRows
        ];
        containers.forEach(c => {
            if (c) c.innerHTML = '';
        });

        let renderQueue = [];
        if (mode === 'rows') {
            const groups = {
                'tonals-rods': [],
                'gongs': [],
                'tonals-tops': [],
                'singing-bars': [],
                'combinations': []
            };
            instruments.forEach(inst => {
                if (inst.id !== 'grave-gong' && groups[inst.category]) {
                    groups[inst.category].push(inst);
                }
            });
            
            // Build custom rows: Rods (6), Tops (4), Gongs + Bars + Combos (4+1+2=7)
            const row1 = document.createElement('div');
            row1.classList.add('layout-row');
            const row2 = document.createElement('div');
            row2.classList.add('layout-row');
            const row3 = document.createElement('div');
            row3.classList.add('layout-row');

            gridAllRows.appendChild(row1);
            gridAllRows.appendChild(row2);
            gridAllRows.appendChild(row3);

            renderQueue = [
                ...groups['tonals-rods'].map(item => ({ item, container: row1 })),
                ...groups['tonals-tops'].map(item => ({ item, container: row2 })),
                ...groups['gongs'].map(item => ({ item, container: row3 })),
                ...groups['singing-bars'].map(item => ({ item, container: row3 })),
                ...groups['combinations'].map(item => ({ item, container: row3 })),
                { item: instruments.find(i => i.id === 'grave-gong'), container: document.getElementById('grave-gong-footer') }
            ];
        } else {
            renderQueue = instruments.map(item => {
                let targetContainer;
                if (item.id === 'grave-gong') {
                    targetContainer = document.getElementById("grave-gong-footer");
                } else {
                    let targetContainerId = "grid-gongs";
                    if (item.category === 'singing-bars') targetContainerId = "grid-singing-bars";
                    else if (item.category === 'combinations') targetContainerId = "grid-combinations";
                    else if (item.category === 'tonals-tops') targetContainerId = "grid-tonals-tops";
                    else if (item.category === 'tonals-rods') targetContainerId = "grid-tonals-rods";
                    targetContainer = document.getElementById(targetContainerId);
                }
                return { item, container: targetContainer };
            });
        }

        renderQueue.forEach(({item, container}) => {
            if (!item || !container) return;
            const tile = document.createElement("div");
            tile.classList.add("instrument-tile");
            tile.dataset.id = item.id;
            if (item.wasActive === undefined) item.wasActive = false;

            const img = document.createElement("img");
            if (item.image) {
                img.src = item.image;
                if (item.id !== 'grave-gong') {
                    img.width = 180;
                    img.height = 240;
                }
            } else {
                img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                tile.classList.add("placeholder");
            }
            img.alt = item.name || `Instrument ${item.id}`;
            tile.appendChild(img);

            const wrapper = document.createElement("div");
            wrapper.classList.add("tile-wrapper");
            wrapper.dataset.category = item.category;

            if (item.activeInstances && item.activeInstances.length > 0) {
                wrapper.classList.add('playing');
                const glow = document.createElement("div");
                glow.classList.add("glow");
                tile.appendChild(glow);
                const progressEl = document.createElement("div");
                progressEl.classList.add("mini-progress");
                progressEl.style.background = `linear-gradient(to right, #b87333 0%, var(--placeholder-bg) 0%)`;
                wrapper.appendChild(progressEl);
            }

            wrapper.appendChild(tile);
            container.appendChild(wrapper);

            if (item.image) {
                tile.addEventListener("click", () => handleTileClick(item, tile));
                tile.addEventListener("mouseenter", () => {
                    if (!audioCtx) initAudio();
                    loadAudioBuffer(item);
                });
            }
        });

        const graveHintEl = document.getElementById("grave-gong-hint");
        if (graveHintEl) {
            graveHintEl.onclick = (e) => {
                e.stopPropagation();
                const graveItem = instruments.find(i => i.id === 'grave-gong');
                const tile = document.querySelector(`.instrument-tile[data-id="grave-gong"]`);
                if (graveItem && tile) {
                    handleTileClick(graveItem, tile);
                }
            };
        }
        
        const allTileImages = Array.from(document.querySelectorAll(".instrument-tile img")).filter(img => img.src && !img.src.startsWith("data:"));
        trackImageLoading(allTileImages);
    }

    // Initial render
    instrumentCategoriesContainer.style.display = 'none';
    gridAllRows.style.display = 'flex';
    renderInstruments('rows');

    // Start tracking image loads for the splash screen
    const allTileImages = Array.from(document.querySelectorAll(".instrument-tile img")).filter(img => img.src && !img.src.startsWith("data:"));
    trackImageLoading(allTileImages);

    // 4. Spectrogram Animation Loop
    let time = 0;
    let animating = false;

    function animate() {
        // Clear to transparent at the start of frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        const verticalPadding = Math.max(35, Math.floor(canvas.height * 0.08));
        const availableHeight = canvas.height - (verticalPadding * 2);
        const lineSpacing = availableHeight / numLines;
        const segmentWidth = canvas.width / lineSegments;

        const maxWaveAmplitude = Math.min(30, verticalPadding * 0.65);

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
            const breathingOffset = Math.sin(time + (i * 0.2)) * 1.2;

            ctx.beginPath();

            for (let j = 0; j <= lineSegments; j++) {
                const x = j * segmentWidth;
                let y = baseY;

                const waveScale = amplitude * maxWaveAmplitude;
                if (waveScale > 0.1) {
                    const ripple = Math.sin((j * 0.2) - (time * 5) + (i * 0.1)) * waveScale;
                    const detailRipple = Math.cos((j * 0.5) - (time * 2)) * (waveScale * 0.3);
                    const edgeTaper = edgeTaperCache[j];

                    y -= (ripple + detailRipple) * edgeTaper;
                }

                y += breathingOffset;

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

            // To optimize heavily, we draw with solid colors and apply a single mask at the end.
            if (amplitude > 0.05) {
                ctx.lineWidth = baseLineWidth + (amplitude * 20);
                ctx.strokeStyle = `hsla(${h}, 40%, 48%, 0.11)`;
                ctx.stroke();
            }

            // Core visible line
            ctx.lineWidth = baseLineWidth;
            ctx.strokeStyle = `hsla(${h}, ${s}%, ${l}%, ${a})`;
            ctx.stroke();
        }

        // Apply global horizontal fade-out mask to all lines at once
        if (maskGrad) {
            ctx.globalCompositeOperation = "destination-in";
            ctx.fillStyle = maskGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw solid white background behind the lines
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Reset to default source-over blend mode
        ctx.globalCompositeOperation = "source-over";

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

    // JavaScript-based responsive layout for Singing Bars has been removed.
    // Layout is now fully handled by CSS fluid grids.
});
