// Main entry point - Event listeners and initialization
window.addEventListener('load', () => {
	// Check for updates on all pages
	checkForExtensionUpdate();

	// Wait for DOM ready
	if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', addFlowchartButton);
	} else {
	addFlowchartButton();
	}

});