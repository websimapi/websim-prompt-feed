import { fetchNewPrompts, generateImage, fetchFollowingProjects } from './api.js';
import { createFeedItemElement, updateFeedItem, hideLoading, showLoading, showFinalError } from './ui.js';

const feedContainer = document.getElementById('feed-container');

const MIN_AHEAD_BUFFER = 7;
const BATCH_SIZE = 10;

let isFetching = false;
let itemsQueue = [];
let user = null;

async function fetchAndQueueItems() {
    if (isFetching) return;
    isFetching = true;
    console.log('Fetching new items...');

    try {
        const promises = [fetchNewPrompts(user, BATCH_SIZE)];
        if (user) {
            promises.push(fetchFollowingProjects(user, BATCH_SIZE));
        }

        const results = await Promise.all(promises);
        const prompts = results[0] || [];
        const followedProjects = (user && results[1]) ? results[1] : [];
        
        const newItems = [];
        newItems.push(...prompts.map(p => ({ type: 'generated', data: p })));
        
        const validProjects = followedProjects.filter(p => p.site && p.site.id && p.project_revision && p.project_revision.current_screenshot_url);
        newItems.push(...validProjects.map(p => ({ type: 'project', data: p })));

        if (newItems.length === 0) {
            console.log("No new items fetched.");
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

    if (item.type === 'generated') {
        const prompt = item.data;
        const itemElement = createFeedItemElement(user, null);
        const imageUrl = await generateImage(prompt);
        updateFeedItem(itemElement, prompt, imageUrl);
    } else if (item.type === 'project') {
        const projectData = item.data;
        const author = projectData.project.created_by;
        const project = projectData.project;
        
        const itemElement = createFeedItemElement(author, project);
        
        const title = projectData.project.title || (projectData.site.prompt ? projectData.site.prompt.text : 'Untitled Project');
        const imageUrl = projectData.project_revision.current_screenshot_url;
        
        updateFeedItem(itemElement, title, imageUrl);
    }
}

async function handleScroll() {
    if (isFetching) return;

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

    feedContainer.addEventListener('scroll', handleScroll, { passive: true });
}

main();