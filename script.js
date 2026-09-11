document.addEventListener('DOMContentLoaded', () => {
    // 1. Tab Navigation Logic
    const tabButtons = document.querySelectorAll('.nav-tab');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Toggle buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Toggle panels
            tabPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // 2. Slider Value Updates
    const setupSlider = (sliderId, valId) => {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(valId);
        if (slider && display) {
            slider.addEventListener('input', (e) => {
                display.textContent = e.target.value;
            });
        }
    };
    setupSlider('poll-steps', 'steps-val');
    setupSlider('poll-cfg', 'cfg-val');
    setupSlider('poll-width', 'width-val');
    setupSlider('poll-height', 'height-val');
    setupSlider('img2img-strength', 'strength-val');

    // Seed Randomize/Clear Helper
    const pollSeed = document.getElementById('poll-seed');
    const pollClearSeed = document.getElementById('poll-clear-seed');
    if (pollClearSeed && pollSeed) {
        pollClearSeed.addEventListener('click', () => {
            pollSeed.value = '';
            showNotification('Seed randomized/cleared', 'info');
        });
    }

    // 3. Global Session Gallery
    const globalGalleryList = document.getElementById('global-gallery-list');
    let sessionGallery = [];

    function addToGlobalGallery(imageUrl) {
        if (sessionGallery.includes(imageUrl)) return;
        sessionGallery.unshift(imageUrl);
        
        // Remove empty state message
        const emptyMsg = globalGalleryList.querySelector('.gallery-empty-msg');
        if (emptyMsg) emptyMsg.remove();
        
        // Create gallery thumbnail item
        const item = document.createElement('div');
        item.className = 'global-gallery-item';
        
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = "Generated Artwork";
        
        item.appendChild(img);
        
        item.addEventListener('click', () => {
            openLightbox(imageUrl);
        });
        
        // Insert at the beginning
        globalGalleryList.insertBefore(item, globalGalleryList.firstChild);
    }

    // 4. Fullscreen Lightbox Modal
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');

    function openLightbox(src) {
        lightboxImg.src = src;
        lightbox.classList.remove('hidden');
    }

    if (lightboxClose) {
        lightboxClose.addEventListener('click', () => {
            lightbox.classList.add('hidden');
        });
    }

    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                lightbox.classList.add('hidden');
            }
        });
    }

    // 5. Pollinations.ai Image Generation Tab Logic
    const pollPrompt = document.getElementById('poll-prompt');
    const pollNegPrompt = document.getElementById('poll-neg-prompt');
    const pollModel = document.getElementById('poll-model');
    const pollSteps = document.getElementById('poll-steps');
    const pollCfg = document.getElementById('poll-cfg');
    const pollWidth = document.getElementById('poll-width');
    const pollHeight = document.getElementById('poll-height');
    const pollGenerateBtn = document.getElementById('poll-generate-btn');
    
    const pollCanvas = document.getElementById('poll-canvas');
    const pollEmptyState = document.getElementById('poll-empty-state');
    const pollLoadingState = document.getElementById('poll-loading-state');
    const pollResultContainer = document.getElementById('poll-result-container');
    const pollResultImg = document.getElementById('poll-result-img');
    const pollTimer = document.getElementById('poll-timer');
    const pollActions = document.getElementById('poll-actions');
    const pollDownload = document.getElementById('poll-download');

    let pollInterval = null;
    let pollSeconds = 0;

    pollGenerateBtn.addEventListener('click', () => {
        const prompt = pollPrompt.value.trim();
        if (!prompt) {
            showNotification('Please enter a text prompt.', 'error');
            pollPrompt.focus();
            return;
        }

        // Set Loading state
        pollEmptyState.classList.add('hidden');
        pollResultContainer.classList.add('hidden');
        pollActions.classList.add('hidden');
        pollLoadingState.classList.remove('hidden');
        
        pollGenerateBtn.disabled = true;
        pollGenerateBtn.querySelector('.btn-txt').classList.add('hidden');
        pollGenerateBtn.querySelector('.spinner').classList.remove('hidden');

        // Timer start
        pollSeconds = 0;
        pollTimer.textContent = `TIME ELAPSED: 0s`;
        clearInterval(pollInterval);
        pollInterval = setInterval(() => {
            pollSeconds++;
            pollTimer.textContent = `TIME ELAPSED: ${pollSeconds}s`;
        }, 1000);

        const requestData = {
            prompt: prompt,
            negative_prompt: pollNegPrompt.value.trim(),
            model: pollModel.value,
            width: parseInt(pollWidth.value),
            height: parseInt(pollHeight.value),
            seed: pollSeed.value ? parseInt(pollSeed.value) : null
        };

        fetch('/api/generate/pollinations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        })
        .then(res => {
            if (!res.ok) throw new Error("Failed to generate image.");
            return res.json();
        })
        .then(data => {
            clearInterval(pollInterval);
            
            // Set image source
            pollResultImg.src = data.image_url;
            
            // Update UI state
            pollLoadingState.classList.add('hidden');
            pollResultContainer.classList.remove('hidden');
            pollActions.classList.remove('hidden');
            
            // Add to session galleries
            addToGlobalGallery(data.image_url);
            
            // Set up download handler
            pollDownload.onclick = () => {
                const a = document.createElement('a');
                a.href = data.image_url;
                a.download = `pollination_${data.seed || 'art'}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            pollResultImg.onclick = () => {
                openLightbox(data.image_url);
            };

            showNotification('Image generated successfully!', 'success');
        })
        .catch(err => {
            clearInterval(pollInterval);
            pollLoadingState.classList.add('hidden');
            pollEmptyState.classList.remove('hidden');
            showNotification(err.message, 'error');
        })
        .finally(() => {
            pollGenerateBtn.disabled = false;
            pollGenerateBtn.querySelector('.btn-txt').classList.remove('hidden');
            pollGenerateBtn.querySelector('.spinner').classList.add('hidden');
        });
    });

    // 6. DALL-E mini (Craiyon) Tab Logic
    const dallePrompt = document.getElementById('dalle-prompt');
    const dalleNegPrompt = document.getElementById('dalle-neg-prompt');
    const dalleGenerateBtn = document.getElementById('dalle-generate-btn');
    const dalleEmptyState = document.getElementById('dalle-empty-state');
    const dalleLoadingState = document.getElementById('dalle-loading-state');
    const dalleGridContainer = document.getElementById('dalle-grid-container');
    const dalleTimer = document.getElementById('dalle-timer');

    let dalleInterval = null;
    let dalleSeconds = 0;

    dalleGenerateBtn.addEventListener('click', () => {
        const prompt = dallePrompt.value.trim();
        if (!prompt) {
            showNotification('Please enter a text prompt.', 'error');
            dallePrompt.focus();
            return;
        }

        // Set Loading state
        dalleEmptyState.classList.add('hidden');
        dalleGridContainer.classList.add('hidden');
        dalleLoadingState.classList.remove('hidden');
        
        dalleGenerateBtn.disabled = true;
        dalleGenerateBtn.querySelector('.btn-txt').classList.add('hidden');
        dalleGenerateBtn.querySelector('.spinner').classList.remove('hidden');

        // Timer start
        dalleSeconds = 0;
        dalleTimer.textContent = `TIME ELAPSED: 0s`;
        clearInterval(dalleInterval);
        dalleInterval = setInterval(() => {
            dalleSeconds++;
            dalleTimer.textContent = `TIME ELAPSED: ${dalleSeconds}s`;
        }, 1000);

        fetch('/api/generate/dalle-mini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                negative_prompt: dalleNegPrompt.value.trim()
            })
        })
        .then(res => {
            if (!res.ok) throw new Error("Failed to generate grid.");
            return res.json();
        })
        .then(data => {
            clearInterval(dalleInterval);
            
            // Clear previous grid
            dalleGridContainer.innerHTML = '';
            
            // Load grid
            data.images.forEach(imgUrl => {
                const gridItem = document.createElement('div');
                gridItem.className = 'grid-image-item';
                
                const img = document.createElement('img');
                img.src = imgUrl;
                img.alt = prompt;
                
                gridItem.appendChild(img);
                
                gridItem.addEventListener('click', () => {
                    openLightbox(imgUrl);
                });
                
                dalleGridContainer.appendChild(gridItem);
            });
            
            // Update UI state
            dalleLoadingState.classList.add('hidden');
            dalleGridContainer.classList.remove('hidden');
            
            // Add first image to global gallery
            if (data.images.length > 0) {
                addToGlobalGallery(data.images[0]);
            }
            
            showNotification('3x3 Grid generated successfully!', 'success');
        })
        .catch(err => {
            clearInterval(dalleInterval);
            dalleLoadingState.classList.add('hidden');
            dalleEmptyState.classList.remove('hidden');
            showNotification(err.message, 'error');
        })
        .finally(() => {
            dalleGenerateBtn.disabled = false;
            dalleGenerateBtn.querySelector('.btn-txt').classList.remove('hidden');
            dalleGenerateBtn.querySelector('.spinner').classList.add('hidden');
        });
    });

    // 7. Image-to-Image Tab Logic
    const dropZone = document.getElementById('drop-zone');
    const img2imgFile = document.getElementById('img2img-file');
    const sourcePreviewWrapper = document.getElementById('source-preview-wrapper');
    const sourcePreviewImg = document.getElementById('source-preview-img');
    const removeSourceImg = document.getElementById('remove-source-img');
    
    const img2imgPrompt = document.getElementById('img2img-prompt');
    const img2imgStrength = document.getElementById('img2img-strength');
    const img2imgModel = document.getElementById('img2img-model');
    const img2imgGenerateBtn = document.getElementById('img2img-generate-btn');
    
    const img2imgEmptyState = document.getElementById('img2img-empty-state');
    const img2imgLoadingState = document.getElementById('img2img-loading-state');
    const img2imgResultContainer = document.getElementById('img2img-result-container');
    const img2imgOriginal = document.getElementById('img2img-original');
    const img2imgResult = document.getElementById('img2img-result');

    let uploadedFile = null;

    // Trigger upload
    if (dropZone) {
        dropZone.addEventListener('click', () => img2imgFile.click());

        // File change event
        img2imgFile.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });

        // Drag-and-drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
    }

    function handleFileSelect(file) {
        if (!file.type.startsWith('image/')) {
            showNotification('Only image files are supported.', 'error');
            return;
        }
        
        uploadedFile = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            sourcePreviewImg.src = e.target.result;
            dropZone.classList.add('hidden');
            sourcePreviewWrapper.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    if (removeSourceImg) {
        removeSourceImg.addEventListener('click', () => {
            uploadedFile = null;
            img2imgFile.value = '';
            sourcePreviewWrapper.classList.add('hidden');
            dropZone.classList.remove('hidden');
        });
    }

    if (img2imgGenerateBtn) {
        img2imgGenerateBtn.addEventListener('click', () => {
            if (!uploadedFile) {
                showNotification('Please upload a source image first.', 'error');
                return;
            }

            const prompt = img2imgPrompt.value.trim();
            if (!prompt) {
                showNotification('Please enter a modification prompt.', 'error');
                img2imgPrompt.focus();
                return;
            }

            // Set Loading state
            img2imgEmptyState.classList.add('hidden');
            img2imgResultContainer.classList.add('hidden');
            img2imgLoadingState.classList.remove('hidden');
            
            img2imgGenerateBtn.disabled = true;
            img2imgGenerateBtn.querySelector('.btn-txt').classList.add('hidden');
            img2imgGenerateBtn.querySelector('.spinner').classList.remove('hidden');

            // Create form data
            const formData = new FormData();
            formData.append('image', uploadedFile);
            formData.append('prompt', prompt);
            formData.append('strength', parseFloat(img2imgStrength.value));
            formData.append('model', img2imgModel.value);

            fetch('/api/generate/img2img', {
                method: 'POST',
                body: formData
            })
            .then(res => {
                if (!res.ok) throw new Error("Failed to process Image-to-Image.");
                return res.json();
            })
            .then(data => {
                // Load comparison images
                img2imgOriginal.src = sourcePreviewImg.src;
                img2imgResult.src = data.image_url;
                
                // Show result
                img2imgLoadingState.classList.add('hidden');
                img2imgResultContainer.classList.remove('hidden');
                
                // Add to session gallery
                addToGlobalGallery(data.image_url);
                
                img2imgResult.onclick = () => {
                    openLightbox(data.image_url);
                };

                showNotification('Image transformed successfully!', 'success');
            })
            .catch(err => {
                img2imgLoadingState.classList.add('hidden');
                img2imgEmptyState.classList.remove('hidden');
                showNotification(err.message, 'error');
            })
            .finally(() => {
                img2imgGenerateBtn.disabled = false;
                img2imgGenerateBtn.querySelector('.btn-txt').classList.remove('hidden');
                img2imgGenerateBtn.querySelector('.spinner').classList.add('hidden');
            });
        });
    }

    // 8. Style Gallery Preset Modifiers
    const styleModifiers = {
        cinematic: "cinematic shot, 35mm lens, dramatic lighting, movie scene, photorealistic, depth of field, 8k, highly detailed",
        anime: "anime key visual, studio ghibli style, vibrant colors, clean lineart, aesthetic, detailed illustration",
        cyberpunk: "cyberpunk city, neon lighting, glowing signs, futuristic, rain, reflection, octane render, detailed, synthwave style",
        '3d-render': "3d render, unreal engine 5, octane render, photorealistic, raytracing, highly detailed, metallic surfaces, artstation",
        watercolor: "watercolor painting, soft brush strokes, ink splash, pastel colors, artistic, fluid, hand-drawn, aesthetic",
        fantasy: "fantasy art, magical atmosphere, ethereal glow, mystical, detailed landscape, matte painting, concept art, artstation"
    };

    const styleCards = document.querySelectorAll('.gallery-style-card');
    styleCards.forEach(card => {
        const useStyleBtn = card.querySelector('.btn-use-style');
        const styleName = card.getAttribute('data-style');
        
        useStyleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const modifier = styleModifiers[styleName];
            if (!modifier) return;
            
            // Set prompt on first tab
            let currentVal = pollPrompt.value.trim();
            if (currentVal) {
                pollPrompt.value = `${currentVal}, ${modifier}`;
            } else {
                pollPrompt.value = `A mystical portal, ${modifier}`;
            }
            
            // Select matching model option in dropdown if style implies it
            if (styleName === '3d-render') {
                pollModel.value = 'flux'; // Flux is great for 3D
            } else if (styleName === 'anime') {
                pollModel.value = 'flux-anime';
            } else if (styleName === 'cinematic') {
                pollModel.value = 'flux-realism';
            }
            
            // Go to Pollinations Tab
            const generatorTabButton = document.querySelector('.nav-tab[data-tab="tab-pollinations"]');
            if (generatorTabButton) {
                generatorTabButton.click();
            }
            
            pollPrompt.focus();
            showNotification(`Applied ${styleName.charAt(0).toUpperCase() + styleName.slice(1)} style preset!`, 'success');
        });
    });

    // 9. Interactive 3D Card Parallax Mouse-tilt effect
    const parallaxCards = document.querySelectorAll('.card-deck');
    parallaxCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Maximum tilt rotation in degrees
            const maxTilt = 5; 
            const rotateX = ((centerY - y) / centerY) * maxTilt;
            const rotateY = ((x - centerX) / centerX) * maxTilt;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.008, 1.008, 1.008)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        });
    });

    // 10. Simple toast notification helper
    function showNotification(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';
        
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        
        // CSS properties loaded inline
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '2px';
        toast.style.color = 'white';
        toast.style.fontFamily = 'Share Tech Mono, monospace';
        toast.style.fontSize = '0.85rem';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '10px';
        toast.style.zIndex = '2000';
        toast.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.25)';
        toast.style.backdropFilter = 'blur(10px)';
        toast.style.animation = 'slideInRight 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards';
        
        if (type === 'success') {
            toast.style.background = 'rgba(16, 185, 129, 0.95)';
            toast.style.border = '1px solid rgba(16, 185, 129, 0.2)';
        } else if (type === 'error') {
            toast.style.background = 'rgba(255, 0, 127, 0.95)';
            toast.style.border = '1px solid rgba(255, 0, 127, 0.2)';
        } else {
            toast.style.background = 'rgba(0, 243, 255, 0.9)';
            toast.style.border = '1px solid rgba(0, 243, 255, 0.2)';
        }
        
        document.body.appendChild(toast);
        
        // Keyframes injection
        if (!document.getElementById('toast-animation-styles')) {
            const styles = document.createElement('style');
            styles.id = 'toast-animation-styles';
            styles.innerHTML = `
                @keyframes slideInRight {
                    from { transform: translateX(120%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeOutToast {
                    to { opacity: 0; transform: translateY(10px); }
                }
            `;
            document.head.appendChild(styles);
        }

        setTimeout(() => {
            toast.style.animation = 'fadeOutToast 0.4s ease-out forwards';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }
});
