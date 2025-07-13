const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require("crypto");


const PORT = 3000;
const USERS_FILE = 'users.json';



function hashPassword(passw_string)
{
    return crypto.createHash("sha256").update(passw_string).digest("hex");
}

const GEMINI_API_KEY = "AIzaSyD27XBGta2Ai507GHB1hCMVQDjKkqrUUKM"; 
const GEMINI_API_HOST = "generativelanguage.googleapis.com";
const GEMINI_API_PATH = `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Updated my_info structure to include user_events
let my_info_template = {
    go_to_school: "off", goals: "", hobbies: "", age: -1, resources: [], strengths: "", weaknesses: "", sports: "", bad_habits: "", situation: "", commitmnets_to_yourself: "", priorities: "", more_info: " ", fixedSchedule: [],
    gemini_created_schedule: [], // Initialize as empty array
    user_events: [] // New field for user-created/modified events
};

let people = [];

function loadUsers()
{
    try
    {
        if (fs.existsSync(USERS_FILE))
        {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            people = JSON.parse(data);
            // Ensure all users have the new user_events field
            people = people.map(p => ({
                ...p,
                my_info: { ...my_info_template, ...p.my_info } // Merge with template to ensure new fields
            }));
            console.log(`[SERVER] Loaded ${people.length} users from ${USERS_FILE}`);
        } else
        {
            console.log(`[SERVER] ${USERS_FILE} not found. Starting with empty user list.`);
        }
    } catch (e)
    {
        console.error(`[ERROR] Failed to load users from ${USERS_FILE}:`, e.message);
        people = []; // Reset if loading fails
    }
}

// Save users to file
function saveUsers()
{
    try
    {
        fs.writeFileSync(USERS_FILE, JSON.stringify(people, null, 2));
        console.log(`[SERVER] Saved ${people.length} users to ${USERS_FILE}`);
    } catch (e)
    {
        console.error(`[ERROR] Failed to save users to ${USERS_FILE}:`, e.message);
    }
}

// Initial load of users
loadUsers();

// Example users (will be overwritten if users.json exists)
if (people.length === 0)
{
    create_person("alex@example.com", "123");
    create_person("isaac@example.com", "123");
    saveUsers(); // Save initial example users
}


function create_person(email, password)
{
    var salt = (100000000 * Math.random()).toString();
    people.push({
        email: email,
        password: hashPassword(password + salt),
        admin: 0,
        salt: salt,
        my_info: { ...my_info_template } // Use the template for new users
    });
    saveUsers(); // Save after creating a new person
}

function dayStringToIndex(dayStr)
{
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return days.indexOf(dayStr) ?? 0;
}

function create_prompt_for_gemini(userInfo)
{
    return `
You are a highly detailed and precise schedule generator AI. Your output MUST be ONLY a JSON array of schedule event objects, with no explanations, no extra text, and no conversational filler.

Each event object must include:
- id: a unique string identifier (e.g., "event-1", "work-task-3")
- title: a concise string describing the event (e.g., "Morning Run", "Team Meeting")
- day: an integer from 0 (Monday) to 6 (Sunday)
- startTime: a string in "HH:MM AM/PM" format (e.g., "08:30 AM", "03:00 PM")
- endTime: a string in "HH:MM AM/PM" format (e.g., "09:00 AM", "04:30 PM")
- duration: an integer representing the duration in minutes
- type: one of these categories: ["school", "work", "sports", "meal", "personal care", "social", "hobby", "rest", "other"]
- notes: a detailed string. This field should be used to provide rich descriptions, specific instructions, and relevant external links (e.g., to articles, tutorials, meeting invites, or detailed resources). If a link is provided, ensure it is a full, valid URL (e.g., "https://www.example.com/details"). If no specific link is available, state "No specific link available."
- link: an optional string, a real and relevant full URL (e.g., a real tutorial, resource, or location). Do not use example.com or placeholder links. If no specific link is available, this field should be omitted or set to null.
- color: a pleasant hex color string (e.g., "#RRGGBB") that visually suits the event's type or theme.

THE USER'S FIXED SCHEDULE BELOW MUST BE COPIED **EXACTLY** INTO THE OUTPUT. DO NOT CHANGE, SHORTEN, MOVE, OR ALTER ANY FIXED EVENTS IN ANY WAY. IF AN EVENT LASTS ALL DAY, IT MUST BE OUTPUT EXACTLY AS PROVIDED. DO NOT MODIFY THE TIME, DURATION, OR TITLE OF FIXED EVENTS.

Use the fixedSchedule to block out time. Then, generate a comprehensive 7-day schedule (days 0-6), filling all remaining free time with productive, rest, social, and fun activities that are highly suitable for the user's detailed profile. Ensure no time slots are left unscheduled.

**User hobby frequency:**
- Camping: a few times a year (do NOT schedule weekly, only if specifically requested)
- Programming: every day (include specific project ideas or learning resources with links if possible, e.g., "Learn React Hooks: https://react.dev/learn/hooks")
- Hiking: with family and friends, preferably on weekends (suggest specific trails or preparation tips with links if possible, e.g., "Runyon Canyon Loop: https://www.alltrails.com/trail/us/california/runyon-canyon-park-trail")

User fixed schedule (day, timeStart, timeEnd, activity):
${(userInfo.fixedSchedule || []).map(item =>
    {
        const day = typeof item.day === "number" ? item.day : dayStringToIndex(item.day);
        const startMins = item.start || 0;
        const duration = item.duration || 60;
        const endMins = startMins + duration;
        const toTime = mins =>
        {
            let h = Math.floor(mins / 60);
            let m = mins % 60;
            let ampm = h >= 12 ? "PM" : "AM";
            h = h % 12 === 0 ? 12 : h % 12;
            return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
        };
        // For fixed events, ensure all new fields are present, even if empty/null
        return `{ "id": "fixed-${item.id || Math.random().toString(36).substring(2, 9)}", "title": "${item.title || item.activity || "Untitled"}", "day": ${day}, "startTime": "${toTime(startMins)}", "endTime": "${toTime(endMins)}", "duration": ${duration}, "type": "other", "notes": "${item.notes || "Fixed schedule event."}", "link": null, "color": "#607D8B" }`; // Default color for fixed
    }).join(',\n')}

User profile:
- Age: ${userInfo.age || "not specified"}
- Goals: ${userInfo.goals || "not specified"}
- Hobbies: ${userInfo.hobbies || "not specified"}
- Resources available: ${userInfo.resources.join(', ') || "not specified"}
- Strengths: ${userInfo.strengths || "not specified"}
- Weaknesses: ${userInfo.weaknesses || "not specified"}
- Sports: ${userInfo.sports || "not specified"}
- Bad habits: ${userInfo.bad_habits || "not specified"}
- Current situation: ${userInfo.situation || "not specified"}
- Commitments to self: ${userInfo.commitments_to_yourself || "not specified"}
- Priorities: ${userInfo.priorities || "not specified"}
- Additional info: ${userInfo.more_info || "none"}

REMEMBER: DO NOT CHANGE, SHORTEN, OR MOVE ANY FIXED EVENTS. COPY THEM EXACTLY INTO THE OUTPUT.
If a fixed event spans midnight, ensure it is split into two events as per the instructions below, but keep its original properties (title, type, notes, link, color).

NOTE: IF ANY FIXED EVENT STARTS ON ONE DAY AND ENDS AFTER MIDNIGHT, SPLIT IT INTO TWO EVENTS:
- First event: from the original start time to 11:59 PM on the start day.
- Second event: from 12:00 AM to the original end time on the next day.
DO NOT CHANGE THE TOTAL DURATION OR TIMES OF THE FIXED EVENT, JUST SPLIT IT ACROSS DAYS.

Example:
If a fixed event is on day 1 (Tuesday) from 5:00 AM to 4:00 AM the next day, output:
[
  { "id": "fixed-event-part1", "title": "Night Shift", "day": 1, "startTime": "05:00 AM", "endTime": "11:59 PM", "duration": 1019, "type": "work", "notes": "Working through the night.", "link": null, "color": "#FF5722" },
  { "id": "fixed-event-part2", "title": "Night Shift", "day": 2, "startTime": "12:00 AM", "endTime": "04:00 AM", "duration": 240, "type": "work", "notes": "Working through the night.", "link": null, "color": "#FF5722" }
]

Respond ONLY with the JSON array.
  `.trim();
}

// New function for chatbot prompt
function create_chatbot_prompt_for_gemini(calendarEvents, userMessage)
{
    // Convert events to a more readable format for Gemini
    const formattedEvents = calendarEvents.map(event =>
    {
        const startDate = new Date(event.startTime);
        const endDate = new Date(event.endTime);
        const dayOfWeek = startDate.toLocaleDateString('en-US', { weekday: 'long' });
        const startTime = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const endTime = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const eventType = event.isGeminiGenerated ? "AI-Generated" : "User-Created";
        const linkInfo = event.link ? `, Link: ${event.link}` : '';
        const colorInfo = event.color ? `, Color: ${event.color}` : '';
        return `ID: ${event.id}, Title: ${event.title}, Description: ${event.description || 'N/A'}, Category: ${event.category}, Day: ${dayOfWeek}, Start: ${startTime}, End: ${endTime}, Type: ${eventType}${linkInfo}${colorInfo}`;
    }).join('\n');

    return `
You are a smart calendar assistant. You can answer questions about the user's calendar and help them manage their events.
When the user asks a question, provide a helpful natural language answer.
When the user asks to add, delete, or modify an event, respond with a JSON object containing an "action" and "event" (for add/update) or "id" (for delete).
If you perform a calendar action, also provide a natural language "response_message".

Current Calendar Events (read-only context for you):
${formattedEvents.length > 0 ? formattedEvents : "No events currently in the calendar."}

User's Request: "${userMessage}"

Respond ONLY with a JSON object.

If the user asks a question, use this format:
{
  "action": "answer",
  "response_message": "Your answer here."
}

If the user asks to add an event, use this format:
{
  "action": "add",
  "event": {
    "id": "new-event-${Date.now()}", // Generate a unique ID
    "title": "Event Title",
    "description": "Event Description (optional)",
    "category": "work", // or personal, family, health, education, social, holiday, other
    "startTime": "ISO_STRING_DATE_TIME", // e.g., "2025-07-12T10:00:00.000Z"
    "endTime": "ISO_STRING_DATE_TIME",
    "allDay": false, // true or false
    "link": "https://www.example.com", // Optional, full URL
    "color": "#RRGGBB" // Optional, hex color
  },
  "response_message": "I've added the event to your calendar."
}

If the user asks to update an event, use this format. You MUST use an existing ID from the calendar events.
{
  "action": "update",
  "event": {
    "id": "existing-event-id",
    "title": "Updated Title",
    "description": "Updated Description (optional)",
    "category": "personal",
    "startTime": "ISO_STRING_DATE_TIME",
    "endTime": "ISO_STRING_DATE_TIME",
    "allDay": false,
    "link": "https://www.updatedlink.com", // Optional, full URL
    "color": "#RRGGBB" // Optional, hex color
  },
  "response_message": "I've updated the event."
}

If the user asks to delete an event, use this format. You MUST use an existing ID from the calendar events.
{
  "action": "delete",
  "id": "existing-event-id",
  "response_message": "I've deleted the event."
}

Ensure all dates and times in 'startTime' and 'endTime' are valid ISO 8601 strings, including timezone information if applicable, and correspond to the user's request. For simplicity, assume events are for the current week unless specified otherwise. When adding or updating, ensure 'category' is one of the allowed values: "work", "personal", "family", "health", "education", "social", "holiday", "other".
`.trim();
}


http.createServer(async (req, res) =>
{
    // Helper to find a person by email
    function findPersonByEmail(email)
    {
        return people.find(p => p.email === email);
    }

    // Helper to find a person by index
    function findPersonByIndex(index)
    {
        if (index >= 0 && index < people.length)
        {
            return people[index];
        }
        return null;
    }

    // New endpoint for chatbot interaction
    if (req.url === '/api/chatbot' && req.method === 'POST')
    {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () =>
        {
            try
            {
                const { userId, userMessage, currentCalendarEvents } = JSON.parse(body);

                const currentUser = findPersonByIndex(userId);
                if (!currentUser)
                {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'User not found.' }));
                    return;
                }

                const prompt = create_chatbot_prompt_for_gemini(currentCalendarEvents, userMessage);
                console.log("[SERVER] Sending chatbot prompt to Gemini:", prompt);

                const geminiResponse = await new Promise((resolve, reject) =>
                {
                    const reqOptions = {
                        host: GEMINI_API_HOST,
                        path: GEMINI_API_PATH,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    };

                    const geminiReq = https.request(reqOptions, (geminiRes) =>
                    {
                        let responseData = '';
                        geminiRes.on('data', chunk => responseData += chunk);
                        geminiRes.on('end', () =>
                        {
                            console.log("[SERVER] Raw Gemini Chatbot Response Data:", responseData);
                            try
                            {
                                const parsedResponse = JSON.parse(responseData);
                                const text = parsedResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (!text) throw new Error("Gemini response missing expected text content.");

                                let cleaned = text.trim();
                                if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
                                else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```\s*/i, '').replace(/```$/, '').trim();

                                const finalParsed = JSON.parse(cleaned);
                                resolve(finalParsed);

                            } catch (err)
                            {
                                reject(new Error("Failed to process Gemini chatbot response: " + err.message + " Raw: " + responseData));
                            }
                        });
                    });

                    geminiReq.on('error', e => reject(e));
                    geminiReq.write(JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }));
                    geminiReq.end();
                });

                // If Gemini suggests a calendar action, update user_events
                if (geminiResponse.action && geminiResponse.action !== "answer")
                {
                    let updatedUserEvents = [...currentUser.my_info.user_events];
                    if (geminiResponse.action === "add" && geminiResponse.event)
                    {
                        // Ensure the new event has a unique ID and is marked as user-created
                        const newEvent = { ...geminiResponse.event, id: `user-${Date.now()}`, isGeminiGenerated: false };
                        updatedUserEvents.push(newEvent);
                    } else if (geminiResponse.action === "update" && geminiResponse.event && geminiResponse.event.id)
                    {
                        const index = updatedUserEvents.findIndex(e => e.id === geminiResponse.event.id);
                        if (index !== -1)
                        {
                            updatedUserEvents[index] = { ...updatedUserEvents[index], ...geminiResponse.event, isGeminiGenerated: false };
                        }
                    } else if (geminiResponse.action === "delete" && geminiResponse.id)
                    {
                        updatedUserEvents = updatedUserEvents.filter(e => e.id !== geminiResponse.id);
                    }
                    currentUser.my_info.user_events = updatedUserEvents;
                    saveUsers();
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(geminiResponse)); // Send Gemini's parsed response back to frontend
            } catch (error)
            {
                console.error("[ERROR] Chatbot API failed:", error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ action: "answer", response_message: `Error: Failed to process your request. ${error.message}` }));
            }
        });
        return;
    }


    if (req.url.startsWith('/api/user-events') && (req.method === 'GET' || req.method === 'POST'))
    {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () =>
        {
            try
            {
                const urlParams = new URLSearchParams(req.url.split('?')[1]);
                let userIndex = urlParams.get('userId');

                if (req.method === 'POST')
                {
                    const parsedBody = JSON.parse(body);
                    userIndex = parsedBody.userId;
                    if (userIndex === undefined)
                    {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'User ID is required in POST body.' }));
                        return;
                    }
                }

                if (userIndex === null || isNaN(parseInt(userIndex)))
                {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'User ID is required.' }));
                    return;
                }

                const currentUser = findPersonByIndex(parseInt(userIndex));
                if (!currentUser)
                {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'User not found.' }));
                    return;
                }

                if (req.method === 'GET')
                {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        gemini_schedule: currentUser.my_info.gemini_created_schedule || [],
                        user_events: currentUser.my_info.user_events || []
                    }));
                } else if (req.method === 'POST')
                {
                    const { events: newUserEvents } = JSON.parse(body);
                    currentUser.my_info.user_events = newUserEvents;
                    saveUsers(); // Save updated user info
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'User events updated successfully.' }));
                }
            } catch (error)
            {
                console.error("[ERROR] /api/user-events failed:", error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Failed to process user events: ${error.message}` }));
            }
        });
        return;
    }


    if (req.url === '/submit_form' && req.method === 'POST')
    {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () =>
        {
            try
            {
                const formData = JSON.parse(body);
                const userIndex = formData.user;
                const currentUser = findPersonByIndex(userIndex);

                if (!currentUser)
                {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'User not found.' }));
                    return;
                }

                // Preserve user_events when updating my_info
                const existingUserEvents = currentUser.my_info.user_events;

                if (formData.my_info)
                {
                    currentUser.my_info = {
                        ...currentUser.my_info,
                        ...formData.my_info
                    };
                } else
                {
                    currentUser.my_info = {
                        ...currentUser.my_info,
                        ...formData
                    };
                }
                // Restore user_events after merging
                currentUser.my_info.user_events = existingUserEvents;

                saveUsers(); // Save updated user info

                console.log("[SERVER] Received form submission for user:", currentUser.email, currentUser.my_info);

                const prompt = create_prompt_for_gemini(currentUser.my_info);
                console.log("[SERVER] Sending prompt to Gemini:", prompt);

                const geminiResponse = await new Promise((resolve, reject) =>
                {
                    const reqOptions = {
                        host: GEMINI_API_HOST,
                        path: GEMINI_API_PATH,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    };

                    const geminiReq = https.request(reqOptions, (geminiRes) =>
                    {
                        let responseData = '';
                        geminiRes.on('data', chunk => responseData += chunk);
                        geminiRes.on('end', () =>
                        {
                            // NEW: Log the raw response data
                            console.log("[SERVER] Raw Gemini Response Data:", responseData);
                            try
                            {
                                const parsedResponse = JSON.parse(responseData);
                                const text = parsedResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (!text) throw new Error("Gemini response missing expected text content.");

                                let cleaned = text.trim();
                                if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
                                else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```\s*/i, '').replace(/```$/, '').trim();

                                const finalParsed = JSON.parse(cleaned);
                                if (!Array.isArray(finalParsed)) throw new Error("Gemini output is not an array.");

                                // Made notes and color optional in validation
                                const requiredFields = ["id", "title", "day", "startTime", "endTime", "duration", "type"];
                                for (const [i, event] of finalParsed.entries())
                                {
                                    for (const field of requiredFields)
                                    {
                                        if (!(field in event))
                                        {
                                            throw new Error(`Event at index ${i} missing required field: ${field}`);
                                        }
                                    }
                                }
                                console.log(finalParsed);
                                resolve(finalParsed);
                            } catch (err)
                            {
                                reject(new Error("Failed to process Gemini response: " + err.message));
                            }
                        });
                    });

                    geminiReq.on('error', e => reject(e));
                    geminiReq.write(JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }));
                    geminiReq.end();
                });

                currentUser.my_info.gemini_created_schedule = geminiResponse;
                saveUsers(); // Save updated user info with schedule

                res.writeHead(200, { 'Content-Type': 'application/json' });
                // Return the full my_info so calendar.html can get both schedules
                res.end(JSON.stringify({ message: 'User information updated and schedule generated!', my_info: currentUser.my_info }));
                console.log("[SERVER] Schedule generated successfully by Gemini.");
            } catch (error)
            {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Failed to generate schedule with Gemini: ${error.message}` }));
                console.error("[ERROR] Failed to generate schedule with Gemini:", error);
            }
        });
        return;
    }

    if (req.url === '/sign_in' && req.method === 'POST')
    {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () =>
        {
            try
            {
                const login_data = JSON.parse(body);
                const { email, password } = login_data.my_login_info || login_data; // Use email instead of name

                const userIndex = people.findIndex(p => p.email === email);
                const foundUser = people[userIndex];

                if (foundUser && hashPassword(password + foundUser.salt) === foundUser.password)
                {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    // Return user index and their my_info on successful login
                    res.end(JSON.stringify({ user: userIndex, pass_correct: true, message: "Login successful", my_info: foundUser.my_info }));
                } else
                {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ pass_correct: false, message: "Invalid email or password." }));
                }
            } catch (error)
            {
                console.error("[ERROR] Sign-in failed:", error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Failed to sign in: ${error.message}` }));
            }
        });
        return;
    }

    // Sign-up endpoint
    if (req.url === '/sign_up' && req.method === 'POST')
    {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () =>
        {
            try
            {
                const { email, password } = JSON.parse(body);

                if (!email || !password)
                {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: "Email and password are required." }));
                    return;
                }

                if (findPersonByEmail(email))
                {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: "Account with this email already exists." }));
                    return;
                }

                create_person(email, password); // This also saves users to file

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: "Signed up successfully! You can now log in." })); // Updated message
            } catch (error)
            {
                console.error("[ERROR] Sign-up failed:", error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: `Sign up failed: ${error.message}` }));
            }
        });
        return;
    }

    // Dummy google_auth endpoint (for demo, always "succeeds")
    // IMPORTANT: In a real application, you MUST verify the Google credential on the server-side.
    // Use Google's Node.js client library (e.g., google-auth-library) to verify the ID token.
    if (req.url === '/google_auth' && req.method === 'POST')
    {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () =>
        {
            try
            {
                const { credential } = JSON.parse(body);
                console.log("[SERVER] Received Google credential (dummy):", credential);

                // For now, simulate success
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, user: { email: "google_user@example.com" } }));
            } catch (error)
            {
                console.error("[ERROR] Google auth failed:", error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: `Google login failed: ${error.message}` }));
            }
        });
        return;
    }

    // Serve static files for GET requests
    if (req.method === 'GET')
    {
        let safePath = decodeURIComponent(req.url.split('?')[0]); // strip query params
        if (safePath === '/') safePath = '/index.html';

        const filePath = path.join(__dirname, safePath);
        const extname = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.wav': 'audio/wav',
            '.mp4': 'video/mp4',
            '.woff': 'application/font-woff',
            '.ttf': 'application/font-ttf',
            '.wasm': 'application/wasm'
        };

        const contentType = mimeTypes[extname] || 'application/octet-stream';

        try
        {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        } catch (e)
        {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end("File not found");
        }

        console.log("[REQUEST] URL:", req.url);
        console.log("[RESOLVED] Path:", filePath);

        return;
    }


    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
}).listen(PORT, () =>
{
    console.log(`Server running at http://localhost:${PORT}/`);
});
