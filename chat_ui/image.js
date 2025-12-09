document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const imageResult = document.getElementById('image-result');
    const generatedImage = document.getElementById('generated-image');
    const loadingSpinner = document.getElementById('loading');
    const placeholderText = document.getElementById('placeholder-text');

    // Focus input on load
    promptInput.focus();

    // --- Theme Logic ---
    function loadTheme() {
        let theme = 'default';
        const savedUser = localStorage.getItem('currentUser');

        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                theme = localStorage.getItem('theme_' + user.email) || 'default';
            } catch (e) {
                console.error("Error parsing user for theme:", e);
                theme = localStorage.getItem('chat_theme') || 'default';
            }
        } else {
            theme = localStorage.getItem('chat_theme') || 'default';
        }

        document.body.setAttribute('data-theme', theme);
    }

    loadTheme();
    // -------------------

    generateBtn.addEventListener('click', generateImage);

    promptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            generateImage();
        }
    });

    function generateImage() {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        // UI State: Loading
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Translating...';

        loadingSpinner.style.display = 'flex';
        generatedImage.style.display = 'none';
        placeholderText.style.display = 'none';

        // Async wrapper to handle translation
        (async () => {
            let finalPrompt = prompt;
            const apiKey = localStorage.getItem('openrouter_api_key') || '';

            // 1. Translate if Thai
            const thaiRegex = /[\u0E00-\u0E7F]/;
            if (thaiRegex.test(prompt)) {
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

                    const transResponse = await fetch('/translate', {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ text: prompt })
                    });

                    if (transResponse.ok) {
                        const transData = await transResponse.json();
                        finalPrompt = transData.english;
                        // Update UI to show we are generating with new prompt
                        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
                    } else {
                        console.error("Translation failed status:", transResponse.status);
                        placeholderText.style.display = 'block';
                        placeholderText.style.color = '#ef4444';
                        placeholderText.textContent = `Translation failed (${transResponse.status}). Using original text.`;
                    }
                } catch (e) {
                    console.error("Translation failed:", e);
                    placeholderText.style.display = 'block';
                    placeholderText.style.color = '#ef4444';
                    placeholderText.textContent = `Translation error. Using original text.`;
                }
            }

            // 2. Construct Pollinations URL
            const encodedPrompt = encodeURIComponent(finalPrompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;

            // 3. Preload image
            const img = new Image();
            img.onload = () => {
                // Success
                generatedImage.src = imageUrl;
                generatedImage.style.display = 'block';
                loadingSpinner.style.display = 'none';

                // Show translated prompt if different
                if (finalPrompt !== prompt) {
                    placeholderText.style.display = 'block';
                    placeholderText.style.color = '#666';
                    placeholderText.textContent = `Translated: "${finalPrompt}"`;
                }

                // Reset Button
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate';
            };

            img.onerror = () => {
                // Error
                loadingSpinner.style.display = 'none';
                placeholderText.style.display = 'block';
                placeholderText.textContent = 'Failed to generate image. Please try again.';
                placeholderText.style.color = '#ef4444';

                // Reset Button
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate';
            };

            // Trigger load
            img.src = imageUrl;
        })();
    }
});
