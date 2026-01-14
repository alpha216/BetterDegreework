
async function fetchLatestVersionFromAPI() {
  try {
    const response = await fetch('https://alpha216.github.io/BettertigerSchedule/api/newest', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Version API request failed: ${response.status}`);
    }

    const payload = await response.json();
    const newest = payload?.newest;

    if (typeof newest !== 'string') {
      throw new Error('Version API response missing "newest" string');
    }

    return newest;
  } catch (error) {
    console.error('Error fetching latest extension version:', error);
    throw error;
  }
}

/**
 * Fetch user info from DegreeWorks to get student ID
 * @param {string} cookie - The session cookie
 * @returns {Promise<Object>} - The user info data
 */
async function fetchUserInfo(cookie) {
  console.log("=== Background: fetchUserInfo called ===");
  const url = 'https://dw.auburn.edu/DashboardApplication/api/students/myself';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookie
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`User info request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("=== Background: User Info Response ===");
    console.log(data);
    return data;
  } catch (error) {
    console.error('Error fetching user info:', error);
    throw error;
  }
}

/**
 * Fetch course link data (prerequisites, etc.)
 * @param {string} cookie - The session cookie
 * @param {string} discipline - The course discipline (e.g., "COMP")
 * @param {string} number - The course number (e.g., "3700")
 * @returns {Promise<Object>} - The course link data
 */
async function fetchCourseLink(cookie, discipline, number) {
  console.log(`=== Background: fetchCourseLink called for ${discipline} ${number} ===`);
  const url = `https://dw.auburn.edu/DashboardApplication/api/course-link?discipline=${discipline}&number=${number}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookie
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Course link request failed: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching course link for ${discipline} ${number}:`, error);
    throw error;
  }
}

/**
 * Fetch DegreeWorks audit data
 * @param {string} cookie - The session cookie
 * @param {string} studentId - The student ID
 * @param {string} studentSchool - The student school key
 * @param {string} studentDegree - The student degree key
 * @returns {Promise<Object>} - The audit data
 */
async function fetchDegreeWorksAudit(cookie, studentId, studentSchool, studentDegree) {

  console.log("=== Background: fetchDegreeWorksAudit called ===");
  const url = `https://dw.auburn.edu/DashboardApplication/api/audit?studentId=${studentId}&school=${studentSchool}&degree=${studentDegree}&is-process-new=false&audit-type=AA&auditId=&include-inprogress=true&include-preregistered=true&aid-term=`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookie
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`DegreeWorks audit request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("=== Background: DegreeWorks Audit Response ===");
    console.log(data);
    return data;
  } catch (error) {
    console.error('Error fetching DegreeWorks audit:', error);
    throw error;
  }
}

try{
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    console.log("=== Background: onBeforeSendHeaders triggered ===");
    const dateHeader = details.requestHeaders.find(header => header.name === "Cookie");
    if (dateHeader) {
      console.log(dateHeader.value);
      
    }

    // Send headers to content script
    console.log("=== Background: Sending XHR headers to content script ===");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "XHR_HEADERS",
          url: details.url,
          method: details.method,
          requestHeaders: details.requestHeaders
        });
      }
    });
  },
  { urls: ["https://tigerschedule.auburn.edu/vsb/api/v2/studentdetail*", "https://dw.auburn.edu/DashboardApplication/api/validations/special-entities/terms*"] },
  ["requestHeaders", "extraHeaders"]
);
}catch(e){
  console.error("Error setting up webRequest listener:", e);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchLatestVersion") {
    fetchLatestVersionFromAPI()
      .then(version => {
        sendResponse({ success: true, version });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  if (request.action === "fetchUserInfo") {
    fetchUserInfo(request.cookie)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  if (request.action === "fetchDegreeWorksAudit") {
    fetchDegreeWorksAudit(request.cookie, request.studentId, request.studentSchool, request.studentDegree)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  if (request.action === "fetchCourseLink") {
    fetchCourseLink(request.cookie, request.discipline, request.number)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
