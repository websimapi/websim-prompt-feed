const feedContainer = document.getElementById('feed-container');
const loadingIndicator = document.getElementById('loading');

export function createFeedItemElement(user, project, itemType = 'default', itemData = {}) {
    const itemContent = document.createElement('div');
    itemContent.className = 'feed-item-content';

    let containerElement;

    if (itemType === 'ad') {
        containerElement = document.createElement('div');
        containerElement.className = 'feed-item feed-item-ad';
        containerElement.appendChild(itemContent);
        
        containerElement.addEventListener('click', () => {
             try {
                window.websim.postComment({
                    content: `I clicked the ad! "${itemData.slogan}"`,
                    credits: itemData.price
                });
                // Optimistically update UI
                const promptInfo = containerElement.querySelector('.prompt-info');
                if (promptInfo) {
                    promptInfo.textContent = `Tipped ${itemData.price} credits! Thanks!`;
                    containerElement.style.pointerEvents = 'none'; // Prevent re-clicking
                }
            } catch (e) {
                console.error("Failed to post tip comment", e);
                const promptInfo = containerElement.querySelector('.prompt-info');
                 if (promptInfo) {
                    promptInfo.textContent = `Could not tip. Are you logged in?`;
                }
            }
        });
    } else if (project) {
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
    
    if (user) {
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        
        const userProfileLink = document.createElement('a');
        userProfileLink.href = `https://websim.com/@${user.username}`;
        userProfileLink.target = '_blank';
        userProfileLink.className = 'user-profile-link';

        const userAvatar = document.createElement('img');
        userAvatar.src = user.avatar_url || `https://images.websim.com/avatar/${user.username}`;
        const userName = document.createElement('span');
        userName.textContent = `@${user.username}`;
        
        userProfileLink.appendChild(userAvatar);
        userProfileLink.appendChild(userName);
        userInfo.appendChild(userProfileLink);
        itemContent.appendChild(userInfo);
    }

    feedContainer.appendChild(containerElement);
    return itemContent;
}

export function updateFeedItem(item, itemData, imageUrl, itemType = 'default') {
    const promptInfo = item.querySelector('.prompt-info');

    if (imageUrl) {
        const img = new Image();
        img.onload = () => {
            item.style.backgroundImage = `url(${imageUrl})`;
            if (promptInfo) {
                if (itemType === 'ad') {
                    promptInfo.textContent = `${itemData.slogan} (Tip ${itemData.price} credits!)`;
                    promptInfo.classList.add('ad-info');
                } else {
                    const prompt = itemData.prompt;
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
                }
            }
        };
        img.src = imageUrl;
    } else {
        item.style.backgroundColor = '#333';
        if (promptInfo) {
            const text = itemType === 'ad' ? itemData.slogan : itemData.prompt;
            promptInfo.textContent = `Error: Could not load image for "${text || ''}"`;
            promptInfo.classList.remove('expanded', 'expandable', 'ad-info');
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