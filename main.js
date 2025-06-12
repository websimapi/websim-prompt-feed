import { fetchNewPrompts, generateImage } from './api.js';
import { createFeedItemElement, updateFeedItem, hideLoading, showLoading, showFinalError } from './ui.js';

const feedContainer = document.getElementById('feed-container');

const MIN_AHEAD_BUFFER = 7;
const PROMPT_BATCH_SIZE = 10;

let isFetching = false;
let promptsQueue = [];
let user = null;

async function populateFeed() {
    if (isFetching && promptsQueue.length === 0) return; // a fetch is already in progress

    if (promptsQueue.length === 0) {
        console.log('Prompt queue is empty, fetching more...');
        isFetching = true;
        const newPrompts = await fetchNewPrompts(user, PROMPT_BATCH_SIZE);
        promptsQueue.push(...newPrompts);
        isFetching = false;
        if (promptsQueue.length === 0) {
            console.error("Failed to add new item, no prompts available.");
            return;
        }
    }

    const prompt = promptsQueue.shift();
    if (!prompt) return;

    const itemElement = createFeedItemElement(user);
    const imageUrl = await generateImage(prompt);
    updateFeedItem(itemElement, prompt, imageUrl);
    feedContainer.appendChild(itemElement);
}

async function handleScroll() {
    if (isFetching) return;

    const totalItems = feedContainer.children.length;
    const currentItemIndex = Math.round(feedContainer.scrollTop / window.innerHeight);
    const remainingItems = totalItems - currentItemIndex - 1;

    if (remainingItems < MIN_AHEAD_BUFFER) {
        isFetching = true;
        const itemsToCreate = MIN_AHEAD_BUFFER - remainingItems;
        console.log(`Buffer low (${remainingItems} remaining), creating ${itemsToCreate} new items.`);

        try {
            if (promptsQueue.length < itemsToCreate) {
                const newPrompts = await fetchNewPrompts(user, PROMPT_BATCH_SIZE);
                promptsQueue.push(...newPrompts);
            }
            
            const creationPromises = [];
            for (let i = 0; i < itemsToCreate; i++) {
                if (promptsQueue.length > 0) {
                    creationPromises.push(populateFeed());
                } else {
                    console.log("Ran out of prompts while refilling buffer.");
                    break;
                }
            }
            await Promise.all(creationPromises);
        } catch (e) {
            console.error("Failed to add new items on scroll", e);
        } finally {
            isFetching = false;
        }
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
    
    const initialPrompts = await fetchNewPrompts(user, PROMPT_BATCH_SIZE);
    promptsQueue.push(...initialPrompts);

    if (promptsQueue.length === 0) {
        showFinalError('Could not generate feed. Please try again later.');
        return;
    }
    
    hideLoading();

    const itemsToCreate = Math.min(MIN_AHEAD_BUFFER, promptsQueue.length);
    const initialPromises = [];
    for (let i = 0; i < itemsToCreate; i++) {
        initialPromises.push(populateFeed());
    }
    await Promise.all(initialPromises);

    feedContainer.addEventListener('scroll', handleScroll);
}

main();