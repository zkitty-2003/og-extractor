import axios from 'axios';

// Defaults to relative path so it works with Nginx proxy
const api = axios.create({
    baseURL: 'http://localhost:10001',
    headers: {
        'Content-Type': 'application/json',
    },
});


/**
 * Helper to construct request configuration with Authorization header key if provided.
 * @param {string} [token] - The API key or token (optional)
 * @returns {object} Axios config object
 */
function getAuthConfig(token) {
    if (token) {
        return {
            headers: {
                Authorization: `Bearer ${token}`
            }
        };
    }
    return {};
}

export const sendMessage = async (message, chatId, userEmail, userAvatar, history, model, token) => {
    return api.post(
        '/chat',
        {
            message,
            chat_id: chatId,
            user_email: userEmail,
            user_avatar: userAvatar,
            history,
            model,
        },
        getAuthConfig(token)
    );
};

export const translatePrompt = async (text, token) => {
    return api.post('/translate', { text }, getAuthConfig(token));
};

export const googleLogin = async (token) => {
    // Note: This token is the Google ID token sent in the body, not the Authorization header
    return api.post('/auth/google', { token });
};

export const summarizeChat = async (chatId, messages, userEmail, token) => {
    return api.post(
        '/chat/summary',
        {
            chat_id: chatId,
            messages,
            user_email: userEmail
        },
        getAuthConfig(token)
    );
};

export const fetchOpenRouterModels = async (apiKey) => {
    return axios.get('https://openrouter.ai/api/v1/models', {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'ABDUL Chat'
        }
    });
};

export default api;
