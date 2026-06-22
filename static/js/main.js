// State Management
let allReleaseNotes = [];
let filteredNotes = [];
let currentFilterType = 'all';
let currentSearchQuery = '';
let activeNoteForTweet = null;

// DOM Elements
const notesListEl = document.getElementById('notes-list');
const skeletonLoaderEl = document.getElementById('skeleton-loader');
const emptyStateEl = document.getElementById('empty-state');
const refreshBtn = document.getElementById('refresh-btn');
const refreshIcon = document.getElementById('refresh-icon');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const lastUpdatedText = document.getElementById('last-updated-text');
const filterChips = document.querySelectorAll('.chip');
const resetFiltersBtn = document.getElementById('reset-filters-btn');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const closeModalBtn = document.getElementById('close-modal');
const cancelTweetBtn = document.getElementById('cancel-tweet-btn');
const submitTweetBtn = document.getElementById('submit-tweet-btn');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCountEl = document.getElementById('char-count');
const modalRefBadge = document.getElementById('modal-ref-badge');
const modalRefDate = document.getElementById('modal-ref-date');
const modalRefText = document.getElementById('modal-ref-text');
const tagChips = document.querySelectorAll('.tag-chip');
const toastContainer = document.getElementById('toast-container');

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    fetchReleaseNotes();
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    // Refresh action
    refreshBtn.addEventListener('click', () => refreshReleaseNotes());

    // Search input
    searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value.toLowerCase().trim();
        clearSearchBtn.style.display = currentSearchQuery ? 'block' : 'none';
        applyFilters();
    });

    // Clear search button
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        applyFilters();
        searchInput.focus();
    });

    // Filter Chips
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilterType = chip.getAttribute('data-type');
            applyFilters();
        });
    });

    // Reset filters empty state button
    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        
        filterChips.forEach(c => c.classList.remove('active'));
        document.querySelector('.chip[data-type="all"]').classList.add('active');
        currentFilterType = 'all';
        
        applyFilters();
    });

    // Modal Control
    closeModalBtn.addEventListener('click', closeTweetModal);
    cancelTweetBtn.addEventListener('click', closeTweetModal);
    
    // Close modal on clicking outside card
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            closeTweetModal();
        }
    });

    // Live character count
    tweetTextarea.addEventListener('input', () => {
        updateCharCount();
    });

    // Quick tag chips in modal
    tagChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const tagText = chip.getAttribute('data-text');
            insertTextAtCursor(tweetTextarea, tagText);
            updateCharCount();
            tweetTextarea.focus();
        });
    });

    // Submit Tweet Action
    submitTweetBtn.addEventListener('click', triggerTweet);
}

// Fetch Release Notes from API
async function fetchReleaseNotes(force = false) {
    showLoading(true);
    
    const url = force ? '/api/release-notes/refresh' : '/api/release-notes';
    const method = force ? 'POST' : 'GET';
    
    try {
        const response = await fetch(url, { method });
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (data.error_warning) {
            showToast(data.error_warning, 'error');
        }

        allReleaseNotes = data.entries.map(entry => {
            const type = classifyUpdate(entry.content);
            return {
                ...entry,
                type,
                cleanText: stripHtml(entry.content)
            };
        });

        // Set last updated time
        updateLastFetchedTime(data.cached_at);
        applyFilters();
        
        if (force) {
            showToast('Feed successfully refreshed!', 'success');
        }
    } catch (err) {
        console.error('Error fetching release notes:', err);
        showToast(`Failed to load release notes: ${err.message}`, 'error');
        if (allReleaseNotes.length === 0) {
            renderEmptyState();
        }
    } finally {
        showLoading(false);
    }
}

// Refresh feed action
function refreshReleaseNotes() {
    refreshIcon.classList.add('spin');
    refreshBtn.disabled = true;
    fetchReleaseNotes(true).finally(() => {
        refreshIcon.classList.remove('spin');
        refreshBtn.disabled = false;
    });
}

// Classify update type based on content header
function classifyUpdate(contentHtml) {
    const htmlLower = contentHtml.toLowerCase();
    
    if (htmlLower.includes('<h3>feature</h3>') || htmlLower.includes('<h4>feature</h4>')) {
        return 'feature';
    } else if (htmlLower.includes('<h3>changed</h3>') || htmlLower.includes('<h4>changed</h4>')) {
        return 'changed';
    } else if (htmlLower.includes('<h3>deprecation</h3>') || htmlLower.includes('<h4>deprecation</h4>')) {
        return 'deprecation';
    } else if (htmlLower.includes('<h3>fix</h3>') || htmlLower.includes('<h4>fix</h4>')) {
        return 'fix';
    }
    
    return 'general';
}

// Utility to strip HTML tags cleanly
function stripHtml(htmlStr) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlStr;
    
    // Remove headers which contain type descriptors like "Feature" or "Fix"
    const headers = tempDiv.querySelectorAll('h3, h4');
    headers.forEach(h => h.remove());
    
    return tempDiv.innerText || tempDiv.textContent || '';
}

// Format Unix Timestamp to relative / readable local time
function updateLastFetchedTime(timestamp) {
    if (!timestamp) {
        lastUpdatedText.innerText = 'Updated: Unknown';
        return;
    }
    
    const date = new Date(timestamp * 1000);
    const options = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    lastUpdatedText.innerText = `Updated: ${date.toLocaleTimeString([], options)}`;
}

// Filter and Search logic
function applyFilters() {
    filteredNotes = allReleaseNotes.filter(note => {
        // Type filter match
        const matchesType = currentFilterType === 'all' || note.type === currentFilterType;
        
        // Search query match
        const matchesSearch = !currentSearchQuery || 
            note.title.toLowerCase().includes(currentSearchQuery) || 
            note.content.toLowerCase().includes(currentSearchQuery);
            
        return matchesType && matchesSearch;
    });
    
    renderReleaseNotes();
}

// Show skeleton loading indicator
function showLoading(isLoading) {
    if (isLoading) {
        notesListEl.innerHTML = '';
        skeletonLoaderEl.style.display = 'block';
        emptyStateEl.style.display = 'none';
    } else {
        skeletonLoaderEl.style.display = 'none';
    }
}

// Display Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove toast after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Render release notes cards
function renderReleaseNotes() {
    notesListEl.innerHTML = '';
    
    if (filteredNotes.length === 0) {
        renderEmptyState();
        return;
    }
    
    emptyStateEl.style.display = 'none';
    
    filteredNotes.forEach((note, index) => {
        const card = document.createElement('article');
        card.className = 'release-card';
        card.style.animationDelay = `${index * 0.05}s`;
        
        const typeLabel = note.type.charAt(0).toUpperCase() + note.type.slice(1);
        
        card.innerHTML = `
            <div class="timeline-node"></div>
            <div class="card-wrapper">
                <div class="card-header">
                    <div class="card-date">
                        <i class="fa-regular fa-calendar"></i>
                        <span>${note.title}</span>
                    </div>
                    <span class="badge badge-${note.type}">${typeLabel}</span>
                </div>
                <div class="card-body">
                    ${note.content}
                </div>
                <div class="card-actions">
                    <a href="${note.link}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        <span>Source</span>
                    </a>
                    <button class="btn btn-tweet btn-sm tweet-trigger" data-id="${note.id}">
                        <i class="fa-brands fa-x-twitter"></i>
                        <span>Tweet</span>
                    </button>
                </div>
            </div>
        `;
        
        notesListEl.appendChild(card);
    });

    // Add listeners to new Tweet buttons
    document.querySelectorAll('.tweet-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const noteId = btn.getAttribute('data-id');
            const selectedNote = allReleaseNotes.find(n => n.id === noteId);
            if (selectedNote) {
                openTweetModal(selectedNote);
            }
        });
    });
}

function renderEmptyState() {
    notesListEl.innerHTML = '';
    emptyStateEl.style.display = 'flex';
}

// Compose & open Tweet Draft modal
function openTweetModal(note) {
    activeNoteForTweet = note;
    
    // Set reference context inside modal
    modalRefDate.innerText = note.title;
    
    const typeLabel = note.type.charAt(0).toUpperCase() + note.type.slice(1);
    modalRefBadge.innerText = typeLabel;
    modalRefBadge.className = `ref-badge badge-${note.type}`;
    
    modalRefText.innerText = note.cleanText.trim();
    
    // Generate pre-filled Tweet draft
    let draftText = `Google Cloud BigQuery Update (${note.title}):\n\n`;
    
    // Take a smart snippet of clean release text
    let cleanBody = note.cleanText.trim()
        .replace(/\s+/g, ' ') // Collapse multiple spaces/newlines
        .substring(0, 150); // Get first 150 chars
    
    if (note.cleanText.trim().length > 150) {
        cleanBody += '...';
    }
    
    draftText += `${cleanBody}\n\n#BigQuery #GoogleCloud`;
    
    // Ensure draft stays under 280 length limit initially
    if (draftText.length > 280) {
        draftText = draftText.substring(0, 277) + '...';
    }

    tweetTextarea.value = draftText;
    updateCharCount();
    
    tweetModal.classList.add('open');
    tweetTextarea.focus();
}

function closeTweetModal() {
    tweetModal.classList.remove('open');
    activeNoteForTweet = null;
}

// Live character counter updates
function updateCharCount() {
    const len = tweetTextarea.value.length;
    charCountEl.innerText = len;
    
    charCountEl.className = 'char-counter';
    if (len >= 240 && len < 270) {
        charCountEl.classList.add('warning');
    } else if (len >= 270) {
        charCountEl.classList.add('danger');
    }

    submitTweetBtn.disabled = len > 280 || len === 0;
}

// Insert tags helper at cursor position
function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const oldText = textarea.value;
    
    textarea.value = oldText.substring(0, start) + text + oldText.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

// Open Twitter intent in new tab
function triggerTweet() {
    const text = tweetTextarea.value.trim();
    if (!text || text.length > 280) return;
    
    const encodedText = encodeURIComponent(text);
    
    // Append URL if available to original release docs
    let tweetUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    if (activeNoteForTweet && activeNoteForTweet.link) {
        tweetUrl += `&url=${encodeURIComponent(activeNoteForTweet.link)}`;
    }
    
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
    
    closeTweetModal();
    showToast('Redirected to Twitter to publish your post!', 'success');
}
