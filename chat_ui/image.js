document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const imageResult = document.getElementById('image-result');
    const generatedImage = document.getElementById('generated-image');
    const loadingSpinner = document.getElementById('loading');
    const placeholderText = document.getElementById('placeholder-text');

    // Focus input on load
    promptInput.focus();

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
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        loadingSpinner.style.display = 'flex';
        generatedImage.style.display = 'none';
        placeholderText.style.display = 'none';

        // Construct Pollinations URL
        // Using encodeURIComponent to handle special characters
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;

        // Preload image to check when it's ready
        const img = new Image();
        img.onload = () => {
            // Success
            generatedImage.src = imageUrl;
            generatedImage.style.display = 'block';
            loadingSpinner.style.display = 'none';

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
    }
});
