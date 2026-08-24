import { pipeline, env } from 'https://jsdelivr.net';

// Bypasses the broken local LFS files and switches to the high-speed public cdn mirror
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

async function launchCloudBypass() {
    const statusEl = document.getElementById('status');
    const sendBtn = document.getElementById('send-btn');
    
    try {
        if (statusEl) statusEl.innerText = "⏳ Connecting to High-Speed AI Engine (140MB Cache Build)...";
        
        // Streams an optimized 4-bit version of Qwen2.5 that fits cleanly inside Chromebook memory
        const generator = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
            device: 'wasm',
            dtype: 'q4'
        });
        
        if (statusEl) statusEl.innerText = "🟢 AI Online";
        if (sendBtn) sendBtn.disabled = false;
        
        // Hooks into your existing textarea/send button setup globally
        window.sendMessage = async function() {
            const inputEl = document.getElementById('user-input');
            if (!inputEl) return;
            const prompt = inputEl.value.trim();
            if (!prompt) return;
            
            inputEl.value = '';
            appendMessageUI(prompt, 'user-msg');
            
            const trackingId = appendMessageUI("Running algorithms...", 'ai-msg');
            const responseEl = document.getElementById(trackingId);
            
            try {
                const history = [{ role: 'user', content: prompt }];
                const output = await generator(history, { max_new_tokens: 250, temperature: 0.6 });
                const reply = output.generated_text[output.generated_text.length - 1].content;
                if (responseEl) responseEl.innerText = reply;
            } catch (err) {
                if (responseEl) responseEl.innerText = "Runtime Error: " + err.message;
            }
        };
        
        // Also binds the send action to your custom layout buttons
        if (sendBtn) {
            sendBtn.onclick = window.sendMessage;
        }
    } catch (err) {
        if (statusEl) statusEl.innerText = "❌ Master pipeline script load failure.";
        console.error(err);
    }
}

function appendMessageUI(text, className) {
    const msgBox = document.getElementById('messages-box');
    if (!msgBox) return null;
    const div = document.createElement('div');
    const id = 'fallback-' + Date.now();
    div.id = id;
    div.className = `msg ${className}`;
    div.innerText = text;
    msgBox.appendChild(div);
    msgBox.scrollTop = msgBox.scrollHeight;
    return id;
}

// Automatically runs if the main script gets stuck or fails to load local models
setTimeout(() => {
    const target = document.getElementById('status');
    if (target && (target.innerText.includes('failed') || target.innerText.includes('protocols'))) {
        launchCloudBypass();
    }
}, 1000);
