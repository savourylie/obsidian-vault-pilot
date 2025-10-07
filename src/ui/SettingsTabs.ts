import { setIcon } from 'obsidian';

export interface Tab {
	title: string;
	icon: string;
	content_generator: (container_element: HTMLElement) => void;
}

export interface TabStructure {
	header: HTMLElement;
	buttons: {
		[key: string]: HTMLElement;
	};
	contentContainers: {
		[key: string]: HTMLElement;
	};
}

export interface Tabs {
	[key: string]: Tab;
}

export function createTabs(container_element: HTMLElement, tabs: Tabs): TabStructure {
	const tab_header = container_element.createEl('div', { attr: { class: 'vp-tab-header' } });
	const tab_content_containers: { [key: string]: HTMLElement } = {};
	const tab_buttons: { [key: string]: HTMLElement } = {};
	let first_button: HTMLElement;

	for (const tab_id in tabs) {
		const tab = tabs[tab_id];

		// Create button
		const button = tab_header.createEl('button', {
			attr: {
				class: 'vp-tab-header-button',
				'data-activate-tab': 'vp-tab-' + tab_id
			}
		});
		button.onclick = tab_button_clicked;
		setIcon(button, tab.icon);
		button.insertAdjacentText('beforeend', ' ' + tab.title);
		tab_buttons[tab_id] = button;

		// Create content container
		tab_content_containers[tab_id] = container_element.createEl('div', {
			attr: {
				class: 'vp-tab-content',
				id: 'vp-tab-' + tab_id
			}
		});

		// Generate content
		tab.content_generator(tab_content_containers[tab_id]);

		// Memorize the first tab's button
		if (!first_button) {
			first_button = button;
		}
	}

	// Activate the first tab
	if (first_button) {
		first_button.click();
	}

	return {
		header: tab_header,
		buttons: tab_buttons,
		contentContainers: tab_content_containers,
	};
}

function tab_button_clicked(this: HTMLElement) {
	// Get the tab id to activate
	const tab_id = this.getAttribute('data-activate-tab');
	if (!tab_id) return;

	// Get all tab content elements
	const tab_contents = this.parentElement?.parentElement?.querySelectorAll('.vp-tab-content');
	if (!tab_contents) return;

	// Hide all tab contents
	tab_contents.forEach((content) => {
		content.removeClass('vp-tab-active');
	});

	// Remove active class from all buttons
	const tab_buttons = this.parentElement?.querySelectorAll('.vp-tab-header-button');
	if (tab_buttons) {
		tab_buttons.forEach((button) => {
			button.removeClass('vp-tab-active');
		});
	}

	// Show the selected tab content
	const target_tab = document.getElementById(tab_id);
	if (target_tab) {
		target_tab.addClass('vp-tab-active');
	}

	// Mark this button as active
	this.addClass('vp-tab-active');
}
