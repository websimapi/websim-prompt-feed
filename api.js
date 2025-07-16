async function getUserInterests(currentUser) {
    if (!currentUser) return 'The user is anonymous. Generate prompts based on generally popular, trending, and visually spectacular creative themes.';

    let interests = [];

    // 1. User's own projects
    try {
        const userProjectsResponse = await fetch(`/api/v1/users/${currentUser.username}/projects?first=30&posted=true&sort_by=updated_at`);
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
        const followingResponse = await fetch(`/api/v1/users/${currentUser.username}/following?first=15`);
        if (followingResponse.ok) {
            const followingData = await followingResponse.json();
            const followedUsers = followingData.following.data.map(f => f.follow.user);

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
        const likedResponse = await fetch(`/api/v1/users/${currentUser.username}/likes?first=30`);
        if (likedResponse.ok) {
            const likedData = await likedResponse.json();
            likedData.likes.data.forEach(l => {
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
    console.log('Fetching new personalized ad prompts...');
    try {
        const userInterestSummary = await getUserInterests(currentUser);
        
        const completion = await websim.chat.completions.create({
            messages: [{
                role: 'system',
                content: `You are a chaotic advertising prompt generator creating OVER-THE-TOP, FLASHY, COMMERCIAL advertising visuals. Your goal is to create prompts that feel like out-of-control ads - think flashy infomercials, aggressive marketing, clickbait thumbnails, and absurd product advertisements.
                ${userInterestSummary}
                Based on this, generate ${count} unique and diverse advertising-style prompts that are:
                - LOUD and attention-grabbing with excessive use of superlatives
                - Include fake product advertisements, miracle cures, get-rich-quick schemes
                - Feature bright neon colors, explosion effects, before/after comparisons
                - Use advertising buzzwords like "AMAZING!", "LIMITED TIME!", "DOCTORS HATE THIS!"
                - Include fictional products, services, or lifestyle promises
                - Feel like spam emails, popup ads, or late-night TV commercials
                - Are completely over-the-top and absurd
                Examples: "SHOCKING! This ONE WEIRD TRICK will make you RICH! Neon explosions, dollar signs flying everywhere, before/after photos, urgent red text everywhere" or "DOCTORS HATE HIM! Local man discovers ANCIENT SECRET to perfect teeth! Dramatic before/after, medical imagery, bright dental advertising aesthetic"
                Respond with a JSON object following this schema: { "prompts": ["prompt1", "prompt2", ...] }`,
            }, {
                role: 'user',
                content: `Generate ${count} outrageous advertising prompts.`,
            }],
            json: true,
        });

        const result = JSON.parse(completion.content);
        if (result.prompts && Array.isArray(result.prompts)) {
            console.log(`Fetched ${result.prompts.length} new personalized ad prompts.`);
            return result.prompts;
        }
        return [];
    } catch (error) {
        console.error('Error fetching ad prompts:', error);
        // Add some fallback ad prompts
        return [
            "SHOCKING! This ONE WEIRD TRICK will make you RICH! Neon explosions, dollar signs flying everywhere, before/after photos, urgent red text everywhere",
            "DOCTORS HATE HIM! Local man discovers ANCIENT SECRET to perfect teeth! Dramatic before/after, medical imagery, bright dental advertising aesthetic",
            "AMAZING! Lose 50 pounds in 5 days with this MIRACLE PILL! Before/after photos, explosive weight loss imagery, medical claims, bright colors",
            "LIMITED TIME OFFER! Buy this REVOLUTIONARY gadget and change your life FOREVER! Product showcase, explosion effects, urgent timers",
            "SCIENTISTS SHOCKED! This simple kitchen ingredient REVERSES AGING! Anti-aging advertisement, laboratory imagery, fountain of youth visuals",
            "URGENT! Government doesn't want you to know this INVESTMENT SECRET! Money flying, charts going up, financial freedom imagery",
            "BREAKTHROUGH! This app makes you FLUENT in any language in 24 hours! Brain imagery, language flags, before/after learning results"
        ];
    }
}

export async function fetchFollowingProjects(currentUser, count, afterCursor = null) {
    if (!currentUser) return { projects: [], meta: null };
    try {
        console.log(`Fetching projects from users followed by @${currentUser.username}...`);
        const url = `/api/v1/users/${currentUser.username}/following/projects?first=${count}&posted=true&sort_by=updated_at${afterCursor ? `&after=${afterCursor}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch following projects: ${response.status} ${response.statusText}`);
            return { projects: [], meta: null };
        }
        const data = await response.json();
        if (data.projects && data.projects.data) {
            console.log(`Fetched ${data.projects.data.length} projects from followed users.`);
            return { projects: data.projects.data, meta: data.projects.meta };
        }
        return { projects: [], meta: null };
    } catch (error) {
        console.error('Error fetching following projects:', error);
        return { projects: [], meta: null };
    }
}

export async function generateImage(prompt) {
    try {
        console.log(`Generating advertisement image for prompt: "${prompt}"`);
        const result = await websim.imageGen({
            prompt: `${prompt}, advertising style, commercial photography, marketing poster, flashy colors, promotional material, advertisement layout, bold text overlay, marketing campaign, vertical aspect ratio`,
            aspect_ratio: '9:16'
        });
        return result.url;
    } catch (error) {
        console.error('Error generating advertisement image:', error);
        return null;
    }
}