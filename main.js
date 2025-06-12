import { fetchNewPrompts, generateImage, fetchFollowingProjects } from './api.js';
import { createFeedItemElement, updateFeedItem, hideLoading, showLoading, showFinalError } from './ui.js';

const feedContainer = document.getElementById('feed-container');

const MIN_AHEAD_BUFFER = 7;
const BATCH_SIZE = 10;

let isFetching = false;
let itemsQueue = [];
let user = null;
let followingCursor = null; // for pagination
let hasMoreFollowedProjects = true; // to know if we should keep fetching
let processedProjectIds = new Set(); // for preventing duplicates

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
        
        const prompt = projectData.site.prompt.text;
        const imageUrl = await generateImage(prompt);
        
        updateFeedItem(itemElement, prompt, imageUrl);
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