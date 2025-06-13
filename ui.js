const feedContainer = document.getElementById('feed-container');
const loadingIndicator = document.getElementById('loading');

export function createFeedItemElement(itemData, parentContainer = feedContainer) {
    const { id, prompt, imageUrl, project, user } = itemData;

    const itemContent = document.createElement('div');
    itemContent.className = 'feed-item-content';
    itemContent.dataset.itemData = JSON.stringify(itemData);

    let containerElement;

    if (project) {
        const linkWrapper = document.createElement('a');
        linkWrapper.href = `https://websim.com/p/${project.id}`;
        linkWrapper.target = '_blank';
        linkWrapper.className = 'feed-item';
        linkWrapper.appendChild(itemContent);
        containerElement = linkWrapper;
    } else {
        containerElement = document.createElement('div');
        containerElement.className = 'feed-item';
        containerElement.appendChild(itemContent);
    }
    
    const promptInfo = document.createElement('div');
    promptInfo.className = 'prompt-info';
    promptInfo.textContent = 'Generating...';
    
    promptInfo.addEventListener('click', (e) => {
        if (promptInfo.classList.contains('expandable')) {
            // Prevent link navigation if item is a project and we're clicking the expandable text
            e.preventDefault();
            e.stopPropagation();

            if (promptInfo.classList.contains('expanded')) {
                // Collapse
                promptInfo.textContent = promptInfo.dataset.truncatedText;
                promptInfo.classList.remove('expanded');
            } else {
                // Expand
                promptInfo.textContent = promptInfo.dataset.fullText;
                promptInfo.classList.add('expanded');
            }
        }
    });

    itemContent.appendChild(promptInfo);
    
    const author = project ? project.created_by : user;

    if (author) {
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        
        const userProfileLink = document.createElement('a');
        userProfileLink.href = `https://websim.com/@${author.username}`;
        userProfileLink.target = '_blank';
        userProfileLink.className = 'user-profile-link';

        const userAvatar = document.createElement('img');
        userAvatar.src = author.avatar_url || `https://images.websim.com/avatar/${author.username}`;
        const userName = document.createElement('span');
        userName.textContent = `@${author.username}`;
        
        userProfileLink.appendChild(userAvatar);
        userProfileLink.appendChild(userName);
        userInfo.appendChild(userProfileLink);
        itemContent.appendChild(userInfo);
    }
    
    // Add spectator container now so it's always there
    const spectatorIndicators = document.createElement('div');
    spectatorIndicators.className = 'spectator-indicators';
    itemContent.appendChild(spectatorIndicators);
    
    if (imageUrl) {
        const img = new Image();
        img.onload = () => {
            itemContent.style.backgroundImage = `url(${imageUrl})`;
        };
        img.onerror = () => {
            itemContent.style.backgroundColor = '#333';
            promptInfo.textContent = `Error: Could not load image for "${prompt || ''}"`;
        }
        img.src = imageUrl;

        promptInfo.dataset.fullText = prompt;
        if (prompt.length > 512) {
            const truncatedText = prompt.substring(0, 512) + '...';
            promptInfo.textContent = truncatedText;
            promptInfo.dataset.truncatedText = truncatedText;
            promptInfo.classList.add('expandable');
        } else {
            promptInfo.textContent = prompt;
        }
    } else {
        itemContent.style.backgroundColor = '#333';
        promptInfo.textContent = `Error: Could not load image for "${prompt || ''}"`;
    }

    parentContainer.appendChild(containerElement);
    return itemContent;
}

export function updateFeedItem(item, prompt, imageUrl, itemData = null) {
    if (itemData) {
        item.dataset.itemData = JSON.stringify(itemData);
    }
    const promptInfo = item.querySelector('.prompt-info');
    if (imageUrl) {
        const img = new Image();
        img.onload = () => {
            item.style.backgroundImage = `url(${imageUrl})`;
            if (promptInfo && prompt) {
                promptInfo.dataset.fullText = prompt;
                // Reset state for recycled elements
                promptInfo.classList.remove('expanded', 'expandable');

                if (prompt.length > 512) {
                    const truncatedText = prompt.substring(0, 512) + '...';
                    promptInfo.textContent = truncatedText;
                    promptInfo.dataset.truncatedText = truncatedText;
                    promptInfo.classList.add('expandable');
                } else {
                    promptInfo.textContent = prompt;
                }
            } else if (promptInfo) {
                promptInfo.textContent = ''; // Hide if no prompt
            }
        };
        img.src = imageUrl;
    } else {
        item.style.backgroundColor = '#333';
        if (promptInfo) {
            promptInfo.textContent = `Error: Could not load image for "${prompt || ''}"`;
            promptInfo.classList.remove('expanded', 'expandable');
        }
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

export function renderSpectatorIndicators(itemContentElement, spectators) {
    let indicatorsContainer = itemContentElement.querySelector('.spectator-indicators');
    if (!indicatorsContainer) return; // Should exist, but safety first
    
    indicatorsContainer.innerHTML = ''; // Clear old indicators

    if (!spectators || Object.keys(spectators).length === 0) return;

    Object.values(spectators).forEach(spectator => {
        const badge = document.createElement('div');
        badge.className = 'spectator-badge';
        
        const avatar = document.createElement('img');
        avatar.src = spectator.avatarUrl || `https://images.websim.com/avatar/${spectator.username}`;
        avatar.title = `@${spectator.username} is watching`;

        const name = document.createElement('span');
        name.textContent = `@${spectator.username}`;
        
        badge.appendChild(avatar);
        badge.appendChild(name);
        indicatorsContainer.appendChild(badge);
    });
}