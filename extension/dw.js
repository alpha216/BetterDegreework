// Listen for headers from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === "XHR_HEADERS") {
        console.log("=== DW.js: Received XHR headers ===");
        console.log("URL:", message.url);

        // Extract cookie from headers
        const cookieHeader = message.requestHeaders.find(h => h.name.toLowerCase() === "cookie");
        if (cookieHeader) {
            capturedCookie = cookieHeader.value;
            console.log("Cookie captured successfully");

            // Save cookie to chrome.storage.local
            chrome.storage.local.set({ degreeworks_cookie: capturedCookie }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Error saving cookie to storage:', chrome.runtime.lastError);
                } else {
                    console.log('DegreeWorks cookie saved to chrome.storage.local');
                }
            });

        }
    }
});

// Main function to get user classes and process DegreeWorks audit
async function userClassGet() {
    console.log("=== DW.js: Starting userClassGet ===");

    // Check if current window is on dw.auburn.edu
    if (!window.location.hostname.includes('dw.auburn.edu')) {
        window.open('https://dw.auburn.edu/', '_blank');
        console.warn('Not on dw.auburn.edu, opening new window.');
        return;
    }

    const audit_res = await fetchDegreeWorksAudit();
    if (audit_res) {
        await DegreeworksParsing(audit_res);
    } else {
        console.error("Failed to retrieve DegreeWorks audit data");
    }
    console.log("=== DW.js: Completed userClassGet ===");
}

function getStoredCookie() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['degreeworks_cookie'], (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.degreeworks_cookie);
            }
        });
    });
}

/**
 * Fetch DegreeWorks audit data via background script
 * First gets user info to obtain studentId, then fetches audit
 */
async function fetchDegreeWorksAudit() {
    const capturedCookie = await getStoredCookie();
    console.log(capturedCookie)
    if (!capturedCookie) {
        console.error("No cookie available for DegreeWorks audit request");
        return;
    }

    try {
        // First, get user info to obtain the student ID
        console.log("=== Fetching user info to get student ID ===");
        const userInfoResponse = await chrome.runtime.sendMessage({
            action: "fetchUserInfo",
            cookie: capturedCookie
        });

        if (!userInfoResponse.success) {
            console.error("Failed to fetch user info:", userInfoResponse.error);
            return;
        }

        const studentId = userInfoResponse.data._embedded.students[0].id;
        const studentSchool = userInfoResponse.data._embedded.students[0].goals[0].school.key;
        const studentDegree = userInfoResponse.data._embedded.students[0].goals[0].degree.key;
        console.log("=== Student ID obtained:", studentId, "===");
        console.log("=== Student School obtained:", studentSchool, "===");
        console.log("=== Student Degree obtained:", studentDegree, "===");

        // Now fetch the audit with the obtained student ID
        const auditResponse = await chrome.runtime.sendMessage({
            action: "fetchDegreeWorksAudit",
            cookie: capturedCookie,
            studentId: studentId,
            studentSchool: studentSchool,
            studentDegree: studentDegree
        });

        if (auditResponse.success) {
            console.log("=== DegreeWorks Audit Response ===");
            console.log(auditResponse.data);
            return auditResponse.data;
        } else {
            console.error("DegreeWorks audit request failed:", auditResponse.error);
        }
    } catch (error) {
        console.error("Error fetching DegreeWorks audit:", error);
    }
}

const classinfo = {
    "classes": {},
    "classInfo": {},
    "inProgress": []
};

async function DegreeworksParsing(auditData) {
    console.log("=== DW.js: Parsing DegreeWorks Audit Data ===");

    getInprogress(auditData);
    getClasses(auditData);
    await getPrerequisites();

    console.log("=== DW.js: Completed Parsing ===");
    console.log(classinfo);

    // Store classinfo in chrome storage
    chrome.storage.local.set({ classinfo: classinfo }, () => {
        console.log("Class info stored in chrome.storage.local");
    });
}

function getInprogress(jsonData) {
    if ("inProgress" in jsonData && Array.isArray(jsonData.inProgress.classArray)) {
        jsonData.inProgress.classArray.forEach(classItem => {
            if (!("inProgress" in classinfo)) {
                classinfo["inProgress"] = [];
            }
            classinfo["inProgress"].push(classItem.discipline + classItem.number);
        })
    }
}

function getClasses(jsonData) {
    const data = jsonData.blockArray;
    const classes = classinfo["classes"];

    data.forEach(item => {
        classes[item.title] = {};
        if ("ruleArray" in item) {
            sectionBlockJSON(item, classes[item.title]);
        }
    });

    function sectionBlockJSON(data, parent) {
        data.ruleArray.forEach(rule => {
            const ruleObj = {};

            if ("ruleArray" in rule) {
                sectionBlockJSON(rule, ruleObj);
            }

            if ("classesAppliedToRule" in rule) {
                const classData = classBlockJSON(rule);
                if (classData.taken.length > 0) {
                    ruleObj.taken = classData.taken;
                }
                if (classData.available.length > 0) {
                    ruleObj.available = classData.available;
                }
            }

            // Only add if there's content
            if (Object.keys(ruleObj).length > 0) {
                parent[rule.label] = ruleObj;
            } else {
                parent[rule.label] = null;
            }
        });
    }

    function classBlockJSON(data) {
        const result = { taken: [], available: [] };

        if ("classArray" in data.classesAppliedToRule) {
            data.classesAppliedToRule.classArray.forEach(classItem => {
                result.taken.push(classItem.discipline + classItem.number);
            });
        }

        if ("advice" in data) {
            data.advice.courseArray.forEach(classItem => {
                result.available.push(classItem.discipline + classItem.number);
            });
        }

        return result;
    }
}

async function getPrerequisites() {

    function getAllCourseCodes(classes) {
        const codes = new Set();
        function traverse(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (obj.taken) obj.taken.forEach(c => codes.add(c));
            if (obj.available) obj.available.forEach(c => codes.add(c));
            for (const key in obj) {
                if (key !== 'taken' && key !== 'available') traverse(obj[key]);
            }
        }
        traverse(classes);
        return Array.from(codes);
    }

    const allClasses = getAllCourseCodes(classinfo.classes);
    console.log("=== Fetching prerequisites for all classes ===");

    // Fetch prerequisites for all classes in parallel
    const fetchPromises = allClasses.map(async (classItem) => {
        // Parse discipline (letters) and number (digits)
        // Format: "COMP3700" -> discipline: "COMP", number: "3700"
        const match = classItem.match(/^([A-Z]+)(\d+)$/);
        if (!match) {
            console.warn(`Invalid class format: ${classItem}`);
            return null;
        }

        const discipline = match[1];
        const number = match[2];

        try {
            const response = await chrome.runtime.sendMessage({
                action: "fetchCourseLink",
                cookie: capturedCookie,
                discipline: discipline,
                number: number
            });

            if (response.success) {
                preqParsing(response.data);
                return response.data;
            } else {
                console.error(`Failed to fetch prereqs for ${classItem}:`, response.error);
                return null;
            }
        } catch (error) {
            console.error(`Error fetching prereqs for ${classItem}:`, error);
            return null;
        }
    });

    // Wait for all requests to complete
    await Promise.all(fetchPromises);
    console.log("=== All prerequisites fetched ===");

    function preqParsing(jsonData) {
        if (!jsonData.courseInformation) {
            console.error('courseInformation not found in JSON');
            return;
        }
        const data = jsonData.courseInformation.courses[0];
        if (!data) {
            console.warn('No course data found in response');
            return;
        }
        const courseName = data.subjectCode + data.courseNumber;

        if ("prerequisites" in data && data.prerequisites.length > 0) {
            const prereqGroups = parsePrerequisites(data.prerequisites);
            classinfo["classInfo"][courseName] = {
                name: data.title,
                prerequisites: prereqGroups
            };
        } else {
            classinfo["classInfo"][courseName] = {
                name: data.title,
                prerequisites: []
            };
        }
    }

    /**
     * Parse prerequisites into AND groups of OR options
     * Result: [[OR group 1], [OR group 2], ...] where all groups must be satisfied (AND)
     * Each OR group: [{code, minimumGrade}, ...] where any one can satisfy (OR)
     * 
     * Example: "(COMP2710 OR COMP2713) AND (COMP3350 OR COMP3353 OR ELEC2220)"
     * Result: [
     *   [{"COMP2710": {"minimumGrade": "D"}}, {"COMP2713": {"minimumGrade": "D"}}],
     *   [{"COMP3350": {"minimumGrade": "D"}}, {"COMP3353": {"minimumGrade": "D"}}, {"ELEC2220": {"minimumGrade": "D"}}]
     * ]
     */
    function parsePrerequisites(prerequisites) {
        const result = [];
        let currentGroup = [];

        for (let i = 0; i < prerequisites.length; i++) {
            const prereq = prerequisites[i];
            const code = prereq.subjectCodePrerequisite + prereq.courseNumberPrerequisite;
            const prereqObj = {};
            prereqObj[code] = { minimumGrade: prereq.minimumGrade || null };

            // Add to current group
            currentGroup.push(prereqObj);

            // Check if this is the end of a group (right parenthesis or last item)
            // or if next connector is AND
            const nextPrereq = prerequisites[i + 1];

            if (prereq.rightParenthesis === ')' || !nextPrereq) {
                // End of a group, push current group to result
                if (currentGroup.length > 0) {
                    result.push(currentGroup);
                    currentGroup = [];
                }
            } else if (nextPrereq && nextPrereq.connector === 'A') {
                // Next is AND, so current group ends here
                if (currentGroup.length > 0) {
                    result.push(currentGroup);
                    currentGroup = [];
                }
            }
            // If connector is 'O' (OR), continue adding to current group
        }

        // Handle any remaining items in currentGroup
        if (currentGroup.length > 0) {
            result.push(currentGroup);
        }

        return result;
    }
}
