/**
 * Sets "Last updated" labels to the current month and year.
 * Updates automatically when the calendar month changes.
 */

function formatLegalLastUpdated(date) {
    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function initLegalLastUpdated() {
    const label = `Last updated: ${formatLegalLastUpdated(new Date())}`;

    document.querySelectorAll('[data-legal-last-updated]').forEach((element) => {
        element.textContent = label;
    });
}

document.addEventListener('DOMContentLoaded', initLegalLastUpdated);
