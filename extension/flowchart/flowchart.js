function flowchartinit() {
    console.log("Generating flowchart...");
    // Get the data to send (simulate dw.json fetch)
    chrome.storage.local.get("classinfo", (data) => {
        // Open the flowchart HTML in a new tab
        const url = chrome.runtime.getURL("/flowchart/roadmap.html");
        const win = window.open(url, "_blank");
        // Wait for the new window to load, then send the data
        const sendData = () => {
            if (!win) return;
            win.postMessage({ type: "DW_FLOWCHART_DATA", classinfo: data.classinfo }, "*");
        };
        // Try to send after a short delay (window may not be ready immediately)
        setTimeout(sendData, 500);
    });
}