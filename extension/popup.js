document.addEventListener('DOMContentLoaded', () => {
	const statusValue = document.getElementById('statusValue');
	const classesContainer = document.getElementById('classesContainer');
	const classesList = document.getElementById('classesList');
	const showFlowchartBtn = document.getElementById('showFlowchartBtn');
	const updateClassBtn = document.getElementById('updateClassBtn');

	// Show Flowchart button handler
	showFlowchartBtn.onclick = () => {
	};

	// Update Class Data button handler
	updateClassBtn.onclick = () => {
		if (typeof userClassGet === 'function') {
			userClassGet();
		} else if (window.chrome && chrome.tabs) {
			// Try to execute userClassGet in the active tab
			chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
				if (tabs[0]) {
					chrome.scripting.executeScript({
						target: {tabId: tabs[0].id},
						func: () => { if (typeof userClassGet === 'function') userClassGet(); }
					});
				}
			});
		}
	};

	// Load classinfo from chrome.storage.local
	chrome.storage.local.get('classinfo', (result) => {
		const classinfo = result.classinfo;
		if (classinfo && classinfo.classes) {
			renderClassData(classinfo.classes);
		} else {
			renderNoData();
		}
	});

	function renderClassData(classes) {
		statusValue.textContent = 'Class data loaded';
		statusValue.className = 'status-value has-data';
		classesContainer.style.display = '';
		classesList.innerHTML = '';
		Object.keys(classes).forEach(section => {
			const sectionDiv = document.createElement('div');
			sectionDiv.className = 'class-section';
			sectionDiv.textContent = section;
			classesList.appendChild(sectionDiv);
			const sectionData = classes[section];
			if (sectionData && typeof sectionData === 'object') {
				Object.keys(sectionData).forEach(key => {
					if (sectionData[key] && sectionData[key].taken) {
						sectionData[key].taken.forEach(course => {
							const courseDiv = document.createElement('div');
							courseDiv.className = 'class-item taken';
							courseDiv.textContent = course + ' (taken)';
							classesList.appendChild(courseDiv);
						});
					}
					if (sectionData[key] && sectionData[key].available) {
						sectionData[key].available.forEach(course => {
							const courseDiv = document.createElement('div');
							courseDiv.className = 'class-item available';
							courseDiv.textContent = course + ' (available)';
							classesList.appendChild(courseDiv);
						});
					}
				});
			}
		});
	}

	function renderNoData() {
		statusValue.textContent = 'No class data found';
		statusValue.className = 'status-value no-data';
		classesContainer.style.display = 'none';
	}
});
