// Image Studio Module
console.log("Image Studio Module Loaded");

// DOM Elements
let imagePanel, promptInput, generateBtn, imageResult, statusText, closeBtn;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize elements
    imagePanel = document.getElementById('image-studio-panel');
    promptInput = document.getElementById('studio-prompt-input');
    generateBtn = document.getElementById('studio-generate-btn');
    imageResult = document.getElementById('studio-image-result');
    statusText = document.getElementById('studio-status-text');
    closeBtn = document.getElementById('studio-close-btn');

    // Event Listeners
    if (generateBtn) generateBtn.addEventListener('click', handleGenerateImage);
    if (closeBtn) closeBtn.addEventListener('click', closeImageStudio);

    if (promptInput) {
        promptInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleGenerateImage();
        });
    }
});

// Open/Close Functions
window.openImageStudio = function () {
    if (imagePanel) {
        imagePanel.classList.add('active');
        if (promptInput) promptInput.focus();

        // Close sidebar on mobile if open
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
    }
};

window.closeImageStudio = function () {
    if (imagePanel) {
        imagePanel.classList.remove('active');
    }
};

// Main Logic
async function handleGenerateImage() {
    const rawPrompt = promptInput.value.trim();
    if (!rawPrompt) return;

    // UI State: Busy
    setStudioBusy(true);
    statusText.textContent = "Checking prompt...";
    imageResult.innerHTML = ''; // Clear previous

    try {
        let finalPrompt = rawPrompt;

        // 1. Check for Thai characters
        const thaiRegex = /[\u0E00-\u0E7F]/;
        if (thaiRegex.test(rawPrompt)) {
            statusText.textContent = "Translating prompt to English...";
            finalPrompt = await translatePrompt(rawPrompt);
        }

        // 2. Generate Image
        statusText.textContent = "Generating image...";
        await generatePollinationsImage(finalPrompt);

        statusText.textContent = "Done! Enjoy your masterpiece.";
    } catch (error) {
        console.error("Image Studio Error:", error);
        statusText.textContent = "Error: " + error.message;
        statusText.style.color = "#ef4444";
    } finally {
        setStudioBusy(false);
    }
}

async function translatePrompt(text) {
    try {
        const response = await fetch('/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) throw new Error("Translation failed");

        const data = await response.json();
        return data.english;
    } catch (e) {
        console.error("Translation error:", e);
        throw new Error("Could not translate prompt. Please try English.");
    }
}

function generatePollinationsImage(prompt) {
    return new Promise((resolve, reject) => {
        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;

        const img = new Image();
        img.alt = "Generated Image";
        img.className = "studio-generated-image";

        img.onload = () => {
            imageResult.innerHTML = '';
            imageResult.appendChild(img);

            // Add download/open link
            const link = document.createElement('a');
            link.href = imageUrl;
            link.target = "_blank";
            link.textContent = "Open Full Size";
            link.className = "studio-link";
            imageResult.appendChild(link);

            resolve();
        };

        img.onerror = () => {
            reject(new Error("Failed to load image from Pollinations"));
        };

        img.src = imageUrl;
    });
}

function setStudioBusy(isBusy) {
    if (generateBtn) {
        generateBtn.disabled = isBusy;
        generateBtn.innerHTML = isBusy ? '<i class="fas fa-spinner fa-spin"></i> Processing...' : '<i class="fas fa-magic"></i> Generate';
    }
    if (promptInput) promptInput.disabled = isBusy;
    if (statusText) statusText.style.color = "var(--text-color)";
}
