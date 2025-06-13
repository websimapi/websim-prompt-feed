import { fetchNewPrompts, generateImage, fetchFollowingProjects } from './api.js';
import { createFeedItemElement, hideLoading, showLoading, showFinalError, renderSpectatorIndicators } from './ui.js';

const feedContainer = document.getElementById('feed-container');
const likedFeedContainer = document.getElementById('liked-feed-container');
const likeButton = document.getElementById('like-button');
const peersButton = document.getElementById('peers-button');
const peersModal = document.getElementById('peers-modal');
const closePeersModalButton = document.getElementById('close-peers-modal-btn');
const peersList = document.getElementById('peers-list');

const MIN_AHEAD_BUFFER = 7;
const BATCH_SIZE = 10;

let isFetching = false;
let itemsQueue = [];
let myFeedItems = {}; // My generated feed items, as an object { "0": itemData, "1": itemData }
let user = null;
let followingCursor = null; // for pagination
let hasMoreFollowedProjects = true; // to know if we should keep fetching
let processedProjectIds = new Set(); // for preventing duplicates

// New state variables for likes
let likedItems = [];
const LIKED_ITEMS_KEY = 'infinite_feed_liked_items';
let isLikedFeedActive = false;
let mainFeedScrollPosition = 0;

// Multiplayer state
const room = new WebsimSocket();
let spectatingClientId = null;

// --- LocalStorage and Like Management ---

function loadLikedItems() {
    const storedLikes = localStorage.getItem(LIKED_ITEMS_KEY);
    if (storedLikes) {
        try {
            likedItems = JSON.parse(storedLikes);
        } catch (e) {
            console.error("Could not parse liked items:", e);
            likedItems = [];
        }
    }
}

function saveLikedItems() {
    localStorage.setItem(LIKED_ITEMS_KEY, JSON.stringify(likedItems));
}

function isItemLiked(itemData) {
    if (!itemData || !itemData.id) return false;
    return likedItems.some(liked => liked.id === itemData.id);
}

function getCurrentItemElement() {
    const container = isLikedFeedActive ? likedFeedContainer : feedContainer;
    if (container.children.length === 0) return null;
    const currentItemIndex = Math.round(container.scrollTop / window.innerHeight);
    return container.children[currentItemIndex]?.firstChild; // Get the .feed-item-content
}

function likeCurrentItem() {
    const currentFeedItemElement = getCurrentItemElement();
    if (!currentFeedItemElement || !currentFeedItemElement.dataset.itemData) return;

    const itemData = JSON.parse(currentFeedItemElement.dataset.itemData);

    if (isItemLiked(itemData)) {
        // Unlike
        likedItems = likedItems.filter(liked => liked.id !== itemData.id);
        likeButton.classList.remove('liked');
        console.log('Unliked:', itemData.prompt);

        if (isLikedFeedActive) {
            // Remove the item from the view immediately
            const elementToRemove = currentFeedItemElement.parentElement;
            const container = elementToRemove.parentElement;
            
            elementToRemove.remove();

            if (container.children.length === 0) {
                renderLikedFeed(); // show empty message
            } else {
                // After removing, we need to update the current item to what's now visible
                setTimeout(updateLikeButtonState, 100);
            }
        }

    } else {
        // Like
        likedItems.push(itemData);
        likeButton.classList.add('liked');
        console.log('Liked:', itemData.prompt);
    }
    saveLikedItems();
}

function updateLikeButtonState() {
    const currentItemEl = getCurrentItemElement();

    if (currentItemEl && currentItemEl.dataset.itemData) {
        const itemData = JSON.parse(currentItemEl.dataset.itemData);
        if (isItemLiked(itemData)) {
            likeButton.classList.add('liked');
        } else {
            likeButton.classList.remove('liked');
        }
    } else {
        likeButton.classList.remove('liked');
    }
}

// --- Feed Rendering & Toggling ---

function renderFeed(itemsObject, container, scrollToIndex = 0) {
    container.innerHTML = '';
    
    if (!itemsObject || Object.keys(itemsObject).length === 0) {
        return; 
    }
    
    const sortedItems = Object.entries(itemsObject)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(entry => entry[1]);

    sortedItems.forEach(itemData => {
        createFeedItemElement(itemData, container);
    });

    container.scrollTop = scrollToIndex * window.innerHeight;
    setTimeout(updateLikeButtonState, 100);
}

function renderLikedFeed() {
    likedFeedContainer.innerHTML = '';
    if (likedItems.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'feed-item';
        emptyMessage.innerHTML = `<div class="feed-item-content" style="justify-content:center; text-align: center;"><div class="prompt-info">You haven't liked anything yet.<br><br><small>(Right-click the heart button to go back)</small></div></div>`;
        likedFeedContainer.appendChild(emptyMessage);
    } else {
        likedItems.slice().reverse().forEach(itemData => { // show most recent likes first
            createFeedItemElement(itemData, likedFeedContainer);
        });
    }
    setTimeout(updateLikeButtonState, 100);
}

function toggleLikedFeed(event) {
    event.preventDefault(); // Prevent context menu
    if (spectatingClientId) {
        alert("You can't view your liked feed while spectating someone else. Click your name in the user list to return to your feed first.");
        return;
    }

    isLikedFeedActive = !isLikedFeedActive;

    if (isLikedFeedActive) {
        console.log('Switching to liked feed.');
        mainFeedScrollPosition = feedContainer.scrollTop;
        feedContainer.classList.add('hidden');
        likedFeedContainer.classList.remove('hidden');
        renderLikedFeed();
        likedFeedContainer.scrollTop = 0; // Start at the top of liked feed
    } else {
        console.log('Switching back to main feed.');
        likedFeedContainer.classList.add('hidden');
        feedContainer.classList.remove('hidden');
        feedContainer.scrollTop = mainFeedScrollPosition;
    }
    setTimeout(updateLikeButtonState, 100);
}

// --- Multiplayer ---

function togglePeersModal() {
    peersModal.classList.toggle('hidden');
}

function renderPeersList() {
    peersList.innerHTML = '';
    if (!room.peers) return;

    const myPresence = room.presence[room.clientId] || {};
    
    Object.values(room.peers).forEach(peer => {
        const peerPresence = room.presence[peer.id] || {};
        
        const peerItem = document.createElement('div');
        peerItem.className = 'peer-item';
        
        const avatar = document.createElement('img');
        avatar.src = peer.avatarUrl || `https://images.websim.com/avatar/${peer.username}`;
        
        const peerInfoContainer = document.createElement('div');
        peerInfoContainer.className = 'peer-info-container';
        const username = document.createElement('span');
        username.className = 'username';
        username.textContent = peer.username + (peer.id === room.clientId ? ' (You)' : '');
        
        const status = document.createElement('span');
        status.className = 'status';

        if (peer.id === spectatingClientId) {
            peerItem.classList.add('iam-spectating');
            status.textContent = 'You are spectating';
        } else if (peerPresence.viewing) {
             if (peerPresence.viewing.type === 'spectating') {
                const targetName = (peerPresence.viewing.targetId === room.clientId) ? 'you' : (room.peers[peerPresence.viewing.targetId]?.username || 'someone');
                status.textContent = `Spectating @${targetName}`;
            } else {
                status.textContent = `Viewing their feed`;
            }
        } else {
             status.textContent = 'Online';
        }
        
        peerInfoContainer.appendChild(username);
        peerInfoContainer.appendChild(status);
        peerItem.appendChild(avatar);
        peerItem.appendChild(peerInfoContainer);
        
        peerItem.addEventListener('click', () => {
            if (peer.id === room.clientId) {
                stopSpectating();
            } else {
                startSpectating(peer.id);
            }
            togglePeersModal();
        });
        
        peersList.appendChild(peerItem);
    });
}

function startSpectating(clientId) {
    if (spectatingClientId === clientId) return;
    if (isLikedFeedActive) toggleLikedFeed({ preventDefault: () => {} });

    stopSpectating(false); // Stop any current spectating without switching view yet

    spectatingClientId = clientId;
    console.log(`Starting to spectate @${room.peers[clientId]?.username}`);
    room.updatePresence({ viewing: { type: 'spectating', targetId: clientId } });
    room.requestPresenceUpdate(clientId, { type: 'startSpectating' });
    
    const spectatedUserPresence = room.presence[clientId] || {};
    renderFeed(spectatedUserPresence.feed || {}, feedContainer, spectatedUserPresence.currentItemIndex || 0);
    renderPeersList();
}

function stopSpectating(switchToMyFeed = true) {
    if (!spectatingClientId) return;
    
    console.log(`Stopping spectating @${room.peers[spectatingClientId]?.username}`);
    room.requestPresenceUpdate(spectatingClientId, { type: 'stopSpectating' });
    
    spectatingClientId = null;
    room.updatePresence({ viewing: { type: 'own' } });
    
    if(switchToMyFeed) {
        const myPresence = room.presence[room.clientId] || {};
        renderFeed(myFeedItems, feedContainer, myPresence.currentItemIndex || 0);
        handleScroll();
    }
    renderPeersList();
}

function handlePresenceUpdate(presence) {
    renderPeersList();

    const myPresence = presence[room.clientId] || {};
    
    if (spectatingClientId) {
        const spectatedUserPresence = presence[spectatingClientId];
        if (spectatedUserPresence) {
            const currentScrollIndex = Math.round(feedContainer.scrollTop / window.innerHeight);
            renderFeed(spectatedUserPresence.feed || {}, feedContainer, currentScrollIndex);
        } else {
            console.log("Spectated user disconnected. Returning to your feed.");
            stopSpectating();
        }
    } else {
        const myCurrentItemIndex = myPresence.currentItemIndex || 0;
        const myCurrentItem = feedContainer.children[myCurrentItemIndex]?.firstChild;
        if(myCurrentItem) {
            const spectatorsOnMyItem = {};
            if (myPresence.spectators) {
                Object.entries(myPresence.spectators).forEach(([id, data]) => {
                    if (data.index === myCurrentItemIndex && room.peers[id]) {
                        spectatorsOnMyItem[id] = { ...room.peers[id] };
                    }
                });
            }
            Array.from(feedContainer.querySelectorAll('.spectator-indicators')).forEach(el => el.innerHTML = '');
            renderSpectatorIndicators(myCurrentItem, spectatorsOnMyItem);
        }
    }
}

function handlePresenceUpdateRequest(request, fromClientId) {
    const myCurrentPresence = room.presence[room.clientId];
    const currentSpectators = myCurrentPresence.spectators || {};

    switch(request.type) {
        case 'startSpectating':
            room.updatePresence({ spectators: { ...currentSpectators, [fromClientId]: { index: myCurrentPresence.currentItemIndex || 0 } } });
            break;
        case 'stopSpectating':
            const newSpectators = { ...currentSpectators };
            delete newSpectators[fromClientId];
            room.updatePresence({ spectators: { "spectators": newSpectators } });
            break;
        case 'spectatorMoved':
             if (currentSpectators[fromClientId]) {
                room.updatePresence({ spectators: { ...currentSpectators, [fromClientId]: { index: request.index } } });
            }
            break;
    }
}

async function initMultiplayer() {
    await room.initialize();
    console.log('Multiplayer initialized. Client ID:', room.clientId);
    
    room.updatePresence({
        feed: myFeedItems,
        currentItemIndex: 0,
        spectators: {}, // who is watching me
        viewing: { type: 'own' } // what am I doing
    });

    room.subscribePresence(handlePresenceUpdate);
    room.subscribePresenceUpdateRequests(handlePresenceUpdateRequest);
    
    peersButton.addEventListener('click', togglePeersModal);
    closePeersModalButton.addEventListener('click', togglePeersModal);

    renderPeersList();
}

// --- My Feed Generation ---

async function fetchAndQueueItems() {
    if (isFetching) return;
    isFetching = true;
    console.log('Fetching new items...');

    try {
        const promises = [fetchNewPrompts(user, BATCH_SIZE)];
        if (user && hasMoreFollowedProjects) {
            promises.push(fetchFollowingProjects(user, BATCH_SIZE, followingCursor));
        }

        const results = await Promise.all(promises);
        const prompts = results[0] || [];
        
        let followedProjects = [];
        if (user && hasMoreFollowedProjects && results[1]) {
            const followedResult = results[1];
            followedProjects = followedResult.projects || [];
            if (followedResult.meta) {
                followingCursor = followedResult.meta.end_cursor;
                hasMoreFollowedProjects = followedResult.meta.has_next_page;
            } else {
                hasMoreFollowedProjects = false;
            }
        }
        
        const newItems = [];
        newItems.push(...prompts.map(p => ({ type: 'generated', data: p })));
        
        // Filter out duplicates and invalid projects
        const newFollowedProjects = followedProjects.filter(p => {
            if (!p.project || !p.site?.prompt?.text || processedProjectIds.has(p.project.id)) {
                return false;
            }
            return true;
        });

        // Add new project IDs to the set
        newFollowedProjects.forEach(p => processedProjectIds.add(p.project.id));
        
        newItems.push(...newFollowedProjects.map(p => ({ type: 'project', data: p })));

        if (newItems.length === 0) {
            console.log("No new items fetched.");
             if (user && !hasMoreFollowedProjects) {
                console.log("No more projects from followed users.");
            }
            return;
        }
        
        // Shuffle the newly fetched items together
        for (let i = newItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newItems[i], newItems[j]] = [newItems[j], newItems[i]];
        }

        itemsQueue.push(...newItems);
        console.log(`Added ${newItems.length} new items. Queue size: ${itemsQueue.length}`);

    } catch (e) {
        console.error('Error fetching more items:', e);
    } finally {
        isFetching = false;
    }
}

async function createAndAppendItem() {
    if (itemsQueue.length === 0) {
        await fetchAndQueueItems();
        if (itemsQueue.length === 0) {
            console.log("Queue is still empty. Cannot create item.");
            return;
        }
    }
    const item = itemsQueue.shift();
    if (!item) return;

    let itemData;
    let prompt;

    if (item.type === 'generated') {
        prompt = item.data;
    } else if (item.type === 'project') {
        prompt = item.data.site.prompt.text;
    } else {
        return;
    }

    const imageUrl = await generateImage(prompt);
    if (!imageUrl) return;

    if (item.type === 'generated') {
        itemData = {
            id: imageUrl, type: 'generated', prompt, imageUrl, project: null,
            user: user ? { username: user.username, avatar_url: user.avatar_url } : null
        };
    } else { // project
        const { project } = item.data;
        itemData = {
            id: project.id, type: 'project', prompt, imageUrl,
            project: { 
                id: project.id,
                created_by: { username: project.created_by.username, avatar_url: project.created_by.avatar_url }
            }
        };
    }

    const newIndex = Object.keys(myFeedItems).length;
    myFeedItems[newIndex] = itemData;
    room.updatePresence({ feed: { [newIndex]: itemData } });

    createFeedItemElement(itemData, feedContainer);
}

async function handleScroll() {
    updateLikeButtonState();

    if (isLikedFeedActive) return;

    const currentItemIndex = Math.round(feedContainer.scrollTop / window.innerHeight);

    if (spectatingClientId) {
        room.requestPresenceUpdate(spectatingClientId, { type: 'spectatorMoved', index: currentItemIndex });
        return;
    }
    
    room.updatePresence({ currentItemIndex });

    const myPresence = room.presence[room.clientId] || {};
    const myCurrentItem = feedContainer.children[currentItemIndex]?.firstChild;
    if(myCurrentItem) {
        const spectatorsOnMyItem = {};
        if (myPresence.spectators) {
            Object.entries(myPresence.spectators).forEach(([id, data]) => {
                if (data.index === currentItemIndex && room.peers[id]) {
                    spectatorsOnMyItem[id] = { ...room.peers[id] };
                }
            });
        }
        Array.from(feedContainer.querySelectorAll('.spectator-indicators')).forEach(el => el.innerHTML = '');
        renderSpectatorIndicators(myCurrentItem, spectatorsOnMyItem);
    }

    if (isFetching) return;

    const totalItems = feedContainer.children.length;
    const remainingItems = totalItems - currentItemIndex - 1;

    if (remainingItems < MIN_AHEAD_BUFFER) {
        const itemsToCreate = MIN_AHEAD_BUFFER - remainingItems;
        console.log(`Buffer low (${remainingItems} remaining), creating ${itemsToCreate} new items.`);
        
        const creationPromises = [];
        for (let i = 0; i < itemsToCreate; i++) {
            creationPromises.push(createAndAppendItem());
        }
        await Promise.all(creationPromises);
    }
}

async function main() {
    loadLikedItems(); // Load likes from storage at startup

    likeButton.addEventListener('click', likeCurrentItem);
    likeButton.addEventListener('contextmenu', toggleLikedFeed);
    
    await initMultiplayer();

    try {
        user = await websim.getUser();
        if (user) {
            showLoading(`Building your personalized feed, @${user.username}...`);
        } else {
            showLoading('Building your feed...');
        }
    } catch (e) {
        console.log("Could not get user, continuing as anonymous.");
        showLoading('Building your feed...');
    }
    
    await fetchAndQueueItems();

    if (itemsQueue.length === 0) {
        showFinalError('Could not generate feed. Please try again later.');
        return;
    }
    
    const initialItemsCount = Math.min(MIN_AHEAD_BUFFER, itemsQueue.length);
    const initialPromises = [];
    for (let i = 0; i < initialItemsCount; i++) {
        initialPromises.push(createAndAppendItem());
    }
    await Promise.all(initialPromises);
    
    hideLoading();

    feedContainer.addEventListener('scroll', handleScroll, {
        passive: true
    });
    likedFeedContainer.addEventListener('scroll', updateLikeButtonState, {
        passive: true
    });

    // Initial check for like button state
    updateLikeButtonState();
}

main();