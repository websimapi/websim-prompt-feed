async function getUserInterests(currentUser) {
    if (!currentUser) return 'The user is anonymous. Generate prompts based on generally popular, trending, and visually spectacular creative themes.';

    let interests = [];

    // 1. User's own projects
    try {
        const userProjectsResponse = await fetch(`/api/v1/users/${currentUser.username}/projects?first=10&posted=true&sort_by=updated_at`);
        if (userProjectsResponse.ok) {
            const userProjects = await userProjectsResponse.json();
            userProjects.projects.data.forEach(p => {
                if (p.project.title) interests.push(p.project.title);
                if (p.site && p.site.prompt && p.site.prompt.text) {
                    interests.push(p.site.prompt.text);
                }
            });
        }
    } catch (e) {
        console.error("Couldn't fetch user projects:", e);
    }

    // 2. Projects from followed users
    try {
        const followingResponseRaw = await fetch(`/api/v1/users/${currentUser.username}/following?first=5`);
        if (followingResponseRaw.ok) {
            const followingResponse = await followingResponseRaw.json();
            const followedUsers = followingResponse.following.data.map(f => f.follow.user);

            for (const followedUser of followedUsers) {
                if (followedUser && followedUser.username) {
                    const followedProjectsResponse = await fetch(`/api/v1/users/${followedUser.username}/projects?first=5&posted=true&sort_by=updated_at`);
                    if (followedProjectsResponse.ok) {
                        const followedProjects = await followedProjectsResponse.json();
                        followedProjects.projects.data.forEach(p => {
                            if (p.project.title) interests.push(p.project.title);
                            if (p.site && p.site.prompt && p.site.prompt.text) {
                                interests.push(p.site.prompt.text);
                            }
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Couldn't fetch followed users' projects:", e);
    }

    // 3. User's liked projects
    try {
        const likedResponseRaw = await fetch(`/api/v1/users/${currentUser.username}/likes?first=10`);
        if (likedResponseRaw.ok) {
            const likedResponse = await likedResponseRaw.json();
            likedResponse.likes.data.forEach(l => {
                if (l.project && l.project.title) interests.push(l.project.title);
                if (l.site && l.site.prompt && l.site.prompt.text) {
                    interests.push(l.site.prompt.text);
                }
            });
        }
    } catch(e) {
        console.error("Couldn't fetch user likes:", e);
    }

    if (interests.length > 0) {
        try {
            const uniqueInterests = [...new Set(interests)].join(', ');
            const completion = await websim.chat.completions.create({
                messages: [{
                    role: 'system',
                    content: 'You are an assistant that summarizes a list of topics and prompts into a concise list of key themes and interests. Extract the core concepts. Respond with a comma-separated list of no more than 10-15 key themes.'
                }, {
                    role: 'user',
                    content: `Here is a list of project titles and prompts from a user and people they follow: ${uniqueInterests}`
                }],
            });
            return `The user has shown interest in the following topics: ${completion.content}.`;
        } catch(e) {
            console.error("Error summarizing interests, using raw data:", e);
            return `The user has shown interest in: ${[...new Set(interests)].slice(0, 20).join(', ')}.`;
        }
    }

    return `The user's username is '${currentUser.username}' and their description is '${currentUser.description}'. They haven't created, liked, or followed anyone with public projects yet, so generate prompts based on generally popular and trending creative themes.`;
}

export async function fetchNewPrompts(currentUser, count) {
    console.log('Fetching new personalized prompts...');
    try {
        const userInterestSummary = await getUserInterests(currentUser);
        
        const completion = await websim.chat.completions.create({
            messages: [{
                role: 'system',
                content: `You are a creative prompt generator for an AI image model. Your goal is to create a personalized, engaging, and endless vertical social media feed for a user.
                ${userInterestSummary}
                Based on this, generate ${count} unique and diverse prompts for visually stunning images. The prompts should be imaginative, ranging from fantasy landscapes to futuristic cityscapes, abstract art, and surreal concepts, while being tailored to the user's inferred interests. Also, introduce some related but new concepts to keep the feed fresh.
                Respond with a JSON object following this schema: { "prompts": ["prompt1", "prompt2", ...] }`,
            }, {
                role: 'user',
                content: `Generate ${count} prompts.`,
            }],
            json: true,
        });

        const result = JSON.parse(completion.content);
        if (result.prompts && Array.isArray(result.prompts)) {
            console.log(`Fetched ${result.prompts.length} new personalized prompts.`);
            return result.prompts;
        }
        return [];
    } catch (error) {
        console.error('Error fetching prompts:', error);
        // Add some fallback prompts
        return [
            "A neon-lit cyberpunk city street in the rain, with flying cars",
            "An enchanted forest with glowing mushrooms and ethereal spirits",
            "A majestic dragon flying over a volcanic landscape",
            "An astronaut discovering an ancient alien artifact on Mars",
            "A serene underwater city inhabited by merfolk",
            "A surrealist painting of a clock melting over a desert landscape",
            "A giant, crystalline tree in the center of a forgotten civilization"
        ];
    }
}

export async function generateImage(prompt) {
    try {
        console.log(`Generating image for prompt: "${prompt}"`);
        const result = await websim.imageGen({
            prompt: `${prompt}, vertical aspect ratio, cinematic lighting, hyperdetailed, photorealistic`,
            aspect_ratio: '9:16'
        });
        return result.url;
    } catch (error) {
        console.error('Error generating image:', error);
        return null;
    }
}