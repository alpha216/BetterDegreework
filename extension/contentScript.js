// Content script to inject a 'Make flowchart' button on the right side of the page

function addFlowchartButton() {
  // Prevent duplicate buttons
  if (document.getElementById('dw-make-flowchart-btn')) return;
  let h1 = document.querySelector('h1');
  if (h1) {
    insertButton(h1);
    return;
  }
  // If h1 not found, observe DOM for it
  const observer = new MutationObserver((mutations, obs) => {
    h1 = document.querySelector('h1');
    if (h1) {
      insertButton(h1);
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function insertButton(h1) {
  if (document.getElementById('dw-make-flowchart-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'dw-make-flowchart-btn';
  btn.textContent = 'Make flowchart';
  btn.style.marginLeft = '16px';
  btn.style.padding = '8px 16px';
  btn.style.background = '#1976d2';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '16px';
  btn.style.fontWeight = 'bold';
  btn.style.transition = 'background 0.2s';
  btn.onmouseenter = () => btn.style.background = '#1565c0';
  btn.onmouseleave = () => btn.style.background = '#1976d2';
  btn.onclick = () => {
    // Check if classinfo exists in chrome.storage.local before running flowchart
    chrome.storage.local.get("classinfo", (data) => {
      if (data && data.classinfo) {
        flowchartinit();
      } else {
        userClassGet().then(() => {
            flowchartinit();
            }
        ).catch((err) => {
            console.error("Error fetching class info:", err);
        });
      }
    });
  };
  h1.insertAdjacentElement('afterend', btn);
}
