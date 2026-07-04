const API_SERVER_URL = '/api';

const apiServerClient = {
    fetch: async (url, options = {}) => {
        return await window.fetch(API_SERVER_URL + url, options);
    }
};

export default apiServerClient;

export { apiServerClient };
