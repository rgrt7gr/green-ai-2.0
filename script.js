import { pipeline, env } from 'https://jsdelivr.net';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;


const MODEL_ID = 'model';
const STORAGE_KEY = 'pc_ai_chats';
const MAX_HISTORY_MESSAGES = 40;
const MAX_STORED_CHARS = 500000;

let generator = null;
let allConversations = {};
let currentChatId = null;
let isGenerating = false;

const $ = (id) => document.getElementById(id);

function setStatus(message) {
    const statusEl = $('status');
    if (statusEl) statusEl.textContent = message;
}

function setSendEnabled(enabled) {
    const sendBtn = $('send-btn');
    if (sendBtn) sendBtn.disabled = !enabled || isGenerating;
}

function makeChatId() {
    if (globalThis.crypto?.randomUUID) return `chat_${crypto.randomUUID()}`;
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isValidConversationStore(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    return Object.values(value).every((chat) =>
        chat &&
        typeof chat === 'object' &&
        typeof chat.title === 'string' &&
        Array.isArray(chat.history) &&
        chat.history.every((msg) =>
            msg &&
            (msg.role === 'user' || msg.role === 'assistant') &&
            typeof msg.content === 'string'
        )
    );
}

function loadSavedData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            allConversations = {};
        } else {
            const parsed = JSON.parse(saved);
            allConversations = isValidConversationStore(parsed) ? parsed : {};
        }
    } catch (error) {
        console.warn('Saved chat history could not be loaded:', error);
        allConversations = {};
    }

    renderSidebar();
}

function saveData() {
    try {
        const serialized = JSON.stringify(allConversations);
        if (serialized.length > MAX_STORED_CHARS) {
            console.warn('Chat history is too large to save safely. Older chats may need to be cleared.');
            setStatus('⚠️ Chat history storage limit reached. Clear old chats to continue saving.');
            return false;
        }
        localStorage.setItem(STORAGE_KEY, serialized);
        return true;
    } catch (error) {
        console.warn('Chat history could not be saved:', error);
        setStatus('⚠️ Browser storage is unavailable or full.');
        return false;
    }
}

async function initAI() {
    loadSavedData();
    setStatus('⏳ Loading local AI model...');

    try {
        generator = await pipeline('text-generation', MODEL_ID, {
            device: 'webgpu',
            dtype: 'q4'
        });

        setStatus('🟢 AI Online via WebGPU — local model');
        setSendEnabled(true);
    } catch (webgpuError) {
        console.warn('WebGPU unavailable; falling back to CPU/WASM:', webgpuError);

        try {
            generator = await pipeline('text-generation', MODEL_ID, {
                dtype: 'q4'
            });

            setStatus('🟡 AI Online via CPU/WASM — local model');
            setSendEnabled(true);
        } catch (cpuError) {
            generator = null;
            setStatus('❌ Local AI model failed to load. Check /model files.');
            console.error('Local model initialization failed:', cpuError);
        }
    }

    if (Object.keys(allConversations).length === 0) {
        createNewChat();
    } else {
        const firstId = Object.keys(allConversations).sort(sortChatIds)[0];
        switchChat(firstId);
    }
}

function sortChatIds(a, b) {
    const aTime = Number(a.split('_')[1]) || 0;
    const bTime = Number(b.split('_')[1]) || 0;
    return bTime - aTime;
}

function createNewChat() {
    const id = makeChatId();
    allConversations[id] = {
        title: 'New Stream Data',
        history: []
    };
    saveData();
    currentChatId = id;
    renderSidebar();
    switchChat(id);
}

function clearCurrentChat() {
    if (!currentChatId || !allConversations[currentChatId]) return;

    if (!window.confirm('Clear the messages in this chat?')) return;

    allConversations[currentChatId].history = [];
    allConversations[currentChatId].title = 'New Stream Data';
    saveData();
    switchChat(currentChatId);
}

function clearAllHistory() {
    if (!Object.keys(allConversations).length) return;
    if (!window.confirm('Delete all saved chat history from this browser? This cannot be undone.')) return;

    allConversations = {};
    currentChatId = null;
    saveData();
    createNewChat();
}

function switchChat(id) {
    if (!id || !allConversations[id]) return;
    currentChatId = id;

    renderSidebar();

    const msgBox = $('messages-box');
    if (!msgBox) return;

    msgBox.replaceChildren();
    appendMessage('System ready. Running fully client-side on your hardware. Enter data stream:', 'ai-msg');

    const history = allConversations[id].history || [];
    for (const msg of history) {
        appendMessage(msg.content, msg.role === 'user' ? 'user-msg' : 'ai-msg');
    }

    msgBox.scrollTop = msgBox.scrollHeight;
}

function renderSidebar() {
    const listEl = $('chat-list-box');
    if (!listEl) return;

    listEl.replaceChildren();

    Object.keys(allConversations).sort(sortChatIds).forEach((id) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'chat-item';
        item.dataset.id = id;
        item.textContent = allConversations[id].title || 'Untitled Stream';
        item.title = item.textContent;
        item.setAttribute('aria-label', `Open ${item.textContent}`);
        item.addEventListener('click', () => switchChat(id));

        if (id === currentChatId) item.classList.add('active');
        listEl.appendChild(item);
    });
}

function trimHistory(history) {
    if (history.length <= MAX_HISTORY_MESSAGES) return history;
    return history.slice(-MAX_HISTORY_MESSAGES);
}

function getGeneratedText(output) {
    if (!output) return '';

    if (Array.isArray(output)) {
        const last = output[output.length - 1];
        if (typeof last === 'string') return last;
        if (last?.generated_text) return extractGeneratedText(last.generated_text);
    }

    if (output.generated_text) return extractGeneratedText(output.generated_text);
    return '';
}

function extractGeneratedText(value) {
    if (typeof value === 'string') return value.trim();

    if (Array.isArray(value)) {
        const last = value[value.length - 1];
        if (typeof last === 'string') return last.trim();
        if (last?.content) return String(last.content).trim();
        if (last?.text) return String(last.text).trim();
    }

    if (value && typeof value === 'object') {
        if (typeof value.content === 'string') return value.content.trim();
        if (typeof value.text === 'string') return value.text.trim();
    }

    return '';
}

async function sendMessage() {
    const inputEl = $('user-input');
    if (!inputEl || !generator || !currentChatId || isGenerating) return;

    const prompt = inputEl.value.trim();
    if (!prompt) return;

    isGenerating = true;
    setSendEnabled(false);
    inputEl.value = '';

    const chat = allConversations[currentChatId];
    if (!chat) {
        isGenerating = false;
        setSendEnabled(Boolean(generator));
        return;
    }

    appendMessage(prompt, 'user-msg');
    chat.history.push({ role: 'user', content: prompt });
    chat.history = trimHistory(chat.history);

    if (chat.title === 'New Stream Data') {
        chat.title = prompt.substring(0, 22) + (prompt.length > 22 ? '...' : '');
        renderSidebar();
    }

    saveData();

    const aiMessageId = appendMessage('Running algorithms...', 'ai-msg');
    const aiMessageEl = aiMessageId ? $(aiMessageId) : null;

    try {
        const output = await generator(chat.history, {
            max_new_tokens: 250,
            temperature: 0.6,
            do_sample: true
        });

        const aiReply = getGeneratedText(output) || 'The model returned an empty response.';
        if (aiMessageEl) aiMessageEl.textContent = aiReply;

        chat.history.push({ role: 'assistant', content: aiReply });
        chat.history = trimHistory(chat.history);
        saveData();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (aiMessageEl) aiMessageEl.textContent = `Runtime Error: ${message}`;
        console.error('Generation failed:', error);
    } finally {
        isGenerating = false;
        setSendEnabled(Boolean(generator));
        inputEl.focus();

        const msgBox = $('messages-box');
        if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
    }
}

function appendMessage(text, className) {
    const msgBox = $('messages-box');
    if (!msgBox) return null;

    const div = document.createElement('div');
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    div.id = id;
    div.className = `msg ${className}`;
    div.textContent = String(text ?? '');
    msgBox.appendChild(div);
    msgBox.scrollTop = msgBox.scrollHeight;
    return id;
}

function setupUI() {
    $('new-chat-btn')?.addEventListener('click', createNewChat);
    $('clear-chat-btn')?.addEventListener('click', clearCurrentChat);
    $('clear-all-btn')?.addEventListener('click', clearAllHistory);
    $('send-btn')?.addEventListener('click', sendMessage);

    $('user-input')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
}

setupUI();
initAI();
