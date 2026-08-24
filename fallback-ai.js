import { pipeline, env } from 'https://jsdelivr.net';

// Tell the engine to skip the broken local files and grab the clean web stream mirror
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

async function bootAIEngineOnly() {
    const statusEl = document.getElementById('status');
    const sendBtn = document.getElementById('send-btn');
    
    try {
        if (statusEl) statusEl.innerText = "⏳ Connecting to High-Speed AI Engine (140MB Cache Build)...";
        
        // This streams the optimized model blocks straight into the browser natively
        window.aiGenerator = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
            device: 'wasm',
            dtype: 'q4'
        });
        
        if (statusEl) statusEl.innerText = "🟢 AI Online";
        if (sendBtn) sendBtn.disabled = false; 
    } catch (err) {
        console.error("AI Loader Error:", err);
        if (statusEl) statusEl.innerText = "❌ Core AI script initialization error: " + err.message;
    }
}

// Launches the background AI loader automatically when the window opens
if (document.readyState === 'complete') {
    bootAIEngineOnly();
} else {
    window.addEventListener('load', bootAIEngineOnly);
}
