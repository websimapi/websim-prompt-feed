import { fetchNewPrompts, generateImage, fetchFollowingProjects } from './api.js';
import { createFeedItemElement, updateFeedItem, hideLoading, showLoading, showFinalError } from './ui.js';

const feedContainer = document.getElementById('feed-container');
const likedFeedContainer = document.getElementById('liked-feed-container');
const likeButton = document.getElementById('like-button');

const MIN_AHEAD_BUFFER = 7;
const BATCH_SIZE = 10;

let isFetching = false;
let itemsQueue = [];
let user = null;
let followingCursor = null; // for pagination
let hasMoreFollowedProjects = true; // to know if we should keep fetching
let processedProjectIds = new Set(); // for preventing duplicates

// New state variables for likes
let likedItems = [];
const LIKED_ITEMS_KEY = 'infinite_feed_liked_items';
let isLikedFeedActive = false;
let mainFeedScrollPosition = 0;
let currentItemElement = null;

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

function likeCurrentItem() {
    if (!currentItemElement || !currentItemElement.dataset.itemData) return;

    const itemData = JSON.parse(currentItemElement.dataset.itemData);

    if (isItemLiked(itemData)) {
        // Unlike
        likedItems = likedItems.filter(liked => liked.id !== itemData.id);
        likeButton.classList.remove('liked');
        console.log('Unliked:', itemData.prompt);

        if (isLikedFeedActive) {
            // Remove the item from the view immediately
            const elementToRemove = currentItemElement.parentElement;
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
    const container = isLikedFeedActive ? likedFeedContainer : feedContainer;
    if (container.children.length === 0) {
        likeButton.classList.remove('liked');
        currentItemElement = null;
        return;
    };
    const currentItemIndex = Math.round(container.scrollTop / window.innerHeight);
    currentItemElement = container.children[currentItemIndex]?.firstChild; // Get the .feed-item-content

    if (currentItemElement && currentItemElement.dataset.itemData) {
        const itemData = JSON.parse(currentItemElement.dataset.itemData);
        if (isItemLiked(itemData)) {
            likeButton.classList.add('liked');
        } else {
            likeButton.classList.remove('liked');
        }
    } else {
        likeButton.classList.remove('liked');
    }
}

// --- Feed Toggling ---

function renderLikedFeed() {
    likedFeedContainer.innerHTML = '';
    if (likedItems.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'feed-item';
        emptyMessage.innerHTML = `<div class="feed-item-content" style="justify-content:center; text-align: center;"><div class="prompt-info">You haven't liked anything yet.<br><br><small>(Right-click the heart button to go back)</small></div></div>`;
        likedFeedContainer.appendChild(emptyMessage);
    } else {
        likedItems.slice().reverse().forEach(itemData => { // show most recent likes first
            const author = itemData.type === 'project' ? itemData.project.created_by : itemData.user;
            const project = itemData.type === 'project' ? itemData.project : null;
            const itemElement = createFeedItemElement(author, project, likedFeedContainer);
            updateFeedItem(itemElement, itemData.prompt, itemData.imageUrl, itemData);
        });
    }
    // After rendering, update the like button for the first (or only) item
    setTimeout(updateLikeButtonState, 100);
}


function toggleLikedFeed(event) {
    event.preventDefault(); // Prevent context menu

    isLikedFeedActive = !isLikedFeedActive;

    if (isLikedFeedActive) {
        // Switch to liked feed
        console.log('Switching to liked feed.');
        mainFeedScrollPosition = feedContainer.scrollTop;
        feedContainer.classList.add('hidden');
        likedFeedContainer.classList.remove('hidden');

        renderLikedFeed();

        likedFeedContainer.scrollTop = 0; // Start at the top of liked feed

    } else {
        // Switch back to main feed
        console.log('Switching back to main feed.');
        likedFeedContainer.classList.add('hidden');
        feedContainer.classList.remove('hidden');
        feedContainer.scrollTop = mainFeedScrollPosition;
    }
    // Update button state for the currently visible item in the new view
    setTimeout(updateLikeButtonState, 100);
}


async function fetchAndQueueItems() {
    if (isFetching) return;
    isFetching = true;
    console.log('Fetching new items...');

    try {
        const promises = [];
        // Always fetch new prompts from AI
        promises.push(fetchNewPrompts(user, BATCH_SIZE));
        
        // Only fetch followed projects if user is logged in AND we believe there are more to fetch
        if (user && hasMoreFollowedProjects) {
            promises.push(fetchFollowingProjects(user, BATCH_SIZE, followingCursor));
        }

        const results = await Promise.all(promises);
        const prompts = results[0] || [];
        
        const followedResult = (user && hasMoreFollowedProjects) ? results[1] : null;
        let followedProjects = [];

        if (followedResult) {
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
            const isValid = p.project && p.site && p.site.prompt && p.site.prompt.text;
            if (!isValid) return false;
            if (processedProjectIds.has(p.project.id)) {
                console.log(`Skipping duplicate project: ${p.project.title || p.project.id}`);
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
    if (item.type === 'generated') {
        const prompt = item.data;
        const itemElement = createFeedItemElement(user, null, feedContainer);
        const imageUrl = await generateImage(prompt);
        itemData = {
            id: imageUrl, // Use image url as unique ID for generated items
            type: 'generated',
            prompt,
            imageUrl,
            project: null,
            user: user ? {
                username: user.username,
                avatar_url: user.avatar_url
            } : null
        };
        updateFeedItem(itemElement, prompt, imageUrl, itemData);
    } else if (item.type === 'project') {
        const projectData = item.data;
        const author = projectData.project.created_by;
        const project = projectData.project;
        
        const itemElement = createFeedItemElement(author, project, feedContainer);
        
        const prompt = projectData.site.prompt.text;
        const imageUrl = await generateImage(prompt);
        
        itemData = {
            id: project.id, // Project ID is unique
            type: 'project',
            prompt,
            imageUrl,
            project: { // Only store necessary info to avoid large localstorage
                id: project.id,
                created_by: {
                    username: author.username,
                    avatar_url: author.avatar_url
                }
            }
        };
        updateFeedItem(itemElement, prompt, imageUrl, itemData);
    }
}

async function handleScroll() {
    updateLikeButtonState();

    if (isFetching || isLikedFeedActive) return;

    const totalItems = feedContainer.children.length;
    const currentItemIndex = Math.round(feedContainer.scrollTop / window.innerHeight);
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

    try {
        user = await websim.getUser();
        if (user) {
            showLoading(`Building your targeted ad feed, @${user.username}...`);
        } else {
            showLoading('Building your ad feed...');
        }
    } catch (e) {
        console.log("Could not get user, continuing as anonymous.");
        showLoading('Building your ad feed...');
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