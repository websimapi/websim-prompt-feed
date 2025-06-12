const feedContainer = document.getElementById('feed-container');
const loadingIndicator = document.getElementById('loading');

export function createFeedItemElement(user) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    
    const promptInfo = document.createElement('div');
    promptInfo.className = 'prompt-info';
    promptInfo.textContent = 'Generating...';
    item.appendChild(promptInfo);
    
    if (user) {
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        const userAvatar = document.createElement('img');
        userAvatar.src = user.avatar_url || `https://images.websim.com/avatar/${user.username}`;
        const userName = document.createElement('span');
        userName.textContent = `@${user.username}`;
        userInfo.appendChild(userAvatar);
        userInfo.appendChild(userName);
        item.appendChild(userInfo);
    }

    feedContainer.appendChild(item);
    return item;
}

export function updateFeedItem(item, prompt, imageUrl) {
    const promptInfo = item.querySelector('.prompt-info');
    if (imageUrl) {
        const img = new Image();
        img.onload = () => {
            item.style.backgroundImage = `url(${imageUrl})`;
            if (promptInfo) promptInfo.textContent = prompt;
        };
        img.src = imageUrl;
    } else {
        item.style.backgroundColor = '#333';
        if (promptInfo) promptInfo.textContent = `Error: Could not load image for "${prompt}"`;
    }
}

export function showLoading(message) {
    const p = loadingIndicator.querySelector('p');
    if (p) p.textContent = message;
    loadingIndicator.classList.remove('hidden');
}

export function hideLoading() {
    loadingIndicator.classList.add('hidden');
}

export function showFinalError(message) {
    const p = loadingIndicator.querySelector('p');
    const spinner = loadingIndicator.querySelector('.spinner');
    if (p) p.textContent = message;
    if (spinner) spinner.style.display = 'none';
    loadingIndicator.classList.remove('hidden');
}

